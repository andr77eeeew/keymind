<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from "vue";
import { useAppStore } from "../stores/app";
import { useSettingsStore } from "../stores/settings";
import type { Theme } from "../typing/types";

const app = useAppStore();
const store = useSettingsStore();

const choice = ref<Theme>(store.settings.theme);
const saving = ref(false);
const failed = ref(false);
const pick = useTemplateRef<HTMLFieldSetElement>("pick");

const cards: { value: Theme; name: string }[] = [
  { value: "light", name: "Light" },
  { value: "dark", name: "Dark" },
  { value: "system", name: "System" },
];

watch(choice, (theme) => store.tryTheme(theme));

onMounted(() => {
  // On the selected card, so Enter accepts it and the arrow keys move between the cards.
  pick.value?.querySelector<HTMLInputElement>("input:checked")?.focus();
});

async function proceed(): Promise<void> {
  // A look is no reason to stop anyone, so a second Continue goes on after a failed save.
  if (failed.value) {
    app.go("home");
    return;
  }
  saving.value = true;
  const saved = await store.chooseTheme(choice.value);
  saving.value = false;
  if (saved) {
    app.go("home");
  } else {
    failed.value = true;
  }
}
</script>

<template>
  <div class="ob">
    <header class="top"><span class="wordmark">Keymind</span></header>
    <main class="ob__body ob__body--narrow">
      <form class="ob__form" @submit.prevent="proceed">
        <div class="stack">
          <h1>How should Keymind look?</h1>
          <p class="muted">You can change this at any time in Settings.</p>
        </div>
        <fieldset ref="pick" class="pick pick--theme">
          <legend class="visually-hidden">Theme</legend>
          <label v-for="card in cards" :key="card.value">
            <input
              v-model="choice"
              type="radio"
              name="theme"
              :value="card.value"
            />
            <!-- Each picture carries its own theme, so it stays true whatever the page shows. -->
            <i
              v-if="card.value === 'system'"
              class="themepic themepic--split"
              aria-hidden="true"
            >
              <i
                v-for="half in ['light', 'dark']"
                :key="half"
                :data-theme="half"
              >
                <i class="themepic__t">
                  <i class="c done">the qu</i><i class="c cur">i</i
                  ><i class="c">et path up</i>
                </i>
              </i>
            </i>
            <i
              v-else
              class="themepic"
              :data-theme="card.value"
              aria-hidden="true"
            >
              <i class="themepic__t">
                <i class="c done">the qu</i><i class="c cur">i</i
                ><i class="c">et path up</i>
              </i>
            </i>
            <b>{{ card.name }}</b>
            <span v-if="card.value === 'light'">Dark text on a light page</span>
            <span v-else-if="card.value === 'dark'"
              >Light text on a dark page</span
            >
            <span v-else
              >Like Windows, now {{ store.systemDark ? "dark" : "light" }}</span
            >
          </label>
        </fieldset>
        <div v-if="failed" class="state state--error" role="status">
          <p class="state__h">Your choice could not be saved</p>
          <p>Keymind keeps it for now and asks again at the next launch.</p>
        </div>
        <div class="ob__foot">
          <button type="submit" class="btn btn--primary" :disabled="saving">
            Continue
          </button>
        </div>
      </form>
    </main>
  </div>
</template>
