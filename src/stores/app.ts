import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { ref } from "vue";

/** Mirrors `commands::AppInfo` in the Rust core. */
export interface AppInfo {
  name: string;
  version: string;
}

export const useAppStore = defineStore("app", () => {
  const info = ref<AppInfo | null>(null);
  const error = ref<string | null>(null);

  async function loadInfo(): Promise<void> {
    try {
      info.value = await invoke<AppInfo>("app_info");
      error.value = null;
    } catch (cause) {
      info.value = null;
      error.value = String(cause);
    }
  }

  return { info, error, loadInfo };
});
