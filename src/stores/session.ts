import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
  deleteImport,
  importFile,
  listImports,
  sessionSummary,
  type ImportedText,
} from "../typing/api";
import { buildPlan, PlanError, type SessionSetup } from "../typing/plan";
import type { SessionPlan, SessionSummary } from "../typing/types";
import { useAppStore } from "./app";

export type HomeMode = "words" | "texts" | "zen";
export type WordsBy = "count" | "time";
export type TextSourceChoice = "passage" | "paste" | "import";

/** The choices on the home screen, the session plan, and the result of the last session. */
export const useSessionStore = defineStore("session", () => {
  const app = useAppStore();

  const mode = ref<HomeMode>("words");
  const wordsBy = ref<WordsBy>("count");
  const wordCount = ref(25);
  const wordSeconds = ref(60);
  const pool = ref(1000);
  const textSource = ref<TextSourceChoice>("passage");
  const difficulty = ref<number | null>(null);
  const pasted = ref("");
  const imports = ref<ImportedText[]>([]);
  const importId = ref<string | null>(null);

  // A plan can hold a whole book, and Vue must not walk it.
  const plan = shallowRef<SessionPlan | null>(null);
  const summary = ref<SessionSummary | null>(null);
  const summaryFailed = ref(false);
  const startError = ref<string | null>(null);
  const importNote = ref<string | null>(null);
  const importError = ref<string | null>(null);
  const starting = ref(false);

  const selectedImport = computed(
    () => imports.value.find((item) => item.id === importId.value) ?? null,
  );

  function currentSetup(): SessionSetup | null {
    switch (mode.value) {
      case "words":
        return wordsBy.value === "count"
          ? {
              mode: "words",
              by: "count",
              count: wordCount.value,
              pool: pool.value,
            }
          : {
              mode: "words",
              by: "time",
              seconds: wordSeconds.value,
              pool: pool.value,
            };
      case "zen":
        return { mode: "zen" };
      case "texts":
        if (textSource.value === "passage") {
          return { mode: "passage", difficulty: difficulty.value };
        }
        if (textSource.value === "paste") {
          return { mode: "paste", text: pasted.value };
        }
        return selectedImport.value
          ? { mode: "import", item: selectedImport.value }
          : null;
    }
  }

  /** Prepares a session from the current choices and opens the typing screen. */
  async function start(): Promise<void> {
    const setup = currentSetup();
    if (setup === null) {
      startError.value = "Choose a file first.";
      app.go("home");
      return;
    }
    starting.value = true;
    startError.value = null;
    try {
      begin(await buildPlan(setup));
    } catch (cause) {
      startError.value =
        cause instanceof PlanError
          ? cause.message
          : `The text could not be prepared: ${String(cause)}`;
      app.go("home");
    } finally {
      starting.value = false;
    }
  }

  function begin(next: SessionPlan): void {
    plan.value = next;
    summary.value = null;
    summaryFailed.value = false;
    app.go("typing");
  }

  /** Opens the result of a session, or goes home if nothing was typed. */
  async function ended(sid: string | null): Promise<void> {
    plan.value = null;
    if (sid === null) {
      app.go("home");
      return;
    }
    app.go("summary");
    try {
      summary.value = await sessionSummary(sid);
    } catch {
      summaryFailed.value = true;
    }
    // A finished session moved the offset of its file.
    if (mode.value === "texts" && textSource.value === "import") {
      await refreshImports();
    }
  }

  async function refreshImports(): Promise<void> {
    try {
      imports.value = await listImports();
      importError.value = null;
      if (importId.value === null && imports.value.length > 0) {
        importId.value = imports.value[0].id;
      }
    } catch (cause) {
      importError.value = `The library could not be read: ${String(cause)}`;
    }
  }

  async function addImport(file: File): Promise<void> {
    importNote.value = null;
    importError.value = null;
    try {
      const item = await importFile(file);
      await refreshImports();
      importId.value = item.id;
      importNote.value =
        item.removed > 0
          ? `Imported. ${item.removed} characters have no key on this layout and were left out.`
          : "Imported.";
    } catch (cause) {
      importError.value = `This file could not be imported: ${String(cause)}`;
    }
  }

  async function removeImport(id: string): Promise<void> {
    try {
      await deleteImport(id);
      if (importId.value === id) {
        importId.value = null;
      }
      await refreshImports();
    } catch (cause) {
      importError.value = `This file could not be removed: ${String(cause)}`;
    }
  }

  return {
    mode,
    wordsBy,
    wordCount,
    wordSeconds,
    pool,
    textSource,
    difficulty,
    pasted,
    imports,
    importId,
    plan,
    summary,
    summaryFailed,
    startError,
    importNote,
    importError,
    starting,
    start,
    begin,
    ended,
    refreshImports,
    addImport,
    removeImport,
  };
});
