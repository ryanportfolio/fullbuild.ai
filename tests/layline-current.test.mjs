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

const { CURRENT_FIELD_MAX_SPEED_MPS, createCurrentFieldSpec, sampleSeededCurrentField } =
  await import("../src/lib/layline/current.ts");
const { FIELD_SEED_ALGORITHM, seededUnit } = await import("../src/lib/layline/field-seed.ts");

const COURSE = Object.freeze({
  startPin: Object.freeze({ x: -70, y: 0 }),
  startBoat: Object.freeze({ x: 55, y: 0 }),
  windward: Object.freeze({ x: 3, y: 620 }),
  zoneRadius: 18,
});

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function clamp(value, minimum, maximum) {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function expectedSample(spec, x, y, t) {
  const u = clamp(x / spec.halfWidthMeters, spec.uMin, spec.uMax);
  const v = clamp(y / spec.lengthMeters, spec.vMin, spec.vMax);
  const yLine =
    spec.lineMeanFraction * spec.lengthMeters +
    spec.lineOscillationFraction * spec.lengthMeters *
      Math.sin((2 * Math.PI * t) / spec.linePeriodSeconds + spec.phase1Radians);
  const amount = clamp(
    (y - yLine + spec.transitionHalfWidthFraction * spec.lengthMeters) /
      (2 * spec.transitionHalfWidthFraction * spec.lengthMeters),
    0,
    1,
  );
  const transition = amount * amount * (3 - 2 * amount);
  return {
    x:
      spec.xBaseMps +
      spec.xAcrossCoefficientMps * u +
      spec.xTimeAmplitudeMps * Math.sin((2 * Math.PI * t) / spec.xTimePeriodSeconds + spec.phase1Radians) +
      spec.xShearAmplitudeMps * (2 * transition - 1),
    y:
      spec.yBaseMps +
      spec.yAlongCoefficientMps * (v - spec.yAlongCenter) +
      spec.yTimeAmplitudeMps * Math.cos((2 * Math.PI * t) / spec.yTimePeriodSeconds + spec.phase2Radians),
  };
}

test("labeled seeds use an honest uint32 contract without 2^32 aliases", () => {
  const label = "current.phase-1";
  assert.equal(seededUnit(0, label), seededUnit(0, label));
  assert.equal(seededUnit(-0, label), seededUnit(0, label));
  assert.notEqual(seededUnit(0, label), seededUnit(0, "current.phase-2"));
  assert.notEqual(seededUnit(0, label), seededUnit(0xffff_ffff, label));

  for (const seed of [0, 1, 20_280_726, 0xffff_ffff]) {
    assert.doesNotThrow(() => seededUnit(seed, label));
    const spec = createCurrentFieldSpec(seed, COURSE);
    assert.equal(spec.seed, seed);
    assert.equal(JSON.parse(JSON.stringify(spec)).seed, seed);
  }
  for (const seed of [0x1_0000_0000, -1, -0x1_0000_0000, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => seededUnit(seed, label), RangeError, `${seed}`);
    assert.throws(() => createCurrentFieldSpec(seed, COURSE), RangeError, `${seed}`);
  }

  const zero = createCurrentFieldSpec(0, COURSE);
  assert.equal(Object.is(createCurrentFieldSpec(-0, COURSE).seed, -0), false);
  const maximum = createCurrentFieldSpec(0xffff_ffff, COURSE);
  assert.notEqual(JSON.stringify(zero), JSON.stringify(maximum));
  assert.notDeepEqual(
    [zero.phase1Radians, zero.phase2Radians],
    [maximum.phase1Radians, maximum.phase2Radians],
  );
});

test("labeled seed draws and the serialized current spec have independent fixed goldens", () => {
  assert.equal(FIELD_SEED_ALGORITHM, "fnv1a32-mix-v1");
  for (const [seed, label, expected] of [
    [0, "current.phase-1", 0.5393315120600164],
    [0, "current.phase-2", 0.5849139811471105],
    [1, "current.phase-1", 0.2568487024400383],
    [1, "current.phase-2", 0.08332663564942777],
    [20_280_726, "current.phase-1", 0.21624278649687767],
    [20_280_726, "current.phase-2", 0.6176243184600025],
    [0xffff_ffff, "current.phase-1", 0.8470847473945469],
    [0xffff_ffff, "current.phase-2", 0.18925308156758547],
  ]) {
    assert.equal(seededUnit(seed, label), expected, `${seed}:${label}`);
  }

  const spec = createCurrentFieldSpec(20_280_726, COURSE);
  assert.equal(
    JSON.stringify(spec),
    '{"kind":"layline-current-field-v1","version":1,"provenance":"seeded-field","seed":20280726,"halfWidthMeters":70,"lengthMeters":620,"uMin":-1.5,"uMax":1.5,"vMin":-0.25,"vMax":1.25,"phase1Radians":1.358693498900754,"phase2Radians":3.8806480431046935,"lineMeanFraction":0.45,"lineOscillationFraction":0.1,"linePeriodSeconds":64,"transitionHalfWidthFraction":0.08,"xBaseMps":0.26,"xAcrossCoefficientMps":0.07,"xTimeAmplitudeMps":0.05,"xTimePeriodSeconds":48,"xShearAmplitudeMps":0.08,"yBaseMps":-0.1,"yAlongCoefficientMps":0.04,"yAlongCenter":0.5,"yTimeAmplitudeMps":0.035,"yTimePeriodSeconds":61}',
  );

  for (const [x, y, t, expectedX, expectedY] of [
    [0, 0, 0, 0.2288795198692804, -0.14586868090108804],
    [-105, -155, -12.5, 0.0612998595920244, -0.15986608361136856],
    [105, 775, 90, 0.47212017299466125, -0.04081139889265588],
    [17.25, 312.5, 1_000, 0.3725741467895206, -0.06492329168868154],
  ]) {
    const actual = sampleSeededCurrentField(spec, x, y, t, {});
    assert.equal(actual.x, expectedX, `${x},${y},${t}:x`);
    assert.equal(actual.y, expectedY, `${x},${y},${t}:y`);
  }
});

test("current specs serialize every deterministic phase and reproduce the documented formula", () => {
  const left = createCurrentFieldSpec(20_280_726, COURSE);
  const right = createCurrentFieldSpec(20_280_726, structuredClone(COURSE));
  assert.deepEqual(left, right);
  assert.equal(left.halfWidthMeters, 70);
  assert.equal(left.lengthMeters, 620);
  assert.equal(left.provenance, "seeded-field");

  for (const [x, y, t] of [[0, 0, 0], [-105, -155, -12.5], [105, 775, 90], [17.25, 312.5, 1_000]]) {
    const out = { x: 999, y: 999 };
    const actual = sampleSeededCurrentField(left, x, y, t, out);
    const expected = expectedSample(left, x, y, t);
    assert.equal(actual, out);
    assert.equal(actual.provenance, "seeded-field");
    close(actual.x, expected.x);
    close(actual.y, expected.y);
  }
});

test("current field stays finite and below the declared ceiling across the clamped course domain", () => {
  for (const seed of [0, 20_280_726, 20_281_024, 20_281_113, 0xffff_ffff]) {
    const spec = createCurrentFieldSpec(seed, COURSE);
    for (let ix = 0; ix <= 30; ix++) {
      for (let iy = 0; iy <= 30; iy++) {
        for (const t of [-1_000, -10, 0, 24, 64, 1_000]) {
          const x = spec.halfWidthMeters * (-2 + ix / 7.5);
          const y = spec.lengthMeters * (-0.5 + iy / 15);
          const sample = sampleSeededCurrentField(spec, x, y, t, {});
          assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.y));
          assert.ok(Math.hypot(sample.x, sample.y) <= CURRENT_FIELD_MAX_SPEED_MPS);
        }
      }
    }
  }
});

test("current construction and sampling reject invalid inputs and tampered specs", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const course = structuredClone(COURSE);
    course.startPin.x = value;
    assert.throws(() => createCurrentFieldSpec(1, course), RangeError);
  }
  const spec = createCurrentFieldSpec(1, COURSE);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => sampleSeededCurrentField(spec, value, 0, 0, {}), RangeError);
    assert.throws(() => sampleSeededCurrentField(spec, 0, value, 0, {}), RangeError);
    assert.throws(() => sampleSeededCurrentField(spec, 0, 0, value, {}), RangeError);
  }
  for (const seed of [-0, 0x1_0000_0000, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => sampleSeededCurrentField({ ...spec, seed }, 0, 0, 0, {}),
      RangeError,
      `${seed}`,
    );
  }
  assert.throws(
    () => sampleSeededCurrentField({ ...spec, halfWidthMeters: 0 }, 0, 0, 0, {}),
    RangeError,
  );
});
