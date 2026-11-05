<script setup lang="ts">
import { useAppStore, type Screen } from "../stores/app";

const app = useAppStore();

// Later stages add Brain and Progress here, as the mockups show.
const items: { screen: Screen; label: string }[] = [
  { screen: "home", label: "Home" },
  { screen: "statistics", label: "Statistics" },
  { screen: "settings", label: "Settings" },
];

function isCurrent(screen: Screen): boolean {
  if (app.screen === "past") {
    return screen === app.pastFrom;
  }
  return (
    app.screen === screen || (screen === "home" && app.screen === "summary")
  );
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <a
        class="wordmark"
        href="#"
        aria-label="Keymind home"
        @click.prevent="app.go('home')"
        >Keymind</a
      >
      <nav class="nav" aria-label="Main">
        <a
          v-for="item in items"
          :key="item.screen"
          class="nav__item"
          href="#"
          :aria-current="isCurrent(item.screen) ? 'page' : undefined"
          @click.prevent="app.go(item.screen)"
          >{{ item.label }}</a
        >
      </nav>
    </header>
    <main class="content">
      <slot />
    </main>
  </div>
</template>
