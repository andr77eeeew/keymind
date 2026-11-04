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

function applyTheme(theme: Settings["theme"]): void {
  document.documentElement.dataset.theme = theme;
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>({ ...DEFAULTS });
  const error = ref<string | null>(null);

  function accept(next: Settings): void {
    settings.value = next;
    error.value = null;
    applyTheme(next.theme);
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
