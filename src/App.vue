<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { defineAsyncComponent, onBeforeUnmount, onMounted } from "vue";
import { useAppStore } from "./stores/app";
import { useBrainStore } from "./stores/brain";
import { useSessionStore } from "./stores/session";
import { useStatsStore } from "./stores/stats";
import { finishActiveSession } from "./typing/active";
import { onStatsStatus } from "./typing/api";
import BrainView from "./views/BrainView.vue";
import HomeView from "./views/HomeView.vue";
import OnboardingView from "./views/OnboardingView.vue";
import PastSummaryView from "./views/PastSummaryView.vue";
import SettingsView from "./views/SettingsView.vue";
import SetupView from "./views/SetupView.vue";
import SummaryView from "./views/SummaryView.vue";
import TypingView from "./views/TypingView.vue";

// The charts are the only heavy part of the UI, so the start and the typing screen never load them.
const StatisticsView = defineAsyncComponent(
  () => import("./views/StatisticsView.vue"),
);

const app = useAppStore();
const session = useSessionStore();
const stats = useStatsStore();
const brain = useBrainStore();

let stopListening: (() => void) | null = null;
let stopStatus: (() => void) | null = null;

onMounted(async () => {
  void app.loadInfo();

  // Listening comes first, so a rebuild that ends during the first read is not missed.
  try {
    stopStatus = await onStatsStatus((status) => {
      session.statusChanged(status);
      stats.statusChanged(status);
      brain.statusChanged(status);
    });
  } catch {
    // Outside Tauri there are no events.
  }
  void session.loadHome();

  if (import.meta.env.VITE_LATENCY_PROBE) {
    (window as unknown as Record<string, unknown>).__keymindStart = (
      text: string,
      mode?: "zen",
    ) =>
      session.begin(
        mode === "zen"
          ? {
              mode,
              text: "",
              source: { kind: "zen" },
              detail: "",
            }
          : {
              mode: "texts",
              text,
              source: { kind: "paste", chars: text.length },
              detail: "Latency bench",
            },
      );
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
  stopStatus?.();
});
</script>

<template>
  <OnboardingView v-if="app.screen === 'onboarding'" />
  <TypingView v-else-if="app.screen === 'typing'" />
  <SummaryView v-else-if="app.screen === 'summary'" />
  <StatisticsView v-else-if="app.screen === 'statistics'" />
  <PastSummaryView v-else-if="app.screen === 'past'" />
  <SettingsView v-else-if="app.screen === 'settings'" />
  <BrainView v-else-if="app.screen === 'brain'" />
  <SetupView v-else-if="app.screen === 'setup'" />
  <HomeView v-else />
</template>
