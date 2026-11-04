import { invoke } from "@tauri-apps/api/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./app";

// The Tauri bridge exists only inside the desktop webview, so tests replace it.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("app store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(invoke).mockReset();
  });

  it("stores the core info on success", async () => {
    vi.mocked(invoke).mockResolvedValue({ name: "keymind", version: "1.2.3" });
    const app = useAppStore();

    await app.loadInfo();

    expect(invoke).toHaveBeenCalledWith("app_info");
    expect(app.info).toEqual({ name: "keymind", version: "1.2.3" });
    expect(app.error).toBeNull();
  });

  it("keeps the app usable and reports the error on failure", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("bridge is down"));
    const app = useAppStore();

    await app.loadInfo();

    expect(app.info).toBeNull();
    expect(app.error).toContain("bridge is down");
  });
});
