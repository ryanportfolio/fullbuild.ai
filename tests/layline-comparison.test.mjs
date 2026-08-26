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

const { compareRange, dtfAt, integrateTrackRange, normalizeAnalysisRange } = await import(
  "../src/lib/layline/comparison.ts"
);
const { createCurrentFieldSpec } = await import("../src/lib/layline/current.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

function boat(id) {
  return { id, nation: id.toUpperCase(), sail: id.toUpperCase(), name: id, hue: "#000000" };
}

function syntheticRace() {
  const ids = ["a", "b", "c", "d"];
  const fixes = {};
  const progress = {};
  for (let boatIndex = 0; boatIndex < ids.length; boatIndex++) {
    const id = ids[boatIndex];
    fixes[id] = [];
    for (let t = -2; t <= 20; t++) {
      const beat = t < 10;
      let twa = beat ? 40 : 140;
      if (id === "a") {
        if (t >= 5 && t < 9) twa = -40;
        else if (t >= 9 && t < 10) twa = 40;
      }
      const speed = 1 + boatIndex * 0.1;
      fixes[id].push({
        t,
        x: 1 + boatIndex,
        y: beat ? t : 20 - t,
        waterX: 0,
        waterY: beat ? speed : -speed,
        currentX: 0,
        currentY: 0,
        hdg: beat ? 0 : 180,
        heel: 0,
        twa,
        kite: beat ? 0 : 1,
      });
    }
    progress[id] = [];
    for (let t = -2; t <= 20; t += 2) {
      const scale = 1 - boatIndex * 0.05;
      progress[id].push({
        t,
        leg: t < 0 ? "prestart" : t < 10 ? "beat" : t < 20 ? "run" : "finished",
        dtf: 30 + boatIndex * 2 - scale * t,
        rank: boatIndex + 1,
        gapMeters: boatIndex * 2,
        gapSeconds: boatIndex,
      });
    }
  }
  const course = {
    startPin: { x: -5, y: 0 },
    startBoat: { x: 5, y: 0 },
    windward: { x: 0, y: 12 },
    zoneRadius: 2,
  };
  return {
    seed: 1,
    tMin: -2,
    tMax: 20,
    course,
    environment: { current: createCurrentFieldSpec(1, course) },
    wind: [],
    boats: ids.map(boat),
    fixes,
    progress,
    events: [
      { kind: "gun", t: 0 },
      ...ids.map((boatId, index) => ({
        kind: "rounding",
        t: 10 + index / 1_000_000,
        boatId,
      })),
      ...ids.map((boatId, index) => ({
        kind: "finish",
        t: 20 - (ids.length - index - 1) / 1_000_000,
        boatId,
        rank: index + 1,
      })),
    ],
    results: ids.map((boatId, index) => ({ boatId, rank: index + 1, elapsed: 20 })),
  };
}

function curvedSyntheticRace() {
  const race = syntheticRace();
  for (let boatIndex = 0; boatIndex < race.boats.length; boatIndex++) {
    const boatId = race.boats[boatIndex].id;
    for (const fix of race.fixes[boatId]) {
      const dx = 0.16 * fix.t + boatIndex * 0.03;
      const dy = 1 + 0.06 * fix.t - boatIndex * 0.01;
      fix.x = boatIndex * 3 + 0.08 * fix.t ** 2 + boatIndex * 0.03 * fix.t;
      fix.y = fix.t + 0.03 * fix.t ** 2 - boatIndex * 0.01 * fix.t;
      fix.waterX = dx;
      fix.waterY = dy;
      fix.currentX = 0;
      fix.currentY = 0;
      fix.hdg = (Math.atan2(dx, dy) * 180) / Math.PI;
      fix.twa = fix.t < 10 ? 40 : 140;
    }
  }
  return race;
}

function named(range = { from: 0, to: 10 }) {
  return { primaryBoatId: "a", reference: { kind: "boat", boatId: "b" }, range };
}

function closure(comparison) {
  const excluded = comparison.coverage.excludedByReasonMicros;
  assert.equal(
    comparison.coverage.coverageMicros +
      excluded.prestartOrFinished +
      excluded.missingBracket +
      excluded.invalidSample,
    comparison.coverage.durationMicros,
  );
  let cursor = comparison.range.fromMicros;
  for (const bin of comparison.coverage.bins) {
    assert.equal(bin.fromMicros, cursor);
    assert.ok(bin.toMicros > bin.fromMicros);
    cursor = bin.toMicros;
  }
  assert.equal(cursor, comparison.range.toMicros);
}

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("range normalization reverses, clamps, and rounds once to integer microseconds", () => {
  const race = syntheticRace();
  assert.deepEqual(normalizeAnalysisRange(race, 40, -4), {
    from: -2,
    to: 20,
    fromMicros: -2_000_000,
    toMicros: 20_000_000,
    durationMicros: 22_000_000,
  });
  assert.deepEqual(normalizeAnalysisRange(race, 1.00000049, 1.00000151), {
    from: 1,
    to: 1.000002,
    fromMicros: 1_000_000,
    toMicros: 1_000_002,
    durationMicros: 2,
  });
  assert.throws(() => normalizeAnalysisRange(race, Number.NaN, 1), RangeError);
});

test("DTF boundaries interpolate rather than hold standings samples", () => {
  const race = syntheticRace();
  assert.equal(dtfAt(race, "a", 2), 28);
  assert.equal(dtfAt(race, "a", 2.5), 27.5);
  assert.equal(dtfAt(race, "a", -3), null);
  assert.equal(dtfAt(race, "missing", 2), null);
});

test("track integration retains partial boundary intervals exactly", () => {
  const facts = integrateTrackRange(syntheticRace(), "a", { from: 0.25, to: 3.75 });
  assert.equal(facts.status, "ok");
  close(facts.sailedDistanceMeters, 3.5);
  close(facts.meanSogMps, 1);
  close(facts.meanVmgMps, 1);
  assert.equal(facts.vmgCoverageMicros, 3_500_000);
});

test("named comparison exposes signed boundary advantage and progress gained", () => {
  const result = compareRange(syntheticRace(), named({ from: 2, to: 8 }));
  assert.equal(result.status, "ok");
  close(result.startAdvantageMeters, 2.1);
  close(result.endAdvantageMeters, 2.4);
  close(result.progressGainedMeters, 0.3);
  close(result.progressGainedMeters, result.endAdvantageMeters - result.startAdvantageMeters);
  close(result.referenceFacts.progressMeters, 5.7);
  close(result.primary.progressMeters, 6);
  close(result.primary.sailedDistanceMeters, 6);
  closure(result);
});

test("coverage crosses every leg transition without overlapping bins", () => {
  const result = compareRange(syntheticRace(), named({ from: 8.5, to: 11.5 }));
  assert.equal(result.status, "ok");
  assert.equal(result.coverage.coverageMicros, 3_000_000);
  assert.ok(result.primary.meanVmgMps > 0);
  close(result.primary.sailedDistanceMeters, 3);
  close(
    result.primary.straightMadeGoodMeters + result.primary.maneuverWindowMadeGoodMeters,
    result.primary.meanVmgMps * result.coverage.coverageSeconds,
  );
  closure(result);
});

test("a rival's asynchronous fix cannot subdivide the primary track integral", () => {
  const baseRace = syntheticRace();
  baseRace.fixes.a.find((fix) => fix.t === 3).x = 3;
  const asynchronousRace = structuredClone(baseRace);
  asynchronousRace.fixes.b.push({
    ...asynchronousRace.fixes.b.find((fix) => fix.t === 2),
    t: 2.5,
    y: 2.5,
  });
  asynchronousRace.fixes.b.sort((left, right) => left.t - right.t);
  const base = compareRange(baseRace, named({ from: 2, to: 4 }));
  const asynchronous = compareRange(asynchronousRace, named({ from: 2, to: 4 }));
  close(asynchronous.primary.sailedDistanceMeters, base.primary.sailedDistanceMeters);
});

test("overlapping detected maneuver windows form one additive mask", () => {
  const result = compareRange(syntheticRace(), named({ from: 0, to: 14 }));
  assert.equal(result.primary.maneuverCount, 2);
  assert.deepEqual(
    result.primary.maneuvers.map((maneuver) => maneuver.t),
    [4.5, 8.5],
  );
  assert.ok(result.primary.maneuvers.every((maneuver) => maneuver.costMeters === null));
  assert.ok(result.primary.maneuvers.every((maneuver) => Number.isFinite(maneuver.lossMps)));
  close(
    result.primary.straightMadeGoodMeters + result.primary.maneuverWindowMadeGoodMeters,
    result.primary.meanVmgMps * result.coverage.coverageSeconds,
  );
  close(
    result.progressGainedMeters,
    result.straightDeltaMeters + result.maneuverWindowDeltaMeters + result.residualMeters,
  );
});

test("fleet median uses a fixed canonical cohort and even median", () => {
  const race = syntheticRace();
  const result = compareRange(race, {
    primaryBoatId: "a",
    reference: { kind: "fleet-median", boatIds: ["d", "b", "a", "c"] },
    range: { from: 2, to: 8 },
  });
  assert.deepEqual(result.reference.requestedCohortIds, ["a", "b", "c", "d"]);
  assert.deepEqual(result.reference.eligibleCohortIds, ["a", "b", "c", "d"]);
  close(result.referenceFacts.startDtfMeters, (30.1 + 32.2) / 2);
  close(result.referenceFacts.endDtfMeters, (24.4 + 26.8) / 2);
  close(result.referenceFacts.maneuverCount, 0);
  closure(result);
});

test("fleet request order and duplicate IDs cannot change the answer", () => {
  const race = syntheticRace();
  const left = compareRange(race, {
    primaryBoatId: "a",
    reference: { kind: "fleet-median", boatIds: ["d", "b", "a", "c", "a"] },
    range: { from: 1.25, to: 15.75 },
  });
  const right = compareRange(race, {
    primaryBoatId: "a",
    reference: { kind: "fleet-median", boatIds: ["c", "a", "d", "b"] },
    range: { from: 1.25, to: 15.75 },
  });
  assert.deepEqual(left, right);
});

test("unknown fleet IDs are removed once and reported without poisoning coverage", () => {
  const result = compareRange(syntheticRace(), {
    primaryBoatId: "a",
    reference: { kind: "fleet-median", boatIds: ["ghost", "a", "b"] },
    range: { from: 2, to: 8 },
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.reference.ineligibleCohortIds, ["ghost"]);
  assert.deepEqual(result.reference.eligibleCohortIds, ["a", "b"]);
  assert.equal(result.coverage.excludedByReasonMicros.missingBracket, 0);
  closure(result);
});

test("same boat, invalid IDs, empty cohorts, and non-finite ranges are typed invalids", () => {
  const race = syntheticRace();
  const requests = [
    { primaryBoatId: "a", reference: { kind: "boat", boatId: "a" }, range: { from: 0, to: 1 } },
    { primaryBoatId: "ghost", reference: { kind: "boat", boatId: "a" }, range: { from: 0, to: 1 } },
    { primaryBoatId: "a", reference: { kind: "boat", boatId: "ghost" }, range: { from: 0, to: 1 } },
    { primaryBoatId: "a", reference: { kind: "fleet-median", boatIds: [] }, range: { from: 0, to: 1 } },
    { primaryBoatId: "a", reference: { kind: "boat", boatId: "b" }, range: { from: 0, to: Infinity } },
  ];
  for (const request of requests) {
    const result = compareRange(race, request);
    assert.equal(result.status, "invalid-request");
    assert.ok(result.invalidReason.length > 0);
  }
});

test("missing brackets are disjoint from racing and invalid-sample exclusions", () => {
  const race = syntheticRace();
  race.fixes.a = race.fixes.a.filter((fix) => fix.t >= 1);
  const result = compareRange(race, named({ from: 0, to: 2 }));
  const track = integrateTrackRange(race, "a", { from: 0, to: 2 });
  assert.equal(result.status, "ok");
  assert.equal(result.coverage.excludedByReasonMicros.missingBracket, 1_000_000);
  assert.equal(result.coverage.excludedByReasonMicros.invalidSample, 0);
  assert.equal(result.coverage.coverageMicros, 1_000_000);
  assert.equal(result.primary.groundFactsStatus, "ok");
  close(result.primary.sailedDistanceMeters, 1);
  close(result.primary.meanVmgMps, 1);
  assert.equal(track.status, "missing-bracket");
  assert.equal(track.sailedDistanceMeters, null);
  assert.equal(track.meanVmgMps, null);
  closure(result);
});

test("missing progress at a range boundary returns DTF-unavailable without inventing gain", () => {
  const race = syntheticRace();
  race.progress.a = race.progress.a.filter((sample) => sample.t >= 2);
  const result = compareRange(race, named({ from: 0, to: 4 }));
  assert.equal(result.status, "missing-boundary-data");
  assert.equal(result.primary.startDtfMeters, null);
  assert.equal(result.progressGainedMeters, null);
  assert.equal(result.coverage.excludedByReasonMicros.missingBracket, 2_000_000);
  closure(result);
});

test("non-finite telemetry fails preflight before range facts", () => {
  const race = syntheticRace();
  race.fixes.a.find((fix) => fix.t === 4).waterX = Number.NaN;
  const result = compareRange(race, named({ from: 3, to: 5 }));
  assert.equal(result.status, "missing-boundary-data");
  assert.equal(result.boundaryFactsStatus, "invalid-sample");
  assert.equal(result.primary, null);
  assert.equal(result.referenceFacts, null);
  assert.equal(result.coverage.durationMicros, 0);
  closure(result);
});

test("a zero-length mark vector is invalid telemetry, not zero VMG", () => {
  const race = syntheticRace();
  Object.assign(race.fixes.a.find((fix) => fix.t === 4), race.course.windward);
  const result = compareRange(race, named({ from: 4, to: 4.5 }));
  assert.equal(result.status, "no-racing-coverage");
  assert.equal(result.coverage.excludedByReasonMicros.invalidSample, 500_000);
  assert.equal(result.primary.meanVmgMps, null);
  closure(result);
});

test("zero-duration comparison preserves boundary equality and null rates", () => {
  const result = compareRange(syntheticRace(), named({ from: 6, to: 6 }));
  assert.equal(result.status, "zero-duration");
  assert.equal(result.progressGainedMeters, 0);
  assert.equal(result.startAdvantageMeters, result.endAdvantageMeters);
  assert.equal(result.primary.meanSogMps, null);
  assert.equal(result.residualMeters, null);
  closure(result);
});

test("prestart, finished, and mixed ranges close with precedence", () => {
  const race = syntheticRace();
  const prestart = compareRange(race, named({ from: -2, to: 0 }));
  assert.equal(prestart.status, "no-racing-coverage");
  assert.equal(prestart.coverage.excludedByReasonMicros.prestartOrFinished, 2_000_000);
  closure(prestart);

  const finishedRace = syntheticRace();
  finishedRace.tMax = 22;
  for (const id of ["a", "b", "c", "d"]) {
    finishedRace.fixes[id].push({ ...finishedRace.fixes[id].at(-1), t: 22 });
    finishedRace.progress[id].push({ ...finishedRace.progress[id].at(-1), t: 22 });
  }
  const finished = compareRange(finishedRace, named({ from: 20, to: 22 }));
  assert.equal(finished.status, "no-racing-coverage");
  assert.equal(finished.coverage.excludedByReasonMicros.prestartOrFinished, 2_000_000);
  closure(finished);

  const mixed = compareRange(race, named({ from: -1, to: 1 }));
  assert.equal(mixed.coverage.excludedByReasonMicros.prestartOrFinished, 1_000_000);
  assert.equal(mixed.coverage.coverageMicros, 1_000_000);
  closure(mixed);
});

test("whole-range fleets report exact component eligibility when feeds end before tMax", () => {
  let probes = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const result = compareRange(race, {
      primaryBoatId: race.boats[0].id,
      reference: { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
      range: { from: race.tMin, to: race.tMax },
    });
    const expected = {
      "long-beach": { status: "insufficient-fleet-coverage", eligible: ["aus"] },
      "kestrel-sound": { status: "missing-boundary-data", eligible: ["usa", "jpn"] },
      "sable-reach": { status: "insufficient-fleet-coverage", eligible: ["jpn"] },
    }[meta.id];
    assert.equal(result.status, expected.status, `${meta.id}: ${result.status}`);
    assert.deepEqual(result.reference.requestedCohortIds, race.boats.map((boat) => boat.id));
    assert.deepEqual(result.reference.eligibleCohortIds, expected.eligible, `${meta.id}: eligible cohort`);
    assert.ok(!result.reference.eligibleCohortIds.includes(result.primaryBoatId));
    closure(result);
    probes++;
  }
  assert.equal(probes, 3);
});

test("seeded named and fleet equations close and repeat bit-for-bit", () => {
  let probes = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const finish = Math.min(...race.results.map((result) => result.elapsed));
    const range = { from: 0.125, to: finish - 0.125 };
    for (const reference of [
      { kind: "boat", boatId: race.boats[1].id },
      { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    ]) {
      const request = { primaryBoatId: race.boats[0].id, reference, range };
      const first = compareRange(race, request);
      const second = compareRange(race, request);
      assert.equal(first.status, "ok", `${meta.id} ${reference.kind}`);
      assert.deepEqual(first, second);
      close(
        first.progressGainedMeters,
        first.straightDeltaMeters + first.maneuverWindowDeltaMeters + first.residualMeters,
        1e-9,
      );
      closure(first);
      probes++;
    }
  }
  assert.equal(probes, 6);
});

test("curved telemetry ground integrals are additive across arbitrary request splits", () => {
  const race = curvedSyntheticRace();
  const from = 0.125;
  const to = 7.875;
  const wholeTrack = integrateTrackRange(race, "a", { from, to });
  const whole = compareRange(race, named({ from, to }));
  for (const split of [0.125001, 0.333333, 1, 3.333333, 7.874999]) {
    const leftTrack = integrateTrackRange(race, "a", { from, to: split });
    const rightTrack = integrateTrackRange(race, "a", { from: split, to });
    close(
      wholeTrack.sailedDistanceMeters,
      leftTrack.sailedDistanceMeters + rightTrack.sailedDistanceMeters,
      1e-12,
    );

    const left = compareRange(race, named({ from, to: split }));
    const right = compareRange(race, named({ from: split, to }));
    close(
      whole.primary.sailedDistanceMeters,
      left.primary.sailedDistanceMeters + right.primary.sailedDistanceMeters,
      1e-12,
    );
    close(
      whole.primary.meanVmgMps * whole.coverage.coverageSeconds,
      left.primary.meanVmgMps * left.coverage.coverageSeconds +
        right.primary.meanVmgMps * right.coverage.coverageSeconds,
      1e-12,
    );
    assert.equal(
      whole.coverage.coverageMicros,
      left.coverage.coverageMicros + right.coverage.coverageMicros,
    );
  }
});

test("TWA-only maneuver changes cannot alter total ground facts", () => {
  const baselineRace = curvedSyntheticRace();
  const maneuverRace = structuredClone(baselineRace);
  for (const fix of maneuverRace.fixes.a) {
    if (fix.t >= 2 && fix.t < 6) fix.twa = -40;
    else if (fix.t >= 6 && fix.t < 10) fix.twa = 40;
  }
  const request = named({ from: 0.125, to: 9.875 });
  const baseline = compareRange(baselineRace, request);
  const changed = compareRange(maneuverRace, request);
  assert.notEqual(changed.primary.maneuverCount, baseline.primary.maneuverCount);
  close(changed.primary.sailedDistanceMeters, baseline.primary.sailedDistanceMeters, 1e-12);
  close(changed.primary.meanSogMps, baseline.primary.meanSogMps, 1e-12);
  close(changed.primary.meanVmgMps, baseline.primary.meanVmgMps, 1e-12);
  for (const result of [baseline, changed]) {
    close(
      result.primary.straightMadeGoodMeters + result.primary.maneuverWindowMadeGoodMeters,
      result.primary.meanVmgMps * result.coverage.coverageSeconds,
      1e-12,
    );
    close(
      result.progressGainedMeters,
      result.straightDeltaMeters + result.maneuverWindowDeltaMeters + result.residualMeters,
      1e-12,
    );
  }
});

test("empty, missing, and invalid telemetry expose null ground facts", () => {
  for (const { mutate, trackStatus } of [
    {
      mutate(race) {
        race.fixes.a = [];
      },
      trackStatus: "missing-bracket",
    },
    {
      mutate(race) {
        delete race.fixes.a;
      },
      trackStatus: "missing-bracket",
    },
    {
      mutate(race) {
        for (const fix of race.fixes.a) fix.waterX = Number.NaN;
      },
      trackStatus: "invalid-sample",
    },
  ]) {
    const race = curvedSyntheticRace();
    mutate(race);
    const result = compareRange(race, named({ from: 1, to: 4 }));
    const track = integrateTrackRange(race, "a", { from: 1, to: 4 });
    assert.equal(result.coverage.coverageMicros, 0);
    assert.equal(result.status, "missing-boundary-data");
    assert.equal(
      result.boundaryFactsStatus,
      trackStatus === "missing-bracket" ? "missing-bracket" : "invalid-sample",
    );
    assert.equal(result.primary, null);
    assert.equal(result.referenceFacts, null);
    assert.equal(result.coverage.durationMicros, 0);
    assert.equal(result.straightDeltaMeters, null);
    assert.equal(result.maneuverWindowDeltaMeters, null);
    assert.equal(result.residualMeters, null);
    assert.equal(track.status, trackStatus);
    assert.equal(track.sailedDistanceMeters, null);
    assert.equal(track.meanVmgMps, null);
    closure(result);
  }

  const missingProgressRace = curvedSyntheticRace();
  delete missingProgressRace.progress.a;
  const missingProgress = compareRange(missingProgressRace, named({ from: 1, to: 4 }));
  assert.equal(missingProgress.status, "missing-boundary-data");
  assert.equal(missingProgress.boundaryFactsStatus, "missing-bracket");
  assert.equal(missingProgress.coverage.coverageMicros, 0);
  assert.equal(missingProgress.coverage.durationMicros, 0);
  assert.equal(missingProgress.primary, null);
  assert.equal(missingProgress.referenceFacts, null);
  assert.equal(missingProgress.straightDeltaMeters, null);
  assert.equal(missingProgress.maneuverWindowDeltaMeters, null);
  assert.equal(missingProgress.residualMeters, null);
  closure(missingProgress);
});

test("all seeded races classify missing and invalid fix-progress telemetry consistently", () => {
  const cases = [
    {
      name: "empty progress",
      expectedReason: "missingBracket",
      expectedTrackStatus: "missing-bracket",
      mutate(race, boatId) {
        race.progress[boatId] = [];
      },
    },
    {
      name: "missing progress boat",
      expectedReason: "missingBracket",
      expectedTrackStatus: "missing-bracket",
      mutate(race, boatId) {
        delete race.progress[boatId];
      },
    },
    {
      name: "non-finite progress",
      expectedReason: "invalidSample",
      expectedTrackStatus: "invalid-sample",
      mutate(race, boatId) {
        for (const sample of race.progress[boatId]) sample.dtf = Number.NaN;
      },
    },
    {
      name: "empty fixes",
      expectedReason: "missingBracket",
      expectedTrackStatus: "missing-bracket",
      mutate(race, boatId) {
        race.fixes[boatId] = [];
      },
    },
    {
      name: "missing fixes boat",
      expectedReason: "missingBracket",
      expectedTrackStatus: "missing-bracket",
      mutate(race, boatId) {
        delete race.fixes[boatId];
      },
    },
    {
      name: "non-finite fixes",
      expectedReason: "invalidSample",
      expectedTrackStatus: "invalid-sample",
      mutate(race, boatId) {
        for (const fix of race.fixes[boatId]) fix.waterX = Number.NaN;
      },
    },
  ];

  let trackProbes = 0;
  let comparisonProbes = 0;
  for (const meta of RACES) {
    for (const testCase of cases) {
      const race = generateRace(meta.seed);
      const primaryBoatId = race.boats[0].id;
      const referenceBoatId = race.boats[1].id;
      const finish = Math.min(...race.results.map((result) => result.elapsed));
      const range = { from: 0.125, to: Math.min(1.125, finish - 0.125) };
      testCase.mutate(race, primaryBoatId);

      const track = integrateTrackRange(race, primaryBoatId, range);
      assert.equal(track.status, testCase.expectedTrackStatus, `${meta.id}: ${testCase.name}: track`);
      assert.equal(track.sailedDistanceMeters, null);
      assert.equal(track.meanSogMps, null);
      assert.equal(track.meanVmgMps, null);
      assert.equal(track.vmgCoverageMicros, 0);
      trackProbes++;

      for (const reference of [
        { kind: "boat", boatId: referenceBoatId },
        { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
      ]) {
        const result = compareRange(race, { primaryBoatId, reference, range });
        assert.equal(result.coverage.coverageMicros, 0);
        assert.equal(
          result.coverage.excludedByReasonMicros[testCase.expectedReason],
          result.range.durationMicros,
          `${meta.id}: ${testCase.name}: ${reference.kind}: coverage reason`,
        );
        for (const boatFacts of result.boats) {
          assert.equal(boatFacts.groundFactsStatus, "no-valid-coverage");
          assert.equal(boatFacts.groundFactsCoverageMicros, 0);
          assert.equal(boatFacts.sailedDistanceMeters, null);
          assert.equal(boatFacts.meanSogMps, null);
          assert.equal(boatFacts.meanVmgMps, null);
          assert.equal(boatFacts.straightMadeGoodMeters, null);
          assert.equal(boatFacts.maneuverWindowMadeGoodMeters, null);
        }
        assert.ok(
          result.referenceFacts === null || result.referenceFacts.sailedDistanceMeters === null,
        );
        assert.equal(result.straightDeltaMeters, null);
        assert.equal(result.maneuverWindowDeltaMeters, null);
        assert.equal(result.residualMeters, null);
        closure(result);
        comparisonProbes++;
      }
    }
  }
  assert.equal(trackProbes, 18);
  assert.equal(comparisonProbes, 36);
});

test("seeded interior microsecond zero ranges are boundary facts without coverage bins", () => {
  let probes = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const primaryBoatId = race.boats[0].id;
    const at = 1.234567;
    for (const reference of [
      { kind: "boat", boatId: race.boats[1].id },
      { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    ]) {
      const result = compareRange(race, {
        primaryBoatId,
        reference,
        range: { from: at, to: at },
      });

      assert.equal(result.status, "zero-duration", `${meta.id}: ${reference.kind}`);
      assert.equal(result.range.durationMicros, 0);
      assert.equal(result.coverage.durationMicros, 0);
      assert.equal(result.coverage.coverageMicros, 0);
      assert.deepEqual(result.coverage.bins, []);
      assert.equal(result.startAdvantageMeters, result.endAdvantageMeters);
      assert.equal(result.progressGainedMeters, 0);
      assert.equal(result.primary?.progressMeters, 0);
      assert.equal(result.primary?.sailedDistanceMeters, null);
      assert.equal(result.primary?.meanSogMps, null);
      assert.equal(result.primary?.meanVmgMps, null);
      assert.equal(result.referenceFacts?.progressMeters, 0);
      assert.equal(result.referenceFacts?.sailedDistanceMeters, null);
      assert.equal(result.referenceFacts?.meanSogMps, null);
      assert.equal(result.referenceFacts?.meanVmgMps, null);
      assert.equal(result.straightDeltaMeters, null);
      assert.equal(result.maneuverWindowDeltaMeters, null);
      assert.equal(result.residualMeters, null);
      closure(result);
      probes++;
    }
  }
  assert.equal(probes, 6);
});

test("finite extreme DTF inputs produce only finite or null boundary and progress facts", (t) => {
  const scenarios = [
    { name: "overflow negative", primaryDtf: Number.MAX_VALUE, referenceDtf: -Number.MAX_VALUE, overflow: true },
    { name: "overflow positive", primaryDtf: -Number.MAX_VALUE, referenceDtf: Number.MAX_VALUE, overflow: true },
    { name: "finite negative boundary", primaryDtf: Number.MAX_VALUE / 2, referenceDtf: -Number.MAX_VALUE / 2, overflow: false },
    { name: "finite positive boundary", primaryDtf: -Number.MAX_VALUE / 2, referenceDtf: Number.MAX_VALUE / 2, overflow: false },
  ];
  let probes = 0;

  for (const meta of RACES) {
    for (const scenario of scenarios) {
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
        const result = compareRange(race, {
          primaryBoatId,
          reference,
          range: { from: 8, to: 8 },
        });
        const exported = [
          result.startAdvantageMeters,
          result.endAdvantageMeters,
          result.progressGainedMeters,
          result.primary?.progressMeters ?? null,
          result.referenceFacts?.startDtfMeters ?? null,
          result.referenceFacts?.endDtfMeters ?? null,
          result.referenceFacts?.progressMeters ?? null,
          ...result.boats.map((boatFacts) => boatFacts.progressMeters),
        ];
        assert.ok(
          exported.every((value) => value === null || Number.isFinite(value)),
          `${meta.id}: ${scenario.name}: ${referenceKind}`,
        );

        if (scenario.overflow) {
          assert.equal(result.startAdvantageMeters, null);
          assert.equal(result.endAdvantageMeters, null);
          assert.equal(result.progressGainedMeters, null);
          assert.equal(result.boundaryFactsStatus, "invalid-arithmetic");
        } else {
          const expected = scenario.referenceDtf - scenario.primaryDtf;
          assert.ok(Number.isFinite(expected));
          assert.equal(result.startAdvantageMeters, expected);
          assert.equal(result.endAdvantageMeters, expected);
          assert.equal(result.progressGainedMeters, 0);
          assert.equal(result.boundaryFactsStatus, "available");
        }
        probes++;
      }
    }
  }

  assert.equal(probes, 24);
  t.diagnostic(`${probes} named/fleet overflow and finite-boundary probes across ${RACES.length} races`);
});

test("overflowed per-boat and fleet progress stays null with an invalid arithmetic witness", (t) => {
  let probes = 0;
  for (const meta of RACES) {
    for (const [startDtf, endDtf] of [
      [Number.MAX_VALUE, -Number.MAX_VALUE],
      [-Number.MAX_VALUE, Number.MAX_VALUE],
    ]) {
      for (const referenceKind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        const primaryBoatId = race.boats[0].id;
        const range = {
          from: Math.max(...race.boats.map((boat) => race.progress[boat.id][0].t)),
          to: Math.min(...race.boats.flatMap((boat) => [
            race.progress[boat.id].at(-1).t,
            race.fixes[boat.id].at(-1).t,
          ])),
        };
        for (const boat of race.boats) {
          const samples = race.progress[boat.id];
          const setBoundary = (at, value) => {
            const after = samples.findIndex((sample) => sample.t >= at);
            assert.ok(after >= 0, `${meta.id} ${boat.id} has no progress bracket at ${at}`);
            samples[after].dtf = value;
            if (samples[after].t !== at) samples[after - 1].dtf = value;
          };
          setBoundary(range.from, startDtf);
          setBoundary(range.to, endDtf);
        }
        const result = compareRange(race, {
          primaryBoatId,
          reference: referenceKind === "boat"
            ? { kind: "boat", boatId: race.boats[1].id }
            : { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
          range,
        });

        assert.equal(result.boundaryFactsStatus, "invalid-arithmetic");
        assert.equal(result.status, "missing-boundary-data");
        assert.equal(result.primary?.progressMeters, null);
        assert.equal(result.referenceFacts?.progressMeters, null);
        assert.ok(result.boats.every((boatFacts) => boatFacts.progressMeters === null));
        for (const value of [
          result.startAdvantageMeters,
          result.endAdvantageMeters,
          result.progressGainedMeters,
        ]) {
          assert.ok(value === null || Number.isFinite(value));
        }
        probes++;
      }
    }
  }
  assert.equal(probes, 12);
  t.diagnostic(`${probes} per-boat/fleet progress overflow probes across ${RACES.length} races`);
});
