import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingEngine } from "./engine";
import { chunkEnd, TextRenderer } from "./renderer";

function setup(text: string, onError: "continue" | "stop" = "continue") {
  const windowEl = document.createElement("div");
  const stream = document.createElement("div");
  windowEl.append(stream);
  document.body.append(windowEl);
  const engine = new TypingEngine(text, onError);
  const renderer = new TextRenderer(windowEl, stream, engine);
  const glyph = (i: number): HTMLElement =>
    stream.querySelectorAll<HTMLElement>(".c")[i];
  return { engine, renderer, stream, glyph };
}

describe("chunkEnd", () => {
  it("cuts just after a space, so words stay whole", () => {
    const text = `${"a".repeat(600)} ${"b".repeat(600)}`;
    expect(chunkEnd(text, 0)).toBe(601);
  });

  it("returns the end of a short text", () => {
    expect(chunkEnd("short", 0)).toBe(5);
  });

  it("cuts anyway when a text has no spaces", () => {
    expect(chunkEnd("a".repeat(5000), 0)).toBe(2048);
    expect(chunkEnd("a".repeat(5000), 4000)).toBe(5000);
  });
});

describe("TextRenderer", () => {
  // jsdom has no layout, so every offsetTop is 0. This fakes lines of 60 characters: elements are
  // first measured in text order, which is all the renderer's single measuring pass relies on.
  beforeEach(() => {
    const order = new WeakMap<HTMLElement, number>();
    let next = 0;
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        let id = order.get(this);
        if (id === undefined) {
          id = next;
          next += 1;
          order.set(this, id);
        }
        return Math.floor(id / 60);
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every character of a short text with the cursor on the first", () => {
    const { stream, glyph } = setup("hi there");
    expect(stream.textContent).toBe("hi there");
    expect(glyph(0).className).toBe("c cur");
    expect(glyph(1).className).toBe("c");
  });

  it("keeps a word in a no-wrap group and a space outside it", () => {
    const { stream } = setup("hi there");
    const words = stream.querySelectorAll(".w");
    expect(words).toHaveLength(2);
    expect(words[0].textContent).toBe("hi");
    expect(stream.children[1].textContent).toBe(" ");
  });

  it("lets a very long word break", () => {
    const { stream } = setup("x".repeat(100));
    expect(stream.querySelectorAll(".w")).toHaveLength(0);
  });

  it("moves the text up by whole lines, keeping the cursor on the second", () => {
    const { engine, renderer, stream } = setup("word ".repeat(100));
    expect(stream.style.transform).toBe("translateY(0px)");
    for (let i = 0; i < 125; i += 1) {
      engine.type(engine.text[engine.cursor]);
      renderer.moveCursor(engine.cursor);
    }
    expect(stream.style.transform).toBe("translateY(-1px)");
  });

  it("paints done, error and fixed from the engine", () => {
    const { engine, renderer, glyph } = setup("abc");
    engine.type("a");
    renderer.moveCursor(engine.cursor);
    expect(glyph(0).className).toBe("c done");
    expect(glyph(1).className).toBe("c cur");

    engine.type("x");
    renderer.moveCursor(engine.cursor);
    expect(glyph(1).className).toBe("c err");
    expect(glyph(1).dataset.typed).toBe("x");

    engine.backspace();
    renderer.moveCursor(engine.cursor);
    expect(glyph(1).className).toBe("c cur");
    expect(glyph(1).dataset.typed).toBeUndefined();
    expect(glyph(2).className).toBe("c");

    engine.type("b");
    renderer.moveCursor(engine.cursor);
    expect(glyph(1).className).toBe("c fixed");
  });

  it("shows an error waiting at the cursor in stop mode", () => {
    const { engine, renderer, glyph } = setup("abc", "stop");
    engine.type("x");
    renderer.moveCursor(engine.cursor);
    expect(glyph(0).className).toBe("c err");
    engine.backspace();
    renderer.moveCursor(engine.cursor);
    expect(glyph(0).className).toBe("c cur");
  });

  it("keeps the DOM small on a long text, and the cost flat", async () => {
    const word = "word ";
    const { engine, renderer, stream } = setup(word.repeat(200_000));
    const initial = stream.querySelectorAll(".c").length;
    expect(initial).toBeLessThan(2100);

    for (let i = 0; i < 6000; i += 1) {
      engine.type(engine.text[engine.cursor]);
      renderer.moveCursor(engine.cursor);
      if (i % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stream.querySelectorAll(".c").length).toBeLessThan(2600);
    expect(stream.querySelector(".cur")).not.toBeNull();
    renderer.dispose();
    expect(stream.childElementCount).toBe(0);
  });

  it("brings earlier text back when Backspace goes past the window", async () => {
    const { engine, renderer, stream } = setup("word ".repeat(2000));
    for (let i = 0; i < 3000; i += 1) {
      engine.type(engine.text[engine.cursor]);
      renderer.moveCursor(engine.cursor);
      if (i % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 2500; i += 1) {
      engine.backspace();
      renderer.moveCursor(engine.cursor);
    }
    expect(engine.cursor).toBe(500);
    const current = stream.querySelector(".cur");
    expect(current).not.toBeNull();
    expect(current?.textContent).toBe(engine.text[500]);
  });
});

describe("TextRenderer window height", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function withLines(text: string, full: string) {
    const windowEl = document.createElement("div");
    windowEl.style.setProperty("--lines", full);
    const stream = document.createElement("div");
    windowEl.append(stream);
    document.body.append(windowEl);
    // A style sheet sets the full height in the app, and this stands in for it after the reset.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = real(el);
      return new Proxy(style, {
        get: (target, name) =>
          name === "getPropertyValue"
            ? (property: string) =>
                property === "--lines" &&
                !windowEl.style.getPropertyValue(property)
                  ? full
                  : target.getPropertyValue(property)
            : Reflect.get(target, name),
      });
    });
    new TextRenderer(windowEl, stream, new TypingEngine(text, "continue"));
    return windowEl;
  }

  it("gives a short text a window of its own height", () => {
    // jsdom has no layout, so everything measures as one line.
    const windowEl = withLines("short text", "4");
    expect(windowEl.style.getPropertyValue("--lines")).toBe("1");
    vi.restoreAllMocks();
  });

  it("leaves the full height to a text that is not all in the DOM", () => {
    const windowEl = withLines("word ".repeat(1000), "4");
    expect(windowEl.style.getPropertyValue("--lines")).toBe("");
    vi.restoreAllMocks();
  });
});
