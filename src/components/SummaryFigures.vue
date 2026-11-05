<script setup lang="ts">
import type { SummaryContent } from "../typing/summary";

defineProps<{ content: SummaryContent }>();
</script>

<template>
  <div class="result">
    <div class="result__lead">
      <div
        v-for="figure in content.lead"
        :key="figure.label"
        class="figure figure--lead"
      >
        <b>{{ figure.value }}</b>
        <span>{{ figure.label }}</span>
      </div>
    </div>
    <div class="result__rest">
      <div v-for="figure in content.rest" :key="figure.label" class="figure">
        <b>{{ figure.value }}</b>
        <span>{{ figure.label }}</span>
      </div>
    </div>
    <p class="result__note">{{ content.note }}</p>
  </div>
</template>
