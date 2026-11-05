import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { useAppStore } from "./stores/app";
import { useSettingsStore } from "./stores/settings";
import { asksForTheme } from "./typing/api";
// Bundled, because the app works offline. Only the Latin subset: the UI and the only layout so far
// are English, and later stages add Cyrillic when the Russian and Ukrainian layouts arrive.
import "@fontsource/golos-text/latin-400.css";
import "@fontsource/golos-text/latin-500.css";
import "@fontsource/golos-text/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "../design/tokens.css";
import "./styles/relief.css";
import "./styles/app.css";

/**
 * The window is still hidden here. The first screen and its theme are settled before anything is
 * drawn, which takes two short calls, and the app starts on its defaults if they fail.
 */
async function start(): Promise<void> {
  const pinia = createPinia();
  const settings = useSettingsStore(pinia);
  settings.paint();
  const [, asks] = await Promise.all([
    settings.load(),
    asksForTheme().catch(() => false),
  ]);
  if (asks) {
    useAppStore(pinia).go("onboarding");
  }
  createApp(App).use(pinia).mount("#app");
}

void start();
