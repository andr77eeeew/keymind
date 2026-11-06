import type { SessionRow } from "../typing/api";
import { wordsLine } from "../typing/remembered";
import { summaryFigures, type SummaryContent } from "../typing/summary";
import { modeName, whenText } from "./tables";

const CLOSED_NOTE = "The app closed before this session ended.";

function whatItWas(row: SessionRow, fileTitle: string | null): string {
  const { source } = row;
  switch (source?.kind) {
    case "words":
      return source.seconds !== undefined
        ? `Words, ${wordsLine(source.pool, undefined, source.seconds).replace(", words", "")}`
        : `Words, ${wordsLine(source.pool, source.count)}`;
    case "passage":
      return "A passage from a public-domain book";
    case "paste":
      return "Your text";
    case "import":
      return fileTitle ? `${fileTitle}, your file` : "Your file";
    case "zen":
      return "Zen, free typing";
    case "adaptive":
      return `Adaptive, focus on ${source.recipe.focus}`;
    case "test":
      return "The starting test";
    default:
      return modeName(row.mode);
  }
}

/**
 * A summary from the saved numbers. The text and the cursor of that session are gone, so it says
 * what the session was, without how far it came.
 */
export function pastSummaryContent(
  row: SessionRow,
  fileTitle: string | null,
  now: Date,
): SummaryContent {
  const early = row.reason !== "completed";
  const figures = summaryFigures(row.mode === "zen", early, row);
  return {
    ...figures,
    sub: `${whatItWas(row, fileTitle)}. ${whenText(row.ts, now)}.`,
    note: row.reason === null ? `${CLOSED_NOTE} ${figures.note}` : figures.note,
  };
}
