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

const analysis = await import("../src/lib/layline/analysis-state.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { transitionReplay, transitionReplayClock } = await import(
  "../src/lib/layline/replay-transitions.ts"
);
const { FIX_HZ } = await import("../src/lib/layline/types.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

const races = RACES.map((meta) => generateRace(meta.seed));
const workspaceIds = [...analysis.ANALYSIS_WORKSPACE_IDS];

function owner(race = races[0], session = analysis.createAnalysisState(race, 22)) {
  return {
    raceId: RACES[0].id,
    t: 22,
    playing: true,
    rate: 4,
    mode: "raw",
    rig: "freeform",
    followId: race.boats[0].id,
    chart2d: true,
    truthMode: true,
    reducedMotion: true,
    frozen: true,
    webglOk: true,
    hudReady: true,
    rendererState: { calls: 17, triangles: 911 },
    workspacePreferences: { railCollapsed: false, futurePreference: { keep: true } },
    freeCameraPose: { eye: [7, 8, 9], target: [1, 2, 3] },
    cameraMode: Symbol.for("future-camera"),
    unknownCameraField: new Uint8Array([4, 5, 6]),
    analysis: session,
  };
}

function withoutAnalysis(value) {
  const { analysis: _analysis, ...rest } = value;
  return rest;
}

test("analysis-only store patch covers every ordered pair across 25 sequences", (t) => {
  let transitions = 0;
  for (let sequence = 0; sequence < 25; sequence++) {
    for (const from of workspaceIds) {
      for (const to of workspaceIds) {
        let state = owner();
        state = {
          ...state,
          ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
            type: "select-workspace",
            workspaceId: from,
          }),
        };
        state = {
          ...state,
          ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
            type: "set-layer-override",
            layerId: analysis.ANALYSIS_LAYER_IDS[sequence % analysis.ANALYSIS_LAYER_IDS.length],
            override: sequence % 3 === 0 ? "off" : "on",
          }),
        };
        if (sequence % 2 === 0) {
          state = {
            ...state,
            ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
              type: "set-range",
              from: 4 + sequence / 100,
              to: 12 + sequence / 100,
              pinned: true,
            }),
          };
        }
        const before = withoutAnalysis(state);
        const range = structuredClone(state.analysis.selectedRange);
        const overrides = structuredClone(state.analysis.layerOverrides);
        const patch = analysis.transitionAnalysisWorkspacePatch(races[0], state, {
          type: "select-workspace",
          workspaceId: to,
        });
        assert.deepEqual(Object.keys(patch), ["analysis"]);
        const next = { ...state, ...patch };
        assert.deepEqual(withoutAnalysis(next), before, `${sequence}:${from}->${to}`);
        assert.equal(next.analysis.active, to);
        assert.deepEqual(next.analysis.layerOverrides, overrides);
        if (sequence % 2 === 0) assert.deepEqual(next.analysis.selectedRange, range);
        transitions++;
      }
    }
  }
  assert.equal(transitions, 625);
  t.diagnostic(`${transitions} store-level ordered workspace transitions`);
});

test("legacy Stage 5 actions stay inside the workspace session", () => {
  let state = owner();
  for (const action of [
    { type: "select-workspace", workspaceId: "compare" },
    { type: "set-layer-override", layerId: "current", override: "on" },
    { type: "acquire-manual-camera" },
  ]) {
    state = { ...state, ...analysis.transitionAnalysisWorkspacePatch(races[0], state, action) };
  }
  const before = withoutAnalysis(state);
  const next = {
    ...state,
    ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
      type: "set-range",
      from: 7,
      to: 19,
      pinned: true,
    }),
  };
  assert.deepEqual(withoutAnalysis(next), before);
  assert.equal(next.analysis.active, "compare");
  assert.deepEqual(next.analysis.layerOverrides, { current: "on" });
  assert.equal(next.analysis.cameraIntentOwner, "manual");
  assert.deepEqual([next.analysis.selectedRange.from, next.analysis.selectedRange.to], [7, 19]);
});

test("primary changes preserve workspace intent and reconcile range/reference on all races", (t) => {
  let probes = 0;
  for (const race of races) {
    for (const boat of race.boats) {
      let state = owner(race);
      for (const action of [
        { type: "select-workspace", workspaceId: "performance" },
        { type: "set-layer-override", layerId: "wind", override: "off" },
        { type: "acquire-manual-camera" },
      ]) {
        state = { ...state, ...analysis.transitionAnalysisWorkspacePatch(race, state, action) };
      }
      const before = withoutAnalysis(state);
      const patch = analysis.transitionAnalysisWorkspacePrimaryPatch(race, state, boat.id);
      assert.deepEqual(Object.keys(patch).sort(), ["analysis", "followId"]);
      const next = { ...state, ...patch };
      assert.equal(next.followId, boat.id);
      assert.equal(next.analysis.active, "performance");
      assert.deepEqual(next.analysis.layerOverrides, { wind: "off" });
      assert.equal(next.analysis.cameraIntentOwner, "manual");
      assert.deepEqual(
        { ...withoutAnalysis(next), followId: before.followId },
        before,
      );
      probes++;
    }
  }
  assert.equal(probes, 18);
  t.diagnostic(`${probes} primary reconciliation probes`);
});

test("race change composes only with the existing replay reset contract", (t) => {
  let probes = 0;
  for (let from = 0; from < races.length; from++) {
    for (let to = 0; to < races.length; to++) {
      let state = owner(races[from]);
      state.raceId = RACES[from].id;
      for (const action of [
        { type: "select-workspace", workspaceId: "evidence" },
        { type: "set-layer-override", layerId: "current", override: "on" },
        { type: "set-layer-override", layerId: "tracks", override: "off" },
        { type: "acquire-manual-camera" },
      ]) {
        state = { ...state, ...analysis.transitionAnalysisWorkspacePatch(races[from], state, action) };
      }
      const replay = transitionReplay(state, { type: "select-race", raceId: RACES[to].id });
      const next = {
        ...replay,
        analysis: analysis.reconcileAnalysisWorkspaceSession(
          races[to],
          state.analysis,
          replay.t,
          { primaryBoatId: replay.followId },
        ),
      };
      assert.equal(next.analysis.active, "evidence");
      assert.deepEqual(next.analysis.layerOverrides, { current: "on", tracks: "off" });
      assert.equal(next.analysis.cameraIntentOwner, "manual");
      assert.equal(next.rig, "tv");
      assert.equal(next.followId, "nzl");
      assert.equal(next.chart2d, false);
      assert.equal(next.t, 18);
      assert.equal(next.playing, false);
      assert.strictEqual(next.freeCameraPose, state.freeCameraPose);
      assert.strictEqual(next.unknownCameraField, state.unknownCameraField);
      probes++;
    }
  }
  assert.equal(probes, 9);
  t.diagnostic(`${probes} race-transition compositions`);
});

test("manual acquisition and release are metadata-only patches", () => {
  let state = owner();
  const cameraBefore = withoutAnalysis(state);
  state = {
    ...state,
    ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
      type: "acquire-manual-camera",
    }),
  };
  assert.equal(state.analysis.cameraIntentOwner, "manual");
  assert.deepEqual(withoutAnalysis(state), cameraBefore);
  for (const workspaceId of workspaceIds) {
    state = {
      ...state,
      ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
        type: "select-workspace",
        workspaceId,
      }),
    };
    assert.equal(state.analysis.cameraIntentOwner, "manual");
    assert.deepEqual(withoutAnalysis(state), cameraBefore);
  }
  state = {
    ...state,
    ...analysis.transitionAnalysisWorkspacePatch(races[0], state, {
      type: "release-camera-to-preset",
    }),
  };
  assert.equal(state.analysis.cameraIntentOwner, "preset");
  assert.deepEqual(withoutAnalysis(state), cameraBefore);
});

test("patch boundaries are total for malformed and revoked state/action", () => {
  const state = owner();
  for (const malformed of [null, undefined, 4, "bad", {}, [], new Date()]) {
    assert.doesNotThrow(() => analysis.transitionAnalysisWorkspacePatch(races[0], malformed, malformed));
    assert.doesNotThrow(() => analysis.transitionAnalysisWorkspacePrimaryPatch(races[0], malformed, malformed));
  }
  const stateRevocable = Proxy.revocable(state, {});
  const actionRevocable = Proxy.revocable({ type: "reset-workspace" }, {});
  stateRevocable.revoke();
  actionRevocable.revoke();
  assert.doesNotThrow(() =>
    analysis.transitionAnalysisWorkspacePatch(races[0], stateRevocable.proxy, { type: "reset-workspace" })
  );
  assert.doesNotThrow(() =>
    analysis.transitionAnalysisWorkspacePatch(races[0], state, actionRevocable.proxy)
  );
  assert.doesNotThrow(() =>
    analysis.transitionAnalysisWorkspacePrimaryPatch(races[0], stateRevocable.proxy, "usa")
  );
  assert.deepEqual(
    analysis.transitionAnalysisWorkspacePatch(races[0], stateRevocable.proxy, { type: "reset-workspace" }),
    {},
  );
});

test("production store exposes one workspace authority and analysis-only action patches", () => {
  const store = readFileSync(new URL("../src/components/layline/store.ts", import.meta.url), "utf8");
  assert.match(store, /analysis:\s*AnalysisWorkspaceSession/);
  assert.match(store, /analysis:\s*sanitizeAnalysisWorkspaceSession\(/);
  assert.match(store, /transitionAnalysisWorkspacePatch/);
  assert.match(store, /transitionAnalysisWorkspacePrimaryPatch/);
  assert.match(store, /selectAnalysisWorkspace:/);
  assert.match(store, /setAnalysisLayer:/);
  assert.match(store, /resetAnalysisWorkspace:/);
  assert.match(store, /releaseAnalysisCameraIntent:/);
  assert.doesNotMatch(store, /analysisWorkspace\s*:/);
  assert.doesNotMatch(store, /localStorage|document\.cookie|URLSearchParams/);
  const rigBody = store.match(/setRig:\s*\(rig\)[\s\S]*?setChart2d:/)?.[0] ?? "";
  assert.match(rigBody, /acquire-manual-camera/);
  assert.doesNotMatch(rigBody, /resetFreeformCamera/);
});

test("the production store clock advances unpinned workspace ranges at telemetry cadence", (t) => {
  const race = races[0];
  const primaryBoatId = race.boats[0].id;
  let clock = { t: 22, playing: true };
  const sessions = Object.fromEntries(
    workspaceIds.map((workspaceId) => [
      workspaceId,
      { ...analysis.createAnalysisState(race, clock.t), active: workspaceId },
    ]),
  );
  const first = Object.fromEntries(
    workspaceIds.map((workspaceId) => [
      workspaceId,
      analysis.resolveAnalysisWorkspace(sessions[workspaceId], race, clock.t, { primaryBoatId }).range,
    ]),
  );
  let previousKey = analysis.analysisReplayCadenceKey(clock.t);
  let cadenceChanges = 0;
  let compareChanges = 0;
  let evidenceChanges = 0;
  let lastCompare = first.compare;
  let lastEvidence = first.evidence;

  for (let tick = 0; tick < 44; tick += 1) {
    const patch = transitionReplayClock(race, clock, {
      type: "advance",
      seconds: 1 / FIX_HZ,
    });
    clock = { ...clock, ...patch };
    const key = analysis.analysisReplayCadenceKey(clock.t);
    if (key === previousKey) continue;
    cadenceChanges += 1;
    previousKey = key;
    const compare = analysis.resolveAnalysisWorkspace(
      sessions.compare,
      race,
      clock.t,
      { primaryBoatId },
    ).range;
    const evidence = analysis.resolveAnalysisWorkspace(
      sessions.evidence,
      race,
      clock.t,
      { primaryBoatId },
    ).range;
    if (compare.from !== lastCompare.from || compare.to !== lastCompare.to) compareChanges += 1;
    if (evidence.from !== lastEvidence.from || evidence.to !== lastEvidence.to) evidenceChanges += 1;
    lastCompare = compare;
    lastEvidence = evidence;
  }

  assert.ok(cadenceChanges >= 40, `${cadenceChanges} cadence changes`);
  assert.equal(compareChanges, cadenceChanges);
  assert.equal(evidenceChanges, cadenceChanges);
  assert.deepEqual(
    analysis.resolveAnalysisWorkspace(sessions.overview, race, clock.t, { primaryBoatId }).range,
    first.overview,
  );
  assert.deepEqual(
    analysis.resolveAnalysisWorkspace(sessions.start, race, clock.t, { primaryBoatId }).range,
    first.start,
  );
  t.diagnostic(`${cadenceChanges} real clock transitions; compare/evidence both refreshed`);
});

test("paused seek and step refresh unpinned policy, cross a leg, and preserve pinned range exactly", () => {
  const race = races[0];
  const primaryBoatId = race.boats[0].id;
  const series = race.progress[primaryBoatId];
  const boundaryIndex = series.findIndex(
    (sample, index) => index > 0 && sample.leg !== series[index - 1].leg,
  );
  assert.ok(boundaryIndex > 0, "seeded race needs a primary-boat leg boundary");
  const boundary = series[boundaryIndex].t;
  let clock = { t: boundary - 2 / FIX_HZ, playing: false };
  const performance = {
    ...analysis.createAnalysisState(race, clock.t),
    active: "performance",
  };
  const before = analysis.resolveAnalysisWorkspace(performance, race, clock.t, { primaryBoatId });
  clock = {
    ...clock,
    ...transitionReplayClock(race, clock, { type: "seek", t: boundary + 1 / FIX_HZ }),
  };
  const after = analysis.resolveAnalysisWorkspace(performance, race, clock.t, { primaryBoatId });
  assert.notDeepEqual(after.range, before.range);

  const stepped = transitionReplayClock(race, { ...clock, playing: true }, {
    type: "step",
    direction: 1,
  });
  assert.equal(stepped.playing, false);
  assert.equal(
    analysis.analysisReplayCadenceKey(stepped.t),
    analysis.analysisReplayCadenceKey(clock.t) + 1,
  );

  const pinnedRange = Object.freeze({ from: 7.125, to: 19.875 });
  const pinned = {
    ...analysis.createAnalysisState(race, clock.t),
    active: "compare",
    rangePinned: true,
    selectedRange: pinnedRange,
  };
  const exact = analysis.resolveAnalysisWorkspace(pinned, race, clock.t, { primaryBoatId }).range;
  for (let tick = 0; tick < 48; tick += 1) {
    clock = {
      ...clock,
      ...transitionReplayClock(race, clock, { type: "advance", seconds: 1 / FIX_HZ }),
    };
    assert.deepEqual(
      analysis.resolveAnalysisWorkspace(pinned, race, clock.t, { primaryBoatId }).range,
      exact,
    );
  }

  assert.equal(Object.is(analysis.analysisReplayCadenceKey(-0), -0), false);
  assert.equal(analysis.analysisReplayCadenceKey(0), 0);
  assert.equal(analysis.analysisReplayCadenceKey(1 / FIX_HZ - 1e-12), 1);
  assert.equal(analysis.analysisReplayCadenceKey(1 / FIX_HZ), 1);
});

test("store seek, step and advance delegate to one production clock reducer", () => {
  const store = readFileSync(new URL("../src/components/layline/store.ts", import.meta.url), "utf8");
  const scene = readFileSync(
    new URL("../src/components/layline/scene/LaylineScene.tsx", import.meta.url),
    "utf8",
  );
  const app = readFileSync(
    new URL("../src/components/layline/LaylineApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(store, /seek:\s*\(t\)\s*=>[\s\S]*transitionReplayClock/);
  assert.match(store, /step:\s*\(direction\)\s*=>[\s\S]*transitionReplayClock/);
  assert.match(store, /advance:\s*\(seconds\)\s*=>[\s\S]*transitionReplayClock/);
  assert.equal((app.match(/replay\.advance\(/g) ?? []).length, 1);
  assert.equal((scene.match(/replay\.advance\(/g) ?? []).length, 0);
  assert.doesNotMatch(store, /requestAnimationFrame|setInterval/);
});
