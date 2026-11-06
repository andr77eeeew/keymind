<script setup lang="ts">
import { computed, onMounted } from "vue";
import AppShell from "../components/AppShell.vue";
import {
  dayText,
  letterRows,
  lettersLine,
  recipeLines,
  whyLine,
} from "../brain/view";
import { localDate } from "../stats/trends";
import { useAppStore } from "../stores/app";
import { useBrainStore } from "../stores/brain";
import { useSessionStore } from "../stores/session";
import { useStatsStore } from "../stores/stats";

const app = useAppStore();
const brain = useBrainStore();
const session = useSessionStore();
const stats = useStatsStore();

const view = computed(() => (brain.nextState === "ready" ? brain.next : null));
const loading = computed(
  () =>
    brain.nextState === "loading" ||
    (brain.nextState === "ready" && view.value === null),
);
const pairs = computed(() => view.value?.targets.slice(1) ?? []);
const recipe = computed(() => (view.value ? recipeLines(view.value) : []));
const letters = computed(() => (view.value ? letterRows(view.value) : []));
const today = localDate(new Date());

function startAdaptive(): void {
  session.mode = "adaptive";
  void session.start();
}

onMounted(() => brain.showNext());
</script>

<template>
  <AppShell>
    <div class="page-head">
      <h1>Brain</h1>
      <div class="row">
        <a
          class="link"
          href="#"
          :aria-disabled="session.starting"
          @click.prevent="session.startTest()"
          >Take the starting test</a
        >
        <a class="link" href="#" @click.prevent="app.go('settings')"
          >Letter settings</a
        >
      </div>
    </div>

    <div v-if="brain.nextState === 'error'" class="state state--error">
      <p class="state__h">The brain could not read your statistics</p>
      <p>
        Adaptive still starts from the most frequent letters, and your journal
        is safe. Rebuild the statistics from it.
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

    <div v-else class="grid">
      <section class="sheet s7 stack">
        <div v-if="loading || view === null" class="sk" aria-busy="true">
          <span class="visually-hidden">Loading</span>
          <i style="--w: 60%" />
          <i style="--w: 92%" />
          <i style="--w: 74%" />
        </div>
        <template v-else>
          <div class="next__h">
            <h2>
              In focus: <span class="gram">{{ view.focus }}</span>
            </h2>
            <span class="tag tag--target">Chosen by the heuristic</span>
          </div>
          <p>{{ whyLine(view) }}</p>
          <p v-if="!view.known" class="sec__note">
            Nothing is typed yet, so the brain starts with the most frequent
            letter. Your first session gives it data.
          </p>
          <div v-if="pairs.length > 0">
            <h3>Transitions into it</h3>
            <p class="grams">
              <span v-for="pair in pairs" :key="pair.gram" class="gram">{{
                pair.gram
              }}</span>
            </p>
          </div>
          <div class="row">
            <button
              type="button"
              class="btn btn--primary"
              :disabled="session.starting"
              @click="startAdaptive"
            >
              Start session
            </button>
          </div>
        </template>
      </section>

      <div class="s5 stack stack--secs">
        <section class="sec">
          <header class="sec__h"><h2>Recipe for the next session</h2></header>
          <div v-if="loading || view === null" class="sk" aria-busy="true">
            <span class="visually-hidden">Loading</span>
            <i style="--w: 92%" />
            <i style="--w: 74%" />
          </div>
          <table v-else class="tbl">
            <tbody>
              <tr v-for="line in recipe" :key="line.label">
                <td>{{ line.label }}</td>
                <td class="n">{{ line.value }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="sec">
          <header class="sec__h"><h2>Due for review</h2></header>
          <div v-if="loading || view === null" class="sk" aria-busy="true">
            <span class="visually-hidden">Loading</span>
            <i style="--w: 84%" />
            <i style="--w: 66%" />
          </div>
          <div v-else-if="view.review.length === 0" class="state state--empty">
            <p class="state__h">Nothing is due</p>
            <p>
              A key or transition comes back here once you have learned it and
              not typed it for a while.
            </p>
          </div>
          <ul v-else class="rows">
            <li
              v-for="item in view.review"
              :key="item.gram"
              style="grid-template-columns: auto minmax(0, 1fr) auto"
            >
              <span class="gram">{{ item.gram }}</span>
              <span>Last typed</span>
              <span class="muted">{{ dayText(item.last_date, today) }}</span>
            </li>
          </ul>
        </section>
      </div>

      <section class="sec s12">
        <header class="sec__h"><h2>Open letters</h2></header>
        <div v-if="loading || view === null" class="sk" aria-busy="true">
          <span class="visually-hidden">Loading</span>
          <i style="--w: 92%" />
          <i style="--w: 74%" />
          <i style="--w: 84%" />
        </div>
        <template v-else>
          <p class="sec__note">{{ lettersLine(view) }}</p>
          <table class="tbl tbl--rows">
            <thead>
              <tr>
                <th>Letter</th>
                <th class="n">Time</th>
                <th class="n">Errors</th>
                <th>Against the bar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in letters" :key="row.gram">
                <td>
                  <span class="gram">{{ row.gram }}</span>
                </td>
                <td class="n">{{ row.time }}</td>
                <td class="n">{{ row.errors }}</td>
                <td>
                  <span
                    class="tag"
                    :class="{ 'tag--strong': row.state === 'bar' }"
                    >{{ row.stateText }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>

      <section class="sec s12">
        <div class="state state--empty">
          <p class="state__h">Still on the heuristic</p>
          <p>
            For now simple rules pick each session: the weakest open key is in
            focus, and letters open by frequency. A learned model comes later,
            and it has to beat these rules before it takes over.
          </p>
        </div>
      </section>
    </div>
  </AppShell>
</template>
