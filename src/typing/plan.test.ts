import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookOf, buildPlan, PlanError } from "./plan";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("buildPlan", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("asks for the words and journals the seed that made them", async () => {
    vi.mocked(invoke).mockResolvedValue("one two");
    const plan = await buildPlan(
      { mode: "words", by: "count", count: 2, pool: 200 },
      7,
    );
    expect(invoke).toHaveBeenCalledWith("generate_words", {
      pool: 200,
      count: 2,
      seed: 7,
    });
    expect(plan).toMatchObject({
      mode: "words",
      text: "one two",
      source: { kind: "words", seed: 7, pool: 200, count: 2 },
    });
    expect(plan.seconds).toBeUndefined();
  });

  it("gives a timed session more words than the limit can use", async () => {
    vi.mocked(invoke).mockResolvedValue("words");
    const plan = await buildPlan(
      { mode: "words", by: "time", seconds: 30, pool: 1000 },
      1,
    );
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ count: 800 });
    expect(plan.seconds).toBe(30);
    expect(plan.source).toMatchObject({ seconds: 30 });
  });

  it("uses the cleaned text of a paste and counts its characters", async () => {
    vi.mocked(invoke).mockResolvedValue({ text: "clean", removed: 2 });
    const plan = await buildPlan({ mode: "paste", text: "clфeanф" });
    expect(plan.text).toBe("clean");
    expect(plan.source).toEqual({ kind: "paste", chars: 5 });
  });

  it("refuses a paste with nothing to type", async () => {
    vi.mocked(invoke).mockResolvedValue({ text: "", removed: 3 });
    await expect(buildPlan({ mode: "paste", text: "ффф" })).rejects.toThrow(
      PlanError,
    );
  });

  it("continues an import where it stopped", async () => {
    vi.mocked(invoke).mockResolvedValue("abcdef");
    const plan = await buildPlan({
      mode: "import",
      item: { id: "x", title: "Book", chars: 6, removed: 0, offset: 2 },
    });
    expect(plan.text).toBe("cdef");
    expect(plan.importOffset).toBe(2);
    expect(plan.source).toEqual({ kind: "import", id: "x", offset: 2 });
  });

  it("starts a finished import over", async () => {
    vi.mocked(invoke).mockResolvedValue("abc");
    const plan = await buildPlan({
      mode: "import",
      item: { id: "x", title: "Book", chars: 3, removed: 0, offset: 3 },
    });
    expect(plan.text).toBe("abc");
    expect(plan.importOffset).toBe(0);
  });

  it("needs no text for Zen", async () => {
    const plan = await buildPlan({ mode: "zen" });
    expect(plan).toMatchObject({
      mode: "zen",
      text: "",
      source: { kind: "zen" },
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("bookOf", () => {
  it("reads the author and the title of a passage", () => {
    expect(bookOf("Jane Austen, Pride and Prejudice (1813)")).toEqual({
      author: "Jane Austen",
      title: "Pride and Prejudice",
    });
  });

  it("keeps a comma inside a title", () => {
    expect(
      bookOf("Mary Shelley, Frankenstein, or The Prometheus (1818)"),
    ).toEqual({
      author: "Mary Shelley",
      title: "Frankenstein, or The Prometheus",
    });
  });

  it("gives nothing for another form", () => {
    expect(bookOf("Anonymous")).toBeNull();
  });
});

describe("buildPlan for the screens", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("names the setup in the panel", async () => {
    vi.mocked(invoke).mockResolvedValue("words");
    const counted = await buildPlan({
      mode: "words",
      by: "count",
      count: 25,
      pool: 1000,
    });
    expect(counted.detail).toBe("25 words, top 1,000");
    const timed = await buildPlan({
      mode: "words",
      by: "time",
      seconds: 60,
      pool: 1000,
    });
    expect(timed.detail).toBe("60 seconds, top 1,000");
  });

  it("names a passage and journals the difficulty it asked for", async () => {
    vi.mocked(invoke).mockResolvedValue({
      id: "p1",
      text: "abc",
      source: "Jane Austen, Pride and Prejudice (1813)",
      difficulty: 2,
    });
    const asked = await buildPlan({ mode: "passage", difficulty: 2 });
    expect(asked.detail).toBe("Pride and Prejudice");
    expect(asked.caption).toBe(
      "Jane Austen, Pride and Prejudice (1813). Public domain.",
    );
    expect(asked.source).toEqual({ kind: "passage", id: "p1", difficulty: 2 });

    const any = await buildPlan({ mode: "passage", difficulty: null });
    expect(any.source).toEqual({ kind: "passage", id: "p1" });
  });

  it("knows how long a file is, for the reading progress", async () => {
    vi.mocked(invoke).mockResolvedValue("abcdef");
    const plan = await buildPlan({
      mode: "import",
      item: { id: "x", title: "Book", chars: 6, removed: 0, offset: 2 },
    });
    expect(plan.importChars).toBe(6);
    expect(plan.detail).toBe("Book");
  });
});
