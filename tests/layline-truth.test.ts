/**
 * Telemetry truth derivation.
 * Run: npx --yes tsx --test tests/layline-truth.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixStamp, heading } from "../src/lib/layline/format";
import { poseAt, telemetryTruthAt, truthFixWindow } from "../src/lib/layline/interpolate";
import { generateRace } from "../src/lib/layline/sim";
import { RACE_SEED, type Pose, type TelemetryTruth } from "../src/lib/layline/types";

const race = generateRace(RACE_SEED);

function pose(): Pose {
  return { x: 0, y: 0, sog: 0, cog: 0, hdg: 0, heel: 0, twa: 0, kite: 0 };
}

function truth(): TelemetryTruth {
  return {
    t: 0,
    beforeIndex: -1,
    afterIndex: -1,
    before: null,
    after: null,
    u: 0,
    raw: pose(),
    reconstructed: pose(),
  };
}

function arcDeg(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

test("truth clamps the beginning to the first measured fix", () => {
  const fixes = race.fixes.nzl;
  const out = telemetryTruthAt(race, "nzl", fixes[0].t - 4, truth());
  assert.equal(out.beforeIndex, 0);
  assert.equal(out.afterIndex, 0);
  assert.equal(out.before, fixes[0]);
  assert.equal(out.after, fixes[0]);
  assert.equal(out.u, 0);
  assert.ok(out.raw);
  assert.ok(out.reconstructed);
  assert.equal(out.raw.x, fixes[0].x);
  assert.equal(out.reconstructed.x, fixes[0].x);
});

test("truth identifies both fixes and the derived clock position between them", () => {
  const fixes = race.fixes.nzl;
  const index = 120;
  const a = fixes[index];
  const b = fixes[index + 1];
  const t = a.t + (b.t - a.t) * 0.375;
  const out = telemetryTruthAt(race, "nzl", t, truth());
  assert.equal(out.beforeIndex, index);
  assert.equal(out.afterIndex, index + 1);
  assert.equal(out.before, a);
  assert.equal(out.after, b);
  assert.ok(Math.abs(out.u - 0.375) < 1e-12);
  assert.ok(out.raw);
  assert.equal(out.raw.x, a.x, "raw state stopped holding the measured fix");

  const expected = pose();
  poseAt(race, "nzl", t, "smooth", expected);
  assert.deepEqual(out.reconstructed, expected, "truth stopped using the fleet evaluator");
});

test("an exact fix is current on both sides and both evaluator answers land on it", () => {
  const fixes = race.fixes.usa;
  const index = 88;
  const fix = fixes[index];
  const out = telemetryTruthAt(race, "usa", fix.t, truth());
  assert.equal(out.beforeIndex, index);
  assert.equal(out.afterIndex, index);
  assert.equal(out.before, fix);
  assert.equal(out.after, fix);
  assert.equal(out.u, 0);
  assert.ok(out.raw);
  assert.ok(out.reconstructed);
  assert.equal(out.raw.hdg, fix.hdg);
  assert.equal(out.reconstructed.hdg, fix.hdg);
});

test("missing and empty fix series expose no stale pose and retain reusable valid buffers", () => {
  const out = telemetryTruthAt(race, "nzl", race.fixes.nzl[24].t, truth());
  assert.ok(out.raw);
  assert.ok(out.reconstructed);
  const rawBuffer = out.raw;
  const reconstructedBuffer = out.reconstructed;

  const emptyRace = {
    ...race,
    fixes: { ...race.fixes, nzl: [] },
  };
  const empty = telemetryTruthAt(emptyRace, "nzl", 0, out);
  assert.equal(empty.before, null);
  assert.equal(empty.after, null);
  assert.equal(empty.raw, null);
  assert.equal(empty.reconstructed, null);

  const restored = telemetryTruthAt(race, "nzl", race.fixes.nzl[25].t, out);
  assert.equal(restored.raw, rawBuffer);
  assert.equal(restored.reconstructed, reconstructedBuffer);

  const missing = telemetryTruthAt(race, "missing-boat", 0, out);
  assert.equal(missing.before, null);
  assert.equal(missing.after, null);
  assert.equal(missing.raw, null);
  assert.equal(missing.reconstructed, null);
});

test("truth clamps the end to the final measured fix", () => {
  const fixes = race.fixes.jpn;
  const index = fixes.length - 1;
  const out = telemetryTruthAt(race, "jpn", fixes[index].t + 4, truth());
  assert.equal(out.beforeIndex, index);
  assert.equal(out.afterIndex, index);
  assert.equal(out.before, fixes[index]);
  assert.equal(out.after, fixes[index]);
  assert.equal(out.u, 0);
  assert.ok(out.raw);
  assert.ok(out.reconstructed);
  assert.equal(out.raw.y, fixes[index].y);
  assert.equal(out.reconstructed.y, fixes[index].y);
});

test("reconstructed heading crosses north on the same short arc as poseAt", () => {
  const fixes = race.fixes.fra;
  const a = fixes[76];
  const b = fixes[77];
  assert.ok(Math.abs(b.hdg - a.hdg) > 300, "the pinned north-crossing pair moved");
  const t = (a.t + b.t) / 2;
  const out = telemetryTruthAt(race, "fra", t, truth());
  const expected = pose();
  poseAt(race, "fra", t, "smooth", expected);
  assert.ok(out.raw);
  assert.ok(out.reconstructed);
  assert.ok(Math.abs(arcDeg(a.hdg, out.reconstructed.hdg)) < 20);
  assert.equal(out.reconstructed.hdg, expected.hdg);
  assert.equal(out.raw.hdg, a.hdg);
});

test("truth stays on both shared evaluators at every fix and midpoint", () => {
  const out = truth();
  const expected = pose();
  let probes = 0;

  for (const boat of race.boats) {
    const fixes = race.fixes[boat.id];
    for (let index = 0; index < fixes.length; index++) {
      const exact = telemetryTruthAt(race, boat.id, fixes[index].t, out);
      poseAt(race, boat.id, fixes[index].t, "raw", expected);
      assert.deepEqual(exact.raw, expected);
      poseAt(race, boat.id, fixes[index].t, "smooth", expected);
      assert.deepEqual(exact.reconstructed, expected);
      probes++;

      if (index + 1 >= fixes.length) continue;
      const midpoint = (fixes[index].t + fixes[index + 1].t) / 2;
      const between = telemetryTruthAt(race, boat.id, midpoint, out);
      poseAt(race, boat.id, midpoint, "raw", expected);
      assert.deepEqual(between.raw, expected);
      poseAt(race, boat.id, midpoint, "smooth", expected);
      assert.deepEqual(between.reconstructed, expected);
      probes++;
    }
  }

  assert.equal(probes, 3416);
});

test("truth stamps carry rounded hundredths across minute boundaries", () => {
  assert.equal(fixStamp(59.999), "T+01:00.00");
  assert.equal(fixStamp(119.999), "T+02:00.00");
  assert.equal(fixStamp(-59.999), "T-01:00.00");
  assert.equal(fixStamp(-119.999), "T-02:00.00");
  assert.equal(fixStamp(12.34), "T+00:12.34");
  assert.equal(fixStamp(-4.25), "T-00:04.25");
});

test("truth headings wrap after rounding at the displayed precision", () => {
  assert.equal(heading(359.974), "0.0\u00b0");
  assert.equal(heading(42.24), "42.2\u00b0");
  assert.equal(heading(42.25), "42.3\u00b0");
});

test("truth fix windows clamp at the beginning and end", () => {
  const fixes = race.fixes.nzl;
  const beginning = telemetryTruthAt(race, "nzl", fixes[0].t - 4, truth());
  const end = telemetryTruthAt(race, "nzl", fixes[fixes.length - 1].t + 4, truth());

  assert.deepEqual(truthFixWindow(fixes.length, beginning.beforeIndex), {
    start: 0,
    end: 9,
    count: 9,
  });
  assert.deepEqual(truthFixWindow(fixes.length, end.beforeIndex), {
    start: fixes.length - 9,
    end: fixes.length,
    count: 9,
  });
});

test("truth fix windows center middle and exact-fix readings", () => {
  const fixes = race.fixes.nzl;
  const middle = telemetryTruthAt(race, "nzl", (fixes[120].t + fixes[121].t) / 2, truth());
  const exact = telemetryTruthAt(race, "nzl", fixes[88].t, truth());

  assert.deepEqual(truthFixWindow(fixes.length, middle.beforeIndex), {
    start: 116,
    end: 125,
    count: 9,
  });
  assert.deepEqual(truthFixWindow(fixes.length, exact.beforeIndex), {
    start: 84,
    end: 93,
    count: 9,
  });
});
