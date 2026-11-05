// Times a full rebuild of the derived tables in a release build. See ADR-0008.
//
//   node scripts/synth-journal.mjs <folder>
//   node scripts/rebuild-bench.mjs <folder>
//
// The journal is copied into a throwaway data folder, so the source stays as it was.
import { cpSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp, wait } from "./lib/cdp.mjs";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/rebuild-bench.mjs <journal folder>");
  process.exit(1);
}
const EXE = join("src-tauri", "target", "release", "keymind.exe");

const dataDir = mkdtempSync(join(tmpdir(), "keymind-rebuild-"));
cpSync(source, join(dataDir, "journal"), { recursive: true });

const started = performance.now();
const app = await launchApp({ exe: EXE, dataDir });
const invoke = (command, args = {}) =>
  app.evaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`,
  );

async function untilIdle() {
  for (;;) {
    const status = await invoke("stats_status");
    if (status.state === "idle") {
      return;
    }
    if (status.state === "failed") {
      throw new Error(status.message);
    }
    await wait(100);
  }
}

let failed = false;
try {
  // The debug target appears before the page has loaded.
  while (
    (await app.evaluate("typeof window.__TAURI_INTERNALS__")) !== "object"
  ) {
    await wait(50);
  }
  await untilIdle();
  console.log(
    `First start with no database: ${((performance.now() - started) / 1000).toFixed(1)} s, including the launch.`,
  );

  const rebuild = performance.now();
  await invoke("rebuild_stats");
  // The request is only queued, so wait until the status has left idle first.
  for (let i = 0; i < 100; i += 1) {
    if ((await invoke("stats_status")).state !== "idle") {
      break;
    }
    await wait(10);
  }
  await untilIdle();
  console.log(
    `Rebuild on request: ${((performance.now() - rebuild) / 1000).toFixed(1)} s.`,
  );

  const size = statSync(join(dataDir, "derived.sqlite")).size;
  console.log(`Database: ${(size / 1e6).toFixed(1)} MB.`);

  for (const from of [null, "2020-06-01"]) {
    const query = performance.now();
    const overview = await invoke("stats_overview", { fromDate: from });
    const ms = performance.now() - query;
    console.log(
      `Overview from ${from ?? "all time"}: ${ms.toFixed(1)} ms, ${overview.keys.length} keys, ${overview.bigrams.length} transitions, ${overview.days.length} days.`,
    );
  }
  const quick = performance.now();
  await invoke("last_setups");
  console.log(`Last setups: ${(performance.now() - quick).toFixed(1)} ms.`);
} catch (error) {
  failed = true;
  console.error(String(error));
} finally {
  app.kill();
  await wait(500);
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
