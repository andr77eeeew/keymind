import { describe, expect, it } from "vitest";
import type { DayRow } from "../typing/api";
import {
  hasValues,
  localDate,
  periodStart,
  shortDate,
  trendOf,
  trendRange,
  trendTicks,
} from "./trends";

function day(date: string, wpm: number | null): DayRow {
  return {
    date,
    sessions: 1,
    duration_ms: 1000,
    wpm,
    accuracy: wpm === null ? null : 97,
    rhythm: null,
  };
}

describe("dates", () => {
  it("counts a period in local days, today included", () => {
    expect(periodStart("7", "2026-11-05")).toBe("2026-10-30");
    expect(periodStart("30", "2026-11-05")).toBe("2026-10-07");
    expect(periodStart("all", "2026-11-05")).toBeNull();
  });

  it("writes a local date", () => {
    expect(localDate(new Date(2026, 0, 3, 23, 59))).toBe("2026-01-03");
  });

  it("writes a short date", () => {
    expect(shortDate("2026-10-29")).toBe("Oct 29");
  });
});

describe("trendOf", () => {
  it("fills the days without typing, so the distance is true", () => {
    const trend = trendOf(
      [day("2026-11-01", 50), day("2026-11-03", 60)],
      "wpm",
      "2026-11-01",
      "2026-11-04",
    );
    expect(trend.dates).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(trend.values).toEqual([50, null, 60, null]);
  });

  it("gives all time a week when only one day was typed", () => {
    const trend = trendOf([day("2026-11-05", 50)], "wpm", null, "2026-11-05");
    expect(trend.dates).toHaveLength(7);
    expect(trend.values[6]).toBe(50);
  });

  it("starts all time at the first day", () => {
    const trend = trendOf([day("2026-10-01", 50)], "wpm", null, "2026-11-05");
    expect(trend.dates[0]).toBe("2026-10-01");
    expect(trend.dates[trend.dates.length - 1]).toBe("2026-11-05");
  });

  it("does not lose a day from a computer with a later clock", () => {
    const trend = trendOf(
      [day("2026-11-06", 50)],
      "wpm",
      "2026-11-05",
      "2026-11-05",
    );
    expect(trend.values).toEqual([null, 50]);
  });

  it("knows a day of only Zen has no value", () => {
    const trend = trendOf(
      [day("2026-11-05", null)],
      "wpm",
      "2026-11-05",
      "2026-11-05",
    );
    expect(hasValues(trend)).toBe(false);
  });
});

describe("trendRange", () => {
  const trendWith = (values: (number | null)[]) => ({
    dates: values.map(() => "2026-11-05"),
    values,
  });

  it("is a little wider than the data, in multiples of 5", () => {
    expect(trendRange(trendWith([52, null, 61]))).toEqual({ min: 50, max: 65 });
  });

  it("never goes past the ceiling or below zero", () => {
    expect(trendRange(trendWith([100, 100]), 100)).toEqual({
      min: 95,
      max: 100,
    });
    expect(trendRange(trendWith([0.5]))).toEqual({ min: 0, max: 5 });
  });

  it("has a range with no data", () => {
    expect(trendRange(trendWith([null]), 100)).toEqual({ min: 0, max: 100 });
  });
});

describe("trendTicks", () => {
  it("puts a round number between the ends", () => {
    expect(trendTicks({ min: 60, max: 85 })).toEqual([60, 75, 85]);
    expect(trendTicks({ min: 0, max: 100 })).toEqual([0, 50, 100]);
  });

  it("stays between the ends on a narrow range", () => {
    expect(trendTicks({ min: 95, max: 100 })).toEqual([95, 98, 100]);
  });
});
