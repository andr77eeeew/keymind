<script lang="ts">
export interface KeyMark {
  /** The step of the heat scale. A key without one is outlined. */
  step: number | null;
  tip?: string;
  /** The small figure under the letter. */
  value?: string;
}
</script>

<script setup lang="ts">
import { ROWS } from "../stats/keyboard";

defineProps<{
  variant: "map" | "heat";
  /** Keys underlined as weak. */
  targets?: readonly string[];
  marks?: ReadonlyMap<string, KeyMark>;
}>();
</script>

<template>
  <div class="kbd" :class="`kbd--${variant}`" aria-hidden="true">
    <div v-for="(row, index) in ROWS" :key="index" class="kbd__row">
      <span
        v-for="cap in row"
        :key="cap.code"
        class="key"
        :class="{
          'key--mod': cap.modifier,
          'key--home': cap.home,
          'key--target': targets?.includes(cap.code),
        }"
        :data-code="cap.code"
        :data-alt="cap.alt"
        :data-h="marks?.get(cap.code)?.step ?? undefined"
        :data-tip="marks?.get(cap.code)?.tip"
        :style="cap.width === 1 ? undefined : { '--u': cap.width }"
      >
        <span class="key__l">{{ cap.label }}</span>
        <small v-if="marks?.get(cap.code)?.value" class="key__v">{{
          marks?.get(cap.code)?.value
        }}</small>
      </span>
    </div>
  </div>
</template>
