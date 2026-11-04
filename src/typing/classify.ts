/** The fields of a `KeyboardEvent` that decide what a press means. */
export interface KeyInput {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export type KeyAction =
  /** A character of the text. */
  | { action: "char"; key: string }
  | { action: "backspace" }
  /** Shift, Ctrl, Alt or Win, kept so later stages can tell a Shift error from a letter error. */
  | { action: "modifier" }
  /** A character of another alphabet, which means the wrong layout is active. */
  | { action: "layout"; key: string }
  | { action: "escape" }
  /** Not typing. `block` stops the browser default, such as Ctrl+R reloading the app. */
  | { action: "none"; block: boolean };

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

const ALLOWED_CHAR = /^[\x20-\x7e]$/;

/**
 * Decides what a press means. It is pure and runs on every key, so it allocates only its small
 * result. Alt combinations keep their default, so Alt+F4 still closes the window.
 */
export function classifyKey(input: KeyInput): KeyAction {
  if (MODIFIER_CODES.has(input.code)) {
    return input.repeat
      ? { action: "none", block: true }
      : { action: "modifier" };
  }
  if (input.altKey) {
    return { action: "none", block: false };
  }
  if (input.ctrlKey || input.metaKey) {
    return { action: "none", block: true };
  }
  if (input.key === "Backspace") {
    return { action: "backspace" };
  }
  if (input.repeat) {
    return { action: "none", block: true };
  }
  if (input.key === "Escape") {
    return { action: "escape" };
  }
  if (input.key.length !== 1) {
    // Tab, Enter, F-keys and arrows, plus Dead, Process and AltGraph, which never give one
    // committed character of their own.
    return { action: "none", block: true };
  }
  if (ALLOWED_CHAR.test(input.key)) {
    return { action: "char", key: input.key };
  }
  return { action: "layout", key: input.key };
}

/** Tracks which modifier keys are physically down, from presses and releases. */
export class HeldModifiers {
  private readonly held: string[] = [];

  press(code: string): void {
    if (MODIFIER_CODES.has(code) && !this.held.includes(code)) {
      this.held.push(code);
    }
  }

  release(code: string): void {
    const index = this.held.indexOf(code);
    if (index >= 0) {
      this.held.splice(index, 1);
    }
  }

  /** A blur can swallow the release, so everything is forgotten then. */
  reset(): void {
    this.held.length = 0;
  }

  /** A copy for the journal, or `undefined` when nothing is held, as for most presses. */
  snapshot(except?: string): string[] | undefined {
    if (this.held.length === 0) {
      return undefined;
    }
    const list = except
      ? this.held.filter((code) => code !== except)
      : [...this.held];
    return list.length > 0 ? list : undefined;
  }
}
