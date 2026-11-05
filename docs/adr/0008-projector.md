# ADR-0008: Projector

- Status: accepted
- Date: 2026-11-05

## Context

Stage 2 needs statistics, and the journal alone cannot answer a question like "which key is slowest
this month" without reading every line. So derived tables go into SQLite. The rules are fixed by
ADR-0001: the journal is the only source of truth, the database can be deleted at any time, and the
typing screen must never feel any of this.

The hard part is not the tables. A crash, a torn line, a retried batch or a journal arriving late
from another computer must all end in exactly the numbers a clean rebuild would give.

## Options

**SQLite access.** `rusqlite` with its `bundled` feature compiles SQLite into the binary, so nothing
depends on the system. `sqlx` brings an async runtime and compile-time checks that a single writer
thread has no use for.

**Where events come from.** The projector could take events from memory as they are written, or it
could read the files. Memory gives live numbers during a session, but needs a second path for a
rebuild and a third for synced journals. Reading files gives one path for all of them, and numbers
that update after a session rather than during it.

**Schema changes.** Migrations keep the file, but every change then needs code that runs once and is
hard to test. The journal already holds everything, so a file of another version can be deleted and
rebuilt. The cost is a Loading state after an update that changes the schema.

**`daily_stats` and `last_setups`.** Stored tables would be slightly faster to read, but a second copy
of the same numbers can drift from the first. Views cannot.

**Number type for time sums.** `f64` is the obvious choice, but a floating-point sum depends on the
order of the additions, so a catch-up in two steps would differ from a rebuild in the last bits.
Integer microseconds add up exactly, whatever the order, which also makes two devices safe.

## Decision

```text
journal/<device>/*.jsonl -> projector thread -> derived.sqlite -> read commands -> UI
```

`rusqlite` with `bundled`. A separate thread reads the files and writes the database. It runs at app
start, after a batch containing `session_ended`, and on request. Requests made while it is busy merge
into one, and nothing waits for it.

- **Chunks.** About 1 MiB of lines, which is about 6000 keystrokes. Each chunk is one `IMMEDIATE`
  transaction holding its rows and its new file offset, so a crash loses nothing and counts nothing
  twice. The offset is read inside the transaction, so a second running copy of the app cannot apply
  a line twice either.
- **Complete lines only.** A chunk ends at the last line feed. A line still being written waits for
  the next run, and one cut by a crash is closed by the journal writer and then counted as bad.
- **Unfinished sessions.** `session_state` holds `last_seq` and, as JSON, the `SessionStats` and the
  previous press. A catch-up can stop after any line. This needs `serde_json` with `float_roundtrip`,
  otherwise a saved mean can change in its last bit. A finished session keeps only `last_seq`.
- **Duplicates.** An event with `seq <= last_seq` is skipped, the same rule as in `SessionStats`.
- **Lost starts.** Events of a session with no usable `session_started`, and events after its end, are
  dropped and counted as orphans. The counts of bad, unknown, duplicate and orphan lines live in
  `projected_files`, so damage is reported instead of hidden.
- **Metrics.** `sessions` takes its numbers from `SessionStats`, the code behind the summary screen,
  so the two cannot disagree.
- **Concurrency.** WAL, with short read-only connections, so reads do not wait for a rebuild. An
  `RwLock` keeps readers out only while the file is replaced, because Windows cannot delete an open
  file. Writes use `synchronous = NORMAL`: a power cut can lose the last commits, and their offsets
  with them, so those lines are simply read again.
- **Failure.** A damaged file, another schema version, an unreadable saved state, or a journal file
  that shrank or vanished all lead to deleting the database and rebuilding. Anything else, such as a
  full disk, sets a `failed` status, the next request tries again, and typing is unaffected.
- **Status.** `working` means correct tables are being extended, so a screen can keep showing them.
  `rebuilding` means they start from nothing, so a screen shows Loading. Both, and `idle` and
  `failed`, reach the UI as `stats-status` events and through the `stats_status` command.

### Tables

| Table                | Holds                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `projected_files`    | Device, file, bytes done, and line counts                                                 |
| `session_state`      | `last_seq`, and the state of unfinished sessions                                          |
| `sessions`           | One row per session, with metrics. `reason` is empty if the app died before the end       |
| `key_stats`          | Per date, layout and `event.code`: presses, samples, sum and sum of squares of µs, errors |
| `bigram_stats`       | Per date, layout and two characters: the same counters                                    |
| `daily_stats` (view) | `sessions` summed per date                                                                |
| `last_setups` (view) | The latest session of each mode, with its device (ADR-0007)                               |

`derived.sqlite` sits in the data folder, beside `journal/` and never inside it, so it cannot reach a
sync target. `trigram_stats`, `model_state` and `progress` arrive with the stages that need them.

### Definitions

- **Press time.** The interval from the previous character press, rounded to a microsecond. Not
  counted: the first press, a wrong press, a press right after an error, a pause or a Backspace, and a
  gap over 2 seconds, the limit from ADR-0005. Modifiers and presses marked `ignored` change nothing.
- **Key error.** Counted on the key that should have been pressed, because a miss shows weakness on
  that key and not on the one hit by accident. So `key_stats.presses` means attempts at that key, and
  errors divided by presses is its error rate. This needs a character-to-key table for each layout,
  in `projector/layout.rs`. A wrong press whose expected character has no key is left out.
- **Transition X→Y.** The expected characters at adjacent positions, with X typed correctly. A press
  right after a pause or a Backspace has no transition. Time counts as for a press, and a wrong Y is an
  error of the transition. Characters keep their case, so `Th` and `th` stay apart. Queries can fold
  them.
- **Date.** The local date of the session start, as written in `ts`. A session across midnight belongs
  to the day it started on. Sessions are ordered by instant, which handles time zones.
- **Trends.** Exact sums per day, never a mean of means. WPM is correct characters over time, accuracy
  is correct over judged, rhythm is weighted by characters.
- **Zen.** Key and transition times count. WPM, accuracy, rhythm and records leave it out, because
  nothing was expected there and that speed means something else.
- **Mean, not median.** Counters add up, and a median would need histograms. The 2 second limit takes
  away the worst outliers, so what remains is a known and small distortion.
- **Stability.** The sum of squares is stored now for stage 3 and is not shown yet.

Records and thresholds for too little data belong to the statistics screen and are defined in ADR-0009.

## Consequences

- Statistics update after a session and not during it. Nothing on the typing path touches the database.
- Everything is verified by one invariant: a catch-up cut after any line, or in the middle of any line,
  gives byte-for-byte the tables of a single pass. The golden journals in `src-tauri/tests/golden/` run
  through it, at several chunk sizes and with a journal arriving late from another device.
- Any change to a table, or to what a number means, must raise `SCHEMA_VERSION`. A saved session state
  is part of the schema for the same reason.
- A torn tail keeps a file permanently "not finished" until the writer closes it, so a request after a
  crash makes one short empty pass. That costs nothing.
- If a clock moves back across midnight UTC during a session, its later events land in an earlier file.
  A catch-up sees them in writing order, but a rebuild reads the files in date order and drops them as
  old. The numbers of that one session can then differ, and only by the events involved.
- The binary grows by 1.9 MB, from 5.2 MB to 7.1 MB. Compiling SQLite and `rusqlite` adds about 26 s of
  build time to a clean release build, and SQLite is not recompiled after that.

## Measurements

On the development machine, release build, with `scripts/synth-journal.mjs` and
`scripts/rebuild-bench.mjs`: one million keystrokes in 3334 sessions, 145 MB of journal.

| Measure                      | Result |
| ---------------------------- | ------ |
| Rebuild on request           | 3.7 s  |
| Database size                | 4.1 MB |
| Overview, all time, 334 days | 125 ms |
| Overview, 182 days           | 60 ms  |
| Last setups                  | 14 ms  |

`scripts/latency-bench.mjs` with that journal keeps the projector rebuilding during the whole run: a
rebuild was running at 1045 of 1182 checks, on a 144 Hz display, times in milliseconds. This is a worst
case, because normally nothing runs on the projector thread while the user types.

| Text, characters | Queue p50 / p99 / max | Handler p50 / p99 / max | To next frame p50 / p95 / max | To paint: over 16 ms, p95, max | Long tasks |
| ---------------- | --------------------- | ----------------------- | ----------------------------- | ------------------------------ | ---------- |
| 1,000            | 0.3 / 0.9 / 8.9       | 0.1 / 0.3 / 8.7         | 0.7 / 6.2 / 9.3               | 23%, 16, 24                    | 0          |
| 100,000          | 0.3 / 1.0 / 7.0       | 0.1 / 0.2 / 0.8         | 0.7 / 6.3 / 9.0               | 33%, 16, 32                    | 0          |
| 1,000,000        | 0.3 / 1.0 / 7.8       | 0.1 / 0.2 / 0.4         | 0.7 / 6.3 / 9.4               | 31%, 16, 24                    | 0          |

Every target from ADR-0004 holds: queue p99 under 4 ms, handler p99 under 2 ms, no long tasks, no growth
with length. Against the idle figures there, the queue maximum rises from 3 ms to about 9 ms and the
share of presses over 16 ms to paint from about 20% to about 30%. So heavy background work is
measurable, but stays well inside the budget of a frame. All 15,004 presses reached the journal.
