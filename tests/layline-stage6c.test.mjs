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

const { createPose, poseAt } = await import("../src/lib/layline/interpolate.ts");
const { sampleSeededCurrentField } = await import("../src/lib/layline/current.ts");
const { deg, knots } = await import("../src/lib/layline/format.ts");
const { boatState } = await import("../src/lib/layline/analyst/tools.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

async function surfaces() {
  return import("../src/lib/layline/surfaces.ts");
}

test("seeded current render grids are deterministic, bounded, reusable, and time explicit", async () => {
  const {
    CURRENT_FIELD_3D_MAX_GLYPHS,
    CURRENT_FIELD_SVG_MAX_GLYPHS,
    CURRENT_FIELD_PROVENANCE,
    createCurrentFieldGrid,
    sampleCurrentFieldGrid,
  } = await surfaces();
  const race = generateRace(RACES[0].seed);
  assert.equal(CURRENT_FIELD_3D_MAX_GLYPHS, 48);
  assert.equal(CURRENT_FIELD_SVG_MAX_GLYPHS, 24);
  assert.equal(CURRENT_FIELD_PROVENANCE, "Seeded current field");

  const grid3d = createCurrentFieldGrid(race, CURRENT_FIELD_3D_MAX_GLYPHS);
  const glyphRefs = grid3d.glyphs.slice();
  sampleCurrentFieldGrid(race, 0, grid3d);
  const atZero = grid3d.glyphs.map((glyph) => [glyph.x, glyph.y, glyph.currentX, glyph.currentY]);
  sampleCurrentFieldGrid(race, 0, grid3d);
  assert.equal(grid3d.glyphs.length, 48);
  assert.deepEqual(grid3d.glyphs.map((glyph) => [glyph.x, glyph.y, glyph.currentX, glyph.currentY]), atZero);
  assert.ok(grid3d.glyphs.every((glyph, index) => glyph === glyphRefs[index]));

  for (const glyph of grid3d.glyphs) {
    const direct = sampleSeededCurrentField(race.environment.current, glyph.x, glyph.y, 0, {});
    assert.equal(glyph.currentX, direct.x);
    assert.equal(glyph.currentY, direct.y);
  }

  sampleCurrentFieldGrid(race, 1, grid3d);
  assert.ok(grid3d.glyphs.some((glyph, index) => glyph.currentX !== atZero[index][2] || glyph.currentY !== atZero[index][3]));
  const gridSvg = createCurrentFieldGrid(race, CURRENT_FIELD_SVG_MAX_GLYPHS);
  sampleCurrentFieldGrid(race, 0, gridSvg);
  assert.equal(gridSvg.glyphs.length, 24);
  assert.equal(gridSvg.sampledAt, 0);
});

test("vector surface closes from recorded/reconstructed pose components and stays separate from seeded field", async () => {
  const {
    createVectorSurfaceModel,
    sampleVectorSurface,
  } = await surfaces();
  const race = generateRace(RACES[1].seed);
  const boatId = race.boats[0].id;
  const fixes = race.fixes[boatId];
  const exactPose = poseAt(race, boatId, fixes[12].t, "smooth", createPose());
  const exact = sampleVectorSurface(exactPose, createVectorSurfaceModel());
  assert.equal(exact.caption, "Recorded fix components");
  assert.equal(exact.currentCaption, "Recorded current sample");
  assert.equal(exact.ground.x, exact.water.x + exact.current.x);
  assert.equal(exact.ground.y, exact.water.y + exact.current.y);

  const t = (fixes[12].t + fixes[13].t) / 2;
  const interiorPose = poseAt(race, boatId, t, "smooth", createPose());
  const interior = sampleVectorSurface(interiorPose, createVectorSurfaceModel());
  assert.equal(interior.caption, "Reconstructed from recorded fixes");
  assert.equal(interior.currentCaption, "Reconstructed current from recorded fixes");
  assert.equal(interior.ground.x, interior.water.x + interior.current.x);
  assert.equal(interior.ground.y, interior.water.y + interior.current.y);
  const direct = sampleSeededCurrentField(
    race.environment.current,
    interiorPose.x,
    interiorPose.y,
    t,
    {},
  );
  assert.ok(direct.x !== interior.current.x || direct.y !== interior.current.y);
  assert.equal(interior.ground.x, interiorPose.groundX);
  assert.equal(interior.ground.y, interiorPose.groundY);
});

test("vector surface ignores every derived Pose scalar and rejects hostile authoritative components", async () => {
  const { createVectorSurfaceModel, sampleVectorSurface } = await surfaces();
  const race = generateRace(RACES[0].seed);
  const boatId = race.boats[0].id;
  const pose = poseAt(race, boatId, race.fixes[boatId][20].t, "smooth", createPose());
  const expected = structuredClone(sampleVectorSurface(pose, createVectorSurfaceModel()));

  const finiteTamper = {
    ...pose,
    stw: 701,
    ctw: 37,
    currentDrift: 702,
    currentSet: 83,
    groundX: 703,
    groundY: -704,
    sog: 705,
    cog: 149,
  };
  assert.deepEqual(
    sampleVectorSurface(finiteTamper, createVectorSurfaceModel()),
    expected,
    "finite derived-scalar tampering changed the public vector model",
  );

  const nonfiniteTamper = {
    ...pose,
    stw: Number.NaN,
    ctw: Number.POSITIVE_INFINITY,
    currentDrift: Number.NEGATIVE_INFINITY,
    currentSet: Number.NaN,
    groundX: Number.POSITIVE_INFINITY,
    groundY: Number.NaN,
    sog: Number.POSITIVE_INFINITY,
    cog: Number.NEGATIVE_INFINITY,
  };
  assert.deepEqual(
    sampleVectorSurface(nonfiniteTamper, createVectorSurfaceModel()),
    expected,
    "non-authoritative NaN/Infinity leaked into the public vector model",
  );

  for (const components of [
    [Number.NaN, 0, 0, 0],
    [0, Number.POSITIVE_INFINITY, 0, 0],
    [0, 0, Number.NEGATIVE_INFINITY, 0],
    [0, 0, 0, Number.NaN],
    [Number.MAX_VALUE, 0, Number.MAX_VALUE, 0],
  ]) {
    const hostile = {
      ...pose,
      waterX: components[0],
      waterY: components[1],
      currentX: components[2],
      currentY: components[3],
    };
    let model;
    assert.doesNotThrow(() => {
      model = sampleVectorSurface(hostile, createVectorSurfaceModel());
    });
    assert.equal(model.status, "invalid-components");
    assert.equal(model.water, null);
    assert.equal(model.current, null);
    assert.equal(model.ground, null);
  }

  const zero = sampleVectorSurface({
    ...pose,
    waterX: -0,
    waterY: -0,
    currentX: -0,
    currentY: 0,
  }, createVectorSurfaceModel());
  assert.equal(zero.status, "valid");
  for (const leg of [zero.water, zero.current, zero.ground]) {
    assert.ok(leg);
    assert.equal(leg.speed, 0);
    assert.equal(leg.course, null);
    assert.equal(Object.is(leg.x, -0), false);
    assert.equal(Object.is(leg.y, -0), false);
  }

  const cardinal = sampleVectorSurface({
    ...pose,
    waterX: 0,
    waterY: 2,
    currentX: 1,
    currentY: 0,
  }, createVectorSurfaceModel());
  assert.equal(cardinal.status, "valid");
  assert.equal(cardinal.water.course, 0);
  assert.equal(cardinal.current.course, 90);
  assert.equal(cardinal.ground.x, 1);
  assert.equal(cardinal.ground.y, 2);
  assert.equal(cardinal.ground.speed, Math.hypot(1, 2));

  const cancelled = sampleVectorSurface({
    ...pose,
    waterX: 1,
    waterY: 0,
    currentX: -1,
    currentY: 0,
  }, createVectorSurfaceModel());
  assert.equal(cancelled.status, "valid");
  assert.equal(cancelled.ground.speed, 0);
  assert.equal(cancelled.ground.course, null);

  const extreme = sampleVectorSurface({
    ...pose,
    waterX: Number.MAX_VALUE / 4,
    waterY: 0,
    currentX: Number.MAX_VALUE / 4,
    currentY: 0,
  }, createVectorSurfaceModel());
  assert.equal(extreme.status, "valid");
  assert.ok([extreme.water, extreme.current, extreme.ground].every((leg) =>
    leg !== null && [leg.x, leg.y, leg.speed, leg.course].every((value) =>
      value === null || Number.isFinite(value))));
});

test("truth marker identity covers race object, boat, replay lens, truth mode, and measured window", async () => {
  const { chartTruthMarkerCacheKey } = await surfaces();
  const race = generateRace(RACES[0].seed);
  const same = () => chartTruthMarkerCacheKey(race, "usa", "smooth", true, 12, 21);
  const baseline = same();
  assert.equal(same(), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(structuredClone(race), "usa", "smooth", true, 12, 21), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(race, "gbr", "smooth", true, 12, 21), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(race, "usa", "raw", true, 12, 21), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(race, "usa", "smooth", false, 12, 21), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(race, "usa", "smooth", true, 11, 21), baseline);
  assert.notEqual(chartTruthMarkerCacheKey(race, "usa", "smooth", true, 12, 22), baseline);
});

test("one vector render model supplies 3D, 2D, no-WebGL, truth, and analyst display numbers", async () => {
  const { createVectorSurfaceModel, sampleVectorSurface } = await surfaces();
  const race = generateRace(RACES[0].seed);
  const boatId = race.boats[0].id;
  const fix = race.fixes[boatId].find((candidate) => candidate.t >= 5);
  assert.ok(fix);
  const pose = poseAt(race, boatId, fix.t, "smooth", createPose());
  const three = sampleVectorSurface(pose, createVectorSurfaceModel());
  const two = sampleVectorSurface(pose, createVectorSurfaceModel());
  const fallback = sampleVectorSurface(pose, createVectorSurfaceModel());
  assert.deepEqual(two, three);
  assert.deepEqual(fallback, three);
  const analyst = boatState(race, boatId, fix.t);
  assert.ok(!("error" in analyst));
  assert.equal(knots(three.water.speed), analyst.stwKnots);
  assert.equal(three.water.course === null ? "-" : deg(three.water.course), analyst.ctwDeg);
  assert.equal(knots(three.current.speed), analyst.currentDriftKnots);
  assert.equal(three.current.course === null ? "-" : deg(three.current.course), analyst.currentSetDeg);
  assert.equal(knots(three.ground.speed), analyst.sogKnots);
  assert.equal(three.ground.course === null ? "-" : deg(three.ground.course), analyst.cogDeg);
  assert.equal(three.water.x, analyst.waterX);
  assert.equal(three.current.x, analyst.currentX);
  assert.equal(three.ground.x, analyst.groundX);
});

test("inspection cadence is at most one refresh per replay second and settles paused scrubs at 80 ms", async () => {
  const {
    createInspectionCadence,
    createInspectionPlayingCadenceBudget,
    inspectionCadenceStep,
  } = await surfaces();
  const race = generateRace(RACES[0].seed);
  const otherRace = generateRace(RACES[1].seed);
  let cadence = createInspectionCadence();
  let result = inspectionCadenceStep(cadence, { race, boatId: "usa", mode: "smooth", t: 10.1, playing: true, frozen: false }, 1000);
  cadence = result.state;
  assert.equal(result.action, "refresh");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "gbr", mode: "raw", t: 10.2, playing: true, frozen: false }, 1001);
  cadence = result.state;
  assert.equal(result.action, "hold", "race A then race B refreshed twice inside replay second 10");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "gbr", mode: "raw", t: 10.999, playing: true, frozen: false }, 1010);
  cadence = result.state;
  assert.equal(result.action, "hold");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 10.999, playing: true, frozen: false }, 1011);
  cadence = result.state;
  assert.equal(result.action, "hold");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 11, playing: true, frozen: false }, 1020);
  cadence = result.state;
  assert.equal(result.action, "refresh");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 11.25, playing: false, frozen: false }, 1030);
  cadence = result.state;
  assert.equal(result.action, "schedule");
  assert.equal(result.dueAtMs, 1110);
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 11.25, playing: false, frozen: false }, 1109);
  cadence = result.state;
  assert.equal(result.action, "hold");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 11.25, playing: false, frozen: false }, 1110);
  cadence = result.state;
  assert.equal(result.action, "refresh");
  result = inspectionCadenceStep(cadence, { race: otherRace, boatId: "usa", mode: "smooth", t: 11.5, playing: false, frozen: true }, 1111);
  assert.equal(result.action, "refresh");

  const sharedBudget = createInspectionPlayingCadenceBudget();
  assert.deepEqual(Object.keys(sharedBudget), ["playingSecond"]);
  let firstMount = createInspectionCadence(sharedBudget);
  result = inspectionCadenceStep(firstMount, { race, boatId: "usa", mode: "smooth", t: 20.1, playing: true, frozen: false }, 0);
  firstMount = result.state;
  assert.equal(result.action, "refresh");
  let keyedRemount = createInspectionCadence(sharedBudget);
  result = inspectionCadenceStep(keyedRemount, { race: otherRace, boatId: "gbr", mode: "raw", t: 20.2, playing: true, frozen: false }, 1);
  keyedRemount = result.state;
  assert.equal(result.action, "hold", "keyed race remount bypassed the shared replay-second budget");
  assert.equal(result.state.refreshedT, null);
  result = inspectionCadenceStep(keyedRemount, { race: otherRace, boatId: "gbr", mode: "raw", t: 21, playing: true, frozen: false }, 2);
  assert.equal(result.action, "refresh");

  let paused = createInspectionCadence();
  result = inspectionCadenceStep(paused, { race, boatId: "usa", mode: "smooth", t: 30.25, playing: false, frozen: false }, 200);
  paused = result.state;
  assert.equal(result.action, "schedule");
  assert.equal(result.dueAtMs, 280);
  result = inspectionCadenceStep(paused, { race, boatId: "usa", mode: "smooth", t: 30.25, playing: false, frozen: false }, 279);
  paused = result.state;
  assert.equal(result.action, "hold");
  result = inspectionCadenceStep(paused, { race, boatId: "usa", mode: "smooth", t: 30.25, playing: false, frozen: false }, 280);
  paused = result.state;
  assert.equal(result.action, "refresh");
  result = inspectionCadenceStep(paused, { race, boatId: "usa", mode: "raw", t: 30.25, playing: false, frozen: true }, 281);
  assert.equal(result.action, "refresh", "frozen mode selection did not refresh immediately");
});

test("inspection surface binds one selected boat, exact fix identity, exact samplers, and at most two immutable traces", async () => {
  const { buildLaylineInspectionSurface } = await surfaces();
  const race = generateRace(RACES[2].seed);
  const boatId = race.boats[0].id;
  const fixes = race.fixes[boatId];
  const fixIndex = fixes.findIndex((fix) => fix.t >= 5);
  const t = (fixes[fixIndex].t + fixes[fixIndex + 1].t) / 2;
  const first = buildLaylineInspectionSurface(race, boatId, t);
  const second = buildLaylineInspectionSurface(race, boatId, t);
  assert.equal(first.boatId, boatId);
  assert.equal(first.fixIndex, fixIndex);
  assert.equal(first.sampledAt, fixes[fixIndex].t);
  assert.equal(first.provenance, "Seeded current field");
  assert.ok(first.traces.length <= 2);
  assert.ok(first.traces.every((entry) => Object.isFrozen(entry.trace)));
  assert.deepEqual(first.traces.map((entry) => entry.side), ["port", "starboard"]);
  assert.ok(first.traces.every((entry) => entry.trace.status !== "invalid"));
  assert.ok(first.traces.every((entry, index) => entry.trace === second.traces[index].trace));
});

test("Stage 6C production surfaces are mounted with bounded ownership and exact provenance labels", () => {
  const scene = readFileSync(new URL("../src/components/layline/scene/LaylineScene.tsx", import.meta.url), "utf8");
  const field = readFileSync(new URL("../src/components/layline/scene/CurrentField.tsx", import.meta.url), "utf8");
  const chart = readFileSync(new URL("../src/components/layline/svg/ChartView.tsx", import.meta.url), "utf8");
  const still = readFileSync(new URL("../src/components/layline/svg/TrackChart.tsx", import.meta.url), "utf8");
  const triangle = readFileSync(new URL("../src/components/layline/hud/VectorTriangle.tsx", import.meta.url), "utf8");
  assert.match(scene, /<CurrentField race=\{race\}/);
  assert.match(field, /InstancedMesh/);
  assert.match(field, /CURRENT_FIELD_3D_MAX_GLYPHS/);
  assert.match(field, /geometry\.dispose\(\)/);
  assert.match(field, /material\.dispose\(\)/);
  assert.match(chart, /CURRENT_FIELD_PROVENANCE/);
  assert.match(still, /sampleCurrentFieldGrid\(race, 0,/);
  assert.match(triangle, /Recorded fix components/);
  assert.match(triangle, /Reconstructed from recorded fixes/);
  assert.match(triangle, /ref=\{currentCaption\}/);
  assert.match(triangle, /setText\(nodes\.currentCaption, model\.currentCaption\)/);
  assert.match(triangle, /model\.status !== "valid"/);
  assert.match(triangle, /setLineVisible\(nodes\.water, false\)/);
  assert.doesNotMatch(field, /new (?:Matrix4|Object3D|ConeGeometry|MeshBasicMaterial)\([^)]*\)[\s\S]{0,120}useFrame/);
});

test("trace ownership stays out of physics and phone/reduced-motion surfaces retain the evidence", () => {
  const simulator = readFileSync(new URL("../src/lib/layline/sim.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/components/layline/LaylineApp.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/prototype/layline/layline.module.css", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/app/prototype/layline/races/RaceWorkspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(simulator, /traceLaylineInspection|cachedTraceLaylineInspection/);
  assert.match(app, /buildLaylineInspectionSurface/);
  assert.match(app, /<Instruments race=\{race\} \/>/);
  assert.match(app, /live && !analysisActive \? \(\s*<Instruments/);
  assert.match(workspace, /key=\{raceId\}/);
  assert.match(workspace, /inspectionCadenceBudget=\{inspectionCadenceBudget\}/);
  assert.match(app, /createInspectionCadence\(budget\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.dockRight/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.vectorTriangle/);
});
