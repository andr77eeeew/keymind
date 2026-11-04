<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onBeforeUnmount, onMounted } from "vue";
import { useAppStore } from "./stores/app";
import { useSessionStore } from "./stores/session";
import { useSettingsStore } from "./stores/settings";
import { finishActiveSession } from "./typing/active";
import HomeView from "./views/HomeView.vue";
import SettingsView from "./views/SettingsView.vue";
import SummaryView from "./views/SummaryView.vue";
import TypingView from "./views/TypingView.vue";

const app = useAppStore();
const session = useSessionStore();
const settings = useSettingsStore();

let stopListening: (() => void) | null = null;

onMounted(async () => {
  void app.loadInfo();
  void settings.load();

  if (import.meta.env.VITE_LATENCY_PROBE) {
    (window as unknown as Record<string, unknown>).__keymindStart = (
      text: string,
    ) =>
      session.begin({
        mode: "texts",
        text,
        source: { kind: "paste", chars: text.length },
        detail: "Latency bench",
      });
  }

  // The window closes on its own once this returns, and Tauri destroys it.
  try {
    stopListening = await getCurrentWindow().onCloseRequested(() =>
      finishActiveSession(),
    );
  } catch {
    // Outside Tauri there is no window to watch.
  }
});

onBeforeUnmount(() => {
  stopListening?.();
});
</script>

<template>
  <TypingView v-if="app.screen === 'typing'" />
  <SummaryView v-else-if="app.screen === 'summary'" />
  <SettingsView v-else-if="app.screen === 'settings'" />
  <HomeView v-else />
</template>
