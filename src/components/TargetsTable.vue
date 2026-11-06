<script setup lang="ts">
import { computed } from "vue";
import { targetRows } from "../brain/view";
import type { SessionTarget } from "../typing/api";

const props = defineProps<{ targets: readonly SessionTarget[] }>();

const rows = computed(() => targetRows(props.targets));
</script>

<template>
  <table class="tbl">
    <thead>
      <tr>
        <th>Target</th>
        <th class="n">Before</th>
        <th class="n">This session</th>
        <th class="n">Change</th>
        <th class="n">Errors</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.gram">
        <td>
          <span class="gram">{{ row.gram }}</span>
        </td>
        <td class="n">{{ row.before }}</td>
        <td class="n">{{ row.now }}</td>
        <td class="n">
          <b class="delta">{{ row.change }}</b>
        </td>
        <td class="n">{{ row.errors }}</td>
      </tr>
    </tbody>
  </table>
  <p class="sec__note">
    Before is the brain's estimate at the start. A dash means too few samples to
    say.
  </p>
</template>
