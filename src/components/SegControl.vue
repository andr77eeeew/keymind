<script setup lang="ts" generic="T extends string | number | null">
defineProps<{
  label: string;
  options: readonly { value: T; label: string }[];
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <span class="seg" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </span>
</template>
