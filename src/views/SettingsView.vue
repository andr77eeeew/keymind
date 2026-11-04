<script setup lang="ts">
import { computed } from "vue";
import AppShell from "../components/AppShell.vue";
import SegControl from "../components/SegControl.vue";
import { useSettingsStore } from "../stores/settings";
import type { Settings } from "../typing/types";

const store = useSettingsStore();

function bound<K extends keyof Settings>(key: K) {
  return computed<Settings[K]>({
    get: () => store.settings[key],
    set: (value) => void store.change(key, value),
  });
}

const backspace = bound("backspace");
const onError = bound("on_error");
const theme = bound("theme");

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
      <p v-if="store.error" class="field__error" role="alert">
        This setting could not be saved: {{ store.error }}
      </p>
    </div>
  </AppShell>
</template>
