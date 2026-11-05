import { describe, expect, it } from "vitest";
import type { BigramRow, KeyRow } from "../typing/api";
import {
  errorStep,
  fingerHeat,
  fingerNote,
  keyHeat,
  medianOf,
  slowestTransitions,
  speedStep,
  transitionMatrix,
} from "./heat";

function key(code: string, meanMs: number | null, more = {}): KeyRow {
  return {
    layout: "en-qwerty",
    code,
    presses: 20,
    samples: 20,
    mean_ms: meanMs,
    errors: 0,
    ...more,
  };
}

function bigram(
  first: string,
  second: string,
  meanMs: number,
  more = {},
): BigramRow {
  return {
    layout: "en-qwerty",
    first,
    second,
    presses: 10,
    samples: 10,
    mean_ms: meanMs,
    errors: 0,
    last_date: "2026-11-01",
    ...more,
  };
}

describe("the heat scales", () => {
  it("measures speed against your own usual key", () => {
    expect(speedStep(120, 145)).toBe(0);
    expect(speedStep(145, 145)).toBe(2);
    expect(speedStep(220, 145)).toBe(5);
    // The same ratio gives the same step, however slow the person is.
    expect(speedStep(600, 725)).toBe(speedStep(120, 145));
  });

  it("keeps errors absolute", () => {
    expect(errorStep(1.2)).toBe(0);
    expect(errorStep(1.5)).toBe(1);
    expect(errorStep(6.4)).toBe(4);
    expect(errorStep(8.4)).toBe(5);
  });

  it("finds a median", () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("keyHeat", () => {
  it("paints a beginner's keyboard in more than one colour", () => {
    const heat = keyHeat([
      key("KeyA", 450),
      key("KeyS", 500),
      key("KeyD", 500),
      key("KeyF", 800),
    ]);
    expect(heat.get("KeyA")?.speed).toBe(1);
    expect(heat.get("KeyS")?.speed).toBe(2);
    expect(heat.get("KeyF")?.speed).toBe(5);
  });

  it("says too few samples below five", () => {
    const heat = keyHeat([
      key("KeyA", 100),
      key("KeyQ", 300, { samples: 4, presses: 4 }),
    ]);
    const few = heat.get("KeyQ");
    expect(few?.ms).toBeNull();
    expect(few?.speed).toBeNull();
    expect(few?.error).toBeNull();
    expect(few?.tip).toBe("Q: too few samples");
  });

  it("can have errors without a time", () => {
    const heat = keyHeat([
      key("KeyQ", 300, { samples: 2, presses: 10, errors: 1 }),
    ]);
    expect(heat.get("KeyQ")?.tip).toBe("Q: too few samples, 10% errors");
    expect(heat.get("KeyQ")?.error).toBe(5);
  });

  it("names Space and writes the errors", () => {
    const heat = keyHeat([key("Space", 90.4, { errors: 1, presses: 40 })]);
    expect(heat.get("Space")?.tip).toBe("Space: 90 ms, 2.5% errors");
  });

  it("ignores other layouts and unknown keys", () => {
    const heat = keyHeat([
      key("KeyA", 100, { layout: "ru" }),
      key("IntlBackslash", 100),
    ]);
    expect(heat.size).toBe(0);
  });
});

describe("fingerHeat", () => {
  it("weighs a key by how often it was timed", () => {
    const fingers = fingerHeat([
      key("KeyS", 100, { samples: 30, presses: 30 }),
      key("KeyW", 200, { samples: 10, presses: 10, errors: 4 }),
    ]);
    const ring = fingers.find((row) => row.finger === "lr");
    expect(ring?.ms).toBe(125);
    expect(ring?.errorPercent).toBe(10);
    expect(ring?.tip).toBe("Left ring: 125 ms, 10% errors");
  });

  it("always has the nine fingers that type, in the order of the hands", () => {
    const fingers = fingerHeat([]);
    expect(fingers.map((row) => row.finger)).toEqual([
      "lp",
      "lr",
      "lm",
      "li",
      "rt",
      "ri",
      "rm",
      "rr",
      "rp",
    ]);
    expect(fingers.every((row) => row.ms === null)).toBe(true);
  });

  it("compares the slowest finger with the fastest, without the thumb", () => {
    const note = fingerNote(
      fingerHeat([
        key("KeyW", 150),
        key("KeyR", 128),
        key("KeyJ", 130),
        key("Space", 80),
      ]),
    );
    expect(note).toBe(
      "Average time to press, in ms. Your left ring finger is 22 ms slower than your left index.",
    );
  });

  it("stays quiet with nothing to compare", () => {
    expect(fingerNote(fingerHeat([key("KeyW", 150), key("Space", 80)]))).toBe(
      "Average time to press, in ms.",
    );
  });
});

describe("transitionMatrix", () => {
  it("has a row and a column for every letter", () => {
    const matrix = transitionMatrix([]);
    expect(matrix).toHaveLength(26);
    expect(matrix[0].cells).toHaveLength(26);
    expect(matrix[0].cells[1].pair).toBe("ab");
    expect(matrix[0].cells[1].tip).toBe("ab: too few samples");
  });

  it("folds capitals into their letters and skips everything else", () => {
    const matrix = transitionMatrix([
      bigram("t", "h", 100, { samples: 3, presses: 3 }),
      bigram("T", "h", 200, { samples: 3, presses: 3, errors: 3 }),
      bigram("t", " ", 900),
    ]);
    const cell = matrix[19].cells[7];
    expect(cell.pair).toBe("th");
    expect(cell.ms).toBe(150);
    expect(cell.errorPercent).toBe(50);
  });

  it("uses the transitions' own median for the steps", () => {
    const matrix = transitionMatrix([
      bigram("a", "a", 100),
      bigram("a", "b", 100),
      bigram("a", "c", 200),
    ]);
    expect(matrix[0].cells[2].speed).toBe(5);
  });
});

describe("slowestTransitions", () => {
  it("keeps the case, shows a space and leaves out line breaks", () => {
    const rows = slowestTransitions([
      bigram("T", "h", 300),
      bigram("e", " ", 400),
      bigram("\n", "a", 900),
      bigram("a", "\n", 900),
      bigram("t", "h", 100),
    ]);
    expect(rows.map((row) => row.gram)).toEqual(["e␣", "Th", "th"]);
  });

  it("needs five samples and stops at the limit", () => {
    const rows = slowestTransitions(
      [
        bigram("a", "b", 900, { samples: 4 }),
        bigram("c", "d", 300),
        bigram("e", "f", 200),
      ],
      1,
    );
    expect(rows.map((row) => row.gram)).toEqual(["cd"]);
  });
});
