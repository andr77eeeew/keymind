import type { BigramRow, KeyRow } from "../typing/api";
import { FINGER_NAMES, KEY_CAPS, type Finger, type KeyCap } from "./keyboard";

/** The layout the keyboard and the matrix draw. Other layouts arrive with their own keyboards. */
export const LAYOUT = "en-qwerty";

/** Below this a mean says little, so the screens say "too few samples" (ADR-0008). */
export const MIN_SAMPLES = 5;

/**
 * Speed is personal: a step is how far a time is from your own usual key. An absolute scale would
 * paint a beginner's whole keyboard in one colour, and say nothing about which key to work on.
 */
const SPEED_LIMITS = [0.85, 1, 1.15, 1.3, 1.5];
/** Errors stay absolute, because percentages already compare across people. */
const ERROR_LIMITS = [1.5, 2.5, 3.5, 4.5, 6.5];

export type Metric = "speed" | "errors";

function stepOf(value: number, limits: readonly number[]): number {
  const index = limits.findIndex((limit) => value < limit);
  return index === -1 ? limits.length : index;
}

export function speedStep(ms: number, median: number): number {
  return stepOf(ms / median, SPEED_LIMITS);
}

export function errorStep(percent: number): number {
  return stepOf(percent, ERROR_LIMITS);
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** What the rows of the core have in common. */
interface Counted {
  presses: number;
  samples: number;
  mean_ms: number | null;
  errors: number;
}

export interface Measured {
  /** `null` when too few presses were timed. */
  ms: number | null;
  errorPercent: number | null;
  speed: number | null;
  error: number | null;
}

function timed(row: Counted): number | null {
  return row.samples >= MIN_SAMPLES ? row.mean_ms : null;
}

function measure(row: Counted, median: number | null): Measured {
  const ms = timed(row);
  const errorPercent =
    row.presses >= MIN_SAMPLES ? (100 * row.errors) / row.presses : null;
  return {
    ms,
    errorPercent,
    speed: ms !== null && median ? speedStep(ms, median) : null,
    error: errorPercent === null ? null : errorStep(errorPercent),
  };
}

function medianTime(rows: readonly Counted[]): number | null {
  return medianOf(rows.map(timed).filter((ms): ms is number => ms !== null));
}

export function percentText(percent: number): string {
  return `${percent < 10 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}

function tipOf(name: string, measured: Measured): string {
  const time =
    measured.ms === null ? "too few samples" : `${Math.round(measured.ms)} ms`;
  return measured.errorPercent === null
    ? `${name}: ${time}`
    : `${name}: ${time}, ${percentText(measured.errorPercent)} errors`;
}

export interface KeyHeat extends Measured {
  cap: KeyCap;
  tip: string;
}

export function layoutKeys(keys: readonly KeyRow[]): KeyRow[] {
  return keys.filter((row) => row.layout === LAYOUT && KEY_CAPS.has(row.code));
}

/** One entry per key that was typed. A key with too few samples has no steps. */
export function keyHeat(keys: readonly KeyRow[]): Map<string, KeyHeat> {
  const rows = layoutKeys(keys);
  const median = medianTime(rows);
  const heat = new Map<string, KeyHeat>();
  for (const row of rows) {
    const cap = KEY_CAPS.get(row.code);
    if (cap) {
      const measured = measure(row, median);
      heat.set(row.code, { ...measured, cap, tip: tipOf(cap.name, measured) });
    }
  }
  return heat;
}

export interface FingerHeat extends Measured {
  finger: Finger;
  name: string;
  short: string;
  tip: string;
}

const SHORT_NAMES: Record<Finger, string> = {
  lp: "Pinky",
  lr: "Ring",
  lm: "Mid",
  li: "Index",
  lt: "Thumb",
  rt: "Thumb",
  ri: "Index",
  rm: "Mid",
  rr: "Ring",
  rp: "Pinky",
};

/** The left thumb presses nothing that is typed. The space bar belongs to the right one. */
const LEFT_FINGERS: readonly Finger[] = ["lp", "lr", "lm", "li"];
const RIGHT_FINGERS: readonly Finger[] = ["rt", "ri", "rm", "rr", "rp"];
export const FINGER_ORDER = [...LEFT_FINGERS, ...RIGHT_FINGERS];

/** Sums, not an average of key means, so a key pressed often counts for more. */
function pool(rows: readonly Counted[]): Counted {
  let presses = 0;
  let samples = 0;
  let time = 0;
  let errors = 0;
  for (const row of rows) {
    presses += row.presses;
    samples += row.samples;
    time += (row.mean_ms ?? 0) * row.samples;
    errors += row.errors;
  }
  return {
    presses,
    samples,
    mean_ms: samples > 0 ? time / samples : null,
    errors,
  };
}

/** One entry per finger of the chart, in the order of the hands. */
export function fingerHeat(keys: readonly KeyRow[]): FingerHeat[] {
  const rows = layoutKeys(keys);
  const median = medianTime(rows);
  return FINGER_ORDER.map((finger) => {
    const own = rows.filter((row) => KEY_CAPS.get(row.code)?.finger === finger);
    const measured = measure(pool(own), median);
    const name = FINGER_NAMES[finger];
    return {
      ...measured,
      finger,
      name,
      short: SHORT_NAMES[finger],
      tip: tipOf(name, measured),
    };
  });
}

/** The sentence under the chart. The thumb only ever presses Space, so it compares nothing. */
export function fingerNote(fingers: readonly FingerHeat[]): string {
  const base = "Average time to press, in ms.";
  const timedFingers = fingers.filter(
    (row): row is FingerHeat & { ms: number } =>
      row.ms !== null && row.finger !== "rt" && row.finger !== "lt",
  );
  if (timedFingers.length < 2) {
    return base;
  }
  const sorted = [...timedFingers].sort((a, b) => a.ms - b.ms);
  const fast = sorted[0];
  const slow = sorted[sorted.length - 1];
  const gap = Math.round(slow.ms - fast.ms);
  if (gap < 1) {
    return base;
  }
  const fastName = fast.name.toLowerCase();
  const slowName = slow.name.toLowerCase();
  return `${base} Your ${slowName} finger is ${gap} ms slower than your ${fastName}.`;
}

export interface MatrixCell extends Measured {
  pair: string;
  tip: string;
}

export interface MatrixRow {
  letter: string;
  cells: MatrixCell[];
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const LETTER = /^[a-zA-Z]$/;

function layoutBigrams(bigrams: readonly BigramRow[]): BigramRow[] {
  return bigrams.filter((row) => row.layout === LAYOUT);
}

/** The a to z matrix. Capitals fold into their letters, because the cell asks about the keys. */
export function transitionMatrix(bigrams: readonly BigramRow[]): MatrixRow[] {
  const groups = new Map<string, BigramRow[]>();
  for (const row of layoutBigrams(bigrams)) {
    if (LETTER.test(row.first) && LETTER.test(row.second)) {
      const pair = (row.first + row.second).toLowerCase();
      const group = groups.get(pair);
      if (group) {
        group.push(row);
      } else {
        groups.set(pair, [row]);
      }
    }
  }
  const pooled = new Map<string, Counted>();
  for (const [pair, group] of groups) {
    pooled.set(pair, pool(group));
  }
  const median = medianTime([...pooled.values()]);
  const empty: Counted = { presses: 0, samples: 0, mean_ms: null, errors: 0 };
  return ALPHABET.map((letter) => ({
    letter,
    cells: ALPHABET.map((second) => {
      const pair = letter + second;
      const measured = measure(pooled.get(pair) ?? empty, median);
      return { ...measured, pair, tip: tipOf(pair, measured) };
    }),
  }));
}

export interface SlowTransition {
  /** Ready to show, with a visible space. */
  gram: string;
  ms: number;
  errorPercent: number;
  lastDate: string;
}

const visible = (character: string): string =>
  character === " " ? "␣" : character;

/** Keeps the case, because a capital needs Shift and is a different movement of the hand. */
export function slowestTransitions(
  bigrams: readonly BigramRow[],
  limit = 8,
): SlowTransition[] {
  const slow: SlowTransition[] = [];
  for (const row of layoutBigrams(bigrams)) {
    // Enter only happens in Zen, and a line break has no sign that could be read here.
    const ms = timed(row);
    if (ms !== null && row.first !== "\n" && row.second !== "\n") {
      slow.push({
        gram: visible(row.first) + visible(row.second),
        ms,
        errorPercent: row.presses > 0 ? (100 * row.errors) / row.presses : 0,
        lastDate: row.last_date,
      });
    }
  }
  return slow.sort((a, b) => b.ms - a.ms).slice(0, limit);
}
