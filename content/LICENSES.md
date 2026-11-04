# Content licenses

The code of this project is MIT. Data in `content/` keeps its own license, and
share-alike data stays share-alike.

This file is written by `tools/content/build.py`, except where a section says otherwise.

## `en/words.json`

- **Source:** wordfreq 3.1.1, https://pypi.org/project/wordfreq/3.1.1/
- **License:** CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/.
  This file stays under that license. The required credits are in
  `licenses/wordfreq-attribution.md`.
- **Retrieved:** 2026-11-04
- **Processing:** the 20000 most frequent English words, keeping only a-z and only "a" and
  "i" among single letters, with the filter below applied. 19503 words remain.

## `en/passages.jsonl`

- **Source:** the works below, in the plain-text editions of the Project Gutenberg volunteers,
  through the mirror named in each row. The texts carry no mention of the distributor.
- **License:** public domain. All authors died more than 70 years ago, and all works were
  published before 1900.
- **Retrieved:** 2026-11-04
- **Processing:** the distributor's header and footer removed, headings and illustrations dropped,
  typography reduced to keyboard characters, the text cut into passages of 150-400
  characters at sentence boundaries, passages containing a filtered word removed, up to
  300 passages sampled per book, and difficulty scored. 2327 passages remain.

| Author | Title | Year | URL |
| --- | --- | --- | --- |
| Jane Austen | Pride and Prejudice | 1813 | https://aleph.pglaf.org/cache/epub/1342/pg1342.txt |
| Arthur Conan Doyle | The Adventures of Sherlock Holmes | 1892 | https://aleph.pglaf.org/cache/epub/1661/pg1661.txt |
| Lewis Carroll | Alice's Adventures in Wonderland | 1865 | https://aleph.pglaf.org/cache/epub/11/pg11.txt |
| Mary Shelley | Frankenstein | 1818 | https://aleph.pglaf.org/cache/epub/84/pg84.txt |
| Mark Twain | The Adventures of Tom Sawyer | 1876 | https://aleph.pglaf.org/cache/epub/74/pg74.txt |
| Herman Melville | Moby-Dick | 1851 | https://aleph.pglaf.org/cache/epub/2701/pg2701.txt |
| H. G. Wells | The War of the Worlds | 1898 | https://aleph.pglaf.org/cache/epub/36/pg36.txt |
| H. G. Wells | The Time Machine | 1895 | https://aleph.pglaf.org/cache/epub/35/pg35.txt |

## Word filter (not distributed)

- **Source:** List of Dirty, Naughty, Obscene, and Otherwise Bad Words, commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13`,
  https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/5faf2ba42d7b1c0977169ec3611df25a3c08eb13/en
- **License:** CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- **Retrieved:** 2026-11-04
- **Use:** only decides what is left out. The list itself is not part of `content/`.

## Fonts (bundled with the UI)

- **Golos Text**, the Golos Text Project Authors, SIL OFL 1.1, through `@fontsource/golos-text`.
  Full text: `licenses/OFL-golos-text.txt`.
- **JetBrains Mono**, the JetBrains Mono Project Authors, SIL OFL 1.1, through
  `@fontsource/jetbrains-mono`. Full text: `licenses/OFL-jetbrains-mono.txt`.
