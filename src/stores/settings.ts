import { defineStore } from "pinia";
import { ref } from "vue";
import { getSettings, setSetting } from "../typing/api";
import type { Settings } from "../typing/types";

/** Used until the core answers, and if it never does. Mirrors `Settings::default`. */
const DEFAULTS: Settings = {
  on_error: "continue",
  backspace: "allowed",
  theme: "light",
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>({ ...DEFAULTS });
  const error = ref<string | null>(null);
  let systemScheme: MediaQueryList | null = null;

  /** The tokens only know light and dark, so "system" is resolved here to one of them. */
  function paintTheme(): void {
    const { theme } = settings.value;
    const dark =
      theme === "dark" || (theme === "system" && systemScheme?.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  function accept(next: Settings): void {
    settings.value = next;
    error.value = null;
    if (next.theme === "system" && !systemScheme) {
      // Windows can change its scheme while the app runs, and the listener follows that. For any
      // other choice it just repaints the same value, so it stays for the life of the app.
      systemScheme = window.matchMedia("(prefers-color-scheme: dark)");
      systemScheme.addEventListener("change", paintTheme);
    }
    paintTheme();
  }

  async function load(): Promise<void> {
    try {
      accept(await getSettings());
    } catch (cause) {
      // The app stays usable on the defaults.
      error.value = String(cause);
    }
  }

  async function change<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ): Promise<void> {
    try {
      accept(await setSetting(key, value));
    } catch (cause) {
      error.value = String(cause);
    }
  }

  return { settings, error, load, change };
});
