/**
 * Cross engine audit for Layline race seeds.
 *
 * `generateRace` calls Math.sin, cos, exp, log, atan2, hypot and acos tens of
 * thousands of times, and every one of those is implementation defined: V8 in
 * Node and V8 in Chromium are free to return results a unit in the last place
 * apart, and the sim integrates that difference forward for a minute. Usually
 * it stays under a thousandth of a second. On a bad seed it does not, and the
 * page shows both answers at once, because the analyst and the finish table
 * are simulated on the server while the replay is simulated in the browser.
 *
 * Seed 20281016 was in the registry until this audit was written. Node put
 * AUS 33 fourth and Chromium put FRA 12 fourth, 0.95 s apart, and the two
 * printed finish clocks a second apart on the same page.
 *
 * Run:
 *   node scripts/layline-cross-engine-audit.mjs              every shipped seed
 *   node scripts/layline-cross-engine-audit.mjs 20281024 ...  candidates
 *
 * Exit code 1 means at least one seed disagrees across the two engines by
 * more than a visitor could miss. A seed has to pass this before it joins
 * src/lib/layline/races.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
/* Gitignored: these are build output, regenerated on every run. */
const OUT = join(ROOT, ".tmp", "layline-cross-engine");
const ORIGIN = "http://layline-cross-engine.test";

/* The whole import closure of the simulation and its display edge, mirrored
 * so the relative specifiers inside the sources keep resolving. */
const MODULES = {
  "lib/prng.js": "src/lib/prng.ts",
  "lib/layline/types.js": "src/lib/layline/types.ts",
  "lib/layline/sim.js": "src/lib/layline/sim.ts",
  "lib/layline/interpolate.js": "src/lib/layline/interpolate.ts",
  "lib/layline/format.js": "src/lib/layline/format.ts",
  "lib/layline/races.js": "src/lib/layline/races.ts",
};

/**
 * What a visitor can read off the page, for one seed. Node and the browser
 * run this exact text, so the only variable left between two readings of it
 * is the engine underneath.
 *
 * The quarter second grid is the standings dock's own resolution: the dock
 * re-reads on every frame, and a scrub lands anywhere, so any sample the
 * evaluator can return is a sample somebody can stop on.
 */
const FINGERPRINT = `import { generateRace } from "./lib/layline/sim.js";
import { standingsAt } from "./lib/layline/interpolate.js";
import { clock, gap } from "./lib/layline/format.js";

export function fingerprint(seed) {
  const race = generateRace(seed);
  const sail = new Map(race.boats.map((boat) => [boat.id, boat.sail]));
  const results = [...race.results]
    .sort((a, b) => a.rank - b.rank)
    .map((result) => ({
      rank: result.rank,
      sail: sail.get(result.boatId),
      elapsed: result.elapsed,
      clockText: clock(result.elapsed),
    }));

  const grid = [];
  const leaders = [];
  let held = "";
  const steps = Math.round((race.tMax - race.tMin) / 0.25);
  for (let i = 0; i <= steps; i += 1) {
    const t = Number((race.tMin + i * 0.25).toFixed(2));
    const rows = standingsAt(race, t).map((row) => ({
      id: row.boatId,
      gapSeconds: row.gapSeconds,
      gapText: gap(row),
    }));
    grid.push({ t, rows });
    if (t > 0 && rows[0].id !== held) {
      held = rows[0].id;
      leaders.push(sail.get(held) + "@" + t.toFixed(2));
    }
  }

  return { seed, results, grid, leaders };
}
`;

/* A swap between two rows this close is a photo finish the dock cannot draw
 * either way; a wider one is two engines telling a visitor different races. */
const TIE_S = 0.1;
/* The most any reading may move between engines, in seconds. */
const DRIFT_S = 0.1;

function transpile(target, source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const here = dirname(target);
  /* Specifiers both engines have to resolve: source imports are extensionless,
   * and `@/` is the repo's alias for `src/`. Node resolves a root absolute
   * specifier against the filesystem root, so an alias becomes relative. */
  return js.replace(/(from\s+")([^"]+)(")/g, (whole, head, spec, tail) => {
    if (spec.startsWith("@/")) {
      const rel = relative(here, spec.slice(2).replace(/^src\//, "")).split(sep).join("/");
      return `${head}${rel.startsWith(".") ? rel : `./${rel}`}.js${tail}`;
    }
    if (!spec.startsWith(".")) return whole;
    return `${head}${spec}.js${tail}`;
  });
}

async function build() {
  const files = new Map();
  for (const [target, source] of Object.entries(MODULES)) {
    files.set(target, transpile(target, await readFile(join(ROOT, source), "utf8")));
  }
  files.set("fingerprint.js", FINGERPRINT);
  for (const [target, body] of files) {
    const path = join(OUT, target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return files;
}

/** Every difference between two readings of the same seed. */
function compare(node, chrome) {
  const report = {
    seed: node.seed,
    finishOrder: true,
    finishClocks: true,
    leaders: node.leaders.join(" ") === chrome.leaders.join(" "),
    maxElapsedDrift: 0,
    maxGapDrift: 0,
    gapTextDiffs: 0,
    worstSwap: 0,
    worstSwapWhere: "",
    notes: [],
  };

  const orderNode = node.results.map((r) => r.sail).join(", ");
  const orderChrome = chrome.results.map((r) => r.sail).join(", ");
  if (orderNode !== orderChrome) {
    report.finishOrder = false;
    report.notes.push(`finish order ${orderNode} in Node, ${orderChrome} in Chromium`);
  }
  for (let i = 0; i < node.results.length; i += 1) {
    const a = node.results[i];
    const b = chrome.results[i];
    report.maxElapsedDrift = Math.max(report.maxElapsedDrift, Math.abs(a.elapsed - b.elapsed));
    if (a.clockText !== b.clockText) {
      report.finishClocks = false;
      report.notes.push(
        `finish clock at ${a.rank}: ${a.sail} ${a.clockText} in Node, ` +
          `${b.sail} ${b.clockText} in Chromium`,
      );
    }
  }

  for (let i = 0; i < Math.min(node.grid.length, chrome.grid.length); i += 1) {
    const here = node.grid[i];
    const there = chrome.grid[i];
    const place = new Map(there.rows.map((row, k) => [row.id, k]));
    for (let x = 0; x < here.rows.length; x += 1) {
      const row = here.rows[x];
      const other = there.rows[place.get(row.id) ?? 0];
      const drift = Math.abs(row.gapSeconds - other.gapSeconds);
      if (Number.isFinite(drift)) report.maxGapDrift = Math.max(report.maxGapDrift, drift);
      if (row.gapText !== other.gapText) report.gapTextDiffs += 1;
      for (let y = x + 1; y < here.rows.length; y += 1) {
        const rival = here.rows[y];
        if ((place.get(row.id) ?? 0) <= (place.get(rival.id) ?? 0)) continue;
        const apart = Math.abs(row.gapSeconds - rival.gapSeconds);
        if (Number.isFinite(apart) && apart > report.worstSwap) {
          report.worstSwap = apart;
          report.worstSwapWhere = `t=${here.t} ${row.id} and ${rival.id}, ${apart.toFixed(3)}s apart`;
        }
      }
    }
  }
  if (report.worstSwap > TIE_S) {
    report.notes.push(`standings swap outside a tie at ${report.worstSwapWhere}`);
  }
  if (report.maxElapsedDrift > DRIFT_S) {
    report.notes.push(`finish time moves ${report.maxElapsedDrift.toFixed(3)}s`);
  }
  if (report.maxGapDrift > DRIFT_S) {
    report.notes.push(`a standings gap moves ${report.maxGapDrift.toFixed(3)}s`);
  }
  if (!report.leaders) report.notes.push("the leader timeline is not the same race");

  report.stable = report.notes.length === 0;
  return report;
}

const files = await build();
const registry = await import(pathToFileURL(join(OUT, "lib/layline/races.js")).href);
const asked = process.argv.slice(2).map(Number);
const seeds = asked.length > 0 ? asked : registry.RACES.map((meta) => meta.seed);
const named = new Map(registry.RACES.map((meta) => [meta.seed, meta.id]));

const { fingerprint } = await import(pathToFileURL(join(OUT, "fingerprint.js")).href);

/* Headed, per the repo's browser rule: headless renders through SwiftShader on
   the CPU, and channel Chrome is the engine visitors actually run, which is
   the engine whose Math this audit exists to compare. */
let browser;
try {
  browser = await chromium.launch({ headless: false, channel: "chrome" });
} catch {
  browser = await chromium.launch({ headless: false });
}
const page = await browser.newPage();
await page.route(`${ORIGIN}/**`, async (route) => {
  const path = new URL(route.request().url()).pathname.replace(/^\//, "");
  if (path === "" || path === "index.html") {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8"><script type="module">
        import { fingerprint } from "/fingerprint.js";
        window.__fingerprint = fingerprint;
      </script>`,
    });
    return;
  }
  const body = files.get(path);
  if (body === undefined) {
    await route.fulfill({ status: 404, body: "" });
    return;
  }
  await route.fulfill({ contentType: "text/javascript", body });
});
await page.goto(`${ORIGIN}/index.html`);
await page.waitForFunction(() => typeof window.__fingerprint === "function");

let failed = 0;
for (const seed of seeds) {
  const here = fingerprint(seed);
  const there = await page.evaluate((s) => window.__fingerprint(s), seed);
  const report = compare(here, there);
  const label = named.get(seed) ?? "candidate";
  console.log(
    `${report.stable ? "pass" : "FAIL"}  seed ${seed} (${label})  ` +
      `winner ${here.results[0].sail} ${here.results[0].elapsed.toFixed(2)}s  ` +
      `elapsed drift ${report.maxElapsedDrift.toFixed(4)}s  ` +
      `gap drift ${report.maxGapDrift.toFixed(4)}s  ` +
      `gap readings that differ ${report.gapTextDiffs}  ` +
      `widest standings swap ${report.worstSwap.toFixed(3)}s`,
  );
  for (const note of report.notes) console.log(`      ${note}`);
  if (!report.stable) failed += 1;
}

await browser.close();
console.log(
  failed === 0
    ? `\nAll ${seeds.length} seeds read the same in Node and in Chromium`
    : `\n${failed} of ${seeds.length} seeds disagree across the two engines`,
);
process.exit(failed === 0 ? 0 : 1);
