# ADR-0005: Session metrics

- Status: accepted
- Date: 2026-11-04

## Context

SPEC names WPM, CPM, accuracy and rhythm evenness but gives no formulas. These numbers will feed
trends, records and the brain's explanations, so changing them later would make old and new sessions
incomparable. They also have to be computed the same way for a live session and for a replayed
journal.

## Options

1. **Compute in the UI at the end of a session.** Simple, but stage 2 would need a second copy in the
   projector, and the two would drift apart.
2. **Compute in the core from events, one at a time.** One implementation with fixed memory. The UI
   has to ask the core for the result.
3. **Compute in the core by re-reading the journal.** The purest source, but it reads files at the
   end of every session and has to find the lines of one session across dates.

Rhythm has several common forms too: the standard deviation in milliseconds depends on speed, so a
fast typist looks more even. The coefficient of variation does not.

## Decision

Option 2. `stats::SessionStats` takes events one at a time, and the writer thread feeds it only with
batches that reached the disk. A rough live WPM on the typing screen is computed separately in the UI
twice a second and is never stored.

| Metric     | Formula                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| Duration   | From the first to the last counted press, minus pauses between them                           |
| CPM        | Correct character presses per minute                                                          |
| WPM        | CPM / 5                                                                                       |
| Accuracy   | Correct / all character presses. Backspace is not counted, a corrected error stays in the sum |
| Evenness   | `100 × (1 − min(1, CV))`, where CV is standard deviation / mean of the intervals              |
| Zen        | Nothing is expected: CPM and WPM use all character presses, accuracy is absent                |

Rhythm intervals run between consecutive character presses. Gaps above 2 seconds, and any interval
touching a Backspace or a pause, are left out. At least two intervals are required. Presses marked
`ignored` and modifier presses count for nothing.

## Consequences

- Stage 2 reuses this code, so the summary screen and the dashboard cannot disagree.
- Duration starts at the first press, while every press counts as a character. N presses have only
  N − 1 intervals, so a very short session reads about 1/N too fast. Over 50 characters that is 2%,
  and it stays this simple on purpose. Changing it later only needs a rebuild of derived data.
- The 2-second limit is a judgement call. It is one constant, and because the journal keeps raw times
  it can change later with a rebuild.
- A session whose final batch cannot be written has no summary until the write succeeds, so the UI
  retries first and says so if it still fails.
