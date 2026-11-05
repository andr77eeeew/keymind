// Writes a large synthetic journal for load tests. See ADR-0008.
//
//   node scripts/synth-journal.mjs <empty folder> [keystrokes, default 1000000]
//
// The result is a `journal` folder to use with `rebuild-bench.mjs` and `latency-bench.mjs`. The same
// arguments always give the same bytes. Nothing here touches real journals.
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";

const [target, wanted] = process.argv.slice(2);
if (!target) {
  console.error("Usage: node scripts/synth-journal.mjs <folder> [keystrokes]");
  process.exit(1);
}
const KEYSTROKES = Number(wanted ?? 1_000_000);
const PER_SESSION = 300;
const SESSIONS_PER_DAY = 10;
const LETTERS = "etaoinshrdlcumwfgypbvkjxqz";
const DEVICE = "00000000-0000-4000-8000-000000000000";

let state = 12345;
function random(limit) {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state % limit;
}

function characterAt() {
  // Mostly common letters and spaces, so the counters look like real typing.
  if (random(6) === 0) {
    return " ";
  }
  return LETTERS[Math.min(random(26), random(26))];
}

function codeFor(character) {
  return character === " " ? "Space" : `Key${character.toUpperCase()}`;
}

const folder = join(target, DEVICE);
mkdirSync(folder, { recursive: true });

let written = 0;
let sessions = 0;
let day = Date.UTC(2020, 0, 1);
let bytes = 0;
while (written < KEYSTROKES) {
  const date = new Date(day).toISOString().slice(0, 10);
  const file = openSync(join(folder, `${date}.jsonl`), "w");
  for (let n = 0; n < SESSIONS_PER_DAY && written < KEYSTROKES; n += 1) {
    const sid = `load-${sessions}`;
    sessions += 1;
    let seq = 1;
    const lines = [
      JSON.stringify({
        v: 1,
        type: "session_started",
        sid,
        seq,
        ts: `${date}T${String(8 + n).padStart(2, "0")}:00:00+02:00`,
        mode: "words",
        layout: "en-qwerty",
        source: { kind: "words", seed: sessions, pool: 1000, count: 50 },
        settings: { on_error: "continue", backspace: "allowed" },
        app: "0.1.0",
      }),
    ];
    let t = 0;
    for (let pos = 0; pos < PER_SESSION && written < KEYSTROKES; pos += 1) {
      const expected = characterAt();
      const wrong = random(25) === 0;
      const key = wrong ? "~" : expected;
      seq += 1;
      lines.push(
        JSON.stringify({
          v: 1,
          type: "keystroke",
          sid,
          seq,
          t: Math.round(t * 10) / 10,
          kind: "char",
          code: wrong ? "Backquote" : codeFor(expected),
          key,
          expected,
          correct: !wrong,
          pos,
        }),
      );
      t += 60 + random(300) + random(10) / 10;
      written += 1;
    }
    seq += 1;
    lines.push(
      JSON.stringify({
        v: 1,
        type: "session_ended",
        sid,
        seq,
        t: Math.round(t * 10) / 10,
        reason: "completed",
        duration: Math.round(t * 10) / 10,
      }),
    );
    const text = `${lines.join("\n")}\n`;
    bytes += writeSync(file, text);
  }
  closeSync(file);
  day += 86_400_000;
}
console.log(
  `${written} keystrokes in ${sessions} sessions, ${(bytes / 1e6).toFixed(0)} MB, in ${folder}`,
);
