<script setup lang="ts">
import { computed, onMounted } from "vue";
import AppShell from "../components/AppShell.vue";
import SegControl from "../components/SegControl.vue";
import { useSettingsStore } from "../stores/settings";
import { useStatsStore } from "../stores/stats";
import type { Settings } from "../typing/types";

const store = useSettingsStore();
const stats = useStatsStore();

function bound<K extends keyof Settings>(key: K) {
  return computed<Settings[K]>({
    get: () => store.settings[key],
    set: (value) => void store.change(key, value),
  });
}

const backspace = bound("backspace");
const onError = bound("on_error");
const theme = bound("theme");
const liveFigures = bound("live_figures");

/** Damage is reported instead of hidden. The other skipped lines are normal. */
const damaged = computed(() => stats.homeData?.skipped.bad_lines ?? 0);

onMounted(() => stats.showHome());

const backspaceOptions = [
  { value: "allowed", label: "Allowed" },
  { value: "blocked", label: "Blocked" },
] as const;
const onErrorOptions = [
  { value: "continue", label: "Keep going" },
  { value: "stop", label: "Stop until correct" },
] as const;
const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;
</script>

<template>
  <AppShell>
    <div class="page-head">
      <h1>Settings</h1>
    </div>
    <div class="set-body">
      <section class="sec">
        <header class="sec__h"><h2>Typing</h2></header>
        <div class="setting">
          <div>
            <p class="setting__t">Backspace</p>
            <p class="setting__d">
              When blocked, a correction does nothing in Words and Texts. Zen
              always allows it. The original error is always counted.
            </p>
          </div>
          <div class="setting__c">
            <SegControl
              v-model="backspace"
              label="Backspace"
              :options="backspaceOptions"
            />
          </div>
        </div>
        <div class="setting">
          <div>
            <p class="setting__t">On error</p>
            <p class="setting__d">Keep typing, or wait for the right key.</p>
          </div>
          <div class="setting__c">
            <SegControl
              v-model="onError"
              label="On error"
              :options="onErrorOptions"
            />
          </div>
        </div>
        <div class="setting">
          <div>
            <p class="setting__t">Live figures</p>
            <p class="setting__d">
              WPM, accuracy and elapsed time while you type. A time limit always
              shows, and the summary keeps every figure.
            </p>
          </div>
          <div class="setting__c">
            <label class="switch">
              <input v-model="liveFigures" type="checkbox" role="switch" />
              <span class="switch__t" />
              <span class="switch__state">{{
                liveFigures ? "On" : "Off"
              }}</span>
              <span class="visually-hidden">Live figures</span>
            </label>
          </div>
        </div>
      </section>
      <section class="sec">
        <header class="sec__h"><h2>Appearance</h2></header>
        <div class="setting">
          <div><p class="setting__t">Theme</p></div>
          <div class="setting__c">
            <SegControl v-model="theme" label="Theme" :options="themeOptions" />
          </div>
        </div>
      </section>
      <section class="sec">
        <header class="sec__h"><h2>Data</h2></header>
        <div class="setting">
          <div>
            <p class="setting__t">Statistics</p>
            <p class="setting__d">
              Worked out from your journal. Rebuilding reads the journal again
              and does not change it.
            </p>
            <p v-if="damaged > 0" class="setting__d">
              {{ damaged.toLocaleString("en") }}
              {{ damaged === 1 ? "line" : "lines" }} of the journal could not be
              read and {{ damaged === 1 ? "was" : "were" }} left out.
            </p>
            <p v-if="stats.rebuilding" class="setting__d" role="status">
              Rebuilding. You can keep typing.
            </p>
            <p v-else-if="stats.rebuilt" class="setting__d" role="status">
              The statistics were rebuilt.
            </p>
            <p v-if="stats.rebuildError" class="field__error" role="alert">
              The statistics could not be rebuilt: {{ stats.rebuildError }}
            </p>
          </div>
          <div class="setting__c">
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
      </section>
      <p v-if="store.error" class="field__error" role="alert">
        This setting could not be saved: {{ store.error }}
      </p>
    </div>
  </AppShell>
</template>
