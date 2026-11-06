import type { Records, SessionRow } from "../typing/api";
import { clockText } from "../typing/summary";
import { localDate, shortDate } from "./trends";

const DASH = "—";
/** Below this a speed says nothing, the same as on the summary. */
const FEW_CHARS = 5;

const MODE_NAMES: Record<string, string> = {
  adaptive: "Adaptive",
  test: "Starting test",
  words: "Words",
  texts: "Texts",
  zen: "Zen",
};

export function modeName(mode: string): string {
  return MODE_NAMES[mode] ?? mode;
}

/** "Today, 12:04", "Yesterday, 18:40" or "Nov 2, 20:15", in the time of this computer. */
export function whenText(ts: string, now: Date): string {
  const moment = new Date(ts);
  if (Number.isNaN(moment.getTime())) {
    return DASH;
  }
  const hours = String(moment.getHours()).padStart(2, "0");
  const minutes = String(moment.getMinutes()).padStart(2, "0");
  const clock = `${hours}:${minutes}`;
  const date = localDate(moment);
  if (date === localDate(now)) {
    return `Today, ${clock}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === localDate(yesterday)) {
    return `Yesterday, ${clock}`;
  }
  return `${shortDate(date)}, ${clock}`;
}

export interface SessionLine {
  sid: string;
  when: string;
  mode: string;
  time: string;
  wpm: string;
  accuracy: string;
}

export function sessionLine(row: SessionRow, now: Date): SessionLine {
  let accuracy = DASH;
  if (row.mode === "zen") {
    accuracy = "None";
  } else if (row.accuracy !== null) {
    accuracy = `${Math.round(row.accuracy)}%`;
  }
  return {
    sid: row.sid,
    when: whenText(row.ts, now),
    mode: modeName(row.mode),
    time: clockText(row.duration_ms),
    wpm: row.chars < FEW_CHARS ? DASH : String(Math.round(row.wpm)),
    accuracy,
  };
}

export interface RecordLine {
  label: string;
  value: string;
  date: string;
  sid: string;
}

export function recordLines(records: Records): RecordLine[] {
  const lines: RecordLine[] = [];
  if (records.best_wpm) {
    const { value, date, sid } = records.best_wpm;
    lines.push({
      label: "Best speed",
      value: `${Math.round(value)} WPM`,
      date: shortDate(date),
      sid,
    });
  }
  if (records.best_accuracy) {
    const { value, date, sid } = records.best_accuracy;
    lines.push({
      label: "Best accuracy",
      value: value === 100 ? "100%" : `${value.toFixed(1)}%`,
      date: shortDate(date),
      sid,
    });
  }
  return lines;
}
