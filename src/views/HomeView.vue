<script lang="ts">
import { contours } from "../relief/contours";

// Not data: it has no keys and no hills, so it cannot be read as a result. Drawn once per run.
const ground = contours({ seed: 31, density: 5 });
</script>

<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import AppShell from "../components/AppShell.vue";
import { useSessionStore } from "../stores/session";

const session = useSessionStore();
const primaryButton = useTemplateRef<HTMLButtonElement>("primary");

const primary = computed(() => session.home.primary);
const stuck = computed(() => primary.value.noRepeat);

const heading = computed(() => {
  if (stuck.value) {
    return stuck.value.heading;
  }
  if (session.setupsState === "error" || session.libraryState === "error") {
    return "Start a session";
  }
  return session.firstSession
    ? "Your first session"
    : "Start where you left off";
});

const failed = computed(
  () => session.setupsState === "error" || session.libraryState === "error",
);
const loading = computed(
  () => session.setupsState === "loading" || session.libraryState === "loading",
);

onMounted(() => {
  // Enter starts. The button is the same element in every state, so the focus survives the data.
  primaryButton.value?.focus();
  void session.refreshImports();
});
</script>

<template>
  <AppShell>
    <section class="sheet start">
      <div class="start__copy">
        <h1 :class="{ 'clamp-2': stuck }" :title="stuck ? heading : undefined">
          {{ heading }}
        </h1>
        <p class="start__setup">
          <b>{{ primary.name }}</b>
          <span>{{ primary.line }}</span>
        </p>
        <div class="start__a">
          <button
            ref="primary"
            type="button"
            class="btn btn--primary"
            :disabled="session.starting"
            @click="session.startChoice(primary)"
          >
            {{ stuck ? stuck.primary : "Start session" }}
          </button>
          <button
            v-if="!stuck"
            type="button"
            class="btn btn--quiet"
            @click="session.openSetup(primary.used)"
          >
            Change setup
          </button>
        </div>
      </div>
      <div class="start__ground" aria-hidden="true">
        <svg
          class="relief"
          :viewBox="ground.viewBox"
          preserveAspectRatio="xMidYMid slice"
        >
          <path class="relief__thin" :d="ground.thin" />
          <path class="relief__bold" :d="ground.bold" />
        </svg>
      </div>
    </section>

    <div v-if="failed" class="state state--error">
      <p class="state__h">Your last setup could not be read</p>
      <p>
        The default setup is in place. Your journal is safe, and nothing else
        changes.
      </p>
    </div>

    <section class="sec quickwrap">
      <header class="sec__h">
        <h2>Other sessions</h2>
        <a
          class="link"
          href="#"
          @click.prevent="session.openSetup(primary.used)"
          >All modes</a
        >
      </header>
      <div v-if="loading" class="sk" aria-busy="true">
        <span class="visually-hidden">Loading</span>
        <i style="--w: 92%" />
        <i style="--w: 74%" />
      </div>
      <ul v-else class="quick">
        <li
          v-for="row in session.home.others"
          :key="row.used.mode"
          class="quick__r"
        >
          <b class="quick__m">{{ row.name }}</b>
          <span
            class="quick__s"
            :title="row.noRepeat ? row.noRepeat.rowText : row.line"
            >{{ row.noRepeat ? row.noRepeat.rowText : row.line }}</span
          >
          <button
            type="button"
            class="btn btn--sm"
            :disabled="session.starting"
            :aria-label="
              row.noRepeat
                ? `${row.noRepeat.rowAction} for ${row.name}`
                : `Start ${row.name}`
            "
            @click="session.startChoice(row)"
          >
            {{ row.noRepeat ? row.noRepeat.rowAction : "Start" }}
          </button>
          <a
            v-if="!row.noRepeat && row.used.mode !== 'zen'"
            class="link"
            href="#"
            :aria-label="`Change the ${row.name} setup`"
            @click.prevent="session.openSetup(row.used)"
            >Change</a
          >
          <span v-else />
        </li>
      </ul>
    </section>
  </AppShell>
</template>
