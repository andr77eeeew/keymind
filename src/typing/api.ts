import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  JournalEvent,
  SessionSummary,
  Settings,
  TextSource,
} from "./types";

// One typed function per Tauri command, so the rest of the UI never spells a command name.

export interface Passage {
  id: string;
  text: string;
  source: string;
  difficulty: number;
}

export interface CleanText {
  text: string;
  removed: number;
}

export interface ImportedText {
  id: string;
  title: string;
  chars: number;
  removed: number;
  offset: number;
}

/** Mirrors `queries::LastSetup`. */
export interface LastSetupRow {
  mode: string;
  sid: string;
  ts: string;
  source: TextSource | null;
  this_device: boolean;
}

/** Mirrors `ProjectorStatus`, as far as the UI needs it. */
export type StatsStatus =
  | { state: "working" | "rebuilding" }
  | { state: "idle" }
  | { state: "failed"; message: string };

/** Mirrors `queries::KeyRow`. */
export interface KeyRow {
  layout: string;
  code: string;
  presses: number;
  samples: number;
  mean_ms: number | null;
  errors: number;
}

/** Mirrors `queries::BigramRow`. */
export interface BigramRow {
  layout: string;
  first: string;
  second: string;
  presses: number;
  samples: number;
  mean_ms: number | null;
  errors: number;
  last_date: string;
}

/** Mirrors `queries::DayRow`. */
export interface DayRow {
  date: string;
  sessions: number;
  duration_ms: number;
  wpm: number | null;
  accuracy: number | null;
  rhythm: number | null;
}

export interface StatsRecord {
  value: number;
  sid: string;
  date: string;
}

export interface Records {
  best_wpm: StatsRecord | null;
  best_accuracy: StatsRecord | null;
}

/** Mirrors `queries::SessionRow`. It has every field of a `SessionSummary`. */
export interface SessionRow extends SessionSummary {
  ts: string;
  mode: string;
  source: TextSource | null;
}

export interface Skipped {
  bad_lines: number;
  unknown: number;
  duplicates: number;
  orphans: number;
}

/** Mirrors `queries::StatsOverview`. Records and recent sessions ignore the period. */
export interface StatsOverview {
  keys: KeyRow[];
  bigrams: BigramRow[];
  days: DayRow[];
  records: Records;
  recent: SessionRow[];
  skipped: Skipped;
}

export function appendEvents(events: JournalEvent[]): Promise<void> {
  return invoke("append_events", { events });
}

export function sessionSummary(sid: string): Promise<SessionSummary | null> {
  return invoke("session_summary", { sid });
}

export function generateWords(
  pool: number,
  count: number,
  seed: number,
): Promise<string> {
  return invoke("generate_words", { pool, count, seed });
}

/** Mirrors `brain::model::Estimate`. */
export interface Estimate {
  ms: number;
  ms_upper: number;
  error: number;
  error_upper: number;
  confidence: number;
  samples: number;
  total_samples: number;
  mastered: boolean;
}

export interface BrainTarget {
  gram: string;
  estimate: Estimate;
}

/** Mirrors `brain::heuristic::Choice`. */
export interface BrainChoice {
  letters: { open: string[]; next: string | null; new: string[] };
  focus: string;
  reason: "new" | "slow" | "errors";
  targets: BrainTarget[];
  review: BrainTarget[];
  chars_per_minute: number;
}

/** Mirrors `commands::AdaptivePlan`. */
export interface AdaptivePlan {
  text: string;
  source: Extract<TextSource, { kind: "adaptive" }>;
  choice: BrainChoice;
  /** False when the statistics could not be read and the brain started from nothing. */
  informed: boolean;
}

/** `today` is the local date, which only the UI knows. */
export function nextAdaptive(
  seed: number,
  today: string,
): Promise<AdaptivePlan> {
  return invoke("next_adaptive", { seed, today });
}

export function brainNext(today: string): Promise<BrainChoice> {
  return invoke("brain_next", { today });
}

export function pickPassage(
  difficulty: number | null,
  seed: number,
): Promise<Passage> {
  return invoke("pick_passage", { difficulty, seed });
}

export function cleanText(text: string): Promise<CleanText> {
  return invoke("clean_text", { text });
}

/** The file goes as a raw body, because a JSON array of a whole book would be slow and large. */
export async function importFile(file: File): Promise<ImportedText> {
  const body = new Uint8Array(await file.arrayBuffer());
  return invoke("import_file", body, {
    headers: { "x-file-name": encodeURIComponent(file.name) },
  });
}

export function listImports(): Promise<ImportedText[]> {
  return invoke("list_imports");
}

export function loadImport(id: string): Promise<string> {
  return invoke("load_import", { id });
}

export function saveImportOffset(id: string, offset: number): Promise<void> {
  return invoke("save_import_offset", { id, offset });
}

export function deleteImport(id: string): Promise<void> {
  return invoke("delete_import", { id });
}

export function lastSetups(): Promise<LastSetupRow[]> {
  return invoke("last_setups");
}

export function statsStatus(): Promise<StatsStatus> {
  return invoke("stats_status");
}

/** `fromDate` is the local `YYYY-MM-DD` a period starts on, or `null` for all time. */
export function statsOverview(fromDate: string | null): Promise<StatsOverview> {
  return invoke("stats_overview", { fromDate });
}

export function statsSession(sid: string): Promise<SessionRow | null> {
  return invoke("stats_session", { sid });
}

/** Returns at once. The status events follow the work. */
export function rebuildStats(): Promise<void> {
  return invoke("rebuild_stats");
}

/** The projector reports here while it works. Returns a function that stops listening. */
export function onStatsStatus(
  handler: (status: StatsStatus) => void,
): Promise<() => void> {
  return listen<StatsStatus>("stats-status", (event) => handler(event.payload));
}

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<Settings> {
  return invoke("set_setting", { key, value });
}

export function asksForTheme(): Promise<boolean> {
  return invoke("asks_for_theme");
}
