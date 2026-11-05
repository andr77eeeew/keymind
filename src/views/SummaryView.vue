<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import AppShell from "../components/AppShell.vue";
import SummaryFigures from "../components/SummaryFigures.vue";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { readingProgress, summaryContent } from "../typing/summary";

/** The press that ended a session may still be held, and must not start the next one. */
const FOCUS_DELAY_MS = 400;
/**
 * A timed session ends in the middle of a word, so the next few presses are still typing. For
 * this long Space and Enter do nothing, even on a button that Tab reached.
 */
const TIMED_GUARD_MS = 1000;

const app = useAppStore();
const session = useSessionStore();
const primary = useTemplateRef<HTMLButtonElement>("primary");

const content = computed(() => {
  const ended = session.endedSession;
  return ended && session.summary
    ? summaryContent(ended.plan, session.summary, ended.cursor)
    : null;
});

const reading = computed(() => {
  const ended = session.endedSession;
  return ended ? readingProgress(ended.plan, ended.cursor) : null;
});

const nextLabel = computed(() => {
  if (reading.value === null) {
    return "Next session";
  }
  return reading.value.finished ? "Start again" : "Continue reading";
});

const unsaved = computed(() => session.endedSession?.saved === false);

const timed = session.endedSession?.plan.seconds !== undefined;
const guardMs = timed ? TIMED_GUARD_MS : FOCUS_DELAY_MS;
const guardUntil = performance.now() + guardMs;

function swallowEarlyKeys(event: KeyboardEvent): void {
  if (
    (event.code === "Space" || event.key === "Enter") &&
    event.timeStamp < guardUntil
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
}

const focusTimer = setTimeout(() => primary.value?.focus(), guardMs);
onMounted(() => {
  // Keeps the keys away from whatever had the focus before.
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.addEventListener("keydown", swallowEarlyKeys, true);
});
onBeforeUnmount(() => {
  clearTimeout(focusTimer);
  window.removeEventListener("keydown", swallowEarlyKeys, true);
});
</script>

<template>
  <AppShell>
    <div class="page-head page-head--stack">
      <h1>
        {{
          session.summaryFailed
            ? unsaved
              ? "The session could not be saved yet"
              : "Session ended"
            : (content?.heading ?? "Session ended")
        }}
      </h1>
      <p v-if="content">{{ content.sub }}</p>
    </div>

    <div v-if="session.summaryFailed" class="state state--error">
      <template v-if="unsaved">
        <p class="state__h">Your typing has not reached the disk yet</p>
        <p>
          Keymind keeps trying while it runs, so leave it open until the disk
          responds.
        </p>
      </template>
      <template v-else>
        <p class="state__h">The summary could not be read</p>
        <p>
          Your typing is safe in the journal. Later sessions are not affected.
        </p>
      </template>
    </div>
    <div v-else-if="content === null" class="sk" aria-busy="true">
      <span class="visually-hidden">Loading</span>
      <i style="--w: 92%" />
      <i style="--w: 74%" />
      <i style="--w: 84%" />
    </div>
    <template v-else>
      <SummaryFigures :content="content" />
      <div v-if="reading" class="result__extra">
        <div class="meter">
          <div class="meter__head">
            <span>Read so far</span>
            <b>{{ reading.text }}</b>
          </div>
          <div
            class="meter__bar"
            role="progressbar"
            aria-label="Read so far"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="reading.value"
          >
            <i :style="{ '--v': reading.value / 100 }" />
          </div>
        </div>
      </div>
    </template>

    <div class="row">
      <button
        ref="primary"
        type="button"
        class="btn btn--primary"
        :disabled="session.starting"
        @click="session.start()"
      >
        {{ nextLabel }}
      </button>
      <button type="button" class="btn" @click="app.go('setup')">
        Change setup
      </button>
      <button type="button" class="btn btn--quiet" @click="app.go('home')">
        Back to home
      </button>
    </div>
  </AppShell>
</template>
