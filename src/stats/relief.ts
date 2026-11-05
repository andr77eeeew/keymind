import type { Hill } from "../relief/contours";
import type { KeyRow } from "../typing/api";
import { layoutKeys, medianOf, MIN_SAMPLES, percentText } from "./heat";
import { KEY_CAPS, KEY_POSITIONS, type KeyPosition } from "./keyboard";

/** Below this many sessions the map is drawn lower and says it will still change (ADR-0008). */
export const FEW_SESSIONS = 10;

/** The ground is 30 pitches wide and 5.6 high, and the keyboard sits in its middle. */
const GROUND_X = 7.5;
const GROUND_Y = 0.3;

/** A key this much slower than your usual one is a full hill. */
const FULL_SLOWDOWN = 0.45;
const FULL_ERROR_PERCENT = 8;
const LOWEST_HILL = 0.15;
const MOST_HILLS = 9;
const FEW_SESSIONS_SCALE = 0.6;
/** Closer than this on one row, two pins would cover each other. */
const PIN_DISTANCE = 2.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function medianTime(rows: readonly KeyRow[]): number | null {
  return medianOf(
    rows
      .filter((row) => row.samples >= MIN_SAMPLES && row.mean_ms !== null)
      .map((row) => row.mean_ms as number),
  );
}

interface Weakness {
  row: KeyRow;
  speed: number;
  errors: number;
  value: number;
}

/** From 0 to 1. A key is weak if it is slow or if it goes wrong, whichever is worse. */
function weaknesses(keys: readonly KeyRow[]): Weakness[] {
  const rows = layoutKeys(keys);
  const median = medianTime(rows);
  return (
    rows
      .map((row) => {
        const speed =
          median && row.samples >= MIN_SAMPLES && row.mean_ms !== null
            ? clamp01((row.mean_ms / median - 1) / FULL_SLOWDOWN)
            : 0;
        const errors =
          row.presses >= MIN_SAMPLES
            ? clamp01((100 * row.errors) / row.presses / FULL_ERROR_PERCENT)
            : 0;
        return { row, speed, errors, value: Math.max(speed, errors) };
      })
      // Weakness stops at 1, so the time decides between two keys that reach it.
      .sort(
        (a, b) =>
          b.value - a.value || (b.row.mean_ms ?? 0) - (a.row.mean_ms ?? 0),
      )
  );
}

/** Each hill is a weak key, in the units of the ground. No weak key leaves the ground flat. */
export function reliefHills(keys: readonly KeyRow[], sessions: number): Hill[] {
  const scale = sessions < FEW_SESSIONS ? FEW_SESSIONS_SCALE : 1;
  const hills: Hill[] = [];
  for (const { row, value } of weaknesses(keys)) {
    const position = KEY_POSITIONS.get(row.code);
    if (value >= LOWEST_HILL && position && hills.length < MOST_HILLS) {
      hills.push([
        position.x + GROUND_X,
        position.y + GROUND_Y,
        Number((value * scale).toFixed(3)),
      ]);
    }
  }
  return hills;
}

export interface Pin {
  code: string;
  name: string;
  /** Whatever makes the key weak: its time or its errors. */
  text: string;
  /** Where the pin stands, in key pitches from the centre of the keyboard. */
  x: number;
  y: number;
}

function apart(a: KeyPosition, b: KeyPosition): boolean {
  return a.y !== b.y || Math.abs(a.x - b.x) >= PIN_DISTANCE;
}

/** The two weakest keys. The second gives way to the next one if the pins would overlap. */
export function weakestPins(keys: readonly KeyRow[]): Pin[] {
  const pins: Pin[] = [];
  const taken: KeyPosition[] = [];
  for (const { row, speed, errors, value } of weaknesses(keys)) {
    const position = KEY_POSITIONS.get(row.code);
    const cap = KEY_CAPS.get(row.code);
    if (
      value > 0 &&
      pins.length < 2 &&
      position &&
      cap &&
      taken.every((other) => apart(other, position))
    ) {
      taken.push(position);
      pins.push({
        code: row.code,
        name: cap.name,
        text:
          errors > speed
            ? `${percentText((100 * row.errors) / row.presses)} errors`
            : `${Math.round(row.mean_ms ?? 0)} ms`,
        x: position.x - 7.5,
        // A pin stands one row above its key. The top row has nothing above it.
        y: Math.max(position.y, 1) - 3.5,
      });
    }
  }
  return pins;
}
