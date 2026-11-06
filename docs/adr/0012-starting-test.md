# ADR-0012: Starting test

- Status: accepted
- Date: 2026-11-06

## Context

Stage 3 ends with the starting test from SPEC: one minute of easy passages on the first launch. It
draws the first relief map and lets the brain open every letter that is already within the bar
(ADR-0010). It can be skipped, because the brain has a cold-start heuristic. The result screen shows
the map of the test alone, not of everything typed so far, and its WPM, accuracy and rhythm.

## Options

**The text.** One random easy passage is about 300 characters, which a fast typist finishes in half a
minute. Several random passages may still miss letters such as `q`, `z` or `j`, and a letter that is
never typed cannot be measured or opened.

**The map of one session.** The projector keeps keys by day, not by session.

- Replay the session from the journal in the UI. This repeats the definitions of ADR-0008 in a
  second language, and they would drift apart.
- Replay it in Rust from the journal on demand. This needs a search of the journal files for one
  session and a second copy of the counting code outside the projector.
- Let the projector count the keys of a test session on their own, in the same function that
  counts `key_stats`, as it already does for the targets of an adaptive session.

**Skipping.** A test that was typed leaves a session in the journal, so it is not offered again. A
skipped test leaves nothing, so without a mark the first launch would offer it on every start.

## Decision

- **Text:** easy passages (difficulty 1). The first is drawn from the seed. Each next one is the
  passage that adds the most letters the text does not have yet, searched from a random place so
  that ties differ between seeds, until the text has 1,000 characters (more than 150 WPM for a
  minute). The journal keeps the passage ids, as `source: {kind: "test", passages, seconds: 60}`.
- **Map:** a `session_keys` table with the keys of each test session, counted by `push_key` in the
  projector together with `key_stats`. The result screen waits until the projector has reached the
  end of the test, as the adaptive summary waits for its targets. The map uses the relief of
  Statistics at full height, because the test is all it shows and the title already says it is a
  start. Below 5 samples on every key there is no map, only what to do next.
- **Steps:** the theme and the test are the first-launch steps, with a step list over them. Each has
  its own flag in the settings: `theme_chosen` and a new `test_done`, set when a test ends in any
  way. A journal with sessions shows no steps. If the window is closed after the theme, the next
  launch opens the test.
- **Skip** goes to Home. What was typed before it stays in the journal, like any ended session.
- **Elsewhere:** Home offers the test while there are no sessions, and the Brain screen always does.
  The test is not a remembered setup, so it never appears among the modes on Home.

## Consequences

- The schema version is 4, so existing databases are rebuilt from the journals on the next start.
- `session_keys` grows by about 30 rows per test, which is nothing next to `key_stats`.
- The test counts in `key_stats` and in the brain like any session, so the letters it shows within
  the bar open at once in the adaptive mode.
- A saved test opens from Recent sessions as a plain saved summary. Opening its map there instead
  is possible from the same table, if that is wanted later.
