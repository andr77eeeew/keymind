# ADR-0004: Input path

- Status: accepted
- Date: 2026-11-04

## Context

SPEC requires the typing screen to never lag, on any length of text. A user-imported book can be a
million characters. The mockups use Golos Text for the typing text, a proportional font, so a line
break cannot be computed from a character count. Every keystroke also has to reach the journal,
without one IPC call per key.

## Options

**Who handles a key press**

1. **Plain TypeScript classes outside Vue.** The handler does a known, small amount of work. It costs
   some imperative DOM code that is harder to read than a template.
2. **Vue reactivity with `v-for` over characters.** Simplest to write, but every press goes through
   the scheduler and a diff, and the cost grows with the text.

**How the text is shown**

1. **A window of about two chunks in the DOM, with measured line breaks.** A press costs the same on
   any length. Measuring needs a layout, which happens once per chunk, outside the key handler.
2. **The whole text in the DOM.** No window logic, but a million spans make layout and memory
   unusable.
3. **Canvas.** Full control, but text rendering, selection of fonts and accessibility all have to be
   rebuilt, and the design is written in CSS.

**How events reach the core**

1. **Batches of up to 50 events or one per second.** One write per second at most, and a crash loses
   about a second of typing. A failed batch stays queued in order and is retried.
2. **One IPC call per key.** Forbidden by the architecture rules: it puts the IPC cost on the input
   path.

## Decision

- `TypingEngine` holds the text and one byte of state per position. `type` and `backspace` are O(1)
  and read nothing from the DOM. It is non-reactive and has no idea how it is shown.
- `TextRenderer` keeps a window of the text in the DOM: chunks of about 512 characters cut at a space,
  with a hard cut at 2048 for text without spaces. After a chunk is added, one pass reads `offsetTop`
  of its characters and stores each character's line.
- A press repaints at most two spans and sets one `transform`, reading only the stored line. New text
  is added and old text removed in a separate `setTimeout` task, never in the key handler.
- Removal cuts at a stored line start, so the remaining text cannot wrap differently. If Backspace
  goes past the window, the window is rebuilt around the cursor. A window width change rebuilds too.
- Words stay in a `white-space: nowrap` group unless they are over 40 characters.
- `ZenRenderer` appends to one text node, because Zen text only changes at its end. It keeps the last
  4000 characters when it passes 8000.
- `Batcher` never sends inside `push`. It keeps one batch in flight, backs off on failure up to 8 s,
  and reports health changes so the UI can show a calm warning.
- The time of a press is `event.timeStamp`, not `performance.now()` in the handler, so a busy main
  thread cannot distort the data the brain learns from.
- Live figures are written with `textContent` by a timer twice a second. They never run on a press.
- Measurement probes exist only in a build with `VITE_LATENCY_PROBE`. Vite replaces the flag at build
  time, so a normal build drops them entirely.

## Consequences

- Vue does not render the typing text. That part of the UI is imperative, which is the price for a
  flat cost, and it is contained in two files.
- A chunk measure forces one layout of about 512 characters in its own task. It is short, and the
  latency bench watches for long tasks.
- `requestAnimationFrame` and transitions run off the input path, so a line change animates without
  adding handler time.
- Greedy wrapping settles within a line, so a window rebuilt after a long Backspace can differ from
  the earlier layout in its first line only. Nobody sees this, as the text above the cursor scrolls.
- The input path can be unit-tested in jsdom except for real line positions, which tests fake. Real
  behaviour is checked by the latency bench and the end-to-end run against WebView2.

## Measurement

`scripts/latency-bench.mjs` drives a release build in the real WebView2 through the DevTools
Protocol. `Input.dispatchKeyEvent` goes through the normal input pipeline, and the journal is really
written, to a temporary folder. The run is 5000 presses per text: 40 at 20 per second, then 20 at 60
per second, with 2% wrong presses corrected by Backspace. Probes exist only in this build.

Results of 2026-11-04, 60 Hz display, times in milliseconds:

| Text, characters | Queue p50 / p99 / max | Handler p50 / p99 / max | To next frame p50 / p95 / max | To paint: over 16 ms, p95, max | Long tasks |
| ---------------- | --------------------- | ----------------------- | ----------------------------- | ------------------------------ | ---------- |
| 1,000            | 0.2 / 0.6 / 1.6       | 0.0 / 0.2 / 3.9         | 0.5 / 6.2 / 8.8               | 18%, 16, 32                    | 0          |
| 100,000          | 0.2 / 0.5 / 2.4       | 0.0 / 0.2 / 0.3         | 0.5 / 6.3 / 8.6               | 20%, 16, 24                    | 0          |
| 1,000,000        | 0.2 / 0.6 / 3.0       | 0.0 / 0.2 / 0.3         | 0.5 / 6.3 / 8.6               | 19%, 16, 24                    | 0          |

All 15,004 presses reached the journal, and the DOM never held more than about 1,300 characters.

The targets were a queue p99 of 4 ms at most, a handler p99 of 2 ms at most, 33 ms at most to the
frame at p95, no long tasks, and no growth with length. All hold, and the figures do not depend on
the length of the text.

- **Queue** is `event.timeStamp` to the start of the handler. **Handler** is its own run time.
- **To next frame** ends at the next `requestAnimationFrame` callback. It shows that nothing blocks
  the frame, but a callback runs before the paint, so it understates what the eye sees.
- **To paint** comes from the Event Timing API, which ends at the paint. It has 8 ms steps and only
  reports events of 16 ms or more, which is why it gives a share over 16 ms rather than a median.

This does not cover the keyboard, the path through Windows or the delay of the monitor, which add
the same amount in any app. Synthetic input also skips the hardware message loop, so the feel on a
long text still needs a check by hand.
