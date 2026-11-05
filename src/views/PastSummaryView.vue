<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import AppShell from "../components/AppShell.vue";
import SummaryFigures from "../components/SummaryFigures.vue";
import { pastSummaryContent } from "../stats/past";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { useStatsStore } from "../stores/stats";

const app = useAppStore();
const session = useSessionStore();
const stats = useStatsStore();
const back = useTemplateRef<HTMLButtonElement>("back");

const content = computed(() => {
  const row = stats.past;
  if (row === null) {
    return null;
  }
  const { source } = row;
  const file =
    source?.kind === "import"
      ? session.imports.find((item) => item.id === source.id)
      : undefined;
  return pastSummaryContent(row, file?.title ?? null, new Date());
});

const backLabel = computed(() =>
  app.pastFrom === "statistics" ? "Back to statistics" : "Back to home",
);

onMounted(() => back.value?.focus());
</script>

<template>
  <AppShell>
    <div class="page-head page-head--stack">
      <h1>{{ content?.heading ?? "Session" }}</h1>
      <p v-if="content">{{ content.sub }}</p>
    </div>

    <div v-if="stats.pastFailed" class="state state--error">
      <p class="state__h">This session could not be read</p>
      <p>Your journal is safe. Rebuild the statistics from it.</p>
      <div class="state__a">
        <button
          type="button"
          class="btn"
          :disabled="stats.rebuilding"
          @click="stats.rebuild()"
        >
          Rebuild from the journal
        </button>
      </div>
    </div>
    <div v-else-if="content === null" class="sk" aria-busy="true">
      <span class="visually-hidden">Loading</span>
      <i style="--w: 92%" />
      <i style="--w: 74%" />
      <i style="--w: 84%" />
    </div>
    <SummaryFigures v-else :content="content" />

    <div class="row">
      <button
        ref="back"
        type="button"
        class="btn btn--primary"
        @click="app.go(app.pastFrom)"
      >
        {{ backLabel }}
      </button>
    </div>
  </AppShell>
</template>
