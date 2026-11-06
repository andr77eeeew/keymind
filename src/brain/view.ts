// What the brain's numbers say, in words, for the summary, Home and the Brain screen. Pure, so the
// wording is tested without a screen.
import type { BrainTarget, BrainView, SessionTarget } from "../typing/api";
import { localDate, shortDate } from "../stats/trends";

const DASH = "—";
const MINUS = "−";
/** Below this a mean time in one session says little. The same as "too few samples" elsewhere. */
export const ENOUGH_SAMPLES = 5;

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** "−24 ms", "+12 ms" or "0 ms". */
function signedMs(change: number): string {
  if (change < 0) {
    return `${MINUS}${-change} ms`;
  }
  return change > 0 ? `+${change} ms` : "0 ms";
}

/** The mean time of a target in this session, when there were enough samples. */
function measured(target: SessionTarget): number | null {
  return target.samples >= ENOUGH_SAMPLES ? target.ms : null;
}

/** The change in whole milliseconds, or `null` when one side is missing. */
export function targetChange(target: SessionTarget): number | null {
  const after = measured(target);
  if (after === null || target.before_ms === null) {
    return null;
  }
  // Rounding each side first keeps the change equal to what the two columns show.
  return Math.round(after) - Math.round(target.before_ms);
}

export interface TargetRow {
  gram: string;
  before: string;
  now: string;
  change: string;
  errors: string;
}

export function targetRows(targets: readonly SessionTarget[]): TargetRow[] {
  return targets.map((target) => {
    const after = measured(target);
    const change = targetChange(target);
    return {
      gram: target.gram,
      before: target.before_ms === null ? DASH : ms(target.before_ms),
      now: after === null ? DASH : ms(after),
      change: change === null ? DASH : signedMs(change),
      errors:
        target.presses === 0
          ? DASH
          : percent((100 * target.errors) / target.presses),
    };
  });
}

/** A heading with a gram in it, split so the gram can be styled. */
export interface GramHeading {
  lead: string;
  gram: string;
  tail: string;
}

/** What the session did to its focus key, or `null` when that cannot be said. */
export function targetHeading(
  targets: readonly SessionTarget[],
): GramHeading | null {
  const focus = targets[0];
  if (focus === undefined) {
    return null;
  }
  const change = targetChange(focus);
  if (change === null) {
    return null;
  }
  if (change <= -1) {
    return { lead: "You moved ", gram: focus.gram, tail: ` by ${-change} ms` };
  }
  if (change >= 1) {
    return {
      lead: "",
      gram: focus.gram,
      tail: ` was ${change} ms slower this time`,
    };
  }
  return { lead: "", gram: focus.gram, tail: " held steady" };
}

/** The Target gain column: the focus key and its change. */
export interface TargetGain {
  gram: string | null;
  text: string;
}

export function targetGain(
  mode: string,
  targets: readonly SessionTarget[],
): TargetGain {
  if (mode !== "adaptive") {
    return { gram: null, text: DASH };
  }
  const focus = targets[0];
  const change = focus === undefined ? null : targetChange(focus);
  if (focus === undefined || change === null) {
    return { gram: null, text: "None" };
  }
  return { gram: focus.gram, text: signedMs(change) };
}

/** Why the focus key was chosen, with the number the choice rests on. */
export function whyLine(view: BrainView): string {
  const focus = view.targets[0];
  const key = view.focus;
  if (focus === undefined) {
    return `The brain starts with ${key}.`;
  }
  const { estimate } = focus;
  const bar = view.bar;
  switch (view.reason) {
    case "new":
      return view.letters.new.includes(key)
        ? `${key} has just opened, so it needs its first samples.`
        : `${key} has too few recent samples to judge, so it comes first.`;
    case "slow":
      return estimate.ms > bar.ms
        ? `${key} takes about ${ms(estimate.ms)}, and the bar is ${ms(bar.ms)}.`
        : `${key} takes about ${ms(estimate.ms)} but may take up to ${ms(estimate.ms_upper)}. The bar is ${ms(bar.ms)}.`;
    case "errors":
      return estimate.error > bar.errors
        ? `${key} is wrong ${percent(100 * estimate.error)} of the time, and the bar is ${Math.round(100 * bar.errors)}%.`
        : `${key} is wrong about ${percent(100 * estimate.error)} of the time but may be up to ${percent(100 * estimate.error_upper)}. The bar is ${Math.round(100 * bar.errors)}%.`;
  }
}

export interface RecipeLine {
  label: string;
  value: string;
}

function share(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function recipeLines(view: BrainView): RecipeLine[] {
  return [
    { label: `Words with ${view.focus}`, value: share(view.shares.focus) },
    {
      label: view.review.length > 0 ? "Review" : "Review, nothing is due",
      value: share(view.shares.review),
    },
    { label: "Any open letters", value: share(view.shares.general) },
    { label: "Length", value: `About ${Math.round(view.minutes)} min` },
  ];
}

export type LetterState = "bar" | "samples" | "slow" | "errors";

export interface LetterRow {
  gram: string;
  time: string;
  errors: string;
  state: LetterState;
  stateText: string;
}

const STATE_TEXT: Record<LetterState, string> = {
  bar: "Within the bar",
  samples: "Needs samples",
  slow: "Too slow",
  errors: "Too many errors",
};

function letterState(target: BrainTarget, view: BrainView): LetterState {
  const { estimate } = target;
  if (target.meets_bar) {
    return "bar";
  }
  if (estimate.samples < view.bar.samples) {
    return "samples";
  }
  return estimate.ms > view.bar.ms ? "slow" : "errors";
}

/** Each open letter against the bar. A letter with too few samples shows no figures. */
export function letterRows(view: BrainView): LetterRow[] {
  return view.open_keys.map((target) => {
    const state = letterState(target, view);
    const known = state !== "samples";
    return {
      gram: target.gram,
      time: known ? ms(target.estimate.ms) : DASH,
      errors: known ? percent(100 * target.estimate.error) : DASH,
      state,
      stateText: STATE_TEXT[state],
    };
  });
}

/** The line over the letters: how many keep within the bar, and what opens next. */
export function lettersLine(view: BrainView): string {
  const open = view.open_keys.length;
  const within = view.open_keys.filter((target) => target.meets_bar).length;
  const bar = `${ms(view.bar.ms)} and ${Math.round(100 * view.bar.errors)}% errors`;
  const count = `${within} of ${open} open letters keep within the bar of ${bar}.`;
  if (view.letters.next === null) {
    return `${count} Every letter is open.`;
  }
  return `${count} ${view.letters.next} opens once all of them do.`;
}

/** "Today", "Yesterday" or "Nov 2". */
export function dayText(date: string | null, today: string): string {
  if (date === null) {
    return "Never";
  }
  if (date === today) {
    return "Today";
  }
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  return date === localDate(yesterday) ? "Yesterday" : shortDate(date);
}
