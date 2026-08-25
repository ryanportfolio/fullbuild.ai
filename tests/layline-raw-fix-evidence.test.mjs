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
  RAW_FIX_EVIDENCE_SPAN,
  createReplayRawFixEvidenceModel,
  sampleReplayRawFixEvidence,
} = await import("../src/lib/layline/analysis-layers.ts");
const { telemetryTruthAt, truthFixWindow } = await import("../src/lib/layline/interpolate.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

function snapshot(model) {
  return {
    kind: model.kind,
    startTime: model.startTime,
    endTime: model.endTime,
    count: model.count,
    boatCount: model.boatCount,
    truncated: model.truncated,
    fixes: model.slots
      .filter((slot) => slot.fix !== null)
      .map((slot) => ({
        slot: slot.slot,
        boatId: slot.boatId,
        boatIndex: slot.boatIndex,
        fixIndex: slot.fixIndex,
        bracket: slot.bracket,
        t: slot.fix.t,
        x: slot.fix.x,
        y: slot.fix.y,
      })),
  };
}

function blankTruth() {
  return {
    t: 0,
    beforeIndex: -1,
    afterIndex: -1,
    before: null,
    after: null,
    u: 0,
    raw: null,
    reconstructed: null,
  };
}

test("raw-fix evidence content is identical across renderer replay lenses and all visibility states", (t) => {
  assert.equal(typeof createReplayRawFixEvidenceModel, "function");
  assert.equal(typeof sampleReplayRawFixEvidence, "function");
  assert.equal(RAW_FIX_EVIDENCE_SPAN, 20);

  let states = 0;
  let rendererComparisons = 0;
  let lensComparisons = 0;
  for (const spec of RACES) {
    const race = generateRace(spec.seed);
    const followId = race.boats[2].id;
    for (const rawFixesLayerOn of [false, true]) {
      for (const truthMode of [false, true]) {
        let expected = null;
        for (const replayMode of ["raw", "smooth"]) {
          const threeDimensional = createReplayRawFixEvidenceModel(race);
          sampleReplayRawFixEvidence(
            race,
            20,
            followId,
            rawFixesLayerOn,
            truthMode,
            threeDimensional,
          );
          const twoDimensional = createReplayRawFixEvidenceModel(race);
          sampleReplayRawFixEvidence(
            race,
            20,
            followId,
            { "raw-fixes": rawFixesLayerOn },
            truthMode,
            twoDimensional,
          );
          const actual = snapshot(threeDimensional);
          assert.deepEqual(
            snapshot(twoDimensional),
            actual,
            `${spec.seed} renderer content diverged in ${replayMode} mode`,
          );
          rendererComparisons++;
          if (expected === null) expected = actual;
          else {
            assert.deepEqual(actual, expected, `${spec.seed} changed content in ${replayMode} mode`);
            lensComparisons++;
          }

          const expectedKind = truthMode
            ? "truth-witness"
            : rawFixesLayerOn
              ? "fleet-window"
              : "none";
          assert.equal(actual.kind, expectedKind);
          states++;
        }
      }
    }
  }
  assert.equal(states, 24);
  assert.equal(rendererComparisons, 24);
  assert.equal(lensComparisons, 12);
  t.diagnostic(
    `${states} race/lens/layer/truth states, ${rendererComparisons} renderer comparisons, ${lensComparisons} lens comparisons`,
  );
});

test("fleet raw layer selects every finite measured fix in the inclusive 20-second window", (t) => {
  let fixesChecked = 0;
  for (const spec of RACES) {
    const race = generateRace(spec.seed);
    const model = createReplayRawFixEvidenceModel(race);
    sampleReplayRawFixEvidence(race, 20, race.boats[0].id, true, false, model);
    const actual = snapshot(model);

    assert.equal(actual.kind, "fleet-window");
    assert.equal(actual.startTime, 0);
    assert.equal(actual.endTime, 20);
    assert.equal(actual.boatCount, race.boats.length);
    assert.equal(actual.count, 486);
    assert.equal(actual.truncated, false);
    assert.deepEqual(new Set(actual.fixes.map((fix) => fix.boatId)), new Set(race.boats.map((boat) => boat.id)));

    for (const boat of race.boats) {
      const expected = race.fixes[boat.id]
        .map((fix, fixIndex) => ({ fix, fixIndex }))
        .filter(({ fix }) =>
          Number.isFinite(fix.t)
          && Number.isFinite(fix.x)
          && Number.isFinite(fix.y)
          && fix.t >= 0
          && fix.t <= 20);
      const selected = actual.fixes.filter((fix) => fix.boatId === boat.id);
      assert.equal(selected.length, expected.length);
      assert.deepEqual(selected.map((fix) => fix.fixIndex), expected.map((entry) => entry.fixIndex));
      fixesChecked += selected.length;
    }
  }
  assert.equal(fixesChecked, 1_458);
  t.diagnostic(`${fixesChecked} all-fleet measured fixes`);
});

test("truth mode selects the followed boat's existing nine-fix witness regardless of layer", (t) => {
  let witnesses = 0;
  for (const spec of RACES) {
    const race = generateRace(spec.seed);
    const followId = race.boats[4].id;
    const reading = telemetryTruthAt(race, followId, 20, blankTruth());
    const expected = truthFixWindow(race.fixes[followId].length, reading.beforeIndex);

    for (const rawFixesLayerOn of [false, true]) {
      const model = createReplayRawFixEvidenceModel(race);
      sampleReplayRawFixEvidence(race, 20, followId, rawFixesLayerOn, true, model);
      const actual = snapshot(model);
      assert.equal(actual.kind, "truth-witness");
      assert.equal(actual.count, 9);
      assert.equal(actual.boatCount, 1);
      assert.equal(actual.truncated, false);
      assert.deepEqual(new Set(actual.fixes.map((fix) => fix.boatId)), new Set([followId]));
      assert.deepEqual(
        actual.fixes.map((fix) => fix.fixIndex),
        Array.from({ length: expected.count }, (_, offset) => expected.start + offset),
      );
      assert.equal(
        actual.fixes.filter((fix) => fix.bracket).length,
        new Set([reading.beforeIndex, reading.afterIndex]).size,
      );
      witnesses++;
    }
  }
  assert.equal(witnesses, 6);
  t.diagnostic(`${witnesses} selected-boat truth witnesses`);
});

test("fleet window clamps to race start and filters nonfinite samples without leaking stale slots", () => {
  const race = structuredClone(generateRace(RACES[0].seed));
  const followId = race.boats[0].id;
  const model = createReplayRawFixEvidenceModel(race);

  sampleReplayRawFixEvidence(race, 5, followId, true, false, model);
  assert.equal(model.kind, "fleet-window");
  assert.equal(model.startTime, race.tMin);
  assert.equal(model.endTime, 5);
  assert.equal(model.count, 366);

  const inside = race.fixes[followId].findIndex((fix) => fix.t === 0);
  race.fixes[followId][inside].x = Number.NaN;
  race.fixes[race.boats[1].id][inside].y = Number.POSITIVE_INFINITY;
  race.fixes[race.boats[2].id][inside].t = Number.NEGATIVE_INFINITY;
  sampleReplayRawFixEvidence(race, 5, followId, true, false, model);
  assert.equal(model.count, 363);
  assert.ok(model.slots.slice(0, model.count).every((slot) =>
    slot.fix === null
    || [slot.fix.t, slot.fix.x, slot.fix.y].every(Number.isFinite)));

  sampleReplayRawFixEvidence(race, 5, followId, false, false, model);
  assert.equal(model.kind, "none");
  assert.equal(model.count, 0);
  assert.equal(model.boatCount, 0);
  assert.ok(model.slots.every((slot) => slot.fix === null));
});

test("truth witness filters invalid coordinates and missing follow authority honestly", () => {
  const race = structuredClone(generateRace(RACES[1].seed));
  const followId = race.boats[1].id;
  const reading = telemetryTruthAt(race, followId, 20, blankTruth());
  race.fixes[followId][reading.beforeIndex].y = Number.NaN;
  const model = createReplayRawFixEvidenceModel(race);

  sampleReplayRawFixEvidence(race, 20, followId, false, true, model);
  assert.equal(model.kind, "truth-witness");
  assert.equal(model.count, 8);
  assert.equal(model.boatCount, 1);
  assert.ok(model.slots.filter((slot) => slot.fix !== null).every((slot) => slot.boatId === followId));

  sampleReplayRawFixEvidence(race, 20, "missing", true, true, model);
  assert.equal(model.kind, "truth-witness");
  assert.equal(model.count, 0);
  assert.equal(model.boatCount, 0);
  assert.ok(model.slots.every((slot) => slot.fix === null));

  sampleReplayRawFixEvidence(race, Number.NaN, followId, true, false, model);
  assert.equal(model.kind, "none");
  assert.equal(model.count, 0);
});
