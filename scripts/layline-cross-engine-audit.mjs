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
 *   node scripts/layline-cross-engine-audit.mjs                 every shipped seed
 *   node scripts/layline-cross-engine-audit.mjs --known         known defect seeds
 *   node scripts/layline-cross-engine-audit.mjs --corpus repair deterministic repair corpus
 *   node scripts/layline-cross-engine-audit.mjs --corpus development implementation corpus
 *   node scripts/layline-cross-engine-audit.mjs --corpus holdout distinct holdout corpus
 *   node scripts/layline-cross-engine-audit.mjs 20281024 ...     candidates
 *
 * Exit code 1 means at least one audited channel differs at all. A seed has
 * to pass this exact gate before it joins src/lib/layline/races.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { launchPlacedChrome } from "./lib/launch-chrome.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
/* Gitignored: these are build output, regenerated on every run. */
const OUT = join(ROOT, ".tmp", "layline-cross-engine");
const ORIGIN = "http://layline-cross-engine.test";
const UINT32_MAX = 0xffff_ffff;
const CORPUS_SIZE = 100;
const KNOWN_DEFECT_SEEDS = Object.freeze([
  147926522,
  3154717991,
  978983014,
  1366259931,
  3689921433,
]);
const FIX_CHANNEL_NAMES = Object.freeze([
  "t",
  "x",
  "y",
  "waterX",
  "waterY",
  "currentX",
  "currentY",
  "hdg",
  "heel",
  "twa",
  "kite",
  "stw",
  "ctw",
  "currentDrift",
  "currentSet",
  "sog",
  "cog",
]);
const SIMULATION_FIX_CHANNEL_NAMES = Object.freeze([
  "t",
  "x",
  "y",
  "waterX",
  "waterY",
  "currentX",
  "currentY",
  "groundX",
  "groundY",
  "stw",
  "ctw",
  "sog",
  "cog",
  "hdg",
  "heel",
  "twa",
  "kite",
]);
const SIMULATION_TICK_CHANNEL_NAMES = Object.freeze([
  ...SIMULATION_FIX_CHANNEL_NAMES,
  "refTwd", "noise", "dirty", "avoid", "avoidUrg", "brake", "desired",
  "phase", "tack", "man", "laying", "wantLay", "toGo",
  "portCrossTrack", "starboardCrossTrack",
]);

function deterministicUint32Corpus(streamSeed, count = CORPUS_SIZE) {
  const seeds = [];
  let state = streamSeed >>> 0;
  while (seeds.length < count) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    let candidate = state;
    candidate ^= candidate >>> 16;
    candidate = Math.imul(candidate, 0x7feb352d) >>> 0;
    candidate ^= candidate >>> 15;
    candidate = Math.imul(candidate, 0x846ca68b) >>> 0;
    candidate ^= candidate >>> 16;
    candidate >>>= 0;
    if (!seeds.includes(candidate)) seeds.push(candidate);
  }
  return Object.freeze(seeds);
}

const CORPORA = Object.freeze({
  repair: deterministicUint32Corpus(0x6c61796c),
  development: deterministicUint32Corpus(0x64657631),
  holdout: deterministicUint32Corpus(0x686f6c64),
});

/* The whole import closure of the simulation and its display edge, mirrored
 * so the relative specifiers inside the sources keep resolving. */
const MODULES = {
  "lib/prng.js": "src/lib/prng.ts",
  "lib/layline/types.js": "src/lib/layline/types.ts",
  "lib/layline/field-seed.js": "src/lib/layline/field-seed.ts",
  "lib/layline/current.js": "src/lib/layline/current.ts",
  "lib/layline/simulation-math.js": "src/lib/layline/simulation-math.ts",
  "lib/layline/velocity.js": "src/lib/layline/velocity.ts",
  "lib/layline/polar.js": "src/lib/layline/polar.ts",
  "lib/layline/laylines.js": "src/lib/layline/laylines.ts",
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
import { velocityFromComponents } from "./lib/layline/velocity.js";

export function fingerprint(seed, traceTicks = false) {
  const simulationFixChannels = {};
  const simulationTickChannels = {};
  let rawVectorClosureFailures = 0;
  let maxRawVectorClosureResidual = 0;
  let firstRawVectorClosureFailure = null;
  const race = generateRace(seed, (sample) => {
    const residualX = sample.groundX - (sample.waterX + sample.currentX);
    const residualY = sample.groundY - (sample.waterY + sample.currentY);
    const components = [
      sample.waterX, sample.waterY, sample.currentX, sample.currentY,
      sample.groundX, sample.groundY, residualX, residualY,
    ];
    const closed = components.every(Number.isFinite) &&
      components.every((value) => !Object.is(value, -0)) &&
      sample.groundX === sample.waterX + sample.currentX &&
      sample.groundY === sample.waterY + sample.currentY &&
      residualX === 0 && residualY === 0;
    if (!closed) {
      rawVectorClosureFailures += 1;
      maxRawVectorClosureResidual = Math.max(
        maxRawVectorClosureResidual,
        Math.abs(residualX),
        Math.abs(residualY),
      );
      firstRawVectorClosureFailure ??= {
        boatId: sample.boatId,
        t: sample.t,
        waterX: sample.waterX,
        waterY: sample.waterY,
        currentX: sample.currentX,
        currentY: sample.currentY,
        groundX: sample.groundX,
        groundY: sample.groundY,
        residualX,
        residualY,
      };
    }
    (simulationFixChannels[sample.boatId] ??= []).push([
      sample.t,
      sample.x,
      sample.y,
      sample.waterX,
      sample.waterY,
      sample.currentX,
      sample.currentY,
      sample.groundX,
      sample.groundY,
      sample.stw,
      sample.ctw,
      sample.sog,
      sample.cog,
      sample.hdg,
      sample.heel,
      sample.twa,
      sample.kite,
    ]);
  }, traceTicks ? (sample) => {
    (simulationTickChannels[sample.boatId] ??= []).push([
      sample.t, sample.x, sample.y,
      sample.waterX, sample.waterY, sample.currentX, sample.currentY,
      sample.groundX, sample.groundY, sample.stw, sample.ctw,
      sample.sog, sample.cog, sample.hdg, sample.heel, sample.twa, sample.kite,
      sample.refTwd, sample.noise, sample.dirty, sample.avoid,
      sample.avoidUrg, sample.brake, sample.desired, sample.phase,
      sample.tack, sample.man, sample.laying, sample.wantLay, sample.toGo,
      sample.portCrossTrack, sample.starboardCrossTrack,
    ]);
  } : undefined);
  const sail = new Map(race.boats.map((boat) => [boat.id, boat.sail]));
  const results = [...race.results]
    .sort((a, b) => a.rank - b.rank)
    .map((result) => ({
      rank: result.rank,
      sail: sail.get(result.boatId),
      elapsed: result.elapsed,
      clockText: clock(result.elapsed),
    }));

  let vectorClosureFailures = 0;
  let maxVectorClosureResidual = 0;
  const fixChannels = Object.fromEntries(race.boats.map((boat) => [
    boat.id,
    race.fixes[boat.id].map((fix) => {
      const velocity = velocityFromComponents(
        fix.waterX,
        fix.waterY,
        fix.currentX,
        fix.currentY,
        {},
      );
      const residualX = velocity.groundX - (fix.waterX + fix.currentX);
      const residualY = velocity.groundY - (fix.waterY + fix.currentY);
      const components = [
        velocity.waterX, velocity.waterY, velocity.currentX, velocity.currentY,
        velocity.groundX, velocity.groundY, residualX, residualY,
      ];
      const closed = components.every(Number.isFinite) &&
        components.every((value) => !Object.is(value, -0)) &&
        velocity.groundX === fix.waterX + fix.currentX &&
        velocity.groundY === fix.waterY + fix.currentY &&
        residualX === 0 && residualY === 0;
      if (!closed) vectorClosureFailures += 1;
      maxVectorClosureResidual = Math.max(
        maxVectorClosureResidual,
        Math.abs(residualX),
        Math.abs(residualY),
      );
      return [
        fix.t,
        fix.x,
        fix.y,
        fix.waterX,
        fix.waterY,
        fix.currentX,
        fix.currentY,
        fix.hdg,
        fix.heel,
        fix.twa,
        fix.kite,
        velocity.stw,
        velocity.ctw,
        velocity.currentDrift,
        velocity.currentSet,
        velocity.sog,
        velocity.cog,
      ];
    }),
  ]));

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

  return {
    seed,
    environment: race.environment,
    simulationFixChannels,
    simulationTickChannels: traceTicks ? simulationTickChannels : null,
    fixChannels,
    vectorClosureFailures,
    maxVectorClosureResidual,
    rawVectorClosureFailures,
    maxRawVectorClosureResidual,
    firstRawVectorClosureFailure,
    results,
    grid,
    leaders,
  };
}
`;

function maxChannelDrift(nodeChannels, chromeChannels) {
  let worst = 0;
  const nodeIds = Object.keys(nodeChannels);
  if (nodeIds.join("|") !== Object.keys(chromeChannels).join("|")) return Infinity;
  for (const id of nodeIds) {
    const a = nodeChannels[id];
    const b = chromeChannels[id];
    if (a.length !== b.length) return Infinity;
    for (let row = 0; row < a.length; row += 1) {
      if (a[row].length !== b[row].length) return Infinity;
      for (let column = 0; column < a[row].length; column += 1) {
        if (a[row][column] === null || b[row][column] === null) {
          if (a[row][column] !== b[row][column]) return Infinity;
          continue;
        }
        worst = Math.max(worst, Math.abs(a[row][column] - b[row][column]));
      }
    }
  }
  return worst;
}

function firstChannelDifference(nodeChannels, chromeChannels, channelNames) {
  const nodeIds = Object.keys(nodeChannels);
  const chromeIds = Object.keys(chromeChannels);
  if (nodeIds.join("|") !== chromeIds.join("|")) {
    return { kind: "boat-ids", node: nodeIds, chrome: chromeIds };
  }
  const rowCount = Math.max(
    0,
    ...nodeIds.map((id) => Math.max(nodeChannels[id].length, chromeChannels[id].length)),
  );
  for (let row = 0; row < rowCount; row += 1) {
    for (const id of nodeIds) {
      const a = nodeChannels[id];
      const b = chromeChannels[id];
      const nodeRowMissing = row >= a.length;
      const chromeRowMissing = row >= b.length;
      if (nodeRowMissing !== chromeRowMissing) {
        return { kind: "row-count", id, node: a.length, chrome: b.length };
      }
      if (nodeRowMissing) continue;
      if (a[row].length !== b[row].length) {
        return { kind: "column-count", id, row, node: a[row].length, chrome: b[row].length };
      }
      for (let column = 0; column < a[row].length; column += 1) {
        if (!Object.is(a[row][column], b[row][column])) {
          const rowDifferences = a[row].flatMap((nodeValue, index) => (
            Object.is(nodeValue, b[row][index])
              ? []
              : [{
                  channel: channelNames[index] ?? `channel-${index}`,
                  node: nodeValue,
                  chrome: b[row][index],
                }]
          ));
          return {
            kind: "value",
            id,
            row,
            column,
            channel: channelNames[column] ?? `channel-${column}`,
            t: a[row][0],
            node: a[row][column],
            chrome: b[row][column],
            rowDifferences,
          };
        }
      }
    }
  }
  return null;
}

function firstDifferencesByChannel(nodeChannels, chromeChannels, channelNames) {
  const differences = [];
  for (let column = 0; column < channelNames.length; column += 1) {
    let earliest = null;
    for (const id of Object.keys(nodeChannels)) {
      const a = nodeChannels[id];
      const b = chromeChannels[id];
      for (let row = 0; row < Math.min(a.length, b.length); row += 1) {
        if (!Object.is(a[row][column], b[row][column])) {
          const candidate = {
            channel: channelNames[column],
            id,
            row,
            t: a[row][0],
            node: a[row][column],
            chrome: b[row][column],
          };
          if (earliest === null || candidate.t < earliest.t) earliest = candidate;
          break;
        }
      }
    }
    if (earliest !== null) differences.push(earliest);
  }
  return differences;
}

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

function parseSeeds(args, shippedSeeds) {
  const selected = [];
  const add = (seed) => {
    if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
      throw new Error(`seed must be an unsigned 32-bit integer: ${seed}`);
    }
    if (!selected.includes(seed)) selected.push(seed);
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--known") {
      KNOWN_DEFECT_SEEDS.forEach(add);
      continue;
    }
    if (arg === "--shipped") {
      shippedSeeds.forEach(add);
      continue;
    }
    if (arg === "--corpus") {
      const name = args[++i];
      const corpus = CORPORA[name];
      if (corpus === undefined) {
        throw new Error(`unknown corpus ${String(name)}; expected repair or holdout`);
      }
      corpus.forEach(add);
      continue;
    }
    if (!/^\d+$/.test(arg)) throw new Error(`unknown argument: ${arg}`);
    add(Number(arg));
  }
  if (selected.length === 0) shippedSeeds.forEach(add);
  return selected;
}

/** Every difference between two readings of the same seed. */
function compare(node, chrome) {
  const fixChannelDrift = maxChannelDrift(node.fixChannels, chrome.fixChannels);
  const firstFixDifference = firstChannelDifference(
    node.fixChannels,
    chrome.fixChannels,
    FIX_CHANNEL_NAMES,
  );
  const simulationFixDrift = maxChannelDrift(
    node.simulationFixChannels,
    chrome.simulationFixChannels,
  );
  const firstSimulationFixDifference = firstChannelDifference(
    node.simulationFixChannels,
    chrome.simulationFixChannels,
    SIMULATION_FIX_CHANNEL_NAMES,
  );
  const firstSimulationTickDifference = node.simulationTickChannels === null
    ? null
    : firstChannelDifference(
        node.simulationTickChannels,
        chrome.simulationTickChannels,
        SIMULATION_TICK_CHANNEL_NAMES,
      );
  const firstSimulationTickDifferencesByChannel = node.simulationTickChannels === null
    ? null
    : firstDifferencesByChannel(
        node.simulationTickChannels,
        chrome.simulationTickChannels,
        SIMULATION_TICK_CHANNEL_NAMES,
      );
  const report = {
    seed: node.seed,
    finishOrder: true,
    finishClocks: true,
    leaders: node.leaders.join(" ") === chrome.leaders.join(" "),
    environment: JSON.stringify(node.environment) === JSON.stringify(chrome.environment),
    fixChannels: firstFixDifference === null,
    maxFixChannelDrift: fixChannelDrift,
    firstFixDifference,
    simulationFixChannels: firstSimulationFixDifference === null,
    maxSimulationFixDrift: simulationFixDrift,
    firstSimulationFixDifference,
    firstSimulationTickDifference,
    firstSimulationTickDifferencesByChannel,
    strictVectorClosureFailures:
      node.vectorClosureFailures + chrome.vectorClosureFailures +
      node.rawVectorClosureFailures + chrome.rawVectorClosureFailures,
    maxVectorClosureResidual: Math.max(
      node.maxVectorClosureResidual,
      chrome.maxVectorClosureResidual,
      node.maxRawVectorClosureResidual,
      chrome.maxRawVectorClosureResidual,
    ),
    firstRawVectorClosureFailure:
      node.firstRawVectorClosureFailure ?? chrome.firstRawVectorClosureFailure,
    maxElapsedDrift: 0,
    maxGapDrift: 0,
    gapTextDiffs: 0,
    standingsOrderDiffs: 0,
    firstStandingsOrderDifference: null,
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
  const chromeResultBySail = new Map(chrome.results.map((result) => [result.sail, result]));
  for (let i = 0; i < node.results.length; i += 1) {
    const a = node.results[i];
    const b = chromeResultBySail.get(a.sail);
    if (b === undefined) {
      report.maxElapsedDrift = Infinity;
      report.finishClocks = false;
      report.notes.push(`missing Chromium result for ${a.sail}`);
      continue;
    }
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
    const hereOrder = here.rows.map((row) => row.id).join("|");
    const thereOrder = there.rows.map((row) => row.id).join("|");
    if (hereOrder !== thereOrder) {
      report.standingsOrderDiffs += 1;
      report.firstStandingsOrderDifference ??= {
        t: here.t,
        node: hereOrder,
        chrome: thereOrder,
      };
    }
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
  if (report.worstSwap !== 0) report.notes.push(`standings swap at ${report.worstSwapWhere}`);
  if (report.standingsOrderDiffs !== 0) {
    report.notes.push(`standings order differs at ${JSON.stringify(report.firstStandingsOrderDifference)}`);
  }
  if (report.maxElapsedDrift !== 0) report.notes.push(`finish time moves ${report.maxElapsedDrift}s`);
  if (report.maxGapDrift !== 0) report.notes.push(`a standings gap moves ${report.maxGapDrift}s`);
  if (report.gapTextDiffs !== 0) report.notes.push(`${report.gapTextDiffs} printed standings readings differ`);
  if (!report.finishClocks) report.notes.push("printed finish clocks differ");
  if (!report.leaders) report.notes.push("the leader timeline is not the same race");
  if (!report.environment) report.notes.push("the serialized current field differs");
  if (!report.fixChannels) report.notes.push("the component-derived fix channels differ");
  if (!report.simulationFixChannels) report.notes.push("the unrounded simulator fix channels differ");
  if (report.strictVectorClosureFailures !== 0) {
    report.notes.push(
      `${report.strictVectorClosureFailures} water plus current vectors do not close exactly`,
    );
  }

  report.stable = report.notes.length === 0;
  return report;
}

const files = await build();
const registry = await import(pathToFileURL(join(OUT, "lib/layline/races.js")).href);
const shippedSeeds = registry.RACES.map((meta) => meta.seed);
const traceTicks = process.argv.includes("--trace-ticks");
const seeds = parseSeeds(
  process.argv.slice(2).filter((arg) => arg !== "--trace-ticks"),
  shippedSeeds,
);
const named = new Map(registry.RACES.map((meta) => [meta.seed, meta.id]));

const { fingerprint } = await import(pathToFileURL(join(OUT, "fingerprint.js")).href);

/* Headed, per the repo's browser rule: headless renders through SwiftShader on
   the CPU, and channel Chrome is the engine visitors actually run, which is
   the engine whose Math this audit exists to compare. launchPlacedChrome puts
   that window on a display the operator is not using and returns the keyboard. */
const browser = await launchPlacedChrome();
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
const summary = {
  seedCount: seeds.length,
  failed: 0,
  maxElapsedDrift: 0,
  maxGapDrift: 0,
  maxFixChannelDrift: 0,
  maxSimulationFixDrift: 0,
  gapTextDiffs: 0,
  standingsOrderDiffs: 0,
  leaderTimelineDiffs: 0,
  finishOrderDiffs: 0,
  worstSwap: 0,
  strictVectorClosureFailures: 0,
  maxVectorClosureResidual: 0,
};
for (const seed of seeds) {
  const here = fingerprint(seed, traceTicks);
  const there = await page.evaluate(
    ({ candidate, trace }) => window.__fingerprint(candidate, trace),
    { candidate: seed, trace: traceTicks },
  );
  const report = compare(here, there);
  const label = named.get(seed) ?? "candidate";
  console.log(
    `${report.stable ? "pass" : "FAIL"}  seed ${seed} (${label})  ` +
      `winner ${here.results[0].sail} ${here.results[0].elapsed.toFixed(2)}s  ` +
      `elapsed drift ${report.maxElapsedDrift.toFixed(4)}s  ` +
      `gap drift ${report.maxGapDrift.toFixed(4)}s  ` +
      `fix channel drift ${report.maxFixChannelDrift.toExponential(2)}  ` +
      `raw fix drift ${report.maxSimulationFixDrift.toExponential(2)}  ` +
      `closure failures ${report.strictVectorClosureFailures}  ` +
      `gap readings that differ ${report.gapTextDiffs}  ` +
      `standings orders that differ ${report.standingsOrderDiffs}  ` +
      `widest standings swap ${report.worstSwap.toFixed(3)}s`,
  );
  for (const note of report.notes) console.log(`      ${note}`);
  if (!report.fixChannels) {
    console.log(`      first fix divergence ${JSON.stringify(report.firstFixDifference)}`);
  }
  if (!report.simulationFixChannels) {
    console.log(
      `      first raw fix divergence ${JSON.stringify(report.firstSimulationFixDifference)}`,
    );
  }
  if (report.firstRawVectorClosureFailure !== null) {
    console.log(
      `      first raw vector closure failure ${JSON.stringify(report.firstRawVectorClosureFailure)}`,
    );
  }
  if (report.firstSimulationTickDifference !== null) {
    console.log(
      `      first raw tick divergence ${JSON.stringify(report.firstSimulationTickDifference)}`,
    );
  }
  if (!report.stable && report.firstSimulationTickDifferencesByChannel !== null) {
    console.log(
      `      first raw tick divergence by channel ${JSON.stringify(report.firstSimulationTickDifferencesByChannel)}`,
    );
  }
  if (!report.stable) failed += 1;
  summary.maxElapsedDrift = Math.max(summary.maxElapsedDrift, report.maxElapsedDrift);
  summary.maxGapDrift = Math.max(summary.maxGapDrift, report.maxGapDrift);
  summary.maxFixChannelDrift = Math.max(summary.maxFixChannelDrift, report.maxFixChannelDrift);
  summary.maxSimulationFixDrift = Math.max(
    summary.maxSimulationFixDrift,
    report.maxSimulationFixDrift,
  );
  summary.gapTextDiffs += report.gapTextDiffs;
  summary.standingsOrderDiffs += report.standingsOrderDiffs;
  summary.leaderTimelineDiffs += report.leaders ? 0 : 1;
  summary.finishOrderDiffs += report.finishOrder ? 0 : 1;
  summary.worstSwap = Math.max(summary.worstSwap, report.worstSwap);
  summary.strictVectorClosureFailures += report.strictVectorClosureFailures;
  summary.maxVectorClosureResidual = Math.max(
    summary.maxVectorClosureResidual,
    report.maxVectorClosureResidual,
  );
}

await browser.close();
summary.failed = failed;
console.log(
  failed === 0
    ? `\nAll ${seeds.length} seeds read the same in Node and in Chromium`
    : `\n${failed} of ${seeds.length} seeds disagree across the two engines`,
);
console.log(`AUDIT_SUMMARY ${JSON.stringify(summary)}`);
process.exit(failed === 0 ? 0 : 1);
