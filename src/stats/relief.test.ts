import { describe, expect, it } from "vitest";
import type { KeyRow } from "../typing/api";
import { reliefHills, weakestPins } from "./relief";

function key(code: string, meanMs: number, more = {}): KeyRow {
  return {
    layout: "en-qwerty",
    code,
    presses: 100,
    samples: 100,
    mean_ms: meanMs,
    errors: 0,
    ...more,
  };
}

const EVEN = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ"].map((code) =>
  key(code, 100),
);

describe("reliefHills", () => {
  it("leaves the ground flat with nothing weak", () => {
    expect(reliefHills([], 20)).toEqual([]);
    expect(reliefHills(EVEN, 20)).toEqual([]);
  });

  it("raises a full hill under a slow key", () => {
    const hills = reliefHills([...EVEN, key("KeyE", 150)], 20);
    // E is the fourth pitch of its row, and the keyboard starts 7.5 pitches into the ground.
    expect(hills).toEqual([[11.5, 1.8, 1]]);
  });

  it("raises a hill under a key that goes wrong", () => {
    const hills = reliefHills([...EVEN, key("KeyP", 100, { errors: 4 })], 20);
    expect(hills).toHaveLength(1);
    expect(hills[0][2]).toBeCloseTo(0.5);
  });

  it("draws lower before ten sessions", () => {
    const hills = reliefHills([...EVEN, key("KeyE", 150)], 9);
    expect(hills[0][2]).toBeCloseTo(0.6);
  });

  it("ignores keys with too few samples", () => {
    const hills = reliefHills(
      [...EVEN, key("KeyE", 900, { samples: 4, presses: 4 })],
      20,
    );
    expect(hills).toEqual([]);
  });

  it("keeps the nine weakest", () => {
    const slow = "QWERTYUIOPZXCV"
      .split("")
      .map((letter, index) => key(`Key${letter}`, 130 + index));
    const median = [...EVEN, ...EVEN, ...EVEN, ...EVEN];
    expect(reliefHills([...median, ...slow], 20)).toHaveLength(9);
  });
});

describe("weakestPins", () => {
  it("has no pin without a weak key", () => {
    expect(weakestPins(EVEN)).toEqual([]);
  });

  it("names the two weakest keys, by time or by errors", () => {
    const pins = weakestPins([
      ...EVEN,
      key("KeyE", 212),
      key("Semicolon", 100, { errors: 7 }),
    ]);
    expect(pins.map((pin) => [pin.name, pin.text])).toEqual([
      ["E", "212 ms"],
      [";", "7.0% errors"],
    ]);
  });

  it("skips a second key that would sit on the first pin", () => {
    const pins = weakestPins([
      ...EVEN,
      key("KeyE", 212),
      key("KeyR", 200),
      key("KeyO", 180),
    ]);
    expect(pins.map((pin) => pin.name)).toEqual(["E", "O"]);
  });

  it("keeps a pin of the top row on the map", () => {
    const pins = weakestPins([...EVEN, key("Digit1", 300)]);
    expect(pins[0].y).toBe(-2.5);
  });
});
