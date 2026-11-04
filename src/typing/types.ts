// Mirrors the journal schema in src-tauri/src/journal/event.rs. See ADR-0003.

export const SCHEMA_VERSION = 1;

export type OnError = "continue" | "stop";
export type BackspacePolicy = "allowed" | "blocked";
export type Theme = "light" | "dark" | "system";

/** Mirrors `settings::Settings`. */
export interface Settings {
  on_error: OnError;
  backspace: BackspacePolicy;
  theme: Theme;
}

export type TextSource =
  | {
      kind: "words";
      seed: number;
      pool: number;
      count?: number;
      seconds?: number;
    }
  | { kind: "passage"; id: string }
  | { kind: "paste"; chars: number }
  | { kind: "import"; id: string; offset: number }
  | { kind: "zen" };

export type Mode = "words" | "texts" | "zen";
export type EndReason = "completed" | "aborted";

interface SessionEvent {
  v: number;
  sid: string;
  seq: number;
}

export interface SessionStarted extends SessionEvent {
  type: "session_started";
  ts: string;
  mode: Mode;
  layout: string;
  source: TextSource;
  settings: Settings;
  app: string;
}

export interface KeystrokeEvent extends SessionEvent {
  type: "keystroke";
  t: number;
  kind: "char" | "backspace" | "modifier";
  code: string;
  key?: string;
  expected?: string;
  correct?: boolean;
  pos?: number;
  mods?: string[];
  ignored?: "layout" | "policy";
}

export interface SessionMark extends SessionEvent {
  type: "session_paused" | "session_resumed";
  t: number;
}

export interface SessionEnded extends SessionEvent {
  type: "session_ended";
  t: number;
  reason: EndReason;
  duration: number;
}

export type JournalEvent =
  SessionStarted | KeystrokeEvent | SessionMark | SessionEnded;

/** Mirrors `stats::SessionSummary`. */
export interface SessionSummary {
  sid: string;
  reason: string | null;
  duration_ms: number;
  chars: number;
  correct: number;
  backspaces: number;
  cpm: number;
  wpm: number;
  accuracy: number | null;
  rhythm: number | null;
}

/** What a session needs to start. The text is ready before the typing screen opens. */
export interface SessionPlan {
  mode: Mode;
  /** Empty in Zen. */
  text: string;
  source: TextSource;
  /** A time limit for timed Words. */
  seconds?: number;
  /** Shown beside the mode, such as "Common 1000 · 25 words". */
  detail: string;
  /** Shown under the text, such as the author of a passage. */
  caption?: string;
  /** Where the text starts inside an imported file, to save progress. */
  importOffset?: number;
}
