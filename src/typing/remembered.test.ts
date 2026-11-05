import { describe, expect, it } from "vitest";
import type { ImportedText, LastSetupRow } from "./api";
import {
  describe as describeChoice,
  explainImportError,
  homeChoices,
  importLine,
  isFinished,
  mergeUsed,
  passageLine,
  wordsLine,
  type Used,
} from "./remembered";

const WALDEN: ImportedText = {
  id: "w",
  title: "Walden",
  chars: 1000,
  removed: 0,
  offset: 360,
};

function row(
  mode: string,
  ts: string,
  source: LastSetupRow["source"],
  thisDevice = true,
): LastSetupRow {
  return { mode, sid: "s", ts, source, this_device: thisDevice };
}

function used(source: Used["source"], thisDevice = true): Used {
  const mode =
    source.kind === "words"
      ? "words"
      : source.kind === "zen"
        ? "zen"
        : ("texts" as const);
  return { mode, source, thisDevice };
}

const WORDS = { kind: "words", seed: 3, pool: 1000, count: 25 } as const;

describe("mergeUsed", () => {
  it("orders by the instant, not by the text of a timestamp", () => {
    const merged = mergeUsed(
      [
        row("words", "2026-11-04T12:00:00+02:00", WORDS),
        // Later in time, though it sorts first as text.
        row("zen", "2026-11-04T11:30:00+00:00", { kind: "zen" }),
      ],
      [],
    );
    expect(merged.map((entry) => entry.mode)).toEqual(["zen", "words"]);
  });

  it("leaves out what a newer version wrote", () => {
    const merged = mergeUsed(
      [
        row("words", "2026-11-04T12:00:00+02:00", null),
        row("ghost", "2026-11-04T13:00:00+02:00", { kind: "zen" }),
      ],
      [],
    );
    expect(merged).toEqual([]);
  });

  it("puts a session that just ended first and keeps one entry per mode", () => {
    const merged = mergeUsed(
      [
        row("words", "2026-11-04T12:00:00+02:00", WORDS),
        row("zen", "2026-11-04T13:00:00+02:00", { kind: "zen" }),
      ],
      [used({ ...WORDS, count: 50 })],
    );
    expect(merged.map((entry) => entry.mode)).toEqual(["words", "zen"]);
    expect(merged[0].source).toMatchObject({ count: 50 });
  });

  it("keeps which device a session came from", () => {
    const merged = mergeUsed(
      [
        row(
          "texts",
          "2026-11-04T12:00:00+02:00",
          { kind: "import", id: "x", offset: 0 },
          false,
        ),
      ],
      [],
    );
    expect(merged[0].thisDevice).toBe(false);
  });
});

describe("lines", () => {
  it("describes words by count and by time", () => {
    expect(wordsLine(1000, 25)).toBe("25 words from the 1,000 most common");
    expect(wordsLine(200, undefined, 60)).toBe(
      "60 seconds, words from the 200 most common",
    );
  });

  it("describes the difficulty of a passage", () => {
    expect(passageLine(null)).toBe("A passage of any difficulty");
    expect(passageLine(3)).toBe("A hard passage");
  });

  it("says where a file continues", () => {
    expect(importLine(WALDEN)).toBe("Walden, continues at 36%");
    expect(importLine({ ...WALDEN, offset: 0 })).toBe(
      "Walden, from the beginning",
    );
  });

  it("knows a finished book, and never calls an empty file finished", () => {
    expect(isFinished({ ...WALDEN, offset: 1000 })).toBe(true);
    expect(isFinished(WALDEN)).toBe(false);
    expect(isFinished({ ...WALDEN, chars: 0, offset: 0 })).toBe(false);
  });
});

describe("what a setup can do", () => {
  it("repeats words, a passage and Zen", () => {
    expect(describeChoice(used(WORDS), []).noRepeat).toBeNull();
    expect(describeChoice(used({ kind: "zen" }), []).line).toBe(
      "No setup and no figures",
    );
    const passage = used({ kind: "passage", id: "p" });
    expect(describeChoice(passage, []).line).toBe(
      "A passage from a public-domain book",
    );
    expect(
      describeChoice(used({ kind: "passage", id: "p", difficulty: 1 }), [])
        .line,
    ).toBe("An easy passage");
  });

  it("continues a file that is still here", () => {
    const choice = describeChoice(
      used({ kind: "import", id: "w", offset: 0 }),
      [WALDEN],
    );
    expect(choice.noRepeat).toBeNull();
    expect(choice.line).toBe("Walden, continues at 36%");
  });

  it("cannot repeat a paste", () => {
    const choice = describeChoice(used({ kind: "paste", chars: 5 }), []);
    expect(choice.noRepeat).toMatchObject({
      heading: "Paste a new text",
      primary: "Paste a text",
      rowText: "A pasted text is not kept",
      rowAction: "Paste",
    });
  });

  it("tells a deleted file from one on another computer", () => {
    const gone = { kind: "import", id: "x", offset: 0 } as const;
    expect(describeChoice(used(gone, true), [WALDEN]).noRepeat).toMatchObject({
      heading: "Choose a new text",
      why: "The file from your last session was deleted.",
      primary: "Choose a text",
    });
    expect(describeChoice(used(gone, false), [WALDEN]).noRepeat).toMatchObject({
      heading: "Your file is on another computer",
      why: "Files stay on the computer they were added to.",
      primary: "Choose a text",
    });
    expect(describeChoice(used(gone, false), []).noRepeat).toMatchObject({
      heading: "Your file is on another computer",
      why: "Files stay on the computer they were added to, and this one has none yet.",
      primary: "Add a file",
    });
  });

  it("names a finished book", () => {
    const choice = describeChoice(
      used({ kind: "import", id: "w", offset: 0 }),
      [{ ...WALDEN, offset: 1000 }],
    );
    expect(choice.noRepeat).toMatchObject({
      heading: "You finished Walden",
      primary: "Choose a text",
    });
  });
});

describe("homeChoices", () => {
  it("offers the defaults before the first session", () => {
    const { primary, others } = homeChoices([], []);
    expect(primary.name).toBe("Adaptive");
    expect(primary.line).toBe("The brain picks the session");
    expect(others.map((row) => row.name)).toEqual(["Words", "Texts", "Zen"]);
    expect(others[0].line).toBe("25 words from the 1,000 most common");
  });

  it("keeps a mode that starts at once when the primary cannot", () => {
    const { primary, others } = homeChoices(
      [used({ kind: "paste", chars: 5 })],
      [],
    );
    expect(primary.noRepeat).not.toBeNull();
    expect(others.every((row) => row.noRepeat === null)).toBe(true);
  });

  it("puts the recently used modes before the unused ones", () => {
    const { primary, others } = homeChoices(
      [used({ kind: "zen" }), used(WORDS)],
      [],
    );
    expect(primary.name).toBe("Zen");
    expect(others.map((row) => row.name)).toEqual([
      "Words",
      "Adaptive",
      "Texts",
    ]);
  });
});

describe("explainImportError", () => {
  it("picks the row for what the core said", () => {
    expect(explainImportError("this EPUB is protected by DRM").head).toBe(
      "This book is protected by DRM",
    );
    expect(
      explainImportError("the file has no text that can be typed").head,
    ).toBe("Nothing here can be typed yet");
    expect(explainImportError("zip error").head).toBe(
      "This file could not be read",
    );
  });
});
