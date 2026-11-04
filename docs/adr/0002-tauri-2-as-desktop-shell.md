# ADR-0002: Tauri 2 as the desktop shell

- Status: accepted
- Date: 2026-11-04

## Context

Keymind is an offline Windows desktop app that lives in the tray, with Linux possible
later. It needs a reactive UI for the typing screen and the dashboard, a fast core for
background training, and very low input latency. The author already knows Vue 3 and
is new to Rust.

## Options

1. **Tauri 2 (Rust core, system WebView2).** Small binary and low memory use, since
   the webview comes with Windows. Has tray, autostart and notification support.
   Requires learning Rust, and rendering depends on the installed WebView2 version.
2. **Electron (Node.js core, bundled Chromium).** The most mature option, with one
   fixed browser version and no new language. Binaries are far larger and memory use
   is higher, and heavy background work on Node.js is less comfortable.
3. **Native UI (WinUI, or Rust with egui).** Potentially the lowest latency, but gives
   up the known Vue stack and makes dashboard charts much more work, for a gain that
   the typing screen is unlikely to need.

## Decision

Option 1, Tauri 2 with Vue 3, TypeScript, Vite and Pinia for the UI and Rust for the
core. The installer targets NSIS only for now, because a single installer format is
enough for Windows.

## Consequences

- Keystroke capture stays in the webview, so timestamps come from the browser clock
  and reach the core in batches rather than one IPC call per key.
- Pure logic stays separate from Tauri commands, so it can be unit-tested and the
  Rust learning curve stays manageable.
- Tauri 1 and Tauri 2 APIs differ, so every documentation example must be checked
  against v2.
- Test binaries that link Tauri are reported to fail to start on Windows with
  `STATUS_ENTRYPOINT_NOT_FOUND`, because they lack a Common Controls v6 manifest. This
  does not happen with the current code. If it appears, embed that manifest into test
  binaries from `src-tauri/build.rs`.
- WebView2 updates independently of the app, so latency has to be measured on the real
  webview rather than assumed.
