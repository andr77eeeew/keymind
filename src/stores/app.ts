import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { ref } from "vue";

/** Mirrors `commands::AppInfo` in the Rust core. */
export interface AppInfo {
  name: string;
  version: string;
}

/** A handful of screens with no deep links, so a router would add nothing yet. */
export type Screen =
  | "onboarding"
  | "home"
  | "setup"
  | "typing"
  | "summary"
  | "statistics"
  | "past"
  | "brain"
  | "test-result"
  | "settings";

export const useAppStore = defineStore("app", () => {
  const info = ref<AppInfo | null>(null);
  const error = ref<string | null>(null);
  const screen = ref<Screen>("home");
  /** Where a saved summary goes back to, which is also what the menu marks while it is open. */
  const pastFrom = ref<Screen>("home");
  /**
   * The first launch, from the theme to the first session. The steps show only while it lasts, and
   * the test belongs to it when `testStep` is set.
   */
  const onboarding = ref(false);
  const testStep = ref(false);

  async function loadInfo(): Promise<void> {
    try {
      info.value = await invoke<AppInfo>("app_info");
      error.value = null;
    } catch (cause) {
      info.value = null;
      error.value = String(cause);
    }
  }

  function go(next: Screen): void {
    screen.value = next;
  }

  return {
    info,
    error,
    screen,
    pastFrom,
    onboarding,
    testStep,
    loadInfo,
    go,
  };
});
