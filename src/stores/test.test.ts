import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestStore } from "./test";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const KEY = {
  layout: "en-qwerty",
  code: "KeyE",
  presses: 30,
  samples: 25,
  mean_ms: 210,
  errors: 1,
};

/** Answers the core the way the projector would: `status` and the session row as it stands. */
function core(state: { status: string; reason: string | null }) {
  vi.mocked(invoke).mockImplementation(async (command: string) => {
    if (command === "stats_status") {
      return { state: state.status };
    }
    if (command === "stats_session") {
      return { sid: "t1", reason: state.reason, wpm: 40 };
    }
    if (command === "session_keys") {
      return [KEY];
    }
    throw new Error(`unexpected ${command}`);
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

describe("test result store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
  });

  it("waits for the projector to reach the end of the test", async () => {
    const state = { status: "working", reason: null as string | null };
    core(state);
    const test = useTestStore();
    test.follow("t1", true);
    await settle();
    expect(test.state).toBe("loading");

    state.status = "idle";
    test.statusChanged({ state: "idle" });
    await settle();
    expect(test.state).toBe("loading");

    state.reason = "completed";
    test.statusChanged({ state: "idle" });
    await settle();
    expect(test.state).toBe("ready");
    expect(test.keys).toEqual([KEY]);
    expect(test.row?.wpm).toBe(40);
  });

  it("reports a failed projector, and reads again after a rebuild", async () => {
    const state = { status: "working", reason: "completed" as string | null };
    core(state);
    const test = useTestStore();
    test.follow("t1", true);
    await settle();
    test.statusChanged({ state: "failed", message: "disk" });
    expect(test.state).toBe("error");

    state.status = "idle";
    test.statusChanged({ state: "idle" });
    await settle();
    expect(test.state).toBe("ready");
  });

  it("does not wait for a test whose end was not saved", async () => {
    core({ status: "idle", reason: null });
    const test = useTestStore();
    test.follow("t1", false);
    test.statusChanged({ state: "idle" });
    await settle();
    expect(test.state).toBe("error");
    expect(test.unsaved).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
});
