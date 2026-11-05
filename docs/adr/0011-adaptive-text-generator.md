# ADR-0011: Adaptive text generator

- Status: accepted
- Date: 2026-11-06

## Context

The heuristic (ADR-0010) gives a recipe: the open letters, the focus key, what is due for review and
how long the session is. The generator turns it into text. The text must use only open letters, work
when only 6 letters are open, and come back exactly from the journal, which keeps the seed and the
recipe but not the text, as in Words.

## Options

**Words when few letters are open.** Only real words made of the open letters; repeat letter drills
such as `eee ttt`; or pseudowords from a character chain trained on the dictionary. With the 6 start
letters the top 5000 words give only 42 real words, so real words alone repeat a lot, and drills do
not train transitions between letters the way words do.

**Chain order.** Order 1 gives noise, order 3 copies the dictionary back. Order 2 gives pronounceable
pseudowords.

**Storing the chain.** A file in `content/` needs a pipeline step and a LICENSES entry. Training it
from `words.json` when the content loads takes a few milliseconds.

## Decision

- **Real words** are the frequent words made only of open letters, from the top 5000 of `words.json`.
- **Pseudowords** fill the choice up to 100 words while there are fewer than 100 real ones. They come
  from an order-2 chain trained on the dictionary when the content loads, 3 to 8 letters long, at most
  4000 tries. The plan said 30, but with the 6 start letters there are already 42 real words, so the
  rule would never fire; 7 letters give 111. The chain is not stored, so `content/` and its licences
  do not change.
- **Shares of a session:** 60% of the words contain the focus key, 25% contain something due for
  review, the rest are any words of the choice. A share with no matching words goes to the general
  words. The slots are shuffled, and the same word never comes twice in a row. Inside a share the
  words are picked evenly: frequency matters only through the top-5000 cut.
- **Length:** about 3 minutes at the current speed, `round(3 · cpm / (average word length + 1))`,
  from 30 to 150 words.
- **Only lowercase letters and spaces.** Capitals and symbols come with stage 5.
- **Determinism.** The same seed, recipe and content give the same text. The steps draw from separate
  ChaCha8 streams (`seed | stream << 32`), so a change in how many pseudowords one step tries does not
  shift the word order. A guard test freezes the text of one seed.
- **Recipe version.** `recipe.v` is 1. Any change of these rules needs a new version, and the code for
  version 1 stays, so old journals still replay to their text.

## Consequences

- The summary and the checks can rebuild the text of any adaptive session from its journal line.
- A change of `words.json` changes old texts. This is the same as in Words, and nothing reads old texts
  back for statistics: the keystrokes carry the expected characters.
- Pseudowords are only in the earliest sessions. After about 7 letters the text is real words.
- Even picking inside a share means a beginner sees rarer words as often as common ones. A weighting
  by frequency can come with a new recipe version if sessions feel odd.
