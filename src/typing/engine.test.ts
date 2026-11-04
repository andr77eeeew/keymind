import { describe, expect, it } from "vitest";
import { DONE, ERROR, FIXED, TypingEngine, UPCOMING } from "./engine";

describe("TypingEngine in keep-going mode", () => {
  it("advances on a correct key", () => {
    const engine = new TypingEngine("ab", "continue");
    expect(engine.type("a")).toEqual({ pos: 0, expected: "a", correct: true });
    expect(engine.stateAt(0)).toBe(DONE);
    expect(engine.cursor).toBe(1);
  });

  it("marks a wrong key and advances, keeping what was typed", () => {
    const engine = new TypingEngine("ab", "continue");
    expect(engine.type("x")).toEqual({ pos: 0, expected: "a", correct: false });
    expect(engine.stateAt(0)).toBe(ERROR);
    expect(engine.wrongCharAt(0)).toBe("x");
    expect(engine.cursor).toBe(1);
  });

  it("finishes at the end and ignores further keys", () => {
    const engine = new TypingEngine("a", "continue");
    expect(engine.finished).toBe(false);
    engine.type("a");
    expect(engine.finished).toBe(true);
    expect(engine.type("a")).toBeNull();
  });

  it("clears on Backspace and remembers the error when retyped", () => {
    const engine = new TypingEngine("ab", "continue");
    engine.type("x");
    expect(engine.backspace()).toBe(0);
    expect(engine.cursor).toBe(0);
    expect(engine.stateAt(0)).toBe(UPCOMING);
    expect(engine.wrongCharAt(0)).toBeUndefined();
    engine.type("a");
    expect(engine.stateAt(0)).toBe(FIXED);
  });

  it("does nothing on Backspace at the start", () => {
    const engine = new TypingEngine("ab", "continue");
    expect(engine.backspace()).toBeNull();
  });

  it("can go wrong again after a correction", () => {
    const engine = new TypingEngine("ab", "continue");
    engine.type("x");
    engine.backspace();
    engine.type("y");
    expect(engine.stateAt(0)).toBe(ERROR);
    expect(engine.wrongCharAt(0)).toBe("y");
  });

  it("does not depend on the length of the text", () => {
    const engine = new TypingEngine("a".repeat(1_000_000), "continue");
    for (let i = 0; i < 1000; i += 1) {
      engine.type("a");
    }
    expect(engine.cursor).toBe(1000);
  });
});

describe("TypingEngine in stop mode", () => {
  it("stays on a wrong key until the right one, then marks it fixed", () => {
    const engine = new TypingEngine("ab", "stop");
    engine.type("x");
    expect(engine.cursor).toBe(0);
    expect(engine.stateAt(0)).toBe(ERROR);
    engine.type("y");
    expect(engine.wrongCharAt(0)).toBe("y");
    expect(engine.type("a")?.correct).toBe(true);
    expect(engine.cursor).toBe(1);
    expect(engine.stateAt(0)).toBe(FIXED);
    expect(engine.wrongCharAt(0)).toBeUndefined();
  });

  it("clears a waiting error with Backspace without moving back", () => {
    const engine = new TypingEngine("ab", "stop");
    engine.type("a");
    engine.type("x");
    expect(engine.backspace()).toBe(1);
    expect(engine.cursor).toBe(1);
    expect(engine.stateAt(1)).toBe(UPCOMING);
    expect(engine.stateAt(0)).toBe(DONE);
    expect(engine.backspace()).toBe(0);
    expect(engine.cursor).toBe(0);
  });
});
