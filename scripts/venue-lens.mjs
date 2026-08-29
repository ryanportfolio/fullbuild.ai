/* venue-lens: photograph the Long Beach venue up close, by name, in one command.
 *
 *   node scripts/venue-lens.mjs island-white
 *   node scripts/venue-lens.mjs all --orbit h=8,e=3 --label sweep-a
 *   node scripts/venue-lens.mjs island-white --dist 60,120,200 --label close-b \
 *        --compare close-a
 *   node scripts/venue-lens.mjs --gazetteer
 *
 * Why it exists: the venue's close-range look is the thing being worked on, and
 * the audit battery cannot see it. The battery orbits the fleet at the range a
 * hand can reach, which the pointer camera clamps to 900 m, so a THUMS island
 * is forty pixels of olive and nobody can say whether it reads as an island.
 * This stands the camera sixty metres off it instead, from any bearing and any
 * height, with the race taken out of the picture.
 *
 * How it stands there: `window.__layline.lens()` and `window.__layline.show()`,
 * the two dev-only doors in CaptureBridge. Nothing is posed by synthetic drag,
 * nothing is pressed on the canvas, and every pose is read back out of `info()`
 * and asserted before the shutter, so a shot that says it stands 60 m off White
 * Island stands 60 m off White Island.
 *
 * Output, under .tmp/venue-lens/<label>/:
 *   <target>_h<heading>_e<elev>_d<dist>.png   one shot per pose
 *   sheet-<target>.png                        contact sheet, headings across
 *   crop-<target>_...png                      3x centre crop of the near shots
 *   run.json                                  every pose, its readback, the
 *                                             constants, and any compare
 *
 * Rules this file will not break (kernel + .claude/reference/pitfalls-layline.md):
 *   - headed Chrome on the real GPU through launchPlacedChrome. Never headless:
 *     SwiftShader renders this page on the CPU and pegs the machine.
 *   - the server gate runs before any capture, because `npm run build` tears a
 *     running dev server's .next and the page still returns 200 unstyled.
 *   - the pointer is parked at (4,4) before every canvas shot: an element
 *     screenshot composites the DOM over the canvas box and a hovering pointer
 *     is in the picture.
 *   - one page for every shot in a run. A second page is opened at the end for
 *     compositing sheets, which never touches the scene.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchPlacedChrome } from "./lib/launch-chrome.mjs";
import { deriveGazetteer, defaultDistances, loadGazetteer } from "./lib/venue-gazetteer.mjs";
import { readPng, comparePng } from "./lib/png.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.LAYLINE_PORT ?? 3907);
const BASE = `http://localhost:${PORT}`;
const RACE = `${BASE}/prototype/layline/races?race=long-beach`;
const OUT_ROOT = join(ROOT, ".tmp", "venue-lens");

/* The frozen replay second every shot is taken at. Stated rather than left to
 * whenever the page happened to load: the water's displacement, its foam and
 * its specular all run off the replay clock, so two runs at the same second are
 * two photographs of the same sea. */
const DEFAULT_T = 12;
/* The lens's field of view. Every pixel measurement in a run is only comparable
 * to another run at the same one (pitfalls-layline: the freeform camera
 * inherits its fov from the rig it entered through, and 23 px of ridge went
 * missing the one time that was assumed). It is written into run.json. */
const DEFAULT_FOV = 45;
/* Elevations sweep this band. Six degrees is a boat's eye with a little air
 * under it; forty looks down on a roof without becoming a plan. */
const ELEV_LOW = 6;
const ELEV_HIGH = 40;
const VIEWPORT = { width: 1600, height: 950 };

/* --------------------------------------------------------------- arguments */

function parseArgs(argv) {
  const opts = {
    target: null,
    headings: 8,
    elevations: 3,
    dists: null,
    label: null,
    compare: null,
    fov: DEFAULT_FOV,
    t: DEFAULT_T,
    boats: false,
    hud: false,
    water: true,
    ui: false,
    layers: null,
    gazetteer: false,
    keepServerGate: true,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--gazetteer") opts.gazetteer = true;
    else if (arg === "--orbit") {
      for (const part of next().split(",")) {
        const [key, value] = part.split("=");
        if (key === "h") opts.headings = Number(value);
        else if (key === "e") opts.elevations = Number(value);
        else throw new Error(`--orbit takes h= and e=, not ${key}`);
      }
    } else if (arg === "--dist") opts.dists = next().split(",").map(Number);
    else if (arg === "--label") opts.label = next();
    else if (arg === "--compare") opts.compare = next();
    else if (arg === "--fov") opts.fov = Number(next());
    else if (arg === "--t") opts.t = Number(next());
    else if (arg === "--layers") opts.layers = next().split(",").map(Number);
    else if (arg === "--boats") opts.boats = true;
    else if (arg === "--hud") opts.hud = true;
    else if (arg === "--no-water") opts.water = false;
    else if (arg === "--ui") opts.ui = true;
    else if (arg === "--no-server-gate") opts.keepServerGate = false;
    else if (arg.startsWith("--")) throw new Error(`unknown flag ${arg}`);
    else rest.push(arg);
  }
  opts.target = rest[0] ?? null;
  return opts;
}

const USAGE = `usage:
  node scripts/venue-lens.mjs <target|all> [options]
  node scripts/venue-lens.mjs --gazetteer

options:
  --orbit h=8,e=3     headings around the target, elevations from ${ELEV_LOW} to ${ELEV_HIGH} deg
  --dist 60,150,400   ranges in metres (default: derived from the target's own reach)
  --label <name>      output folder under .tmp/venue-lens (default: the target)
  --compare <label>   pixel-diff every shot against the same filename in that run
  --fov <deg>         lens field of view (default ${DEFAULT_FOV})
  --t <seconds>       replay second to freeze at (default ${DEFAULT_T})
  --layers 1,3,4      venue layer class ids to draw (default: all)
  --boats  --hud      put the fleet / the race overlay back in the picture
  --no-water          drop the sea as well
  --ui                leave the instrument panel up
  --no-server-gate    skip the torn-.next check (do not)`;

/* --------------------------------------------------------------- gazetteer */

if (process.argv.includes("--gazetteer")) {
  const gazetteer = deriveGazetteer(ROOT);
  const path = join(ROOT, "scripts", "venue-lens-targets.json");
  writeFileSync(path, `${JSON.stringify(gazetteer, null, 2)}\n`);
  console.log(`wrote ${path}`);
  for (const t of gazetteer.targets) {
    console.log(
      `  ${t.name.padEnd(16)} x=${String(t.x).padStart(6)} z=${String(t.z).padStart(6)} ` +
        `r=${String(t.radius).padStart(4)} ground=${t.ground} top=${t.top} ` +
        `range=${t.range} dists=${t.dists.join("/")}`,
    );
    console.log(`  ${" ".repeat(16)} ${t.derivedFrom}`);
  }
  process.exit(0);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.target === null) {
  console.error(USAGE);
  process.exit(1);
}

const gazetteer = loadGazetteer(ROOT);
const targets =
  opts.target === "all"
    ? gazetteer.targets
    : gazetteer.targets.filter((t) => t.name === opts.target);
if (targets.length === 0) {
  console.error(
    `unknown target "${opts.target}". known: ${gazetteer.targets.map((t) => t.name).join(", ")}, or "all"`,
  );
  process.exit(1);
}
const label = opts.label ?? opts.target;
const OUT = join(OUT_ROOT, label);
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------- server gate */

/* Refuse to capture against a torn .next (round 4d lost a whole capture to two
 * dev servers sharing one worktree: the document answered 200 while the route
 * stylesheet 404'd, so the page rendered unstyled and every crop rectangle in
 * the round pointed at the wrong pixels). Same checks as
 * .tmp/venue-audit/round4d/server-gate.mjs, run inline so no capture can skip
 * it by accident. */
async function serverGate() {
  const problems = [];
  const doc = await fetch(RACE).catch((err) => {
    throw new Error(`no dev server on ${BASE}: ${err.message}`);
  });
  const html = await doc.text();
  if (doc.status !== 200) problems.push(`document ${doc.status}`);
  const css = [...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
  const js = [
    ...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1])),
  ];
  if (css.length < 2) problems.push(`${css.length} stylesheet link(s) in the document, expected 2`);
  const get = async (href) => {
    const r = await fetch(`${BASE}${href}`);
    const bytes = (await r.arrayBuffer()).byteLength;
    return { status: r.status, bytes };
  };
  for (const href of css) {
    const r = await get(href);
    if (r.status !== 200) problems.push(`${href} -> ${r.status}`);
    else if (r.bytes < 200) problems.push(`${href} is ${r.bytes} B, a torn cache not a stylesheet`);
  }
  for (const src of js) {
    const r = await get(src);
    if (r.status !== 200) problems.push(`${src} -> ${r.status}`);
  }
  const asset = await get(`/prototype/layline/venues/${gazetteer.venue}.bin`);
  if (asset.status !== 200) problems.push(`venue asset -> ${asset.status}`);
  return { problems, stylesheets: css.length, chunks: js.length, assetBytes: asset.bytes };
}

if (opts.keepServerGate) {
  const gate = await serverGate();
  if (gate.problems.length > 0) {
    console.error(`SERVER GATE FAILED:\n  ${gate.problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `server gate: clean (${gate.stylesheets} stylesheets, ${gate.chunks} chunks, asset ${gate.assetBytes} B)`,
  );
}

/* ------------------------------------------------------------------- poses */

const DEG = Math.PI / 180;

function elevations(count) {
  if (count <= 1) return [Math.round((ELEV_LOW + ELEV_HIGH) / 2)];
  const step = (ELEV_HIGH - ELEV_LOW) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(ELEV_LOW + i * step));
}

const pad = (value, width) => String(Math.round(value)).padStart(width, "0");

/**
 * Where the eye stands for one shot.
 *
 * Heading and elevation are the same spherical convention `interaction.ts`
 * uses for the pointer camera, so a bearing read off a lens shot means what it
 * means everywhere else on this page:
 *
 *   eye = aim + (sin h cos e, sin e, cos h cos e) * dist
 *
 * Heading 0 therefore stands on the +z side of the target, which is down the
 * course toward the start, and increases clockwise seen from above.
 */
function poseFor(target, heading, elevation, dist) {
  const h = heading * DEG;
  const e = elevation * DEG;
  const lean = Math.cos(e);
  return {
    target: target.name,
    heading,
    elevation,
    dist,
    x: round2(target.x + Math.sin(h) * lean * dist),
    y: round2(target.aimY + Math.sin(e) * dist),
    z: round2(target.z + Math.cos(h) * lean * dist),
    lookAt: [target.x, target.aimY, target.z],
    fov: opts.fov,
    name: `${target.name}_h${pad(heading, 3)}_e${pad(elevation, 3)}_d${pad(dist, 4)}`,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

/* Headings across, then range, then elevation: the contact sheet reads as one
 * row per (elevation, range) band, with the target turning through the row. */
const plan = [];
const distsOf = (target) => opts.dists ?? target.dists ?? defaultDistances(target.radius);
for (const target of targets) {
  for (const elevation of elevations(opts.elevations)) {
    for (const dist of distsOf(target)) {
      for (let i = 0; i < opts.headings; i++) {
        plan.push(poseFor(target, Math.round((i * 360) / opts.headings), elevation, dist));
      }
    }
  }
}
console.log(
  `${targets.length} target(s): ${opts.headings} headings x ${opts.elevations} elevations x ` +
    `${distsOf(targets[0]).length} ranges = ${plan.length} shots`,
);

/* ------------------------------------------------------------------ browser */

const browser = await launchPlacedChrome({ args: ["--use-gl=angle"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

const problems = [];

await page.goto(RACE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__layline?.ready === true, null, { timeout: 60000 });

/* The cover owns the pointer until it is dismissed, and a shot taken behind it
 * is a shot of the cover. */
const start = page.getByRole("button", { name: /start the race/i }).first();
if (await start.isVisible().catch(() => false)) {
  await start.click();
  await page.waitForTimeout(1200);
}
if (await start.isVisible().catch(() => false)) problems.push("the race cover is still up");

/* Ready follows the first drawn venue frame, but on the fallback path only the
 * procedural arc has been drawn. A capture that wants the real coast has to
 * check the draw calls (pitfalls-layline). */
await page.waitForTimeout(1500);
const arrival = await page.evaluate(() => window.__layline.info());
if (arrival.drawCalls < 50) {
  problems.push(
    `only ${arrival.drawCalls} draw calls on arrival: this is the procedural fallback arc, not the baked coast`,
  );
}

await page.evaluate(() => window.__layline.freeze());
await page.evaluate((t) => window.__layline.seek(t), opts.t);

const hasDoors = await page.evaluate(
  () => typeof window.__layline.lens === "function" && typeof window.__layline.show === "function",
);
if (!hasDoors) {
  console.error(
    "this page has no __layline.lens/.show: they are dev-only, so the server must be `next dev`, not a production build",
  );
  await browser.close();
  process.exit(1);
}

/* Bare by default: the instrument panel down, the fleet and the race overlay
 * out of the picture, the sea left in because it is half of what the coast is
 * being judged against. `ui(false)` and `show()` are separate mechanisms (DOM
 * visibility against scene visibility) and compose. */
await page.evaluate((show) => window.__layline.ui(show), opts.ui);
const maskWanted = {
  all: false,
  boats: opts.boats,
  hud: opts.hud,
  water: opts.water,
  venueLayers: opts.layers,
};
await page.evaluate((mask) => window.__layline.show(mask), maskWanted);

const canvas = await page.evaluate(() => {
  let best = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    if (best === null || r.width * r.height > best.width * best.height) {
      best = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
  }
  return best;
});
console.log(`canvas ${canvas.width}x${canvas.height} at ${canvas.x},${canvas.y}`);

const framesAtStart = (await page.evaluate(() => window.__layline.info())).frames;

/* ------------------------------------------------------------------- shots */

const TOLERANCE = 0.02; // metres; the readback is the same number that was sent

const shots = [];
const started = Date.now();
let framesBefore = framesAtStart;
for (const pose of plan) {
  await page.evaluate(
    (p) => window.__layline.lens({ x: p.x, y: p.y, z: p.z, lookAt: p.lookAt, fov: p.fov }),
    pose,
  );
  /* Wait for the drawn frame rather than for a stopwatch. A frozen canvas runs
     its loop at "never" and only requestSceneFrame moves it, so this is both
     the fastest correct wait and the thing that makes a rerun byte-identical:
     exactly one frame is drawn per pose, so two runs of the same command have
     drawn the same number of frames at every shutter. */
  await page.waitForFunction(
    (was) => window.__layline.info().frames > was,
    framesBefore,
    { timeout: 10000 },
  );
  const info = await page.evaluate(() => window.__layline.info());
  if (info.frames !== framesBefore + 1) {
    problems.push(`${pose.name}: ${info.frames - framesBefore} frames drawn for one pose, expected 1`);
  }
  framesBefore = info.frames;
  const readback = info.lens;
  const off = [
    ["x", readback.x, pose.x],
    ["y", readback.y, pose.y],
    ["z", readback.z, pose.z],
    ["aim x", readback.lookAt[0], pose.lookAt[0]],
    ["aim y", readback.lookAt[1], pose.lookAt[1]],
    ["aim z", readback.lookAt[2], pose.lookAt[2]],
    ["fov", readback.fov, pose.fov],
  ].filter(([, got, want]) => Math.abs(got - want) > TOLERANCE);
  if (!readback.active) problems.push(`${pose.name}: the lens is not standing`);
  for (const [field, got, want] of off) {
    problems.push(`${pose.name}: ${field} read back ${got}, asked for ${want}`);
  }
  /* Parked off the canvas: an element screenshot composites every DOM layer
     over the box, and the pointer's own overlay is one of them. */
  await page.mouse.move(4, 4);
  await page.screenshot({ path: join(OUT, `${pose.name}.png`), clip: canvas });
  shots.push({
    ...pose,
    readback,
    show: info.show,
    t: info.t,
    drawnAt: info.drawnAt,
    drawCalls: info.drawCalls,
    triangles: info.triangles,
    frames: info.frames,
  });
  if (shots.length % 8 === 0 || shots.length === plan.length) {
    console.log(`  ${shots.length}/${plan.length} shots (${Math.round((Date.now() - started) / 1000)} s)`);
  }
}

/* Hand the camera back and prove the page still works: the visitor's own orbit
 * has to survive an inspection run untouched. */
const beforeRestore = await page.evaluate(() => window.__layline.info());
await page.evaluate(() => window.__layline.lens(null));
await page.evaluate(() => window.__layline.show({ all: true }));
await page.evaluate(() => window.__layline.ui(true));
await page.evaluate(() => window.__layline.camera({ yaw: 0.75, pitch: 0.5, dist: 240 }));
const afterRestore = await page.evaluate(() => window.__layline.info());
const restore = {
  freeformBefore: { yaw: beforeRestore.yaw, pitch: beforeRestore.pitch, dist: beforeRestore.dist },
  lensDown: afterRestore.lens.active === false,
  cameraTook:
    Math.abs(afterRestore.yaw - 0.75) < 1e-9 &&
    Math.abs(afterRestore.pitch - 0.5) < 1e-9 &&
    Math.abs(afterRestore.dist - 240) < 1e-9,
  after: { yaw: afterRestore.yaw, pitch: afterRestore.pitch, dist: afterRestore.dist },
  drawCalls: afterRestore.drawCalls,
};
if (!restore.lensDown) problems.push("lens(null) did not put the lens down");
if (!restore.cameraTook) problems.push("the pointer camera did not take a pose after lens(null)");

/* ------------------------------------------------- sheets, crops, compare */

const sheetPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await sheetPage.goto("about:blank");

async function composite(names, cols, title, file, scale) {
  const images = names.map((n) => ({
    label: n,
    data: `data:image/png;base64,${readFileSync(join(OUT, `${n}.png`)).toString("base64")}`,
  }));
  const dataUrl = await sheetPage.evaluate(
    async ([images, cols, title, scale]) => {
      const loaded = await Promise.all(
        images.map(
          (it) =>
            new Promise((res, rej) => {
              const img = new Image();
              img.onload = () => res({ img, label: it.label });
              img.onerror = () => rej(new Error(`load ${it.label}`));
              img.src = it.data;
            }),
        ),
      );
      const cw = Math.round(loaded[0].img.naturalWidth * scale);
      const ch = Math.round(loaded[0].img.naturalHeight * scale);
      const rows = Math.ceil(loaded.length / cols);
      const padding = 6;
      const head = 24;
      const canvas = document.createElement("canvas");
      canvas.width = cols * (cw + padding) + padding;
      canvas.height = head + rows * (ch + head + padding) + padding;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#101418";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "15px monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(title, padding + 2, head / 2);
      loaded.forEach((it, i) => {
        const x = padding + (i % cols) * (cw + padding);
        const y = head + padding + Math.floor(i / cols) * (ch + head + padding);
        ctx.drawImage(it.img, x, y, cw, ch);
        ctx.strokeStyle = "#3a4450";
        ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y + ch, cw, head - 2);
        ctx.fillStyle = "#7fe3a0";
        ctx.font = "13px monospace";
        ctx.fillText(it.label, x + 6, y + ch + (head - 2) / 2);
      });
      return canvas.toDataURL("image/png");
    },
    [images, cols, title, scale],
  );
  writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  return file;
}

async function crop(name, out, zoom) {
  const src = `data:image/png;base64,${readFileSync(join(OUT, `${name}.png`)).toString("base64")}`;
  const dataUrl = await sheetPage.evaluate(
    async ([src, zoom]) => {
      const img = await new Promise((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = () => rej(new Error("load"));
        el.src = src;
      });
      /* The middle third of the frame, which is where the lens put the target:
         the aim is the frame centre by construction. */
      const w = Math.round(img.naturalWidth / 3);
      const h = Math.round(img.naturalHeight / 3);
      const x = Math.round((img.naturalWidth - w) / 2);
      const y = Math.round((img.naturalHeight - h) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = w * zoom;
      canvas.height = h * zoom;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    },
    [src, zoom],
  );
  writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  return out;
}

const sheets = [];
const crops = [];
for (const target of targets) {
  const mine = shots.filter((s) => s.target === target.name);
  if (mine.length === 0) continue;
  sheets.push(
    await composite(
      mine.map((s) => s.name),
      opts.headings,
      `${target.name}  |  r=${target.radius} m, ground ${target.ground} m, top ${target.top} m, ${target.range} m from the origin  |  fov ${opts.fov}, t=${opts.t}`,
      join(OUT, `sheet-${target.name}.png`),
      opts.headings >= 8 ? 0.25 : 0.4,
    ),
  );
  /* A 3x crop of the middle third of the frame, which is where the aim is by
     construction, at the closest range from two opposed bearings: the picture
     the owner actually judges, at the size they judge it. */
  const nearest = Math.min(...mine.map((s) => s.dist));
  for (const shot of mine) {
    if (shot.dist !== nearest) continue;
    if (shot.heading !== 0 && shot.heading !== 180) continue;
    crops.push(await crop(shot.name, join(OUT, `crop-${shot.name}.png`), 3));
  }
}

let compare = null;
if (opts.compare !== null) {
  const refDir = join(OUT_ROOT, opts.compare);
  if (!existsSync(refDir)) {
    problems.push(`--compare ${opts.compare}: no run at ${refDir}`);
  } else {
    const rows = [];
    for (const shot of shots) {
      const refFile = join(refDir, `${shot.name}.png`);
      if (!existsSync(refFile)) {
        rows.push({ name: shot.name, missing: true });
        continue;
      }
      const stats = comparePng(readPng(refFile), readPng(join(OUT, `${shot.name}.png`)));
      rows.push({ name: shot.name, ...stats });
    }
    const measured = rows.filter((r) => r.comparable);
    const identical = measured.filter((r) => r.differing === 0).length;
    const worst = [...measured].sort((a, b) => b.differing - a.differing).slice(0, 10);
    compare = {
      against: opts.compare,
      /* Frame counts, because the phase of anything that advances per drawn
         frame only matches at an equal count. On a frozen page nothing draws
         but what this script asks for, so equal shot counts mean equal frame
         counts; a mismatch is why a diff is not zero. */
      frames: { thisRun: shots.at(-1)?.frames ?? null },
      images: rows.length,
      missing: rows.filter((r) => r.missing).length,
      incomparable: rows.filter((r) => r.comparable === false).length,
      byteIdentical: identical,
      worst: worst.map((r) => ({
        name: r.name,
        differing: r.differing,
        percent: r.percent,
        maxDelta: r.maxDelta,
        meanDelta: r.meanDelta,
        over1: r.over,
      })),
      rows,
    };
    console.log(
      `compare against ${opts.compare}: ${identical}/${measured.length} pixel-identical, ` +
        `${compare.missing} missing, worst ${worst[0]?.differing ?? 0} differing samples ` +
        `(max delta ${worst[0]?.maxDelta ?? 0})`,
    );
    for (const row of worst.filter((r) => r.differing > 0)) {
      console.log(
        `  ${row.name}  ${row.differing} samples (${row.percent}%), max ${row.maxDelta}, mean ${row.meanDelta}`,
      );
    }
  }
}

/* --------------------------------------------------------------- run.json */

/* A browser error is a failed run, not a footnote: a shader compile failure or
 * an uncaught page exception can still produce plausible-looking captures, and
 * a run that prints `clean` over one would be accepted as evidence. Promoted
 * here, before run.json is assembled, so the failure is in the artifact too. */
if (consoleErrors.length > 0) {
  problems.push(
    `${consoleErrors.length} console/page error(s); first: ${consoleErrors[0]}`,
  );
}

const run = {
  label,
  command: process.argv.slice(1).join(" "),
  ranAt: new Date().toISOString(),
  venue: gazetteer.venue,
  gazetteerDerivedAt: gazetteer.derivedAt,
  constants: {
    /* Every pixel measurement in this run is only comparable to another run
       with the same three (pitfalls-layline: fov is inherited, not stated, on
       the pointer camera, and 23 px of ridge went missing the one time that
       was assumed). The lens states its own, so there is no entry route to
       record: it is applied to the camera directly, whatever rig is behind. */
    fov: opts.fov,
    t: opts.t,
    viewport: VIEWPORT,
    canvas,
    deviceScaleFactor: 1,
    route: "lens() applied to the camera directly; no rig seeding, no fov inheritance",
    pixelsPerRadian: round2(canvas.height / (2 * Math.tan((opts.fov * DEG) / 2))),
  },
  mask: { asked: maskWanted, ui: opts.ui },
  arrival: {
    drawCalls: arrival.drawCalls,
    triangles: arrival.triangles,
    frames: arrival.frames,
  },
  frames: { atFirstShot: framesAtStart, atLastShot: shots.at(-1)?.frames ?? null },
  restore,
  targets: targets.map((t) => ({ ...t })),
  shots,
  compare,
  consoleErrors,
  problems,
  sheets: sheets.map((f) => f.slice(ROOT.length + 1)),
  crops: crops.map((f) => f.slice(ROOT.length + 1)),
};
writeFileSync(join(OUT, "run.json"), `${JSON.stringify(run, null, 2)}\n`);

await browser.close();

console.log(`\n${shots.length} shots in ${Math.round((Date.now() - started) / 1000)} s -> ${OUT}`);
console.log(`sheets: ${sheets.length}, crops: ${crops.length}`);
if (consoleErrors.length > 0) console.log(`console errors: ${consoleErrors.length}`);
if (problems.length > 0) {
  console.error(`\nPROBLEMS:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("clean");
