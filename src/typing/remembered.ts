import type { ImportedText, LastSetupRow } from "./api";
import type { Mode, TextSource } from "./types";

/** What a mode last ran, from the journal or from a session that just ended. */
export interface Used {
  mode: Mode;
  source: TextSource;
  /** Tells a deleted file from one on another computer. */
  thisDevice: boolean;
}

/** Why a remembered setup cannot start again, in the words of ADR-0007. */
export interface NoRepeat {
  heading: string;
  /** The line under the heading on Home. */
  why: string;
  /** The primary on Home. */
  primary: string;
  /** The same case in a row of Other sessions. */
  rowText: string;
  rowAction: string;
}

/** A mode as Home shows it: what it would start, or why it cannot. */
export interface Choice {
  used: Used;
  name: string;
  /** One line about the setup. */
  line: string;
  noRepeat: NoRepeat | null;
}

/** The modes Home offers. Adaptive comes first, so it is the primary on first launch. */
export const MODES: readonly Mode[] = ["adaptive", "words", "texts", "zen"];

const NAMES: Record<Mode, string> = {
  adaptive: "Adaptive",
  words: "Words",
  texts: "Texts",
  zen: "Zen",
  test: "Starting test",
};

const DEFAULTS: Record<Mode, TextSource> = {
  adaptive: {
    kind: "adaptive",
    seed: 0,
    recipe: {
      v: 1,
      brain: "heuristic",
      letters: "",
      focus: "",
      words: 0,
      before: {},
    },
  },
  test: { kind: "test", passages: [], seconds: 60 },
  // The seed is a placeholder, because a repeat always draws a new one.
  words: { kind: "words", seed: 0, pool: 1000, count: 25 },
  texts: { kind: "passage", id: "" },
  zen: { kind: "zen" },
};

export function defaultUsed(mode: Mode): Used {
  return { mode, source: DEFAULTS[mode], thisDevice: true };
}

export function poolText(pool: number): string {
  return pool.toLocaleString("en");
}

export function wordsLine(
  pool: number,
  count?: number,
  seconds?: number,
): string {
  return seconds !== undefined
    ? `${seconds} seconds, words from the ${poolText(pool)} most common`
    : `${count ?? 0} words from the ${poolText(pool)} most common`;
}

const DIFFICULTIES: Record<number, string> = {
  1: "An easy passage",
  2: "A medium passage",
  3: "A hard passage",
};

export function passageLine(difficulty: number | null | undefined): string {
  return (
    (difficulty !== null &&
      difficulty !== undefined &&
      DIFFICULTIES[difficulty]) ||
    "A passage of any difficulty"
  );
}

export function isFinished(item: ImportedText): boolean {
  return item.chars > 0 && item.offset >= item.chars;
}

export function readPercent(offset: number, chars: number): number {
  return chars === 0 ? 0 : Math.floor((offset / chars) * 100);
}

export function importLine(item: ImportedText): string {
  return item.offset === 0
    ? `${item.title}, from the beginning`
    : `${item.title}, continues at ${readPercent(item.offset, item.chars)}%`;
}

function pasteNoRepeat(): NoRepeat {
  return {
    heading: "Paste a new text",
    why: "A pasted text is not kept, so the last one cannot start again.",
    primary: "Paste a text",
    rowText: "A pasted text is not kept",
    rowAction: "Paste",
  };
}

function fileNoRepeat(
  thisDevice: boolean,
  imports: readonly ImportedText[],
): NoRepeat {
  const rowText = "The file is not on this computer";
  if (thisDevice) {
    return {
      heading: "Choose a new text",
      why: "The file from your last session was deleted.",
      primary: "Choose a text",
      rowText,
      rowAction: "Choose",
    };
  }
  const heading = "Your file is on another computer";
  return imports.length > 0
    ? {
        heading,
        why: "Files stay on the computer they were added to.",
        primary: "Choose a text",
        rowText,
        rowAction: "Choose",
      }
    : {
        heading,
        why: "Files stay on the computer they were added to, and this one has none yet.",
        primary: "Add a file",
        rowText,
        rowAction: "Add a file",
      };
}

function finishedNoRepeat(title: string): NoRepeat {
  const heading = `You finished ${title}`;
  return {
    heading,
    why: "Choose what to read next, or read it again.",
    primary: "Choose a text",
    rowText: heading,
    rowAction: "Choose",
  };
}

/** Says what a mode would start. A file is looked up here, since only the library has its title. */
export function describe(used: Used, imports: readonly ImportedText[]): Choice {
  const { source } = used;
  const name = NAMES[used.mode];
  const plain = (line: string): Choice => ({
    used,
    name,
    line,
    noRepeat: null,
  });
  const stuck = (noRepeat: NoRepeat): Choice => ({
    used,
    name,
    line: noRepeat.why,
    noRepeat,
  });

  switch (source.kind) {
    case "words":
      return plain(wordsLine(source.pool, source.count, source.seconds));
    case "passage":
      return plain(
        source.difficulty
          ? passageLine(source.difficulty)
          : "A passage from a public-domain book",
      );
    case "paste":
      return stuck(pasteNoRepeat());
    case "import": {
      const item = imports.find((entry) => entry.id === source.id);
      if (!item) {
        return stuck(fileNoRepeat(used.thisDevice, imports));
      }
      return isFinished(item)
        ? stuck(finishedNoRepeat(item.title))
        : plain(importLine(item));
    }
    case "zen":
      return plain("No setup and no figures");
    case "adaptive":
      return plain("The brain picks the session");
    case "test":
      return plain("One minute of natural text");
  }
}

function asUsed(row: LastSetupRow): Used | null {
  return MODES.includes(row.mode as Mode) && row.source !== null
    ? {
        mode: row.mode as Mode,
        source: row.source,
        thisDevice: row.this_device,
      }
    : null;
}

/**
 * Newest first, with one entry per mode. `local` holds sessions that ended in this run, because the
 * projector reaches them a moment later. A row from a newer version of the app is left out.
 */
export function mergeUsed(
  rows: readonly LastSetupRow[],
  local: readonly Used[],
): Used[] {
  const fromJournal = [...rows]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .map(asUsed)
    .filter((used) => used !== null);
  const merged: Used[] = [];
  for (const used of [...local, ...fromJournal]) {
    if (!merged.some((entry) => entry.mode === used.mode)) {
      merged.push(used);
    }
  }
  return merged;
}

export interface HomeChoices {
  primary: Choice;
  others: Choice[];
}

/** The first choice takes the sheet and the other modes take the rows, the recently used first. */
export function homeChoices(
  used: readonly Used[],
  imports: readonly ImportedText[],
): HomeChoices {
  const ordered = [...used];
  for (const mode of MODES) {
    if (!ordered.some((entry) => entry.mode === mode)) {
      ordered.push(defaultUsed(mode));
    }
  }
  const [primary, ...others] = ordered.map((entry) => describe(entry, imports));
  return { primary, others };
}

export interface FailedImport {
  head: string;
  text: string;
}

/** Turns the sentence of a failed import into the row the mockups draw. */
export function explainImportError(message: string): FailedImport {
  if (message.includes("DRM")) {
    return {
      head: "This book is protected by DRM",
      text: "Its text cannot be read, so nothing was added. A DRM-free or TXT copy will work.",
    };
  }
  if (message.includes("no text that can be typed")) {
    return {
      head: "Nothing here can be typed yet",
      text: "The text has no characters on the English layout, the only one available for now. Nothing was added.",
    };
  }
  if (message.includes("128 MB")) {
    return {
      head: "This file is too large",
      text: "The limit is 128 MB. Nothing was added, and your library is unchanged.",
    };
  }
  if (message.includes("not supported")) {
    return {
      head: "This file type is not supported",
      text: "Use a TXT or EPUB file. Nothing was added, and your library is unchanged.",
    };
  }
  return {
    head: "This file could not be read",
    text: "Nothing was added, and your library is unchanged. If it opens elsewhere, try saving it as TXT.",
  };
}
