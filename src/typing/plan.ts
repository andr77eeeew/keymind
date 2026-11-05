import {
  cleanText,
  generateWords,
  loadImport,
  pickPassage,
  type ImportedText,
} from "./api";
import { poolText } from "./remembered";
import type { SessionPlan } from "./types";

/** More words than anyone types in the longest timed session, which is two minutes. */
const TIMED_WORD_COUNT = 800;

export type SessionSetup =
  | { mode: "words"; by: "count"; count: number; pool: number }
  | { mode: "words"; by: "time"; seconds: number; pool: number }
  | { mode: "passage"; difficulty: number | null }
  | { mode: "paste"; text: string }
  | { mode: "import"; item: ImportedText }
  | { mode: "zen" };

/** Thrown when a setup cannot give a text, with a message the user can act on. */
export class PlanError extends Error {}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** "Jane Austen, Pride and Prejudice (1813)" gives the two names, or nothing for another form. */
export function bookOf(
  source: string,
): { author: string; title: string } | null {
  const match = /^([^,]+), (.+) \(\d+\)$/.exec(source);
  return match ? { author: match[1], title: match[2] } : null;
}

/** Builds what a session needs. Everything slow happens here, before the typing screen opens. */
export async function buildPlan(
  setup: SessionSetup,
  seed: number = randomSeed(),
): Promise<SessionPlan> {
  switch (setup.mode) {
    case "words":
      return setup.by === "count"
        ? {
            mode: "words",
            text: await generateWords(setup.pool, setup.count, seed),
            source: {
              kind: "words",
              seed,
              pool: setup.pool,
              count: setup.count,
            },
            detail: `${setup.count} words, top ${poolText(setup.pool)}`,
          }
        : {
            mode: "words",
            text: await generateWords(setup.pool, TIMED_WORD_COUNT, seed),
            source: {
              kind: "words",
              seed,
              pool: setup.pool,
              seconds: setup.seconds,
            },
            seconds: setup.seconds,
            detail: `${setup.seconds} seconds, top ${poolText(setup.pool)}`,
          };
    case "passage": {
      const passage = await pickPassage(setup.difficulty, seed);
      return {
        mode: "texts",
        text: passage.text,
        source:
          setup.difficulty === null
            ? { kind: "passage", id: passage.id }
            : {
                kind: "passage",
                id: passage.id,
                difficulty: setup.difficulty,
              },
        detail: bookOf(passage.source)?.title ?? "Passage",
        caption: `${passage.source}. Public domain.`,
        passageSource: passage.source,
      };
    }
    case "paste": {
      const { text } = await cleanText(setup.text);
      if (text.length === 0) {
        throw new PlanError(
          "Nothing here can be typed on the English layout, the only one available for now.",
        );
      }
      return {
        mode: "texts",
        text,
        source: { kind: "paste", chars: text.length },
        detail: "Your text",
        caption: "Your text. It is not kept.",
      };
    }
    case "import": {
      const full = await loadImport(setup.item.id);
      // A finished book starts over, rather than giving an empty session.
      const offset = setup.item.offset < full.length ? setup.item.offset : 0;
      return {
        mode: "texts",
        text: full.slice(offset),
        source: { kind: "import", id: setup.item.id, offset },
        detail: setup.item.title,
        caption: "Your file. It stays on this computer.",
        importOffset: offset,
        importChars: full.length,
      };
    }
    case "zen":
      return {
        mode: "zen",
        text: "",
        source: { kind: "zen" },
        detail: "",
      };
  }
}
