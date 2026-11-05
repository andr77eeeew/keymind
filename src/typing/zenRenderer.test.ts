import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZenRenderer } from "./zenRenderer";

function setup() {
  let clock = 0;
  const stream = document.createElement("div");
  const renderer = new ZenRenderer(stream, () => clock);
  return {
    stream,
    renderer,
    text: () => stream.querySelector(".zen__text")?.textContent ?? "",
    caret: () => stream.querySelector(".zen__caret") as HTMLElement,
    hint: () => stream.querySelector(".zen__hint"),
    advance: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

describe("ZenRenderer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with a blinking caret and a hint that leaves on the first press", () => {
    const { renderer, caret, hint } = setup();
    expect(caret().classList.contains("is-idle")).toBe(true);
    expect(hint()?.textContent).toBe("Type anything. Nothing here is scored.");
    renderer.append("a");
    expect(hint()).toBeNull();
    expect(caret().classList.contains("is-idle")).toBe(false);
  });

  it("keeps a new line in the text", () => {
    const { renderer, text } = setup();
    renderer.append("a");
    renderer.append("\n");
    renderer.append("b");
    expect(text()).toBe("a\nb");
  });

  it("blinks only after a pause", () => {
    const { renderer, caret, advance } = setup();
    renderer.append("a");
    advance(900);
    expect(caret().classList.contains("is-idle")).toBe(false);
    advance(600);
    expect(caret().classList.contains("is-idle")).toBe(true);
    renderer.append("b");
    expect(caret().classList.contains("is-idle")).toBe(false);
  });

  it("takes back one character and says when nothing is left", () => {
    const { renderer, text } = setup();
    expect(renderer.backspace()).toBe(false);
    renderer.append("a");
    expect(renderer.backspace()).toBe(true);
    expect(text()).toBe("");
  });

  it("keeps a long session small", () => {
    const { renderer, text, advance } = setup();
    for (let i = 0; i < 8001; i += 1) {
      renderer.append("a");
    }
    advance(0);
    expect(text().length).toBe(4000);
  });

  it("stops its timer when it goes", () => {
    const { renderer, stream } = setup();
    renderer.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(stream.childElementCount).toBe(0);
  });
});
