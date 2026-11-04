# ADR-0003: Journal format and write path

- Status: accepted
- Date: 2026-11-04

## Context

ADR-0001 makes the journal the source of truth, and SPEC lists its events and key fields. It leaves
open how a line looks, how retries and crashes behave, where files live and which time zone names
them. Later stages depend on data that cannot be recovered afterwards, so these fields have to exist
from the first keystroke.

## Options

**Writing**

1. **Dedicated writer thread, append-mode file, sync after each batch.** Disk work never touches the
   input path, batches stay in order, and a crash loses about one second of typing. Costs one thread
   and one sync per batch.
2. **Write on the Tauri command thread pool.** No extra thread, but ordering depends on callers, and
   every future background writer would need its own locking.
3. **Sync on a timer or never.** Fewer disk writes, but a crash can lose much more.

**Repeated batches**

1. **`seq` on each session event, readers drop repeats of `(sid, seq)`.** Retrying after an error is
   always safe. Costs a few bytes per line.
2. **Exactly-once writes, such as a write-ahead marker.** Cleaner files, far more code for a rare case.

**File date**

1. **UTC date in the file name, local time with offset inside `session_started`.** Clock changes and
   travel never reorder files, and streaks can still use the local date. A file name can differ from
   the local date.
2. **Local date in the file name.** Friendlier, but the order breaks when the offset changes.

## Decision

The first option in each group. One event per line:

```json
{
  "v": 1,
  "type": "keystroke",
  "sid": "…",
  "seq": 42,
  "t": 1234.5,
  "kind": "char",
  "code": "KeyA",
  "key": "a",
  "expected": "a",
  "correct": true,
  "pos": 17,
  "mods": ["ShiftLeft"]
}
```

| Field      | Meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `v`        | Schema version                                                            |
| `sid`      | Session id, a UUID                                                        |
| `seq`      | Order inside the session, `session_started` is 0                          |
| `t`        | Milliseconds since the first press, from `event.timeStamp`                |
| `kind`     | `char`, `backspace` or `modifier`. This replaces SPEC's "backspace" field |
| `code`     | `event.code`, the physical key                                            |
| `key`      | The typed character. Absent for Backspace and modifiers                   |
| `expected` | The character the text asked for. Absent in Zen                           |
| `correct`  | Whether `key` matched. Absent in Zen                                      |
| `pos`      | Position in the text, needed later by the ghost and the brain             |
| `mods`     | Physical modifiers held, so stage 5 can separate Shift errors             |
| `ignored`  | `layout` or `policy`: the press is data, but moved nothing and no metric  |

Beyond SPEC there are two events, `session_paused` and `session_resumed`, because the typing screen
pauses and the clock has to stop. `t` keeps counting across a pause, so the marks say exactly what to
subtract. A session starts with its first press: opening a screen and leaving writes nothing.

Everything lives in `%LOCALAPPDATA%\dev.andrii.keymind\`, with journals in `journal/<device-id>/`.
The device id is a random UUID, so no computer name reaches a sync target.

Crash handling:

- A file that ends in the middle of a line gets a newline before the next write. Bytes already on
  disk are never edited.
- Readers skip lines that do not parse and count them.
- Readers ignore unknown fields and unknown event types, so versions can read each other's journals.
- A session without `session_ended` counts as interrupted.

## Consequences

- Every line carries a few extra fields, and modifiers add lines. A rough estimate is 130 bytes per
  press, or about 1.5 MB per hour of fast typing.
- The UI learns that a batch was written only after the sync, so it keeps the batch until then.
- The journal folder becomes configurable at stage 7, when sync needs it.
- Settings snapshots are stored as plain JSON, so changing the settings type cannot make an old line
  unreadable. Readers have to tolerate missing keys.
