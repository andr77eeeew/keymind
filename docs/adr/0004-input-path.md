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
