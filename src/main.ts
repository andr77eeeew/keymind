import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
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

createApp(App).use(createPinia()).mount("#app");
