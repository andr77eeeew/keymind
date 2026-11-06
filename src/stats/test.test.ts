import { describe, expect, it } from "vitest";
import type { KeyRow, SessionRow } from "../typing/api";
import { testFigures, testMap } from "./test";

function key(code: string, mean: number, samples = 20, errors = 0): KeyRow {
  return {
    layout: "en-qwerty",
    code,
    presses: samples + errors,
    samples,
    mean_ms: mean,
    errors,
  };
}

describe("the starting test map", () => {
  it("raises the slow keys at full height and pins the two weakest", () => {
    const keys = [
      key("KeyA", 200),
      key("KeyS", 205),
      key("KeyD", 210),
      key("KeyF", 200),
      key("KeyP", 400),
    ];
    const map = testMap(keys);
    expect(map?.pins.map((pin) => pin.name)).toEqual(["P", "D"]);
    // A map of ten sessions or more is not lowered.
    expect(map?.hills).toHaveLength(1);
    expect(map?.hills[0][2]).toBe(1);
    expect(map?.note).toBeUndefined();
  });

  it("is flat with a note when no key stands out", () => {
    const map = testMap([key("KeyA", 200), key("KeyS", 201)]);
    expect(map?.hills).toEqual([]);
    expect(map?.note).toBe("No key stood out, so the ground is flat.");
  });

  it("is not drawn from too few samples", () => {
    expect(testMap([key("KeyA", 200, 4)])).toBeNull();
    expect(testMap([])).toBeNull();
  });
});

describe("the starting test figures", () => {
  it("are WPM, accuracy and rhythm evenness", () => {
    const row = {
      sid: "t1",
      reason: "completed",
      duration_ms: 60000,
      chars: 200,
      correct: 190,
      backspaces: 3,
      cpm: 200,
      wpm: 40.4,
      accuracy: 93.2,
      rhythm: 61.4,
      ts: "2026-11-06T10:00:00+02:00",
      mode: "test",
      source: null,
      targets: [],
    } satisfies SessionRow;
    expect(testFigures(row)).toEqual([
      { value: "40", label: "WPM" },
      { value: "93.2%", label: "Accuracy" },
      { value: "61%", label: "Rhythm evenness" },
    ]);
  });
});
