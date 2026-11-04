/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],

  // Keep Rust compile errors visible in the `tauri dev` terminal.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port (see `devUrl` in tauri.conf.json).
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
