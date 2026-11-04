"""Builds content/ from openly licensed sources. Run from the repository root:

    python -m venv tools/content/.venv
    tools/content/.venv/Scripts/python -m pip install -r tools/content/requirements.txt
    tools/content/.venv/Scripts/python -I tools/content/build.py

The output is deterministic: the same pinned sources always give the same bytes. Downloads go to
tools/content/.cache/, one folder per source, and are never committed. They are treated as data:
every file is checked against a pinned SHA-256 before use, and -I keeps Python from importing
anything found next to the script or in the current directory.
"""

import hashlib
import json
import math
import re
import statistics
import sys
import time
import unicodedata
import urllib.request
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tools" / "content" / ".cache"
CONTENT = ROOT / "content"

USER_AGENT = "keymind-content-pipeline"
# The robot policy of the source asks for a pause of about this long between requests.
REQUEST_PAUSE_SECONDS = 2.0

# When the pinned files below were downloaded. Fixed here, so a rebuild changes no bytes.
RETRIEVED = "2026-11-04"

WORD_COUNT = 20_000
SINGLE_LETTER_WORDS = {"a", "i"}
# Words outside this many most frequent ones count as rare in the difficulty score.
COMMON_WORD_LIMIT = 5_000

MIN_PASSAGE = 150
MAX_PASSAGE = 400
PASSAGES_PER_BOOK = 300

FILTER_COMMIT = "5faf2ba42d7b1c0977169ec3611df25a3c08eb13"
FILTER_URL = (
    "https://raw.githubusercontent.com/LDNOOBW/"
    f"List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/{FILTER_COMMIT}/en"
)
FILTER_SHA256 = "af851ecef1d5f212caba17339b12ac39cc2fef7d78c74876f67237644fcee8bd"

BOOK_MIRROR = "https://aleph.pglaf.org/cache/epub"


@dataclass(frozen=True)
class Book:
    number: int
    slug: str
    author: str
    title: str
    year: int
    sha256: str
    # The body of the book starts at the first match. This skips prefaces and contents pages.
    start: str = ""


BOOKS = [
    Book(
        1342,
        "pride",
        "Jane Austen",
        "Pride and Prejudice",
        1813,
        "3f6bb9d6f78e0293b56acd4714dd68cb7d6d1d293402031ce9d5a216bcaf9d75",
        r"^It is a truth universally",
    ),
    Book(
        1661,
        "sherlock",
        "Arthur Conan Doyle",
        "The Adventures of Sherlock Holmes",
        1892,
        "922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0",
        r"^To Sherlock Holmes she is always",
    ),
    Book(
        11,
        "alice",
        "Lewis Carroll",
        "Alice's Adventures in Wonderland",
        1865,
        "01b38ea4c710a84bc18d0bd41271a5a1a92b94e97b2812f4dece97d4a694725e",
        r"^Alice was beginning to get very tired",
    ),
    Book(
        84,
        "frankenstein",
        "Mary Shelley",
        "Frankenstein",
        1818,
        "2b97b7f8aad508649481d8dd4f6b54f9b965ddb3ba634e9151c815f537b49e42",
        r"^You will rejoice to hear",
    ),
    Book(
        74,
        "sawyer",
        "Mark Twain",
        "The Adventures of Tom Sawyer",
        1876,
        "74d77384b123a6360db9ab58463cff8b38df8525fbdc6000c81ee388e1f3cf10",
        r"^“Tom!”",
    ),
    Book(
        2701,
        "moby",
        "Herman Melville",
        "Moby-Dick",
        1851,
        "b5e88b71a1cda068e9ab1d94344c9d932338ba6da1a66def97a1aecd9cfcc87d",
        r"^Call me Ishmael",
    ),
    Book(
        36,
        "worlds",
        "H. G. Wells",
        "The War of the Worlds",
        1898,
        "8417469e3ab664749f7b36ebb85799075818207b0380b54c27d07d592a44117d",
        r"^No one would have believed",
    ),
    Book(
        35,
        "machine",
        "H. G. Wells",
        "The Time Machine",
        1895,
        "2892e919000e17c83e1dac51b30f4675db50536b644d7579fe8a89bb399a9bdc",
        r"^The Time Traveller \(for so",
    ),
]


# --- Text cleaning. The same rules as src-tauri/src/imports/normalize.rs. ---------------------

TYPOGRAPHIC = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "‚": "'",
        "‛": "'",
        "′": "'",
        "“": '"',
        "”": '"',
        "„": '"',
        "‟": '"',
        "″": '"',
        "«": '"',
        "»": '"',
        "‐": "-",
        "‑": "-",
        "‒": "-",
        "–": "-",
        "—": "-",
        "―": "-",
        "−": "-",
        "…": "...",
        "Æ": "AE",
        "æ": "ae",
        "Œ": "OE",
        "œ": "oe",
        "ß": "ss",
    }
)


def normalize(raw: str) -> tuple[str, int]:
    """Returns the printable ASCII form of a text and how many visible characters were lost."""
    decomposed = unicodedata.normalize("NFKD", raw.translate(TYPOGRAPHIC))
    kept = []
    removed = 0
    for c in decomposed:
        if c.isspace():
            kept.append(" ")
        elif " " < c <= "~":
            kept.append(c)
        elif not unicodedata.category(c).startswith(("M", "C")):
            removed += 1
    return " ".join("".join(kept).split()), removed


def body_of_ebook(raw: str, start: str = "") -> str:
    """Cuts the distributor's header and footer, keeping only the work itself."""
    text = raw.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    begin = re.search(r"^\*\*\* ?START OF .*\*\*\*[ \t]*$", text, re.M)
    end = re.search(r"^\*\*\* ?END OF .*\*\*\*[ \t]*$", text, re.M)
    if not begin or not end:
        raise ValueError("the header or footer marker of the ebook was not found")
    text = text[begin.end() : end.start()]
    if start:
        found = re.search(start, text, re.M)
        if not found:
            raise ValueError(f"the start of the book was not found: {start}")
        text = text[found.start() :]
    return text


HEADING = re.compile(
    r"^(chapter|letter|book|part|stave|volume|contents|preface|introduction|epilogue|etymology)\b",
    re.I,
)
# Characters that mean markup, a table or a footnote survived. Such a paragraph is not prose.
NOT_PROSE = re.compile(r"[\[\]*|#<>{}=+~^`\\]")
PROSE_END = re.compile(r"""[.!?]["')]*$""")


def paragraphs(body: str) -> list[str | None]:
    """Clean paragraphs in order. `None` marks anything else: no passage may cross such a break."""
    body = re.sub(r"\[Illustration[^\]]*\]", " ", body, flags=re.S)
    out: list[str | None] = []
    for block in re.split(r"\n[ \t]*\n", body):
        # Underscores mark italics in plain-text ebooks.
        text, removed = normalize(block.replace("_", ""))
        # Plain-text ebooks write a long dash as two hyphens.
        text = re.sub(r"\s*-{2,}\s*", "-", text)
        if not text:
            continue
        # A speech over several paragraphs opens each of them with a quote and closes only the
        # last one. Dropping that opening quote leaves each paragraph balanced on its own.
        if text.startswith('"') and text.count('"') % 2 == 1:
            text = text[1:].lstrip()
        is_prose = (
            removed == 0
            and not NOT_PROSE.search(text)
            and not HEADING.match(text)
            and PROSE_END.search(text)
            and any(c.islower() for c in text)
        )
        out.append(text if is_prose else None)
    return out


ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "st", "rev", "col", "capt", "gen", "prof", "sr", "jr", "mt", "no",
    "vs", "etc", "esq", "messrs", "lieut", "sgt", "hon", "gov",
}  # fmt: skip
SENTENCE_END = re.compile(r"""[.!?]+["')]*\s+(?=["'(]?[A-Z])""")


def sentences(paragraph: str) -> list[str]:
    parts = []
    begin = 0
    for match in SENTENCE_END.finditer(paragraph):
        last_word = re.search(r"(\w+)[.!?]*[\"')]*\s+$", paragraph[begin : match.end()])
        if last_word:
            word = last_word.group(1)
            if word.lower() in ABBREVIATIONS or (len(word) == 1 and word.isupper()):
                continue
        parts.append(paragraph[begin : match.end()].strip())
        begin = match.end()
    parts.append(paragraph[begin:].strip())
    return [p for p in parts if p]


def stable_int(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")


def cut_passages(items: list[str | None]) -> list[str]:
    """Groups whole sentences into passages. A passage never starts or ends inside a quotation."""
    passages = []
    current: list[str] = []
    length = 0
    target = 0

    def flush_on_break() -> None:
        nonlocal current, length
        if length >= MIN_PASSAGE:
            passages.append(" ".join(current))
        current = []
        length = 0

    for item in items:
        if item is None:
            flush_on_break()
            continue
        in_quote = False
        for sentence in sentences(item):
            quoted_before = in_quote
            if sentence.count('"') % 2 == 1:
                in_quote = not in_quote
            if not current:
                if quoted_before or not (sentence[0].isupper() or sentence[0] == '"'):
                    continue
                # A length that depends on the text gives a spread between the limits.
                target = MIN_PASSAGE + stable_int(sentence) % (MAX_PASSAGE - MIN_PASSAGE)
            if length + len(sentence) + 1 > MAX_PASSAGE:
                current = []
                length = 0
                continue
            current.append(sentence)
            length += len(sentence) + 1
            if length >= target and not in_quote:
                passages.append(" ".join(current))
                current = []
                length = 0
        # A quotation left open at the end of a paragraph cannot be closed cleanly.
        if in_quote:
            current = []
            length = 0
    flush_on_break()
    return [p for p in passages if MIN_PASSAGE <= len(p) <= MAX_PASSAGE]


class WordFilter:
    def __init__(self, entries: list[str]):
        cleaned = [e.strip().lower() for e in entries if e.strip()]
        self.words = {e for e in cleaned if re.fullmatch(r"[a-z]+", e)}
        phrases = [re.escape(e) for e in cleaned if e not in self.words]
        self.phrases = re.compile(r"\b(?:" + "|".join(phrases) + r")\b") if phrases else None

    def blocks_word(self, word: str) -> bool:
        return word in self.words

    def blocks_text(self, text: str) -> bool:
        lowered = text.lower()
        if any(word in self.words for word in re.findall(r"[a-z]+", lowered)):
            return True
        return bool(self.phrases and self.phrases.search(lowered))


# --- Features -----------------------------------------------------------------------------


def features(text: str, common: set[str]) -> dict[str, float]:
    words = re.findall(r"[A-Za-z]+(?:'[a-z]+)?", text)
    bare = [w.lower().split("'")[0] for w in words]
    letters = sum(c.isalpha() for c in text)
    size = len(text)
    return {
        "avg_word_length": round(sum(map(len, bare)) / max(len(bare), 1), 3),
        "rare_share": round(sum(w not in common for w in bare) / max(len(bare), 1), 4),
        "punctuation_density": round(
            sum(not c.isalnum() and c != " " for c in text) / size, 4
        ),
        "digit_share": round(sum(c.isdigit() for c in text) / size, 4),
        "capital_share": round(sum(c.isupper() for c in text) / max(letters, 1), 4),
    }


def ngram_counts(text: str) -> dict[str, int]:
    lowered = text.lower()
    grams = {
        n: {lowered[i : i + n] for i in range(len(lowered) - n + 1)} for n in (2, 3)
    }
    return {"bi": len(grams[2]), "tri": len(grams[3])}


def assign_difficulty(items: list[dict]) -> None:
    """Splits passages into three equal groups by the sum of their standardized features."""
    keys = list(items[0]["features"])
    scales = {}
    for key in keys:
        values = [item["features"][key] for item in items]
        scales[key] = (statistics.fmean(values), statistics.pstdev(values) or 1.0)
    scored = sorted(
        items,
        key=lambda item: (
            sum(
                (item["features"][key] - scales[key][0]) / scales[key][1]
                for key in keys
            ),
            item["id"],
        ),
    )
    for rank, item in enumerate(scored):
        item["difficulty"] = min(3, math.floor(3 * rank / len(scored)) + 1)


# --- Sources ------------------------------------------------------------------------------


def fetch(url: str, folder: str, name: str, expected: str) -> bytes:
    path = CACHE / folder / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}")
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
        time.sleep(REQUEST_PAUSE_SECONDS)
    data = path.read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    if not expected:
        print(f"UNPINNED {folder}/{name} sha256={actual}")
    elif actual != expected:
        raise ValueError(f"{url} changed: expected {expected}, got {actual}")
    return data


def build_words(word_filter: WordFilter) -> list[dict]:
    # Imported here so the text functions above can be tested without the dependency.
    import wordfreq

    entries = []
    dropped = 0
    for word in wordfreq.top_n_list("en", WORD_COUNT, wordlist="best", ascii_only=True):
        if not re.fullmatch(r"[a-z]+", word):
            continue
        if len(word) == 1 and word not in SINGLE_LETTER_WORDS:
            continue
        if word_filter.blocks_word(word):
            dropped += 1
            continue
        entries.append(
            {
                "word": word,
                "freq": float(f"{wordfreq.word_frequency(word, 'en', 'best'):.4g}"),
                "rank": len(entries) + 1,
            }
        )
    print(f"words: {len(entries)} kept, {dropped} removed by the filter")
    return entries


def build_passages(word_filter: WordFilter, common: set[str]) -> list[dict]:
    items = []
    for book in BOOKS:
        url = f"{BOOK_MIRROR}/{book.number}/pg{book.number}.txt"
        raw = fetch(url, f"book-{book.number}", "book.txt", book.sha256)
        body = body_of_ebook(raw.decode("utf-8"), book.start)
        candidates = cut_passages(paragraphs(body))
        kept = [p for p in candidates if not word_filter.blocks_text(p)]
        # An even sample over the whole book, the same on every run.
        chosen = sorted(
            sorted(range(len(kept)), key=lambda i: stable_int(kept[i]))[:PASSAGES_PER_BOOK]
        )
        print(
            f"{book.slug}: {len(candidates)} candidates, "
            f"{len(candidates) - len(kept)} filtered, {len(chosen)} kept"
        )
        for index in chosen:
            text = kept[index]
            items.append(
                {
                    "id": f"{book.slug}-{stable_int(text) % 16**8:08x}",
                    "text": text,
                    "source": f"{book.author}, {book.title} ({book.year})",
                    "license": "public-domain",
                    "difficulty": 0,
                    "features": features(text, common),
                    "ngrams": ngram_counts(text),
                }
            )
    if len({item["id"] for item in items}) != len(items):
        raise ValueError("two passages got the same id")
    assign_difficulty(items)
    return items


def check_no_distributor_mentions(items: list[dict]) -> None:
    for item in items:
        if "gutenberg" in item["text"].lower():
            raise ValueError(f"passage {item['id']} mentions the distributor")


def write_wordfreq_attribution() -> None:
    """Copies the attribution text of wordfreq word for word. Its data license requires credit."""
    text = metadata.metadata("wordfreq").get_payload() or ""
    start = text.find("## License")
    end = text.find("## Citing wordfreq")
    citations = text.find("## Citations to work that wordfreq is built on")
    if start < 0 or end < 0 or citations < 0:
        raise ValueError("the license section of wordfreq was not found")
    target = CONTENT / "licenses" / "wordfreq-attribution.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "# wordfreq attribution\n\nCopied from the wordfreq 3.1.1 package description.\n\n"
        + text[start:end].strip()
        + "\n\n"
        + text[citations:].strip()
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_licenses(words: int, passages: int) -> None:
    books = "\n".join(
        f"| {b.author} | {b.title} | {b.year} | {BOOK_MIRROR}/{b.number}/pg{b.number}.txt |"
        for b in BOOKS
    )
    text = f"""# Content licenses

The code of this project is MIT. Data in `content/` keeps its own license, and
share-alike data stays share-alike.

This file is written by `tools/content/build.py`, except where a section says otherwise.

## `en/words.json`

- **Source:** wordfreq {metadata.version("wordfreq")}, https://pypi.org/project/wordfreq/3.1.1/
- **License:** CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/.
  This file stays under that license. The required credits are in
  `licenses/wordfreq-attribution.md`.
- **Retrieved:** {RETRIEVED}
- **Processing:** the {WORD_COUNT} most frequent English words, keeping only a-z and only "a" and
  "i" among single letters, with the filter below applied. {words} words remain.

## `en/passages.jsonl`

- **Source:** the works below, in the plain-text editions of the Project Gutenberg volunteers,
  through the mirror named in each row. The texts carry no mention of the distributor.
- **License:** public domain. All authors died more than 70 years ago, and all works were
  published before 1900.
- **Retrieved:** {RETRIEVED}
- **Processing:** the distributor's header and footer removed, headings and illustrations dropped,
  typography reduced to keyboard characters, the text cut into passages of {MIN_PASSAGE}-{MAX_PASSAGE}
  characters at sentence boundaries, passages containing a filtered word removed, up to
  {PASSAGES_PER_BOOK} passages sampled per book, and difficulty scored. {passages} passages remain.

| Author | Title | Year | URL |
| --- | --- | --- | --- |
{books}

## Word filter (not distributed)

- **Source:** List of Dirty, Naughty, Obscene, and Otherwise Bad Words, commit `{FILTER_COMMIT}`,
  {FILTER_URL}
- **License:** CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- **Retrieved:** {RETRIEVED}
- **Use:** only decides what is left out. The list itself is not part of `content/`.

## Fonts (bundled with the UI)

- **Golos Text**, the Golos Text Project Authors, SIL OFL 1.1, through `@fontsource/golos-text`.
  Full text: `licenses/OFL-golos-text.txt`.
- **JetBrains Mono**, the JetBrains Mono Project Authors, SIL OFL 1.1, through
  `@fontsource/jetbrains-mono`. Full text: `licenses/OFL-jetbrains-mono.txt`.
"""
    (CONTENT / "LICENSES.md").write_text(text, encoding="utf-8", newline="\n")


def main() -> int:
    raw_filter = fetch(FILTER_URL, "word-filter", "en.txt", FILTER_SHA256)
    word_filter = WordFilter(raw_filter.decode("utf-8").splitlines())

    words = build_words(word_filter)
    common = {entry["word"] for entry in words[:COMMON_WORD_LIMIT]}
    passages = build_passages(word_filter, common)
    check_no_distributor_mentions(passages)

    out = CONTENT / "en"
    out.mkdir(parents=True, exist_ok=True)
    (out / "words.json").write_text(
        "[\n"
        + ",\n".join(json.dumps(entry, separators=(",", ":")) for entry in words)
        + "\n]\n",
        encoding="utf-8",
        newline="\n",
    )
    (out / "passages.jsonl").write_text(
        "".join(json.dumps(item, separators=(",", ":")) + "\n" for item in passages),
        encoding="utf-8",
        newline="\n",
    )
    write_wordfreq_attribution()
    write_licenses(len(words), len(passages))
    print(f"done: {len(words)} words, {len(passages)} passages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
