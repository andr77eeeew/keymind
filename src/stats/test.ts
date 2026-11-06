import type { Hill } from "../relief/contours";
import type { KeyRow, SessionRow } from "../typing/api";
import { summaryFigures, type Figure } from "../typing/summary";
import { layoutKeys, MIN_SAMPLES } from "./heat";
import { FEW_SESSIONS, reliefHills, weakestPins, type Pin } from "./relief";

/** The map of a starting test: its own keys, at full height, with the two weakest pinned. */
export interface TestMap {
  hills: Hill[];
  pins: Pin[];
  note?: string;
}

/**
 * `null` when no key has enough samples to say anything. The test is the whole map here, so it is
 * drawn at full height rather than lowered like a map of a few sessions, and the title already says
 * it is a start.
 */
export function testMap(keys: readonly KeyRow[]): TestMap | null {
  if (!layoutKeys(keys).some((row) => row.samples >= MIN_SAMPLES)) {
    return null;
  }
  const hills = reliefHills(keys, FEW_SESSIONS);
  return {
    hills,
    pins: weakestPins(keys),
    note:
      hills.length === 0
        ? "No key stood out, so the ground is flat."
        : undefined,
  };
}

/** WPM, accuracy and rhythm evenness, worded as on a summary. */
export function testFigures(row: SessionRow): Figure[] {
  const { lead, rest } = summaryFigures(false, false, row);
  return [...lead, ...rest].filter((figure) =>
    ["WPM", "Accuracy", "Rhythm evenness"].includes(figure.label),
  );
}
