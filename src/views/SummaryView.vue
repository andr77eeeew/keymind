<script setup lang="ts">
import { computed } from "vue";
import AppShell from "../components/AppShell.vue";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";

const app = useAppStore();
const session = useSessionStore();

const figures = computed(() => {
  const summary = session.summary;
  if (summary === null) {
    return [];
  }
  const totalSeconds = Math.round(summary.duration_ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return [
    { label: "WPM", value: Math.round(summary.wpm).toString() },
    { label: "CPM", value: Math.round(summary.cpm).toString() },
    {
      label: "Accuracy",
      value:
        summary.accuracy === null ? "—" : `${summary.accuracy.toFixed(1)}%`,
    },
    {
      label: "Rhythm evenness",
      value: summary.rhythm === null ? "—" : `${Math.round(summary.rhythm)}%`,
    },
    { label: "Time", value: `${minutes}:${seconds}` },
  ];
});

const title = computed(() =>
  session.summary?.reason === "aborted"
    ? "Session ended early"
    : "Session complete",
);
</script>

<template>
  <AppShell>
    <div class="page-head">
      <h1>{{ title }}</h1>
    </div>
    <section class="sec">
      <header class="sec__h"><h2>Session</h2></header>
      <div v-if="session.summaryFailed" class="state state--error">
        <p class="state__h">The summary could not be read</p>
        <p>
          Your typing is safe in the journal. Later sessions are not affected.
        </p>
      </div>
      <div v-else class="figures">
        <div v-for="figure in figures" :key="figure.label" class="figure">
          <b>{{ figure.value }}</b>
          <span>{{ figure.label }}</span>
        </div>
      </div>
    </section>
    <div class="row">
      <button
        type="button"
        class="btn btn--primary"
        :disabled="session.starting"
        @click="session.start()"
      >
        Next session
      </button>
      <button type="button" class="btn" @click="app.go('home')">
        Back to home
      </button>
    </div>
  </AppShell>
</template>
