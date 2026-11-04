# Keymind

An offline desktop touch-typing trainer for Windows. It records every keystroke in
a local journal and uses that data to find your weak keys and transitions, then
builds training around them. "Keymind" is a working name.

**Status: early scaffold (roadmap stage 0).** The app opens a window and checks the
connection to its core; typing arrives in stage 1. The full plan is in
[`docs/SPEC.md`](docs/SPEC.md) (in Russian), and architecture decisions are in
[`docs/adr/`](docs/adr/).

## Principles

- **Offline first.** The network is used only for sync, music and video.
- **Your data stays yours.** There is no telemetry, and the journal is the single
  source of truth.
- **Honest metrics.** Progress is measured on weak transitions rather than on
  speed in easy texts.
- **Original code.** Ideas from other trainers are welcome, their code is not.

## Run from source

You need:

- Windows 10 or later with the WebView2 runtime (included in Windows 11)
- [Node.js](https://nodejs.org/) 22 or later
- [Rust via rustup](https://www.rust-lang.org/tools/install), MSVC toolchain
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  with the "Desktop development with C++" workload

Then:

```bash
npm install
npm run tauri dev
```

The first run compiles the Rust dependencies and takes a few minutes. Later runs
are fast.

## Development

| Task                         | Command               |
| ---------------------------- | --------------------- |
| Run the app                  | `npm run tauri dev`   |
| All tests and linters        | `npm run check`       |
| UI tests                     | `npm test`            |
| Rust tests                   | `npm run rust:test`   |
| Format UI code               | `npm run format`      |
| Release build with installer | `npm run tauri build` |

## Repository layout

| Path             | Contents                                                  |
| ---------------- | --------------------------------------------------------- |
| `src/`           | Vue 3 UI                                                  |
| `src-tauri/src/` | Rust core: journal, projector, brain, generator and so on |
| `content/`       | Word lists, passages and rule files                       |
| `tools/content/` | Python pipeline that builds `content/`                    |
| `research/`      | Notebooks and registered experiments                      |
| `design/`        | Mockups and design tokens                                 |
| `docs/`          | Specification and architecture decision records           |

## License

The code is [MIT](LICENSE). Data in `content/` keeps its own licenses, listed in
[`content/LICENSES.md`](content/LICENSES.md).
