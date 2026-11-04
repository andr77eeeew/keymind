import { invoke } from "@tauri-apps/api/core";
import type { JournalEvent, SessionSummary, Settings } from "./types";

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

export function appendEvents(events: JournalEvent[]): Promise<void> {
  return invoke("append_events", { events });
}

export function sessionSummary(sid: string): Promise<SessionSummary> {
  return invoke("session_summary", { sid });
}

export function generateWords(
  pool: number,
  count: number,
  seed: number,
): Promise<string> {
  return invoke("generate_words", { pool, count, seed });
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

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<Settings> {
  return invoke("set_setting", { key, value });
}
