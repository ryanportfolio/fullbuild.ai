import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "../store" &&
      context.parentURL?.endsWith("/src/components/layline/hud/live.ts")
    ) {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const useReplay = {};",
      };
    }
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
  SIM_DT,
  advancePositionOnTick,
  closestPassageOnSegment,
  finishCrossingOnSegment,
  generateRace,
  roundingCompletionOnSegment,
  solvePrestartPosition,
  tacticalCandidateBudgetAtTick,
} = await import("../src/lib/layline/sim.ts");
const { createPose, legAt, poseAt, windAt } = await import("../src/lib/layline/interpolate.ts");
const { vmgOf: liveVmgOf } = await import("../src/components/layline/hud/live.ts");
const {
  projectVelocityOntoBearing,
  vectorFromSpeedCourse,
  velocityFromComponents,
  windAxisVmgFromComponents,
} = await import("../src/lib/layline/velocity.ts");
const { currentFieldSpecValidity, sampleSeededCurrentField } = await import("../src/lib/layline/current.ts");
const {
  componentMadeGoodToMark,
  currentMadeGoodToMark,
  groundMadeGoodToMark,
  vmgSeries,
  vmgToMark,
  waterMadeGoodToMark,
} = await import("../src/lib/layline/analytics.ts");
const { compareRange, integrateTrackRange, raceAnalysisValidity } = await import("../src/lib/layline/comparison.ts");
const {
  ANALYST_TOOLS,
  boatState,
  compareBoats,
  compareRangeForAnalyst,
  detectManeuvers,
  runTool,
  standingsAt,
  startReport,
} = await import("../src/lib/layline/analyst/tools.ts");
const { knots } = await import("../src/lib/layline/format.ts");
const { SUGGESTED_QUESTIONS } = await import("../src/lib/layline/analyst/protocol.ts");
const { RACES } = await import("../src/lib/layline/races.ts");

function poseBuffer() {
  return createPose();
}

function close(actual, expected, tolerance = 1e-12, label = "value") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function auditKey(boatId, t) {
  return `${boatId}:${t.toFixed(9)}`;
}

const auditedRaces = RACES.map((meta) => {
  const audit = new Map();
  const rawSamples = [];
  const race = generateRace(meta.seed, (sample) => {
    audit.set(auditKey(sample.boatId, sample.t), sample);
    rawSamples.push(sample);
  });
  return { meta, race, audit, rawSamples };
});

test("live and analyst wind-axis VMG share component truth over 7,827 replay samples", () => {
  const allSamples = [];
  for (const { meta, race } of auditedRaces) {
    for (const boat of race.boats) {
      const fixes = race.fixes[boat.id];
      for (let index = 0; index < fixes.length; index += 1) {
        allSamples.push({ raceId: meta.id, race, boatId: boat.id, t: fixes[index].t, fixT: fixes[index].t });
        if (index + 1 < fixes.length) {
          allSamples.push({
            raceId: meta.id,
            race,
            boatId: boat.id,
            t: (fixes[index].t + fixes[index + 1].t) / 2,
            fixT: fixes[index].t,
          });
        }
      }
    }
  }

  const targetCount = 7_827;
  const pose = poseBuffer();
  const fixPose = poseBuffer();
  const wind = { t: 0, twd: 0, tws: 0 };
  const seenBoats = new Set();
  for (let index = 0; index < targetCount; index += 1) {
    const sampleIndex = Math.floor((index * (allSamples.length - 1)) / (targetCount - 1));
    const sample = allSamples[sampleIndex];
    seenBoats.add(`${sample.raceId}:${sample.boatId}`);
    poseAt(sample.race, sample.boatId, sample.t, "smooth", pose);
    windAt(sample.race, sample.t, wind);
    const projected = windAxisVmgFromComponents(
      pose.waterX,
      pose.waterY,
      pose.currentX,
      pose.currentY,
      wind.twd,
    );
    assert.ok(projected, `${sample.raceId} ${sample.boatId} ${sample.t} projection`);
    assert.equal(projected.ground, projected.water + projected.current);
    close(liveVmgOf(pose, wind.twd), projected.ground, 1e-12, `${sample.raceId} ${sample.boatId} ${sample.t}`);

    poseAt(sample.race, sample.boatId, sample.fixT, "smooth", fixPose);
    windAt(sample.race, sample.fixT, wind);
    const toolLiveVmg = liveVmgOf(fixPose, wind.twd);
    assert.notEqual(toolLiveVmg, null);
    const state = boatState(sample.race, sample.boatId, sample.t);
    assert.ok(!("error" in state));
    assert.equal(state.vmgKnots, knots(toolLiveVmg), `${sample.raceId} ${sample.boatId} ${sample.t} analyst`);
  }
  assert.equal(seenBoats.size, 18);
});

test("wind-axis telemetry consumers delegate projection instead of copying formulas", () => {
  const velocitySource = readFileSync(new URL("../src/lib/layline/velocity.ts", import.meta.url), "utf8");
  const liveSource = readFileSync(new URL("../src/components/layline/hud/live.ts", import.meta.url), "utf8");
  const instrumentSource = readFileSync(new URL("../src/components/layline/hud/Instruments.tsx", import.meta.url), "utf8");
  const analystSource = readFileSync(new URL("../src/lib/layline/analyst/tools.ts", import.meta.url), "utf8");
  const comparisonSource = readFileSync(new URL("../src/lib/layline/comparison.ts", import.meta.url), "utf8");
  const laylineSource = readFileSync(new URL("../src/lib/layline/laylines.ts", import.meta.url), "utf8");

  assert.match(velocitySource, /export function projectVelocityOntoBearing/);
  assert.match(velocitySource, /export function windAxisVmgFromComponents/);
  assert.match(liveSource, /windAxisVmgFromComponents/);
  assert.match(analystSource, /windAxisVmgFromComponents/);
  assert.match(comparisonSource, /projectVelocityComponentsOntoBearing/);
  assert.match(laylineSource, /projectVelocityOntoBearing\(velocity\.groundX, velocity\.groundY, markBearing\)/);
  assert.match(instrumentSource, /windVmgKnots\(live\.pose, live\.wind\.twd\)/);
  assert.doesNotMatch(liveSource, /Math\.cos|vmgOf\([^)]*\)[\s\S]{0,200}\.twa/);
  assert.doesNotMatch(analystSource, /velocity\.sog\s*\*\s*Math\.cos|velocity\.cog\s*-\s*twd/);
  assert.doesNotMatch(comparisonSource, /pose\.(?:water|current|ground)[XY]\s*\*\s*q[xy]/);
  assert.doesNotMatch(laylineSource, /velocity\.groundX\s*\*\s*towardX|velocity\.groundY\s*\*\s*towardY/);
});

test("public to-mark adapters are finite/null, exact at cardinals, and normalize signed zero", () => {
  const maximum = Number.MAX_VALUE;
  for (const leg of ["prestart", "beat", "run", "finished"]) {
    const bearing = leg === "run" || leg === "finished" ? 180 : 0;
    for (const [x, y] of [
      [maximum, 0],
      [-maximum, 0],
      [0, maximum],
      [0, -maximum],
      [-0, 0],
    ]) {
      const actual = componentMadeGoodToMark(x, y, leg);
      assert.equal(actual, projectVelocityOntoBearing(x, y, bearing));
      if (actual === 0) assert.equal(Object.is(actual, -0), false);
    }
  }

  assert.equal(componentMadeGoodToMark(maximum, 0, "beat"), 0);
  assert.equal(componentMadeGoodToMark(maximum, 0, "run"), 0);
  assert.equal(vmgToMark(maximum, 90, "beat"), 0);
  assert.equal(vmgToMark(maximum, 270, "beat"), 0);
  assert.equal(vmgToMark(maximum, 90, "run"), 0);
  assert.equal(vmgToMark(4, 0, "beat"), 4);
  assert.equal(vmgToMark(4, 180, "beat"), -4);
  assert.equal(vmgToMark(4, 180, "run"), 4);
  assert.equal(vmgToMark(0, null, "beat"), 0);
  assert.equal(Object.is(vmgToMark(0, null, "beat"), -0), false);
  const ordinary = {
    waterX: 3,
    waterY: 4,
    currentX: -1,
    currentY: 0.5,
    groundX: maximum,
    groundY: -maximum,
  };
  assert.equal(waterMadeGoodToMark(ordinary, "beat"), 4);
  assert.equal(currentMadeGoodToMark(ordinary, "beat"), 0.5);
  assert.equal(groundMadeGoodToMark(ordinary, "beat"), 4.5);
  assert.equal(groundMadeGoodToMark(ordinary, "run"), -4.5);

  for (const value of [Number.NaN, Infinity, -Infinity]) {
    assert.equal(componentMadeGoodToMark(value, 0, "beat"), null);
    assert.equal(componentMadeGoodToMark(0, value, "beat"), null);
    assert.equal(vmgToMark(value, 0, "beat"), null);
    assert.equal(vmgToMark(1, value, "beat"), null);
  }
  assert.equal(vmgToMark(-1, 0, "beat"), null);
  assert.equal(vmgToMark(1, null, "beat"), null);
  const diagonal = vectorFromSpeedCourse(Number.MAX_VALUE, 45, {});
  assert.equal(
    vmgToMark(Number.MAX_VALUE, 45, "beat"),
    componentMadeGoodToMark(diagonal.x, diagonal.y, "beat"),
  );

  for (const course of [0, 90, 180, 270, 360, -90]) {
    const vector = vectorFromSpeedCourse(maximum, course, {});
    const wrapped = ((course % 360) + 360) % 360;
    if (wrapped === 0 || wrapped === 180) assert.equal(vector.x, 0);
    if (wrapped === 90 || wrapped === 270) assert.equal(vector.y, 0);
  }
});

test("to-mark production consumers equal shared components across every race phase", (t) => {
  const phaseCounts = new Map();
  let seriesChecks = 0;
  let analystChecks = 0;
  let comparisonChecks = 0;
  const pose = poseBuffer();

  for (const { meta, race } of auditedRaces) {
    const series = vmgSeries(race);
    for (const boat of race.boats) {
      const values = series.byBoat[boat.id];
      for (let index = 0; index < series.count; index++) {
        const t = series.t0 + index * 0.5;
        const leg = legAt(race, boat.id, t);
        phaseCounts.set(leg, (phaseCounts.get(leg) ?? 0) + 1);
        if (leg === "prestart" || leg === "finished") {
          assert.equal(Number.isNaN(values[index]), true, `${meta.id} ${boat.id} ${t} strip gap`);
          continue;
        }
        poseAt(race, boat.id, t, "smooth", pose);
        const expected = groundMadeGoodToMark(pose, leg);
        assert.notEqual(expected, null);
        close(values[index], expected, 5e-7, `${meta.id} ${boat.id} ${t} strip series`);
        seriesChecks++;
      }

      const fixes = race.fixes[boat.id];
      for (let index = 0; index < fixes.length; index += 7) {
        const fix = fixes[index];
        const leg = legAt(race, boat.id, fix.t);
        const direct = componentMadeGoodToMark(
          fix.waterX + fix.currentX,
          fix.waterY + fix.currentY,
          leg,
        );
        const state = boatState(race, boat.id, fix.t);
        assert.ok(!("error" in state), `${meta.id} ${boat.id} ${fix.t} analyst state`);
        assert.equal(
          state.toMarkKnots,
          leg === "beat" || leg === "run" ? knots(direct) : null,
          `${meta.id} ${boat.id} ${fix.t} analyst to-mark`,
        );
        analystChecks++;
      }

      for (let index = 0; index + 2 < fixes.length; index += 11) {
        const from = fixes[index];
        const to = fixes[index + 2];
        const midpoint = (from.t + to.t) / 2;
        const leg = legAt(race, boat.id, midpoint);
        const integrated = integrateTrackRange(race, boat.id, { from: from.t, to: to.t });
        if (leg !== "beat" && leg !== "run") {
          assert.equal(integrated.meanVmgMps, null, `${meta.id} ${boat.id} ${midpoint} comparison gap`);
          continue;
        }
        if (integrated.status !== "ok" || integrated.meanVmgMps === null) continue;
        if (
          legAt(race, boat.id, from.t) !== leg ||
          legAt(race, boat.id, to.t) !== leg
        ) continue;
        const finish = race.results.find((result) => result.boatId === boat.id)?.elapsed;
        if ((from.t < 0 && to.t > 0) || (finish !== undefined && from.t < finish && finish < to.t)) {
          continue;
        }
        poseAt(race, boat.id, from.t, "smooth", pose);
        const start = groundMadeGoodToMark(pose, leg);
        poseAt(race, boat.id, fixes[index + 1].t, "smooth", pose);
        const middle = groundMadeGoodToMark(pose, leg);
        poseAt(race, boat.id, to.t, "smooth", pose);
        const end = groundMadeGoodToMark(pose, leg);
        if (start === null || middle === null || end === null) continue;
        close(
          integrated.meanVmgMps,
          (start + 2 * middle + end) / 4,
          1e-12,
          `${meta.id} ${boat.id} ${midpoint} comparison`,
        );
        comparisonChecks++;
      }
    }
  }

  assert.deepEqual([...phaseCounts.keys()].sort(), ["beat", "finished", "prestart", "run"]);
  assert.ok(seriesChecks > 1_000);
  assert.ok(analystChecks > 500);
  assert.ok(comparisonChecks > 100);
  t.diagnostic(
    `${seriesChecks} strip-series, ${analystChecks} analyst, and ${comparisonChecks} comparison equalities`,
  );
});

test("made-good arithmetic has one owner and telemetry consumers avoid scalar or pose-ground truth", () => {
  const analyticsSource = readFileSync(new URL("../src/lib/layline/analytics.ts", import.meta.url), "utf8");
  const comparisonSource = readFileSync(new URL("../src/lib/layline/comparison.ts", import.meta.url), "utf8");
  const analystSource = readFileSync(new URL("../src/lib/layline/analyst/tools.ts", import.meta.url), "utf8");
  const stripSource = readFileSync(new URL("../src/components/layline/hud/VmgStrip.tsx", import.meta.url), "utf8");
  const liveSource = readFileSync(new URL("../src/components/layline/hud/live.ts", import.meta.url), "utf8");
  const velocitySource = readFileSync(new URL("../src/lib/layline/velocity.ts", import.meta.url), "utf8");

  assert.match(analyticsSource, /componentMadeGoodToMark[\s\S]*projectVelocityOntoBearing/);
  assert.match(analyticsSource, /vmgToMark[\s\S]*vectorFromSpeedCourse[\s\S]*componentMadeGoodToMark/);
  assert.doesNotMatch(analyticsSource, /const DEG|Math\.cos\(cog|return leg === "run"[^\n]*-y/);
  assert.doesNotMatch(comparisonSource, /\bvmgToMark\b/);
  assert.match(comparisonSource, /groundMadeGoodToMark/);
  assert.doesNotMatch(analystSource, /fix\.waterY\s*\+\s*fix\.currentY|\bvmgToMark\b/);
  assert.doesNotMatch(stripSource, /\bvmgToMark\b/);
  assert.match(stripSource, /groundMadeGoodToMark/);
  assert.match(liveSource, /windAxisVmgFromComponents/);
  assert.match(velocitySource, /projectVelocityOntoBearing[\s\S]*projectVelocityComponentsOntoBearing/);
});

test("analyst current telemetry gates every current-spec field and public adapter", (t) => {
  const canonicalRace = auditedRaces[0].race;
  const keys = Reflect.ownKeys(canonicalRace.environment.current);
  assert.equal(keys.length, 26);
  const boatId = canonicalRace.boats[0].id;
  const rivalId = canonicalRace.boats[1].id;
  const request = {
    primaryBoatId: boatId,
    reference: { kind: "boat", boatId: rivalId },
    range: { from: 5, to: 30 },
  };

  const assertGated = (race, label) => {
    const direct = boatState(race, boatId, 5);
    assert.ok("error" in direct, `${label} direct boat_state`);
    assert.match(direct.error, /current field/i, `${label} direct error`);
    const dispatched = JSON.parse(runTool(race, "boat_state", { boatId, t: 5 }));
    assert.ok("error" in dispatched, `${label} dispatched boat_state`);
    assert.match(dispatched.error, /current field/i, `${label} dispatch error`);
    const compared = compareRangeForAnalyst(race, request);
    assert.ok("error" in compared, `${label} direct comparison`);
    assert.ok("error" in compareBoats(race, boatId, rivalId, 5, 30), `${label} legacy comparison`);
    const dispatchedComparison = JSON.parse(runTool(race, "compare_boats", {
      a: boatId,
      referenceKind: "boat",
      b: rivalId,
      cohortBoatIds: [],
      t0: 5,
      t1: 30,
    }));
    assert.ok("error" in dispatchedComparison, `${label} dispatched comparison`);
  };

  for (const key of keys) {
    const changed = structuredClone(canonicalRace);
    const value = changed.environment.current[key];
    changed.environment.current[key] = typeof value === "number" ? value + 1 : `${value}-invalid`;
    let telemetryReads = 0;
    Object.defineProperty(changed.fixes[boatId][0], "waterX", {
      enumerable: true,
      configurable: true,
      get() {
        telemetryReads++;
        throw new Error("invalid current must gate before telemetry");
      },
    });
    assertGated(changed, String(key));
    assert.equal(telemetryReads, 0, `${String(key)} read telemetry before guard`);

    const accessor = structuredClone(canonicalRace);
    let accessorReads = 0;
    Object.defineProperty(accessor.environment.current, key, {
      enumerable: true,
      configurable: true,
      get() {
        accessorReads++;
        return canonicalRace.environment.current[key];
      },
    });
    assertGated(accessor, `${String(key)} accessor`);
    assert.equal(accessorReads, 0, `${String(key)} current accessor invoked`);
  }

  for (const [label, current] of [
    ["ownKeys proxy", new Proxy({}, { ownKeys() { throw new Error("hostile keys"); } })],
    ["prototype proxy", new Proxy({}, { getPrototypeOf() { throw new Error("hostile prototype"); } })],
  ]) {
    const race = structuredClone(canonicalRace);
    race.environment.current = current;
    assert.doesNotThrow(() => assertGated(race, label));
  }

  for (const { meta, race } of auditedRaces) {
    const state = boatState(race, race.boats[0].id, 5);
    assert.ok(!("error" in state), `${meta.id} canonical direct`);
    const dispatched = JSON.parse(runTool(race, "boat_state", { boatId: race.boats[0].id, t: 5 }));
    assert.deepEqual(dispatched, state, `${meta.id} canonical dispatch`);
  }
  t.diagnostic("26 value mutations + 26 accessors + 2 proxies across 5 public adapters");
});

test("live wind-axis VMG reports invalid telemetry as null", () => {
  const invalid = poseBuffer();
  invalid.waterX = Number.NaN;
  assert.equal(liveVmgOf(invalid, 0), null);
  invalid.waterX = 0;
  assert.equal(liveVmgOf(invalid, null), null);
});

test("generated fixes use required component authority and serialized current", () => {
  const race = auditedRaces[0].race;
  assert.equal(race.environment.current.kind, "layline-current-field-v1");
  for (const fixes of Object.values(race.fixes)) {
    for (const fix of fixes) {
      assert.deepEqual(
        Object.keys(fix).filter((key) => ["stw", "ctw", "sog", "cog"].includes(key)),
        [],
      );
      for (const key of ["waterX", "waterY", "currentX", "currentY"]) {
        assert.ok(Number.isFinite(fix[key]), `${key} at ${fix.t}`);
      }
    }
  }
});

test("replay derives every velocity field from four interpolated components", () => {
  const race = auditedRaces[0].race;
  const pose = poseBuffer();
  for (const boat of race.boats) {
    const fixes = race.fixes[boat.id];
    for (let index = 0; index + 1 < fixes.length; index += 17) {
      for (const t of [fixes[index].t, (fixes[index].t + fixes[index + 1].t) / 2]) {
        poseAt(race, boat.id, t, "smooth", pose);
        const derived = velocityFromComponents(
          pose.waterX,
          pose.waterY,
          pose.currentX,
          pose.currentY,
          {},
        );
        for (const key of [
          "stw", "ctw", "currentDrift", "currentSet",
          "groundX", "groundY", "sog", "cog",
        ]) assert.equal(pose[key], derived[key], `${boat.id} ${key} at ${t}`);
        assert.equal(
          pose.telemetryProvenance,
          t === fixes[index].t ? "recorded-fix" : "reconstructed-from-fixes",
        );
      }
    }
  }
});

test("start-of-tick algebra and crossing timestamps use the closed forward segment", () => {
  assert.deepEqual(advancePositionOnTick({ x: 2, y: -1 }, 4, 3, { x: 0, y: 0 }), {
    x: 2.2,
    y: -0.85,
  });
  const finish = finishCrossingOnSegment({ x: 1, y: 0.3 }, { x: 2, y: -0.2 }, 12);
  assert.ok(finish !== null);
  assert.equal(finish.alpha, 0.6);
  close(finish.t, 12.03, 1e-12, "finish time");
  const completion = roundingCompletionOnSegment(
    { x: 4, y: 101 },
    { x: 2, y: 103 },
    { x: 3, y: 100 },
    40,
  );
  assert.ok(completion !== null);
  assert.equal(completion.t, 40.025);
  const closest = closestPassageOnSegment(
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: 0 },
    50,
  );
  assert.deepEqual(closest, { x: 0, y: 1, t: 50.025, alpha: 0.5, distance: 1 });
});

test("forward telemetry has one t=0 sample, fixes at 4 Hz, and progress at 2 Hz", () => {
  for (const { meta, race, audit } of auditedRaces) {
    for (const boat of race.boats) {
      const fixes = race.fixes[boat.id];
      const progress = race.progress[boat.id];
      assert.equal(fixes.filter((fix) => fix.t === 0).length, 1, `${meta.id} ${boat.id} t=0 fix`);
      assert.ok(audit.has(auditKey(boat.id, 0)), `${meta.id} ${boat.id} t=0 audit`);
      const forwardFixes = fixes.filter((fix) => fix.t >= 0);
      for (let index = 0; index < forwardFixes.length; index++) {
        close(forwardFixes[index].t, index * 0.25, 1e-12, `${meta.id} fix ${index}`);
      }
      const forwardProgress = progress.filter((sample) => sample.t >= 0);
      for (let index = 0; index < forwardProgress.length; index++) {
        close(forwardProgress[index].t, index * 0.5, 1e-12, `${meta.id} progress ${index}`);
      }
      assert.ok(fixes.some((fix) => fix.t === 0.25), `${meta.id} ${boat.id} p5 missing`);
      assert.ok(progress.some((sample) => sample.t === 0.5), `${meta.id} ${boat.id} p10 missing`);
    }
  }
});

test("prestart solver performs the sixth substitution and closes its forward equation", () => {
  const { race } = auditedRaces[0];
  const spec = race.environment.current;
  const later = { x: 12.345, y: 50 };
  const waterX = 2.125;
  const waterY = 1.875;
  const t = -4.35;
  const substitutions = [];
  const solved = solvePrestartPosition(
    spec,
    later,
    waterX,
    waterY,
    t,
    { x: 0, y: 0 },
    (iteration) => substitutions.push(iteration),
  );
  let manual = { x: later.x - SIM_DT * waterX, y: later.y - SIM_DT * waterY };
  const current = { x: 0, y: 0 };
  for (let iteration = 0; iteration < 6; iteration++) {
    sampleSeededCurrentField(spec, manual.x, manual.y, t, current);
    manual = {
      x: later.x - SIM_DT * (waterX + current.x),
      y: later.y - SIM_DT * (waterY + current.y),
    };
  }
  assert.deepEqual(substitutions, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(solved, manual);
  sampleSeededCurrentField(spec, solved.x, solved.y, t, current);
  close(solved.x + SIM_DT * (waterX + current.x), later.x, 1e-12, "prestart x residual");
  close(solved.y + SIM_DT * (waterY + current.y), later.y, 1e-12, "prestart y residual");
});

test("every shipped raw simulator fix has finite bit-exact vector closure and positive zero", () => {
  let sampleCount = 0;
  let strictFailures = 0;
  let maxResidual = 0;
  const examples = [];

  for (const { meta, rawSamples } of auditedRaces) {
    for (const sample of rawSamples) {
      sampleCount += 1;
      const residualX = sample.groundX - (sample.waterX + sample.currentX);
      const residualY = sample.groundY - (sample.waterY + sample.currentY);
      const components = [
        sample.waterX,
        sample.waterY,
        sample.currentX,
        sample.currentY,
        sample.groundX,
        sample.groundY,
        residualX,
        residualY,
      ];
      const valid = components.every(Number.isFinite) &&
        components.every((value) => !Object.is(value, -0)) &&
        sample.groundX === sample.waterX + sample.currentX &&
        sample.groundY === sample.waterY + sample.currentY &&
        residualX === 0 &&
        residualY === 0;
      if (valid) continue;
      strictFailures += 1;
      maxResidual = Math.max(maxResidual, Math.abs(residualX), Math.abs(residualY));
      if (examples.length < 3) {
        examples.push({ raceId: meta.id, boatId: sample.boatId, t: sample.t, residualX, residualY });
      }
    }
  }

  assert.equal(sampleCount, 5_064);
  assert.equal(
    strictFailures,
    0,
    `${strictFailures}/${sampleCount} raw fixes failed strict closure; ` +
      `max residual ${maxResidual}; examples ${JSON.stringify(examples)}`,
  );
});

test("every fix matches its seeded field and unrounded simulator derivative", () => {
  for (const { meta, race, audit } of auditedRaces) {
    for (const boat of race.boats) {
      for (const fix of race.fixes[boat.id]) {
        const sampled = sampleSeededCurrentField(
          race.environment.current,
          fix.x,
          fix.y,
          fix.t,
          { x: 0, y: 0 },
        );
        assert.ok(Math.abs(sampled.x - fix.currentX) <= 0.00051, `${meta.id} current x ${fix.t}`);
        assert.ok(Math.abs(sampled.y - fix.currentY) <= 0.00051, `${meta.id} current y ${fix.t}`);
        const exact = audit.get(auditKey(boat.id, fix.t));
        assert.ok(exact !== undefined, `${meta.id} ${boat.id} audit ${fix.t}`);
        for (const key of ["x", "y", "waterX", "waterY", "currentX", "currentY"]) {
          assert.ok(Math.abs(fix[key] - exact[key]) <= 0.000500000001, `${meta.id} ${key} ${fix.t}`);
        }
        assert.ok(
          Math.abs(fix.waterX + fix.currentX - exact.groundX) <= 0.001000000001,
          `${meta.id} ground x ${fix.t}`,
        );
        assert.ok(
          Math.abs(fix.waterY + fix.currentY - exact.groundY) <= 0.001000000001,
          `${meta.id} ground y ${fix.t}`,
        );
      }
    }
  }
});

function hermiteEndpointDerivative(p0, ground0, p1, ground1, dt, u) {
  const u2 = u * u;
  return (
    (6 * u2 - 6 * u) * p0 +
    (3 * u2 - 4 * u + 1) * ground0 * dt +
    (-6 * u2 + 6 * u) * p1 +
    (3 * u2 - 2 * u) * ground1 * dt
  ) / dt;
}

test("Hermite endpoints use stored ground tangents while replay vectors close densely", () => {
  const pose = poseBuffer();
  for (const { meta, race } of auditedRaces) {
    for (const boat of race.boats) {
      const fixes = race.fixes[boat.id];
      for (let index = 0; index + 1 < fixes.length; index++) {
        const from = fixes[index];
        const to = fixes[index + 1];
        const dt = to.t - from.t;
        const gx0 = from.waterX + from.currentX;
        const gy0 = from.waterY + from.currentY;
        const gx1 = to.waterX + to.currentX;
        const gy1 = to.waterY + to.currentY;
        close(hermiteEndpointDerivative(from.x, gx0, to.x, gx1, dt, 0), gx0, 1e-12, "dx start");
        close(hermiteEndpointDerivative(from.y, gy0, to.y, gy1, dt, 0), gy0, 1e-12, "dy start");
        close(hermiteEndpointDerivative(from.x, gx0, to.x, gx1, dt, 1), gx1, 1e-12, "dx end");
        close(hermiteEndpointDerivative(from.y, gy0, to.y, gy1, dt, 1), gy1, 1e-12, "dy end");
        for (const u of [0, 0.2, 0.5, 0.8, 1]) {
          const t = from.t + u * dt;
          poseAt(race, boat.id, t, "smooth", pose);
          close(pose.groundX, pose.waterX + pose.currentX, 1e-12, `${meta.id} x closure`);
          close(pose.groundY, pose.waterY + pose.currentY, 1e-12, `${meta.id} y closure`);
          assert.equal(pose.telemetryProvenance, u === 0 || u === 1 ? "recorded-fix" : "reconstructed-from-fixes");
          const raw = poseAt(race, boat.id, t, "raw", poseBuffer());
          assert.equal(raw.telemetryProvenance, "recorded-fix");
          if (u > 0 && u < 1) {
            for (const key of ["waterX", "waterY", "currentX", "currentY"]) {
              assert.equal(raw[key], from[key], `${meta.id} raw ${key}`);
            }
          }
        }
      }
    }
  }
});

test("ground, water, and current made-good close for both legs", () => {
  const pose = poseBuffer();
  for (const { race } of auditedRaces) {
    for (const boat of race.boats) {
      const fixes = race.fixes[boat.id];
      for (let index = 0; index < fixes.length; index += 19) {
        poseAt(race, boat.id, fixes[index].t, "smooth", pose);
        for (const leg of ["beat", "run"]) {
          const water = waterMadeGoodToMark(pose, leg);
          const current = currentMadeGoodToMark(pose, leg);
          const ground = groundMadeGoodToMark(pose, leg);
          close(ground, water + current, 1e-12, `${boat.id} ${leg} VMG closure`);
          close(ground, vmgToMark(pose.sog, pose.cog, leg), 1e-12, `${boat.id} ${leg} ground VMG`);
        }
      }
    }
  }
});

function assertComponentEquation(result, fleet) {
  assert.equal(result.status, "ok");
  close(
    result.groundGainMeters,
    result.waterDeltaMeters + result.currentDeltaMeters + result.referenceNonlinearityMeters,
    1e-9,
    "ground component equation",
  );
  close(
    result.progressGainedMeters,
    result.waterDeltaMeters + result.currentDeltaMeters + result.componentResidualMeters,
    1e-9,
    "progress component equation",
  );
  close(
    result.componentResidualMeters,
    result.progressResidualMeters + result.referenceNonlinearityMeters,
    1e-9,
    "residual equation",
  );
  if (!fleet) close(result.referenceNonlinearityMeters, 0, 1e-9, "named reference nonlinearity");
  assert.deepEqual(result.componentProvenance, {
    water: "reconstructed-water-from-fixes",
    current: "reconstructed-current-from-fixes",
    ground: "derived-water-plus-current",
  });
}

test("named and fleet comparisons expose the exact alternative component decomposition", () => {
  for (const { race } of auditedRaces) {
    const ids = race.boats.map((boat) => boat.id);
    const range = { from: 5, to: 30 };
    assertComponentEquation(compareRange(race, {
      primaryBoatId: ids[0],
      reference: { kind: "boat", boatId: ids[1] },
      range,
    }), false);
    assertComponentEquation(compareRange(race, {
      primaryBoatId: ids[0],
      reference: { kind: "fleet-median", boatIds: ids },
      range,
    }), true);
  }
});

test("fleet component eligibility drops truncated and non-finite boats before one shared mask", () => {
  const race = structuredClone(auditedRaces[0].race);
  const ids = race.boats.map((boat) => boat.id);
  const [primaryId, truncatedId, nonFiniteId] = ids;
  race.fixes[truncatedId] = race.fixes[truncatedId].filter((fix) => fix.t >= 10);
  race.fixes[nonFiniteId].find((fix) => fix.t === 12).currentY = Number.NaN;
  const range = { from: 5, to: 30 };
  const result = compareRange(race, {
    primaryBoatId: primaryId,
    reference: { kind: "fleet-median", boatIds: ids },
    range,
  });
  const clean = compareRange(race, {
    primaryBoatId: primaryId,
    reference: { kind: "fleet-median", boatIds: ids.filter((id) => id !== truncatedId && id !== nonFiniteId) },
    range,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.reference.requestedCohortIds, ids);
  assert.deepEqual(result.reference.ineligibleCohortIds, [truncatedId, nonFiniteId]);
  assert.deepEqual(
    result.reference.eligibleCohortIds,
    ids.filter((id) => id !== truncatedId && id !== nonFiniteId),
  );
  assert.equal(result.componentCoverageMicros, clean.componentCoverageMicros);
  assert.equal(result.componentExcludedMicros, clean.componentExcludedMicros);
  assert.deepEqual(result.coverage, clean.coverage);
  assert.ok(result.boats.every((boat) => boat.boatId !== truncatedId && boat.boatId !== nonFiniteId));

  const eligibleFacts = result.reference.eligibleCohortIds.map((id) =>
    result.boats.find((boat) => boat.boatId === id),
  );
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  assert.equal(
    result.referenceFacts.waterMadeGoodMeters,
    median(eligibleFacts.map((boat) => boat.waterMadeGoodMeters)),
  );
  assert.equal(
    result.referenceFacts.currentMadeGoodMeters,
    median(eligibleFacts.map((boat) => boat.currentMadeGoodMeters)),
  );
  assert.equal(
    result.referenceFacts.groundMadeGoodMeters,
    median(eligibleFacts.map((boat) => boat.groundMadeGoodMeters)),
  );
});

test("fleet component eligibility requires the selected boat and at least two reference boats", () => {
  const race = structuredClone(auditedRaces[0].race);
  const ids = race.boats.map((boat) => boat.id);
  const single = compareRange(race, {
    primaryBoatId: ids[0],
    reference: { kind: "fleet-median", boatIds: [ids[0]] },
    range: { from: 5, to: 30 },
  });
  assert.equal(single.status, "insufficient-fleet-coverage");
  assert.deepEqual(single.reference.requestedCohortIds, [ids[0]]);
  assert.deepEqual(single.reference.eligibleCohortIds, [ids[0]]);

  race.fixes[ids[0]] = race.fixes[ids[0]].filter((fix) => fix.t >= 10);
  const selectedMissing = compareRange(race, {
    primaryBoatId: ids[0],
    reference: { kind: "fleet-median", boatIds: ids },
    range: { from: 5, to: 30 },
  });
  assert.notEqual(selectedMissing.status, "ok");
  assert.match(selectedMissing.invalidReason, /selected boat.*component coverage/i);
  assert.deepEqual(selectedMissing.reference.requestedCohortIds, ids);
  assert.ok(!selectedMissing.reference.eligibleCohortIds.includes(ids[0]));
});

test("public analysis preflight rejects every non-canonical serialized current field", () => {
  const canonicalRace = auditedRaces[0].race;
  const canonical = currentFieldSpecValidity(
    canonicalRace.environment.current,
    canonicalRace.seed,
    canonicalRace.course,
  );
  assert.equal(canonical.status, "valid");
  assert.ok(canonical.analyticMaxSpeedMps <= 0.55);
  const mutations = [
    ["kind", "layline-current-field-v2"],
    ["version", 2],
    ["provenance", "recorded-fix"],
    ["seed", 1],
    ["halfWidthMeters", 61],
    ["lengthMeters", 101],
    ["uMin", -1.4],
    ["uMax", 1.4],
    ["vMin", -0.2],
    ["vMax", 1.2],
    ["phase1Radians", 0],
    ["phase2Radians", 0],
    ["lineMeanFraction", 0.4],
    ["lineOscillationFraction", 0.11],
    ["linePeriodSeconds", 63],
    ["transitionHalfWidthFraction", 0.09],
    ["xBaseMps", 0.27],
    ["xAcrossCoefficientMps", -0.07],
    ["xTimeAmplitudeMps", 0.04],
    ["xTimePeriodSeconds", 49],
    ["xShearAmplitudeMps", 0.07],
    ["yBaseMps", -0.11],
    ["yAlongCoefficientMps", 0.03],
    ["yAlongCenter", 0.4],
    ["yTimeAmplitudeMps", 0.03],
    ["yTimePeriodSeconds", 62],
  ];
  for (const [field, value] of mutations) {
    const race = structuredClone(auditedRaces[0].race);
    race.environment.current[field] = value;
    const validity = raceAnalysisValidity(race, [race.boats[0].id]);
    assert.equal(validity.status, "invalid-sample", `${field} escaped preflight`);
    assert.match(validity.reason, /serialized current field/i);
    const result = compareRange(race, {
      primaryBoatId: race.boats[0].id,
      reference: { kind: "boat", boatId: race.boats[1].id },
      range: { from: 5, to: 30 },
    });
    assert.equal(result.status, "missing-boundary-data", `${field} exposed public facts`);
    assert.equal(result.primary, null, `${field} exposed primary facts`);
  }

  const overBound = structuredClone(auditedRaces[0].race);
  overBound.environment.current.xAcrossCoefficientMps = 1;
  assert.equal(
    raceAnalysisValidity(overBound, [overBound.boats[0].id]).status,
    "invalid-sample",
  );

  for (const hostile of [
    null,
    {},
    { ...canonicalRace.environment.current, extra: 1 },
    new Proxy({}, { ownKeys() { throw new Error("hostile current spec"); } }),
  ]) {
    const race = structuredClone(canonicalRace);
    race.environment.current = hostile;
    let validity;
    assert.doesNotThrow(() => {
      validity = raceAnalysisValidity(race, [race.boats[0].id]);
    });
    assert.equal(validity.status, "invalid-sample");
    assert.match(validity.reason, /serialized current field/i);
  }
});

test("current spec validation snapshots data descriptors without invoking accessors", () => {
  const canonicalRace = auditedRaces[0].race;
  for (const changeOnRead of [2, 3]) {
    const candidate = { ...canonicalRace.environment.current };
    let reads = 0;
    Object.defineProperty(candidate, "xBaseMps", {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return reads < changeOnRead
          ? canonicalRace.environment.current.xBaseMps
          : 0.2;
      },
    });
    let validity;
    assert.doesNotThrow(() => {
      validity = currentFieldSpecValidity(candidate, canonicalRace.seed, canonicalRace.course);
    });
    assert.equal(validity.status, "invalid", `change on read ${changeOnRead}`);
    assert.equal(reads, 0, `change on read ${changeOnRead} invoked getter`);
    assert.throws(
      () => sampleSeededCurrentField(candidate, 0, 0, 0, {}),
      RangeError,
    );
    assert.equal(reads, 0, `sampler invoked change-on-read ${changeOnRead} getter`);
  }

  const throwing = { ...canonicalRace.environment.current };
  let throwingReads = 0;
  Object.defineProperty(throwing, "xBaseMps", {
    configurable: true,
    enumerable: true,
    get() {
      throwingReads++;
      throw new Error("current getter must not run");
    },
  });
  assert.doesNotThrow(() => {
    assert.equal(
      currentFieldSpecValidity(throwing, canonicalRace.seed, canonicalRace.course).status,
      "invalid",
    );
  });
  assert.equal(throwingReads, 0);
  assert.throws(
    () => sampleSeededCurrentField(throwing, 0, 0, 0, {}),
    RangeError,
  );
  assert.equal(throwingReads, 0);
});

test("current spec reflection is protected and occurs once in descriptor order", () => {
  const canonicalRace = auditedRaces[0].race;
  const canonical = structuredClone(canonicalRace.environment.current);
  const requiredDescriptorCount = Reflect.ownKeys(canonical).length;

  const counters = { prototype: 0, ownKeys: 0, descriptor: 0, get: 0 };
  const observed = new Proxy(canonical, {
    getPrototypeOf(target) {
      counters.prototype++;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      counters.ownKeys++;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      counters.descriptor++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(target, key, receiver) {
      counters.get++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(
    currentFieldSpecValidity(observed, canonicalRace.seed, canonicalRace.course).status,
    "invalid",
  );
  assert.deepEqual(counters, {
    prototype: 1,
    ownKeys: 1,
    descriptor: requiredDescriptorCount,
    get: 0,
  });

  for (const [trap, expected] of [
    ["getPrototypeOf", { prototype: 1, ownKeys: 0, descriptor: 0 }],
    ["ownKeys", { prototype: 1, ownKeys: 1, descriptor: 0 }],
    ["getOwnPropertyDescriptor", { prototype: 1, ownKeys: 1, descriptor: 1 }],
  ]) {
    const counts = { prototype: 0, ownKeys: 0, descriptor: 0 };
    const hostile = new Proxy(structuredClone(canonical), {
      getPrototypeOf(target) {
        counts.prototype++;
        if (trap === "getPrototypeOf") throw new Error("prototype trap");
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        counts.ownKeys++;
        if (trap === "ownKeys") throw new Error("ownKeys trap");
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        counts.descriptor++;
        if (trap === "getOwnPropertyDescriptor") throw new Error("descriptor trap");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    let validity;
    assert.doesNotThrow(() => {
      validity = currentFieldSpecValidity(hostile, canonicalRace.seed, canonicalRace.course);
    });
    assert.equal(validity.status, "invalid", trap);
    assert.deepEqual(counts, expected, trap);
  }
});

test("current spec validation accepts serializer roundtrips and rejects non-plain shapes", () => {
  const canonicalRace = auditedRaces[0].race;
  const canonical = canonicalRace.environment.current;
  for (const candidate of [
    JSON.parse(JSON.stringify(canonical)),
    structuredClone(canonical),
  ]) {
    assert.equal(
      currentFieldSpecValidity(candidate, canonicalRace.seed, canonicalRace.course).status,
      "valid",
    );
  }

  class CurrentFieldRecord {}
  const classInstance = Object.assign(new CurrentFieldRecord(), canonical);
  const circular = { ...canonical };
  circular.xBaseMps = circular;
  const missing = { ...canonical };
  delete missing.yTimePeriodSeconds;
  for (const candidate of [
    null,
    [],
    classInstance,
    Object.assign(Object.create({ inherited: true }), canonical),
    Object.assign(Object.create(null), canonical),
    circular,
    { ...canonical, extra: 1 },
    missing,
  ]) {
    let validity;
    assert.doesNotThrow(() => {
      validity = currentFieldSpecValidity(candidate, canonicalRace.seed, canonicalRace.course);
    });
    assert.equal(validity.status, "invalid");
  }
});

test("run-phase boundary progress commits rounding before same-tick publication", () => {
  const boundaries = [
    ["long-beach", "nzl", 38.5, { x: -0.665, y: 102.783, dtf: 102.783, rank: 3, gapMeters: 26.879, gapSeconds: 4.993 }],
    ["long-beach", "aus", 42.5, { x: 2.789, y: 103.341, dtf: 103.341, rank: 6, gapMeters: 50.937, gapSeconds: 7.976 }],
    ["kestrel-sound", "fra", 34, { x: 5.254, y: 104.758, dtf: 104.758, rank: 2, gapMeters: 23.152, gapSeconds: 4.088 }],
  ];
  for (const [raceId, boatId, t, expected] of boundaries) {
    const race = auditedRaces.find(({ meta }) => meta.id === raceId).race;
    const progress = race.progress[boatId].find((sample) => sample.t === t);
    const fix = race.fixes[boatId].find((sample) => sample.t === t);
    assert.ok(progress !== undefined && fix !== undefined, `${raceId} ${boatId} t=${t}`);
    assert.equal(progress.leg, "run", `${raceId} ${boatId} leg`);
    assert.equal(progress.dtf, Math.round(Math.max(fix.y, 0) * 1000) / 1000, `${raceId} ${boatId} DTF`);
    assert.deepEqual(
      {
        x: fix.x,
        y: fix.y,
        dtf: progress.dtf,
        rank: progress.rank,
        gapMeters: progress.gapMeters,
        gapSeconds: progress.gapSeconds,
      },
      expected,
      `${raceId} ${boatId} exact boundary truth`,
    );
  }
});

test("default analyst cards equal the default race and route keeps prefix matching", () => {
  assert.deepEqual([...SUGGESTED_QUESTIONS], [...RACES[0].suggestedQuestions]);
  assert.equal(SUGGESTED_QUESTIONS[1], "How did JPN 18 take the lead");
  const routeSource = readFileSync(
    new URL("../src/app/api/layline/analyst/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /normalize\(question\)\.startsWith\(normalize\(suggestion\)\)/);
  assert.match(routeSource, /if \(matches\(question, leadChange\)\) return mockLeadChange\(race\)/);
  const cardSource = readFileSync(
    new URL("../src/components/layline/analyst/AnalystSection.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(cardSource, /usaRounding|fleet\.get\("usa"\).*The beat/);
  assert.match(cardSource, /boatId="jpn"[\s\S]*to=\{eventMarks\.jpnRounding/);
});

test("public analyst VMG schema states ground and water wind-axis equations", () => {
  const description = ANALYST_TOOLS.find((tool) => tool.name === "boat_state").description;
  assert.match(description, /ground wind-axis VMG = SOG\*cos\(COG - TWD\)/);
  assert.match(description, /water wind-axis counterpart = STW\*cos\(CTW - TWD\)/);
});

test("every audited downwind prose speed is recomputed by the production comparison window", () => {
  const source = readFileSync(new URL("../src/lib/layline/races.ts", import.meta.url), "utf8");
  const expected = {
    "long-beach": ["JPN 18", "13.3", "FRA 12", "12.6"],
    "kestrel-sound": ["GBR 21", "12.1"],
    "sable-reach": ["AUS 33", "13.9"],
  };
  for (const { meta, race } of auditedRaces) {
    const runFrom = Math.ceil(Math.max(...race.boats.map((boat) =>
      race.progress[boat.id].find((sample) => sample.leg === "run").t,
    )));
    const runTo = Math.floor(Math.min(...race.results.map((result) => result.elapsed)));
    const entries = [];
    for (let index = 0; index + 1 < race.boats.length; index += 2) {
      const comparison = compareBoats(
        race,
        race.boats[index].id,
        race.boats[index + 1].id,
        runFrom,
        runTo,
      );
      entries.push(comparison.a, comparison.b);
    }
    entries.sort((a, b) => Number(b.avgToMarkKnots) - Number(a.avgToMarkKnots) || a.boatId.localeCompare(b.boatId));
    const production = expected[meta.id].length === 4
      ? [entries[0].sail, entries[0].avgToMarkKnots, entries[1].sail, entries[1].avgToMarkKnots]
      : [entries[0].sail, entries[0].avgToMarkKnots];
    assert.deepEqual(production, expected[meta.id], `${meta.id} production downwind facts`);
    const block = source.slice(source.indexOf(`id: "${meta.id}"`) - 420, source.indexOf(`id: "${meta.id}"`) + 1);
    for (const fact of production) assert.ok(block.includes(String(fact)), `${meta.id} prose omits ${fact}`);
  }
});

test("guidance cadence has startup once, hard ceilings, and no PHASE_DONE refresh", () => {
  const perBoat = [];
  for (let tick = 0; tick < 20; tick++) perBoat.push(tacticalCandidateBudgetAtTick(tick, true, false));
  assert.deepEqual(perBoat.filter(Boolean), [2, 2]);
  assert.equal(perBoat.reduce((sum, count) => sum + count, 0), 4);
  assert.equal(perBoat.reduce((sum, count) => sum + count * 6, 0), 24);
  assert.equal(tacticalCandidateBudgetAtTick(0, true, false), 2);
  assert.equal(tacticalCandidateBudgetAtTick(1, true, false), 0);
  assert.equal(tacticalCandidateBudgetAtTick(10, false, false), 0);
  const finished = [];
  for (let tick = 0; tick < 40; tick++) {
    finished.push(tacticalCandidateBudgetAtTick(tick, true, true));
  }
  assert.deepEqual(finished, Array.from({ length: 40 }, () => 0));
});

function oracleLegAt(race, boatId, t) {
  let held = race.progress[boatId][0];
  for (const sample of race.progress[boatId]) {
    if (sample.t > t) break;
    held = sample;
  }
  return held.leg;
}

function oracleMark(race, leg) {
  if (leg === "beat") return race.course.windward;
  if (leg === "run") return {
    x: (race.course.startPin.x + race.course.startBoat.x) / 2,
    y: (race.course.startPin.y + race.course.startBoat.y) / 2,
  };
  return null;
}

function oracleProjection(fix, mark, channel) {
  const dx = mark.x - fix.x;
  const dy = mark.y - fix.y;
  const distance = Math.hypot(dx, dy);
  const qx = dx / distance;
  const qy = dy / distance;
  if (channel === "water") return fix.waterX * qx + fix.waterY * qy;
  if (channel === "current") return fix.currentX * qx + fix.currentY * qy;
  return (fix.waterX + fix.currentX) * qx + (fix.waterY + fix.currentY) * qy;
}

function oracleLinearCell(fromValue, toValue, fromU, toU, seconds) {
  return seconds * (
    fromValue * (toU - fromU) +
    ((toValue - fromValue) * (toU * toU - fromU * fromU)) / 2
  );
}

function oracleFixedCellComponents(race, boatId, range) {
  const fromMicros = Math.round(range.from * 1_000_000);
  const toMicros = Math.round(range.to * 1_000_000);
  const totals = { water: 0, current: 0, ground: 0 };
  const fixes = race.fixes[boatId];
  for (let index = 0; index + 1 < fixes.length; index++) {
    const from = fixes[index];
    const to = fixes[index + 1];
    const cellFrom = Math.round(from.t * 1_000_000);
    const cellTo = Math.round(to.t * 1_000_000);
    const overlapFrom = Math.max(fromMicros, cellFrom);
    const overlapTo = Math.min(toMicros, cellTo);
    if (overlapTo <= overlapFrom) continue;
    const leg = oracleLegAt(race, boatId, (cellFrom + cellTo) / 2_000_000);
    const mark = oracleMark(race, leg);
    if (mark === null) continue;
    const width = cellTo - cellFrom;
    const fromU = (overlapFrom - cellFrom) / width;
    const toU = (overlapTo - cellFrom) / width;
    const seconds = width / 1_000_000;
    for (const channel of ["water", "current", "ground"]) {
      totals[channel] += oracleLinearCell(
        oracleProjection(from, mark, channel),
        oracleProjection(to, mark, channel),
        fromU,
        toU,
        seconds,
      );
    }
  }
  return totals;
}

test("component made-good uses a test-owned consecutive-fix quadrature", () => {
  const { race } = auditedRaces.find(({ meta }) => meta.id === "kestrel-sound");
  const range = { from: 8, to: 35 };
  const result = compareRange(race, {
    primaryBoatId: race.boats[0].id,
    reference: { kind: "boat", boatId: race.boats[1].id },
    range,
  });
  assert.equal(result.status, "ok");
  for (const boat of race.boats.slice(0, 2)) {
    const facts = result.boats.find((candidate) => candidate.boatId === boat.id);
    const oracle = oracleFixedCellComponents(race, boat.id, range);
    close(facts.waterMadeGoodMeters, oracle.water, 1e-10, `${boat.id} water oracle`);
    close(facts.currentMadeGoodMeters, oracle.current, 1e-10, `${boat.id} current oracle`);
    close(facts.groundMadeGoodMeters, oracle.ground, 1e-10, `${boat.id} ground oracle`);
  }
});

test("every named pair is additive across arbitrary non-cell split points", () => {
  const comparisonFields = [
    "progressGainedMeters",
    "straightDeltaMeters",
    "maneuverWindowDeltaMeters",
    "residualMeters",
    "waterDeltaMeters",
    "currentDeltaMeters",
    "groundGainMeters",
    "referenceNonlinearityMeters",
    "progressResidualMeters",
    "componentResidualMeters",
  ];
  const boatFields = [
    "straightMadeGoodMeters",
    "maneuverWindowMadeGoodMeters",
    "waterMadeGoodMeters",
    "currentMadeGoodMeters",
    "groundMadeGoodMeters",
  ];
  let assertions = 0;
  for (const { meta, race } of auditedRaces) {
    const from = 8;
    const to = Math.min(...race.results.map((result) => result.elapsed)) - 0.75;
    const splitPoints = [
      from + (to - from) * 0.371 + 0.000001,
      from + (to - from) * 0.619 + 0.000003,
      meta.id === "kestrel-sound" ? 23.096666 : from + (to - from) * 0.503 + 0.000005,
    ].filter((split) => split > from && split < to);
    for (let a = 0; a < race.boats.length; a++) {
      for (let b = a + 1; b < race.boats.length; b++) {
        const request = {
          primaryBoatId: race.boats[a].id,
          reference: { kind: "boat", boatId: race.boats[b].id },
        };
        const whole = compareRange(race, { ...request, range: { from, to } });
        assert.equal(whole.status, "ok", `${meta.id} ${a}/${b} whole`);
        for (const split of splitPoints) {
          const left = compareRange(race, { ...request, range: { from, to: split } });
          const right = compareRange(race, { ...request, range: { from: split, to } });
          assert.equal(left.status, "ok");
          assert.equal(right.status, "ok");
          for (const field of comparisonFields) {
            close(whole[field], left[field] + right[field], 2e-9, `${meta.id} ${a}/${b} ${field} @ ${split}`);
            assertions++;
          }
          for (const boat of whole.boats) {
            const leftBoat = left.boats.find((candidate) => candidate.boatId === boat.boatId);
            const rightBoat = right.boats.find((candidate) => candidate.boatId === boat.boatId);
            for (const field of boatFields) {
              close(boat[field], leftBoat[field] + rightBoat[field], 2e-9, `${meta.id} ${boat.boatId} ${field} @ ${split}`);
              assertions++;
            }
          }
        }
      }
    }
  }
  assert.equal(assertions, 2_700);
});

test("all analyst telemetry entries reject hostile current specs without reading getters", () => {
  const canonicalRace = auditedRaces[0].race;
  const shapes = [
    ["mutated-value", (spec) => ({ value: { ...spec, xBaseMps: spec.xBaseMps + 0.001 }, reads: () => 0 })],
    ["accessor", (spec) => {
      let reads = 0;
      const value = { ...spec };
      Object.defineProperty(value, "xBaseMps", { enumerable: true, get() { reads++; throw new Error("getter invoked"); } });
      return { value, reads: () => reads };
    }],
    ["proxy", (spec) => {
      let reads = 0;
      const value = new Proxy({ ...spec }, { get() { reads++; throw new Error("proxy getter invoked"); } });
      return { value, reads: () => reads };
    }],
    ["missing", (spec) => {
      const value = { ...spec };
      delete value.yTimePeriodSeconds;
      return { value, reads: () => 0 };
    }],
    ["extra", (spec) => ({ value: { ...spec, extra: 1 }, reads: () => 0 })],
    ["symbol", (spec) => {
      const value = { ...spec };
      value[Symbol("extra")] = 1;
      return { value, reads: () => 0 };
    }],
    ["exotic", (spec) => ({ value: Object.assign(Object.create({ inherited: true }), spec), reads: () => 0 })],
  ];
  const invalidEvidence = (value, label) => {
    assert.ok(value !== null && typeof value === "object", label);
    assert.match(value.error, /serialized current field/i, label);
    if (Array.isArray(value)) assert.equal(value.length, 0, label);
    if ("rows" in value) assert.deepEqual(value.rows, [], label);
    if ("lineLengthMeters" in value) assert.equal(value.lineLengthMeters, null, label);
  };
  for (const [shape, build] of shapes) {
    const race = structuredClone(canonicalRace);
    const hostile = build(race.environment.current);
    race.environment.current = hostile.value;
    const ids = race.boats.map((boat) => boat.id);
    const direct = [
      standingsAt(race, 10),
      boatState(race, ids[0], 10),
      compareBoats(race, ids[0], ids[1], 8, 35),
      compareRangeForAnalyst(race, {
        primaryBoatId: ids[0],
        reference: { kind: "boat", boatId: ids[1] },
        range: { from: 8, to: 35 },
      }),
      detectManeuvers(race, ids[0]),
      startReport(race),
    ];
    direct.forEach((value, index) => invalidEvidence(value, `${shape} direct ${index}`));
    const dispatched = [
      runTool(race, "standings_at", { t: 10 }),
      runTool(race, "boat_state", { boatId: ids[0], t: 10 }),
      runTool(race, "compare_boats", { a: ids[0], referenceKind: "boat", b: ids[1], cohortBoatIds: [], t0: 8, t1: 35 }),
      runTool(race, "maneuvers", { boatId: ids[0] }),
      runTool(race, "start_report", {}),
    ].map(JSON.parse);
    dispatched.forEach((value, index) => invalidEvidence(value, `${shape} dispatch ${index}`));
    assert.equal(hostile.reads(), 0, `${shape} invoked a hostile getter`);
  }
});

function raceFingerprint(race) {
  return createHash("sha256").update(JSON.stringify({
    environment: race.environment,
    fixes: race.fixes,
    progress: race.progress,
    events: race.events,
    results: race.results,
    tMin: race.tMin,
    tMax: race.tMax,
  })).digest("hex");
}

test("all three registered races are deterministic and retain registry invariants", () => {
  const expectedFingerprints = {
    "long-beach": "db84b939853daf6b8d9ee997479c4e4c22785b80c97d5b2dec6b4bc1f7c35aa8",
    "kestrel-sound": "e8627dfd7a55bd3f7ecdafad5de9768e8c6eb6f96b7cfc40b7a1d5445b8a0e78",
    "sable-reach": "e4c1c662f8915fd1a80543fd118b997c8d7ab885da0ded06690063168ddbae93",
  };
  const fingerprints = {};
  for (const { meta, race } of auditedRaces) {
    assert.equal(race.seed, meta.seed);
    assert.equal(race.results.length, race.boats.length);
    assert.deepEqual(race.results.map((result) => result.rank), [1, 2, 3, 4, 5, 6]);
    assert.equal(new Set(race.results.map((result) => result.boatId)).size, race.boats.length);
    assert.equal(JSON.stringify(race), JSON.stringify(generateRace(meta.seed)));
    fingerprints[meta.id] = raceFingerprint(race);
  }
  assert.deepEqual(fingerprints, expectedFingerprints);
});
