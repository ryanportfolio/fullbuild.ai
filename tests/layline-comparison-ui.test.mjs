import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  analysisEvidenceTarget,
  createAnalysisState,
  reconcileAnalysisState,
  transitionAnalysisOwner,
  transitionAnalysisPrimary,
} = await import("../src/lib/layline/analysis-state.ts");
const { compareRange } = await import("../src/lib/layline/comparison.ts");
const { comparisonViewModel } = await import("../src/lib/layline/comparison-view.ts");
const { MISSING, fixStamp, signedMeters, signedMetersPerSecond } = await import(
  "../src/lib/layline/format.ts"
);
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const { DEFAULT_WORKSPACE_PREFERENCES } = await import(
  "../src/app/prototype/layline/races/workspaceState.ts"
);
const { ANALYST_TOOLS, compareBoats, compareRangeForAnalyst, runTool } = await import(
  "../src/lib/layline/analyst/tools.ts"
);
const { TIMELINE_POINT_ROW_LIMIT, packTimelinePoints } = await import(
  "../src/lib/layline/timeline.ts"
);

function ownerState(race) {
  return {
    raceId: "race-a",
    t: 42,
    playing: true,
    rate: 4,
    mode: "raw",
    rig: "freeform",
    followId: race.boats[0].id,
    chart2d: true,
    truthMode: true,
    cameraPose: { x: 3, y: 9 },
    freeformCamera: { position: [11, 12, 13], target: [1, 2, 3] },
    sentinelCameraField: "keep-camera-owner",
    webglOk: true,
    hudReady: true,
    introDone: true,
    frozen: true,
    workspacePreferences: {
      ...DEFAULT_WORKSPACE_PREFERENCES,
      pinned: ["long-beach"],
      railCollapsed: false,
    },
    analysis: createAnalysisState(race, 42, {
      kind: "boat",
      boatId: race.boats[1].id,
    }),
  };
}

function comparison(race, range, reference = { kind: "boat", boatId: race.boats[1].id }) {
  return compareRange(race, {
    primaryBoatId: race.boats[0].id,
    reference,
    range,
  });
}

test("every comparison intent action changes no replay, camera, renderer, truth, chart or preference field", () => {
  const race = generateRace(RACES[0].seed);
  const before = ownerState(race);
  const actions = [
    { type: "set-reference", reference: { kind: "boat", boatId: race.boats[2].id } },
    { type: "set-range", from: 8.125, to: 19.875 },
    { type: "set-focus", spanSeconds: 30, centerSeconds: 18 },
    { type: "recenter-focus", centerSeconds: 24 },
    { type: "set-range-in", at: 8.125 },
    { type: "set-range-out", at: 19.875 },
    { type: "use-focus" },
    { type: "reset-range" },
  ];
  const { analysis: beforeAnalysis, ...beforeOwned } = before;
  for (const action of actions) {
    const after = transitionAnalysisOwner(race, before, action);
    const { analysis: afterAnalysis, ...afterOwned } = after;
    assert.deepEqual(afterOwned, beforeOwned, action.type);
    assert.notEqual(afterAnalysis, beforeAnalysis, action.type);
  }
});

test("primary selection uses follow authority and self-heals a same named rival only", () => {
  const race = generateRace(RACES[0].seed);
  const before = ownerState(race);
  const selected = transitionAnalysisPrimary(race, before, race.boats[1].id);
  assert.equal(selected.followId, race.boats[1].id);
  assert.deepEqual(selected.analysis.reference, { kind: "boat", boatId: race.boats[0].id });

  for (const key of [
    "raceId",
    "t",
    "playing",
    "rate",
    "mode",
    "rig",
    "chart2d",
    "truthMode",
    "cameraPose",
    "preferences",
  ]) {
    assert.deepEqual(selected[key], before[key], key);
  }
  assert.equal(transitionAnalysisPrimary(race, before, "unknown"), before);
});

test("race reconciliation clamps focus/range and validates stale references", () => {
  const race = generateRace(RACES[0].seed);
  const stale = {
    ...createAnalysisState(race, race.tMax),
    focusSpanSeconds: 10,
    focusCenterSeconds: 10_000,
    selectedRange: {
      from: -10_000,
      to: 10_000,
      fromMicros: -10_000_000_000,
      toMicros: 10_000_000_000,
      durationMicros: 20_000_000_000,
    },
    reference: { kind: "boat", boatId: "removed" },
  };
  const next = reconcileAnalysisState(race, stale, race.boats[0].id);
  assert.deepEqual([next.selectedRange.from, next.selectedRange.to], [race.tMin, race.tMax]);
  assert.equal(next.focusCenterSeconds, race.tMax - 5);
  assert.deepEqual(next.reference, { kind: "boat", boatId: race.boats[1].id });

  const emptyFleet = reconcileAnalysisState(
    race,
    { ...stale, reference: { kind: "fleet-median", boatIds: ["removed"] } },
    race.boats[0].id,
  );
  assert.deepEqual(emptyFleet.reference, {
    kind: "fleet-median",
    boatIds: race.boats.map((boat) => boat.id),
  });

  const corrupt = reconcileAnalysisState(
    race,
    {
      ...stale,
      focusSpanSeconds: Number.NaN,
      selectedRange: { ...stale.selectedRange, from: Number.NaN },
    },
    race.boats[0].id,
  );
  assert.equal(corrupt.focusSpanSeconds, null);
  assert.deepEqual([corrupt.selectedRange.from, corrupt.selectedRange.to], [race.tMin, race.tMax]);
});

test("range evidence targets the exact selected range and never mutates it", () => {
  const race = generateRace(RACES[0].seed);
  const state = transitionAnalysisOwner(race, ownerState(race), {
    type: "set-range",
    from: 3.125,
    to: 17.875,
  }).analysis;
  const snapshot = structuredClone(state);
  const inside = analysisEvidenceTarget(state, "in");
  const outside = analysisEvidenceTarget(state, "out");
  assert.deepEqual(inside.range, state.selectedRange);
  assert.deepEqual(outside.range, state.selectedRange);
  assert.notEqual(inside.range, state.selectedRange);
  assert.equal(inside.seekTo, state.selectedRange.from);
  assert.equal(outside.seekTo, state.selectedRange.to);
  assert.deepEqual(state, snapshot);

  const playingOwner = ownerState(race);
  const sought = { ...playingOwner, t: inside.seekTo };
  assert.equal(sought.t, state.selectedRange.from);
  for (const key of Object.keys(playingOwner)) {
    if (key === "t") continue;
    assert.deepEqual(sought[key], playingOwner[key], key);
  }
});

test("signed display formatting normalizes negative zero at every comparison boundary", () => {
  assert.equal(signedMeters(-0), "+0.0");
  assert.equal(signedMeters(-0.001), "+0.0");
  assert.equal(signedMeters(-0.051), "-0.1");
  assert.equal(signedMeters(0.051), "+0.1");
  assert.doesNotMatch(signedMeters(Number.MAX_VALUE), /Infinity|NaN/);
  assert.doesNotMatch(signedMeters(-Number.MAX_VALUE), /Infinity|NaN/);
  assert.equal(signedMetersPerSecond(-0.004), "+0.00");
  assert.equal(signedMetersPerSecond(-0.006), "-0.01");
  assert.doesNotMatch(signedMetersPerSecond(Number.MAX_VALUE), /Infinity|NaN/);
  assert.equal(fixStamp(-0), "T+00:00.00");
  assert.equal(fixStamp(-0.004), "T+00:00.00");
  assert.equal(fixStamp(-0.006), "T-00:00.01");
});

test("UI view values are deterministic adapters over named/fleet valid and degenerate comparisons", (t) => {
  let assertions = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const fleet = { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) };
    const cases = [
      { range: { from: 5.125, to: 20.875 }, reference: { kind: "boat", boatId: race.boats[1].id } },
      { range: { from: 5.125, to: 20.875 }, reference: fleet },
      { range: { from: 8, to: 8 }, reference: { kind: "boat", boatId: race.boats[1].id } },
      { range: { from: race.tMin, to: -0.25 }, reference: fleet },
    ];
    for (const probe of cases) {
      const result = comparison(race, probe.range, probe.reference);
      const first = comparisonViewModel(race, result);
      assert.deepEqual(comparisonViewModel(race, result), first);
      const metrics = new Map(first.metrics.map((metric) => [metric.id, metric.value]));
      assert.equal(
        metrics.get("start"),
        result.startAdvantageMeters === null ? MISSING : signedMeters(result.startAdvantageMeters),
      );
      assert.equal(
        metrics.get("end"),
        result.endAdvantageMeters === null ? MISSING : signedMeters(result.endAdvantageMeters),
      );
      assert.equal(
        metrics.get("gain"),
        result.progressGainedMeters === null ? MISSING : signedMeters(result.progressGainedMeters),
      );
      assert.equal(
        metrics.get("distance"),
        result.sailedDistanceDeltaMeters === null ? MISSING : signedMeters(result.sailedDistanceDeltaMeters),
      );
      assert.equal(
        metrics.get("vmg"),
        result.groundVmgDeltaMps === null ? MISSING : signedMetersPerSecond(result.groundVmgDeltaMps),
      );
      assert.match(first.referenceLabel, result.reference.kind === "boat" ? /Named rival:/ : /fixed fleet median/);
      assert.match(first.referenceMembershipLabel, result.reference.kind === "boat" ? /Eligible rival:/ : /Requested cohort:.*Eligible cohort:/);
      if (result.reference.kind === "boat") {
        const rival = race.boats.find((boat) => boat.id === result.reference.boatId);
        assert.match(first.referenceLabel, new RegExp(`${rival.sail} \\(${rival.id}\\)`));
      } else {
        for (const boatId of result.reference.requestedCohortIds) {
          assert.match(first.referenceMembershipLabel, new RegExp(`\\(${boatId}\\)`));
        }
        for (const boatId of result.reference.eligibleCohortIds) {
          assert.match(first.referenceMembershipLabel, new RegExp(`\\(${boatId}\\)`));
        }
      }
      assert.equal(
        first.signConvention,
        "Positive advantage means the selected boat is ahead. Positive gain means the selected boat improved over this range.",
      );
      assertions += 9;
    }
  }
  t.diagnostic(`${assertions} named/fleet valid/degenerate view assertions across ${RACES.length} races`);
});

test("invalid, empty, zero, prestart, finished and missing cases expose honest witnesses", () => {
  const race = generateRace(RACES[0].seed);
  const primary = race.boats[0].id;
  const rival = race.boats[1].id;
  const invalid = compareRange(race, {
    primaryBoatId: primary,
    reference: { kind: "boat", boatId: primary },
    range: { from: 2, to: 8 },
  });
  const empty = compareRange(race, {
    primaryBoatId: primary,
    reference: { kind: "fleet-median", boatIds: [] },
    range: { from: 2, to: 8 },
  });
  const zero = comparison(race, { from: 8, to: 8 });
  const prestart = comparison(race, { from: race.tMin, to: -0.25 });
  const finished = comparison(race, { from: race.tMax - 2, to: race.tMax });
  const missingRace = structuredClone(race);
  missingRace.progress[rival] = [];
  const missing = comparison(missingRace, { from: 2, to: 8 });

  assert.equal(invalid.status, "invalid-request");
  assert.match(comparisonViewModel(race, invalid).witness, /cannot be its own named rival/);
  assert.equal(empty.status, "invalid-request");
  assert.match(comparisonViewModel(race, empty).witness, /cannot be empty/);
  assert.equal(zero.status, "zero-duration");
  assert.match(comparisonViewModel(race, zero).witness, /Zero-duration range/);
  assert.equal(prestart.status, "no-racing-coverage");
  assert.match(comparisonViewModel(race, prestart).witness, /prestart or finished/);
  assert.equal(finished.status, "no-racing-coverage");
  assert.match(comparisonViewModel(race, finished).witness, /prestart or finished/);
  assert.equal(missing.status, "missing-boundary-data");
  assert.match(comparisonViewModel(missingRace, missing).witness, /boundary progress telemetry is missing/);
  assert.match(comparisonViewModel(race, prestart).equation, /unavailable/);
  assert.match(comparisonViewModel(race, zero).maneuverCostWitness, /no counterfactual path/);
});

test("zero-duration boundary witnesses follow available, missing and invalid progress facts", (t) => {
  const cases = [
    { name: "valid", reason: null, mutate() {} },
    {
      name: "empty progress",
      reason: "missing",
      mutate(race, boatId) {
        race.progress[boatId] = [];
      },
    },
    {
      name: "missing progress",
      reason: "missing",
      mutate(race, boatId) {
        delete race.progress[boatId];
      },
    },
    {
      name: "NaN DTF",
      reason: "invalid",
      mutate(race, boatId) {
        for (const sample of race.progress[boatId]) sample.dtf = Number.NaN;
      },
    },
    {
      name: "NaN timestamp",
      reason: "invalid",
      mutate(race, boatId) {
        for (const sample of race.progress[boatId]) sample.t = Number.NaN;
      },
    },
  ];

  let probes = 0;
  for (const meta of RACES) {
    for (const testCase of cases) {
      for (const referenceKind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        const primaryBoatId = race.boats[0].id;
        const rivalBoatId = race.boats[1].id;
        testCase.mutate(race, referenceKind === "boat" ? rivalBoatId : primaryBoatId);
        const reference = referenceKind === "boat"
          ? { kind: "boat", boatId: rivalBoatId }
          : { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) };
        const result = compareRange(race, {
          primaryBoatId,
          reference,
          range: { from: 8, to: 8 },
        });
        const view = comparisonViewModel(race, result);
        const metrics = new Map(view.metrics.map((metric) => [metric.id, metric.value]));

        if (testCase.reason === null) {
          assert.equal(result.status, "zero-duration", `${meta.id}: ${testCase.name}: ${referenceKind}`);
          assert.notEqual(result.startAdvantageMeters, null);
          assert.equal(result.startAdvantageMeters, result.endAdvantageMeters);
          assert.equal(result.progressGainedMeters, 0);
          assert.match(view.witness, /Boundary advantage and zero gain are shown/);
        } else {
          assert.equal(
            result.status,
            "missing-boundary-data",
            `${meta.id}: ${testCase.name}: ${referenceKind}`,
          );
          assert.equal(result.primary, null);
          assert.equal(result.referenceFacts, null);
          assert.equal(result.startAdvantageMeters, null);
          assert.equal(result.endAdvantageMeters, null);
          assert.equal(result.progressGainedMeters, null);
          assert.equal(metrics.get("start"), MISSING);
          assert.equal(metrics.get("end"), MISSING);
          assert.equal(metrics.get("gain"), MISSING);
          assert.match(view.witness, /Comparison unavailable/);
          assert.match(view.witness, new RegExp(`progress telemetry is ${testCase.reason}`));
          assert.doesNotMatch(view.witness, /facts? (?:are|is) shown/);
        }
        probes++;
      }
    }
  }
  assert.equal(probes, 30);
  t.diagnostic(`${probes} zero-duration boundary witness probes across ${RACES.length} races`);
});

test("extreme boundary arithmetic stays identical in kernel, UI and analyst outputs", (t) => {
  let probes = 0;
  for (const meta of RACES) {
    for (const scenario of [
      { primaryDtf: Number.MAX_VALUE, referenceDtf: -Number.MAX_VALUE, overflow: true },
      { primaryDtf: -Number.MAX_VALUE, referenceDtf: Number.MAX_VALUE, overflow: true },
      { primaryDtf: Number.MAX_VALUE / 2, referenceDtf: -Number.MAX_VALUE / 2, overflow: false },
      { primaryDtf: -Number.MAX_VALUE / 2, referenceDtf: Number.MAX_VALUE / 2, overflow: false },
    ]) {
      for (const referenceKind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        const primaryBoatId = race.boats[0].id;
        const referenceBoatIds = race.boats.slice(1).map((boat) => boat.id);
        for (const sample of race.progress[primaryBoatId]) sample.dtf = scenario.primaryDtf;
        for (const boatId of referenceBoatIds) {
          for (const sample of race.progress[boatId]) sample.dtf = scenario.referenceDtf;
        }
        const reference = referenceKind === "boat"
          ? { kind: "boat", boatId: referenceBoatIds[0] }
          : { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) };
        const request = { primaryBoatId, reference, range: { from: 8, to: 8 } };
        const canonical = compareRange(race, request);
        const view = comparisonViewModel(race, canonical);
        const metrics = new Map(view.metrics.map((metric) => [metric.id, metric.value]));
        const analyst = compareRangeForAnalyst(race, request);

        if (scenario.overflow) {
          assert.equal(canonical.boundaryFactsStatus, "invalid-arithmetic");
          assert.equal(canonical.startAdvantageMeters, null);
          assert.equal(canonical.endAdvantageMeters, null);
          assert.equal(canonical.progressGainedMeters, null);
          assert.equal(metrics.get("start"), MISSING);
          assert.equal(metrics.get("end"), MISSING);
          assert.equal(metrics.get("gain"), MISSING);
          assert.match(view.witness, /Boundary facts are unavailable/);
          assert.match(view.witness, /derived boundary arithmetic is invalid/);
          assert.doesNotMatch(view.witness, /facts? (?:are|is) shown/);
        } else {
          const expected = scenario.referenceDtf - scenario.primaryDtf;
          assert.ok(Number.isFinite(expected));
          assert.equal(canonical.boundaryFactsStatus, "available");
          assert.equal(canonical.startAdvantageMeters, expected);
          assert.equal(canonical.endAdvantageMeters, expected);
          assert.equal(canonical.progressGainedMeters, 0);
          assert.equal(metrics.get("start"), signedMeters(expected));
          assert.equal(metrics.get("end"), signedMeters(expected));
          assert.equal(metrics.get("gain"), signedMeters(0));
          assert.match(view.witness, /Boundary advantage and zero gain are shown/);
        }
        assert.doesNotMatch(JSON.stringify(view), /Infinity|NaN/);
        assert.ok(!("error" in analyst));
        assert.deepEqual(analyst.comparison, canonical);
        assert.equal(
          analyst.aAheadByMetersAtStart,
          canonical.startAdvantageMeters === null ? null : Math.round(canonical.startAdvantageMeters),
        );
        assert.equal(
          analyst.aAheadByMetersAtEnd,
          canonical.endAdvantageMeters === null ? null : Math.round(canonical.endAdvantageMeters),
        );
        assert.equal(analyst.equation.observedGainMeters, canonical.progressGainedMeters);
        const toolText = runTool(race, "compare_boats", {
          a: primaryBoatId,
          referenceKind,
          b: referenceKind === "boat" ? referenceBoatIds[0] : null,
          cohortBoatIds: referenceKind === "fleet-median" ? race.boats.map((boat) => boat.id) : [],
          t0: 8,
          t1: 8,
        });
        assert.doesNotMatch(toolText, /Infinity|NaN/);
        assert.deepEqual(JSON.parse(toolText).comparison, canonical);
        probes++;
      }
    }
  }
  assert.equal(probes, 24);
  t.diagnostic(`${probes} extreme boundary agreement probes across ${RACES.length} races`);
});

test("analyst comparison is an exact compareRange adapter for all races, references and range statuses", async (t) => {
  let assertions = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const primary = race.boats[0].id;
    const references = [
      { kind: "boat", boatId: race.boats[1].id },
      { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    ];
    for (const reference of references) {
      for (const range of [
        { from: 5.125, to: 20.875 },
        { from: 8, to: 8 },
        { from: race.tMin, to: -0.25 },
      ]) {
        const request = { primaryBoatId: primary, reference, range };
        const canonical = compareRange(race, request);
        const direct = compareRangeForAnalyst(race, request);
        assert.ok(!("error" in direct));
        assert.deepEqual(direct.comparison, canonical);
        assert.deepEqual(direct.equation, {
          observedGainMeters: canonical.progressGainedMeters,
          straightMadeGoodDeltaMeters: canonical.straightDeltaMeters,
          maneuverWindowMadeGoodDeltaMeters: canonical.maneuverWindowDeltaMeters,
          residualMeters: canonical.residualMeters,
        });
        const json = JSON.parse(runTool(race, "compare_boats", {
          a: primary,
          referenceKind: reference.kind,
          b: reference.kind === "boat" ? reference.boatId : null,
          cohortBoatIds: reference.kind === "fleet-median" ? reference.boatIds : [],
          t0: range.from,
          t1: range.to,
        }));
        assert.deepEqual(json.comparison, canonical);
        assert.deepEqual(json.equation, direct.equation);
        assert.deepEqual(json.comparison.reference.requestedCohortIds, canonical.reference.requestedCohortIds);
        assert.deepEqual(json.comparison.reference.eligibleCohortIds, canonical.reference.eligibleCohortIds);
        for (const maneuver of json.comparison.primary.maneuvers) {
          assert.equal(maneuver.costMeters, null);
          assert.equal(maneuver.costSeconds, null);
        }
        assertions += 7;
      }
    }
  }

  const race = generateRace(RACES[0].seed);
  const primary = race.boats[0];
  const rival = race.boats[1];
  const range = { from: 5.125, to: 20.875 };
  const canonical = comparison(race, range);
  const adapted = compareBoats(race, primary.id, rival.id, range.from, range.to);
  assert.ok(!("error" in adapted));
  assert.deepEqual(Object.keys(adapted), [
    "fromClock",
    "toClock",
    "a",
    "b",
    "aAheadByMetersAtStart",
    "aAheadByMetersAtEnd",
    "comparison",
    "equation",
  ]);
  assert.deepEqual(Object.keys(adapted.a), [
    "boatId",
    "sail",
    "avgSogKnots",
    "avgToMarkKnots",
    "avgVmgKnots",
    "distanceSailedMeters",
  ]);
  assert.equal(adapted.a.avgSogKnots, (canonical.primary.meanSogMps * 3600 / 1852).toFixed(1));
  assert.equal(adapted.a.avgToMarkKnots, (canonical.primary.meanVmgMps * 3600 / 1852).toFixed(1));
  assert.equal(adapted.a.avgVmgKnots, null);
  assert.equal(adapted.b.avgVmgKnots, null);
  assert.equal(adapted.a.distanceSailedMeters, Math.round(canonical.primary.sailedDistanceMeters));
  assert.equal(adapted.aAheadByMetersAtStart, Math.round(canonical.startAdvantageMeters));
  assert.equal(adapted.aAheadByMetersAtEnd, Math.round(canonical.endAdvantageMeters));

  const tools = await readFile(
    new URL("../src/lib/layline/analyst/tools.ts", import.meta.url),
    "utf8",
  );
  assert.match(tools, /const result = compareRange\(race,/);
  assert.doesNotMatch(tools, /race\.fixes\[boat\.id\]\.filter\(/);
  const tool = ANALYST_TOOLS.find((entry) => entry.name === "compare_boats");
  assert.deepEqual(tool.input_schema.required, [
    "a",
    "referenceKind",
    "b",
    "cohortBoatIds",
    "t0",
    "t1",
  ]);
  assert.match(tool.description, /Positive advantage means the selected boat is ahead/);
  t.diagnostic(`${assertions} exact analyst/canonical equalities across all shipped races`);
});

test("stable point-rail geometry caps first and measured paint at two visible rows", async () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ id: `point-${index}`, at: index * 0.01 }));
  const window = { from: 0, to: 1, span: 1 };
  const first = packTimelinePoints(items, window, 0, 0);
  const measured = packTimelinePoints([...items].reverse(), window, 288, 48);
  assert.equal(first.rowCount, measured.rowCount);
  assert.deepEqual(
    new Map(first.items.map((item) => [item.item.id, item.row])),
    new Map(measured.items.map((item) => [item.item.id, item.row])),
  );
  assert.ok(first.rowCount <= items.length);
  assert.equal(TIMELINE_POINT_ROW_LIMIT, 2);

  const timeline = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );
  assert.match(timeline, /"--point-reserved-rows": TIMELINE_POINT_ROW_LIMIT/);
  assert.match(css, /min-height:\s*calc\(var\(--point-reserved-rows, 2\) \* var\(--point-row-pitch\)\)/);
  assert.match(css, /max-height:\s*calc\(var\(--point-reserved-rows, 2\) \* var\(--point-row-pitch\)\)/);
  assert.match(css, /overflow-y:\s*auto/);
});

test("semantic, phone, reduced-motion and fallback integration contracts stay present", async () => {
  const panel = await readFile(
    new URL("../src/components/layline/hud/ComparisonPanel.tsx", import.meta.url),
    "utf8",
  );
  const timeline = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const app = await readFile(
    new URL("../src/components/layline/LaylineApp.tsx", import.meta.url),
    "utf8",
  );
  const store = await readFile(
    new URL("../src/components/layline/store.ts", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );

  assert.match(panel, /<section[\s\S]*aria-labelledby=/);
  assert.match(panel, /<select[\s\S]*Fleet median, fixed full fleet/);
  assert.match(panel, /Set IN/);
  assert.match(panel, /Set OUT/);
  assert.match(panel, /analysisEvidenceTarget/);
  assert.match(panel, /view\.referenceLabel/);
  assert.match(panel, /view\.referenceMembershipLabel/);
  assert.match(panel, /view\.signConvention/);
  assert.doesNotMatch(panel, /replay\.pause\(\)/);
  assert.match(timeline, /data-analysis-range=/);
  assert.match(timeline, /aria-label="Timeline focus window"/);
  assert.match(app, /live \|\| comparison/);
  assert.match(app, /comparison \? <ComparisonPanel/);
  assert.match(store, /transitionAnalysisOwner/);
  assert.doesNotMatch(store, /setAnalysis:[^]*?seek\(/);

  const phone = css.split("@media (max-width: 900px) {")[1]
    ?.split("@media (max-width: 560px) {")[0] ?? "";
  assert.match(phone, /\.comparisonMetrics\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.comparisonRangeActions \.rangeButton,[\s\S]*?min-height:\s*40px/);
  assert.match(phone, /\.comparisonRail\s*\{[^}]*height:\s*40px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*transition-duration:\s*1ms/);
  assert.doesNotMatch(
    css,
    /@media \(prefers-reduced-motion: reduce\)[^]*?\.(?:comparisonPanel|comparisonRail|selectedRangeHighlight)[^}]*display:\s*none/,
  );
});
