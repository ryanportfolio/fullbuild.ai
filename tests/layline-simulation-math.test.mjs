import assert from "node:assert/strict";
import { test } from "node:test";

const {
  simulationAcos,
  simulationAtan2,
  simulationCos,
  simulationCourseUnitVector,
  simulationExp,
  simulationHypot,
  simulationLog,
  simulationSin,
  simulationSqrt,
  simulationVelocityFromComponents,
  simulationVectorFromSpeedCourse,
} = await import("../src/lib/layline/simulation-math.ts");

const SOURCE_ERROR = 7e-13;

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: non-finite result`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
  assert.equal(Object.is(actual, -0), false, `${label}: negative zero`);
}

test("named native-source wrappers stay accurate over every simulator input domain", () => {
  let probes = 0;
  for (let i = 0; i <= 20_000; i++) {
    const unit = i / 20_000;
    const expInput = -10 + 11 * unit;
    close(simulationExp(expInput), Math.exp(expInput), SOURCE_ERROR, `exp ${expInput}`);
    const logInput = 2 ** (-32 * (1 - unit));
    close(simulationLog(logInput), Math.log(logInput), SOURCE_ERROR, `log ${logInput}`);
    const square = 100_000 * unit;
    close(simulationSqrt(square), Math.sqrt(square), SOURCE_ERROR, `sqrt ${square}`);
    const cosine = -1 + 2 * unit;
    close(simulationAcos(cosine), Math.acos(cosine), SOURCE_ERROR, `acos ${cosine}`);
    probes += 4;
  }
  for (let y = -1_000; y <= 1_000; y += 20) {
    for (let x = -1_000; x <= 1_000; x += 20) {
      close(simulationAtan2(y, x), Math.atan2(y, x), SOURCE_ERROR, `atan2 ${y},${x}`);
      close(simulationHypot(x, y), Math.hypot(x, y), SOURCE_ERROR, `hypot ${x},${y}`);
      probes += 2;
    }
  }
  assert.equal(probes, 100_406);
});

test("deterministic trig covers current time/phase and every course quadrant", () => {
  let probes = 0;
  for (let i = -32_000; i <= 32_000; i++) {
    const radians = (i / 2_000) * Math.PI;
    close(simulationSin(radians), Math.sin(radians), 3e-13, `sin ${radians}`);
    close(simulationCos(radians), Math.cos(radians), 3e-13, `cos ${radians}`);
    probes += 2;
  }
  for (let course = -720; course <= 720; course += 0.125) {
    const vector = simulationCourseUnitVector(course, {});
    const radians = course * Math.PI / 180;
    close(vector.x, Math.sin(radians), 3e-13, `course x ${course}`);
    close(vector.y, Math.cos(radians), 3e-13, `course y ${course}`);
    probes += 2;
  }
  assert.equal(probes, 151_044);
});

test("simulator vector sources preserve finite positive-zero and exact closure semantics", () => {
  let probes = 0;
  for (let speed = 0; speed <= 12; speed += 0.25) {
    for (let course = 0; course < 360; course += 2.5) {
      const water = simulationVectorFromSpeedCourse(speed, course, {});
      const current = simulationVectorFromSpeedCourse(0.55, course + 137, {});
      const velocity = simulationVelocityFromComponents(
        water.x,
        water.y,
        current.x,
        current.y,
        {},
      );
      assert.equal(velocity.groundX, velocity.waterX + velocity.currentX);
      assert.equal(velocity.groundY, velocity.waterY + velocity.currentY);
      for (const value of Object.values(velocity)) {
        if (value === null) continue;
        assert.ok(Number.isFinite(value));
        assert.equal(Object.is(value, -0), false);
      }
      probes += 1;
    }
  }
  assert.equal(probes, 7_056);
});
