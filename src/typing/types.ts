// Mirrors the journal schema in src-tauri/src/journal/event.rs. See ADR-0003.

export const SCHEMA_VERSION = 1;

export type OnError = "continue" | "stop";
export type BackspacePolicy = "allowed" | "blocked";
export type Theme = "light" | "dark" | "system";
export type LetterPolicy = "gradual" | "all";

/** Mirrors `settings::Settings`. */
export interface Settings {
  on_error: OnError;
  backspace: BackspacePolicy;
  theme: Theme;
  live_figures: boolean;
  theme_chosen: boolean;
  letters: LetterPolicy;
}

/** Mirrors `journal::event::Recipe`. */
export interface Recipe {
  v: number;
  brain: string;
  letters: string;
  focus: string;
  review?: string[];
  words: number;
  /** The focus key first, then transitions into it. Early recipes have none. */
  targets?: string[];
  /** Estimates at the start, only for targets with enough samples to know. */
  before: Record<string, number>;
}

export type TextSource =
  | {
      kind: "words";
      seed: number;
      pool: number;
      count?: number;
      seconds?: number;
    }
  | { kind: "passage"; id: string; difficulty?: number }
  | { kind: "paste"; chars: number }
  | { kind: "import"; id: string; offset: number }
  | { kind: "zen" }
  | { kind: "adaptive"; seed: number; recipe: Recipe }
  | { kind: "test"; passages: string[]; seconds: number };

export type Mode = "adaptive" | "words" | "texts" | "zen" | "test";
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
  /** Shown beside the mode, such as "25 words, top 1,000". Empty in Zen. */
  detail: string;
  /** Letters and transitions in focus, shown beside the mode of an adaptive session. */
  focus?: string[];
  /** Shown under the text, such as the author of a passage. */
  caption?: string;
  /** Author, title and year of a passage. */
  passageSource?: string;
  /** Where the text starts inside an imported file, to save progress. */
  importOffset?: number;
  /** The length of the whole imported file. */
  importChars?: number;
}
