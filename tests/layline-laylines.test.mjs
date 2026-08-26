import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { createCurrentFieldSpec } = await import("../src/lib/layline/current.ts");
const {
  INSPECTION_MAX_CANDIDATES_PER_VELOCITY,
  INSPECTION_MAX_STEPS,
  INSPECTION_MAX_TRACES,
  LAYLINE_ARRIVAL_RADIUS_METERS,
  RACE_TRACE_CACHE_MAX_ENTRIES,
  TACTICAL_GUIDANCE_MAX_CANDIDATES,
  TACTICAL_GUIDANCE_TICKS,
  cachedTraceLaylineInspection,
  clearLaylineInspectionCache,
  shouldRefreshTacticalGuidance,
  tacticalLaylineGuidance,
  traceLaylineInspection,
} = await import("../src/lib/layline/laylines.ts");
const { FICTIONAL_ONE_DESIGN_POLAR } = await import("../src/lib/layline/polar.ts");

const COURSE = Object.freeze({
  startPin: Object.freeze({ x: -70, y: 0 }),
  startBoat: Object.freeze({ x: 55, y: 0 }),
  windward: Object.freeze({ x: 3, y: 620 }),
  zoneRadius: 18,
});
const CURRENT_SPEC = createCurrentFieldSpec(20_280_726, COURSE);
const WIND_SPEC = Object.freeze({ kind: "test-uniform-wind-v1", version: 1, tws: 8, twd: 0 });
const FLAT_POLAR = Object.freeze({
  kind: "test-flat-polar-v1",
  version: 1,
  provenance: "test-model",
  twaDegrees: Object.freeze([30, 165]),
  speedFractions: Object.freeze([1, 1]),
  lowTailAngleDegrees: 0,
  lowTailFraction: 1,
  highTailAngleDegrees: 180,
  highTailFraction: 1,
  highTailDropFraction: 0,
});
const LEEWAY_GOLDEN_POLAR = Object.freeze({
  kind: "test-leeway-golden-polar-v1",
  version: 1,
  provenance: "test-model",
  twaDegrees: Object.freeze([12, 13]),
  speedFractions: Object.freeze([1, 0]),
  lowTailAngleDegrees: 0,
  lowTailFraction: 0,
  highTailAngleDegrees: 180,
  highTailFraction: 0,
  highTailDropFraction: 0,
});

function constantWind(_x, _y, _t, out) {
  out.windFromX = 0;
  out.windFromY = 8;
  return out;
}

function noCurrent(_x, _y, _t, out) {
  out.x = 0;
  out.y = 0;
  return out;
}

function makeTrace(overrides = {}) {
  const base = {
    start: { x: 0, y: 0, t: 0, recordedFixIndex: 0 },
    mark: { x: 0, y: 1_000 },
    leg: "beat",
    side: "port",
    pace: 1,
    declaredTwaAbs: 44.5,
    bounds: { minX: -10_000, maxX: 10_000, minY: -10_000, maxY: 10_000 },
    sampleWindField: constantWind,
    sampleCurrentField: noCurrent,
  };
  return {
    ...base,
    ...overrides,
    start: { ...base.start, ...overrides.start },
    mark: { ...base.mark, ...overrides.mark },
    bounds: { ...base.bounds, ...overrides.bounds },
  };
}

function cachedRequest(race, trace, overrides = {}) {
  return {
    race,
    boatId: "nzl",
    windSpec: WIND_SPEC,
    currentSpec: CURRENT_SPEC,
    polarModel: FICTIONAL_ONE_DESIGN_POLAR,
    trace,
    ...overrides,
  };
}

function assertDeeplyFrozenTrace(trace, label) {
  assert.equal(Object.isFrozen(trace), true, `${label}: result`);
  assert.equal(Object.isFrozen(trace.points), true, `${label}: points`);
  assert.equal(trace.points.every(Object.isFrozen), true, `${label}: point`);
  assert.ok(Number.isFinite(trace.steps), `${label}: steps`);
  assert.ok(Number.isFinite(trace.candidateEvaluations), `${label}: candidates`);
  assert.ok(trace.etaSeconds === null || Number.isFinite(trace.etaSeconds), `${label}: eta`);
  assert.ok(trace.closestApproachMeters === null || Number.isFinite(trace.closestApproachMeters), `${label}: distance`);
  assert.ok(trace.closestApproachTime === null || Number.isFinite(trace.closestApproachTime), `${label}: time`);
  for (const point of trace.points) assert.ok([point.x, point.y, point.t].every(Number.isFinite), `${label}: point values`);
}

function assertZeroPointInvalidTrace(trace, label) {
  assert.deepEqual(trace, {
    status: "invalid",
    points: [],
    etaSeconds: null,
    closestApproachMeters: null,
    closestApproachTime: null,
    steps: 0,
    candidateEvaluations: 0,
  }, label);
  assertDeeplyFrozenTrace(trace, label);
}

test("tactical cadence has one startup boundary and exact per-second candidate ceilings", () => {
  assert.equal(TACTICAL_GUIDANCE_TICKS, 10);
  assert.equal(TACTICAL_GUIDANCE_MAX_CANDIDATES, 2);
  const boundaries = [];
  for (let tick = 0; tick < 20; tick++) {
    if (shouldRefreshTacticalGuidance(tick, true)) boundaries.push(tick);
  }
  assert.deepEqual(boundaries, [0, 10]);
  assert.equal(boundaries.length * TACTICAL_GUIDANCE_MAX_CANDIDATES, 4);
  assert.equal(boundaries.length * TACTICAL_GUIDANCE_MAX_CANDIDATES * 6, 24);
  assert.equal(shouldRefreshTacticalGuidance(10, false), false);
  assert.equal(shouldRefreshTacticalGuidance(-10, true), false);
  assert.equal(shouldRefreshTacticalGuidance(0.5, true), false);
});

test("tactical guidance evaluates exactly two current-aware sides through shared leeway", () => {
  const result = tacticalLaylineGuidance({
    x: 0, y: 0, t: 0, markX: 20, markY: 600,
    twd: 359, tws: 8, currentX: 0.2, currentY: -0.05,
    twaAbs: 44, pace: 0.94,
  });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((side) => side.side), ["port", "starboard"]);
  for (const side of result) {
    assert.ok(Number.isFinite(side.heading));
    assert.ok(Number.isFinite(side.ctw));
    assert.ok(Number.isFinite(side.groundX));
    assert.ok(Number.isFinite(side.groundY));
    assert.ok(Number.isFinite(side.alongTrackMeters));
    assert.ok(Number.isFinite(side.signedCrossTrackMeters));
  }
  for (const bad of [
    { pace: -1 }, { tws: -1 }, { twaAbs: 181 }, { x: Infinity },
  ]) {
    assert.throws(() => tacticalLaylineGuidance({
      x: 0, y: 0, t: 0, markX: 0, markY: 100,
      twd: 0, tws: 8, currentX: 0, currentY: 0, twaAbs: 44, pace: 1,
      ...bad,
    }), RangeError);
  }
});

test("declared beat/run boundaries validate before fields and preserve initial terminal rules", () => {
  for (const [leg, angle, expected] of [
    ["beat", 0, "arrived"], ["beat", -0, "arrived"], ["beat", 90, "arrived"],
    ["run", 90.00000000000001, "arrived"], ["run", 180, "arrived"],
    ["beat", 90.00000000000001, "invalid"], ["beat", -5e-324, "invalid"],
    ["run", 90, "invalid"], ["run", 180.00000000000003, "invalid"],
    ["beat", NaN, "invalid"], ["run", Infinity, "invalid"],
  ]) {
    let fieldCalls = 0;
    const trace = traceLaylineInspection(makeTrace({
      leg,
      declaredTwaAbs: angle,
      mark: { x: 0, y: LAYLINE_ARRIVAL_RADIUS_METERS },
      sampleWindField() { fieldCalls++; throw new Error("field must not run"); },
      sampleCurrentField() { fieldCalls++; throw new Error("field must not run"); },
    }));
    assert.equal(trace.status, expected, `${leg} ${angle}`);
    assert.equal(fieldCalls, 0);
    assert.equal(trace.points.length, expected === "invalid" ? 0 : 1);
    if (expected === "arrived") assert.equal(trace.etaSeconds, 0);
  }

  const boundary = traceLaylineInspection(makeTrace({
    start: { x: 11 },
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    sampleWindField() { throw new Error("field must not run"); },
    sampleCurrentField() { throw new Error("field must not run"); },
  }));
  assert.equal(boundary.status, "boundary");
  assert.equal(boundary.points.length, 1);
});

test("inspection horizon uses midpoint resampling and exact one-trace/two-trace candidate ceilings", () => {
  assert.equal(INSPECTION_MAX_TRACES, 2);
  const totals = [];
  for (const side of ["port", "starboard"]) {
    const windCalls = [];
    const currentCalls = [];
    const trace = traceLaylineInspection(makeTrace({
      side,
      mark: { x: 0, y: 1_000_000_000 },
      bounds: { minX: -1e12, maxX: 1e12, minY: -1e12, maxY: 1e12 },
      sampleWindField(x, y, t, out) { windCalls.push([x, y, t]); return constantWind(x, y, t, out); },
      sampleCurrentField(x, y, t, out) { currentCalls.push([x, y, t]); return noCurrent(x, y, t, out); },
    }));
    assert.equal(trace.status, "horizon");
    assert.equal(trace.steps, INSPECTION_MAX_STEPS);
    assert.equal(trace.points.length, INSPECTION_MAX_STEPS + 1);
    assert.equal(trace.candidateEvaluations, INSPECTION_MAX_STEPS * 2 * INSPECTION_MAX_CANDIDATES_PER_VELOCITY);
    assert.equal(windCalls.length, INSPECTION_MAX_STEPS * 2);
    assert.equal(currentCalls.length, INSPECTION_MAX_STEPS * 2);
    assert.deepEqual(windCalls[0], [0, 0, 0]);
    assert.equal(windCalls[1][2], 0.125);
    assert.notDeepEqual(windCalls[1].slice(0, 2), windCalls[0].slice(0, 2));
    totals.push(trace.candidateEvaluations);
  }
  assert.equal(totals.reduce((sum, value) => sum + value, 0), 132_480);
});

test("inspection clips deterministic segment arrivals and boundary exits", () => {
  const arrival = traceLaylineInspection(makeTrace({ mark: { x: 0, y: 5 } }));
  assert.equal(arrival.status, "arrived");
  assert.ok(arrival.steps > 0);
  assert.ok(arrival.etaSeconds > 0);
  assert.ok(Math.abs(arrival.points.at(-1).x) <= 5);
  assert.ok(Math.hypot(arrival.points.at(-1).x, arrival.points.at(-1).y - 5) <= LAYLINE_ARRIVAL_RADIUS_METERS + 1e-12);

  const boundary = traceLaylineInspection(makeTrace({
    mark: { x: 0, y: 1_000 },
    bounds: { minX: -0.1, maxX: 0.1, minY: -0.1, maxY: 0.1 },
  }));
  assert.equal(boundary.status, "boundary");
  assert.ok(boundary.steps > 0);
  const point = boundary.points.at(-1);
  assert.ok(
    Math.abs(Math.abs(point.x) - 0.1) <= 1e-12 ||
    Math.abs(Math.abs(point.y) - 0.1) <= 1e-12,
  );
});

test("inspection permanently covers stalled and nonterminal run-leg traces on both sides", () => {
  const stalled = traceLaylineInspection(makeTrace({
    mark: { x: 0, y: 1_000_000_000 },
    bounds: { minX: -1e12, maxX: 1e12, minY: -1e12, maxY: 1e12 },
    polarModel: FLAT_POLAR,
    sampleCurrentField(_x, _y, _t, out) {
      out.x = 0;
      out.y = -8;
      return out;
    },
  }));
  assert.deepEqual(stalled, {
    status: "stalled",
    points: [{ x: 0, y: 0, t: 0 }],
    etaSeconds: null,
    closestApproachMeters: 1_000_000_000,
    closestApproachTime: 0,
    steps: 0,
    candidateEvaluations: 92,
  });

  const runTraces = ["port", "starboard"].map((side) => traceLaylineInspection(makeTrace({
    leg: "run",
    side,
    declaredTwaAbs: 120,
    mark: { x: 0, y: -1_000_000_000 },
    bounds: { minX: -1e12, maxX: 1e12, minY: -1e12, maxY: 1e12 },
    polarModel: FLAT_POLAR,
  })));
  for (const [index, trace] of runTraces.entries()) {
    assert.equal(trace.status, "horizon", index === 0 ? "port" : "starboard");
    assert.equal(trace.steps, 360);
    assert.equal(trace.candidateEvaluations, 64_800);
    assert.deepEqual(trace.points.at(-1), { x: 0, y: -720, t: 90 });
  }
  assert.deepEqual(runTraces[0], runTraces[1]);
});

test("inspection has fixed shared-leeway and bounds-corner-tie goldens", () => {
  const degrees = Math.PI / 180;
  const leeway = traceLaylineInspection(makeTrace({
    declaredTwaAbs: 12,
    mark: { x: 1_000_000_000 * Math.sin(16 * degrees), y: 1_000_000_000 * Math.cos(16 * degrees) },
    bounds: { minX: -1e12, maxX: 1e12, minY: -1e12, maxY: 1e12 },
    polarModel: LEEWAY_GOLDEN_POLAR,
    sampleWindField(_x, _y, _t, out) {
      out.windFromX = 0;
      out.windFromY = 1;
      return out;
    },
  }));
  assert.equal(leeway.status, "horizon");
  assert.equal(leeway.candidateEvaluations, 65_520);
  assert.deepEqual(leeway.points.at(-1), { x: 24.8073620235298, y: 86.5135526344495, t: 90 });
  const noLeewayEndpoint = { x: 18.71205217359834, y: 88.03328406604251 };
  assert.notDeepEqual(
    { x: leeway.points.at(-1).x, y: leeway.points.at(-1).y },
    noLeewayEndpoint,
  );

  const cornerX = 2 * Math.sin(47 * degrees);
  const cornerY = 2 * Math.cos(47 * degrees);
  const corner = traceLaylineInspection(makeTrace({
    declaredTwaAbs: 45,
    mark: { x: 1_000_000_000 * Math.sin(47 * degrees), y: 1_000_000_000 * Math.cos(47 * degrees) },
    bounds: { minX: -10, maxX: cornerX, minY: -10, maxY: cornerY },
    polarModel: FLAT_POLAR,
  }));
  assert.equal(corner.status, "boundary");
  assert.equal(corner.steps, 2);
  assert.equal(corner.candidateEvaluations, 364);
  assert.deepEqual(corner.points.at(-1), { x: cornerX, y: cornerY, t: 0.25 });
  assert.deepEqual(corner.points.at(-2), corner.points.at(-1));
});

test("inspection returns finite invalid evidence for extreme derived wind and non-finite callbacks", () => {
  for (const [label, windFromX, windFromY, currentX, currentY] of [
    ["same-sign finite overflow", Number.MAX_VALUE, Number.MAX_VALUE, 0, 0],
    ["adjacent extreme signs", Number.MAX_VALUE, -Number.MAX_VALUE, 0, 0],
    ["non-finite wind callback", NaN, 8, 0, 0],
    ["non-finite current callback", 0, 8, Infinity, 0],
  ]) {
    let windCalls = 0;
    let currentCalls = 0;
    const request = makeTrace({
      sampleWindField() {
        windCalls++;
        return { windFromX, windFromY };
      },
      sampleCurrentField() {
        currentCalls++;
        return { x: currentX, y: currentY };
      },
    });
    let trace;
    assert.doesNotThrow(() => { trace = traceLaylineInspection(request); }, label);
    assert.equal(trace.status, "invalid", label);
    assert.deepEqual(trace.points, [{ x: 0, y: 0, t: 0 }], label);
    assert.equal(windCalls, 1, label);
    assert.equal(currentCalls, 1, label);
    assert.equal(trace.candidateEvaluations, 0, label);
    assert.equal(trace.steps, 0, label);
    assert.equal(trace.closestApproachMeters, 1_000, label);
    assert.equal(trace.closestApproachTime, 0, label);
    for (const point of trace.points) {
      assert.ok([point.x, point.y, point.t].every(Number.isFinite), label);
    }
  }
});

test("direct and cached trace boundaries reject hostile callback return values without throwing", () => {
  const throwingField = (field, values) => {
    const result = { ...values };
    Object.defineProperty(result, field, {
      enumerable: true,
      get() { throw new Error(`hostile ${field}`); },
    });
    return result;
  };
  const primitives = [null, undefined, 0, "hostile", true, 1n, Symbol("hostile")];
  const cases = [
    ...primitives.map((value, index) => [`wind primitive ${index}`, () => value, noCurrent]),
    ...primitives.map((value, index) => [`current primitive ${index}`, constantWind, () => value]),
    ["windFromX getter", () => throwingField("windFromX", { windFromY: 8 }), noCurrent],
    ["windFromY getter", () => throwingField("windFromY", { windFromX: 0 }), noCurrent],
    ["current x getter", constantWind, () => throwingField("x", { y: 0 })],
    ["current y getter", constantWind, () => throwingField("y", { x: 0 })],
  ];

  for (const [index, [label, sampleWindField, sampleCurrentField]] of cases.entries()) {
    const request = makeTrace({ sampleWindField, sampleCurrentField });
    let direct;
    assert.doesNotThrow(() => { direct = traceLaylineInspection(request); }, `direct ${label}`);
    assert.deepEqual(direct, {
      status: "invalid",
      points: [{ x: 0, y: 0, t: 0 }],
      etaSeconds: null,
      closestApproachMeters: 1_000,
      closestApproachTime: 0,
      steps: 0,
      candidateEvaluations: 0,
    }, `direct ${label}`);
    assertDeeplyFrozenTrace(direct, `direct ${label}`);

    const race = Object.freeze({ id: `hostile-callback-${index}` });
    let cached;
    assert.doesNotThrow(
      () => { cached = cachedTraceLaylineInspection(cachedRequest(race, request)); },
      `cached ${label}`,
    );
    assert.deepEqual(cached, direct, `cached ${label}`);
    assertDeeplyFrozenTrace(cached, `cached ${label}`);
  }
});

test("cross-current traces change prospectively while identical requests repeat byte-for-byte", () => {
  function crossCurrent(_x, _y, _t, out) {
    out.x = 0.3;
    out.y = -0.1;
    return out;
  }
  const request = makeTrace({
    mark: { x: 0, y: 1_000_000_000 },
    bounds: { minX: -1e12, maxX: 1e12, minY: -1e12, maxY: 1e12 },
  });
  const still = traceLaylineInspection(request);
  const stillAgain = traceLaylineInspection(request);
  const moving = traceLaylineInspection({ ...request, sampleCurrentField: crossCurrent });
  assert.deepEqual(stillAgain, still);
  assert.notDeepEqual(moving.points, still.points);
  assert.equal(moving.status, "horizon");
});

test("cached evidence is deeply immutable so consumer mutation cannot poison a later hit", () => {
  const race = Object.freeze({ id: "mutation-race" });
  const request = cachedRequest(race, makeTrace({ mark: { x: 0, y: 2 } }));
  const first = cachedTraceLaylineInspection(request);
  const baseline = structuredClone(first);

  for (const mutate of [
    () => { first.status = "invalid"; },
    () => { first.points[0].x = 999; },
    () => { first.points.push({ x: 999, y: 999, t: 999 }); },
  ]) {
    try { mutate(); } catch (error) { assert.ok(error instanceof TypeError); }
  }

  const later = cachedTraceLaylineInspection(request);
  assert.deepEqual(later, baseline);
  assert.equal(Object.isFrozen(later), true);
  assert.equal(Object.isFrozen(later.points), true);
  assert.equal(later.points.every(Object.isFrozen), true);
});

test("cache adapter rejects every invalid identity without callbacks and freezes all return graphs", () => {
  const race = Object.freeze({ id: "invalid-identity-race" });
  let fieldCalls = 0;
  const trace = makeTrace({
    mark: { x: 0, y: 100 },
    sampleWindField(x, y, t, out) { fieldCalls++; return constantWind(x, y, t, out); },
    sampleCurrentField(x, y, t, out) { fieldCalls++; return noCurrent(x, y, t, out); },
  });
  const invalidPolar = structuredClone(FICTIONAL_ONE_DESIGN_POLAR);
  invalidPolar.speedFractions[0] = NaN;
  const invalidRequests = [
    ["wind NaN", cachedRequest(race, trace, { windSpec: { ...WIND_SPEC, nested: { value: NaN } } })],
    ["wind Infinity", cachedRequest(race, trace, { windSpec: { ...WIND_SPEC, values: [8, Infinity] } })],
    ["current NaN", cachedRequest(race, trace, { currentSpec: { ...CURRENT_SPEC, phase1Radians: NaN } })],
    ["current Infinity", cachedRequest(race, trace, { currentSpec: { ...CURRENT_SPEC, xBaseMps: -Infinity } })],
    ["polar model", cachedRequest(race, trace, { polarModel: invalidPolar })],
    ["empty boat id", cachedRequest(race, trace, { boatId: "" })],
    ["request geometry", cachedRequest(race, makeTrace({ ...trace, start: { x: Infinity } }))],
  ];

  for (const [label, request] of invalidRequests) {
    const result = cachedTraceLaylineInspection(request);
    assert.deepEqual(result, {
      status: "invalid",
      points: [],
      etaSeconds: null,
      closestApproachMeters: null,
      closestApproachTime: null,
      steps: 0,
      candidateEvaluations: 0,
    }, label);
    assertDeeplyFrozenTrace(result, label);
    assert.throws(() => { result.status = "horizon"; }, TypeError, label);
    assert.throws(() => { result.points.push({ x: 0, y: 0, t: 0 }); }, TypeError, label);
  }
  assert.equal(fieldCalls, 0);

  const valid = cachedTraceLaylineInspection(cachedRequest(race, trace));
  assert.notEqual(valid.status, "invalid");
  assert.ok(fieldCalls > 0);
  assertDeeplyFrozenTrace(valid, "valid miss");
  const callsAfterMiss = fieldCalls;
  assert.equal(cachedTraceLaylineInspection(cachedRequest(race, trace)), valid);
  assert.equal(fieldCalls, callsAfterMiss);
  assertDeeplyFrozenTrace(valid, "valid hit");
});

test("invalid cache identities do not consume an LRU entry", () => {
  const race = Object.freeze({ id: "invalid-lru-race" });
  const anchorRequest = cachedRequest(race, makeTrace({ mark: { x: 0, y: 2 } }));
  const anchor = cachedTraceLaylineInspection(anchorRequest);
  const rejected = cachedRequest(race, makeTrace({ mark: { x: 0, y: 2 } }), {
    windSpec: { ...WIND_SPEC, tws: NaN },
  });
  assert.equal(cachedTraceLaylineInspection(rejected).status, "invalid");
  for (let index = 1; index < RACE_TRACE_CACHE_MAX_ENTRIES; index++) {
    cachedTraceLaylineInspection(cachedRequest(race, makeTrace({
      start: { recordedFixIndex: index },
      mark: { x: 0, y: 2 },
    })));
  }
  assert.equal(cachedTraceLaylineInspection(anchorRequest), anchor);
});

test("cache adapter snapshots stateful race, trace, and polar getters exactly once", () => {
  for (const field of ["race", "trace", "polarModel"]) {
    for (const throwOnRead of [2, 3]) {
      let fieldCalls = 0;
      const trace = makeTrace({
        mark: { x: 0, y: 100 },
        sampleWindField(...args) { fieldCalls++; return constantWind(...args); },
        sampleCurrentField(...args) { fieldCalls++; return noCurrent(...args); },
      });
      const base = cachedRequest(Object.freeze({ id: `${field}-${throwOnRead}` }), trace);
      let reads = 0;
      const request = { ...base };
      Object.defineProperty(request, field, {
        enumerable: true,
        get() {
          reads++;
          if (reads >= throwOnRead) throw new Error(`${field} read ${reads}`);
          return base[field];
        },
      });
      let result;
      assert.doesNotThrow(
        () => { result = cachedTraceLaylineInspection(request); },
        `${field} throw on read ${throwOnRead}`,
      );
      assert.notEqual(result.status, "invalid", `${field} throw on read ${throwOnRead}`);
      assert.equal(reads, 1, `${field} exact reads`);
      assert.ok(fieldCalls > 0, `${field} callbacks`);
      assertDeeplyFrozenTrace(result, `${field} throw on read ${throwOnRead}`);
    }
  }
});

test("hostile cache preflight returns one frozen invalid result without callbacks or LRU pollution", () => {
  const race = Object.freeze({ id: "hostile-preflight-race" });
  let fieldCalls = 0;
  const trace = makeTrace({
    mark: { x: 0, y: 2 },
    sampleWindField(...args) { fieldCalls++; return constantWind(...args); },
    sampleCurrentField(...args) { fieldCalls++; return noCurrent(...args); },
  });
  const anchorRequest = cachedRequest(race, trace);
  const anchor = cachedTraceLaylineInspection(anchorRequest);
  const callsAfterAnchor = fieldCalls;
  const throwingProperty = (name) => Object.defineProperty({}, name, {
    enumerable: true,
    get() { throw new Error(`hostile ${name}`); },
  });
  const hostilePolar = Object.create(FICTIONAL_ONE_DESIGN_POLAR);
  Object.defineProperty(hostilePolar, "twaDegrees", {
    enumerable: true,
    get() { throw new Error("hostile polar angles"); },
  });
  const hostilePolarValue = {
    ...FICTIONAL_ONE_DESIGN_POLAR,
    version: { valueOf() { throw new Error("hostile polar valueOf"); } },
  };
  const requests = [
    cachedRequest(race, trace, { windSpec: { nested: throwingProperty("value") } }),
    cachedRequest(race, trace, { windSpec: throwingProperty("toJSON") }),
    cachedRequest(race, trace, { currentSpec: { nested: throwingProperty("valueOf") } }),
    cachedRequest(race, trace, { windSpec: { toJSON() { throw new Error("hostile toJSON"); } } }),
    cachedRequest(race, trace, { currentSpec: { nested: { valueOf() { throw new Error("hostile valueOf"); } } } }),
    cachedRequest(race, trace, { polarModel: hostilePolar }),
    cachedRequest(race, trace, { polarModel: hostilePolarValue }),
  ];
  const throwingTraceRequest = cachedRequest(race, trace);
  Object.defineProperty(throwingTraceRequest, "trace", {
    enumerable: true,
    get() { throw new Error("hostile trace"); },
  });
  requests.push(throwingTraceRequest);

  let invalidBaseline;
  for (const [index, request] of requests.entries()) {
    let result;
    assert.doesNotThrow(() => { result = cachedTraceLaylineInspection(request); }, `${index}`);
    assertZeroPointInvalidTrace(result, `${index}`);
    if (invalidBaseline === undefined) invalidBaseline = result;
    else assert.equal(result, invalidBaseline, `${index}: one invalid result`);
  }
  assert.equal(fieldCalls, callsAfterAnchor);

  for (let index = 1; index < RACE_TRACE_CACHE_MAX_ENTRIES; index++) {
    cachedTraceLaylineInspection(cachedRequest(race, makeTrace({
      start: { recordedFixIndex: index },
      mark: { x: 0, y: 2 },
    })));
  }
  assert.equal(cachedTraceLaylineInspection(anchorRequest), anchor);

  let windSpecReads = 0;
  const recoveringTrace = makeTrace({
    mark: { x: 0, y: 100 },
    sampleWindField(...args) { fieldCalls++; return constantWind(...args); },
    sampleCurrentField(...args) { fieldCalls++; return noCurrent(...args); },
  });
  const recoveringRequest = cachedRequest(Object.freeze({ id: "recovering-preflight" }), recoveringTrace);
  Object.defineProperty(recoveringRequest, "windSpec", {
    enumerable: true,
    get() {
      windSpecReads++;
      if (windSpecReads === 1) throw new Error("first preflight fails");
      return WIND_SPEC;
    },
  });
  const callsBeforeRecovery = fieldCalls;
  assertZeroPointInvalidTrace(cachedTraceLaylineInspection(recoveringRequest), "recovering first call");
  assert.equal(fieldCalls, callsBeforeRecovery);
  const recovered = cachedTraceLaylineInspection(recoveringRequest);
  assert.notEqual(recovered.status, "invalid");
  assert.ok(fieldCalls > callsBeforeRecovery);
  assert.equal(windSpecReads, 2);
});

test("cache identity, access-order eviction, explicit clear, and race object isolation remain exact", () => {
  const trace = makeTrace({ mark: { x: 0, y: 2 } });
  const race = Object.freeze({ id: "same-id" });
  const firstRequest = cachedRequest(race, trace);
  const first = cachedTraceLaylineInspection(firstRequest);
  assert.equal(cachedTraceLaylineInspection(firstRequest), first);

  const regeneratedRace = Object.freeze({ id: "same-id" });
  assert.notEqual(cachedTraceLaylineInspection(cachedRequest(regeneratedRace, trace)), first);

  for (let index = 1; index <= RACE_TRACE_CACHE_MAX_ENTRIES; index++) {
    cachedTraceLaylineInspection(cachedRequest(race, makeTrace({
      start: { recordedFixIndex: index },
      mark: { x: 0, y: 2 },
    })));
  }
  assert.notEqual(cachedTraceLaylineInspection(firstRequest), first);

  const beforeClear = cachedTraceLaylineInspection(firstRequest);
  clearLaylineInspectionCache(race);
  assert.notEqual(cachedTraceLaylineInspection(firstRequest), beforeClear);
});

test("cache identity covers every request family, sampler, serialized spec, and polar object", () => {
  const race = Object.freeze({ id: "key-race" });
  const trace = makeTrace({ mark: { x: 0, y: 2 } });
  const baseRequest = cachedRequest(race, trace);
  const base = cachedTraceLaylineInspection(baseRequest);
  const changed = [
    { ...baseRequest, boatId: "usa" },
    cachedRequest(race, makeTrace({ start: { recordedFixIndex: 1 }, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ start: { x: 0.25 }, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ start: { t: 0.25 }, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ mark: { x: 0.25, y: 2 } })),
    cachedRequest(race, makeTrace({ leg: "run", declaredTwaAbs: 120, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ side: "starboard", mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ pace: 0.9, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ bounds: { maxX: 9_999 }, mark: { x: 0, y: 2 } })),
    cachedRequest(race, makeTrace({ mark: { x: 0, y: 2 }, sampleWindField: (...args) => constantWind(...args) })),
    cachedRequest(race, makeTrace({ mark: { x: 0, y: 2 }, sampleCurrentField: (...args) => noCurrent(...args) })),
    { ...baseRequest, windSpec: { ...WIND_SPEC, tws: 8.001 } },
    { ...baseRequest, currentSpec: { ...CURRENT_SPEC, phase1Radians: CURRENT_SPEC.phase1Radians + 1e-12 } },
    { ...baseRequest, polarModel: structuredClone(FICTIONAL_ONE_DESIGN_POLAR) },
  ];
  for (const [index, request] of changed.entries()) {
    assert.notEqual(cachedTraceLaylineInspection(request), base, `${index}`);
  }
});

test("runtime enums and all initial derived geometry preflight before points or callbacks", () => {
  const maximum = Number.MAX_VALUE;
  const cases = [
    makeTrace({ leg: "reach", declaredTwaAbs: 120 }),
    makeTrace({ side: "lee", declaredTwaAbs: 44 }),
    makeTrace({
      start: { x: maximum, y: -maximum },
      mark: { x: -maximum, y: maximum },
      bounds: { minX: -maximum, maxX: maximum, minY: -maximum, maxY: maximum },
    }),
    makeTrace({
      start: { x: 0, y: 0 },
      mark: { x: 0, y: 100 },
      bounds: { minX: -maximum, maxX: maximum, minY: -10, maxY: 10 },
    }),
  ];
  for (const [index, value] of cases.entries()) {
    let fieldCalls = 0;
    const request = {
      ...value,
      sampleWindField() { fieldCalls++; return { windFromX: 0, windFromY: 8 }; },
      sampleCurrentField() { fieldCalls++; return { x: 0, y: 0 }; },
    };
    const trace = traceLaylineInspection(request);
    assert.equal(trace.status, "invalid", `${index}`);
    assert.equal(trace.points.length, 0, `${index}`);
    assert.equal(fieldCalls, 0, `${index}`);
  }
});

test("inspection filters the pace-scaled water target and handles negative, tiny, and huge pace honestly", () => {
  function followingCurrent(_x, _y, _t, out) {
    out.x = 0;
    out.y = 0.2;
    return out;
  }
  let negativeCalls = 0;
  const negative = traceLaylineInspection(makeTrace({
    pace: -1,
    sampleWindField() { negativeCalls++; return { windFromX: 0, windFromY: 8 }; },
    sampleCurrentField() { negativeCalls++; return { x: 0, y: 0.2 }; },
  }));
  assert.equal(negative.status, "invalid");
  assert.equal(negative.points.length, 0);
  assert.equal(negativeCalls, 0);

  for (const pace of [0, 0.005, Number.MAX_VALUE]) {
    const trace = traceLaylineInspection(makeTrace({
      pace,
      mark: { x: 0, y: 1_000_000 },
      bounds: { minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9 },
      sampleCurrentField: followingCurrent,
    }));
    assert.equal(trace.status, "invalid", `${pace}`);
    assert.ok(trace.points.length <= 1, `${pace}`);
  }
});
