import { describe, expect, it } from "vitest";
import type { SessionRow } from "../typing/api";
import { recordLines, sessionLine, whenText } from "./tables";

const NOW = new Date(2026, 10, 5, 15, 0);

function row(more: Partial<SessionRow> = {}): SessionRow {
  return {
    sid: "s",
    ts: new Date(2026, 10, 5, 12, 4).toISOString(),
    mode: "words",
    reason: "completed",
    duration_ms: 27000,
    chars: 130,
    correct: 126,
    backspaces: 0,
    cpm: 290,
    wpm: 58.1,
    accuracy: 97.2,
    rhythm: 84,
    source: { kind: "words", seed: 1, pool: 1000, count: 25 },
    targets: [],
    ...more,
  };
}

describe("whenText", () => {
  it("says today, yesterday or the date", () => {
    expect(whenText(new Date(2026, 10, 5, 12, 4).toISOString(), NOW)).toBe(
      "Today, 12:04",
    );
    expect(whenText(new Date(2026, 10, 4, 18, 40).toISOString(), NOW)).toBe(
      "Yesterday, 18:40",
    );
    expect(whenText(new Date(2026, 10, 2, 8, 5).toISOString(), NOW)).toBe(
      "Nov 2, 08:05",
    );
  });

  it("does not trip over a broken time", () => {
    expect(whenText("not a time", NOW)).toBe("—");
  });
});

describe("sessionLine", () => {
  it("rounds what a table shows", () => {
    expect(sessionLine(row(), NOW)).toEqual({
      sid: "s",
      when: "Today, 12:04",
      mode: "Words",
      time: "00:27",
      wpm: "58",
      accuracy: "97%",
      gain: { gram: null, text: "—" },
    });
  });

  it("gives an adaptive session the change on its focus key", () => {
    const line = sessionLine(
      row({
        mode: "adaptive",
        targets: [
          {
            gram: "e",
            before_ms: 412,
            presses: 30,
            samples: 25,
            ms: 388,
            errors: 1,
          },
        ],
      }),
      NOW,
    );
    expect(line.gain).toEqual({ gram: "e", text: "−24 ms" });
  });

  it("gives Zen no accuracy", () => {
    const line = sessionLine(row({ mode: "zen", accuracy: null }), NOW);
    expect(line.mode).toBe("Zen");
    expect(line.accuracy).toBe("None");
  });

  it("shows no speed for a few presses", () => {
    expect(sessionLine(row({ chars: 3 }), NOW).wpm).toBe("—");
  });
});

describe("recordLines", () => {
  it("has a line only for a record that exists", () => {
    expect(recordLines({ best_wpm: null, best_accuracy: null })).toEqual([]);
    const lines = recordLines({
      best_wpm: { value: 66.6, sid: "a", date: "2026-10-29" },
      best_accuracy: { value: 99.14, sid: "b", date: "2026-10-17" },
    });
    expect(lines).toEqual([
      { label: "Best speed", value: "67 WPM", date: "Oct 29", sid: "a" },
      { label: "Best accuracy", value: "99.1%", date: "Oct 17", sid: "b" },
    ]);
  });

  it("writes a perfect accuracy without a fraction", () => {
    const lines = recordLines({
      best_wpm: null,
      best_accuracy: { value: 100, sid: "b", date: "2026-10-17" },
    });
    expect(lines[0].value).toBe("100%");
  });
});
