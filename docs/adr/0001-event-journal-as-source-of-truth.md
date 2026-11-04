# ADR-0001: Event journal as the single source of truth

- Status: accepted
- Date: 2026-11-04

## Context

Keymind trains on a user's raw typing data. Models, statistics and game rules will
change many times, and each change should be able to use all past practice. The app
also has to run offline and sync between computers without a server, using a plain
cloud folder or a Git repository.

## Options

1. **Database as the source of truth.** Store sessions and aggregates in SQLite.
   Queries are simple from the start, but a formula that changes later cannot be
   recomputed once raw data is aggregated away. Merging databases between devices
   is hard, and a live SQLite file in a cloud folder can be corrupted.
2. **Append-only event journal plus a derived database.** Write raw events to
   per-device JSONL files and build SQLite from them. Needs a projector and takes
   more disk, but every derived number can be rebuilt.
3. **Journal only, no database.** Simplest storage, but the dashboard and the brain
   would rescan every event for each read, which gets slow as the journal grows.

## Decision

Option 2. Events are appended to `journal/<device-id>/<YYYY-MM-DD>.jsonl` and are
never edited or deleted. SQLite holds only derived data, can be deleted and rebuilt
at any time, and never enters a sync folder. Every event carries a schema version,
and old journals must keep loading after schema changes.

## Consequences

- Better models and corrected formulas apply to all past practice by replaying it.
- Sync has no conflicts: each device writes only its own files, so merging is a
  union of files.
- The projector is a required component and must be tested against golden journals.
- Anything not recorded at the time is lost for good, so the event schema has to
  capture raw facts generously from the first day.
- Journal mistakes cannot be fixed in place. Corrections have to be new events or
  rules applied by the reader.
- Rewards need their own `reward_granted` events, so that changing a rule later does
  not grant them again.
