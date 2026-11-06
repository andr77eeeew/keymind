import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPlan } from "../typing/types";
import { useAppStore } from "./app";
import { useSessionStore } from "./session";
import { useTestStore } from "./test";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const WORDS_PLAN: SessionPlan = {
  mode: "words",
  text: "ab",
  source: { kind: "words", seed: 1, pool: 1000, count: 1 },
  detail: "",
};

const TEST_PLAN: SessionPlan = {
  mode: "test",
  text: "the cat",
  source: { kind: "test", passages: ["p1"], seconds: 60 },
  seconds: 60,
  detail: "One minute",
};

describe("the starting test", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
  });

  it("starts as a one-minute session of the passages the core picked", async () => {
    vi.mocked(invoke).mockResolvedValue({ text: "the cat", passages: ["p1"] });
    const store = useSessionStore();
    await store.startTest();
    expect(invoke).toHaveBeenCalledWith("starting_test", {
      seed: expect.any(Number),
    });
    expect(store.plan).toMatchObject(TEST_PLAN);
    expect(useAppStore().screen).toBe("typing");
  });

  it("goes home and says so when it cannot be prepared", async () => {
    vi.mocked(invoke).mockRejectedValue("content is missing");
    const store = useSessionStore();
    useAppStore().onboarding = true;
    await store.startTest();
    expect(store.testFailed).toBe(true);
    expect(useAppStore().screen).toBe("home");
    expect(useAppStore().onboarding).toBe(false);
  });

  it("opens its result, marks the step done and is not a setup to repeat", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) =>
      command === "stats_status" ? { state: "working" } : undefined,
    );
    const store = useSessionStore();
    store.begin(TEST_PLAN);
    await store.ended("t1");
    expect(useAppStore().screen).toBe("test-result");
    expect(useTestStore().sid).toBe("t1");
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "test_done",
      value: true,
    });
    expect(store.home.primary.used.mode).not.toBe("test");
    expect(store.home.others.map((choice) => choice.used.mode)).not.toContain(
      "test",
    );
  });

  it("goes home when skipped, whatever was typed", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const store = useSessionStore();
    useAppStore().onboarding = true;
    store.begin(TEST_PLAN);
    await store.ended("t1", 3, true, true);
    expect(useAppStore().screen).toBe("home");
    expect(useAppStore().onboarding).toBe(false);
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "test_done",
      value: true,
    });
  });
});

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

  it("opens the setup and explains when the text cannot be prepared", async () => {
    vi.mocked(invoke).mockRejectedValue("content is missing");
    const store = useSessionStore();
    store.mode = "texts";
    await store.start();
    expect(store.plan).toBeNull();
    expect(store.startError).toBe(
      "The passage could not be prepared. Nothing was started. Try again or pick another mode.",
    );
    expect(useAppStore().screen).toBe("setup");
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
    store.begin(WORDS_PLAN);
    await store.ended("s");
    expect(invoke).toHaveBeenCalledWith("session_summary", { sid: "s" });
    expect(store.summary).toEqual(summary);
    expect(useAppStore().screen).toBe("summary");
  });

  it("keeps the summary screen working when the summary cannot be read", async () => {
    vi.mocked(invoke).mockRejectedValue("disk");
    const store = useSessionStore();
    store.begin(WORDS_PLAN);
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
    await store.addImports([new File(["text"], "a.txt")]);
    expect(store.importId).toBe("a");
    expect(store.importNotes.a).toContain("3 characters");
    expect(store.importing).toEqual([]);
  });

  it("adds a failed import as a row without losing the library", async () => {
    vi.mocked(invoke).mockRejectedValue("not a book");
    const store = useSessionStore();
    await store.addImports([new File(["x"], "a.epub")]);
    expect(store.failedImports).toMatchObject([
      { name: "a.epub", head: "This file could not be read" },
    ]);
    expect(store.imports).toEqual([]);
  });

  it("reads files one at a time, because each import rewrites the list", async () => {
    const running: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "import_file") {
        running.push("start");
        await gate;
        running.push("end");
        return { id: "a", title: "A", chars: 1, removed: 0, offset: 0 };
      }
      return [];
    });
    const store = useSessionStore();
    const first = store.addImports([new File(["1"], "1.txt")]);
    const second = store.addImports([new File(["2"], "2.txt")]);
    expect(store.importing).toEqual(["1.txt", "2.txt"]);
    await vi.waitFor(() => expect(running).toEqual(["start"]));
    release();
    await Promise.all([first, second]);
    expect(running).toEqual(["start", "end", "start", "end"]);
  });

  it("starts a remembered setup, and opens the setup of one that cannot start", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(
        command === "last_setups"
          ? [
              {
                mode: "texts",
                sid: "s",
                ts: "2026-11-04T12:00:00+02:00",
                source: { kind: "paste", chars: 5 },
                this_device: true,
              },
            ]
          : command === "stats_status"
            ? { state: "idle" }
            : command === "generate_words"
              ? "some words"
              : [],
      ),
    );
    const store = useSessionStore();
    await store.loadHome();
    expect(store.home.primary.noRepeat?.heading).toBe("Paste a new text");

    await store.startChoice(store.home.primary);
    expect(useAppStore().screen).toBe("setup");
    expect(store.mode).toBe("texts");
    expect(store.textSource).toBe("paste");

    const words = store.home.others.find((row) => row.name === "Words");
    await store.startChoice(words as (typeof store.home.others)[number]);
    expect(useAppStore().screen).toBe("typing");
    expect(store.plan?.mode).toBe("words");
  });

  it("waits for a rebuild before it believes the setups", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(
        command === "stats_status" ? { state: "rebuilding" } : [],
      ),
    );
    const store = useSessionStore();
    await store.loadHome();
    expect(store.setupsState).toBe("loading");
    expect(store.firstSession).toBe(false);

    store.statusChanged({ state: "idle" });
    await vi.waitFor(() => expect(store.setupsState).toBe("ready"));
    expect(store.firstSession).toBe(true);
  });

  it("shows the default setup when the setups cannot be read", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      command === "stats_status"
        ? Promise.resolve({ state: "failed", message: "disk" })
        : Promise.resolve([]),
    );
    const store = useSessionStore();
    await store.loadHome();
    expect(store.setupsState).toBe("error");
    expect(store.home.primary.line).toBe("The brain picks the session");
  });

  it("remembers a session that just ended, before the projector reaches it", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(
        command === "stats_status"
          ? { state: "idle" }
          : command === "session_summary"
            ? { sid: "s" }
            : [],
      ),
    );
    const store = useSessionStore();
    await store.loadHome();
    store.begin({ ...WORDS_PLAN, mode: "zen", source: { kind: "zen" } });
    await store.ended("s");
    expect(store.home.primary.name).toBe("Zen");
  });

  it("says nothing about figures when the last events are not on the disk", async () => {
    const store = useSessionStore();
    store.begin(WORDS_PLAN);
    await store.ended("s", 1, false);
    expect(store.summaryFailed).toBe(true);
    expect(store.endedSession?.saved).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("session_summary", { sid: "s" });
  });
});
