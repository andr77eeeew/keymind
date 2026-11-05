// The EN QWERTY keyboard as the statistics draw it: which key is where, and which finger presses it.

export type Finger =
  "lp" | "lr" | "lm" | "li" | "lt" | "rt" | "ri" | "rm" | "rr" | "rp";

export interface KeyCap {
  code: string;
  /** What the cap shows. Empty on Space. */
  label: string;
  /** What a sentence calls it. */
  name: string;
  /** The second symbol in the corner of a cap, such as `!` on 1. */
  alt?: string;
  /** Width in key pitches. */
  width: number;
  modifier: boolean;
  home: boolean;
  finger: Finger;
}

const FINGER_CODES: Record<Finger, string> = {
  lp: "Backquote Digit1 Tab KeyQ CapsLock KeyA ShiftLeft KeyZ ControlLeft MetaLeft",
  lr: "Digit2 KeyW KeyS KeyX",
  lm: "Digit3 KeyE KeyD KeyC",
  li: "Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB",
  lt: "AltLeft",
  rt: "Space AltRight",
  ri: "Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM",
  rm: "Digit8 KeyI KeyK Comma",
  rr: "Digit9 KeyO KeyL Period",
  rp: "Digit0 Minus Equal Backspace KeyP BracketLeft BracketRight Backslash Semicolon Quote Enter Slash ShiftRight ContextMenu ControlRight",
};

const fingerByCode = new Map<string, Finger>();
for (const [finger, codes] of Object.entries(FINGER_CODES)) {
  for (const code of codes.split(" ")) {
    fingerByCode.set(code, finger as Finger);
  }
}

export const FINGER_NAMES: Record<Finger, string> = {
  lp: "Left pinky",
  lr: "Left ring",
  lm: "Left middle",
  li: "Left index",
  lt: "Left thumb",
  rt: "Right thumb",
  ri: "Right index",
  rm: "Right middle",
  rr: "Right ring",
  rp: "Right pinky",
};

function symbol(code: string, base: string, alt?: string, width = 1): KeyCap {
  return {
    code,
    label: base,
    name: base,
    alt,
    width,
    modifier: false,
    home: false,
    finger: fingerByCode.get(code) ?? "rp",
  };
}

function letters(row: string): KeyCap[] {
  return row.split("").map((letter) => {
    const capital = letter.toUpperCase();
    const code = `Key${capital}`;
    return {
      ...symbol(code, capital),
      home: code === "KeyF" || code === "KeyJ",
    };
  });
}

function modifier(code: string, label: string, width: number): KeyCap {
  return { ...symbol(code, label, undefined, width), modifier: true };
}

export const ROWS: readonly (readonly KeyCap[])[] = [
  [
    symbol("Backquote", "`", "~"),
    symbol("Digit1", "1", "!"),
    symbol("Digit2", "2", "@"),
    symbol("Digit3", "3", "#"),
    symbol("Digit4", "4", "$"),
    symbol("Digit5", "5", "%"),
    symbol("Digit6", "6", "^"),
    symbol("Digit7", "7", "&"),
    symbol("Digit8", "8", "*"),
    symbol("Digit9", "9", "("),
    symbol("Digit0", "0", ")"),
    symbol("Minus", "-", "_"),
    symbol("Equal", "=", "+"),
    modifier("Backspace", "Backspace", 2),
  ],
  [
    modifier("Tab", "Tab", 1.5),
    ...letters("qwertyuiop"),
    symbol("BracketLeft", "[", "{"),
    symbol("BracketRight", "]", "}"),
    symbol("Backslash", "\\", "|", 1.5),
  ],
  [
    modifier("CapsLock", "Caps", 1.75),
    ...letters("asdfghjkl"),
    symbol("Semicolon", ";", ":"),
    symbol("Quote", "'", '"'),
    modifier("Enter", "Enter", 2.25),
  ],
  [
    modifier("ShiftLeft", "Shift", 2.25),
    ...letters("zxcvbnm"),
    symbol("Comma", ",", "<"),
    symbol("Period", ".", ">"),
    symbol("Slash", "/", "?"),
    modifier("ShiftRight", "Shift", 2.75),
  ],
  [
    modifier("ControlLeft", "Ctrl", 1.25),
    modifier("MetaLeft", "Win", 1.25),
    modifier("AltLeft", "Alt", 1.25),
    { ...symbol("Space", "", undefined, 6.25), name: "Space" },
    modifier("AltRight", "Alt", 1.25),
    modifier("ContextMenu", "Menu", 2.5),
    modifier("ControlRight", "Ctrl", 1.25),
  ],
];

export interface KeyPosition {
  /** The centre of the key, in key pitches from the left of the keyboard. */
  x: number;
  y: number;
}

export const KEY_POSITIONS: ReadonlyMap<string, KeyPosition> = (() => {
  const positions = new Map<string, KeyPosition>();
  ROWS.forEach((row, y) => {
    let x = 0;
    for (const cap of row) {
      positions.set(cap.code, { x: x + cap.width / 2, y: y + 0.5 });
      x += cap.width;
    }
  });
  return positions;
})();

export const KEY_CAPS: ReadonlyMap<string, KeyCap> = new Map(
  ROWS.flat().map((cap) => [cap.code, cap]),
);
