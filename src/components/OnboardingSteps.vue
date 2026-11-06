<script setup lang="ts">
/** The first-launch steps of this stage. Layout joins them at stage 11 (SPEC, "Первый запуск"). */
defineProps<{ current: "theme" | "relief" }>();

const STEPS = [
  { id: "theme", name: "Theme" },
  { id: "test", name: "Starting test" },
  { id: "relief", name: "Your relief" },
] as const;
</script>

<template>
  <ol class="steps" aria-label="Setup steps">
    <li
      v-for="step in STEPS"
      :key="step.id"
      :aria-current="step.id === current ? 'step' : undefined"
    >
      {{ step.name }}
    </li>
  </ol>
</template>
