<script setup lang="ts">
import { computed } from "vue";
import { sessionLine } from "../stats/tables";
import type { Screen } from "../stores/app";
import { useStatsStore } from "../stores/stats";
import type { SessionRow } from "../typing/api";

const props = defineProps<{
  rows: readonly SessionRow[];
  /** The screen the saved summaries go back to. */
  from: Screen;
}>();

const stats = useStatsStore();
const lines = computed(() => {
  const now = new Date();
  return props.rows.map((row) => sessionLine(row, now));
});
</script>

<template>
  <table class="tbl tbl--rows">
    <thead>
      <tr>
        <th>When</th>
        <th>Mode</th>
        <th class="n">Time</th>
        <th class="n">WPM</th>
        <th class="n">Accuracy</th>
        <th class="n">Target gain</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="line in lines" :key="line.sid">
        <td>
          <a
            class="link"
            href="#"
            @click.prevent="stats.openPast(line.sid, from)"
            >{{ line.when }}</a
          >
        </td>
        <td>{{ line.mode }}</td>
        <td class="n">{{ line.time }}</td>
        <td class="n">{{ line.wpm }}</td>
        <td class="n">{{ line.accuracy }}</td>
        <td class="n">
          <span v-if="line.gain.gram" class="gram">{{ line.gain.gram }}</span>
          {{ line.gain.text }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
