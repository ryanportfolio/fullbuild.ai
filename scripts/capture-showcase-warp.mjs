/*
 * CAPTURE HARNESS for the showcase "View all" warp.
 *
 * Every visual claim about this feature has to be photographed, and photographed twice, or
 * it is not a claim it is a guess. So the harness runs the whole beat list twice inside one
 * browser session and compares the two PNGs. A beat that does not reproduce is a defect in
 * the beat, not a note in the report.
 *
 * WHAT REPRODUCIBLE MEANS HERE, AND WHY IT IS NOT BYTE FOR BYTE. Measured against this page
 * before any of the warp existed: two screenshots of one frozen frame are byte identical, so
 * the capture path itself is deterministic. Re-render that same frame and about 27 per cent
 * of the samples move by exactly one count. That floor is the film grain and it cannot be
 * pinned from outside the scene: postprocessing's NoiseEffect is
 * `rand(uv * (1.0 + time))`, and `time` is the composer's own accumulated delta since mount,
 * which no capture hook resets. Any change in it rerolls the whole field.
 *
 * So the gate is structural identity, measured the way the difference between grain and
 * structure actually behaves: both frames are reduced to 16x16 block means before they are
 * compared. White noise averages down by the block size and structure does not, so the
 * grain's reroll collapses to under a count while a crystal that moved, a control that
 * shifted or a lamp that came up differently survives intact. Measured on this page across
 * several runs: the settled beats agree to within about a count of 255 at block resolution,
 * and the loud ones, where the grain runs at up to thirty-three times base under a flare at
 * full, have landed anywhere from 2.2 to 7.60 depending on where the reroll falls. Two
 * genuinely different frames land over two hundred. That is still more than an order of
 * magnitude of separation, so the verdict is not a judgement call, but the limit below is 8
 * and the worst beat has measured 7.60 against it: the headroom is thin and it is the grain,
 * not the picture, that is spending it.
 *
 * The raw per-sample numbers are printed alongside it, so the claim stays a measurement.
 *
 * RUN THE WHOLE LIST, OR AT LEAST MORE THAN ONE BEAT. `--beats rest` on its own reports rest
 * as UNSTABLE at a block max around 196, and the frames show the crystals at two different
 * rotations while the DOM is identical. The drift rides `clock.elapsedTime`, which
 * `setFrameloop` zeroes on every freeze and thaw, so a beat's pose depends on how many pin
 * cycles ran before it and the two passes only agree when both reach it the same way.
 * Measured 2026-08-09: the same beat inside its usual list comes back stable at 0.98 with
 * zero blocks apart. A single-beat run is a false negative, not a defect in the page.
 *
 * HELD BEATS ARE NOT WHAT A READER SEES, and that is the point of the second set. A held beat
 * renders 120 settle frames before it is photographed, so it shows a converged atmosphere and
 * finished CSS transitions: at held `cross` the ledger is already at opacity 0 and the finale
 * already up, while live at the same wall-clock moment they are mid-move. So every warp beat
 * is captured twice over: once pinned, which is reproducible and shows the composition, and
 * once from a real uncontrolled click frozen at the beat's own wall-clock time, which shows
 * the frame. Live frames sample a wall clock and land anywhere inside one frame period, so
 * they are reported and never gated.
 *
 * The deterministic protocol, and every step of it is load bearing:
 *
 *   1. park the scrollbar at the progress the beat is armed from, and wait for the damped
 *      camera and the 0.045-per-frame atmosphere lerp to converge on it;
 *   2. then, in ONE page-side sequence with no round trip inside it: thaw, which calls
 *      setFrameloop and therefore zeroes clock.elapsedTime at a moment we know (r3f 9.1,
 *      events-*.cjs.dev.js:1112-1125), so every Math.sin(clock.elapsedTime) term in the
 *      scene starts from the same phase; pin the beat, which publishes the whole frame
 *      synchronously, the ref and the scrollbar and the React progress together; count an
 *      exact number of animation frames; then freeze on the last of them.
 *
 * COUNTING FRAMES RATHER THAN WAITING A FIXED TIME IS THE WHOLE TRICK, and it was measured
 * rather than guessed. A wall-clock wait lets the last rendered frame land anywhere inside
 * one frame period, so two captures of the same beat can differ by a whole frame of
 * clock.elapsedTime, which the crystal shaders carry as uTime. Measured on the page before
 * any of the warp existed, that put a mean of 3.7 counts across fifteen per cent of the
 * frame, roughly half the time. Counting frames pins it: the same protocol then reproduces
 * every beat down to the grain floor below.
 *
 * freeze() only, never step(): step() feeds an absolute performance.now() into a clock that
 * setFrameloop has just zeroed, which lands every sine in the scene on an arbitrary phase.
 *
 * Usage:
 *   node scripts/capture-showcase-warp.mjs --port 43121 --out .tmp/shots
 *   node scripts/capture-showcase-warp.mjs --beats rest,natural-end
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

const DEFAULT_PORT = 43121;
const DEFAULT_OUT = ".tmp/shots";
const BASE_VIEWPORT = { width: 1440, height: 900 };

/*
 * Chromium throttles timers and rAF in a window it thinks nobody is looking at, and a
 * throttled rAF turns a fixed wall-clock wait into a variable frame count, which is the one
 * thing this protocol cannot tolerate. ANGLE because the software path renders a different
 * frame from the one a reader sees.
 */
const LAUNCH_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--use-gl=angle",
];

/* How many rendered frames the world is given to converge before a frame is taken. The
 * atmosphere lerps at 0.045 a frame, which is about a hundred frames to settle, so this is
 * the floor rather than a round number. It runs about two seconds of wall time at 60Hz. */
const SETTLE_FRAMES = 120;
/* Wall time after a plain scroll, before a beat is armed on top of it: long enough for the
 * damped camera to arrive, so the run's entry-z latch has something settled to latch. */
const ARM_MS = 1200;
/* Bleach dwell is 150ms and its verify pass is another 140ms, so a hover frame has to sit
 * well past both before it can say anything about whether the world drained. */
const HOVER_MS = 700;

/*
 * The beat list, one row per visual claim in the spec. `scroll` beats need nothing but the
 * scrollbar and work against the page as it shipped before any of this existed, which is
 * what makes them the harness's own smoke test.
 */
const WARP_BEAT_NAMES = ["charge", "launch", "run", "pulse-gap", "pulse-peak", "cross", "flare", "arrive", "settle"];

const SHOTS = [
  { name: "rest", kind: "scroll", progress: 0.5 },
  { name: "hover", kind: "hover", progress: 0.5 },
  ...WARP_BEAT_NAMES.map((beat) => ({ name: beat, kind: "warp", beat })),
  /* The same nine moments taken off a real click instead of a pin. Not gated: see the header. */
  ...WARP_BEAT_NAMES.map((beat) => ({ name: `live-${beat}`, kind: "live", beat })),
  { name: "natural-end", kind: "scroll", progress: 1 },
  /* One per breakpoint band, plus both sides of the measured 1162px boundary where the
   * control stops fitting beside the ledger's full info measure. */
  { name: "w1162", kind: "scroll", progress: 0.5, viewport: { width: 1162, height: 900 } },
  { name: "w1152", kind: "scroll", progress: 0.5, viewport: { width: 1152, height: 900 } },
  { name: "w1100", kind: "scroll", progress: 0.5, viewport: { width: 1100, height: 900 } },
  { name: "w1000", kind: "scroll", progress: 0.5, viewport: { width: 1000, height: 900 } },
  { name: "w900", kind: "scroll", progress: 0.5, viewport: { width: 900, height: 900 } },
  { name: "w390", kind: "scroll", progress: 0.5, viewport: { width: 390, height: 844 } },
  { name: "reduced", kind: "reduced" },
];

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, out: DEFAULT_OUT, beats: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [flag, inline] = token.startsWith("--") && token.includes("=")
      ? token.split(/=(.*)/s)
      : [token, null];
    const value = inline ?? argv[index + 1];
    if (flag === "--port") { args.port = Number(value); if (inline === null) index += 1; }
    else if (flag === "--out") { args.out = value; if (inline === null) index += 1; }
    else if (flag === "--beats") { args.beats = value.split(",").map((name) => name.trim()); if (inline === null) index += 1; }
  }
  return args;
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

/* Playwright writes 8 bit non-interlaced PNGs, so the decoder only has to carry the five
 * standard row filters. Nothing here is general purpose, it exists so a difference can be
 * reported in counts rather than as a hash mismatch. */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`unsupported bit depth ${data[8]}`);
      colorType = data[9];
    } else if (type === "IDAT") chunks.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior[x];
      const upLeft = x >= channels ? prior[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        value += dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      }
      row[x] = value & 255;
    }
  }
  return { width, height, channels, data: out };
}

/* Sixteen is chosen against the loudest beat in the piece: the crossing runs the grain at
 * thirty-three times base, and a block this size takes that back under a count while leaving
 * anything the size of a crystal edge untouched. */
const COMPARE_BLOCK = 16;
/* Counts out of 255, at block resolution. Measured: the loudest gated beat has come in as high
 * as 7.60 against this, and two genuinely different frames land over 197. */
const BLOCK_DELTA_LIMIT = 8;
/* And a bound on how many blocks may sit even slightly apart, as a fraction of the frame. */
const BLOCK_OVER_SHARE = 0.01;

function compareBlocks(a, b) {
  const across = Math.ceil(a.width / COMPARE_BLOCK);
  const down = Math.ceil(a.height / COMPARE_BLOCK);
  let max = 0;
  let over = 0;

  for (let blockY = 0; blockY < down; blockY += 1) {
    for (let blockX = 0; blockX < across; blockX += 1) {
      const top = blockY * COMPARE_BLOCK;
      const left = blockX * COMPARE_BLOCK;
      const bottom = Math.min(a.height, top + COMPARE_BLOCK);
      const right = Math.min(a.width, left + COMPARE_BLOCK);
      let counted = false;
      for (let channel = 0; channel < 3; channel += 1) {
        let sumA = 0;
        let sumB = 0;
        let samples = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * a.width + x) * a.channels + channel;
            sumA += a.data[index];
            sumB += b.data[index];
            samples += 1;
          }
        }
        const delta = Math.abs(sumA - sumB) / Math.max(1, samples);
        if (delta > max) max = delta;
        if (delta > 2 && !counted) {
          over += 1;
          counted = true;
        }
      }
    }
  }

  return { max: Number(max.toFixed(2)), over, blocks: across * down };
}

function comparePng(first, second) {
  const identical = Buffer.compare(first, second) === 0;
  const a = decodePng(first);
  const b = decodePng(second);
  if (a.width !== b.width || a.height !== b.height) {
    return { identical: false, stable: false, differing: -1, overOne: -1, max: -1, samples: 0, block: null };
  }

  let differing = 0;
  let overOne = 0;
  let max = 0;
  for (let index = 0; index < a.data.length; index += 1) {
    const delta = Math.abs(a.data[index] - b.data[index]);
    if (delta === 0) continue;
    differing += 1;
    if (delta > 1) overOne += 1;
    if (delta > max) max = delta;
  }

  const block = compareBlocks(a, b);
  return {
    identical,
    stable: block.max <= BLOCK_DELTA_LIMIT && block.over <= block.blocks * BLOCK_OVER_SHARE,
    differing,
    overOne,
    max,
    samples: a.data.length,
    block,
  };
}

/*
 * Reach the entered, settled world. Everything before this point is the loader and the entry
 * choreography, both of which run their own clocks, and no frame taken inside them means
 * anything.
 */
async function enterShowcase(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('main[data-ready="true"]', { timeout: 60000 });
  await page.evaluate(() => {
    const button = document.querySelector('main button[class*="enterButton"]');
    if (button instanceof HTMLElement) button.click();
  });
  await page.waitForSelector('main[data-entry-settled="true"]', { timeout: 30000 });
  // The pointer sits outside the frame for every beat but `hover`, so nothing in the scene
  // is carrying a parallax offset that depends on where the mouse happened to land.
  await page.mouse.move(0, 0);
  // The finale's index cards are lazy, and a half-decoded card is a different frame.
  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
}

async function scrollTo(page, progress) {
  await page.evaluate((value) => {
    const shell = document.querySelector("main");
    if (!shell) return;
    const distance = Math.max(1, shell.offsetHeight - window.innerHeight);
    window.scrollTo(0, Math.round(value * distance));
  }, progress);
}

async function hasWarpHook(page) {
  return page.evaluate(() => typeof window.__showcaseWarp !== "undefined");
}

/*
 * Park the pointer somewhere that is provably not a crystal, and prove it landed. A crystal
 * that was hovered when a run committed keeps its data-hovered-project, because the canvas
 * goes pointer-events: none for the duration and no pointerleave is ever coming. That hover
 * is worth a glass ramp on the crystal and a whole pill on screen, so a beat is not
 * reproducible until it is gone. Corners first, because they are usually empty, but which
 * corner is empty depends on where the chapter happens to be sitting, so it tries several
 * and reports rather than guessing once.
 */
async function parkPointer(page, viewport) {
  const spots = [
    [0, 0],
    [2, viewport.height - 2],
    [viewport.width - 2, viewport.height - 2],
    [viewport.width - 2, 2],
  ];

  for (const [x, y] of spots) {
    // Two moves, because a move to the point the pointer already occupies emits nothing.
    await page.mouse.move(x + 3, y === 0 ? 3 : y - 3);
    await page.mouse.move(x, y);
    await page.waitForTimeout(120);
    const clear = await page.evaluate(
      () => !document.querySelector("main canvas")?.dataset.hoveredProject,
    );
    if (clear) return [x, y];
  }

  console.log("  WARNING: every parking spot left a crystal hovered");
  return null;
}

/*
 * The atomic part. Thaw, optionally pin a beat, render an exact number of frames, freeze on
 * the last one. It has to be one page-side sequence: a Playwright round trip between the
 * thaw and the pin would put a few milliseconds of jitter back into clock.elapsedTime, which
 * is exactly what this is here to remove.
 */
async function settleAndFreeze(page, beat) {
  await page.evaluate(({ name, frames }) => new Promise((resolve) => {
    window.__showcaseCapture?.thaw();
    if (name) window.__showcaseWarp?.hold(name, 0);
    let ticks = 0;
    const tick = () => {
      ticks += 1;
      if (ticks >= frames) {
        window.__showcaseCapture?.freeze();
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }), { name: beat ?? null, frames: SETTLE_FRAMES });
}

/*
 * A real click, frozen at the beat's own wall-clock time. The beat's t is read off the page
 * rather than duplicated here: pinning the beat and asking state() what t it landed on keeps
 * warpTiming.ts the only place any of these numbers live.
 *
 * The whole click-and-freeze is one page-side sequence. A Playwright round trip inside it
 * would put its own latency between the click and the timer, which is exactly the thing this
 * is measuring.
 */
async function captureLive(page, beat) {
  await page.evaluate((name) => window.__showcaseWarp?.hold(name, 0), beat);
  const target = await page.evaluate(() => window.__showcaseWarp.state().t);
  await page.evaluate(() => window.__showcaseWarp?.release());
  await scrollTo(page, 0);
  await page.waitForTimeout(ARM_MS);

  return page.evaluate(({ t, name }) => new Promise((resolve) => {
    window.__showcaseCapture?.thaw();
    const control = document.querySelector('main button[class*="warpButton"]');
    const shell = document.querySelector("main");
    const started = performance.now();
    if (control instanceof HTMLElement) control.click();
    const tick = () => {
      const elapsed = performance.now() - started;
      if (elapsed < t) {
        window.requestAnimationFrame(tick);
        return;
      }
      // Freeze holds the last rendered frame. The run keeps publishing underneath, which is
      // what makes this the frame a reader was actually looking at at this moment.
      window.__showcaseCapture?.freeze();
      const opacity = (selector) => {
        const node = document.querySelector(selector);
        return node ? Number(Number(getComputedStyle(node).opacity).toFixed(3)) : null;
      };
      const measured = {
        beatMs: t,
        frozenAt: Math.round(elapsed),
        progress: Number((window.scrollY / Math.max(1, shell.offsetHeight - window.innerHeight)).toFixed(4)),
        warping: shell.getAttribute("data-warping"),
        finale: shell.getAttribute("data-finale"),
        ledger: opacity('main section[class*="ledger"]'),
        header: opacity("main header"),
        finaleOpacity: opacity('main section[class*="finale"]'),
      };
      /*
       * AND THE SCROLLBAR HAS TO STOP, or the shutter photographs a stale compositor. The run
       * writes window.scrollTo every frame at up to 144 world units a second, and against a
       * fixed canvas layer Chrome hands back a viewport composited at the scroll offset it had
       * a frame or two ago: measured, the top 262px of a live frame came back as flat
       * rgb(2 4 17) page background rather than as scene, and two more animation frames did
       * not clear it because the scroll had not stopped. Pinning the beat stops the writes
       * without touching the canvas, which is already frozen, and the band is gone on the next
       * composite. The numbers above are read before the pin, so they describe the live frame.
       */
      window.__showcaseWarp?.hold(name, 0);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve(measured));
      });
    };
    window.requestAnimationFrame(tick);
  }), { t: target, name: beat });
}

async function shoot(page, file) {
  const buffer = await page.screenshot({ path: file });
  await page.evaluate(() => window.__showcaseCapture?.thaw());
  return buffer;
}

/* One beat, start to finish. Returns the PNG bytes plus whatever the page can say about
 * itself at that frame, so verification can assert numbers rather than eyeball pixels. */
async function captureShot(page, shot, file) {
  const viewport = shot.viewport ?? BASE_VIEWPORT;
  const current = page.viewportSize();
  if (!current || current.width !== viewport.width || current.height !== viewport.height) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => window.__showcaseWarp?.release());
  await parkPointer(page, viewport);

  if (shot.kind === "warp") {
    if (!(await hasWarpHook(page))) return { skipped: "no window.__showcaseWarp on the page" };
    // Every beat is armed from a standing start, which is what the spec's beat table is
    // quoted from, and it gives the entry-z latch a settled camera to latch.
    await scrollTo(page, 0);
    await page.waitForTimeout(ARM_MS);
    await settleAndFreeze(page, shot.beat);
    const state = await page.evaluate(() => window.__showcaseWarp.state());
    const buffer = await shoot(page, file);
    return { buffer, state };
  }

  if (shot.kind === "live") {
    if (!(await hasWarpHook(page))) return { skipped: "no window.__showcaseWarp on the page" };
    const state = await captureLive(page, shot.beat);
    const buffer = await shoot(page, file);
    await page.evaluate(() => window.__showcaseWarp?.release());
    return { buffer, state };
  }

  if (shot.kind === "hover") {
    const control = page.locator('main button[class*="warpButton"]');
    if ((await control.count()) === 0) return { skipped: "no .warpButton on the page" };
    await scrollTo(page, shot.progress);
    await page.waitForTimeout(ARM_MS);
    await control.hover();
    // Past the 150ms bleach dwell and its 140ms verify pass, so this frame can say
    // something about whether the world drained.
    await page.waitForTimeout(HOVER_MS);
    await settleAndFreeze(page, null);
    const state = await page.evaluate(() => ({
      bleaching: document.querySelector("main")?.getAttribute("data-bleaching") ?? null,
      bleach: document.querySelector("main")?.style.getPropertyValue("--showcase-bleach") ?? null,
    }));
    const buffer = await shoot(page, file);
    await page.mouse.move(0, 0);
    return { buffer, state };
  }

  await scrollTo(page, shot.progress);
  await page.waitForTimeout(ARM_MS);
  await settleAndFreeze(page, null);
  const state = await page.evaluate(() => {
    const shell = document.querySelector("main");
    const control = document.querySelector('main button[class*="warpButton"]');
    const ledger = document.querySelector('main section[class*="ledger"]');
    const rect = control instanceof HTMLElement ? control.getBoundingClientRect() : null;
    const ledgerRect = ledger instanceof HTMLElement ? ledger.getBoundingClientRect() : null;
    const style = control instanceof HTMLElement ? getComputedStyle(control) : null;
    return {
      finale: shell?.getAttribute("data-finale") ?? null,
      bleaching: shell?.getAttribute("data-bleaching") ?? null,
      control: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      controlVisibility: style ? style.visibility : null,
      controlOpacity: style ? style.opacity : null,
      ledgerContent: ledgerRect
        ? { right: Math.round(ledgerRect.right), bottom: Math.round(ledgerRect.bottom) }
        : null,
    };
  });
  const buffer = await shoot(page, file);
  return { buffer, state };
}

/*
 * Reduced motion gets its own context because the preference is a context-level emulation
 * and because the whole point of the beat is that this reader never sees a warp at all: the
 * control jumps them to the end. The frameloop is "demand" here, so the canvas only draws on
 * an invalidate, which is what thaw() is for.
 */
async function captureReduced(browser, url, file) {
  const context = await browser.newContext({ viewport: BASE_VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await enterShowcase(page, url);
    const control = page.locator('main button[class*="warpButton"]');
    if ((await control.count()) === 0) {
      await context.close();
      return { skipped: "no .warpButton on the page" };
    }
    await control.click();
    await page.waitForTimeout(ARM_MS);
    await settleAndFreeze(page, null);
    const state = await page.evaluate(() => {
      const shell = document.querySelector("main");
      const distance = Math.max(1, (shell?.offsetHeight ?? 1) - window.innerHeight);
      return {
        finale: shell?.getAttribute("data-finale") ?? null,
        progress: Number((window.scrollY / distance).toFixed(4)),
        focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null,
      };
    });
    const buffer = await shoot(page, file);
    return { buffer, state };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = `http://localhost:${args.port}/prototype/showcase`;
  const outDir = path.resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });

  const wanted = args.beats
    ? SHOTS.filter((shot) => args.beats.includes(shot.name))
    : SHOTS;
  if (wanted.length === 0) throw new Error(`no beats matched ${args.beats?.join(",")}`);

  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const results = [];

  try {
    /*
     * Both passes run in one page session on purpose. A fresh load would re-latch every
     * performance.now() anchor in the scene and re-run the entry choreography, which adds
     * variance the beat itself is not responsible for. Twice in one run means twice through
     * the same world.
     */
    const context = await browser.newContext({ viewport: BASE_VIEWPORT });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await enterShowcase(page, url);

    for (const pass of ["a", "b"]) {
      for (const shot of wanted) {
        const file = path.join(outDir, `warp-${shot.name}${pass === "b" ? ".b" : ""}.png`);
        const outcome = shot.kind === "reduced"
          ? await captureReduced(browser, url, file)
          : await captureShot(page, shot, file);
        results.push({ pass, name: shot.name, file, ...outcome });
        const label = outcome.skipped
          ? `SKIPPED ${outcome.skipped}`
          : `${digest(outcome.buffer)} ${JSON.stringify(outcome.state ?? {})}`;
        console.log(`[${pass}] ${shot.name.padEnd(16)} ${label}`);
      }
    }

    if (errors.length) console.log(`page errors: ${errors.join(" | ")}`);
    await context.close();
  } finally {
    await browser.close();
  }

  console.log("\nREPRODUCIBILITY  (blockMax is the verdict, raw samples are the grain, see the header)");
  let blocking = 0;
  const report = [];
  for (const shot of wanted) {
    const a = results.find((row) => row.pass === "a" && row.name === shot.name);
    const b = results.find((row) => row.pass === "b" && row.name === shot.name);
    if (a?.skipped || b?.skipped) {
      report.push({ beat: shot.name, verdict: "skipped", note: a?.skipped ?? b?.skipped });
      console.log(`  ${shot.name.padEnd(12)} SKIPPED ${a?.skipped ?? b?.skipped}`);
      continue;
    }
    const diff = comparePng(a.buffer, b.buffer);
    /* A live beat is taken off a wall clock and lands anywhere inside one frame period, so it
     * is reported and never gated. It exists to show what the reader sees, not to be pinned. */
    const gated = shot.kind !== "live";
    const verdict = diff.identical ? "byte-identical" : diff.stable ? "stable" : gated ? "UNSTABLE" : "live";
    if (gated && !diff.stable) blocking += 1;
    report.push({
      beat: shot.name,
      gated,
      verdict,
      sha: digest(a.buffer),
      shaB: digest(b.buffer),
      blockMax: diff.block?.max ?? null,
      blocksApart: diff.block?.over ?? null,
      blocks: diff.block?.blocks ?? null,
      differingSamples: diff.differing,
      samplesOverOneCount: diff.overOne,
      maxDelta: diff.max,
      totalSamples: diff.samples,
      state: a.state ?? null,
      file: path.relative(process.cwd(), a.file),
    });
    console.log(
      `  ${shot.name.padEnd(16)} ${verdict.padEnd(14)} blockMax=${String(diff.block?.max ?? "?").padEnd(6)} blocksApart=${String(diff.block?.over ?? "?").padEnd(5)}/${diff.block?.blocks ?? "?"}  rawDiffer=${diff.differing} raw>1=${diff.overOne} rawMax=${diff.max}`,
    );
  }

  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\n${blocking} unstable beat(s). Report written to ${path.relative(process.cwd(), path.join(outDir, "report.json"))}`);
  if (blocking > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
