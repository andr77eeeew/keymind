import { describe, expect, it } from "vitest";
import {
  clockText,
  readingProgress,
  summaryContent,
  wordsReached,
} from "./summary";
import type { SessionPlan, SessionSummary } from "./types";

const SUMMARY: SessionSummary = {
  sid: "s",
  reason: "completed",
  duration_ms: 27000,
  chars: 130,
  correct: 126,
  backspaces: 0,
  cpm: 290.6,
  wpm: 58.1,
  accuracy: 97.23,
  rhythm: 84.4,
};

const WORDS: SessionPlan = {
  mode: "words",
  text: "one two three four",
  source: { kind: "words", seed: 1, pool: 1000, count: 4 },
  detail: "4 words, top 1,000",
};
const TIMED: SessionPlan = {
  ...WORDS,
  source: { kind: "words", seed: 1, pool: 1000, seconds: 60 },
  seconds: 60,
};
const PASSAGE: SessionPlan = {
  mode: "texts",
  text: "abc",
  source: { kind: "passage", id: "p" },
  detail: "Pride and Prejudice",
  passageSource: "Jane Austen, Pride and Prejudice (1813)",
};
const FILE: SessionPlan = {
  mode: "texts",
  text: "abc",
  source: { kind: "import", id: "w", offset: 360 },
  detail: "Walden",
  importOffset: 360,
  importChars: 1000,
};
const ZEN: SessionPlan = {
  mode: "zen",
  text: "",
  source: { kind: "zen" },
  detail: "",
};
const EARLY = { ...SUMMARY, reason: "aborted" };

describe("summaryContent", () => {
  it("leads with speed and accuracy", () => {
    const content = summaryContent(WORDS, SUMMARY, 18);
    expect(content.heading).toBe("Session complete");
    expect(content.sub).toBe("Words, 4 words from the 1,000 most common");
    expect(content.lead).toEqual([
      { value: "58", label: "WPM" },
      { value: "97.2%", label: "Accuracy" },
    ]);
    expect(content.rest).toEqual([
      { value: "291", label: "CPM" },
      { value: "84%", label: "Rhythm evenness" },
      { value: "00:27", label: "Time" },
    ]);
    expect(content.note).toContain("Rhythm evenness is how steady");
  });

  it("names what a session was", () => {
    expect(summaryContent(TIMED, SUMMARY, 18).sub).toBe(
      "Words, 60 seconds from the 1,000 most common",
    );
    expect(summaryContent(PASSAGE, SUMMARY, 3).sub).toBe(
      "A passage from Pride and Prejudice, by Jane Austen",
    );
    expect(
      summaryContent(
        { ...PASSAGE, source: { kind: "paste", chars: 3 } },
        SUMMARY,
        3,
      ).sub,
    ).toBe("Your text");
    expect(summaryContent(FILE, SUMMARY, 3).sub).toBe("Walden, your file");
  });

  it("gives Zen its own figures, without accuracy", () => {
    const content = summaryContent(ZEN, SUMMARY, 0);
    expect(content.sub).toBe("Zen, free typing");
    expect(content.lead.map((figure) => figure.label)).toEqual(["WPM", "Time"]);
    expect(content.rest.map((figure) => figure.label)).toEqual([
      "CPM",
      "Rhythm evenness",
    ]);
    expect(content.note).toContain("so it has no accuracy");
  });

  it("says how far a session ended early got", () => {
    const counted = summaryContent(WORDS, EARLY, 9);
    expect(counted.heading).toBe("Session ended early");
    expect(counted.sub).toBe("Words, stopped at 3 of 4 words");
    expect(counted.note).toContain("These figures cover what you typed.");
    expect(summaryContent(TIMED, { ...EARLY, duration_ms: 18000 }, 9).sub).toBe(
      "Words, stopped at 00:18 of 01:00",
    );
  });

  it("names the focus of an adaptive session", () => {
    const adaptive: SessionPlan = {
      ...WORDS,
      mode: "adaptive",
      source: {
        kind: "adaptive",
        seed: 3,
        recipe: {
          v: 1,
          brain: "heuristic",
          letters: "etaoin",
          focus: "e",
          words: 4,
          before: { e: 512.3 },
        },
      },
    };
    expect(summaryContent(adaptive, SUMMARY, 18).sub).toBe(
      "Adaptive, focus on e",
    );
    expect(summaryContent(adaptive, EARLY, 9).sub).toBe(
      "Adaptive, stopped at 3 of 4 words",
    );
  });

  it("shows a dash when there are too few presses to measure", () => {
    const content = summaryContent(
      WORDS,
      { ...EARLY, chars: 4, accuracy: 100, rhythm: null, duration_ms: 1000 },
      1,
    );
    expect(content.sub).toBe("Words, stopped at 1 of 4 words");
    expect(content.lead).toEqual([
      { value: "—", label: "WPM" },
      { value: "100%", label: "Accuracy" },
    ]);
    expect(content.rest[0].value).toBe("—");
    expect(content.rest[1].value).toBe("—");
    expect(content.note).toBe("A dash means too few presses to measure.");
  });
});

describe("readingProgress", () => {
  it("is only for files", () => {
    expect(readingProgress(WORDS, 3)).toBeNull();
  });

  it("says how much further the session got", () => {
    expect(readingProgress(FILE, 20)).toEqual({
      value: 38,
      text: "38%, up from 36%",
      finished: false,
    });
  });

  it("leaves out a change too small to show", () => {
    expect(readingProgress(FILE, 2)?.text).toBe("36%");
  });

  it("notices the end of a book", () => {
    expect(readingProgress(FILE, 640)).toEqual({
      value: 100,
      text: "100%, up from 36%",
      finished: true,
    });
  });
});

describe("small helpers", () => {
  it("writes a clock", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(61000)).toBe("01:01");
    expect(clockText(252400)).toBe("04:12");
  });

  it("counts the words a cursor has begun", () => {
    const text = "one two three";
    expect(wordsReached(text, 0)).toBe(0);
    expect(wordsReached(text, 1)).toBe(1);
    expect(wordsReached(text, 4)).toBe(1);
    expect(wordsReached(text, 5)).toBe(2);
    expect(wordsReached(text, 13)).toBe(3);
  });
});
