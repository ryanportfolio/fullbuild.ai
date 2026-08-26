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

const { compareRange, dtfAt, integrateTrackRange, progressBoundaryStatusAt } = await import(
  "../src/lib/layline/comparison.ts"
);
const { comparisonViewModel } = await import("../src/lib/layline/comparison-view.ts");
const {
  MISSING,
  clock,
  deg,
  fixStamp,
  gap,
  heading,
  knots,
  meters,
  signedMeters,
  signedMetersPerSecond,
} = await import("../src/lib/layline/format.ts");
const { compareBoats, compareRangeForAnalyst, runTool } = await import(
  "../src/lib/layline/analyst/tools.ts"
);
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

function assertFiniteOrNullTree(value, path = "result") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} leaked ${String(value)}`);
    return;
  }
  if (typeof value === "string") {
    assert.doesNotMatch(value, /(?:^|[^a-z])(Infinity|NaN)(?:$|[^a-z])/i, path);
    return;
  }
  if (value === null || value === undefined || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteOrNullTree(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assertFiniteOrNullTree(entry, `${path}.${key}`);
  }
}

function requestFor(race, referenceKind, range = { from: 8.125, to: 9.875 }) {
  return {
    primaryBoatId: race.boats[0].id,
    reference:
      referenceKind === "boat"
        ? { kind: "boat", boatId: race.boats[1].id }
        : { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    range,
  };
}

function toolInput(request) {
  return {
    a: request.primaryBoatId,
    referenceKind: request.reference.kind,
    b: request.reference.kind === "boat" ? request.reference.boatId : null,
    cohortBoatIds:
      request.reference.kind === "fleet-median" ? request.reference.boatIds : [],
    t0: request.range.from,
    t1: request.range.to,
  };
}

function assertAdapterBoundary(race, request) {
  const comparison = compareRange(race, request);
  const view = comparisonViewModel(race, comparison);
  const direct = compareRangeForAnalyst(race, request);
  assert.ok(!("error" in direct));
  const serialized = JSON.parse(runTool(race, "compare_boats", toolInput(request)));
  assert.deepEqual(serialized, direct);
  assert.deepEqual(direct.comparison, comparison);
  assertFiniteOrNullTree(comparison, "comparison");
  assertFiniteOrNullTree(view, "view");
  assertFiniteOrNullTree(direct, "analyst");
  return { comparison, view, direct };
}

function assertInvalidAdapterBoundary(race, request) {
  const comparison = compareRange(race, request);
  const direct = compareRangeForAnalyst(race, request);
  const serialized = JSON.parse(runTool(race, "compare_boats", toolInput(request)));
  assert.deepEqual(serialized, direct);
  assertFiniteOrNullTree(comparison, "comparison");
  assertFiniteOrNullTree(direct, "analyst");
  return { comparison, direct };
}

function shiftRaceTimes(race, offset) {
  race.tMin += offset;
  race.tMax += offset;
  for (const boat of race.boats) {
    for (const fix of race.fixes[boat.id]) fix.t += offset;
    for (const sample of race.progress[boat.id]) sample.t += offset;
  }
  for (const event of race.events) event.t += offset;
}

function assertCoverageClosure(comparison) {
  const excluded = comparison.coverage.excludedByReasonMicros;
  assert.equal(
    comparison.coverage.coverageMicros +
      excluded.prestartOrFinished +
      excluded.missingBracket +
      excluded.invalidSample +
      excluded.invalidArithmetic,
    comparison.coverage.durationMicros,
  );
}

function setConstantProgress(race, boatId, value) {
  for (const sample of race.progress[boatId]) sample.dtf = value;
}

test("every exported Layline numeric formatter rejects non-finite and overflowed rounding", () => {
  const unary = [knots, meters, signedMeters, signedMetersPerSecond, deg, fixStamp, heading, clock];
  for (const formatter of unary) {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      assert.equal(formatter(value), MISSING, `${formatter.name}(${String(value)})`);
    }
    for (const value of [
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MAX_VALUE / 2,
      -Number.MAX_VALUE / 2,
      Number.MAX_VALUE / 1024,
      -Number.MAX_VALUE / 1024,
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      0,
      -0,
    ]) {
      assert.doesNotThrow(() => formatter(value), `${formatter.name}(${value})`);
      assert.doesNotMatch(formatter(value), /Infinity|NaN/, `${formatter.name}(${value})`);
    }
  }

  for (const formatter of [knots, meters, signedMeters, signedMetersPerSecond, fixStamp, heading]) {
    assert.equal(formatter(Number.MAX_VALUE), MISSING, formatter.name);
    assert.equal(formatter(-Number.MAX_VALUE), MISSING, formatter.name);
  }
  for (const value of [Number.NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    assert.equal(gap({ rank: 2, leg: "beat", gapSeconds: value }), MISSING);
  }
  assert.equal(gap({ rank: Infinity, leg: "beat", gapSeconds: 1 }), MISSING);
  assert.equal(knots(-0), "0.0");
  assert.equal(meters(-0), "0.0");
  assert.equal(signedMeters(-0), "+0.0");
  assert.equal(signedMetersPerSecond(-0), "+0.00");
  assert.equal(deg(-0), "0");
  assert.equal(fixStamp(-0), "T+00:00.00");
  assert.equal(heading(-0), "0.0°");
  assert.equal(clock(-0), "0:00");
  assert.equal(gap({ rank: 2, leg: "beat", gapSeconds: -0 }), "+0.0 s");
});

test("selected and reference progress extremes stay finite or null across all races", (t) => {
  const values = [
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Number.MAX_VALUE / 2,
    -Number.MAX_VALUE / 2,
    Number.MAX_VALUE / 1024,
    -Number.MAX_VALUE / 1024,
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
  ];
  let probes = 0;
  for (const meta of RACES) {
    for (const value of values) {
      for (const corrupt of ["selected", "reference"])
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          if (corrupt === "selected") {
            setConstantProgress(race, race.boats[0].id, value);
          } else {
            for (const boat of race.boats.slice(1)) setConstantProgress(race, boat.id, value);
          }
          const result = assertAdapterBoundary(race, requestFor(race, referenceKind));
          assertCoverageClosure(result.comparison);
          probes++;
        }
    }
  }
  assert.equal(probes, 96);
  t.diagnostic(`${probes} selected/reference progress boundary probes`);
});

test("nonzero progress interpolation overflow is typed invalid arithmetic", () => {
  for (const meta of RACES) {
    for (const referenceKind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      for (const boat of race.boats) {
        for (let index = 0; index < race.progress[boat.id].length; index++) {
          race.progress[boat.id][index].dtf = index % 2 === 0
            ? Number.MAX_VALUE
            : -Number.MAX_VALUE;
        }
      }
      const { comparison, view } = assertAdapterBoundary(
        race,
        requestFor(race, referenceKind, { from: 8.125, to: 8.375 }),
      );
      assert.equal(comparison.boundaryFactsStatus, "invalid-arithmetic");
      assert.equal(comparison.status, "missing-boundary-data");
      assert.equal(comparison.startAdvantageMeters, null);
      assert.equal(comparison.progressGainedMeters, null);
      assert.match(view.witness, /arithmetic is invalid/);
      assert.ok(comparison.coverage.excludedByReasonMicros.invalidArithmetic > 0);
      assertCoverageClosure(comparison);
    }
  }
});

test("public track integration returns typed invalids for non-finite range inputs", () => {
  const race = generateRace(RACES[0].seed);
  for (const range of [
    { from: Number.NaN, to: 8 },
    { from: 8, to: Infinity },
    { from: -Infinity, to: 8 },
  ]) {
    const facts = integrateTrackRange(race, race.boats[0].id, range);
    assert.equal(facts.status, "invalid-request");
    assert.equal(facts.sailedDistanceMeters, null);
    assert.equal(facts.meanSogMps, null);
    assert.equal(facts.meanVmgMps, null);
    assertFiniteOrNullTree(facts, "track");
  }
});

test("race bounds are rejected before unsafe microsecond conversion across every race", (t) => {
  const invalidTimes = [
    Number.NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
  ];
  let probes = 0;
  for (const meta of RACES) {
    for (const field of ["tMin", "tMax"])
      for (const value of invalidTimes)
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          race[field] = value;
          const request = requestFor(race, referenceKind);
          const { comparison, direct } = assertInvalidAdapterBoundary(race, request);
          assert.equal(comparison.status, "invalid-request");
          assert.equal(comparison.boundaryFactsStatus, "unavailable");
          assert.equal(comparison.primary, null);
          assert.equal(comparison.range.durationMicros, 0);
          assert.ok("error" in direct);
          const track = integrateTrackRange(race, race.boats[0].id, request.range);
          assert.equal(track.status, "invalid-request");
          assertFiniteOrNullTree(track, "track");
          probes++;
        }
  }
  assert.equal(probes, 60);
  t.diagnostic(`${probes} corrupt race-bound probes`);
});

test("request bounds are rejected before clamp, ordering, or unsafe conversion", (t) => {
  const firstUnsafePositive = (Number.MAX_SAFE_INTEGER - 1) / 1_000_000 + 0.000002;
  const invalidTimes = [
    Number.NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    firstUnsafePositive,
    -firstUnsafePositive,
  ];
  let probes = 0;
  for (const meta of RACES) {
    for (const field of ["from", "to"])
      for (const value of invalidTimes)
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          const range = { from: 8.125, to: 9.875, [field]: value };
          const request = requestFor(race, referenceKind, range);
          const { comparison, direct } = assertInvalidAdapterBoundary(race, request);
          assert.equal(comparison.status, "invalid-request");
          assert.equal(comparison.primary, null);
          assert.ok("error" in direct);
          const track = integrateTrackRange(race, race.boats[0].id, range);
          assert.equal(track.status, "invalid-request");
          assertFiniteOrNullTree(track, "track");
          const legacy = compareBoats(
            race,
            race.boats[0].id,
            race.boats[1].id,
            range.from,
            range.to,
          );
          assert.ok("error" in legacy);
          probes++;
        }
  }
  assert.equal(probes, 84);
  t.diagnostic(`${probes} corrupt request-bound probes`);
});

test("fix and progress timestamp attacks stay typed invalid and cannot expose DTF", (t) => {
  const firstUnsafePositive = (Number.MAX_SAFE_INTEGER - 1) / 1_000_000 + 0.000002;
  const invalidTimes = [
    Number.NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    firstUnsafePositive,
    -firstUnsafePositive,
  ];
  let probes = 0;
  for (const meta of RACES) {
    for (const source of ["fixes", "progress"])
      for (const value of invalidTimes)
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          const boatId = race.boats[0].id;
          race[source][boatId][1].t = value;
          const request = requestFor(race, referenceKind);
          const { comparison } = assertInvalidAdapterBoundary(race, request);
          assert.equal(progressBoundaryStatusAt(race, boatId, request.range.from), "invalid-sample");
          assert.equal(dtfAt(race, boatId, request.range.from), null);
          assert.equal(comparison.boundaryFactsStatus, "invalid-sample");
          assert.equal(comparison.primary, null);
          assert.equal(comparison.referenceFacts, null);
          assert.ok(comparison.status !== "ok");
          const track = integrateTrackRange(race, boatId, request.range);
          assert.equal(track.status, "invalid-sample");
          assertFiniteOrNullTree(track, "track");
          probes++;
        }
  }
  assert.equal(probes, 84);
  t.diagnostic(`${probes} corrupt fix/progress timestamp probes`);
});

test("duplicate and out-of-order telemetry timestamps never alias in bracket selection", () => {
  for (const meta of RACES) {
    for (const source of ["fixes", "progress"])
      for (const attack of ["duplicate", "reversed"])
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          const boatId = race.boats[0].id;
          const series = race[source][boatId];
          if (attack === "duplicate") series[2].t = series[1].t;
          else [series[1].t, series[2].t] = [series[2].t, series[1].t];
          const request = requestFor(race, referenceKind);
          const { comparison } = assertInvalidAdapterBoundary(race, request);
          assert.equal(progressBoundaryStatusAt(race, boatId, request.range.from), "invalid-sample");
          assert.equal(dtfAt(race, boatId, request.range.from), null);
          assert.equal(comparison.boundaryFactsStatus, "invalid-sample");
          assert.equal(comparison.primary, null);
          assert.equal(integrateTrackRange(race, boatId, request.range).status, "invalid-sample");
        }
  }
});

test("consumed gun and finish timestamps are invalid coverage metadata, not infinity sentinels", () => {
  for (const meta of RACES) {
    for (const kind of ["gun", "finish"])
      for (const value of [Number.NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE])
        for (const referenceKind of ["boat", "fleet-median"]) {
          const race = generateRace(meta.seed);
          const event = race.events.find(
            (candidate) =>
              candidate.kind === kind &&
              (kind === "gun" || candidate.boatId === race.boats[0].id),
          );
          assert.ok(event);
          event.t = value;
          const request = requestFor(race, referenceKind);
          const { comparison } = assertInvalidAdapterBoundary(race, request);
          assert.ok(comparison.status !== "ok");
          assert.equal(comparison.boundaryFactsStatus, "invalid-sample");
          assert.equal(comparison.primary, null);
          assert.equal(comparison.referenceFacts, null);
          assert.equal(comparison.coverage.coverageMicros, 0);
          assert.equal(comparison.coverage.durationMicros, 0);
          assertCoverageClosure(comparison);
        }
  }
});

test("near-maximum supported race times retain deterministic equations and zero-duration closure", () => {
  const offset = 9_007_198_000;
  for (const meta of RACES) {
    for (const referenceKind of ["boat", "fleet-median"]) {
      const baselineRace = generateRace(meta.seed);
      const shiftedRace = generateRace(meta.seed);
      shiftRaceTimes(shiftedRace, offset);
      const baselineRequest = requestFor(baselineRace, referenceKind, { from: 4.125, to: 16.875 });
      const shiftedRequest = requestFor(shiftedRace, referenceKind, {
        from: offset + 4.125,
        to: offset + 16.875,
      });
      const baseline = compareRange(baselineRace, baselineRequest);
      const shifted = assertAdapterBoundary(shiftedRace, shiftedRequest).comparison;
      assert.equal(shifted.status, baseline.status);
      assert.equal(shifted.coverage.durationMicros, baseline.coverage.durationMicros);
      assert.equal(shifted.coverage.coverageMicros, baseline.coverage.coverageMicros);
      for (const field of [
        "startAdvantageMeters",
        "endAdvantageMeters",
        "progressGainedMeters",
        "sailedDistanceDeltaMeters",
        "groundVmgDeltaMps",
        "straightDeltaMeters",
        "maneuverWindowDeltaMeters",
        "residualMeters",
      ]) {
        assert.ok(
          Math.abs(shifted[field] - baseline[field]) <= 1e-5,
          `${field}: ${shifted[field]} != ${baseline[field]}`,
        );
      }
      assert.ok(
        Math.abs(
          shifted.progressGainedMeters -
            shifted.straightDeltaMeters -
            shifted.maneuverWindowDeltaMeters -
            shifted.residualMeters,
        ) <= 1e-9,
      );
      assertCoverageClosure(shifted);
      const zero = compareRange(shiftedRace, {
        ...shiftedRequest,
        range: { from: offset + 8.125, to: offset + 8.125 },
      });
      assert.equal(zero.status, "zero-duration");
      assert.equal(zero.range.durationMicros, 0);
      assert.equal(zero.coverage.durationMicros, 0);
      assert.equal(zero.coverage.bins.length, 0);
      assertFiniteOrNullTree(zero, "zero");
    }
  }
});

test("coordinate, speed, VMG, maneuver and subnormal paths share one finite boundary", (t) => {
  const scenarios = [
    {
      name: "coordinate interpolation overflow",
      mutate(race, primaryId) {
        race.fixes[primaryId].forEach((fix, index) => {
          fix.x = index % 2 === 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
        });
      },
      status: "invalid",
    },
    {
      name: "positive speed accumulator overflow",
      mutate(race, primaryId) {
        for (const fix of race.fixes[primaryId]) {
          fix.waterX = 0;
          fix.waterY = Number.MAX_VALUE;
          fix.currentX = 0;
          fix.currentY = 0;
          fix.twa = 40;
        }
      },
      status: "invalid",
    },
    {
      name: "negative speed accumulator overflow",
      mutate(race, primaryId) {
        for (const fix of race.fixes[primaryId]) {
          fix.waterX = 0;
          fix.waterY = -Number.MAX_VALUE;
          fix.currentX = 0;
          fix.currentY = 0;
          fix.twa = 40;
        }
      },
      status: "invalid",
    },
    {
      name: "extreme maneuver loss and VMG",
      mutate(race, primaryId) {
        const fixes = race.fixes[primaryId];
        for (const fix of fixes) {
          fix.twa = fix.t < 9 ? 40 : -40;
          fix.waterX = 0;
          fix.waterY = fix.t < 9 ? Number.MAX_VALUE : -Number.MAX_VALUE;
          fix.currentX = 0;
          fix.currentY = 0;
        }
      },
      status: "invalid",
    },
    {
      name: "subnormal speed",
      mutate(race, primaryId) {
        for (const fix of race.fixes[primaryId]) {
          fix.waterX = 0;
          fix.waterY = Number.MIN_VALUE;
          fix.currentX = 0;
          fix.currentY = 0;
          fix.twa = 40;
        }
      },
      status: "finite",
    },
  ];

  let probes = 0;
  for (const meta of RACES) {
    for (const scenario of scenarios) {
      for (const referenceKind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        const primaryId = race.boats[0].id;
        scenario.mutate(race, primaryId);
        const request = requestFor(race, referenceKind, { from: 8, to: 10 });
        const { comparison, view } = assertAdapterBoundary(race, request);
        const track = integrateTrackRange(race, primaryId, request.range);
        assertFiniteOrNullTree(track, "track");
        assertCoverageClosure(comparison);
        if (scenario.status === "invalid") {
          assert.ok(
            ["invalid-arithmetic", "missing-boundary-data"].includes(comparison.status),
            `${meta.id}: ${scenario.name}: ${comparison.status}`,
          );
          assert.ok(
            track.status === "invalid-arithmetic" ||
              comparison.coverage.excludedByReasonMicros.invalidArithmetic > 0,
          );
          assert.match(view.witness, /invalid|unavailable/);
        } else {
          assert.equal(track.status, "ok", `${meta.id}: ${scenario.name}`);
          assert.ok(["ok", "invalid-arithmetic"].includes(comparison.status));
        }
        probes++;
      }
    }
  }
  assert.equal(probes, 30);
  t.diagnostic(`${probes} integration/VMG/maneuver finite-boundary probes`);
});

test("mixed even fleet medians stay finite at both signs and magnitudes", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const values = [
      -Number.MAX_VALUE,
      -Number.MAX_VALUE / 2,
      -Number.MIN_VALUE,
      Number.MIN_VALUE,
      Number.MAX_VALUE / 2,
      Number.MAX_VALUE,
    ];
    race.boats.forEach((boat, index) => {
      setConstantProgress(race, boat.id, values[index]);
    });
    const request = requestFor(race, "fleet-median", { from: 8.125, to: 9.875 });
    const { comparison } = assertAdapterBoundary(race, request);
    assert.equal(comparison.referenceFacts.startDtfMeters, 0);
    assert.equal(comparison.referenceFacts.endDtfMeters, 0);
    assert.equal(comparison.referenceFacts.progressMeters, 0);
    assert.equal(comparison.startAdvantageMeters, Number.MAX_VALUE);
    assert.equal(comparison.progressGainedMeters, 0);
    assertCoverageClosure(comparison);
  }
});

test("attribution residual overflow becomes null and changes the comparison witness", () => {
  for (const meta of RACES) {
    for (const referenceKind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      const primaryId = race.boats[0].id;
      for (const [index, boat] of race.boats.entries()) {
        for (const fix of race.fixes[boat.id]) {
          fix.waterX = 0;
          fix.waterY = index === 0 ? -Number.MAX_VALUE / 2 : Number.MAX_VALUE / 2;
          fix.currentX = 0;
          fix.currentY = 0;
          fix.twa = 40;
        }
        setConstantProgress(race, boat.id, 0);
      }
      for (const sample of race.progress[primaryId]) {
        if (sample.t <= 8) sample.dtf = Number.MAX_VALUE;
        else if (sample.t < 9) sample.dtf = Number.MAX_VALUE * (9 - sample.t);
        else sample.dtf = 0;
      }
      const request = requestFor(race, referenceKind, { from: 8, to: 9 });
      const { comparison, view } = assertAdapterBoundary(race, request);
      assert.equal(comparison.progressGainedMeters, Number.MAX_VALUE);
      assert.ok(Number.isFinite(comparison.straightDeltaMeters));
      assert.equal(comparison.residualMeters, null);
      assert.equal(comparison.status, "invalid-arithmetic");
      assert.match(view.witness, /ground-track arithmetic is invalid/);
      assert.equal(view.equation, null);
      assertCoverageClosure(comparison);
    }
  }
});

test("normal comparisons remain deterministic, additive and equation-closing", () => {
  for (const meta of RACES) {
    for (const referenceKind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      const request = requestFor(race, referenceKind, { from: 4.125, to: 16.875 });
      const first = assertAdapterBoundary(race, request).comparison;
      const second = compareRange(race, request);
      assert.deepEqual(second, first);
      assert.equal(first.status, "ok");
      assert.ok(
        Math.abs(
          first.progressGainedMeters -
            first.straightDeltaMeters -
            first.maneuverWindowDeltaMeters -
            first.residualMeters,
        ) <= 1e-9,
      );
      const split = 10.5;
      const whole = integrateTrackRange(race, request.primaryBoatId, request.range);
      const left = integrateTrackRange(race, request.primaryBoatId, {
        from: request.range.from,
        to: split,
      });
      const right = integrateTrackRange(race, request.primaryBoatId, {
        from: split,
        to: request.range.to,
      });
      assert.ok(
        Math.abs(whole.sailedDistanceMeters - left.sailedDistanceMeters - right.sailedDistanceMeters) <=
          1e-9,
      );
      assertCoverageClosure(first);
    }
  }
});
