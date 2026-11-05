import type { DayRow } from "../typing/api";

export type Period = "7" | "30" | "all";

const SHORT_RANGE_DAYS = 7;

/** Noon, so that a shift of the clock can never move a day. */
function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const moved = parseDate(date);
  moved.setDate(moved.getDate() + days);
  return localDate(moved);
}

/** The first local date of a period, or `null` for all time. */
export function periodStart(period: Period, today: string): string | null {
  return period === "all" ? null : addDays(today, 1 - Number(period));
}

export function shortDate(date: string): string {
  return parseDate(date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

export interface Trend {
  dates: string[];
  /** One value per date. A day without typing is empty rather than zero. */
  values: (number | null)[];
}

export type TrendField = "wpm" | "accuracy" | "rhythm";

/**
 * Every day of the range, so that the distance between two points is the time between them. All time
 * covers at least a week, since one day alone has no width to draw.
 */
export function trendOf(
  days: readonly DayRow[],
  field: TrendField,
  from: string | null,
  today: string,
): Trend {
  const byDate = new Map(days.map((day) => [day.date, day[field]]));
  const known = days.map((day) => day.date).sort();
  const last =
    known.length > 0 && known[known.length - 1] > today
      ? known[known.length - 1]
      : today;
  let start = from;
  if (start === null) {
    const week = addDays(last, 1 - SHORT_RANGE_DAYS);
    start = known.length > 0 && known[0] < week ? known[0] : week;
  }
  const dates: string[] = [];
  for (let date = start; date <= last; date = addDays(date, 1)) {
    dates.push(date);
  }
  return { dates, values: dates.map((date) => byDate.get(date) ?? null) };
}

export function hasValues(trend: Trend): boolean {
  return trend.values.some((value) => value !== null);
}

export interface TrendRange {
  min: number;
  max: number;
}

/** Whole multiples of 5, a little wider than the data, so the line never touches the frame. */
export function trendRange(trend: Trend, ceiling?: number): TrendRange {
  const values = trend.values.filter(
    (value): value is number => value !== null,
  );
  if (values.length === 0) {
    return { min: 0, max: ceiling ?? 100 };
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max((high - low) * 0.15, 1);
  let min = Math.floor((low - pad) / 5) * 5;
  let max = Math.ceil((high + pad) / 5) * 5;
  min = Math.max(0, min);
  if (ceiling !== undefined) {
    max = Math.min(ceiling, max);
  }
  return { min, max: max > min ? max : min + 5 };
}
