import { describe, expect, it } from "vitest";
import { classifyKey, HeldModifiers, type KeyInput } from "./classify";

function input(overrides: Partial<KeyInput>): KeyInput {
  return {
    code: "KeyA",
    key: "a",
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("classifyKey", () => {
  it("takes printable ASCII as typing, including space and capitals", () => {
    expect(classifyKey(input({}))).toEqual({ action: "char", key: "a" });
    expect(classifyKey(input({ code: "Space", key: " " }))).toEqual({
      action: "char",
      key: " ",
    });
    expect(classifyKey(input({ key: "A" }))).toEqual({
      action: "char",
      key: "A",
    });
    expect(classifyKey(input({ code: "Digit1", key: "!" }))).toEqual({
      action: "char",
      key: "!",
    });
  });

  it("reports another alphabet as a layout problem", () => {
    expect(classifyKey(input({ key: "ф" }))).toEqual({
      action: "layout",
      key: "ф",
    });
    expect(classifyKey(input({ code: "Backquote", key: "ё" })).action).toBe(
      "layout",
    );
  });

  it("blocks browser shortcuts and never counts them as typing", () => {
    for (const keys of [
      { ctrlKey: true, key: "r" },
      { metaKey: true },
      { key: "F5" },
    ]) {
      expect(classifyKey(input(keys))).toEqual({ action: "none", block: true });
    }
  });

  it("leaves Alt combinations alone, so Alt+F4 still closes the window", () => {
    expect(classifyKey(input({ altKey: true, code: "F4", key: "F4" }))).toEqual(
      {
        action: "none",
        block: false,
      },
    );
  });

  it("ignores AltGr and dead keys", () => {
    expect(
      classifyKey(input({ ctrlKey: true, altKey: true, key: "@" })).action,
    ).toBe("none");
    expect(classifyKey(input({ key: "Dead" })).action).toBe("none");
    expect(classifyKey(input({ key: "Process" })).action).toBe("none");
  });

  it("ignores auto-repeat except for Backspace", () => {
    expect(classifyKey(input({ repeat: true })).action).toBe("none");
    expect(
      classifyKey(input({ repeat: true, code: "Backspace", key: "Backspace" }))
        .action,
    ).toBe("backspace");
    expect(
      classifyKey(input({ repeat: true, code: "ShiftLeft", key: "Shift" }))
        .action,
    ).toBe("none");
  });

  it("names modifiers and Escape", () => {
    expect(classifyKey(input({ code: "ShiftLeft", key: "Shift" })).action).toBe(
      "modifier",
    );
    expect(classifyKey(input({ code: "Escape", key: "Escape" })).action).toBe(
      "escape",
    );
  });

  it("blocks Tab, which would move the focus", () => {
    expect(classifyKey(input({ code: "Tab", key: "Tab" }))).toEqual({
      action: "none",
      block: true,
    });
  });

  it("names Enter, which only Zen uses, and ignores a held one", () => {
    expect(classifyKey(input({ code: "Enter", key: "Enter" }))).toEqual({
      action: "enter",
    });
    expect(
      classifyKey(input({ code: "Enter", key: "Enter", repeat: true })).action,
    ).toBe("none");
  });
});

describe("HeldModifiers", () => {
  it("tracks left and right separately and ignores other keys", () => {
    const held = new HeldModifiers();
    expect(held.snapshot()).toBeUndefined();
    held.press("ShiftLeft");
    held.press("ShiftLeft");
    held.press("KeyA");
    expect(held.snapshot()).toEqual(["ShiftLeft"]);
    held.press("ShiftRight");
    held.release("ShiftLeft");
    expect(held.snapshot()).toEqual(["ShiftRight"]);
  });

  it("leaves a modifier out of its own press", () => {
    const held = new HeldModifiers();
    held.press("ShiftLeft");
    expect(held.snapshot("ShiftLeft")).toBeUndefined();
  });

  it("forgets everything on reset", () => {
    const held = new HeldModifiers();
    held.press("AltLeft");
    held.reset();
    expect(held.snapshot()).toBeUndefined();
  });
});
