import assert from "node:assert/strict";
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

const {
  ANALYSIS_LAYER_IDS,
  ANALYSIS_WORKSPACE_IDS,
  ANALYSIS_WORKSPACE_PRESETS,
  createAnalysisState,
  reconcileAnalysisWorkspaceSession,
  resolveAnalysisWorkspace,
  sanitizeAnalysisWorkspaceSession,
  transitionAnalysisWorkspaceOwner,
  transitionAnalysisWorkspace,
} = await import("../src/lib/layline/analysis-state.ts");
const { normalizeAnalysisRange } = await import("../src/lib/layline/comparison.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const { DEFAULT_WORKSPACE_PREFERENCES } = await import(
  "../src/app/prototype/layline/races/workspaceState.ts"
);

const race = generateRace(RACES[0].seed);
const workspaceIds = ["overview", "start", "compare", "performance", "evidence"];
const layerIds = ["tracks", "laylines", "current", "wind", "performance", "raw-fixes"];

function ownerState(session = createAnalysisState(race, 22)) {
  return {
    raceId: "long-beach",
    route: "/prototype/layline/races?race=long-beach",
    t: 22,
    selectedBoat: race.boats[0].id,
    followId: race.boats[0].id,
    playing: true,
    rate: 4,
    mode: "raw",
    rig: "freeform",
    chart2d: true,
    truthMode: true,
    rendererMode: "webgl",
    rendererState: { webglOk: true, drawCount: 77 },
    freeformPose: { position: [11, 12, 13], target: [1, 2, 3], zoom: 1.25 },
    rigPose: { yaw: 0.75, pitch: -0.2 },
    cameraMode: Symbol.for("future-camera-mode"),
    futureCameraSentinel: { field: "keep", nested: [1, 2, { value: 3 }] },
    reducedMotion: true,
    frozen: true,
    workspacePreferences: {
      ...DEFAULT_WORKSPACE_PREFERENCES,
      pinned: ["long-beach"],
      archived: ["sable-reach"],
      railCollapsed: false,
      unknownPreferenceSentinel: { survives: true },
    },
    unknownOwnerSentinel: new Uint8Array([7, 8, 9]),
    analysis: session,
  };
}

function withoutAnalysis(value) {
  const { analysis, ...rest } = value;
  return rest;
}

function expectedPrimaryLegRange(data, boatId, at) {
  const series = data.progress[boatId];
  assert.ok(Array.isArray(series) && series.length > 0);
  let index = 0;
  while (index + 1 < series.length && series[index + 1].t <= at) index++;
  const leg = series[index].leg;
  let first = index;
  let last = index;
  while (first > 0 && series[first - 1].leg === leg) first--;
  while (last + 1 < series.length && series[last + 1].leg === leg) last++;
  return normalizeAnalysisRange(
    data,
    series[first].t,
    last + 1 < series.length ? series[last + 1].t : data.tMax,
  );
}

function deepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => deepFrozen(value[key], seen));
}

test("preset IDs, labels, lanes, ranges, layers, capabilities and controls are exact immutable intent", () => {
  assert.deepEqual(ANALYSIS_WORKSPACE_IDS, workspaceIds);
  assert.deepEqual(ANALYSIS_LAYER_IDS, layerIds);
  assert.deepEqual(Object.keys(ANALYSIS_WORKSPACE_PRESETS), workspaceIds);
  assert.ok(deepFrozen(ANALYSIS_WORKSPACE_PRESETS));

  const expected = {
    overview: {
      label: "Overview",
      panel: "standings-leg-summary",
      lanes: ["phase", "event", "maneuver"],
      rangePolicy: "whole-race",
      capability: "available",
      defaultReference: null,
      controls: [],
      on: ["tracks", "laylines"],
    },
    start: {
      label: "Start",
      panel: "start-line",
      lanes: ["start", "phase", "event"],
      rangePolicy: "start-window",
      capability: "available",
      defaultReference: null,
      controls: [],
      on: ["tracks"],
    },
    compare: {
      label: "Compare",
      panel: "comparison",
      lanes: ["gain-loss", "event", "maneuver"],
      rangePolicy: "current-focus-10",
      capability: "available",
      defaultReference: "fleet-median",
      controls: [],
      on: ["tracks"],
    },
    performance: {
      label: "Performance",
      panel: "performance",
      lanes: ["maneuver"],
      rangePolicy: "current-leg",
      capability: "requires-performance-analysis",
      defaultReference: null,
      controls: [],
      on: ["tracks", "performance"],
    },
    evidence: {
      label: "Evidence",
      panel: "truth-provenance",
      lanes: ["phase", "raw-fix", "event", "maneuver"],
      rangePolicy: "current-focus-10",
      capability: "available",
      defaultReference: null,
      controls: ["truth-mode", "replay-mode"],
      on: [],
    },
  };

  for (const id of workspaceIds) {
    const preset = ANALYSIS_WORKSPACE_PRESETS[id];
    assert.equal(preset.id, id);
    assert.equal(preset.label, expected[id].label);
    assert.equal(preset.panel, expected[id].panel);
    assert.deepEqual(preset.timelineLaneIds, expected[id].lanes);
    assert.equal(preset.rangePolicy, expected[id].rangePolicy);
    assert.equal(preset.surfaceCapability, expected[id].capability);
    assert.equal(preset.defaultReference, expected[id].defaultReference);
    assert.deepEqual(preset.controls, expected[id].controls);
    for (const layerId of layerIds) {
      assert.equal(
        preset.layerIntent[layerId],
        expected[id].on.includes(layerId) ? "on" : "off",
        `${id}:${layerId}`,
      );
    }
  }

  for (let i = 0; i < workspaceIds.length; i++) {
    for (let j = i + 1; j < workspaceIds.length; j++) {
      const a = ANALYSIS_WORKSPACE_PRESETS[workspaceIds[i]];
      const b = ANALYSIS_WORKSPACE_PRESETS[workspaceIds[j]];
      assert.notEqual(a.timelineLaneIds, b.timelineLaneIds);
      assert.notEqual(a.layerIntent, b.layerIntent);
      assert.notEqual(a.controls, b.controls);
    }
  }
  assert.throws(() => ANALYSIS_WORKSPACE_PRESETS.overview.timelineLaneIds.push("mutation"));
  assert.throws(() => {
    ANALYSIS_WORKSPACE_PRESETS.overview.layerIntent.tracks = "off";
  });
});

test("five preset range policies resolve deterministically without changing replay state", () => {
  const at = 22;
  let session = createAnalysisState(race, at);
  const primaryBoatId = race.boats[0].id;
  const expectedRanges = {
    overview: normalizeAnalysisRange(race, race.tMin, race.tMax),
    start: normalizeAnalysisRange(race, -10, 0),
    compare: normalizeAnalysisRange(race, at - 5, at + 5),
    performance: expectedPrimaryLegRange(race, primaryBoatId, at),
    evidence: normalizeAnalysisRange(race, at - 5, at + 5),
  };

  for (const id of workspaceIds) {
    session = transitionAnalysisWorkspace(
      race,
      session,
      at,
      { type: "select-workspace", workspaceId: id },
      { primaryBoatId },
    );
    const resolved = resolveAnalysisWorkspace(session, race, at, { primaryBoatId });
    assert.deepEqual(resolved.range, expectedRanges[id], id);
    assert.equal(resolved.surfaceAvailable, id !== "performance");
    assert.equal(
      resolveAnalysisWorkspace(session, race, at, { primaryBoatId, performanceAvailable: true })
        .surfaceAvailable,
      true,
    );
  }
});

test("all 25 ordered switches preserve pinned intent and every non-analysis owner byte", (t) => {
  let switches = 0;
  for (const from of workspaceIds) {
    for (const to of workspaceIds) {
      let session = transitionAnalysisWorkspace(
        race,
        createAnalysisState(race, 22, { kind: "boat", boatId: race.boats[1].id }),
        22,
        { type: "select-workspace", workspaceId: from },
        { primaryBoatId: race.boats[0].id },
      );
      session = transitionAnalysisWorkspace(race, session, 22, {
        type: "set-layer-override",
        layerId: "current",
        override: "on",
      });
      session = transitionAnalysisWorkspace(race, session, 22, {
        type: "acquire-manual-camera",
      });
      session = transitionAnalysisWorkspace(race, session, 22, {
        type: "set-range",
        from: 7.125,
        to: 19.875,
        pinned: true,
      });
      const before = ownerState(session);
      const ownerSnapshot = withoutAnalysis(before);
      const sessionSnapshot = structuredClone(session);
      const after = transitionAnalysisWorkspaceOwner(race, before, {
        type: "select-workspace",
        workspaceId: to,
      });

      assert.deepEqual(withoutAnalysis(after), ownerSnapshot, `${from}->${to}: owner`);
      assert.equal(after.t, before.t, `${from}->${to}: t`);
      assert.equal(after.followId, before.followId, `${from}->${to}: follow`);
      assert.equal(after.analysis.active, to, `${from}->${to}: active`);
      assert.deepEqual(after.analysis.selectedRange, sessionSnapshot.selectedRange, `${from}->${to}: range`);
      assert.equal(after.analysis.rangePinned, true, `${from}->${to}: pin`);
      assert.deepEqual(after.analysis.reference, sessionSnapshot.reference, `${from}->${to}: reference`);
      assert.deepEqual(after.analysis.layerOverrides, sessionSnapshot.layerOverrides, `${from}->${to}: layers`);
      assert.equal(after.analysis.cameraIntentOwner, "manual", `${from}->${to}: camera owner`);
      switches++;
    }
  }
  assert.equal(switches, 25);
  t.diagnostic(`${switches} pinned ordered workspace switches`);
});

test("all 25 unpinned ordered switches resolve the new policy at unchanged replay t", (t) => {
  let switches = 0;
  for (const from of workspaceIds) {
    for (const to of workspaceIds) {
      const start = transitionAnalysisWorkspace(
        race,
        createAnalysisState(race, 22, { kind: "boat", boatId: race.boats[1].id }),
        22,
        { type: "select-workspace", workspaceId: from },
        { primaryBoatId: race.boats[0].id },
      );
      const before = ownerState(start);
      const after = transitionAnalysisWorkspaceOwner(race, before, {
        type: "select-workspace",
        workspaceId: to,
      });
      const expected = resolveAnalysisWorkspace(
        { ...start, active: to },
        race,
        before.t,
        { primaryBoatId: before.followId },
      );

      assert.deepEqual(withoutAnalysis(after), withoutAnalysis(before), `${from}->${to}: owner`);
      assert.equal(after.t, before.t, `${from}->${to}: t`);
      assert.equal(after.analysis.active, to, `${from}->${to}: active`);
      assert.equal(after.analysis.rangePinned, false, `${from}->${to}: pin`);
      assert.deepEqual(after.analysis.selectedRange, expected.range, `${from}->${to}: range`);
      assert.deepEqual(after.analysis.reference, start.reference, `${from}->${to}: reference`);
      switches++;
    }
  }
  assert.equal(switches, 25);
  t.diagnostic(`${switches} unpinned ordered workspace switches`);
});

test("full 3^6 manual layer ownership cross-product resolves for every preset", (t) => {
  const choices = [undefined, "on", "off"];
  let combinations = 0;
  let assertions = 0;
  for (const workspaceId of workspaceIds) {
    for (let encoded = 0; encoded < 3 ** layerIds.length; encoded++) {
      let cursor = encoded;
      const layerOverrides = {};
      for (const layerId of layerIds) {
        const choice = choices[cursor % 3];
        cursor = Math.floor(cursor / 3);
        if (choice !== undefined) layerOverrides[layerId] = choice;
      }
      const session = {
        ...createAnalysisState(race, 22),
        active: workspaceId,
        layerOverrides,
      };
      const resolved = resolveAnalysisWorkspace(session, race, 22, {
        primaryBoatId: race.boats[0].id,
      });
      for (const layerId of layerIds) {
        const expected = layerOverrides[layerId] ?? ANALYSIS_WORKSPACE_PRESETS[workspaceId].layerIntent[layerId];
        assert.equal(resolved.layers[layerId], expected === "on", `${workspaceId}:${encoded}:${layerId}`);
        assertions++;
      }
      combinations++;
    }
  }
  assert.equal(combinations, 5 * 3 ** 6);
  t.diagnostic(`${combinations} preset/layer combinations; ${assertions} layer assertions`);
});

test("workspace reset clears only range pin and layer overrides, then reapplies active defaults", () => {
  let session = createAnalysisState(race, 22, { kind: "boat", boatId: race.boats[1].id });
  for (const action of [
    { type: "select-workspace", workspaceId: "performance" },
    { type: "set-range", from: 4, to: 9, pinned: true },
    { type: "set-layer-override", layerId: "current", override: "on" },
    { type: "set-layer-override", layerId: "tracks", override: "off" },
    { type: "acquire-manual-camera" },
  ]) {
    session = transitionAnalysisWorkspace(race, session, 22, action, {
      primaryBoatId: race.boats[0].id,
    });
  }
  const before = ownerState(session);
  const after = transitionAnalysisWorkspaceOwner(race, before, { type: "reset-workspace" });
  assert.deepEqual(withoutAnalysis(after), withoutAnalysis(before));
  assert.equal(after.analysis.active, "performance");
  assert.equal(after.analysis.rangePinned, false);
  assert.deepEqual(after.analysis.selectedRange, expectedPrimaryLegRange(race, race.boats[0].id, before.t));
  assert.deepEqual(after.analysis.layerOverrides, {});
  assert.deepEqual(after.analysis.reference, before.analysis.reference);
  assert.equal(after.analysis.cameraIntentOwner, "manual");
  assert.equal(resolveAnalysisWorkspace(after.analysis, race, before.t).layers.current, false);
  assert.equal(resolveAnalysisWorkspace(after.analysis, race, before.t).layers.tracks, true);
});

test("manual camera ownership survives every switch until explicit release", () => {
  let session = transitionAnalysisWorkspace(race, createAnalysisState(race, 22), 22, {
    type: "select-workspace",
    workspaceId: "start",
  });
  assert.equal(resolveAnalysisWorkspace(session, race, 22).cameraIntent.mayApplyRecommendation, true);
  session = transitionAnalysisWorkspace(race, session, 22, { type: "acquire-manual-camera" });
  for (const workspaceId of workspaceIds) {
    session = transitionAnalysisWorkspace(race, session, 22, {
      type: "select-workspace",
      workspaceId,
    });
    const resolved = resolveAnalysisWorkspace(session, race, 22);
    assert.equal(session.cameraIntentOwner, "manual");
    assert.equal(resolved.cameraIntent.owner, "manual");
    assert.equal(resolved.cameraIntent.mayApplyRecommendation, false);
  }
  session = transitionAnalysisWorkspace(race, session, 22, {
    type: "select-workspace",
    workspaceId: "start",
  });
  session = transitionAnalysisWorkspace(race, session, 22, {
    type: "release-camera-to-preset",
  });
  const released = resolveAnalysisWorkspace(session, race, 22);
  assert.equal(released.cameraIntent.owner, "preset");
  assert.equal(released.cameraIntent.mayApplyRecommendation, true);
  assert.equal(released.cameraIntent.recommendation, "start-line-context");
});

test("performance current-leg policy follows explicit primary authority across race lifecycle edges", (t) => {
  let probes = 0;
  for (const metadata of RACES) {
    const data = generateRace(metadata.seed);
    for (const boat of data.boats) {
      const series = data.progress[boat.id];
      const segments = [];
      for (let first = 0; first < series.length;) {
        let last = first;
        while (last + 1 < series.length && series[last + 1].leg === series[first].leg) last++;
        const end = last + 1 < series.length ? series[last + 1].t : data.tMax;
        segments.push({ leg: series[first].leg, from: series[first].t, to: end });
        first = last + 1;
      }
      assert.deepEqual(segments.map((segment) => segment.leg), ["prestart", "beat", "run", "finished"]);
      for (const segment of segments) {
        const times = [
          segment.from,
          segment.from + (segment.to - segment.from) / 2,
          Math.max(segment.from, segment.to - 1e-6),
        ];
        for (const at of times) {
        const session = {
          ...createAnalysisState(data, at),
          active: "performance",
        };
        const resolved = resolveAnalysisWorkspace(session, data, at, { primaryBoatId: boat.id });
        assert.deepEqual(resolved.range, expectedPrimaryLegRange(data, boat.id, at));
        assert.equal(resolved.rangeStatus, "primary-leg");
          probes++;
        }
      }
    }
  }
  assert.equal(probes, RACES.length * 6 * 4 * 3);
  t.diagnostic(`${probes} explicit-primary lifecycle probes`);
});

test("missing primary uses deterministic race lifecycle fallback, never boat order", () => {
  const at = 22;
  const session = { ...createAnalysisState(race, at), active: "performance" };
  const omitted = resolveAnalysisWorkspace(session, race, at);
  const invalid = resolveAnalysisWorkspace(session, race, at, { primaryBoatId: "removed" });
  const reorderedRace = { ...race, boats: [...race.boats].reverse() };
  const reordered = resolveAnalysisWorkspace(session, reorderedRace, at);
  assert.equal(omitted.rangeStatus, "race-lifecycle-fallback");
  assert.deepEqual(invalid.range, omitted.range);
  assert.deepEqual(reordered.range, omitted.range);
  assert.ok(omitted.range.from <= at && omitted.range.to >= at);

  const degenerateRace = { ...race, tMin: 4, tMax: 4, events: [], progress: {} };
  const degenerate = resolveAnalysisWorkspace(
    { ...createAnalysisState(race, at), active: "performance", rangePinned: false },
    degenerateRace,
    Number.NaN,
  );
  assert.deepEqual(
    [degenerate.range.from, degenerate.range.to, degenerate.range.durationMicros],
    [4, 4, 0],
  );
});

test("race reconciliation clamps focus/range and invalid named rivals to fixed fleet median", () => {
  const otherRace = generateRace(RACES[1].seed);
  const hostileRange = {
    from: -1e6,
    to: 1e6,
    fromMicros: -1e12,
    toMicros: 1e12,
    durationMicros: 2e12,
  };
  const stale = {
    ...createAnalysisState(race, 22),
    active: "compare",
    focusSpanSeconds: 10,
    focusCenterSeconds: 1e6,
    selectedRange: hostileRange,
    rangePinned: true,
    reference: { kind: "boat", boatId: "removed" },
    layerOverrides: { current: "on", wind: "off" },
    cameraIntentOwner: "manual",
  };
  const next = reconcileAnalysisWorkspaceSession(otherRace, stale, 18, {
    primaryBoatId: otherRace.boats[0].id,
  });
  assert.equal(next.active, "compare");
  assert.deepEqual([next.selectedRange.from, next.selectedRange.to], [otherRace.tMin, otherRace.tMax]);
  assert.ok(next.focusCenterSeconds <= otherRace.tMax);
  assert.deepEqual(next.reference, {
    kind: "fleet-median",
    boatIds: otherRace.boats.map((boat) => boat.id),
  });
  assert.deepEqual(next.layerOverrides, stale.layerOverrides);
  assert.equal(next.cameraIntentOwner, "manual");

  const unpinned = reconcileAnalysisWorkspaceSession(
    otherRace,
    { ...stale, rangePinned: false, active: "start" },
    18,
    { primaryBoatId: otherRace.boats[0].id },
  );
  assert.equal(unpinned.active, "start");
  assert.deepEqual(unpinned.selectedRange, normalizeAnalysisRange(otherRace, -10, 0));
});

test("sanitizer and reducer boundaries reject hostile serialized state without throwing", () => {
  const throwing = new Proxy({}, {
    ownKeys() {
      throw new Error("hostile ownKeys");
    },
    get() {
      throw new Error("hostile get");
    },
  });
  let getterReads = 0;
  const accessorState = {};
  Object.defineProperty(accessorState, "reference", {
    enumerable: true,
    get() {
      getterReads++;
      throw new Error("reference getter must not run");
    },
  });
  const accessorAction = {};
  Object.defineProperty(accessorAction, "type", {
    enumerable: true,
    get() {
      getterReads++;
      throw new Error("action getter must not run");
    },
  });
  const hostileBoatIds = new Proxy([race.boats[0].id], {
    getOwnPropertyDescriptor() {
      throw new Error("hostile reference array descriptor");
    },
  });
  const cases = [
    null,
    undefined,
    7,
    "workspace",
    throwing,
    accessorState,
    { reference: { kind: "fleet-median", boatIds: hostileBoatIds } },
    {
      active: "invented",
      focusSpanSeconds: -1,
      focusCenterSeconds: Number.NaN,
      selectedRange: { from: Infinity, to: -Infinity },
      rangePinned: "yes",
      reference: { kind: "boat", boatId: "removed" },
      layerOverrides: {
        tracks: "sometimes",
        laylines: "on",
        current: false,
        wind: "off",
        performance: null,
        "raw-fixes": "on",
        invented: "on",
      },
      cameraIntentOwner: "camera-component",
    },
  ];

  for (const value of cases) {
    let sanitized;
    assert.doesNotThrow(() => {
      sanitized = sanitizeAnalysisWorkspaceSession(value, race, 22, {
        primaryBoatId: race.boats[0].id,
      });
    });
    assert.equal(sanitized.active, "overview");
    assert.equal(sanitized.rangePinned, false);
    assert.deepEqual(sanitized.reference, {
      kind: "fleet-median",
      boatIds: race.boats.map((boat) => boat.id),
    });
    assert.doesNotThrow(() => structuredClone(sanitized));
  }

  const partiallyValid = sanitizeAnalysisWorkspaceSession(cases.at(-1), race, 22);
  assert.deepEqual(partiallyValid.layerOverrides, { laylines: "on", wind: "off", "raw-fixes": "on" });

  const session = createAnalysisState(race, 22);
  const canonical = sanitizeAnalysisWorkspaceSession(session, race, 22);
  assert.deepEqual(transitionAnalysisWorkspace(race, session, 22, throwing), canonical);
  assert.deepEqual(transitionAnalysisWorkspace(race, session, 22, accessorAction), canonical);
  assert.deepEqual(
    transitionAnalysisWorkspace(race, session, 22, {
      type: "set-reference",
      reference: { kind: "fleet-median", boatIds: hostileBoatIds },
    }),
    canonical,
  );
  assert.equal(getterReads, 0);
  assert.deepEqual(
    transitionAnalysisWorkspace(race, session, 22, {
      type: "set-layer-override",
      layerId: "invented",
      override: "on",
    }),
    canonical,
  );
  assert.deepEqual(
    transitionAnalysisWorkspace(race, session, 22, {
      type: "select-workspace",
      workspaceId: "invented",
    }),
    canonical,
  );
  assert.doesNotThrow(() =>
    resolveAnalysisWorkspace(session, race, 22, new Proxy({}, {
      get() {
        throw new Error("hostile context get");
      },
    }))
  );
});

function assertDescriptorEqual(actual, expected, message) {
  assert.equal(actual.enumerable, expected.enumerable, `${message}: enumerable`);
  assert.equal(actual.configurable, expected.configurable, `${message}: configurable`);
  assert.equal("writable" in actual, "writable" in expected, `${message}: descriptor kind`);
  if ("writable" in expected) {
    assert.equal(actual.writable, expected.writable, `${message}: writable`);
    assert.equal(actual.value, expected.value, `${message}: value identity`);
  } else {
    assert.equal(actual.get, expected.get, `${message}: getter identity`);
    assert.equal(actual.set, expected.set, `${message}: setter identity`);
  }
}

test("owner transition is a total descriptor-preserving analysis-only boundary", () => {
  const ownerPrototype = { ownerPrototype: true };
  const symbolKey = Symbol("future-camera-symbol");
  const aliasedSentinel = { nested: { keep: true } };
  let unknownGetterReads = 0;

  function makeOwner(mode) {
    const owner = Object.create(ownerPrototype);
    Object.defineProperties(owner, {
      analysis: {
        value: createAnalysisState(race, 22),
        writable: mode !== "frozen",
        enumerable: false,
        configurable: mode === "plain",
      },
      t: { value: 22, writable: true, enumerable: false, configurable: true },
      followId: { value: race.boats[0].id, writable: false, enumerable: true, configurable: false },
      hiddenSentinel: {
        value: aliasedSentinel,
        writable: false,
        enumerable: false,
        configurable: false,
      },
      throwingEnumerableGetter: {
        enumerable: true,
        configurable: false,
        get() {
          unknownGetterReads++;
          throw new Error("unknown owner getter must not execute");
        },
      },
      [symbolKey]: {
        value: aliasedSentinel,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });
    if (mode === "sealed") Object.seal(owner);
    if (mode === "frozen") Object.freeze(owner);
    return owner;
  }

  for (const mode of ["plain", "sealed", "frozen"]) {
    const owner = makeOwner(mode);
    const before = Object.getOwnPropertyDescriptors(owner);
    const result = transitionAnalysisWorkspaceOwner(race, owner, {
      type: "select-workspace",
      workspaceId: "start",
    });
    const after = Object.getOwnPropertyDescriptors(result);

    assert.notEqual(result, owner, mode);
    assert.equal(Object.getPrototypeOf(result), ownerPrototype, `${mode}: prototype`);
    assert.equal(Object.isExtensible(result), Object.isExtensible(owner), `${mode}: extensibility`);
    assert.deepEqual(Reflect.ownKeys(result), Reflect.ownKeys(owner), `${mode}: own keys`);
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "analysis") {
        assert.equal(after.analysis.enumerable, before.analysis.enumerable, `${mode}: analysis enumerable`);
        assert.equal(after.analysis.configurable, before.analysis.configurable, `${mode}: analysis configurable`);
        assert.equal(after.analysis.writable, before.analysis.writable, `${mode}: analysis writable`);
        assert.notEqual(after.analysis.value, before.analysis.value, `${mode}: analysis replacement`);
        assert.equal(after.analysis.value.active, "start", `${mode}: analysis result`);
      } else {
        assertDescriptorEqual(after[key], before[key], `${mode}:${String(key)}`);
      }
    }
    assert.equal(Object.hasOwn(result.analysis, "followId"), false, `${mode}: no owner follow copy`);
  }
  assert.equal(unknownGetterReads, 0);

  let requiredGetterReads = 0;
  const accessorOwner = {};
  Object.defineProperties(accessorOwner, {
    analysis: {
      enumerable: true,
      get() {
        requiredGetterReads++;
        throw new Error("required owner getter must not execute");
      },
    },
    t: { value: 22, enumerable: true },
    followId: { value: race.boats[0].id, enumerable: true },
  });
  assert.equal(
    transitionAnalysisWorkspaceOwner(race, accessorOwner, { type: "reset-workspace" }),
    accessorOwner,
  );
  assert.equal(requiredGetterReads, 0);

  const missingOwner = { analysis: createAnalysisState(race, 22), t: 22 };
  assert.equal(
    transitionAnalysisWorkspaceOwner(race, missingOwner, { type: "reset-workspace" }),
    missingOwner,
  );

  let proxyTraps = 0;
  const hostileOwner = new Proxy({}, {
    ownKeys() {
      proxyTraps++;
      throw new Error("hostile owner ownKeys");
    },
  });
  let hostileResult;
  assert.doesNotThrow(() => {
    hostileResult = transitionAnalysisWorkspaceOwner(race, hostileOwner, {
      type: "reset-workspace",
    });
  });
  assert.equal(hostileResult, hostileOwner);
  assert.ok(proxyTraps > 0);
});

test("every Stage 7 public race boundary snapshots top-level data descriptors once", () => {
  const session = { ...createAnalysisState(race, 22), active: "performance" };
  const publicCalls = [
    (candidate) => sanitizeAnalysisWorkspaceSession(session, candidate, 22, {
      primaryBoatId: race.boats[0].id,
    }),
    (candidate) => resolveAnalysisWorkspace(session, candidate, 22, {
      primaryBoatId: race.boats[0].id,
    }),
    (candidate) => reconcileAnalysisWorkspaceSession(candidate, session, 22, {
      primaryBoatId: race.boats[0].id,
    }),
    (candidate) => transitionAnalysisWorkspace(candidate, session, 22, {
      type: "select-workspace",
      workspaceId: "performance",
    }, {
      primaryBoatId: race.boats[0].id,
    }),
  ];

  for (const call of publicCalls) {
    const descriptorReads = new Map();
    let propertyGets = 0;
    let prototypeTraps = 0;
    const candidate = new Proxy(race, {
      get() {
        propertyGets++;
        throw new Error("race property getter path must not run");
      },
      getPrototypeOf(target) {
        prototypeTraps++;
        return Reflect.getPrototypeOf(target);
      },
      getOwnPropertyDescriptor(target, key) {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    let result;
    assert.doesNotThrow(() => {
      result = call(candidate);
    });
    assert.doesNotThrow(() => structuredClone(result));
    assert.equal(propertyGets, 0);
    assert.equal(prototypeTraps, 1);
    for (const key of ["tMin", "tMax", "boats", "events", "progress"]) {
      assert.equal(descriptorReads.get(key), 1, String(key));
    }
  }

  let getterReads = 0;
  const accessorRace = {};
  for (const key of ["tMin", "tMax", "boats", "events", "progress"]) {
    Object.defineProperty(accessorRace, key, {
      enumerable: true,
      get() {
        getterReads++;
        throw new Error(`${key} getter must not run`);
      },
    });
  }
  for (const call of publicCalls) assert.doesNotThrow(() => call(accessorRace));
  assert.equal(getterReads, 0);

  const clone = structuredClone(race);
  for (const call of publicCalls) assert.deepEqual(call(clone), call(race));
});

test("nested race metadata is descriptor-snapshotted without property getter execution", () => {
  let getterReads = 0;
  function forbidden(name) {
    return {
      enumerable: true,
      get() {
        getterReads++;
        throw new Error(`${name} getter must not run`);
      },
    };
  }
  const boat = {};
  Object.defineProperty(boat, "id", forbidden("boat.id"));
  const event = {};
  Object.defineProperties(event, {
    kind: forbidden("event.kind"),
    t: forbidden("event.t"),
    boatId: forbidden("event.boatId"),
  });
  const sample = {};
  Object.defineProperties(sample, {
    t: forbidden("sample.t"),
    leg: forbidden("sample.leg"),
  });
  const hostileNested = {
    ...race,
    boats: [boat],
    events: [event],
    progress: { [race.boats[0].id]: [sample] },
  };
  const session = { ...createAnalysisState(race, 22), active: "performance" };
  let result;
  assert.doesNotThrow(() => {
    result = resolveAnalysisWorkspace(session, hostileNested, 22, {
      primaryBoatId: race.boats[0].id,
    });
  });
  assert.equal(getterReads, 0);
  assert.ok(Number.isFinite(result.range.from));
  assert.ok(Number.isFinite(result.range.to));

  const circularProgress = {};
  circularProgress[race.boats[0].id] = circularProgress;
  for (const candidate of [
    { ...race, boats: [new Date()], events: [], progress: {} },
    { ...race, progress: circularProgress },
    { ...race, progress: { [race.boats[0].id]: [{ t: Infinity, leg: "beat" }] } },
    { ...race, events: new Proxy([], {
      getOwnPropertyDescriptor() {
        throw new Error("hostile nested event descriptor");
      },
    }) },
  ]) {
    assert.doesNotThrow(() =>
      resolveAnalysisWorkspace(session, candidate, 22, {
        primaryBoatId: race.boats[0].id,
      })
    );
  }
});

test("nested race arrays, records, and items are read through each consumed descriptor once", () => {
  function guarded(target, label, counts) {
    return new Proxy(target, {
      get() {
        counts.gets++;
        throw new Error(`${label} property get must not run`);
      },
      getPrototypeOf(value) {
        counts.prototypes++;
        return Reflect.getPrototypeOf(value);
      },
      getOwnPropertyDescriptor(value, key) {
        counts.descriptors.set(key, (counts.descriptors.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(value, key);
      },
    });
  }
  function counters() {
    return { gets: 0, prototypes: 0, descriptors: new Map() };
  }

  const boatCounts = counters();
  const eventCounts = counters();
  const sampleCounts = counters();
  const boatsCounts = counters();
  const eventsCounts = counters();
  const seriesCounts = counters();
  const progressCounts = counters();
  const boat = guarded({ id: "only" }, "boat", boatCounts);
  const event = guarded({ kind: "finish", t: 3, boatId: "only" }, "event", eventCounts);
  const sample = guarded({ t: -10, leg: "prestart" }, "sample", sampleCounts);
  const boats = guarded([boat], "boats", boatsCounts);
  const events = guarded([event], "events", eventsCounts);
  const series = guarded([sample], "series", seriesCounts);
  const progress = guarded({ only: series }, "progress", progressCounts);
  const candidate = { tMin: -10, tMax: 10, boats, events, progress };

  const session = {
    ...createAnalysisState(race, 0),
    active: "performance",
    rangePinned: false,
  };
  assert.doesNotThrow(() =>
    resolveAnalysisWorkspace(session, candidate, 0, { primaryBoatId: "only" })
  );

  for (const [label, value] of Object.entries({
    boat: boatCounts,
    event: eventCounts,
    sample: sampleCounts,
    boats: boatsCounts,
    events: eventsCounts,
    series: seriesCounts,
    progress: progressCounts,
  })) {
    assert.equal(value.gets, 0, `${label}: property gets`);
    assert.equal(value.prototypes, 1, `${label}: prototype traps`);
  }
  assert.equal(boatCounts.descriptors.get("id"), 1);
  for (const key of ["kind", "t", "boatId"]) assert.equal(eventCounts.descriptors.get(key), 1);
  for (const key of ["t", "leg"]) assert.equal(sampleCounts.descriptors.get(key), 1);
  for (const value of [boatsCounts, eventsCounts, seriesCounts]) {
    assert.equal(value.descriptors.get("length"), 1);
    assert.equal(value.descriptors.get("0"), 1);
  }
  assert.equal(progressCounts.descriptors.get("only"), 1);
});

test("Start preset is literal [-10, 0] normalized only against race bounds", () => {
  const startSession = { ...createAnalysisState(race, 22), active: "start", rangePinned: false };
  const cases = [
    { label: "normal", data: race, expected: [-10, 0] },
    { label: "synthetic gun 5", data: { ...race, events: [{ kind: "gun", t: 5 }] }, expected: [-10, 0] },
    { label: "no gun", data: { ...race, events: [] }, expected: [-10, 0] },
    {
      label: "multiple guns",
      data: { ...race, events: [{ kind: "gun", t: -4 }, { kind: "gun", t: 7 }] },
      expected: [-10, 0],
    },
    {
      label: "hostile events",
      data: {
        ...race,
        events: new Proxy([], {
          getOwnPropertyDescriptor() {
            throw new Error("hostile event descriptors");
          },
        }),
      },
      expected: [-10, 0],
    },
    { label: "bounds before literal", data: { ...race, tMin: -20, tMax: -15 }, expected: [-15, -15] },
    { label: "bounds after literal", data: { ...race, tMin: 5, tMax: 10 }, expected: [5, 5] },
    { label: "bounds inside literal", data: { ...race, tMin: -5, tMax: 5 }, expected: [-5, 0] },
    { label: "degenerate bounds", data: { ...race, tMin: 4, tMax: 4 }, expected: [4, 4] },
  ];

  for (const { label, data, expected } of cases) {
    const resolved = resolveAnalysisWorkspace(startSession, data, 22);
    assert.deepEqual([resolved.range.from, resolved.range.to], expected, label);
  }
});

function objectGraph(value, seen = new Set()) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null || seen.has(value)) {
    return seen;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) objectGraph(descriptor.value, seen);
  }
  return seen;
}

function assertNoConsumedAliases(actual, consumed, label) {
  const consumedGraph = objectGraph(consumed);
  for (const value of objectGraph(actual)) {
    assert.equal(consumedGraph.has(value), false, `${label}: output aliases consumed input`);
  }
}

test("revoked proxies are inert across every Stage 7A public boundary and later valid calls recover", (t) => {
  const primaryBoatId = race.boats[0].id;
  const rivalBoatId = race.boats[1].id;
  const baseSession = {
    ...createAnalysisState(race, 22, {
      kind: "fleet-median",
      boatIds: race.boats.map((boat) => boat.id),
    }),
    active: "compare",
    layerOverrides: { current: "on" },
  };
  const baseContext = { primaryBoatId, performanceAvailable: true };
  const baseAction = {
    type: "set-reference",
    reference: { kind: "fleet-median", boatIds: [primaryBoatId, rivalBoatId] },
  };

  function assertRecovered(value, label) {
    assert.equal(value.active ?? value.workspaceId, "compare", `${label}: active`);
    if (value.reference !== undefined) {
      assert.equal(value.reference.kind, "fleet-median", `${label}: reference kind`);
      assert.ok(value.reference.boatIds.includes(primaryBoatId), `${label}: primary reference`);
    }
  }

  function runCase({ label, target, invoke, recovery, resultValue = (value) => value }) {
    let getterReads = 0;
    const beforeSnapshot = structuredClone(target);
    const { proxy, revoke } = Proxy.revocable(target, {
      get() {
        getterReads++;
        throw new Error(`${label}: property getter path must not execute`);
      },
    });

    let activeResult;
    assert.doesNotThrow(() => {
      activeResult = invoke(proxy);
    }, `${label}: active proxy`);
    assertNoConsumedAliases(resultValue(activeResult), target, `${label}: active proxy`);
    assert.deepEqual(target, beforeSnapshot, `${label}: active input mutation`);

    revoke();
    let revokedResult;
    let revokedError = null;
    try {
      revokedResult = invoke(proxy);
    } catch (error) {
      revokedError = error;
    }
    if (revokedError === null) {
      assert.doesNotThrow(() => structuredClone(resultValue(revokedResult)), `${label}: inert result`);
      assertNoConsumedAliases(resultValue(revokedResult), target, `${label}: revoked proxy`);
    }
    assert.deepEqual(target, beforeSnapshot, `${label}: revoked input mutation`);
    assert.equal(getterReads, 0, `${label}: property getter reads`);

    let recovered;
    assert.doesNotThrow(() => {
      recovered = recovery();
    }, `${label}: valid recovery`);
    assertRecovered(resultValue(recovered), `${label}: valid recovery`);
    return revokedError;
  }

  const cases = [
    {
      label: "sanitize session",
      target: structuredClone(baseSession),
      invoke: (value) => sanitizeAnalysisWorkspaceSession(value, race, 22, baseContext),
      recovery: () => sanitizeAnalysisWorkspaceSession(baseSession, race, 22, baseContext),
    },
    {
      label: "sanitize race",
      target: structuredClone(race),
      invoke: (value) => sanitizeAnalysisWorkspaceSession(baseSession, value, 22, baseContext),
      recovery: () => sanitizeAnalysisWorkspaceSession(baseSession, race, 22, baseContext),
    },
    {
      label: "resolve session",
      target: structuredClone(baseSession),
      invoke: (value) => resolveAnalysisWorkspace(value, race, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "resolve race",
      target: structuredClone(race),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, value, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "resolve context",
      target: structuredClone(baseContext),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, race, 22, value),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "reconcile race",
      target: structuredClone(race),
      invoke: (value) => reconcileAnalysisWorkspaceSession(value, baseSession, 22, baseContext),
      recovery: () => reconcileAnalysisWorkspaceSession(race, baseSession, 22, baseContext),
    },
    {
      label: "transition action",
      target: structuredClone(baseAction),
      invoke: (value) => transitionAnalysisWorkspace(race, baseSession, 22, value, baseContext),
      recovery: () => transitionAnalysisWorkspace(race, baseSession, 22, baseAction, baseContext),
    },
    {
      label: "transition race",
      target: structuredClone(race),
      invoke: (value) => transitionAnalysisWorkspace(value, baseSession, 22, baseAction, baseContext),
      recovery: () => transitionAnalysisWorkspace(race, baseSession, 22, baseAction, baseContext),
    },
    {
      label: "nested boats array",
      target: structuredClone(race.boats),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, { ...race, boats: value }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested boat record",
      target: structuredClone(race.boats[0]),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, { ...race, boats: [value] }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested events array",
      target: structuredClone(race.events),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, { ...race, events: value }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested event record",
      target: structuredClone(race.events.find((event) => event.boatId !== undefined)),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, { ...race, events: [value] }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested progress record",
      target: structuredClone(race.progress),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, { ...race, progress: value }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested progress sample record",
      target: structuredClone(race.progress[primaryBoatId][0]),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, {
        ...race,
        progress: { ...race.progress, [primaryBoatId]: [value] },
      }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "nested progress array",
      target: structuredClone(race.progress[primaryBoatId]),
      invoke: (value) => resolveAnalysisWorkspace(baseSession, {
        ...race,
        progress: { ...race.progress, [primaryBoatId]: value },
      }, 22, baseContext),
      recovery: () => resolveAnalysisWorkspace(baseSession, race, 22, baseContext),
    },
    {
      label: "comparison reference boatIds",
      target: [primaryBoatId, rivalBoatId],
      invoke: (value) => sanitizeAnalysisWorkspaceSession({
        ...baseSession,
        reference: { kind: "fleet-median", boatIds: value },
      }, race, 22, baseContext),
      recovery: () => sanitizeAnalysisWorkspaceSession(baseSession, race, 22, baseContext),
    },
    {
      label: "owner adapter race",
      target: structuredClone(race),
      invoke: (value) => transitionAnalysisWorkspaceOwner(value, ownerState(baseSession), baseAction),
      recovery: () => transitionAnalysisWorkspaceOwner(race, ownerState(baseSession), baseAction),
      resultValue: (value) => value.analysis,
    },
    {
      label: "owner adapter session",
      target: structuredClone(baseSession),
      invoke: (value) => transitionAnalysisWorkspaceOwner(race, ownerState(value), baseAction),
      recovery: () => transitionAnalysisWorkspaceOwner(race, ownerState(baseSession), baseAction),
      resultValue: (value) => value.analysis,
    },
    {
      label: "owner adapter action",
      target: structuredClone(baseAction),
      invoke: (value) => transitionAnalysisWorkspaceOwner(race, ownerState(baseSession), value),
      recovery: () => transitionAnalysisWorkspaceOwner(race, ownerState(baseSession), baseAction),
      resultValue: (value) => value.analysis,
    },
  ];

  const revokedFailures = cases
    .map((value) => ({ label: value.label, error: runCase(value) }))
    .filter(({ error }) => error !== null);

  const owner = ownerState(baseSession);
  let ownerGetterReads = 0;
  const ownerSnapshot = { ...owner };
  const { proxy: ownerProxy, revoke: revokeOwner } = Proxy.revocable(owner, {
    get() {
      ownerGetterReads++;
      throw new Error("owner adapter state getter path must not execute");
    },
  });
  let activeOwnerResult;
  assert.doesNotThrow(() => {
    activeOwnerResult = transitionAnalysisWorkspaceOwner(race, ownerProxy, baseAction);
  });
  assertNoConsumedAliases(activeOwnerResult.analysis, owner.analysis, "owner adapter state: active proxy");
  revokeOwner();
  let revokedOwnerError = null;
  try {
    transitionAnalysisWorkspaceOwner(race, ownerProxy, baseAction);
  } catch (error) {
    revokedOwnerError = error;
  }
  if (revokedOwnerError !== null) {
    revokedFailures.push({ label: "owner adapter state", error: revokedOwnerError });
  }
  assert.deepEqual(owner, ownerSnapshot);
  assert.equal(ownerGetterReads, 0);
  assertRecovered(
    transitionAnalysisWorkspaceOwner(race, ownerState(baseSession), baseAction).analysis,
    "owner adapter state: valid recovery",
  );

  t.diagnostic(`${cases.length + 1} active/revoked/recovery proxy boundary cases`);
  assert.deepEqual(
    revokedFailures.map(({ label, error }) => ({ label, message: error.message })),
    [],
  );
});
