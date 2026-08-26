import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("@/")) {
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
      }
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { OPEN_AT, transitionReplay } = await import(
  "../src/lib/layline/replay-transitions.ts"
);
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const { clampTimelineWindow, recenterTimelineWindow } = await import(
  "../src/lib/layline/timeline.ts"
);

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function replayState(raceId = RACES[0].id) {
  return {
    raceId,
    t: 42,
    playing: true,
    rate: 4,
    mode: "smooth",
    rig: "chase",
    followId: "usa",
    chart2d: false,
    truthMode: false,
    reducedMotion: true,
    frozen: true,
  };
}

test("production routes race and view changes through the executable reducer", () => {
  const store = source("src/components/layline/store.ts");
  assert.match(store, /from "@\/lib\/layline\/replay-transitions"/);
  assert.equal((store.match(/transitionReplay\(/g) ?? []).length, 4);
  assert.match(store, /type: "select-race"/);
  assert.match(store, /type: "set-mode"/);
  assert.match(store, /type: "set-chart-2d"/);
  assert.match(store, /type: "set-truth"/);
  assert.match(store, /selectRace: \(id\)[\s\S]*resetFreeformCamera\(\)[\s\S]*type: "select-race"/);
});

test("real race swaps reset race-owned fields and preserve viewer choices", () => {
  let state = replayState();
  state = transitionReplay(state, { type: "set-mode", mode: "raw" });
  state = transitionReplay(state, { type: "set-truth", on: true });
  state = transitionReplay(state, { type: "set-chart-2d", on: true });
  state = transitionReplay(state, { type: "select-race", raceId: RACES[1].id });

  assert.deepEqual(
    {
      raceId: state.raceId,
      t: state.t,
      playing: state.playing,
      followId: state.followId,
      rig: state.rig,
      chart2d: state.chart2d,
    },
    {
      raceId: RACES[1].id,
      t: OPEN_AT,
      playing: false,
      followId: "nzl",
      rig: "tv",
      chart2d: false,
    },
  );
  assert.deepEqual(
    {
      truthMode: state.truthMode,
      mode: state.mode,
      rate: state.rate,
      reducedMotion: state.reducedMotion,
      frozen: state.frozen,
    },
    {
      truthMode: true,
      mode: "raw",
      rate: 4,
      reducedMotion: true,
      frozen: true,
    },
  );
});

test("10 and 30 second focus windows recenter after real external seeks", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    for (const span of [10, 30]) {
      const initial = clampTimelineWindow(race, race.tMin, span);
      const inside = recenterTimelineWindow(race, initial, initial.from + initial.span / 2, span);
      assert.deepEqual(inside, { window: initial, recentered: false });

      const sought = race.tMax - 0.25;
      assert.ok(sought > initial.to, `${meta.id} ${span}s probe did not leave its window`);
      const moved = recenterTimelineWindow(race, initial, sought, span);
      assert.equal(moved.recentered, true);
      assert.ok(moved.window.from <= sought && sought <= moved.window.to);
      assert.equal(moved.window.span, span);
    }
  }
});

test("truth, raw and 2D transitions stay independent in combined use", () => {
  let state = replayState();
  state = transitionReplay(state, { type: "set-truth", on: true });
  assert.deepEqual([state.truthMode, state.mode, state.chart2d], [true, "smooth", false]);

  state = transitionReplay(state, { type: "set-mode", mode: "raw" });
  assert.deepEqual([state.truthMode, state.mode, state.chart2d], [true, "raw", false]);

  state = transitionReplay(state, { type: "set-chart-2d", on: true });
  assert.deepEqual([state.truthMode, state.mode, state.chart2d], [true, "raw", true]);

  state = transitionReplay(state, { type: "set-truth", on: false });
  assert.deepEqual([state.truthMode, state.mode, state.chart2d], [false, "raw", true]);
});

test("truth DOM branches compose with 2D and renderer availability", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  const topBar = source("src/components/layline/hud/TopBar.tsx");
  const inspector = source("src/components/layline/hud/TruthInspector.tsx");
  const workspacePanel = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
  const chart = source("src/components/layline/svg/ChartView.tsx");
  const css = source("src/app/prototype/layline/layline.module.css");

  assert.match(app, /truthMode && analysisWorkspace\?\.panel !== "truth-provenance" \? \([^]*<TruthInspector race=\{race\} inspection=\{visibleInspection\}[^]*:\s*live \? \([^]*<Instruments race=\{race\} inspection=\{visibleInspection\}[^]*:\s*null/);
  assert.match(workspacePanel, /<TruthInspector race=\{race\} inspection=\{inspection\}/);
  assert.match(app, /live && chart2d \? \([^]*<ChartView race=\{race\} inspection=\{visibleInspection\} layers=\{chartLayers\} \/>/);
  /* The replay-aware SVG fallback and the static server chart are mutually
     exclusive: without WebGL, chartGone can never latch, so the static layer
     must yield whenever the truth fallback is up. */
  assert.match(app, /const truthFallbackUp =\s*!live && analysisWorkspaceReady && \(analysisWorkspace !== null \|\| truthMode\);/);
  assert.match(app, /\{chartGone \|\| truthFallbackUp \? null : \(/);
  assert.match(app, /\{truthFallbackUp \? \(/);
  assert.match(app, /layers=\{noWebglLayers\}/);
  assert.match(app, /className=\{styles\.truthFallbackLayer\}/);
  assert.match(topBar, /aria-controls=\{truthMode \? "truth-inspector" : undefined\}/);
  assert.match(topBar, /aria-expanded=\{truthMode\}/);
  assert.match(inspector, /live\.followId, live\.t/);
  assert.match(inspector, /sceneUp \? \(chart2d \? "2D TRACK" : "3D SCENE"\)/);
  assert.match(inspector, /"2D TRACK · RENDERER UNAVAILABLE"/);
  assert.match(chart, /data-truth-fixes=\{rawFixEvidence\.kind === "truth-witness" \? followId : undefined\}/);
  assert.match(chart, /data-raw-fix-boats=\{\s*rawFixEvidence\.kind === "fleet-window" \? rawFixEvidence\.boatCount : undefined\s*\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*transition-duration:\s*1ms/);
  assert.doesNotMatch(
    css,
    /@media \(prefers-reduced-motion: reduce\)[^]*?\.truthInspector[^}]*display:\s*none/,
  );
});

test("phone top bar uses bounded tracks and keeps essential status visible", () => {
  const topBar = source("src/components/layline/hud/TopBar.tsx");
  const css = source("src/app/prototype/layline/layline.module.css");
  const phone = css
    .split("@media (max-width: 560px) {")[1]
    ?.split("@media (prefers-reduced-motion: reduce)")[0] ?? "";

  assert.match(
    phone,
    /\.dockTop\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/,
  );
  assert.match(phone, /grid-template-areas:\s*"brand clock"\s*"status status"/);
  assert.match(phone, /\.dockTopAnalysis > \.wordmarkBlock\s*\{[^}]*grid-area:\s*brand/);
  assert.match(phone, /\.dockTopAnalysis > \.clockBlock\s*\{[^}]*grid-area:\s*clock/);
  assert.match(phone, /\.dockTopAnalysis > \.windGroup\s*\{[^}]*grid-area:\s*status/);
  assert.match(
    phone,
    /\.wordmarkBlock,\s*\.clockBlock,\s*\.windGroup\s*\{[^}]*min-width:\s*0/,
  );
  assert.match(phone, /\.clockBlock\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(phone, /\.windGroup\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(
    css,
    /@media \(max-width: 900px\) \{[\s\S]*?\.stage\[data-analysis-workspace="compare"\] \.dockLeft\s*\{[^}]*width:\s*auto/,
  );
  assert.match(
    phone,
    /\.truthButton,\s*\.replayStatus\s*\{[^}]*min-height:\s*40px/,
  );
  for (const essential of ["truthButton", "replayStatus", "raceClock", "windGroup"]) {
    assert.doesNotMatch(phone, new RegExp(`\\.${essential}\\s*\\{[^}]*display:\\s*none`));
  }

  assert.match(topBar, /data-chip="replay-status"/);
  assert.match(topBar, /raw \? "RAW 4 HZ" : "SMOOTH"/);
  assert.match(topBar, /className=\{styles\.raceClock\}/);
  assert.match(topBar, /className=\{styles\.legChip\}/);
  assert.match(topBar, /<WindDial race=\{race\} \/>/);
  assert.match(topBar, /data-control="truth-mode"/);
});

test("drawer and truth branches keep valid relationships and closed content out of tabs", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const topBar = source("src/components/layline/hud/TopBar.tsx");
  const inspector = source("src/components/layline/hud/TruthInspector.tsx");
  const timeline = source("src/components/layline/hud/Timeline.tsx");
  const racesCss = source("src/app/prototype/layline/races/races.module.css");
  const consoleCss = source("src/app/prototype/layline/layline.module.css");

  const ids = [...workspace.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "race workspace has duplicate literal ids");
  for (const target of ["race-library-panel", "race-debrief-panel"]) {
    assert.ok(ids.includes(target), `missing controlled target ${target}`);
    assert.ok(workspace.includes(`aria-controls="${target}"`));
  }

  assert.match(topBar, /aria-controls=\{truthMode \? "truth-inspector" : undefined\}/);
  assert.match(inspector, /id="truth-inspector"/);
  assert.match(timeline, /const timelineHelpId = useId\(\)/);
  assert.match(timeline, /aria-describedby=\{timelineHelpId\}/);
  assert.match(timeline, /<span id=\{timelineHelpId\}/);

  assert.match(workspace, /hidden=\{!libraryOpen\}/);
  assert.match(workspace, /hidden=\{!analystOpen\}/);
  assert.match(racesCss, /\.drawerBody\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(workspace, /className=\{styles\.libraryPane\}[\s\S]*?tabIndex=\{-1\}/);
  assert.match(workspace, /className=\{styles\.analystPane\}[\s\S]*?tabIndex=\{-1\}/);

  assert.match(
    racesCss,
    /grid-template-columns:\s*var\(--library-track\)\s+12px\s+minmax\(560px,\s*1fr\)\s+12px\s+var\(--analyst-track\)/,
  );
  assert.match(racesCss, /--library-track:\s*52px/);
  assert.match(racesCss, /--analyst-track:\s*52px/);
  assert.doesNotMatch(racesCss, /grid-template-columns:\s*220px[^;]*340px/);
  assert.match(racesCss, /\.console\s*\{[^}]*min-width:\s*0/);
  /* One fix card per row: side by side at the dock's 264px every reading
     wrapped mid-value, and the full-height inspector has the rows to spend. */
  assert.match(consoleCss, /\.truthFixes\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.doesNotMatch(consoleCss, /\.truthFixes\s*\{[^}]*repeat\(2,/);
  assert.match(consoleCss, /\.truthFix\s*\{[^}]*min-width:\s*0/);
  assert.match(consoleCss, /\.transportRow\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(consoleCss, /\.timelineRow\s*\{[^}]*minmax\(0, 1fr\)/);
});

test("timeline and truth add no clock or animation authority and release their listeners", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  const scene = source("src/components/layline/scene/LaylineScene.tsx");
  const live = source("src/components/layline/hud/live.ts");
  const timeline = source("src/components/layline/hud/Timeline.tsx");
  const inspector = source("src/components/layline/hud/TruthInspector.tsx");
  const chart = source("src/components/layline/svg/ChartView.tsx");

  assert.equal((app.match(/replay\.advance\(/g) ?? []).length, 1);
  for (const text of [scene, live, timeline, inspector, chart]) {
    assert.doesNotMatch(text, /replay\.advance\(/);
  }
  for (const text of [timeline, inspector, chart]) {
    assert.doesNotMatch(text, /requestAnimationFrame|setInterval/);
  }

  assert.match(live, /return useReplay\.subscribe\(\(\) => listener\(sampleLive\(race\)\)\)/);
  assert.equal((timeline.match(/onLive\(race,/g) ?? []).length, 1);
  assert.equal((inspector.match(/onLive\(race,/g) ?? []).length, 1);
  assert.equal((chart.match(/onLive\(race,/g) ?? []).length, 1);
  assert.match(timeline, /return \(\) => observer\.disconnect\(\)/);
  assert.match(app, /const stop = useReplay\.subscribe/);
  assert.match(app, /return stop/);

  assert.equal((scene.match(/useReplay\.subscribe\(/g) ?? []).length, 2);
  assert.match(scene, /return \(\) => \{\s*document\.removeEventListener\("visibilitychange"/);
  assert.match(scene, /window\.removeEventListener\("pageshow"/);
  assert.match(scene, /canvas\.removeEventListener\("webglcontextlost"/);
  assert.match(scene, /canvas\.removeEventListener\("webglcontextrestored"/);
});

test("the no-WebGL path proves capability before mounting the scene island", () => {
  const app = source("src/components/layline/LaylineApp.tsx");

  assert.match(app, /function browserSupportsWebgl\(\): boolean/);
  assert.match(app, /getContext\("webgl2"[\s\S]*getContext\("webgl"/);
  assert.match(app, /getExtension\("WEBGL_lose_context"\)\?\.loseContext\(\)/);
  assert.match(app, /const \[webglCapable, setWebglCapable\] = useState\(false\)/);
  assert.match(app, /setWebglCapable\(browserSupportsWebgl\(\)\)/);
  assert.match(app, /\{webglCapable \? \([\s\S]*?<SceneIsland/);
  assert.match(app, /function useReplayClock\(playing: boolean, frozen: boolean\)/);
  assert.equal((app.match(/requestAnimationFrame\(/g) ?? []).length, 2);
  assert.equal((app.match(/cancelAnimationFrame\(/g) ?? []).length, 1);
  assert.match(app, /\{\(live \|\| comparison\) \? <Transport \/> : null\}/);
});
