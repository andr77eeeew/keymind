import { bookOf } from "./plan";
import { readPercent, wordsLine } from "./remembered";
import type { SessionPlan, SessionSummary } from "./types";

export interface Figure {
  value: string;
  label: string;
}

export interface SummaryContent {
  heading: string;
  /** The line under the heading: what the session was. */
  sub: string;
  lead: Figure[];
  rest: Figure[];
  note: string;
}

export interface ReadingProgress {
  /** Percent of the whole file. */
  value: number;
  text: string;
  finished: boolean;
}

const RHYTHM_NOTE =
  "Rhythm evenness is how steady the gaps between your keys were. Higher is steadier.";
const EARLY_NOTE = "These figures cover what you typed.";
const TOO_FEW_NOTE = "A dash means too few presses to measure.";
const ZEN_NOTE = "Zen has no text to compare with, so it has no accuracy.";
/** Below this a speed says nothing, because one press decides it. */
const FEW_CHARS = 5;
const DASH = "—";

export function clockText(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** Words begun, counting the one the cursor stands in. */
export function wordsReached(text: string, cursor: number): number {
  if (cursor <= 0) {
    return 0;
  }
  let count = 1;
  for (let i = 1; i < cursor && i < text.length; i += 1) {
    if (text[i] !== " " && text[i - 1] === " ") {
      count += 1;
    }
  }
  return count;
}

function subLine(
  plan: SessionPlan,
  early: boolean,
  cursor: number,
  durationMs: number,
): string {
  const { source } = plan;
  switch (source.kind) {
    case "words":
      if (source.seconds !== undefined) {
        return early
          ? `Words, stopped at ${clockText(durationMs)} of ${clockText(source.seconds * 1000)}`
          : `Words, ${wordsLine(source.pool, undefined, source.seconds).replace(", words", "")}`;
      }
      return early
        ? `Words, stopped at ${wordsReached(plan.text, cursor)} of ${source.count ?? 0} words`
        : `Words, ${wordsLine(source.pool, source.count)}`;
    case "passage": {
      const book = plan.passageSource ? bookOf(plan.passageSource) : null;
      return book
        ? `A passage from ${book.title}, by ${book.author}`
        : "A passage from a public-domain book";
    }
    case "paste":
      return "Your text";
    case "import":
      return `${plan.detail}, your file`;
    case "zen":
      return "Zen, free typing";
  }
}

function accuracyText(accuracy: number | null): string {
  if (accuracy === null) {
    return DASH;
  }
  return accuracy === 100 ? "100%" : `${accuracy.toFixed(1)}%`;
}

/** The figures and their note, which a fresh and a saved summary share. */
export function summaryFigures(
  zen: boolean,
  early: boolean,
  summary: SessionSummary,
): Pick<SummaryContent, "heading" | "lead" | "rest" | "note"> {
  const few = summary.chars < FEW_CHARS;
  const wpm = few ? DASH : String(Math.round(summary.wpm));
  const cpm = few ? DASH : String(Math.round(summary.cpm));
  const rhythm = {
    value: summary.rhythm === null ? DASH : `${Math.round(summary.rhythm)}%`,
    label: "Rhythm evenness",
  };
  const time = { value: clockText(summary.duration_ms), label: "Time" };

  let note = RHYTHM_NOTE;
  if (few) {
    note = TOO_FEW_NOTE;
  } else if (early) {
    note = `${EARLY_NOTE} ${RHYTHM_NOTE}`;
  }
  if (zen) {
    note = `${note} ${ZEN_NOTE}`;
  }

  return {
    heading: early ? "Session ended early" : "Session complete",
    lead: zen
      ? [{ value: wpm, label: "WPM" }, time]
      : [
          { value: wpm, label: "WPM" },
          { value: accuracyText(summary.accuracy), label: "Accuracy" },
        ],
    rest: zen
      ? [{ value: cpm, label: "CPM" }, rhythm]
      : [{ value: cpm, label: "CPM" }, rhythm, time],
    note,
  };
}

/** Everything the summary says, so its wording can be tested without a screen. */
export function summaryContent(
  plan: SessionPlan,
  summary: SessionSummary,
  cursor: number,
): SummaryContent {
  const early = summary.reason === "aborted";
  return {
    ...summaryFigures(plan.mode === "zen", early, summary),
    sub: subLine(plan, early, cursor, summary.duration_ms),
  };
}

/** How far a file has been read after this session, or null for anything else. */
export function readingProgress(
  plan: SessionPlan,
  cursor: number,
): ReadingProgress | null {
  if (plan.importOffset === undefined || plan.importChars === undefined) {
    return null;
  }
  const before = readPercent(plan.importOffset, plan.importChars);
  const after = readPercent(plan.importOffset + cursor, plan.importChars);
  return {
    value: after,
    text: after > before ? `${after}%, up from ${before}%` : `${after}%`,
    finished: plan.importOffset + cursor >= plan.importChars,
  };
}
