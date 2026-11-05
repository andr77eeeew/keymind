<script lang="ts">
import { contours, type Contours, type Hill } from "../relief/contours";

// The same seed everywhere, so the ground stays the same and only the hills grow. Tracing it takes a
// few milliseconds, so the last result is kept for when Home opens again with the same numbers.
const SEED = 7;
const DENSITY = 7;
let lastKey = "";
let lastGround: Contours | null = null;

function groundOf(hills: readonly Hill[]): Contours {
  const key = JSON.stringify(hills);
  if (lastGround === null || key !== lastKey) {
    lastGround = contours({ seed: SEED, density: DENSITY, hills });
    lastKey = key;
  }
  return lastGround;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import type { Pin } from "../stats/relief";
import KeyCaps from "./KeyCaps.vue";

const props = defineProps<{
  hills: readonly Hill[];
  pins: readonly Pin[];
  note?: string;
  flat?: boolean;
}>();

const ground = computed(() => groundOf(props.hills));
const targets = computed(() => props.pins.map((pin) => pin.code));

function pinStyle(pin: Pin): Record<string, string> {
  return {
    left: `calc(50% + ${pin.x} * (var(--key) + var(--key-gap)))`,
    top: `calc(50% + ${pin.y} * (var(--key) + var(--key-gap)))`,
  };
}
</script>

<template>
  <div class="map" :class="{ 'map--flat': flat }">
    <svg
      class="relief"
      :viewBox="ground.viewBox"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path class="relief__thin" :d="ground.thin" />
      <path class="relief__bold" :d="ground.bold" />
    </svg>
    <KeyCaps variant="map" :targets="targets" />
    <span
      v-for="pin in pins"
      :key="pin.code"
      class="pin"
      :style="pinStyle(pin)"
    >
      <b>{{ pin.name }}</b> {{ pin.text }}
    </span>
    <p v-if="note" class="map__note">{{ note }}</p>
  </div>
</template>
