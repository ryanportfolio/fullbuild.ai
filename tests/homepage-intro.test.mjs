import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * Source-text assertions, in the showcase suite's style, because that suite is this repo's
 * established gate and needs no runtime to answer.
 *
 * CRLF DISCIPLINE. This repo commits CRLF, so every multi-line pattern below uses \r?\n and
 * never a bare newline. A regex pinning "\n" against this source passes on a LF checkout and
 * fails on a CRLF one, which is a test that reports on the checkout rather than on the code.
 */

const files = {
  page: new URL("../src/app/page.tsx", import.meta.url),
  layout: new URL("../src/app/layout.tsx", import.meta.url),
  globals: new URL("../src/app/globals.css", import.meta.url),
  mount: new URL("../src/components/intro/IntroMount.tsx", import.meta.url),
  intro: new URL("../src/components/intro/HomepageIntro.tsx", import.meta.url),
  film: new URL("../src/components/intro/IntroFilm.tsx", import.meta.url),
  scene: new URL("../src/components/intro/IntroScene.tsx", import.meta.url),
  sculpture: new URL("../src/components/intro/IntroSculpture.tsx", import.meta.url),
  space: new URL("../src/components/intro/IntroSpace.tsx", import.meta.url),
  geometry: new URL("../src/components/intro/introGeometry.ts", import.meta.url),
  timing: new URL("../src/components/intro/introTiming.ts", import.meta.url),
  css: new URL("../src/components/intro/intro.module.css", import.meta.url),
  hold: new URL("../src/lib/introHold.ts", import.meta.url),
  plot: new URL("../src/components/motion/MastheadPlot.tsx", import.meta.url),
  drawingSet: new URL("../src/components/motion/DrawingSet.tsx", import.meta.url),
  railLogo: new URL("../src/components/chrome/RailLogo.tsx", import.meta.url),
  tagline: new URL("../src/components/sheets/TaglineFit.tsx", import.meta.url),
  loader: new URL("../src/components/showcase/ShowcaseLoader.tsx", import.meta.url),
  showcaseCss: new URL("../src/app/prototype/showcase/showcase.module.css", import.meta.url),
  showcaseApp: new URL("../src/components/showcase/ShowcaseApp.tsx", import.meta.url),
};

async function source(name) {
  return readFile(files[name], "utf8");
}

/*
 * The showcase prototype ships on its own branch. Until it lands on main these two files do
 * not exist here, so the parity assertions that read them stand down and re-arm on their own
 * the moment the prototype merges. The intro's own invariants never stand down.
 */
const showcasePresent = existsSync(files.showcaseCss) && existsSync(files.showcaseApp);

const INTRO_SOURCES = ["mount", "intro", "film", "scene", "sculpture", "space", "geometry", "timing"];

test("the homepage mounts the intro and keeps its sheets", async () => {
  const page = await source("page");

  assert.match(page, /<IntroMount \/>/);
  assert.match(page, /from '@\/components\/intro\/IntroMount'/);

  // The six sheets still stand, in order, exactly as they were.
  const sheets = [
    "SheetElevation",
    "SheetBlueprint",
    "SheetFrame",
    "SheetShipped",
    "SheetUnconformity",
    "SheetTransmittal",
  ];
  let cursor = -1;
  for (const sheet of sheets) {
    const at = page.indexOf(`<${sheet} />`);
    assert.ok(at > cursor, `${sheet} should render after the sheet before it`);
    cursor = at;
  }

  // The overlay is never server rendered, so no film markup may appear on this page.
  assert.doesNotMatch(page, /loadSheet|loadWorld|LoaderPlate|IntroFilm/);

  /*
   * AND THE GATE SITS OUTSIDE THE DRAWING SET. DrawingSet's <main> carries `perspective`,
   * which makes it the containing block for position:fixed descendants: nested inside, the
   * overlay sizes to the full document height and scrolls away instead of covering the
   * viewport. This is the same trap DrawingSet documents for its own WebGL backdrop.
   */
  const body = page.replace(/\/\*[\s\S]*?\*\//g, "");
  const mountAt = body.indexOf("<IntroMount />");
  const setAt = body.indexOf("<DrawingSet>");
  assert.ok(mountAt !== -1 && setAt !== -1 && mountAt < setAt, "IntroMount must precede DrawingSet");
});

test("the intro carries no hero wording", async () => {
  for (const name of INTRO_SOURCES) {
    const text = await source(name);
    assert.doesNotMatch(text, /STEP INTO/i, `${name} must not carry the showcase hero line`);
    assert.doesNotMatch(text, /Get started/i, `${name} must not carry a call to action`);
    assert.doesNotMatch(text, /<button/i, `${name} must not render a control`);
  }

  const film = await source("film");
  assert.doesNotMatch(film, /Enter|Begin|Explore/);
});

test("voice rules hold", async () => {
  for (const name of [...INTRO_SOURCES, "css"]) {
    const text = await source(name);
    assert.doesNotMatch(text, /[—–]/, `${name} must contain no em or en dash`);
  }

  // The lockup and the percent readout of the loader film both stay, now split into
  // per-letter spans so each glyph can be ruled in on its own band.
  const film = await source("film");
  assert.match(film, /<span><span>F<\/span><span>U<\/span><span>L<\/span><span>L<\/span><\/span>/);
  assert.match(film, /<span><span>B<\/span><span>U<\/span><span>I<\/span><span>L<\/span><span>D<\/span><\/span>/);
  assert.match(film, /styles\.loadNumber/);
  assert.match(film, /\{readout\}<span>%<\/span>/);

  // Brand faces only, never a hardcoded family.
  const css = await source("css");
  assert.match(css, /var\(--font-archivo\)/);
  assert.match(css, /var\(--font-martian\)/);
  assert.doesNotMatch(css, /Arial|Helvetica|Courier New/);
});

test("the film is a pure function of percent", async () => {
  const [css, film] = await Promise.all([source("css"), source("film")]);

  assert.match(css, /--load: var\(--intro-load, 0\)/);
  assert.match(css, /--b-build: clamp\(0, calc\(\(var\(--load\) - 0\.84\) \* 6\.25\), 1\)/);
  assert.match(css, /--b-cut: clamp\(0, calc\(\(var\(--load\) - 0\.72\) \* 8\.3333\), 1\)/);
  assert.match(css, /--b-blow: clamp\(0, calc\(\(var\(--load\) - 0\.82\) \* 9\.0909\), 1\)/);
  assert.match(css, /--cut-x: calc\(100% - var\(--clip-r\)\)/);
  assert.match(css, /left: var\(--cut-x\)/);
  // The world tint reads the same driving variable and nothing else.
  assert.match(css, /opacity: calc\(\(max\(var\(--intro-load, 0\), 0\.72\) - 0\.72\) \/ 0\.28\)/);
  // Nothing in this module may carry the vector effect that puts the dash back into px.
  assert.doesNotMatch(css, /non-scaling-stroke/);

  // The film owns no clock and no randomness of its own.
  assert.doesNotMatch(film, /@keyframes|animation:|transition:/);
  assert.doesNotMatch(film, /Math\.random/);
  assert.doesNotMatch(film, /useState|useEffect|useFrame|performance\.now/);
});

test("the plate is shared by prop, not by copy", async () => {
  const [loader, film] = await Promise.all([source("loader"), source("film")]);

  // The plate no longer hard imports one film's stylesheet. Pinned on the import statement
  // rather than the filename, because the comments still refer to the showcase's module.
  assert.doesNotMatch(loader, /^\s*import .*showcase\.module\.css/m);
  assert.match(loader, /export function LoaderPlate\(\{ variant, styles \}/);
  assert.match(loader, /type PlateStyles = Readonly<Record<string, string>>;/);
  assert.match(loader, /function Stroke\(\{ stroke, styles \}/);

  // And the homepage brings its own module rather than the showcase's.
  assert.match(film, /import \{ LoaderPlate \} from "@\/components\/showcase\/ShowcaseLoader"/);
  assert.match(film, /<LoaderPlate variant="sheet" styles=\{styles\} \/>/);
  assert.match(film, /<LoaderPlate variant="world" styles=\{styles\} \/>/);
  assert.doesNotMatch(film, /showcase\.module\.css/);
});

test("the band names are the plate's contract", async () => {
  const [css, loader, film] = await Promise.all([
    source("css"), source("loader"), source("film"),
  ]);

  /*
   * LoaderPlate hardcodes every progress source as a literal var(--b-*) string, so a module
   * driving it has to declare those exact names. Renamed behind a prefix, each dash offset
   * resolves to nothing and the plate paints fully drawn from frame one, silently.
   */
  const bands = [
    "--b-grid", "--b-base", "--b-draw", "--b-over", "--b-hatch1", "--b-hatch2",
    "--b-pour1", "--b-pour2", "--b-rise", "--b-cure", "--b-marks", "--b-mark",
    "--b-rule", "--b-red", "--b-spend", "--b-cut", "--b-edge", "--b-ink",
    "--b-blow", "--b-build",
  ];
  for (let index = 0; index < 4; index += 1) bands.push(`--b-setout${index}`);
  for (let index = 0; index < 7; index += 1) bands.push(`--b-tick${index}`);
  // The drawn furniture bands: the readout wipe and one band per lockup letter.
  bands.push("--b-num");
  for (let index = 0; index < 9; index += 1) bands.push(`--b-let${index}`);

  for (const band of bands) {
    assert.ok(
      css.includes(`@property ${band} `),
      `intro.module.css must register ${band} for the plate`,
    );
  }
  assert.doesNotMatch(css, /--i-b-|--intro-b-/);
  assert.match(loader, /var\(--b-setout\$\{index\}\)/);
  assert.match(loader, /var\(--b-base\)/);

  /*
   * The dash offset must be a <length>. Chromium accepts a bare <number> calc and treats it
   * as px, but Firefox rejects it, falls back to 0, and the whole progressive draw dies:
   * every stroke paints fully drawn from frame one. The * 1px is the fix, not a style.
   */
  assert.match(css, /stroke-dashoffset: calc\(\(100 - 100 \* var\(--s, 1\)\) \* 1px\)/);

  /*
   * The lockup letters are ruled in by a per-letter mask riding --lb, and every letter span
   * exists in the markup rather than as a bare text node, or the nth-child band mapping has
   * nothing to land on and the words pop in whole.
   */
  assert.match(css, /mask-image: linear-gradient\(100deg, #000 calc\(var\(--lb, 1\) \* 130% - 18%\), transparent calc\(var\(--lb, 1\) \* 130%\)\)/);
  assert.match(css, /--lb: var\(--b-let0\)/);
  assert.match(css, /--lb: var\(--b-let8\)/);
  assert.match(film, /<span>F<\/span>/);
  assert.match(film, /<span>D<\/span>/);
  assert.doesNotMatch(film, /<span>FULL<\/span>|<span>BUILD<\/span>/);
});

test("registration is stated and derived", async () => {
  const [css, sculpture, geometry] = await Promise.all([
    source("css"), source("sculpture"), source("geometry"),
  ]);

  assert.match(css, /--mark-unit: 0\.6372svh/);
  assert.match(css, /--mark-unit: 0\.4829svh/);
  assert.match(css, /--mark-cy: calc\(50% - 2\.637svh\)/);
  assert.match(css, /--mark-cy: calc\(50% - 2\.634svh\)/);
  // The derivation travels with the numbers rather than living in a commit message.
  assert.match(css, /viewportScale/);
  assert.match(css, /unit\s+= 100 \* \(S \/ 20\)/);

  // The artifact mounts at the pose it is registered against.
  assert.match(geometry, /INTRO_REST_POSE = \[0, 0\.12, 0\.1\]/);
  assert.match(geometry, /INTRO_SCALE_DESKTOP = 0\.58/);
  assert.match(geometry, /INTRO_SCALE_HANDSET = 0\.44/);
  assert.match(sculpture, /position=\{\[INTRO_REST_POSE\[0\], INTRO_REST_POSE\[1\], INTRO_REST_POSE\[2\]\]\}/);
});

test("the aperture is the drawn half's centre panel", async () => {
  const geometry = await source("geometry");

  assert.match(geometry, /INTRO_LOGO_UNIT = 20/);
  assert.match(geometry, /INTRO_LOGO_ORIGIN_X = 50/);
  assert.match(geometry, /INTRO_LOGO_ORIGIN_Y = 57/);
  assert.match(geometry, /INTRO_LINE_FRONT = 0\.034/);
  assert.match(geometry, /INTRO_APERTURE_VB = \[34\.5, 65\.25\]/);

  /*
   * Derived from the panel grid rather than chosen by eye: the drawn wall runs on columns
   * [18, 29, 40, 52] and rows [48, 59.5, 71, 82], so the centre panel's middle is exactly
   * (34.5, 65.25). The test recomputes it rather than trusting the constant.
   */
  assert.match(geometry, /introGridPanels\(\[18, 29, 40, 52\], \[48, 59\.5, 71, 82\]\)/);
  assert.equal((29 + 40) / 2, 34.5);
  assert.equal((59.5 + 71) / 2, 65.25);

  // And the local offset is mapped through the icon's own transform, not restated.
  assert.match(geometry, /introLogoX\(INTRO_APERTURE_VB\[0\]\)/);
  assert.match(geometry, /introLogoY\(INTRO_APERTURE_VB\[1\]\)/);
});

test("the timeline is the agreed shape", async () => {
  const timing = await source("timing");

  const read = (name) => {
    const found = timing.match(new RegExp(`export const ${name} = (\\d+)`));
    assert.ok(found, `${name} must be declared in introTiming`);
    return Number(found[1]);
  };

  assert.equal(read("HANDOVER_MS"), 640);
  assert.equal(read("REVEAL_MS"), 1500);
  assert.equal(read("CHARGE_MS"), 180);
  assert.equal(read("WARP_MS"), 980);
  assert.equal(read("BURST_MS"), 387);
  assert.equal(read("SETTLE_MS"), 620);
  assert.equal(read("SKIP_FADE_MS"), 260);
  assert.match(timing, /export const WARP_CROSS_U = 0\.85/);

  // The reveal, the charge and the run together are the agreed 2.5 to 3.5 seconds.
  const cinematic = read("REVEAL_MS") + read("CHARGE_MS") + read("WARP_MS");
  assert.ok(cinematic >= 2500 && cinematic <= 3500, `cinematic runs ${cinematic}ms`);
});

test("the progress model uses real signals", async () => {
  const [intro, timing] = await Promise.all([source("intro"), source("timing")]);

  // Real work, weighted, never a fake ramp.
  assert.match(timing, /FONTS: 30/);
  assert.match(timing, /PAGE: 22/);
  assert.match(timing, /CHUNK: 18/);
  assert.match(timing, /FIRST_FRAME: 30/);
  assert.match(timing, /INTRO_MIN_MS = 1450/);
  assert.match(timing, /INTRO_MAX_MS = 4200/);

  // The follower, values intact, including the delta cap that pauses rather than skips.
  assert.match(timing, /INTRO_SWEEP_MS = 620/);
  assert.match(timing, /INTRO_STEP_MS = 34/);
  assert.match(timing, /INTRO_LAND_POINTS = 9/);
  assert.match(timing, /INTRO_LAND_FLOOR = 0\.12/);
  assert.match(timing, /INTRO_DRAW_POINTS = 11/);
  assert.match(timing, /INTRO_OPEN_POINTS = 22/);
  assert.match(timing, /INTRO_OPEN_RATIO = 0\.06/);
  assert.match(intro, /Math\.min\(INTRO_STEP_MS, now - last\)/);

  /*
   * The draw zone pace is a contract with the band table: the narrowest entrance bands are
   * 2.2 load points wide, so the follower may not sweep a whole band between natural frames
   * sampled 150ms apart, or letters pop in complete.
   */
  const openRatio = Number(timing.match(/INTRO_OPEN_RATIO = ([\d.]+)/)[1]);
  const sweepMs = Number(timing.match(/INTRO_SWEEP_MS = (\d+)/)[1]);
  const perFrame = (150 * 100 * openRatio) / sweepMs;
  assert.ok(perFrame < 2.2, `draw zone sweeps ${perFrame.toFixed(2)} points per 150ms frame`);
  assert.match(intro, /displayRef\.current - INTRO_DRAW_POINTS/);

  // Each signal is paid out by something the browser actually finished.
  assert.match(intro, /document\.fonts\?\.ready\.then/);
  assert.match(intro, /window\.addEventListener\("load", onLoad, \{ once: true \}\)/);
  assert.match(intro, /document\.readyState === "complete"/);
  assert.match(intro, /onFirstFrame/);
  assert.match(intro, /sceneChunkReady/);

  // THE BLACK FLASH GATE: the film may not hand over to an artifact that never painted.
  assert.match(intro, /target = Math\.min\(target, 99\)/);
  assert.match(intro, /!firstFrameRef\.current && elapsed < INTRO_MAX_MS/);
});

test("every input skips", async () => {
  const intro = await source("intro");

  assert.match(intro, /event\.key === "Escape"/);
  assert.match(intro, /event\.key === "Enter"/);
  assert.match(intro, /window\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(intro, /window\.addEventListener\("touchmove", onTouchMove, \{ passive: false \}\)/);
  assert.match(intro, /window\.addEventListener\("pointerdown", onPointerDown\)/);
  for (const key of ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]) {
    assert.ok(intro.includes(`"${key}"`), `the scroll key ${key} must skip`);
  }

  // One way out, defined once, and idempotent.
  assert.equal((intro.match(/const skip = /g) ?? []).length, 1);
  assert.match(intro, /if \(skipRef\.current \|\| releasedRef\.current\) return;/);

  /*
   * NO OVERFLOW HIDDEN. Hiding overflow removes the scrollbar and shifts the page sideways
   * by its width the instant the overlay clears. Lenis is stopped and the scroll inputs are
   * prevented instead, so layout never moves.
   */
  assert.doesNotMatch(intro, /overflow\s*[:=]\s*["']?hidden/i);
  assert.match(intro, /lenis\(\)\?\.stop\(\)/);
  assert.match(intro, /lenis\(\)\?\.start\(\)/);

  // Focus lands on page content, and the page's own tab order is restored behind it.
  assert.match(intro, /document\.querySelector\("main"\)/);
  assert.match(intro, /main\.focus\(\{ preventScroll: true \}\)/);
  assert.match(intro, /main\.removeAttribute\("tabindex"\)/);

  // The announced percent moves in decades, not in a hundred steps.
  assert.match(intro, /Math\.floor\(displayPercent \/ 10\) \* 10/);
  assert.match(intro, /aria-live="polite"/);
});

test("reduced motion gets no film", async () => {
  const [mount, layout, css] = await Promise.all([source("mount"), source("layout"), source("css")]);

  // No overlay at all: not a shortened film, not a mark that fades. And the page's own
  // opening act is let go on the way out, so reduced motion can never strand it mid hold.
  assert.match(mount, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(mount, /if \(query\.matches\) \{\r?\n\s*releaseIntroHold\(\);\r?\n\s*return;\r?\n\s*\}/);
  assert.match(mount, /return null;/);

  // The pre-paint cover opts out under the same query, so there is nothing to lift.
  const script = layout.match(/const noFlashIntro = `[^`]*`;/);
  assert.ok(script, "layout must declare the intro cover script");
  assert.match(script[0], /prefers-reduced-motion: reduce/);

  // Belt and braces for the query flipping mid intro.
  const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\r?\n\}/);
  assert.ok(block, "intro.module.css must carry a reduced motion block");
  assert.match(block[0], /--b-draw: 1;/);
  assert.match(block[0], /--b-blow: 1;/);
  assert.match(block[0], /--b-red: 0;/);

  // And a change mid intro ends it immediately rather than at the end of the warp.
  const intro = await source("intro");
  assert.match(intro, /if \(query\.matches\) skip\(\);/);
});

test("no-JS gets the plain homepage", async () => {
  const [layout, globals, mount] = await Promise.all([
    source("layout"), source("globals"), source("mount"),
  ]);

  assert.match(layout, /data-intro-pending/);
  assert.match(layout, /window\.__introGuard/);
  assert.match(layout, /\},4000\)/);
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: noFlashIntro \}\} \/>/);

  /*
   * THE COVER IS HOMEPAGE ONLY, and this pin is the regression guard for a defect that was
   * real: without the path check every other route in the site loads under an opaque vellum
   * sheet with nothing behind it to lift the attribute, and sits there until the 4s guard.
   */
  const script = layout.match(/const noFlashIntro = `[^`]*`;/)[0];
  assert.match(script, /window\.location\.pathname!=='\/'/);

  assert.match(globals, /html\[data-intro-pending\] body::before/);
  assert.match(globals, /background: #e9e3d6;/);

  // The overlay contributes no server HTML at all.
  assert.match(mount, /dynamic\(\(\) => import\("\.\/HomepageIntro"\), \{ ssr: false \}\)/);
  // A restore from the history cache is not a load.
  assert.match(mount, /event\.persisted/);
  assert.match(mount, /pageshow/);
});

test("the capture hook holds named beats", async () => {
  const [intro, timing, css] = await Promise.all([source("intro"), source("timing"), source("css")]);

  assert.match(intro, /window\.__introFilm = \{/);
  for (const method of ["hold:", "release:", "beat:", "play:", "state:"]) {
    assert.ok(intro.includes(method), `__introFilm must expose ${method}`);
  }
  // Deliberately its own global: window.__capture belongs to DrawingSet and is reassigned
  // wholesale on every dep change, so anything merged into it would be blown away. The
  // pin is on assignment, not on the name, so the comment explaining this may say it.
  assert.doesNotMatch(intro, /window\.__capture\s*=/);
  assert.match(intro, /delete window\.__introFilm/);

  for (const beat of ["reveal", "charge", "warp-mid", "warp-through", "burst", "settle"]) {
    assert.ok(timing.includes(`"${beat}"`) || timing.includes(`${beat}:`), `beat ${beat} must exist`);
  }
  assert.match(timing, /"warp-through": BURST_START/);

  // A held film photographs the frame rather than a fade in progress.
  assert.match(css, /\.film\[data-held="true"\]/);
  assert.match(css, /transition: none;/);
  // A pinned beat pins the owner's clock and the pointer, or the idle sines drift.
  assert.match(intro, /timeRef\.current = beatRef\.current \/ 1000/);
  assert.match(intro, /pointerRef\.current\.x = 0/);
  assert.match(intro, /if \(beatRef\.current !== null\) return;/);
});

test("the scene is deterministic, disposed and lean", async () => {
  const [scene, sculpture, space, geometry] = await Promise.all([
    source("scene"), source("sculpture"), source("space"), source("geometry"),
  ]);

  /*
   * No post pass anywhere in the intro's scene chunk. The pins are on imports and elements
   * rather than on the bare words, so the comments explaining why there is no composer do
   * not trip the check that there is no composer.
   */
  for (const [name, text] of [["scene", scene], ["sculpture", sculpture], ["space", space], ["geometry", geometry]]) {
    assert.doesNotMatch(text, /Math\.random/, `${name} must not roll unseeded randomness`);
    assert.doesNotMatch(text, /from "(@react-three\/)?postprocessing"/, `${name} must import no post pass`);
    assert.doesNotMatch(text, /<EffectComposer/, `${name} must render no post pass`);
  }

  // One PRNG in the repo, imported rather than reimplemented.
  assert.match(geometry, /from "@\/components\/showcase\/prng"/);
  assert.match(geometry, /seededRandom\(hashSeed\(/);

  // The lens can reach the panel plane, and the far plane still contains the star field.
  assert.match(scene, /near: 0\.02, far: 160/);

  /*
   * PURITY. Neither layer may read the render clock or the live pointer: both arrive as refs
   * the owner writes, which is what lets a pinned beat reproduce a frame exactly.
   */
  for (const [name, text] of [["sculpture", sculpture], ["space", space]]) {
    // Pinned on the destructure rather than the bare name, so the comment that explains the
    // rule may state the thing the rule forbids.
    assert.doesNotMatch(
      text,
      /useFrame\(\(\{[^}]*\bclock\b/,
      `${name} must not take the render clock from useFrame`,
    );
    assert.match(text, /const time = timeRef\.current/, `${name} must read the owner's clock`);
  }

  // Every buffer this scene allocates is handed back.
  assert.match(sculpture, /dispose\(\)/);
  assert.match(space, /texture\.dispose\(\)/);

  /*
   * THE CROSSING IS SOLVED, NOT MEASURED. The exponent and the overshoot ratio are a matched
   * pair: k = 1 / WARP_CROSS_U ^ WARP_EXPONENT - 1 is what puts the lens at the aperture's own
   * z exactly at WARP_CROSS_U, for every viewport scale and every chase offset.
   *
   * Both literals are READ OUT OF THE SOURCE rather than restated here, because pinning them
   * as text is what a previous version of this test did and it caught the wrong thing: it
   * failed when the pacing was retuned, which is allowed, and would have passed happily if the
   * pair had been changed to two numbers that no longer solve, which is the actual defect.
   */
  const exponent = Number(scene.match(/const WARP_EXPONENT = ([\d.]+)/)?.[1]);
  const overshoot = Number(scene.match(/const THROUGH_OVERSHOOT = ([\d.]+)/)?.[1]);
  const crossU = Number((await source("timing")).match(/WARP_CROSS_U = ([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(exponent) && Number.isFinite(overshoot) && Number.isFinite(crossU));
  const crossE = Math.pow(crossU, exponent);
  const solved = 1 / (1 + overshoot);
  assert.ok(Math.abs(crossE - solved) < 0.0005, `crossing solves to ${solved}, curve gives ${crossE}`);

  /*
   * AND IT STILL ACCELERATES THE WHOLE WAY. An exponent at or below 1 would ease out into the
   * wall, which is the one shape the run must never have. Above about 2 the approach collapses
   * into the last few frames: at 2.35 the curve had covered a quarter of its distance past
   * halfway through the beat, so the wall arrived all at once instead of coming at the lens.
   */
  assert.ok(exponent > 1 && exponent <= 2, `warp exponent ${exponent} must accelerate without back-loading`);
  assert.ok(Math.pow(0.5, exponent) > 0.25, "half way through the run must be more than a quarter of the way there");

  // The doorway is latched when the camera commits, so the chase cannot steer the run.
  assert.match(scene, /apertureRef/);
  assert.match(scene, /INTRO_APERTURE_LOCAL/);
});

test("the showcase film is untouched", async () => {
  const loader = await source("loader");

  if (showcasePresent) {
    const css = await source("showcaseCss");
    assert.match(css, /--mark-unit: 0\.6372svh/);
    assert.match(css, /--b-build: clamp\(0, calc\(\(var\(--load\) - 0\.84\) \* 6\.25\), 1\)/);
    assert.match(css, /--cut-x: calc\(100% - var\(--clip-r\)\)/);
    assert.match(css, /opacity: calc\(var\(--b-edge\) \* \(1 - var\(--b-spend\)\)\)/);
    // The showcase keeps driving the plate off its own variable.
    assert.match(css, /--load: var\(--showcase-load, 0\)/);
  }

  // The plate's own invariants survive the parameterization untouched.
  assert.match(loader, /pathLength="100"/);
  assert.match(loader, /strokeDasharray="100 200"/);
  assert.ok(loader.includes("M-120 82 H220"), "the datum keeps its bounded overrun");
  assert.doesNotMatch(loader, /non-scaling-stroke/);
  assert.doesNotMatch(loader, /M-900 82 H1000/);
  for (const d of ["M8 82 H92", "M18 82 V48 L35 32 L52 48 V82", "M52 48 L68 32 L82 46"]) {
    assert.ok(loader.includes(d), `loader should still carry the icon path ${d}`);
  }
});

/*
 * ── the defects that were found by looking, and must not come back ──────────────────────
 *
 * Everything below was a confirmed defect in a built, running intro rather than a worry. Each
 * test names the frame or the measurement that caught it, so the next person to touch these
 * numbers knows what breaks and what it looked like when it did.
 */

test("the analog floor matches the reference it was measured against", async () => {
  const [css, space, geometry] = await Promise.all([
    source("css"), source("space"), source("geometry"),
  ]);

  /*
   * MEASURED, NOT EYEBALLED. Mean absolute horizontal luminance difference over four type
   * free patches put the intro at 1.42 to 1.63 against the showcase entry's 2.89 to 3.26:
   * roughly half the floor, in every patch. Same seeded tile, same mask, same blend, so the
   * layer opacity was the whole delta.
   */
  const grain = css.match(/\.grain \{[\s\S]*?\r?\n\}/);
  assert.ok(grain, "intro.module.css must carry the grain layer");
  if (showcasePresent) {
    const showcase = await source("showcaseCss");
    const reference = showcase.match(/\.scene::after \{\r?\n\s*opacity: ([\d.]+);/);
    assert.ok(reference, "the showcase floor must still declare the opacity this is matched to");
    assert.equal(grain[0].match(/opacity: ([\d.]+);/)[1], reference[1]);
  }

  /*
   * And the tile itself stays denser than the reference, which is the honest lever and the one
   * that closed the rest of the gap: parity on the layer alone still measured 2.07 to 2.30
   * against 2.89 to 3.26. Read from both files rather than restated, so the relationship is
   * what is pinned and not two numbers that can drift apart.
   */
  const introDensity = Number(geometry.match(/INTRO_GRAIN_DOT_DENSITY = ([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(introDensity));
  if (showcasePresent) {
    const showcaseDensity = Number((await source("showcaseApp")).match(/GRAIN_DOT_DENSITY = ([\d.]+)/)?.[1]);
    assert.ok(Number.isFinite(showcaseDensity));
    assert.ok(
      introDensity > showcaseDensity * 1.3,
      `intro grain ${introDensity} must be materially denser than the showcase's ${showcaseDensity}`,
    );
  }
  for (const [name, count] of [
    ["INTRO_STAR_PINPOINT_COUNT", 5200],
    ["INTRO_STAR_MID_COUNT", 980],
    ["INTRO_STAR_BOKEH_COUNT", 118],
    /*
     * The near field was doubled off a measurement rather than a feeling: local maxima
     * standing 22 counts of luminance clear of their eight neighbours, counted in two type
     * free bands of the same frame on both pages, gave the showcase entry 103 and the
     * intro's reveal 115. Ahead on arithmetic, plainly behind on the picture, because the
     * showcase carries a shard curtain across its near field. At 680 the same count is 164.
     */
    ["INTRO_MOTE_COUNT", 680],
    /* Held, deliberately. Every plate is its own mesh and its own material, so presence is
       bought on the seed's scale range and on the emissive, never on the count. */
    ["INTRO_DEBRIS_COUNT", 150],
  ]) {
    assert.match(geometry, new RegExp(`${name} = ${count}`), `${name} must stay dialled up`);
  }

  /*
   * AND THE MOTES ARE THE STREAKS. makeIntroStreaks draws from the motes and the pinpoints,
   * so a near field counted up at the breath is a tail count at the warp, and neither number
   * can be tuned without the other moving with it.
   */
  assert.match(space, /makeIntroStreaks\(\[motes, pinpoints\]\)/);

  /*
   * NO PLATE MAY SUBTRACT LIGHT. At the crossing, the brightest frame in the piece, the debris
   * punched five opaque black wedges out of the glow core: 1.1% of the bright region below
   * luminance 14 against a regional mean of 23. Making the material dielectric did not fix it,
   * because an opaque plate occludes whatever it is made of. Additive with no depth write is
   * the property that makes the defect unreachable.
   */
  const debris = space.match(/<meshStandardMaterial[\s\S]*?\/>/);
  assert.ok(debris, "the debris must still declare a material");
  assert.match(debris[0], /blending=\{AdditiveBlending\}/);
  assert.match(debris[0], /depthWrite=\{false\}/);
});

test("the wall the lens passes has a material response", async () => {
  const [geometry, sculpture] = await Promise.all([source("geometry"), source("sculpture")]);

  /*
   * THE CLIMAX FRAME HAD NOTHING IN IT. At the crossing the jamb of the panel beside the
   * doorway fills the right of the frame, and it photographed as one value: rgb(0 17 146),
   * standard deviation 1.68 over four hundred by nine hundred pixels, with the DOM grain
   * tile accounting for all of it and the column profile flat to within 0.6 of a count.
   * The cause is the material, not the light: metalness 0.94 over a near black albedo
   * leaves the specular tint near black too, so every view dependent term evaluates to
   * nothing and a constant emissive is the only thing left. A constant is the same number
   * from every angle, which is why the wall was the same number everywhere.
   */
  assert.match(sculpture, /onBeforeCompile=\{introPanelShader\}/);
  assert.match(sculpture, /#include <emissivemap_fragment>/);

  /*
   * The rake is the term that was missing, and it has to read the view. Both of these are
   * three's own varyings; injecting any earlier than the emissive chunk would read a normal
   * that has not been resolved yet.
   */
  assert.match(sculpture, /dot\( normal, normalize\( vViewPosition \) \)/);

  /*
   * NONE OF IT REACHES THE BEAT THE MARK IS READ ON. Everything rides a range gate, and the
   * gate is shut at the reveal: the artifact stands about four and a half units off and the
   * band closes well inside two. Measured, the reveal beat is byte for byte the frame it was
   * before the shader existed.
   */
  const near = Number(geometry.match(/INTRO_JAMB_NEAR = ([\d.]+)/)?.[1]);
  const far = Number(geometry.match(/INTRO_JAMB_FAR = ([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(near) && Number.isFinite(far) && near < far);
  assert.ok(far < 4, `the detail band must close long before the rest pose, got ${far}`);
  /* Read from the constants rather than restated in the shader, so the band and the note
     that justifies it cannot drift apart. */
  assert.match(
    sculpture,
    /smoothstep\( \$\{INTRO_JAMB_NEAR\}, \$\{INTRO_JAMB_FAR\}, length\( vViewPosition \) \)/,
  );

  /*
   * AND THE COURSES STAY OFF THE GLASS. They are ruled on the wall's own row step and
   * confined to the faces whose object normal is not the front plane's, so the face the mark
   * is drawn on never picks up a rule at any distance.
   */
  assert.match(geometry, /INTRO_JAMB_COURSE = 11\.5 \/ 20 \/ 8/);
  assert.match(sculpture, /vIntroFace = abs\( objectNormal\.z \)/);
  assert.match(sculpture, /introSide = 1\.0 - smoothstep\( [\d.]+, [\d.]+, vIntroFace \)/);
  assert.match(sculpture, /introCourse[\s\S]{0,120}?\* introSide/);

  /* The tooth is hashed on the object's own coordinates, so it is a pure function of where
     you are on the wall and a pinned beat renders the same bytes twice. */
  assert.match(sculpture, /float introTooth\( vec3 cell \)/);
  assert.ok(
    !/Math\.random|\brandom\(\)/.test(sculpture),
    "the sculpture may not reach for unseeded randomness",
  );
});

test("the mark is a volume, and it turns", async () => {
  const [geometry, sculpture, timing] = await Promise.all([
    source("geometry"), source("sculpture"), source("timing"),
  ]);

  /*
   * THE PLATE PROBLEM. Built a thirty-fourth of a unit thick against a body 4.2 units wide,
   * the artifact carried visibly less depth than the drawing it replaced: the film's last
   * frame rules extrusion on both gables and a ground in perspective, the object had a flat
   * black pour, no extrusion and a plain baseline.
   */
  const depth = Number(geometry.match(/INTRO_BODY_DEPTH = ([\d.]+)/)?.[1]);
  assert.ok(depth >= 0.3, `the body must have real depth, got ${depth}`);
  assert.match(geometry, /INTRO_PANEL_FRONT = 0\.017/);
  assert.match(geometry, /INTRO_POURED_DEPTH = INTRO_BODY_DEPTH/);

  /*
   * AND ALL OF IT RUNS AWAY FROM THE LENS. The front face is where it always was, which is why
   * --mark-unit and --mark-cy do not move: registration is a property of the front plane and
   * the rest pose. Centring the extrusion instead would push the face in front of the stroke
   * plane and put the drawing inside the wall.
   */
  assert.match(sculpture, /prism\.translate\(0, 0, INTRO_PANEL_FRONT - depth\)/);
  assert.match(sculpture, /prism\.translate\(0, 0, INTRO_PANEL_FRONT - INTRO_POURED_DEPTH\)/);
  assert.match(sculpture, /planes: \[INTRO_LINE_FRONT, INTRO_PANEL_FRONT - INTRO_BODY_DEPTH\]/);

  // The extrusion is drawn at a weight someone can see. It was 0.085, which is nobody.
  const depthLine = sculpture.match(/geometry=\{depthLineWork\}[\s\S]*?opacity=\{([\d.]+)\}/);
  assert.ok(depthLine && Number(depthLine[1]) >= 0.2, "the extrusion must be visible");

  /*
   * THE BUILD BEAT. The arc is drawn, then built, then alive, and the middle term had no frame
   * that showed it: a second and a half of a face-on mark breathing on a glow. The turn is a
   * pure function of tPost, so a pinned beat pins the pose.
   */
  const turnStart = Number(timing.match(/REVEAL_TURN_START = (\d+)/)?.[1]);
  const turnEnd = Number(timing.match(/REVEAL_TURN_END = (\d+)/)?.[1]);
  const reveal = Number(timing.match(/REVEAL_MS = (\d+)/)?.[1]);
  assert.ok(turnStart > 0, "the turn must not start until the handover is under way");
  assert.ok(turnEnd < reveal, "the turn must settle before the camera commits");
  // One read of the clock per frame, shared by every term that shapes the pose.
  assert.match(sculpture, /const tPost = tPostRef\.current;/);
  assert.match(sculpture, /progressBetween\(tPost, REVEAL_TURN_START, REVEAL_TURN_END\)/);
  assert.doesNotMatch(sculpture, /Math\.random/);
});

test("a pinned beat is settled on its first frame", async () => {
  const [intro, sculpture, space] = await Promise.all([
    source("intro"), source("sculpture"), source("space"),
  ]);

  /*
   * Pinning tPost and the pointer was not enough. Every pose in the scene is damped, damping
   * converges asymptotically from wherever the previous frame left it, and beat() renders
   * straight away: the same beat re-pinned differed by 0.79% of the frame, with the mark one
   * to two pixels off. It converged, but only after seconds of waiting nothing documented.
   */
  assert.match(intro, /const pinnedRef = useRef\(false\);/);
  assert.match(intro, /beatRef\.current = value;\r?\n\s*pinnedRef\.current = true;/);
  /*
   * Every other entry point clears it, or a pin leaks into live playback and freezes the
   * chase: hold, release, play, and skip. Skip is the fourth because a skip outranks a
   * capture freeze and drops it on the way out (see "a skip outranks a capture freeze").
   */
  assert.equal((intro.match(/pinnedRef\.current = false;/g) ?? []).length, 4);

  for (const [name, text] of [["sculpture", sculpture], ["space", space]]) {
    assert.match(text, /pinnedRef\.current/, `${name} must honour the pin`);
    assert.match(text, /settled \?/, `${name} must take its target outright under a pin`);
  }
});

test("the overlay is opaque for the whole burst", async () => {
  const intro = await source("intro");

  /*
   * Taking the canvas out on 1 - rise while the flood came up on rise put both layers near a
   * half at the middle of the burst, and two half opaque layers do not add to one: measured
   * stage 0.525 against flood 0.475, so a quarter of the homepage came through and the burst
   * read as a three way cross dissolve over a page the reader had not arrived at yet. Those
   * are the exact frames the burst exists to cover while geometry pops through the near plane.
   */
  assert.doesNotMatch(intro, /const stage = 1 - rise;/);
  assert.match(intro, /const stage = 1 - clamp01\(\(rise - 0\.985\) \/ 0\.015\);/);
  assert.match(intro, /const flood = rise \* \(1 - fall\);/);
});

test("the overlay holds focus and hides the page beneath it", async () => {
  const intro = await source("intro");

  /*
   * A LIVE REPRO, NOT A WORRY. During the intro, one Tab put focus on an external link at
   * y 717 that the opaque overlay was covering, and one Enter opened it in a new tab. Enter is
   * the documented way to skip. Two causes, both here: no containment at all, and a keydown
   * handler that skipped without preventing the default activation underneath.
   */
  assert.match(intro, /event\.preventDefault\(\);\r?\n\s*skip\(\);\r?\n\s*return;/);
  assert.match(intro, /if \(event\.key === "Tab"\)/);
  assert.match(intro, /role="dialog"/);
  assert.match(intro, /aria-modal="true"/);

  /*
   * And the same curtain for assistive technology. Six reachable headings, every link, and the
   * title block's own aria-live region were all exposed under a film the reader could not see,
   * announcing over the intro's percent.
   */
  assert.match(intro, /node\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(intro, /node\.setAttribute\("inert", ""\)/);
  // Put back exactly as found, including for a node that was already hidden for its own reasons.
  assert.match(intro, /if \(hidden === null\) node\.removeAttribute\("aria-hidden"\)/);
  assert.match(intro, /if \(!inert\) node\.removeAttribute\("inert"\)/);
  /*
   * The curtain lifts BEFORE focus is handed over. Focusing an inert element does nothing, so
   * releasing in the other order drops the reader at the top of the tab order instead.
   */
  const releaseAt = intro.search(/uncoverRef\.current\?\.\(\);\r?\n\s*window\.scrollTo/);
  const focusAt = intro.indexOf("main.focus({ preventScroll: true })");
  assert.ok(releaseAt !== -1 && focusAt !== -1 && releaseAt < focusAt, "uncover must precede focus");
});

test("an intro that missed its own opening does not play", async () => {
  const [layout, mount] = await Promise.all([source("layout"), source("mount")]);

  /*
   * MEASURED ON A SLOW DEVICE. At 20x CPU throttle over 50 kB/s, hydration landed at 12.7s.
   * The cover's own guard had uncovered the page at 4s, so the reader spent eight seconds
   * reading a finished homepage, and then an overlay arrived reporting that the page was
   * loading and warped away from it. That is the flash the cover exists to prevent, inverted.
   */
  const script = layout.match(/const noFlashIntro = `[^`]*`;/)[0];
  assert.match(script, /window\.__introExpired=1/);
  assert.match(mount, /__introExpired/);
  assert.match(mount, /hasAttribute\("data-intro-pending"\)/);

  // Both gates sit above the pageshow wiring, so a late arrival costs no listener either.
  const expiredAt = mount.indexOf("__introExpired");
  const showAt = mount.indexOf("pageshow");
  assert.ok(expiredAt !== -1 && showAt !== -1 && expiredAt < showAt);
});

test("the page's own opening act waits for the overlay", async () => {
  const [hold, layout, plot, drawingSet, railLogo, tagline] = await Promise.all([
    source("hold"), source("layout"), source("plot"),
    source("drawingSet"), source("railLogo"), source("tagline"),
  ]);

  /*
   * MEASURED, NOT ASSUMED. On an uncontrolled load at 1440x900 the overlay was up from
   * t=1182ms to t=6264ms and ws:plot-settled fired at t=2427ms: the wordmark plotted, the
   * pipeline lettered, the rail mark drew and the carriage worked the cover, all of it
   * finished 3.8 seconds before the veil lifted. The reader arrived at a page whose opening
   * was over. So the opening is held, and the hold is one latch with one event.
   */
  assert.match(hold, /export const INTRO_HOLD_EVENT = 'ws:intro-entrance';/);
  assert.match(hold, /export function afterIntroHold/);
  assert.match(hold, /export function releaseIntroHold/);
  assert.match(hold, /export function introHoldActive/);
  // Unheld means synchronous, so no page without an intro gains a frame of latency.
  assert.match(hold, /if \(!introHoldActive\(\)\) \{\r?\n\s*fn\(\);/);

  /*
   * The latch is set pre-paint, under the same conditions as the cover, because the plot
   * runs from a layout effect the instant it mounts and would otherwise be gone already.
   */
  const script = layout.match(/const noFlashIntro = `[^`]*`;/)[0];
  assert.match(script, /window\.__introHold=true/);
  // Failing open: the cover's own guard lifts the hold with it.
  assert.match(script, /window\.__introHold=false;window\.dispatchEvent\(new Event\('ws:intro-entrance'\)\)/);
  /*
   * And a deadline nothing in React can clear. HomepageIntro clears the cover's 4s guard the
   * moment it paints, so after that an overlay that never finished would hold the page's
   * opening for the rest of the session. Set well past the intro's own worst case.
   */
  const deadline = Number(script.match(/window\.setTimeout\(go,(\d+)\)/)?.[1]);
  assert.ok(deadline >= 10000, "the hold's deadline must clear the intro's own worst case");

  /*
   * THE ROOT HOLDER. Everything else on the cover keys off ws:plot-settled, so holding the
   * plot holds the whole chain. The wait is placed after the master render and the quantise
   * pass, so lifting it costs one frame rather than a canvas readback landing in the middle
   * of the settle crossfade.
   */
  assert.match(plot, /import \{ afterIntroHold, introHoldActive \} from '@\/lib\/introHold';/);
  assert.match(plot, /unhold = afterIntroHold\(\(\) => \{[\s\S]{0,400}?raf = requestAnimationFrame\(frame\);/);
  // A bail is a settle by another name, so it waits too.
  assert.match(plot, /unhold = afterIntroHold\(\(\) => \{[\s\S]{0,200}?settle\(\);/);
  // The lead between the sheet landing and the pen moving is spent once, not twice.
  assert.match(plot, /const HELD_PLOT_LEAD = 0;/);
  assert.match(plot, /const lead = introHoldActive\(\) \? HELD_PLOT_LEAD : PLOT_LEAD;/);
  assert.match(plot, /t - start - lead/);

  /*
   * AND THE FALLBACK CLOCKS TOO. Each consumer arms a timer against a plot that never
   * signals, at 2400, 2600 and 3000ms from mount. Held for five seconds, every one of them
   * would fire, call the hold a failure, and run the entrance behind the curtain by the back
   * door. Their clocks start when the overlay lets go.
   */
  for (const [name, text] of [
    ["DrawingSet", drawingSet], ["RailLogo", railLogo], ["TaglineFit", tagline],
  ]) {
    assert.match(text, /from '@\/lib\/introHold'/, `${name} must take the hold`);
    assert.match(
      text,
      /unhold = afterIntroHold\(\(\) => \{[\s\S]{0,300}?window\.setTimeout\(begin,/,
      `${name} must arm its fallback after the hold, not at mount`,
    );
    assert.match(text, /unhold\?\.\(\)/, `${name} must drop its subscription on teardown`);
  }
});

test("the entrance starts inside the settle, with a head start", async () => {
  const [timing, intro, mount] = await Promise.all([
    source("timing"), source("intro"), source("mount"),
  ]);

  /*
   * ONE FILM, NOT TWO. Released at the same instant the overlay leaves, the page would begin
   * from zero on the frame after the veil cleared, which reads as a seam: the intro, a beat,
   * then the page starting. Released ahead of the end, the pen is already sweeping while the
   * settle is still dissolving.
   */
  const lead = Number(timing.match(/ENTRANCE_LEAD_MS = (\d+)/)?.[1]);
  assert.ok(lead >= 100 && lead <= 300, "the head start must sit in the agreed 100 to 300ms band");
  const settle = Number(timing.match(/SETTLE_MS = (\d+)/)?.[1]);
  assert.ok(lead < settle, "the head start must land inside the settle rather than before it");

  // The natural path: measured back from the end of the cinematic.
  assert.match(intro, /if \(tPostRef\.current >= INTRO_END - ENTRANCE_LEAD_MS\) releaseIntroHold\(\);/);
  // The skip path: measured back from the end of the short skip fade, floored at zero.
  assert.match(
    intro,
    /if \(since >= Math\.max\(0, SKIP_FADE_MS - ENTRANCE_LEAD_MS\)\) releaseIntroHold\(\);/,
  );
  /*
   * AND THE BACKSTOP IS ANCHORED TO THE INTRO, NOT TO REACT. Releasing from the clock effect's
   * cleanup looked equivalent and was not: StrictMode invokes, cleans up and re-invokes that
   * effect on mount, and measured on 3031 it fired ws:intro-entrance at t=1219ms, 900ms before
   * the overlay existed, putting the whole entrance back behind the curtain with the fix in
   * place. `released` is one way and is set only by the two things that end the overlay.
   */
  assert.doesNotMatch(
    intro,
    /if \(frame\) window\.cancelAnimationFrame\(frame\);[\s\S]{0,600}?releaseIntroHold\(\);/,
    "the hold must not be released from an effect cleanup",
  );
  assert.match(intro, /if \(!released\) return;\r?\n\r?\n\s*\/\*[\s\S]*?\*\/\r?\n\s*releaseIntroHold\(\);/);

  /*
   * FAILING OPEN ON EVERY GATED-OFF PATH. Reduced motion, an intro that arrived too late, a
   * missing cover and a history-cache restore each end with the page's opening let go rather
   * than left waiting for a signal that is never coming.
   */
  assert.equal((mount.match(/releaseIntroHold\(\);/g) ?? []).length, 4);
  assert.match(mount, /event\.persisted[\s\S]{0,160}?releaseIntroHold\(\);/);
});

test("the pointer chase never runs under the film", async () => {
  const [sculpture, scene, intro, timing] = await Promise.all([
    source("sculpture"), source("scene"), source("intro"), source("timing"),
  ]);

  /*
   * MEASURED, AT 1440x900. The old gate read "tPost < CHARGE_START", and during the film
   * tPost is -1, which is emphatically less than the charge. With the pointer parked at
   * (1424, 862) the film's mark dissolved at the top of the frame while the object it was
   * meant to become stood down and to the right of it, the two shapes not overlapping at all.
   * The film's registration is derived from the REST pose and nothing else, so the chase has
   * to be off for every frame the film is visible for.
   */
  assert.doesNotMatch(sculpture, /chase: boolean/);
  assert.doesNotMatch(scene, /chase: boolean/);
  assert.doesNotMatch(intro, /chase=\{/);
  assert.doesNotMatch(scene, /chase=\{chase\}/);

  // In where the film ends, out across the charge, and read per frame off the clock rather
  // than handed down as a prop that only changed when the owner happened to re-render.
  assert.match(sculpture, /const CHASE_IN_START = HANDOVER_MS;/);
  assert.match(sculpture, /const CHASE_IN_MS = \d+;/);
  assert.match(
    sculpture,
    /const chaseGain =\r?\n\s*smoothstep\(progressBetween\(tPost, CHASE_IN_START, CHASE_IN_START \+ CHASE_IN_MS\)\) \*\r?\n\s*\(1 - smoothstep\(progressBetween\(tPost, CHARGE_START, CHARGE_START \+ CHARGE_MS\)\)\);/,
  );
  assert.match(sculpture, /const cursorX = pointer\.x \* chaseGain;/);
  assert.match(sculpture, /const cursorY = pointer\.y \* chaseGain;/);

  /*
   * The gain has to be exactly zero for the whole handover, which is what makes the drawing
   * and the object the same shape in the same place at tPost 0. Recomputed here from the
   * pinned literals rather than trusted.
   */
  const handover = Number(timing.match(/HANDOVER_MS = (\d+)/)?.[1]);
  const chaseIn = Number(sculpture.match(/CHASE_IN_MS = (\d+)/)?.[1]);
  const charge = Number(timing.match(/CHARGE_START = REVEAL_MS/) ? timing.match(/REVEAL_MS = (\d+)/)?.[1] : NaN);
  const gainAt = (t) => {
    const smooth = (v) => { const c = Math.min(1, Math.max(0, v)); return c * c * (3 - 2 * c); };
    return smooth((t - handover) / chaseIn);
  };
  assert.equal(gainAt(-1), 0, "no chase while the film is the only thing on screen");
  assert.equal(gainAt(0), 0, "no chase on the frame the film hands over");
  assert.equal(gainAt(handover), 0, "no chase on the last frame the film is visible for");
  assert.ok(gainAt(handover + chaseIn) === 1, "the chase is fully open by the middle of the breath");
  assert.ok(handover + chaseIn < charge, "and fully open before the camera commits");
});

test("a skip outranks a capture freeze", async () => {
  const intro = await source("intro");

  /*
   * MEASURED ON 3031. hold(45) then Escape, then three seconds: the overlay was still
   * mounted, data-skipping was "true", its computed opacity was 0, 212 body children were
   * still inert including <main>, focus was still on the overlay div, and a 1500px wheel
   * left window.scrollY at 0. A normal looking homepage that could not be touched. The rAF
   * loop's freeze branches returned without re-arming, and skip() set its flags without
   * restarting anything, so release() never ran.
   *
   * Not reachable from the page, since the hook is capture-only, but it is exactly the state
   * the verification procedure leaves a page in, and it falsified the claim that a skip works
   * from wherever you are.
   */
  assert.match(intro, /const pumpRef = useRef<\(\(\) => void\) \| null>\(null\);/);
  assert.match(intro, /pumpRef\.current = pump;/);

  // The way out drops the freeze itself and restarts the loop.
  const skip = intro.match(/const skip = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/)[0];
  assert.match(skip, /holdRef\.current = null;/);
  assert.match(skip, /beatRef\.current = null;/);
  assert.match(skip, /pinnedRef\.current = false;/);
  // And clears the held flag, or .film[data-held="true"] pins the film and there is no fade.
  assert.match(skip, /setHeld\(false\);/);
  assert.match(skip, /setBeatPinned\(false\);/);
  assert.match(skip, /pumpRef\.current\?\.\(\);/);

  /*
   * Structurally as well as by that write order: the skip branch is checked above both
   * freeze branches, so the ordering does not depend on two assignments landing correctly.
   */
  const skipBranch = intro.indexOf("if (skipRef.current) {");
  const beatBranch = intro.indexOf("if (beatRef.current !== null) {");
  const holdBranch = intro.indexOf("if (holdRef.current !== null) {");
  assert.ok(skipBranch !== -1 && beatBranch !== -1 && holdBranch !== -1);
  assert.ok(skipBranch < beatBranch, "the way out is checked before a pinned beat");
  assert.ok(skipBranch < holdBranch, "the way out is checked before a held percent");
});
