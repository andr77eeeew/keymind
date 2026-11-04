// Measures the input path of a release build in the real WebView2. See ADR-0004.
//
//   VITE_LATENCY_PROBE=1 npx tauri build --no-bundle
//   node scripts/latency-bench.mjs [presses per text, default 5000]
//
// Keep the window visible and do not click elsewhere: a hidden page has no frames to measure, and
// a blur pauses the session. The run checks both and refuses to report if either happened.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp, press, wait } from "./lib/cdp.mjs";

const PRESSES = Number(process.argv[2] ?? 5000);
const LENGTHS = [1_000, 100_000, 1_000_000];
const EXE = join("src-tauri", "target", "release", "keymind.exe");

/** A plain repeatable word text, so a run can be compared with an earlier one. */
function buildText(length) {
  const words = JSON.parse(readFileSync("content/en/words.json", "utf8"))
    .slice(0, 1000)
    .map((entry) => entry.word);
  let state = 12345;
  const parts = [];
  let total = 0;
  while (total < length) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const word = words[state % words.length];
    parts.push(word);
    total += word.length + 1;
  }
  return parts.join(" ").slice(0, length).trimEnd();
}

/** 40 presses at 20 per second, then 20 at 60 per second, like a burst inside normal typing. */
function gapAfter(index) {
  return index % 60 < 40 ? 50 : 1000 / 60;
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return NaN;
  }
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

function describe(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? NaN,
  };
}

async function typeSession(app, text, budget) {
  await app.evaluate(`window.__keymindStart(${JSON.stringify(text)})`);
  await app.evaluate(
    `new Promise((resolve) => {
       const check = () => document.querySelector(".stream .cur") ? resolve(true) : setTimeout(check, 20);
       check();
     })`,
  );
  await wait(300);
  // Stops one short of the end, so the session never completes during measuring.
  const planned = Math.min(budget, text.length - 1);
  let cursor = 0;
  let sent = 0;
  let next = performance.now();
  const schedule = async () => {
    next += gapAfter(sent);
    const pause = next - performance.now();
    if (pause > 0) {
      await wait(pause);
    }
  };
  while (sent < planned && cursor < text.length - 1) {
    // Two percent of the presses go wrong and are corrected, so the error path is measured too.
    if (sent % 50 === 49) {
      await press(app.send, "~");
      sent += 1;
      await schedule();
      await press(app.send, "Backspace");
      sent += 1;
      await schedule();
    }
    await press(app.send, text[cursor]);
    cursor += 1;
    sent += 1;
    await schedule();
  }
  return sent;
}

async function checkPageState(app) {
  return app.evaluate(
    `({
       visible: document.visibilityState === "visible",
       focused: document.hasFocus(),
       paused: document.querySelector("dialog.pause")?.open ?? false,
       stray: document.querySelectorAll(".stream .c").length,
     })`,
  );
}

async function benchLength(app, length) {
  const text = buildText(length);
  await app.evaluate("window.__keymindProbe.reset()");
  let sent = 0;
  let maxSpans = 0;
  while (sent < PRESSES) {
    sent += await typeSession(app, text, PRESSES - sent);
    const state = await checkPageState(app);
    maxSpans = Math.max(maxSpans, state.stray);
    if (!state.visible || state.paused) {
      throw new Error(
        `Invalid run: visible=${state.visible}, paused=${state.paused}. Keep the window in front.`,
      );
    }
    await wait(1200);
    const data = await app.evaluate(
      "window.__keymindProbe.read().frame.length",
    );
    if (data === 0) {
      throw new Error("Invalid run: no frames were seen.");
    }
    // Ending here leaves the next session clean, and writes the rest of this one.
    if (sent < PRESSES) {
      await press(app.send, "Escape");
      await wait(100);
      await app.evaluate(
        `[...document.querySelectorAll("dialog.pause button")].find((b) => b.textContent.includes("End")).click()`,
      );
      await app.evaluate(
        `new Promise((resolve) => {
           const check = () => document.querySelector(".figures .figure") ? resolve(true) : setTimeout(check, 20);
           check();
         })`,
      );
    }
  }
  const data = await app.evaluate("window.__keymindProbe.read()");
  await press(app.send, "Escape");
  await wait(100);
  await app.evaluate(
    `[...document.querySelectorAll("dialog.pause button")].find((b) => b.textContent.includes("End")).click()`,
  );
  await app.evaluate(
    `new Promise((resolve) => {
       const check = () => document.querySelector(".figures .figure") ? resolve(true) : setTimeout(check, 20);
       check();
     })`,
  );
  return {
    length,
    sent,
    maxSpans,
    queue: describe(data.queue),
    handler: describe(data.handler),
    frame: describe(data.frame),
    slowEvents: { ...describe(data.eventTiming), values: data.eventTiming },
    longTasks: data.longTasks,
  };
}

const f = (value) => (Number.isNaN(value) ? "n/a" : value.toFixed(2));

/**
 * Event Timing runs from the press to the paint that shows it, in steps of 8 ms, and only reports
 * events of 16 ms or more. So every press it did not report took less than 16 ms.
 */
function paint(r) {
  const share = (r.slowEvents.n / r.sent) * 100;
  const sorted = [...r.slowEvents.values].sort((a, b) => a - b);
  const rank = Math.ceil(r.sent * 0.95) - (r.sent - sorted.length) - 1;
  const p95 = rank < 0 ? "<16" : sorted[rank];
  return `${share.toFixed(0)}%, ${p95} ms, ${r.slowEvents.max || 0} ms`;
}

function report(results) {
  const rows = [
    "| Text | Presses | Queue p50 / p99 / max | Handler p50 / p99 / max | To next frame p50 / p95 / max | To paint: over 16 ms, p95, max | Long tasks | Spans in DOM |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    rows.push(
      `| ${r.length.toLocaleString("en")} | ${r.sent} | ${f(r.queue.p50)} / ${f(r.queue.p99)} / ${f(r.queue.max)} | ${f(r.handler.p50)} / ${f(r.handler.p99)} / ${f(r.handler.max)} | ${f(r.frame.p50)} / ${f(r.frame.p95)} / ${f(r.frame.max)} | ${paint(r)} | ${r.longTasks.length} | ${r.maxSpans} |`,
    );
  }
  console.log(rows.join("\n"));
}

function countJournal(dataDir) {
  const root = join(dataDir, "journal");
  let keystrokes = 0;
  let sessions = 0;
  let ended = 0;
  for (const device of readdirSync(root)) {
    for (const file of readdirSync(join(root, device))) {
      for (const line of readFileSync(join(root, device, file), "utf8").split(
        "\n",
      )) {
        if (line.includes('"type":"keystroke"')) keystrokes += 1;
        else if (line.includes('"type":"session_started"')) sessions += 1;
        else if (line.includes('"type":"session_ended"')) ended += 1;
      }
    }
  }
  return { keystrokes, sessions, ended };
}

const dataDir = mkdtempSync(join(tmpdir(), "keymind-bench-"));
const app = await launchApp({ exe: EXE, dataDir });
let failed = false;
try {
  await wait(1500);
  await app.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const hasProbe = await app.evaluate("typeof window.__keymindProbe");
  if (hasProbe !== "object") {
    throw new Error(
      "This build has no probes. Build it with VITE_LATENCY_PROBE=1.",
    );
  }
  const results = [];
  for (const length of LENGTHS) {
    console.error(`Typing into a text of ${length} characters...`);
    results.push(await benchLength(app, length));
  }
  report(results);
  const sent = results.reduce((sum, r) => sum + r.sent, 0);
  const journal = countJournal(dataDir);
  console.log(
    `\nSent ${sent} presses. Journal: ${journal.keystrokes} keystrokes, ${journal.sessions} sessions started, ${journal.ended} ended.`,
  );
  if (journal.keystrokes !== sent) {
    failed = true;
    console.error("The journal does not match the presses sent.");
  }
  if (app.problems.length > 0) {
    failed = true;
    console.error(`Page problems:\n${app.problems.join("\n")}`);
  }
} catch (error) {
  failed = true;
  console.error(String(error));
} finally {
  app.kill();
  await wait(500);
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
