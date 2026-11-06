# ADR-0010: Student model and heuristic

- Status: accepted
- Date: 2026-11-06

## Context

Stage 3 adds the brain: it estimates what the student can do, picks what to train and explains why.
SPEC asks for a Bayesian student model with forgetting and spaced repetition (v1), and a cold-start
heuristic that opens letters by frequency and puts the weakest key in focus. The ML decision model of
stage 8 will sit next to the heuristic, which always stays as the fallback (architecture rule 8).

Constraints:

- the input path stays free of brain work (rule 5): the choice and the text are ready before the first
  press;
- `model_state` lives in SQLite, so it must be rebuildable from the journal and give the same bytes on
  every rebuild (ADR-0008);
- the numbers come from the same samples as the statistics: `key_stats` and `bigram_stats` per day.

## Options

**Model.** A running exponential average per n-gram is simple, but it cannot say how sure it is, and a
transition with two samples looks as certain as one with two hundred. A Bayesian estimate with a prior
gives both a value and its uncertainty, at the cost of a few more numbers per n-gram. Boosted trees are
stage 8.

**Forgetting.** Decay by calendar time, or by the number of sessions since the last practice. Calendar
time matches how people forget and needs no session counter, and the daily tables already have dates.

**Spaced repetition.** A full SM-2 style scheduler keeps an ease factor and a due date. A simpler form
lets confidence fall with time, with a per-n-gram stability that grows when the n-gram holds up.

**Where the model lives.** Recompute it on demand when a session starts, or keep it in `model_state`
and recompute it after the projector. On demand reads every daily row at every start. A table read
is fast and lets the Brain screen show the same numbers.

**Letter unlocking.** Open the next letter on a fixed schedule, or when all open letters meet a bar.

## Decision

**The bar** for "this key is learned": at most 343 ms on average (35 WPM, five characters a word), at
most 5% errors, at least 5 samples. Five samples is the same limit as "too few samples" on the
Statistics screen.

**Student model.** Per letter and per letter pair (only `a` to `z` for now, as Adaptive types nothing
else), `model_state` keeps a trace:

- decayed sums of samples, time, squared time, presses and errors;
- the date of the last practice day;
- the stability H in days;
- whether it has ever met the bar, and the total number of samples.

The trace is a fold over the daily rows in date order. Before a day is added, the sums are multiplied
by `2^(-Δdays / H)`.

**Stability.** H starts at 2 days. A practice day (at least 5 samples) that is not the first one
doubles H, at most 64 days, when the day meets the bar, and halves it, at least 1 day, when it does
not. A day that meets the bar also marks the trace mastered.

**Estimate on a given day.** The sums are decayed from the last practice day to that day, then:

- time: a normal mean with a prior worth 5 samples, `mean = (5·μ0 + S) / (5 + n)`, prior spread
  `0.5·μ0`, and the upper 80% bound;
- errors: a Beta posterior with a prior worth 20 presses, and its upper 80% bound;
- confidence: `n / (n + 5)`, where n is the decayed number of samples;
- due for review: mastered, and confidence below 0.5;
- weakness: `max(time_upper / 343 ms, errors_upper / 5%)`.

**Priors.** A key's prior is the pooled estimate of the open keys, or 600 ms and 5% when nothing is
known yet. A pair X→Y starts from the estimate of key Y. So the first samples do not throw the
estimate to an extreme, and a rare pair gets a reasonable value.

**Unlocking.** The letter order comes from the frequencies in `words.json`:
`e t a o i n s r h l d c u m f g y w p b v k j x q z`.

- The first 6 letters are open from the start.
- Every letter of every earlier adaptive recipe stays open, so the set only grows and forgetting
  never closes a letter.
- A closed letter that already meets the bar opens at once. This is the rule of the starting test, and
  it also works after practice in Words.
- When every open letter meets the bar, the next letter by frequency opens.
- The policy "Letters: all at once" opens every letter.

**Focus** is the weakest open key; on a tie the more frequent letter wins. A new letter has wide bounds,
so it comes into focus by itself and needs no rule of its own. The reason shown is "new" (under 5
samples), "slow" or "errors", whichever part of the weakness is larger.

**Targets** are the focus key and up to 3 of the slowest pairs into it that have data. Their estimates
at the start go into the recipe as `before`, so the summary can show the change without the model.

**Review** is up to 3 due keys or pairs among the open letters, except the focus key and pairs into it,
least confident first, with the name as the tie-break.

**Speed for the length** is the pooled prior of the open keys, in characters a minute.

**Where it runs.** `model_state` is computed again from the daily tables in its own transaction after
every catch-up that projected something. It does not depend on the time of the rebuild, because the
decay to "today" happens when it is read. A rebuild stays byte-equal to a catch-up. The bar is part
of the fold, so a change of the bar raises the projector's `SCHEMA_VERSION`.

The UI passes today's local date to the commands, because the core has no local time zone.

## Consequences

- Precision is in days, not hours, because the daily tables are per day. Spacing intervals start at a
  day, so this costs little.
- Recomputing the whole table is linear in the daily rows. It stays far below the cost of projecting
  the keystrokes themselves.
- Faded n-grams fall back to the prior with wide bounds. A key unpractised for weeks can therefore
  take the focus again, which is the intended review.
- The rules are plain functions in `brain/`, without Tauri, and are unit-tested.
- Stage 8 adds the boosted student model and the bandit next to this code, not instead of it.
