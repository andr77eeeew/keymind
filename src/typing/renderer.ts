import { DONE, ERROR, FIXED, type TypingEngine } from "./engine";

/** What the session needs from a text view. */
export interface TextView {
  /** Repaints the old and the new cursor position, which covers every state change. */
  moveCursor(cursor: number): void;
  dispose(): void;
}

const CHUNK = 512;
/** Past this, a text has no usable break, and a chunk is cut wherever it stands. */
const CHUNK_LIMIT = 2048;
const LOOKAHEAD = 256;
/** A longer word could not fit on one line, so it is allowed to break. */
const MAX_NOWRAP_WORD = 40;

/** Where the chunk starting at `start` should end: at a space, so words stay whole. */
export function chunkEnd(text: string, start: number): number {
  const wanted = start + CHUNK;
  if (wanted >= text.length) {
    return text.length;
  }
  const space = text.indexOf(" ", wanted);
  if (space < 0 || space >= start + CHUNK_LIMIT) {
    return Math.min(start + CHUNK_LIMIT, text.length);
  }
  return space + 1;
}

/**
 * Shows a small window of the text, so a key press costs the same on any length.
 *
 * - Only about two chunks of characters exist in the DOM. Everything else is in the engine.
 * - The typing font is proportional, so line breaks are measured instead of computed. Measuring
 *   happens once per chunk, outside the key handler. A press only reads the stored line.
 * - A press touches at most two nodes and one transform, and reads nothing from the DOM.
 */
export class TextRenderer implements TextView {
  private readonly engine: TypingEngine;
  private readonly stream: HTMLElement;
  private readonly observer: ResizeObserver | null;
  private readonly lineHeight: () => number;

  private start = 0;
  private end = 0;
  private spans: HTMLElement[] = [];
  /** The line of each window position, counted from the top of the text. */
  private lines: number[] = [];
  private cursor = 0;
  private shiftedLines = -1;
  private cachedLineHeight = 0;
  private maintenance: ReturnType<typeof setTimeout> | null = null;
  private width = 0;
  private disposed = false;

  constructor(
    windowEl: HTMLElement,
    stream: HTMLElement,
    engine: TypingEngine,
  ) {
    this.engine = engine;
    this.stream = stream;
    this.cursor = engine.cursor;
    this.lineHeight = () => {
      if (this.cachedLineHeight === 0) {
        this.cachedLineHeight =
          parseFloat(getComputedStyle(windowEl).lineHeight) || 1;
      }
      return this.cachedLineHeight;
    };
    this.mount(this.cursor);

    this.observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            // The first report only tells the width that the mount has already measured.
            if (this.width !== 0 && width !== this.width) {
              this.cachedLineHeight = 0;
              this.mount(this.cursor);
            }
            this.width = width;
          });
    this.observer?.observe(windowEl);
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    if (this.maintenance !== null) {
      clearTimeout(this.maintenance);
    }
    this.stream.replaceChildren();
  }

  moveCursor(cursor: number): void {
    const previous = this.cursor;
    this.cursor = cursor;

    if (cursor < this.start) {
      // Backspace went past what is in the DOM. Rare, and the user sees the result at once.
      this.mount(cursor);
      return;
    }
    if (previous !== cursor) {
      const old = this.spans[previous - this.start];
      if (old) {
        this.applyClass(old, previous);
      }
    }
    const span = this.spans[cursor - this.start];
    if (span) {
      this.applyClass(span, cursor);
    }
    this.scrollToCursor();
    this.scheduleMaintenance();
  }

  /** Replaces everything with chunks around `pos`. */
  private mount(pos: number): void {
    const start = this.lineSafeStart(pos);
    this.start = start;
    this.end = start;
    this.spans = [];
    this.lines = [];
    this.shiftedLines = -1;
    this.stream.replaceChildren();
    this.appendChunk();
    while (this.end < this.engine.text.length && this.end < pos + CHUNK) {
      this.appendChunk();
    }
    this.scrollToCursor();
  }

  /**
   * A window must start at the start of a line, or the wrapping would differ from the first
   * layout. Before a measurement exists the only known line start is a space, which is good
   * enough: greedy wrapping settles within a line.
   */
  private lineSafeStart(pos: number): number {
    const wanted = Math.max(0, pos - CHUNK / 2);
    if (wanted === 0) {
      return 0;
    }
    const space = this.engine.text.indexOf(" ", wanted);
    return space < 0 || space >= pos ? wanted : space + 1;
  }

  private appendChunk(): void {
    const { text } = this.engine;
    const from = this.end;
    const to = chunkEnd(text, from);
    const fragment = document.createDocumentFragment();
    let word: HTMLElement | null = null;
    let insideLongWord = false;
    const added: HTMLElement[] = [];

    for (let pos = from; pos < to; pos += 1) {
      const c = text[pos];
      const span = document.createElement("span");
      span.textContent = c;
      this.applyClass(span, pos);
      added.push(span);

      if (c === " ") {
        word = null;
        insideLongWord = false;
        fragment.append(span);
      } else {
        if (word === null && !insideLongWord) {
          if (this.wordFits(pos, to)) {
            word = document.createElement("span");
            word.className = "w";
            fragment.append(word);
          } else {
            insideLongWord = true;
          }
        }
        (word ?? fragment).append(span);
      }
    }
    this.stream.append(fragment);
    this.spans.push(...added);
    this.end = to;
    this.measure(added);
  }

  private wordFits(pos: number, limit: number): boolean {
    const { text } = this.engine;
    for (let i = pos; i < limit && i < pos + MAX_NOWRAP_WORD; i += 1) {
      if (text[i] === " ") {
        return true;
      }
    }
    return pos + MAX_NOWRAP_WORD >= limit;
  }

  /** Reads line positions in one pass, so the layout runs once. */
  private measure(added: HTMLElement[]): void {
    if (this.spans.length === 0) {
      return;
    }
    const height = this.lineHeight();
    const anchor = this.spans[0];
    const anchorTop = anchor.offsetTop;
    const anchorLine = this.lines[0] ?? 0;
    for (const span of added) {
      this.lines.push(
        anchorLine + Math.round((span.offsetTop - anchorTop) / height),
      );
    }
  }

  private scrollToCursor(): void {
    if (this.lines.length === 0) {
      return;
    }
    const index = Math.min(this.cursor - this.start, this.lines.length - 1);
    // The cursor rests on the second line, so the line above stays readable.
    const shift = Math.max(0, this.lines[index] - this.lines[0] - 1);
    if (shift !== this.shiftedLines) {
      this.shiftedLines = shift;
      this.stream.style.transform = `translateY(${-shift * this.lineHeight()}px)`;
    }
  }

  private scheduleMaintenance(): void {
    if (this.maintenance !== null) {
      return;
    }
    const needsMore =
      this.cursor + LOOKAHEAD > this.end && this.end < this.engine.text.length;
    const hasExcess = this.cursor - this.start > CHUNK * 2;
    if (needsMore || hasExcess) {
      this.maintenance = setTimeout(() => {
        this.maintenance = null;
        if (!this.disposed) {
          this.maintain();
        }
      }, 0);
    }
  }

  /** Adds text ahead and removes text behind, in its own task. */
  private maintain(): void {
    if (
      this.cursor + LOOKAHEAD > this.end &&
      this.end < this.engine.text.length
    ) {
      this.appendChunk();
    }
    if (this.cursor - this.start > CHUNK * 2) {
      this.trimBehind();
    }
  }

  private trimBehind(): void {
    // Keep some text behind for Backspace, and cut at a line start so nothing re-wraps.
    let index = this.cursor - this.start - CHUNK;
    while (index > 0 && this.lines[index] === this.lines[index - 1]) {
      index += 1;
    }
    if (index <= 0 || index >= this.spans.length) {
      return;
    }
    const first = this.spans[index];
    const top =
      first.parentElement === this.stream ? first : first.parentElement;
    while (this.stream.firstChild && this.stream.firstChild !== top) {
      this.stream.firstChild.remove();
    }
    // A very long word can hold a line start inside it.
    while (top && top !== first && top.firstChild && top.firstChild !== first) {
      top.firstChild.remove();
    }
    this.spans = this.spans.slice(index);
    this.lines = this.lines.slice(index);
    this.start += index;

    // The removed lines and the smaller shift cancel out, so nothing should animate.
    this.stream.style.transition = "none";
    this.scrollToCursor();
    requestAnimationFrame(() => {
      this.stream.style.transition = "";
    });
  }

  private applyClass(span: HTMLElement, pos: number): void {
    const state = this.engine.stateAt(pos);
    const atCursor = pos === this.cursor;
    let name = "c";
    if (state === ERROR) {
      name = "c err";
      span.dataset.typed = this.engine.wrongCharAt(pos) ?? "";
    } else {
      if (span.dataset.typed !== undefined) {
        delete span.dataset.typed;
      }
      if (atCursor) {
        name = "c cur";
      } else if (state === DONE) {
        name = "c done";
      } else if (state === FIXED) {
        name = "c fixed";
      }
    }
    if (span.className !== name) {
      span.className = name;
    }
  }
}
