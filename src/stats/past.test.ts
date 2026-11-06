import { describe, expect, it } from "vitest";
import type { SessionRow } from "../typing/api";
import { pastSummaryContent } from "./past";

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
    ...more,
  };
}

describe("pastSummaryContent", () => {
  it("shows the saved figures and when it was", () => {
    const content = pastSummaryContent(row(), null, NOW);
    expect(content.heading).toBe("Session complete");
    expect(content.sub).toBe(
      "Words, 25 words from the 1,000 most common. Today, 12:04.",
    );
    expect(content.lead[0]).toEqual({ value: "58", label: "WPM" });
    expect(content.lead[1]).toEqual({ value: "97.2%", label: "Accuracy" });
  });

  it("says a session ended early", () => {
    const content = pastSummaryContent(row({ reason: "aborted" }), null, NOW);
    expect(content.heading).toBe("Session ended early");
  });

  it("explains a session the app did not get to finish", () => {
    const content = pastSummaryContent(row({ reason: null }), null, NOW);
    expect(content.heading).toBe("Session ended early");
    expect(content.note).toContain("The app closed");
  });

  it("names a file only if it is still there", () => {
    const source = { kind: "import", id: "a", offset: 0 } as const;
    expect(pastSummaryContent(row({ source }), "Walden", NOW).sub).toContain(
      "Walden, your file",
    );
    expect(pastSummaryContent(row({ source }), null, NOW).sub).toContain(
      "Your file",
    );
  });

  it("has no accuracy in Zen", () => {
    const content = pastSummaryContent(
      row({ mode: "zen", accuracy: null, source: { kind: "zen" } }),
      null,
      NOW,
    );
    expect(content.sub).toContain("Zen, free typing");
    expect(content.lead.map((figure) => figure.label)).toEqual(["WPM", "Time"]);
  });

  it("names the focus of an adaptive session", () => {
    const content = pastSummaryContent(
      row({
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
      }),
      null,
      NOW,
    );
    expect(content.sub).toContain("Adaptive, focus on e");
  });

  it("survives a source it cannot read", () => {
    const content = pastSummaryContent(row({ source: null }), null, NOW);
    expect(content.sub).toContain("Words.");
  });
});
