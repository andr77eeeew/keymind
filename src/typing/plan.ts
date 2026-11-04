import {
  cleanText,
  generateWords,
  loadImport,
  pickPassage,
  type ImportedText,
} from "./api";
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
            detail: `Common ${setup.pool} · ${setup.count} words`,
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
            detail: `Common ${setup.pool} · ${setup.seconds} seconds`,
          };
    case "passage": {
      const passage = await pickPassage(setup.difficulty, seed);
      return {
        mode: "texts",
        text: passage.text,
        source: { kind: "passage", id: passage.id },
        detail: "Passage",
        caption: passage.source,
      };
    }
    case "paste": {
      const { text } = await cleanText(setup.text);
      if (text.length === 0) {
        throw new PlanError(
          "This text has no characters that can be typed on the English layout.",
        );
      }
      return {
        mode: "texts",
        text,
        source: { kind: "paste", chars: text.length },
        detail: "Your text",
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
        importOffset: offset,
      };
    }
    case "zen":
      return {
        mode: "zen",
        text: "",
        source: { kind: "zen" },
        detail: "Free typing",
      };
  }
}
