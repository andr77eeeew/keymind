# ADR-0007: Remembered session setup

- Status: accepted
- Date: 2026-11-05

## Context

Home starts the usual session in one action, so the app has to know the last setup of each mode:
word count or time, word set, difficulty, the chosen file. SPEC did not say where this lives. The
answer has to respect the rules that the journal is the single source of truth and that everything
else can be rebuilt from it.

`session_started` already records the mode and the text source, which holds almost all of a setup:

- `Words { seed, pool, count?, seconds? }`
- `Passage { id }`, which does not record the chosen difficulty
- `Paste { chars }`, where the text itself is deliberately left out
- `Import { id, offset }`
- `Zen`

## Options

1. **Derive the setup from `session_started`.** No new event and nothing new to sync. The meaning is
   "what you last started", so a change that was never started is forgotten.
2. **A new `setup_changed` event.** Remembers every change, even one never started. It adds journal
   lines that say nothing about typing skill, and the brain and statistics would have to skip them.
3. **`localStorage` in the webview.** The least code, but it cannot be rebuilt from the journal, does
   not sync, and is lost with the webview profile.

## Decision

Option 1. The last `session_started` of a mode, by `ts` across all devices, defines its setup.

- `TextSource::Passage` gets an optional `difficulty`. It is an additive change: old readers ignore
  the field, and an old line without it reads as Any, which is also how a new Any is written.
- Words repeat the length and the word set with a new seed. Passages repeat the difficulty with a new
  pick. A file continues from its reading position.
- Pasted text cannot be repeated, because keeping it would break the decision that it stays out of
  the journal. A file cannot be repeated when it was deleted, lives on another device or is finished.
  In these cases Home opens the setup of that mode instead of starting at once.
- Storage is derived: a `last_setups` view over the `sessions` table of the projector (ADR-0008). The
  `last_setups.json` cache first planned here was never built, because the projector arrived before
  the screens that need it.

## Consequences

- There is one source of truth and no new event type. Synced journals bring the setup along without
  extra work.
- Adjusting a setup and leaving without starting forgets the change. That is accepted: a setup that
  was never used is a weak signal of what the user wants next.
- During a rebuild the view is not ready yet, so Home shows the default setup until it finishes.
- With clocks that disagree between devices, "last" can pick the older session. The cost is one wrong
  suggestion on Home, and the setup screen is one action away.
- A future mode with a setup only has to record it in its text source to be remembered too.
