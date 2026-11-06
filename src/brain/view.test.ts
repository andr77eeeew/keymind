import { describe, expect, it } from "vitest";
import type {
  BrainTarget,
  BrainView,
  Estimate,
  SessionTarget,
} from "../typing/api";
import {
  dayText,
  letterRows,
  lettersLine,
  recipeLines,
  targetGain,
  targetHeading,
  targetRows,
  whyLine,
} from "./view";

function target(
  gram: string,
  before: number | null,
  ms: number | null,
  samples = 20,
  presses = 25,
  errors = 1,
): SessionTarget {
  return { gram, before_ms: before, presses, samples, ms, errors };
}

function estimate(over: Partial<Estimate> = {}): Estimate {
  return {
    ms: 300,
    ms_upper: 320,
    error: 0.02,
    error_upper: 0.03,
    confidence: 0.9,
    samples: 40,
    total_samples: 40,
    mastered: true,
    ...over,
  };
}

function brainTarget(
  gram: string,
  over: Partial<Estimate> = {},
  meets = false,
): BrainTarget {
  return {
    gram,
    estimate: estimate(over),
    last_date: "2026-11-05",
    meets_bar: meets,
  };
}

function view(over: Partial<BrainView> = {}): BrainView {
  const focus = brainTarget("e", { ms: 412, ms_upper: 450 });
  return {
    letters: { open: ["e", "t"], next: "a", new: [] },
    focus: "e",
    reason: "slow",
    targets: [focus],
    review: [],
    open_keys: [focus, brainTarget("t", {}, true)],
    chars_per_minute: 200,
    shares: { focus: 0.6, review: 0, general: 0.4 },
    minutes: 3,
    bar: { ms: 342.857, errors: 0.05, samples: 5 },
    informed: true,
    known: true,
    ...over,
  };
}

describe("target rows", () => {
  it("show before, this session, the change and the errors", () => {
    expect(targetRows([target("e", 412.4, 388.2)])).toEqual([
      {
        gram: "e",
        before: "412 ms",
        now: "388 ms",
        change: "−24 ms",
        errors: "4.0%",
      },
    ]);
  });

  it("leave out a time from too few samples and a value the brain did not know", () => {
    const [few, unknown, untouched] = targetRows([
      target("e", 400, 350, 4),
      target("te", null, 300),
      target("ae", 380, null, 0, 0, 0),
    ]);
    expect([few.now, few.change]).toEqual(["—", "—"]);
    expect([unknown.before, unknown.change, unknown.now]).toEqual([
      "—",
      "—",
      "300 ms",
    ]);
    expect(untouched.errors).toBe("—");
  });
});

describe("the summary heading", () => {
  it("follows the focus key", () => {
    expect(
      targetHeading([target("e", 412, 388), target("te", 500, 300)]),
    ).toEqual({
      lead: "You moved ",
      gram: "e",
      tail: " by 24 ms",
    });
    expect(targetHeading([target("e", 400, 412)])?.tail).toBe(
      " was 12 ms slower this time",
    );
    expect(targetHeading([target("e", 400.2, 399.8)])?.tail).toBe(
      " held steady",
    );
  });

  it("says nothing without a change", () => {
    expect(targetHeading([])).toBeNull();
    expect(targetHeading([target("e", null, 300)])).toBeNull();
    expect(targetHeading([target("e", 400, 300, 2)])).toBeNull();
  });
});

describe("target gain", () => {
  it("is the focus key's change, None without one, and a dash in other modes", () => {
    expect(targetGain("adaptive", [target("e", 412, 388)])).toEqual({
      gram: "e",
      text: "−24 ms",
    });
    expect(targetGain("adaptive", [target("e", null, 388)])).toEqual({
      gram: null,
      text: "None",
    });
    expect(targetGain("adaptive", [])).toEqual({ gram: null, text: "None" });
    expect(targetGain("words", [])).toEqual({ gram: null, text: "—" });
  });
});

describe("why this session", () => {
  it("names the figure the choice rests on", () => {
    expect(whyLine(view())).toBe(
      "e takes about 412 ms, and the bar is 343 ms.",
    );
    const unsure = view({
      targets: [brainTarget("e", { ms: 330, ms_upper: 380 })],
    });
    expect(whyLine(unsure)).toBe(
      "e takes about 330 ms but may take up to 380 ms. The bar is 343 ms.",
    );
    const errors = view({
      reason: "errors",
      targets: [brainTarget("e", { error: 0.072 })],
    });
    expect(whyLine(errors)).toBe(
      "e is wrong 7.2% of the time, and the bar is 5%.",
    );
  });

  it("explains a new letter", () => {
    const fresh = view({
      reason: "new",
      letters: { open: ["e", "s"], next: null, new: ["s"] },
      focus: "s",
      targets: [brainTarget("s", { samples: 0 })],
    });
    expect(whyLine(fresh)).toBe(
      "s has just opened, so it needs its first samples.",
    );
    expect(whyLine({ ...fresh, letters: { ...fresh.letters, new: [] } })).toBe(
      "s has too few recent samples to judge, so it comes first.",
    );
  });
});

describe("the Brain screen", () => {
  it("lists the recipe with its shares and length", () => {
    expect(recipeLines(view())).toEqual([
      { label: "Words with e", value: "60%" },
      { label: "Review, nothing is due", value: "0%" },
      { label: "Any open letters", value: "40%" },
      { label: "Length", value: "About 3 min" },
    ]);
  });

  it("puts each open letter against the bar", () => {
    const rows = letterRows(
      view({
        open_keys: [
          brainTarget("e", { ms: 412 }),
          brainTarget("t", {}, true),
          brainTarget("a", { samples: 2 }),
          brainTarget("o", { error: 0.08 }),
        ],
      }),
    );
    expect(rows.map((row) => row.state)).toEqual([
      "slow",
      "bar",
      "samples",
      "errors",
    ]);
    expect(rows[0]).toMatchObject({ time: "412 ms", errors: "2.0%" });
    expect(rows[2]).toMatchObject({ time: "—", errors: "—" });
  });

  it("says how many letters keep within the bar and what opens next", () => {
    expect(lettersLine(view())).toBe(
      "1 of 2 open letters keep within the bar of 343 ms and 5% errors. a opens once all of them do.",
    );
    expect(
      lettersLine(view({ letters: { open: [], next: null, new: [] } })),
    ).toMatch(/Every letter is open\.$/);
  });

  it("names days the short way", () => {
    expect(dayText("2026-11-06", "2026-11-06")).toBe("Today");
    expect(dayText("2026-11-05", "2026-11-06")).toBe("Yesterday");
    expect(dayText("2026-10-31", "2026-11-06")).toBe("Oct 31");
    expect(dayText(null, "2026-11-06")).toBe("Never");
  });
});
