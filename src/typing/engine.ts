import type { OnError } from "./types";

export const UPCOMING = 0;
export const DONE = 1;
export const ERROR = 2;
export const FIXED = 3;

/** Set on a state when the position was ever typed wrong. Survives Backspace. */
const WAS_WRONG = 4;
const STATE_MASK = 3;

export interface TypeResult {
  pos: number;
  expected: string;
  correct: boolean;
}

/**
 * The state of one text being typed. Plain data with no reactivity and no DOM: one press costs
 * the same on a line and on a whole book, and every rule can be tested without a browser.
 */
export class TypingEngine {
  readonly text: string;
  cursor = 0;
  private readonly states: Uint8Array;
  /** The wrong characters shown on error glyphs. Few, so a map beats one slot per character. */
  private readonly typedWrong = new Map<number, string>();
  private readonly onError: OnError;

  constructor(text: string, onError: OnError) {
    this.text = text;
    this.onError = onError;
    this.states = new Uint8Array(text.length);
  }

  get finished(): boolean {
    return this.cursor >= this.text.length;
  }

  stateAt(pos: number): number {
    return this.states[pos] & STATE_MASK;
  }

  wrongCharAt(pos: number): string | undefined {
    return this.typedWrong.get(pos);
  }

  /** Applies a typed character. Does nothing once the text is finished. */
  type(key: string): TypeResult | null {
    if (this.finished) {
      return null;
    }
    const pos = this.cursor;
    const expected = this.text[pos];
    const correct = key === expected;
    const wasWrong = (this.states[pos] & WAS_WRONG) !== 0;

    if (correct) {
      this.states[pos] = wasWrong ? FIXED | WAS_WRONG : DONE;
      this.typedWrong.delete(pos);
      this.cursor = pos + 1;
    } else {
      this.states[pos] = ERROR | WAS_WRONG;
      this.typedWrong.set(pos, key);
      if (this.onError === "continue") {
        this.cursor = pos + 1;
      }
    }
    return { pos, expected, correct };
  }

  /**
   * Takes back one step and returns the position it cleared. An error waiting at the cursor, as
   * in stop mode, is cleared where it stands. The original error stays counted in the journal.
   */
  backspace(): number | null {
    if ((this.states[this.cursor] & STATE_MASK) === ERROR) {
      return this.clear(this.cursor);
    }
    if (this.cursor === 0) {
      return null;
    }
    this.cursor -= 1;
    return this.clear(this.cursor);
  }

  private clear(pos: number): number {
    this.states[pos] &= WAS_WRONG;
    this.typedWrong.delete(pos);
    return pos;
  }
}
