import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./app";
import { useBrainStore } from "./brain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const TARGET = {
  gram: "e",
  before_ms: 412,
  presses: 30,
  samples: 25,
  ms: 388,
  errors: 1,
};

/** Answers the core the way the projector would: `status` and the session row as it stands. */
function core(state: { status: string; reason: string | null }) {
  vi.mocked(invoke).mockImplementation(async (command: string) => {
    if (command === "stats_status") {
      return { state: state.status };
    }
    if (command === "stats_session") {
      return { sid: "s1", reason: state.reason, targets: [TARGET] };
    }
    if (command === "brain_next") {
      return { focus: "e", informed: true };
    }
    throw new Error(`unexpected ${command}`);
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe("brain store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
  });

  it("waits for the projector to reach the end of the session", async () => {
    const state = { status: "working", reason: null as string | null };
    core(state);
    const brain = useBrainStore();

    brain.followEnded("s1");
    await settle();
    expect(brain.endedState).toBe("loading");

    // Idle, but the end line is not projected yet: the row has no reason.
    state.status = "idle";
    brain.statusChanged({ state: "idle" });
    await settle();
    expect(brain.endedTargets).toBeNull();

    state.reason = "completed";
    brain.statusChanged({ state: "idle" });
    await settle();
    expect(brain.endedState).toBe("ready");
    expect(brain.endedTargets).toEqual([TARGET]);
  });

  it("reports a failed projector instead of loading forever", async () => {
    core({ status: "working", reason: null });
    const brain = useBrainStore();
    brain.followEnded("s1");
    await settle();
    brain.statusChanged({ state: "failed", message: "disk" });
    expect(brain.endedState).toBe("error");
    expect(brain.nextState).toBe("error");
  });

  it("reads the next session only for the screen in front", async () => {
    core({ status: "idle", reason: null });
    const app = useAppStore();
    const brain = useBrainStore();

    app.go("typing");
    brain.statusChanged({ state: "idle" });
    await settle();
    expect(invoke).not.toHaveBeenCalled();

    app.go("brain");
    brain.statusChanged({ state: "idle" });
    await settle();
    expect(brain.nextState).toBe("ready");
    expect(brain.next?.focus).toBe("e");
  });

  it("calls an uninformed answer an error, so a guess is not shown as knowledge", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) =>
      command === "stats_status"
        ? { state: "idle" }
        : { focus: "e", informed: false },
    );
    const brain = useBrainStore();
    brain.showNext();
    await settle();
    expect(brain.nextState).toBe("error");
  });
});
