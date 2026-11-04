import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "./settings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("settings store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
    delete document.documentElement.dataset.theme;
  });

  it("applies the theme it loads", async () => {
    vi.mocked(invoke).mockResolvedValue({
      on_error: "stop",
      backspace: "allowed",
      theme: "dark",
    });
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.on_error).toBe("stop");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("stays on the defaults when the core does not answer", async () => {
    vi.mocked(invoke).mockRejectedValue("no core");
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.theme).toBe("light");
    expect(store.error).toContain("no core");
  });

  it("takes the new value from the core, not from the request", async () => {
    vi.mocked(invoke).mockResolvedValue({
      on_error: "continue",
      backspace: "blocked",
      theme: "light",
    });
    const store = useSettingsStore();
    await store.change("backspace", "blocked");
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "backspace",
      value: "blocked",
    });
    expect(store.settings.backspace).toBe("blocked");
  });

  it("keeps the old value when a change fails", async () => {
    vi.mocked(invoke).mockRejectedValue("disk");
    const store = useSettingsStore();
    await store.change("backspace", "blocked");
    expect(store.settings.backspace).toBe("allowed");
    expect(store.error).toContain("disk");
  });
});
