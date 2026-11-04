<script setup lang="ts">
import { onMounted } from "vue";
import { useAppStore } from "./stores/app";

const app = useAppStore();

onMounted(() => {
  void app.loadInfo();
});
</script>

<template>
  <main class="shell">
    <h1>Keymind</h1>
    <p v-if="app.info">Core {{ app.info.version }} is connected.</p>
    <p v-else-if="app.error" role="alert">
      Core is unavailable: {{ app.error }}
    </p>
    <p v-else>Connecting to the core…</p>
  </main>
</template>

<style scoped>
.shell {
  display: grid;
  place-content: center;
  min-height: 100vh;
  text-align: center;
}
</style>
