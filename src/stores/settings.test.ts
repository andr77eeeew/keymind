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
    delete document.documentElement.dataset.figures;
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

  it("follows Windows while the theme is system, and only then", async () => {
    const listeners: (() => void)[] = [];
    const scheme = {
      matches: true,
      addEventListener: (_: string, listener: () => void) =>
        listeners.push(listener),
    };
    vi.stubGlobal("matchMedia", () => scheme);
    const answer = (theme: string) =>
      vi.mocked(invoke).mockResolvedValue({
        on_error: "continue",
        backspace: "allowed",
        theme,
      });
    const store = useSettingsStore();

    answer("system");
    await store.load();
    expect(document.documentElement.dataset.theme).toBe("dark");

    scheme.matches = false;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("light");

    answer("dark");
    await store.change("theme", "dark");
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("dark");

    vi.unstubAllGlobals();
  });

  it("stays on the defaults when the core does not answer", async () => {
    vi.mocked(invoke).mockRejectedValue("no core");
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.theme).toBe("system");
    expect(store.settings.live_figures).toBe(true);
    expect(store.error).toContain("no core");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.figures).toBe("on");
  });

  it("marks the page when live figures are off", async () => {
    vi.mocked(invoke).mockResolvedValue({
      on_error: "continue",
      backspace: "allowed",
      theme: "light",
      live_figures: false,
    });
    const store = useSettingsStore();
    await store.load();
    expect(document.documentElement.dataset.figures).toBe("off");
  });

  it("shows a tried theme at once and saves it only on request", async () => {
    const store = useSettingsStore();
    store.tryTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(invoke).not.toHaveBeenCalled();
    expect(store.settings.theme).toBe("system");
  });

  it("saves the choice and the flag, in that order", async () => {
    vi.mocked(invoke).mockImplementation((_, args) => {
      const { key, value } = args as { key: string; value: unknown };
      return Promise.resolve({
        theme: "dark",
        theme_chosen: key === "theme_chosen" && value,
      });
    });
    const store = useSettingsStore();
    expect(await store.chooseTheme("dark")).toBe(true);
    expect(vi.mocked(invoke).mock.calls.map((call) => call[1])).toEqual([
      { key: "theme", value: "dark" },
      { key: "theme_chosen", value: true },
    ]);
    expect(store.settings.theme_chosen).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps a choice for this launch when it cannot be saved", async () => {
    vi.mocked(invoke).mockRejectedValue("disk");
    const store = useSettingsStore();
    expect(await store.chooseTheme("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(store.settings.theme_chosen).toBe(false);
    expect(store.error).toContain("disk");
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
