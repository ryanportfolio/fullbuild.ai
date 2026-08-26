import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const {
  FICTIONAL_ONE_DESIGN_POLAR,
  isBeatTwaAbs,
  isRunTwaAbs,
  normalizeDeclaredTwaAbs,
  polarFraction,
  polarModelFingerprint,
  targetBoatSpeed,
} = await import("../src/lib/layline/polar.ts");

const LEGACY_POLAR_TWA = Object.freeze([30, 44, 60, 90, 110, 140, 165]);
const LEGACY_POLAR_FRAC = Object.freeze([0.15, 0.8, 0.95, 1.1, 1.15, 1.15, 0.85]);

const legacyPolarFraction = Object.freeze(function legacyPolarFraction(twaAbs) {
  const clamp = (value, minimum, maximum) => value < minimum ? minimum : value > maximum ? maximum : value;
  const angle = clamp(twaAbs, 0, 180);
  if (angle <= LEGACY_POLAR_TWA[0]) return (angle / LEGACY_POLAR_TWA[0]) * LEGACY_POLAR_FRAC[0];
  const last = LEGACY_POLAR_TWA.length - 1;
  if (angle >= LEGACY_POLAR_TWA[last]) {
    return LEGACY_POLAR_FRAC[last] - ((angle - LEGACY_POLAR_TWA[last]) / 15) * 0.1;
  }
  let index = 0;
  while (index < last - 1 && angle > LEGACY_POLAR_TWA[index + 1]) index++;
  const x0 = LEGACY_POLAR_TWA[index];
  const x1 = LEGACY_POLAR_TWA[index + 1];
  const y0 = LEGACY_POLAR_FRAC[index];
  const y1 = LEGACY_POLAR_FRAC[index + 1];
  const xm = index > 0 ? LEGACY_POLAR_TWA[index - 1] : x0 - (x1 - x0);
  const ym = index > 0 ? LEGACY_POLAR_FRAC[index - 1] : y0 - (y1 - y0);
  const xp = index + 2 <= last ? LEGACY_POLAR_TWA[index + 2] : x1 + (x1 - x0);
  const yp = index + 2 <= last ? LEGACY_POLAR_FRAC[index + 2] : y1 + (y1 - y0);
  const width = x1 - x0;
  const m0 = ((y1 - ym) / (x1 - xm)) * width;
  const m1 = ((yp - y0) / (xp - x0)) * width;
  const amount = (angle - x0) / width;
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  return (
    (2 * amount3 - 3 * amount2 + 1) * y0 +
    (amount3 - 2 * amount2 + amount) * m0 +
    (-2 * amount3 + 3 * amount2) * y1 +
    (amount3 - amount2) * m1
  );
});

test("polar extraction is byte-identical to the frozen legacy oracle over tails and dense domain", () => {
  const goldens = new Map([
    [0, 0], [15, 0.075], [30, 0.15], [37, 0.5095833333333334], [44, 0.8],
    [52, 0.9152898550724639], [60, 0.95], [75, 1.0344565217391304], [90, 1.1],
    [100, 1.1325], [110, 1.15], [125, 1.1742045454545454], [140, 1.15],
    [152.5, 1.0204545454545455], [165, 0.85], [172.5, 0.7999999999999999], [180, 0.75],
  ]);
  for (const [angle, expected] of goldens) {
    assert.equal(polarFraction(FICTIONAL_ONE_DESIGN_POLAR, angle), legacyPolarFraction(angle));
    assert.ok(Math.abs(polarFraction(FICTIONAL_ONE_DESIGN_POLAR, angle) - expected) <= 1e-12);
  }
  for (let index = 0; index <= 180_000; index++) {
    const angle = index / 1_000;
    const extracted = polarFraction(FICTIONAL_ONE_DESIGN_POLAR, angle);
    const legacy = legacyPolarFraction(angle);
    assert.equal(extracted, legacy, `${angle}`);
    assert.equal(extracted - legacy, 0, `${angle}: zero difference`);
  }
  for (const angle of [-180, -1, 181, 360]) {
    assert.equal(polarFraction(FICTIONAL_ONE_DESIGN_POLAR, angle), legacyPolarFraction(angle));
  }
});

test("target speeds match the frozen legacy oracle across all shipped wind samples", () => {
  let probes = 0;
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    for (const wind of race.wind) {
      for (const angle of [0, 30, 44, 60, 90, 110, 140, 165, 180]) {
        assert.equal(targetBoatSpeed(FICTIONAL_ONE_DESIGN_POLAR, wind.tws, angle), legacyPolarFraction(angle) * wind.tws);
        probes++;
      }
    }
  }
  assert.ok(probes > 1_000);
});

test("declared beat/run helpers preserve exact boundaries and normalize beat negative zero", () => {
  for (const value of [0, -0, 90]) assert.equal(isBeatTwaAbs(value), true);
  for (const value of [90.00000000000001, -5e-324, 180]) assert.equal(isBeatTwaAbs(value), false);
  for (const value of [90.00000000000001, 180]) assert.equal(isRunTwaAbs(value), true);
  for (const value of [90, 180.00000000000003, 0]) assert.equal(isRunTwaAbs(value), false);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(isBeatTwaAbs(value), false);
    assert.equal(isRunTwaAbs(value), false);
  }
  assert.equal(Object.is(normalizeDeclaredTwaAbs("beat", -0), -0), false);
  assert.equal(normalizeDeclaredTwaAbs("run", 90), null);
});

test("polar invalids are honest and model fingerprint covers every serialized field", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(polarFraction(FICTIONAL_ONE_DESIGN_POLAR, value), null);
    assert.equal(targetBoatSpeed(FICTIONAL_ONE_DESIGN_POLAR, 7, value), null);
  }
  for (const tws of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(targetBoatSpeed(FICTIONAL_ONE_DESIGN_POLAR, tws, 45), null);
  }
  const original = polarModelFingerprint(FICTIONAL_ONE_DESIGN_POLAR);
  for (const [field, value] of Object.entries(FICTIONAL_ONE_DESIGN_POLAR)) {
    const changed = structuredClone(FICTIONAL_ONE_DESIGN_POLAR);
    if (Array.isArray(value)) changed[field][0] += 1e-12;
    else if (typeof value === "number") changed[field] += 1;
    else changed[field] += "-changed";
    assert.notEqual(polarModelFingerprint(changed), original, field);
  }
});

test("every accepted polar tail returns a finite value or null under extreme finite fields", () => {
  const lowNaN = {
    ...structuredClone(FICTIONAL_ONE_DESIGN_POLAR),
    lowTailFraction: Number.MAX_VALUE,
    speedFractions: [-Number.MAX_VALUE, ...FICTIONAL_ONE_DESIGN_POLAR.speedFractions.slice(1)],
  };
  const lowInfinity = {
    ...structuredClone(FICTIONAL_ONE_DESIGN_POLAR),
    lowTailFraction: -Number.MAX_VALUE,
    speedFractions: [Number.MAX_VALUE, ...FICTIONAL_ONE_DESIGN_POLAR.speedFractions.slice(1)],
  };
  const highInfinity = {
    ...structuredClone(FICTIONAL_ONE_DESIGN_POLAR),
    speedFractions: [...FICTIONAL_ONE_DESIGN_POLAR.speedFractions.slice(0, -1), Number.MAX_VALUE],
    highTailFraction: Number.MAX_VALUE,
    highTailDropFraction: -Number.MAX_VALUE,
  };
  const highNaN = {
    ...structuredClone(FICTIONAL_ONE_DESIGN_POLAR),
    twaDegrees: [-1.6e308, -8e307],
    speedFractions: [1, 1],
    lowTailAngleDegrees: -Number.MAX_VALUE,
    highTailAngleDegrees: Number.MAX_VALUE,
    highTailFraction: 1,
    highTailDropFraction: 1,
  };
  for (const [label, model, angle] of [
    ["low NaN", lowNaN, 0],
    ["low Infinity", lowInfinity, 15],
    ["high NaN", highNaN, Number.MAX_VALUE],
    ["high Infinity", highInfinity, 180],
  ]) {
    assert.notEqual(polarModelFingerprint(model), "invalid-polar-model", label);
    assert.equal(polarFraction(model, angle), null, label);
  }
});
