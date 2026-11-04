import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./app";
import { useSessionStore } from "./session";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
  });

  it("opens the typing screen with the plan", async () => {
    vi.mocked(invoke).mockResolvedValue("some words");
    const store = useSessionStore();
    await store.start();
    expect(store.plan?.text).toBe("some words");
    expect(useAppStore().screen).toBe("typing");
  });

  it("stays home and explains when the text cannot be prepared", async () => {
    vi.mocked(invoke).mockRejectedValue("content is missing");
    const store = useSessionStore();
    await store.start();
    expect(store.plan).toBeNull();
    expect(store.startError).toContain("content is missing");
    expect(useAppStore().screen).toBe("home");
  });

  it("asks for a file when none is chosen", async () => {
    const store = useSessionStore();
    store.mode = "texts";
    store.textSource = "import";
    await store.start();
    expect(store.startError).toBe("Choose a file first.");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("goes home when nothing was typed", async () => {
    const store = useSessionStore();
    await store.ended(null);
    expect(useAppStore().screen).toBe("home");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows the summary of a session", async () => {
    const summary = { sid: "s", wpm: 50 };
    vi.mocked(invoke).mockResolvedValue(summary);
    const store = useSessionStore();
    await store.ended("s");
    expect(invoke).toHaveBeenCalledWith("session_summary", { sid: "s" });
    expect(store.summary).toEqual(summary);
    expect(useAppStore().screen).toBe("summary");
  });

  it("keeps the summary screen working when the summary cannot be read", async () => {
    vi.mocked(invoke).mockRejectedValue("disk");
    const store = useSessionStore();
    await store.ended("s");
    expect(store.summaryFailed).toBe(true);
    expect(useAppStore().screen).toBe("summary");
  });

  it("selects a new import and reports what was left out", async () => {
    const item = { id: "a", title: "A", chars: 9, removed: 3, offset: 0 };
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(command === "import_file" ? item : [item]),
    );
    const store = useSessionStore();
    await store.addImport(new File(["text"], "a.txt"));
    expect(store.importId).toBe("a");
    expect(store.importNote).toContain("3 characters");
  });

  it("reports a failed import without losing the library", async () => {
    vi.mocked(invoke).mockRejectedValue("not a book");
    const store = useSessionStore();
    await store.addImport(new File(["x"], "a.epub"));
    expect(store.importError).toContain("not a book");
    expect(store.imports).toEqual([]);
  });
});
