<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import AppShell from "../components/AppShell.vue";
import KeyCaps, { type KeyMark } from "../components/KeyCaps.vue";
import RecentSessions from "../components/RecentSessions.vue";
import SegControl from "../components/SegControl.vue";
import { useTips } from "../components/tip";
import TrendChart from "../components/TrendChart.vue";
import {
  fingerHeat,
  fingerNote,
  keyHeat,
  percentText,
  slowestTransitions,
  transitionMatrix,
  type Metric,
} from "../stats/heat";
import { KEY_CAPS, type Finger } from "../stats/keyboard";
import { recordLines } from "../stats/tables";
import {
  hasValues,
  periodStart,
  shortDate,
  trendOf,
  type Period,
  type TrendField,
} from "../stats/trends";
import { useSessionStore } from "../stores/session";
import { useStatsStore } from "../stores/stats";

/** More would push the records and the trends out of reach. */
const RECENT_ROWS = 8;
const MATRIX_LABEL =
  "Transition matrix. The first letter is the row, the second is the column. The table beside it lists the slowest transitions.";

const stats = useStatsStore();
const session = useSessionStore();
const root = useTemplateRef<HTMLElement>("root");
useTips(root);

const periodOptions = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All time" },
] as const;
const groupOptions = [
  { value: "keys", label: "Keys" },
  { value: "fingers", label: "Fingers" },
] as const;
const metricOptions = [
  { value: "speed", label: "Speed" },
  { value: "errors", label: "Errors" },
] as const;

const period = computed<Period>({
  get: () => stats.period,
  set: (value) => stats.setPeriod(value),
});
const group = ref<"keys" | "fingers">("keys");
const keyMetric = ref<Metric>("speed");
const matrixMetric = ref<Metric>("speed");

const overview = computed(() => stats.screenData);
/** Recent sessions ignore the period, so this means nothing was ever typed. */
const nothingYet = computed(
  () => stats.screenState === "ready" && overview.value?.recent.length === 0,
);

const keys = computed(() => overview.value?.keys ?? []);
const bigrams = computed(() => overview.value?.bigrams ?? []);
const heat = computed(() => keyHeat(keys.value));
const fingers = computed(() => fingerHeat(keys.value));
const fingerText = computed(() => fingerNote(fingers.value));
const slowestFinger = computed(() =>
  Math.max(0, ...fingers.value.map((row) => row.ms ?? 0)),
);
const matrix = computed(() => transitionMatrix(bigrams.value));
const slowest = computed(() => slowestTransitions(bigrams.value));
const records = computed(() =>
  overview.value ? recordLines(overview.value.records) : [],
);
const recent = computed(() =>
  (overview.value?.recent ?? []).slice(0, RECENT_ROWS),
);

const marks = computed<ReadonlyMap<string, KeyMark>>(() => {
  const found = new Map<string, KeyMark>();
  const errors = keyMetric.value === "errors";
  if (group.value === "fingers") {
    const byFinger = new Map<Finger, (typeof fingers.value)[number]>(
      fingers.value.map((row) => [row.finger, row]),
    );
    for (const cap of KEY_CAPS.values()) {
      const row = byFinger.get(cap.finger);
      if (row && !cap.modifier) {
        found.set(cap.code, {
          step: errors ? row.error : row.speed,
          tip: row.tip,
        });
      }
    }
    return found;
  }
  for (const [code, row] of heat.value) {
    let value: string | undefined;
    if (errors && row.errorPercent !== null) {
      value = row.errorPercent.toFixed(1);
    } else if (!errors && row.ms !== null) {
      value = String(Math.round(row.ms));
    }
    found.set(code, {
      step: errors ? row.error : row.speed,
      tip: row.tip,
      value,
    });
  }
  return found;
});

function trend(field: TrendField) {
  return computed(() => {
    const today = stats.today();
    return trendOf(
      overview.value?.days ?? [],
      field,
      periodStart(stats.period, today),
      today,
    );
  });
}
const wpmTrend = trend("wpm");
const accuracyTrend = trend("accuracy");
const rhythmTrend = trend("rhythm");

onMounted(() => stats.showStatistics());
</script>

<template>
  <AppShell>
    <div ref="root" class="stack stack--secs">
      <div class="page-head">
        <h1>Statistics</h1>
        <SegControl v-model="period" label="Period" :options="periodOptions" />
      </div>

      <div v-if="stats.screenState === 'error'" class="state state--error">
        <p class="state__h">The statistics could not be read</p>
        <p>
          The local database is damaged or out of date. Your journal is safe;
          rebuild from it.
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
        v-else-if="stats.screenState === 'loading' || overview === null"
        class="sk"
        aria-busy="true"
      >
        <span class="visually-hidden">Loading</span>
        <i style="--w: 92%" />
        <i style="--w: 74%" />
        <i style="--w: 84%" />
        <i style="--w: 66%" />
        <i style="--w: 78%" />
      </div>
      <div v-else-if="nothingYet" class="state state--empty">
        <p class="state__h">No statistics yet</p>
        <p>Finish one session and the heatmap, matrix and trends fill in.</p>
        <div class="state__a">
          <button
            type="button"
            class="btn btn--primary"
            :disabled="session.starting"
            @click="session.startChoice(session.home.primary)"
          >
            Start session
          </button>
        </div>
      </div>

      <div v-else class="grid">
        <section class="sec s8">
          <header class="sec__h"><h2>Keyboard</h2></header>
          <div class="sec__tools">
            <span class="row">
              <SegControl
                v-model="group"
                label="Group by"
                :options="groupOptions"
              />
              <SegControl
                v-model="keyMetric"
                label="Measure"
                :options="metricOptions"
              />
            </span>
            <span class="legend">
              <span>Fast, clean</span>
              <span class="legend__ramp">
                <i v-for="step in 6" :key="step" :data-h="step - 1" />
              </span>
              <span>Slow, many errors</span>
            </span>
          </div>
          <div
            class="heat"
            role="img"
            aria-label="Keyboard heatmap. The tables below list the slowest transitions and the records."
          >
            <KeyCaps variant="heat" :marks="marks" />
          </div>
          <p v-if="heat.size === 0" class="sec__note">
            Nothing was typed in this period.
          </p>
        </section>

        <section class="sec s4">
          <header class="sec__h"><h2>By finger</h2></header>
          <div class="fingers">
            <div v-for="row in fingers" :key="row.finger" :data-tip="row.tip">
              <i
                class="c-bar"
                :data-h="row.speed ?? undefined"
                :style="{
                  '--v': slowestFinger ? (row.ms ?? 0) / slowestFinger : 0,
                }"
              />
              <b>{{ row.ms === null ? "—" : Math.round(row.ms) }}</b>
              <span>{{ row.short }}</span>
            </div>
          </div>
          <div class="fingers__hands">
            <span>Left hand</span><span>Right hand</span>
          </div>
          <p class="sec__note">{{ fingerText }}</p>
        </section>

        <section class="sec s6">
          <header class="sec__h"><h2>Transitions</h2></header>
          <div class="sec__tools">
            <SegControl
              v-model="matrixMetric"
              label="Measure"
              :options="metricOptions"
            />
            <span class="sec__note">Row is the first key.</span>
          </div>
          <div class="mx-wrap">
            <div class="mx" role="img" :aria-label="MATRIX_LABEL">
              <span />
              <span v-for="column in matrix" :key="column.letter">{{
                column.letter
              }}</span>
              <template v-for="line in matrix" :key="line.letter">
                <span>{{ line.letter }}</span>
                <i
                  v-for="cell in line.cells"
                  :key="cell.pair"
                  :data-h="
                    (matrixMetric === 'speed' ? cell.speed : cell.error) ??
                    undefined
                  "
                  :data-s="
                    (matrixMetric === 'speed' ? cell.speed : cell.error) ===
                    null
                      ? 'x'
                      : undefined
                  "
                  :data-tip="cell.tip"
                />
              </template>
            </div>
          </div>
        </section>

        <section class="sec s6">
          <header class="sec__h"><h2>Slowest transitions</h2></header>
          <table v-if="slowest.length > 0" class="tbl">
            <thead>
              <tr>
                <th>Transition</th>
                <th class="n">Time</th>
                <th class="n">Errors</th>
                <th>Last typed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in slowest" :key="row.gram">
                <td>
                  <span class="gram">{{ row.gram }}</span>
                </td>
                <td class="n">{{ Math.round(row.ms) }} ms</td>
                <td class="n">{{ percentText(row.errorPercent) }}</td>
                <td>{{ shortDate(row.lastDate) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="sec__note">
            A transition shows up here after 5 timed presses.
          </p>
        </section>

        <section class="sec s4">
          <TrendChart
            v-if="hasValues(wpmTrend)"
            title="Speed, WPM"
            name="WPM"
            suffix=""
            :trend="wpmTrend"
          />
          <template v-else>
            <p class="chart__t">Speed, WPM</p>
            <p class="sec__note">No Words or Texts session in this period.</p>
          </template>
        </section>
        <section class="sec s4">
          <TrendChart
            v-if="hasValues(accuracyTrend)"
            title="Accuracy, %"
            name="Accuracy"
            suffix="%"
            :ceiling="100"
            :trend="accuracyTrend"
          />
          <template v-else>
            <p class="chart__t">Accuracy, %</p>
            <p class="sec__note">No Words or Texts session in this period.</p>
          </template>
        </section>
        <section class="sec s4">
          <TrendChart
            v-if="hasValues(rhythmTrend)"
            title="Rhythm evenness, %"
            name="Rhythm evenness"
            suffix="%"
            :ceiling="100"
            :trend="rhythmTrend"
          />
          <template v-else>
            <p class="chart__t">Rhythm evenness, %</p>
            <p class="sec__note">No Words or Texts session in this period.</p>
          </template>
        </section>

        <section class="sec s4">
          <header class="sec__h"><h2>Records</h2></header>
          <table v-if="records.length > 0" class="tbl">
            <tbody>
              <tr v-for="record in records" :key="record.label">
                <td>
                  <a
                    class="link"
                    href="#"
                    @click.prevent="stats.openPast(record.sid, 'statistics')"
                    >{{ record.label }}</a
                  >
                </td>
                <td class="n">{{ record.value }}</td>
                <td>{{ record.date }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="sec__note">
            Finish a session of 100 correct characters to set the first record.
          </p>
        </section>

        <section class="sec s8">
          <header class="sec__h"><h2>Recent sessions</h2></header>
          <RecentSessions :rows="recent" from="statistics" />
        </section>
      </div>
    </div>
  </AppShell>
</template>
