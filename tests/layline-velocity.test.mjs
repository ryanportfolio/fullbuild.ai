import assert from "node:assert/strict";
import { test } from "node:test";

const {
  courseFromVector,
  leewayDegrees,
  projectVelocityComponentsOntoBearing,
  projectVelocityOntoBearing,
  vectorFromSpeedCourse,
  velocityFromComponents,
  waterCourseFromHeading,
  windAxisVmgFromComponents,
  wrap360,
  wrapSigned,
} = await import("../src/lib/layline/velocity.ts");

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("course angles cover quadrants, north wrap, and positive zero", () => {
  assert.equal(courseFromVector(0, 1), 0);
  assert.equal(courseFromVector(1, 0), 90);
  assert.equal(courseFromVector(0, -1), 180);
  assert.equal(courseFromVector(-1, 0), 270);
  close(courseFromVector(-1, 1), 315);
  assert.equal(wrap360(360), 0);
  assert.equal(wrap360(-0), 0);
  assert.equal(wrapSigned(359), -1);
  assert.equal(wrapSigned(181), -179);
  assert.equal(Object.is(wrap360(-0), -0), false);
});

test("zero and sub-threshold vectors have null course/set", () => {
  for (const [x, y] of [[0, 0], [-0, 0], [1e-13, -1e-13]]) {
    assert.equal(courseFromVector(x, y), null);
  }
  const result = velocityFromComponents(0, 0, 0, 0, {});
  assert.equal(result.ctw, null);
  assert.equal(result.currentSet, null);
  assert.equal(result.cog, null);
  assert.equal(Object.is(result.stw, -0), false);
  assert.equal(Object.is(result.sog, -0), false);
});

test("vector conversion and opposing sums close in every component", () => {
  const water = vectorFromSpeedCourse(5, 90, {});
  close(water.x, 5);
  close(water.y, 0);
  const result = velocityFromComponents(water.x, water.y, -5, 0, {});
  close(result.groundX, result.waterX + result.currentX);
  close(result.groundY, result.waterY + result.currentY);
  assert.ok(result.sog <= 1e-12);
  assert.equal(result.cog, null);

  for (const course of [0, 45, 90, 135, 180, 225, 270, 315, 359.999]) {
    const vector = vectorFromSpeedCourse(7.25, course, {});
    close(Math.hypot(vector.x, vector.y), 7.25);
    close(courseFromVector(vector.x, vector.y), wrap360(course), 1e-10);
  }
});

test("course-frame projection handles wrap, zero, and exact component closure", () => {
  assert.equal(projectVelocityOntoBearing(0, 4, 0), 4);
  assert.equal(projectVelocityOntoBearing(4, 0, 90), 4);
  const east = projectVelocityComponentsOntoBearing(1, 2, 3, 4, 90);
  assert.ok(east);
  close(east.water, 1);
  close(east.current, 3);
  close(east.ground, 4);
  assert.equal(east.ground, east.water + east.current);
  close(projectVelocityOntoBearing(-3, 4, 359), projectVelocityOntoBearing(-3, 4, -1));
  close(projectVelocityOntoBearing(-3, 4, 719), projectVelocityOntoBearing(-3, 4, 359));

  for (const bearing of [-720, -0, 0, 360, 720]) {
    const projection = projectVelocityComponentsOntoBearing(0, 0, -0, 0, bearing);
    assert.deepEqual(projection, { water: 0, current: 0, ground: 0 });
    assert.equal(Object.is(projection.water, -0), false);
    assert.equal(Object.is(projection.current, -0), false);
    assert.equal(Object.is(projection.ground, -0), false);
  }

  for (const bearing of [0, 45, 90, 179.5, 359.999]) {
    const projection = windAxisVmgFromComponents(3.25, -1.5, -0.4, 0.7, bearing);
    assert.ok(projection);
    assert.equal(projection.ground, projection.water + projection.current);
  }
});

test("projection rejects null angles, non-finite values, and overflow without leaking unsafe numbers", () => {
  for (const value of [null, Number.NaN, Infinity, -Infinity]) {
    assert.equal(projectVelocityOntoBearing(1, 2, value), null);
    assert.equal(windAxisVmgFromComponents(1, 2, 3, 4, value), null);
  }
  for (const value of [Number.NaN, Infinity, -Infinity]) {
    assert.equal(projectVelocityOntoBearing(value, 0, 0), null);
    assert.equal(projectVelocityOntoBearing(0, value, 0), null);
    assert.equal(windAxisVmgFromComponents(value, 0, 0, 0, 0), null);
    assert.equal(windAxisVmgFromComponents(0, value, 0, 0, 0), null);
    assert.equal(windAxisVmgFromComponents(0, 0, value, 0, 0), null);
    assert.equal(windAxisVmgFromComponents(0, 0, 0, value, 0), null);
  }
  assert.equal(projectVelocityOntoBearing(Number.MAX_VALUE, Number.MAX_VALUE, 45), null);
  assert.equal(
    windAxisVmgFromComponents(Number.MAX_VALUE, 0, Number.MAX_VALUE, 0, 90),
    null,
  );
});

test("component interpolation preserves water plus current closure", () => {
  const a = { waterX: 2, waterY: -1, currentX: 0.4, currentY: 0.1 };
  const b = { waterX: -3, waterY: 4, currentX: -0.2, currentY: 0.5 };
  for (let step = 0; step <= 100; step++) {
    const u = step / 100;
    const lerp = (left, right) => left + (right - left) * u;
    const result = velocityFromComponents(
      lerp(a.waterX, b.waterX), lerp(a.waterY, b.waterY),
      lerp(a.currentX, b.currentX), lerp(a.currentY, b.currentY), {},
    );
    close(result.groundX, result.waterX + result.currentX);
    close(result.groundY, result.waterY + result.currentY);
  }
});

test("extracted leeway and heading-to-water-course goldens preserve simulator behavior", () => {
  const expected = new Map([[-70, 0], [-12, -4], [0, 0], [12, 4], [70, 0]]);
  for (const [twa, value] of expected) {
    assert.equal(leewayDegrees(twa), value);
    assert.equal(Object.is(leewayDegrees(twa), -0), false);
  }
  assert.deepEqual(waterCourseFromHeading(0, 44), { twa: -44, leeway: -2.08, ctw: 46.08 });
  assert.deepEqual(waterCourseFromHeading(0, 316), { twa: 44, leeway: 2.08, ctw: 313.92 });
  const north = waterCourseFromHeading(359, 1);
  assert.equal(north.twa, -2);
  assert.ok(north.ctw >= 0 && north.ctw < 360);
});

test("velocity primitives reject non-finite and overflow rather than emit unsafe values", () => {
  for (const value of [Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => courseFromVector(value, 0), RangeError);
    assert.throws(() => vectorFromSpeedCourse(1, value, {}), RangeError);
    assert.throws(() => velocityFromComponents(value, 0, 0, 0, {}), RangeError);
    assert.throws(() => waterCourseFromHeading(value, 0), RangeError);
    assert.throws(() => leewayDegrees(value), RangeError);
  }
  assert.throws(() => vectorFromSpeedCourse(-1, 0, {}), RangeError);
  assert.throws(() => velocityFromComponents(Number.MAX_VALUE, 0, Number.MAX_VALUE, 0, {}), RangeError);
});
