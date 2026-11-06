<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import OnboardingSteps from "../components/OnboardingSteps.vue";
import ReliefMap from "../components/ReliefMap.vue";
import { testFigures, testMap } from "../stats/test";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import { useStatsStore } from "../stores/stats";
import { useTestStore } from "../stores/test";

const app = useAppStore();
const session = useSessionStore();
const stats = useStatsStore();
const test = useTestStore();
const startButton = useTemplateRef<HTMLButtonElement>("start");

const map = computed(() =>
  test.state === "ready" ? testMap(test.keys) : null,
);
const figures = computed(() => (test.row ? testFigures(test.row) : []));

function retake(): void {
  void session.startTest();
}

function startAdaptive(): void {
  app.onboarding = false;
  session.mode = "adaptive";
  void session.start();
}

function home(): void {
  app.onboarding = false;
  app.go("home");
}

// Enter starts, as on Home. The button is there in every state.
onMounted(() => startButton.value?.focus());
</script>

<template>
  <div class="ob">
    <header class="top">
      <span class="wordmark">Keymind</span>
      <OnboardingSteps v-if="app.onboarding" current="relief" />
    </header>
    <main class="ob__body">
      <div class="page-head">
        <h1>This is your starting relief</h1>
        <p>
          The higher the ground under a key, the slower or less accurate you are
          on it.
        </p>
      </div>

      <div v-if="test.state === 'error'" class="state state--error">
        <template v-if="test.unsaved">
          <p class="state__h">The end of the test was not saved</p>
          <p>
            The keys typed before it are in your journal, but the map needs the
            whole minute. Take the test again.
          </p>
        </template>
        <template v-else>
          <p class="state__h">The statistics could not be read</p>
          <p>
            Your journal is safe and the test is in it. Rebuild the statistics
            from it and the map comes back.
          </p>
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
        </template>
      </div>
      <div v-else-if="test.state === 'loading'" class="sk" aria-busy="true">
        <span class="visually-hidden">Drawing the map</span>
        <i style="--w: 100%; height: 190px" />
      </div>
      <template v-else>
        <div v-if="map === null" class="state state--empty">
          <p class="state__h">Too little was typed to draw a map</p>
          <p>
            Each key needs a few presses to measure. Take the test again, or
            start training: the map grows from every session.
          </p>
        </div>
        <ReliefMap
          v-else
          :hills="map.hills"
          :pins="map.pins"
          :note="map.note"
        />
        <div class="grid">
          <div class="figures s6">
            <div v-for="figure in figures" :key="figure.label" class="figure">
              <b>{{ figure.value }}</b>
              <span>{{ figure.label }}</span>
            </div>
          </div>
        </div>
      </template>

      <div class="ob__foot">
        <div class="row">
          <button
            type="button"
            class="btn btn--quiet"
            :disabled="session.starting"
            @click="retake"
          >
            Retake the test
          </button>
          <button
            v-if="!app.onboarding"
            type="button"
            class="btn btn--quiet"
            @click="home"
          >
            Back to home
          </button>
        </div>
        <button
          ref="start"
          type="button"
          class="btn btn--primary"
          :disabled="session.starting"
          @click="startAdaptive"
        >
          {{ app.onboarding ? "Start your first session" : "Start a session" }}
        </button>
      </div>
    </main>
  </div>
</template>
