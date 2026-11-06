<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import AppShell from "../components/AppShell.vue";
import RecentSessions from "../components/RecentSessions.vue";
import ReliefMap from "../components/ReliefMap.vue";
import { whyLine } from "../brain/view";
import { FEW_SESSIONS, reliefHills, weakestPins } from "../stats/relief";
import { useAppStore } from "../stores/app";
import { useBrainStore } from "../stores/brain";
import { useSessionStore } from "../stores/session";
import { useStatsStore } from "../stores/stats";

/** Home stays one screen. Statistics has the longer list. */
const RECENT_ROWS = 4;

const app = useAppStore();
const session = useSessionStore();
const stats = useStatsStore();
const brain = useBrainStore();
const primaryButton = useTemplateRef<HTMLButtonElement>("primary");

const primary = computed(() => session.home.primary);
const stuck = computed(() => primary.value.noRepeat);

/** The brain picks the next session, so Home says what it works on and why. */
const adaptive = computed(
  () => !stuck.value && primary.value.used.mode === "adaptive",
);
const focus = computed(() =>
  adaptive.value && !session.firstSession && brain.nextState === "ready"
    ? brain.next
    : null,
);
const why = computed(() =>
  focus.value ? whyLine(focus.value) : primary.value.line,
);

const heading = computed(() => {
  if (stuck.value) {
    return stuck.value.heading;
  }
  if (session.setupsState === "error" || session.libraryState === "error") {
    return "Start a session";
  }
  if (session.firstSession) {
    return "Your first session";
  }
  return adaptive.value ? "Your next session" : "Start where you left off";
});

const failed = computed(
  () => session.setupsState === "error" || session.libraryState === "error",
);
const loading = computed(
  () => session.setupsState === "loading" || session.libraryState === "loading",
);

const overview = computed(() => stats.homeData);
const noSessions = computed(() => overview.value?.recent.length === 0);
const sessionCount = computed(() =>
  (overview.value?.days ?? []).reduce((sum, day) => sum + day.sessions, 0),
);
const hills = computed(() =>
  reliefHills(overview.value?.keys ?? [], sessionCount.value),
);
const pins = computed(() =>
  // Below ten sessions the map says it is still changing, so it does not point at a key yet.
  sessionCount.value < FEW_SESSIONS
    ? []
    : weakestPins(overview.value?.keys ?? []),
);
const mapNote = computed(() => {
  if (sessionCount.value >= FEW_SESSIONS) {
    return undefined;
  }
  const count = sessionCount.value;
  return `Drawn from ${count} ${count === 1 ? "session" : "sessions"}, so it will shift as you type more.`;
});
const recent = computed(() =>
  (overview.value?.recent ?? []).slice(0, RECENT_ROWS),
);

onMounted(() => {
  // Enter starts. The button is the same element in every state, so the focus survives the data.
  primaryButton.value?.focus();
  void session.refreshImports();
  stats.showHome();
  brain.showNext();
});
</script>

<template>
  <AppShell>
    <section class="sheet next">
      <div class="next__h">
        <h1 v-if="focus">
          Next session works on <span class="gram">{{ focus.focus }}</span>
        </h1>
        <h1
          v-else
          :class="{ 'clamp-2': stuck }"
          :title="stuck ? heading : undefined"
        >
          {{ heading }}
        </h1>
        <a
          v-if="adaptive"
          class="link"
          href="#"
          @click.prevent="app.go('brain')"
          >Why this session</a
        >
        <p class="start__setup start__setup--inline">
          <b>{{ primary.name }}</b>
          <span>{{ why }}</span>
        </p>
      </div>

      <div v-if="stats.homeState === 'error'" class="state state--error">
        <p class="state__h">The statistics could not be read</p>
        <p>
          Your journal is safe. Rebuild the statistics from it and the map comes
          back.
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
      </div>
      <div
        v-else-if="stats.homeState === 'loading' || overview === null"
        class="sk"
        aria-busy="true"
      >
        <span class="visually-hidden">Loading</span>
        <i style="--w: 100%; height: 190px" />
      </div>
      <div v-else-if="noSessions" class="state state--empty">
        <template v-if="session.testFailed">
          <p class="state__h">The starting test could not be prepared</p>
          <p>
            Nothing was started. Try again, or begin with a session: the map
            grows from every one.
          </p>
        </template>
        <template v-else>
          <p class="state__h">No relief yet</p>
          <p>A one-minute test draws your first map.</p>
        </template>
        <div class="state__a">
          <button
            type="button"
            class="btn"
            :disabled="session.starting"
            @click="session.startTest()"
          >
            Take the starting test
          </button>
        </div>
      </div>
      <ReliefMap v-else :hills="hills" :pins="pins" :note="mapNote" />

      <div class="next__a">
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
        <a class="link" href="#" @click.prevent="app.go('statistics')"
          >Open statistics</a
        >
      </div>
    </section>

    <div v-if="failed" class="state state--error">
      <p class="state__h">Your last setup could not be read</p>
      <p>
        The default setup is in place. Your journal is safe, and nothing else
        changes.
      </p>
    </div>

    <div class="twocol">
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

      <section class="sec">
        <header class="sec__h"><h2>Recent sessions</h2></header>
        <div v-if="stats.homeState === 'error'" class="state state--error">
          <p class="state__h">Sessions could not be loaded</p>
          <p>Your journal is safe. Rebuild the statistics from it.</p>
        </div>
        <div
          v-else-if="stats.homeState === 'loading' || overview === null"
          class="sk"
          aria-busy="true"
        >
          <span class="visually-hidden">Loading</span>
          <i style="--w: 92%" />
          <i style="--w: 74%" />
          <i style="--w: 84%" />
          <i style="--w: 66%" />
        </div>
        <div v-else-if="noSessions" class="state state--empty">
          <p class="state__h">No sessions yet</p>
          <p>Your first session shows up here.</p>
        </div>
        <RecentSessions v-else :rows="recent" from="home" />
      </section>
    </div>
  </AppShell>
</template>
