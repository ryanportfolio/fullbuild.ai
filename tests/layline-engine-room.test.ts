/**
 * Engine room bench data: the twelve seconds of USA 4 the "How the replay
 * works" section draws. Every figure and chip in that section prints one of
 * these values, so this file pins them against the seeded race itself. If the
 * sim changes, these numbers change with it and the section follows.
 *
 * Run: npx --yes tsx --test tests/layline-engine-room.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { poseAt } from "../src/lib/layline/interpolate";
import { generateRace } from "../src/lib/layline/sim";
import { FIX_HZ, RACE_SEED } from "../src/lib/layline/types";
import {
  BENCH_BOAT,
  benchWindow,
  chordDrift,
  chordPath,
  crossingInstant,
  divergenceAt,
  finishGap45,
  finishGaps,
  gapRange,
  newPose,
  northPair,
  parkTime,
  roundingTime,
  secondTack,
  totalFixes,
} from "../src/components/layline/engine/benchData";

const race = generateRace(RACE_SEED);
const window = benchWindow(race, BENCH_BOAT);
const pair = northPair(race, window);

test("the bench window is the beat's second tack, six seconds either side", () => {
  assert.equal(secondTack(race, BENCH_BOAT), 27.25);
  assert.deepEqual([window.from, window.to, window.span], [21, 33, 12]);
  assert.equal(window.fixes.length, 49);
  /* Every fix sits on the 1/FIX_HZ grid the sim wrote them on. */
  for (const fix of window.fixes) {
    assert.ok(Number.isInteger(Math.round((fix.t - window.from) * FIX_HZ)));
  }
  /* The tack and USA 4's windward rounding are both inside the window. */
  assert.ok(window.tack > window.from && window.tack < window.to);
  const rounding = roundingTime(race, BENCH_BOAT);
  assert.equal(rounding, 32.85);
  assert.ok(rounding !== null && rounding > window.from && rounding < window.to);
});

test("dot spacing over the window is the range the chips print", () => {
  const gaps = gapRange(window.fixes);
  assert.equal(gaps.min.toFixed(2), "0.70");
  assert.equal(gaps.max.toFixed(2), "1.27");
});

test("the north pair is one second apart and straddles the top of the circle", () => {
  assert.equal(pair.b.t - pair.a.t, 1);
  assert.ok(pair.a.t >= window.from && pair.b.t <= window.to);
  assert.equal(pair.a.hdg.toFixed(1), "21.5");
  assert.equal(pair.b.hdg.toFixed(1), "353.5");
  assert.equal(pair.plain.toFixed(1), "332.0");
  assert.equal(Math.abs(pair.short).toFixed(1), "28.0");
  /* The plain-number reading is the wrong way round the circle by exactly the
   * complement: that difference is the whole of the compass figure. */
  assert.equal((pair.plain + Math.abs(pair.short)).toFixed(1), "360.0");
});

test("the park frame holds the raw and smooth boats visibly apart", () => {
  const crossing = crossingInstant(race, BENCH_BOAT, pair);
  assert.ok(crossing > pair.a.t && crossing < pair.b.t, "crossing outside the pair");
  assert.equal(crossing.toFixed(2), "27.02");
  const park = parkTime(race, BENCH_BOAT, pair);
  assert.ok(park >= pair.a.t && park <= pair.b.t, "park outside the pair");
  assert.equal(park.toFixed(2), "26.48");
  /* Three pixels at ten pixels per metre is the floor for a parked frame that
   * still shows two boats. The crossing itself misses it on this seed, so the
   * widest-divergence fallback is the rule that fired here. */
  assert.ok(divergenceAt(race, BENCH_BOAT, crossing) < 0.3);
  assert.ok(divergenceAt(race, BENCH_BOAT, park) >= 0.3);
  assert.equal(divergenceAt(race, BENCH_BOAT, park).toFixed(2), "1.03");
});

test("the straight-line track is the number CAM 02 prints, and it is not drawable", () => {
  const points = chordPath(race.fixes[BENCH_BOAT], window.from, window.to);
  assert.equal(points.length, 241);
  assert.equal(points[0].t, 21);
  assert.equal(points[points.length - 1].t, 33);
  const drift = chordDrift(race, BENCH_BOAT, window);
  assert.equal(drift.toFixed(2), "0.02");
  /* Every sample lands off the curve, so the number is a real separation and
   * not a sampling artefact. */
  const pose = newPose();
  let differs = 0;
  for (const point of points) {
    poseAt(race, BENCH_BOAT, point.t, "smooth", pose);
    if (Math.hypot(point.x - pose.x, point.y - pose.y) > 0) differs += 1;
  }
  assert.ok(differs > points.length / 2);
  /* The figure draws at about 17.9 units per metre, so this separation is a
   * third of a pixel: under the 2px stroke that would draw it. No rejected
   * construction is drawn in CAM 02 for exactly this reason, and the copy has
   * to keep saying what the number says. A seed that pushed this past three
   * pixels would be worth drawing again, and would fail here first. */
  const figureScale = 17.884;
  assert.ok(drift * figureScale < 3, "a visible cut belongs on the drawing, not only in a chip");
});

test("the finish strip prints the results the race already holds", () => {
  const order = finishGaps(race);
  assert.deepEqual(
    order.map((entry) => entry.boatId),
    ["usa", "jpn", "gbr", "nzl", "aus", "fra"],
  );
  /* These are the strings the strip prints, because the strip prints the
   * server's numbers: NotesSection builds them in Node from the race page.tsx
   * already generated and hands them down as props. Left to the browser they
   * come out up to fifteen milliseconds different, which moved +3.63 to +3.64
   * and 0.04 to 0.05 on screen while this file stayed green. */
  assert.equal(order[0].elapsed.toFixed(2), "51.52");
  assert.deepEqual(
    order.map((entry) => entry.delta.toFixed(2)),
    ["0.00", "1.42", "3.63", "5.44", "5.48", "5.97"],
  );
  assert.equal(finishGap45(order).toFixed(2), "0.04");
  /* The bar per boat is elapsed over the last boat home. */
  assert.deepEqual(
    order.map((entry) => ((entry.elapsed / order[5].elapsed) * 100).toFixed(1)),
    ["89.6", "92.1", "95.9", "99.1", "99.1", "100.0"],
  );
  /* GBR's near-white and NZL's near-black are the two that need an outline. */
  assert.deepEqual(
    order.filter((entry) => entry.dark).map((entry) => entry.boatId),
    ["gbr", "nzl"],
  );
});

/* The engine ident counts the bench window, not the fleet, so this number is
   no longer on the page. It stays pinned because it is the seed's own total
   and the Debrief panel above prints it. */
test("the seed writes 1711 fixes across the fleet", () => {
  assert.equal(totalFixes(race), 1711);
});
