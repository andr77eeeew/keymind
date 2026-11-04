# 6. Content pipeline

## Context

The Words and Texts modes need a frequency word list and passages from books. CLAUDE.md requires
that `content/` comes only from openly licensed sources, is built by reproducible scripts, and that
raw downloads stay out of the repository. SPEC names wordfreq and public-domain books but leaves
open which books, which profanity filter, and how the files reach the app.

## Options

**Where the data lives at runtime.**

- Compiled into the binary: simplest to load, but the binary grows by about 2.3 MB and every data
  change is a recompile.
- Shipped as files through `bundle.resources`: read once on first use, and the licenses travel next
  to the data they cover. Needs handling of a missing or damaged file.

**How to obtain the books.**

- The main site of the distributor: its robot policy forbids automated downloads.
- A mirror, which the same policy points to for automated access, with a pause between requests.

**How to keep builds reproducible.**

- Trust the source and rebuild: the output can change without anyone deciding it.
- Pin a SHA-256 for every download and fail on a change.

**Profanity filter.** SPEC asks for one and names no source.

- LDNOOBW, CC BY 4.0, pinned by commit, downloaded at build time and not distributed.
- A list of our own: nobody wants to maintain it, and it would have to be committed.

## Decision

- Files shipped through `bundle.resources`, loaded lazily by `generator::content::ContentStore`.
  A missing file is a typed error shown in the UI, not a crash.
- `tools/content/build.py` writes `content/en/words.json`, `content/en/passages.jsonl`,
  `content/licenses/wordfreq-attribution.md` and `content/LICENSES.md`. All are committed, and the
  output contains no timestamps, so a rebuild from the pinned sources changes no bytes.
- Words: the top 20,000 of wordfreq 3.1.1, a-z only, single letters limited to `a` and `i`, with
  the filter applied. The result stays CC BY-SA 4.0, and the attribution text is copied verbatim
  from the package.
- Books: eight works whose authors died more than 70 years ago, all published before 1900, from the
  `aleph.pglaf.org` mirror with a 2 second pause. Every file is pinned by SHA-256.
- Passages: the distributor's header and footer are cut, and each book starts at its first sentence
  so that prefaces and contents pages are skipped. A passage is 150-400 characters of whole
  sentences and never starts or ends inside a quotation. Any passage containing a filtered word is
  dropped, not edited. Up to 300 per book are sampled by a hash of their text.
- Difficulty: the sum of five standardized features (average word length, share of words outside
  the top 5,000, punctuation density, digits, capitals), split into three equal groups. This is a
  simple starting point. It orders passages reasonably on inspection and has not been validated
  against real typing data.
- `content/LICENSES.md` records the source URLs, including the distributor's name, because
  CLAUDE.md requires provenance. The passages themselves never mention it, and the build fails if
  one does.

## Consequences

- A source that changes stops the build and names the file, so a new version is a deliberate step.
- Filtering by whole words leaves some mature themes in the books. It removes listed words, not
  ideas, and these are nineteenth-century novels.
- The filter is blunt: it also drops harmless passages that use a listed word in an old sense.
  About 1% of candidates are lost, which does not matter at this volume.
- Removing the opening quote of a multi-paragraph speech is a small edit to the text. It keeps
  quotes balanced, which matters more for typing than strict punctuation of the source.
- Alice gives fewer than 300 passages because the book is short, so the books are not equally
  represented.
