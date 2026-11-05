# CLAUDE.md

Offline desktop touch-typing trainer for Windows with an ML-adaptive training engine.
Full specification: `docs/SPEC.md`. Architecture decisions: `docs/adr/`.
Read the relevant SPEC sections before starting any task.

## Working with me

- Communicate with me in Russian. Code, comments, commit messages and docs are in English.
- I am a beginner backend developer (Python, FastAPI, Django, some Vue 3). Rust and Tauri are new to me.
  Explain non-obvious decisions briefly, with the trade-offs. I want to understand the code, not just receive it.
- Plan before coding any non-trivial task. A new roadmap stage always starts with a plan I approve.
- Work one roadmap stage at a time. At the end of each stage stop and report:
  what was done, how to run it, what I should check manually, open questions.
- If the spec is ambiguous or contradicts itself, ask. Never guess, and never resolve
  items from "Open questions" in SPEC on your own.

## Stack

- Shell: Tauri 2 (Windows target)
- Core: Rust
- UI: Vue 3 + TypeScript + Vite, Pinia, Composition API with `<script setup>`
- Storage: append-only JSONL journal + SQLite (derived data only)
- Research and content tools: Python

## Repository layout

```
src/                     Vue UI; src/typing/ is the non-reactive input path (ADR-0004),
                         src/relief/ draws the contour ground, src/stats/ is the pure logic
                         of the statistics screen (heat scales, relief hills, trends, tables)
src-tauri/src/
  journal/               append-only event journal
  projector/             journal -> SQLite derived tables
  stats/                 session metrics, shared by the summary and the projector
  brain/                 student model, decision model, heuristic fallback
  generator/             exercise text generation, and loading of content/
  settings/              policies: settings_changed events and their cache
  imports/               TXT and EPUB import, kept only in the local data folder
  rules/                 XP, levels, goals, quests, events, achievements, tips
  sync/                  folder and Git sync of journals
  integrations/          LRCLIB, Windows media controls, yt-dlp
content/                 word lists, passages, rule files (*.toml), LICENSES.md
tools/content/           Python pipeline that builds content/ from sources
scripts/                 latency and rebuild benches, synthetic journal, CDP helper
research/                notebooks and registered experiments
design/                  mockups and design tokens
docs/                    SPEC.md, adr/
```

## Commands

Keep up to date:

- Dev run: `npm run tauri dev`
- Rust tests: `npm run rust:test`
- UI tests: `npm test`
- Lint and format: `npm run lint`, `npm run format:check`, `npm run rust:fmt`, `npm run rust:lint`
  (apply formatting with `npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml`)
- Everything above plus type checks: `npm run check`
- Release build: `npm run tauri build`
- Input latency bench: `VITE_LATENCY_PROBE=1 npx tauri build --no-bundle`, then
  `node scripts/latency-bench.mjs` (ADR-0004). Rebuild without the variable afterwards.
- Projector load: `node scripts/synth-journal.mjs <folder>`, then `node scripts/rebuild-bench.mjs <folder>`,
  and `node scripts/latency-bench.mjs 5000 <folder>` to measure typing during rebuilds (ADR-0008).
- After a deliberate projector change, update its golden dumps and read the diff:
  `UPDATE_GOLDEN=1 npm run rust:test`.
- `KEYMIND_DATA_DIR` points the app at another data folder. Automated runs must always set it,
  so they never write to real journals.

## Architecture rules (do not break)

1. The journal is the single source of truth. Events are appended to
   `journal/<device-id>/<YYYY-MM-DD>.jsonl` and are never edited or deleted.
2. SQLite holds only derived data and must be rebuildable from the journals at any time.
   SQLite files never go into a sync folder.
3. Each event has a schema version field. Old journals must keep loading after schema changes.
4. Every keystroke stores `event.code`, the typed character, the expected character and a
   timestamp from `event.timeStamp` (the `performance.now()` clock, taken when the browser received
   the input). Keystrokes reach the core in batches, never one IPC call per key.
5. The typing screen must never lag. No heavy work on the input path; the projector and the brain
   run in the background.
6. Every feature and policy is user-toggleable and on by default. A new policy is also added to the
   settings table in SPEC.
7. Achievements, quests, events and challenges are data in `content/*.toml`, not code.
8. The brain always has the heuristic fallback. ML is compared against the heuristic (A/B) before any
   claim that it is better. The reward is improvement on targeted transitions, not session WPM.
9. Offline first. The network is used only for sync, music and video; every network failure is handled
   gracefully and the app stays usable.

## Licensing and content

- The code is MIT and fully original. Never copy or closely paraphrase code from other typing trainers
  (keybr is AGPL-3.0, Monkeytype is GPL-3.0) or from any repository with an incompatible license.
- Data in `content/` comes only from public-domain or openly licensed sources. Record source, URL,
  license, date and processing for every file in `content/LICENSES.md`. CC BY-SA data stays CC BY-SA.
- `content/` is generated by reproducible scripts in `tools/content/`. Raw downloads are not committed.
- Never commit lyrics, subtitles, videos, user-imported texts or journals. They live only in the local
  cache and are covered by `.gitignore`.

## Code quality

- Rust: rustfmt, `clippy -D warnings`, no `unwrap()`/`expect()` outside tests, typed errors.
  Keep pure logic separate from Tauri commands so it can be unit-tested.
- TypeScript: strict mode, ESLint + Prettier, shared state in Pinia stores.
- Unit tests are required for journal, projector, statistics, generator, brain and rules.
  The projector is tested against small "golden" journal files in `src-tauri/tests/golden/`.
- Run tests, lint and build before saying a task is done.
- Every new dependency gets a one-line reason in the commit or ADR.

## Git

- Conventional Commits, small focused commits.
- One branch per roadmap stage: `stage-N-short-name`. A large stage may use several such branches
  and PRs when its approved plan says so, as stage 2 does. Never force-push `main`.
- Never commit secrets, journals or personal data.

## Documentation

- Every architectural decision gets an ADR: `docs/adr/NNNN-title.md` with context, options,
  decision and consequences.
- If the implementation has to diverge from SPEC, update SPEC in the same change and tell me.
- Keep this file current.

## Tools

- Use Context7 for Tauri 2, Vue and crate documentation. Tauri 1 and Tauri 2 APIs differ: always
  check that an example is for v2.
- Use the LSP tools, when available, for navigation and diagnostics.
- When the Tauri MCP server is connected (debug builds only), use it to check the running app:
  screenshots, DOM, console logs.
