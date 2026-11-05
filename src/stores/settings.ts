import { defineStore } from "pinia";
import { ref } from "vue";
import { getSettings, setSetting } from "../typing/api";
import type { Settings, Theme } from "../typing/types";

/** Used until the core answers, and if it never does. Mirrors `Settings::default`. */
const DEFAULTS: Settings = {
  on_error: "continue",
  backspace: "allowed",
  theme: "system",
  live_figures: true,
  theme_chosen: false,
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>({ ...DEFAULTS });
  const error = ref<string | null>(null);
  /** A theme tried on the first-launch step, shown before it is saved. */
  const preview = ref<Theme | null>(null);
  /** What Windows is set to now, for the System card. */
  const systemDark = ref(false);
  let systemScheme: MediaQueryList | null = null;

  function watchSystem(): void {
    if (systemScheme || typeof window.matchMedia !== "function") {
      return;
    }
    // Windows can change its scheme while the app runs, so this stays for the life of the app. For
    // a fixed theme it just repaints the same value.
    systemScheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemScheme.addEventListener("change", paint);
  }

  /** The tokens only know light and dark, so "system" is resolved here to one of them. */
  function paint(): void {
    watchSystem();
    systemDark.value = systemScheme?.matches ?? false;
    const theme = preview.value ?? settings.value.theme;
    const dark = theme === "dark" || (theme === "system" && systemDark.value);
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.figures = settings.value.live_figures ? "on" : "off";
  }

  function accept(next: Settings): void {
    settings.value = next;
    error.value = null;
    paint();
  }

  async function load(): Promise<void> {
    try {
      accept(await getSettings());
    } catch (cause) {
      // The app stays usable on the defaults.
      error.value = String(cause);
      paint();
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

  function tryTheme(theme: Theme): void {
    preview.value = theme;
    paint();
  }

  /**
   * Saves the first-launch choice. If that fails, the theme stays for this launch through the
   * preview, and the missing flag brings the step back next time.
   */
  async function chooseTheme(theme: Theme): Promise<boolean> {
    tryTheme(theme);
    try {
      await setSetting("theme", theme);
      const next = await setSetting("theme_chosen", true);
      preview.value = null;
      accept(next);
      return true;
    } catch (cause) {
      error.value = String(cause);
      return false;
    }
  }

  return {
    settings,
    error,
    systemDark,
    paint,
    load,
    change,
    tryTheme,
    chooseTheme,
  };
});
