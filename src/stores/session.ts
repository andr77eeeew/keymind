import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
  cleanText,
  deleteImport,
  importFile,
  lastSetups,
  listImports,
  sessionSummary,
  statsStatus,
  type ImportedText,
  type LastSetupRow,
  type StatsStatus,
} from "../typing/api";
import { buildPlan, PlanError, type SessionSetup } from "../typing/plan";
import {
  explainImportError,
  homeChoices,
  mergeUsed,
  type Choice,
  type FailedImport,
  type Used,
} from "../typing/remembered";
import type { Mode, SessionPlan, SessionSummary } from "../typing/types";
import { useAppStore } from "./app";

export type WordsBy = "count" | "time";
export type TextSourceChoice = "passage" | "paste" | "import";

/** What a summary needs after the plan is gone. */
export interface EndedSession {
  plan: SessionPlan;
  /** How far the cursor came. */
  cursor: number;
  /** False when the last events have not reached the disk. */
  saved: boolean;
}

export interface FailedRow extends FailedImport {
  id: number;
  name: string;
}

/** The choices on the setup screen, the session plan, and the result of the last session. */
export const useSessionStore = defineStore("session", () => {
  const app = useAppStore();

  const mode = ref<Mode>("words");
  const wordsBy = ref<WordsBy>("count");
  const wordCount = ref(25);
  const wordSeconds = ref(60);
  const pool = ref(1000);
  const textSource = ref<TextSourceChoice>("passage");
  const difficulty = ref<number | null>(null);
  const pasted = ref("");
  const pasteCheck = ref<{ chars: number; removed: number } | null>(null);
  const imports = ref<ImportedText[]>([]);
  const importId = ref<string | null>(null);
  const libraryState = ref<"loading" | "ready" | "error">("loading");
  /** Names waiting to be imported. The first one is being read. */
  const importing = ref<string[]>([]);
  const failedImports = ref<FailedRow[]>([]);
  /** Notes under a file, such as how many characters were left out. */
  const importNotes = ref<Record<string, string>>({});
  const importError = ref<string | null>(null);

  // A plan can hold a whole book, and Vue must not walk it.
  const plan = shallowRef<SessionPlan | null>(null);
  const ended_ = shallowRef<EndedSession | null>(null);
  const summary = ref<SessionSummary | null>(null);
  const summaryFailed = ref(false);
  const startError = ref<string | null>(null);
  const starting = ref(false);

  const rows = ref<LastSetupRow[]>([]);
  /** Sessions that ended in this run, newest first. The projector reaches them a moment later. */
  const localUsed = ref<Used[]>([]);
  const setupsState = ref<"loading" | "ready" | "error">("loading");
  let choicesApplied = false;
  let idleSeen = false;
  let rebuilding = false;

  const used = computed(() => mergeUsed(rows.value, localUsed.value));
  /** Loading and failures show the default setup, because only a readable setup can be stuck. */
  const home = computed(() =>
    homeChoices(
      setupsState.value === "ready" && libraryState.value === "ready"
        ? used.value
        : [],
      imports.value,
    ),
  );
  /** Nothing typed yet, as opposed to not read yet. */
  const firstSession = computed(
    () => setupsState.value === "ready" && used.value.length === 0,
  );

  const selectedImport = computed(
    () => imports.value.find((item) => item.id === importId.value) ?? null,
  );

  function currentSetup(): SessionSetup | null {
    switch (mode.value) {
      case "adaptive":
        return { mode: "adaptive" };
      case "test":
        // The starting test has its own screen and never starts from here.
        return null;
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

  /** Puts a remembered setup into the choices of its mode. */
  function applyUsed(entry: Used): void {
    const { source } = entry;
    switch (source.kind) {
      case "words":
        pool.value = source.pool;
        if (source.seconds !== undefined) {
          wordsBy.value = "time";
          wordSeconds.value = source.seconds;
        } else {
          wordsBy.value = "count";
          wordCount.value = source.count ?? wordCount.value;
        }
        break;
      case "passage":
        textSource.value = "passage";
        difficulty.value = source.difficulty ?? null;
        break;
      case "paste":
        textSource.value = "paste";
        break;
      case "import":
        textSource.value = "import";
        if (imports.value.some((item) => item.id === source.id)) {
          importId.value = source.id;
        }
        break;
      case "zen":
      case "adaptive":
      case "test":
        // The brain or the test picks everything, so nothing is remembered.
        break;
    }
  }

  function applyRememberedOnce(): void {
    if (
      choicesApplied ||
      setupsState.value !== "ready" ||
      libraryState.value !== "ready" ||
      used.value.length === 0
    ) {
      return;
    }
    choicesApplied = true;
    // Oldest first, so that the newest setup of each mode is what stays.
    for (const entry of [...used.value].reverse()) {
      applyUsed(entry);
    }
    mode.value = used.value[0].mode;
  }

  async function loadSetups(): Promise<void> {
    try {
      const read = await lastSetups();
      if (rebuilding) {
        return;
      }
      rows.value = read;
      setupsState.value = "ready";
      applyRememberedOnce();
    } catch {
      setupsState.value = "error";
    }
  }

  /** The first read of Home. While the tables start from nothing they would only mislead. */
  async function loadHome(): Promise<void> {
    await refreshImports();
    try {
      const status = await statsStatus();
      if (status.state === "rebuilding" && !idleSeen) {
        rebuilding = true;
        return;
      }
      if (status.state === "failed") {
        setupsState.value = "error";
        return;
      }
    } catch {
      setupsState.value = "error";
      return;
    }
    await loadSetups();
  }

  function statusChanged(status: StatsStatus): void {
    if (status.state === "idle") {
      idleSeen = true;
      rebuilding = false;
      void loadSetups();
    } else if (status.state === "rebuilding" && !idleSeen) {
      rebuilding = true;
      setupsState.value = "loading";
    } else if (status.state === "failed" && setupsState.value !== "ready") {
      setupsState.value = "error";
    }
  }

  /** Opens the setup screen on a mode, with the same choices as a remembered setup. */
  function openSetup(entry: Used): void {
    startError.value = null;
    applyUsed(entry);
    mode.value = entry.mode;
    app.go("setup");
  }

  /** Prepares a session from the current choices and opens the typing screen. */
  async function start(): Promise<void> {
    const setup = currentSetup();
    if (setup === null) {
      startError.value = "Choose a file first.";
      app.go("setup");
      return;
    }
    starting.value = true;
    startError.value = null;
    try {
      begin(await buildPlan(setup));
    } catch (cause) {
      const what = setup.mode === "passage" ? "The passage" : "The text";
      startError.value =
        cause instanceof PlanError
          ? cause.message
          : `${what} could not be prepared. Nothing was started. Try again or pick another mode.`;
      app.go("setup");
    } finally {
      starting.value = false;
    }
  }

  /** Starts a remembered setup. One that cannot start opens its setup instead (ADR-0007). */
  async function startChoice(choice: Choice): Promise<void> {
    if (choice.noRepeat) {
      openSetup(choice.used);
      return;
    }
    applyUsed(choice.used);
    mode.value = choice.used.mode;
    await start();
  }

  function begin(next: SessionPlan): void {
    plan.value = next;
    summary.value = null;
    summaryFailed.value = false;
    app.go("typing");
  }

  function noteUsed(entry: Used): void {
    localUsed.value = [
      entry,
      ...localUsed.value.filter((other) => other.mode !== entry.mode),
    ];
  }

  /** Opens the result of a session, or goes home if nothing was typed. */
  async function ended(
    sid: string | null,
    cursor = 0,
    saved = true,
  ): Promise<void> {
    const finished = plan.value;
    plan.value = null;
    if (sid === null || finished === null) {
      app.go("home");
      return;
    }
    ended_.value = { plan: finished, cursor, saved };
    noteUsed({
      mode: finished.mode,
      source: finished.source,
      thisDevice: true,
    });
    summary.value = null;
    summaryFailed.value = false;
    // A session moved the offset of its file, and Next session may be pressed at once.
    const { source } = finished;
    if (source.kind === "import") {
      const item = imports.value.find((entry) => entry.id === source.id);
      if (item) {
        item.offset = (finished.importOffset ?? 0) + cursor;
      }
    }
    app.go("summary");
    if (!saved) {
      // The summary reads the journal, which does not have the end of this session yet.
      summaryFailed.value = true;
      return;
    }
    try {
      summary.value = await sessionSummary(sid);
      summaryFailed.value = summary.value === null;
    } catch {
      summaryFailed.value = true;
    }
    if (source.kind === "import") {
      await refreshImports();
    }
  }

  async function refreshImports(): Promise<void> {
    try {
      imports.value = await listImports();
      libraryState.value = "ready";
      importError.value = null;
      if (selectedImport.value === null) {
        importId.value = imports.value[0]?.id ?? null;
      }
      applyRememberedOnce();
    } catch {
      libraryState.value = "error";
    }
  }

  /** Files are read one at a time, because each import rewrites the list of texts. */
  let pump: Promise<void> | null = null;
  let failureId = 0;

  async function runImports(queue: File[]): Promise<void> {
    while (queue.length > 0) {
      const file = queue[0];
      try {
        const item = await importFile(file);
        await refreshImports();
        importId.value = item.id;
        if (item.removed > 0) {
          importNotes.value[item.id] =
            `Imported. ${item.removed.toLocaleString("en")} characters have no key on this layout and were left out.`;
        }
      } catch (cause) {
        failureId += 1;
        failedImports.value.push({
          id: failureId,
          name: file.name,
          ...explainImportError(String(cause)),
        });
      }
      queue.shift();
      importing.value.shift();
    }
    pump = null;
  }

  const queue: File[] = [];

  function addImports(files: readonly File[]): Promise<void> {
    queue.push(...files);
    importing.value.push(...files.map((file) => file.name));
    pump ??= runImports(queue);
    return pump;
  }

  function dismissFailure(id: number): void {
    failedImports.value = failedImports.value.filter(
      (failure) => failure.id !== id,
    );
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

  /** Counts what a paste leaves out, with the same cleaning that a session uses. */
  let pasteToken = 0;
  async function checkPaste(): Promise<void> {
    pasteToken += 1;
    const token = pasteToken;
    if (pasted.value.trim() === "") {
      pasteCheck.value = null;
      return;
    }
    try {
      const { text, removed } = await cleanText(pasted.value);
      if (token === pasteToken) {
        pasteCheck.value = { chars: text.length, removed };
      }
    } catch {
      // Starting reports the failure, so the count can simply stay away.
      pasteCheck.value = null;
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
    pasteCheck,
    imports,
    importId,
    libraryState,
    importing,
    failedImports,
    importNotes,
    importError,
    selectedImport,
    plan,
    endedSession: ended_,
    summary,
    summaryFailed,
    startError,
    starting,
    setupsState,
    home,
    firstSession,
    loadHome,
    statusChanged,
    openSetup,
    start,
    startChoice,
    begin,
    ended,
    refreshImports,
    addImports,
    dismissFailure,
    removeImport,
    checkPaste,
  };
});
