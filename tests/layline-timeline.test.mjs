import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

/* Node 24 strips TypeScript itself. This resolver adds the extension that the
 * app bundler supplies, so these pure derivations run without node_modules. */
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

const {
  clampTimelineWindow,
  clipTimelineInterval,
  deriveEvidenceTimeline,
  packTimelinePoints,
  placeTimelinePoint,
  recenterTimelineWindow,
} = await import("../src/lib/layline/timeline.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const { RACES } = await import("../src/lib/layline/races.ts");

const fixes = [];
for (let t = -2; t <= 12; t += 0.25) {
  let twa = -42;
  if (t >= 1.25 && t < 5.25) twa = 42;
  if (t >= 4.25 && t < 5.25) twa = 132;
  if (t >= 5.25) twa = -132;
  fixes.push({ t, x: t, y: t, sog: 4, cog: 0, hdg: 0, heel: 0, twa, kite: 0 });
}

const race = {
  seed: 1,
  tMin: -2,
  tMax: 12,
  course: {
    startPin: { x: -1, y: 0 },
    startBoat: { x: 1, y: 0 },
    windward: { x: 0, y: 10 },
    zoneRadius: 2,
  },
  wind: [],
  boats: [
    { id: "one", nation: "ONE", sail: "ONE 1", name: "One", hue: "#ffffff" },
    { id: "two", nation: "TWO", sail: "TWO 2", name: "Two", hue: "#eeeeee" },
  ],
  fixes: { one: fixes, two: [] },
  progress: { one: [], two: [] },
  events: [
    { kind: "gun", t: 0 },
    { kind: "rounding", t: 6, boatId: "one" },
    { kind: "finish", t: 10, boatId: "one", rank: 1 },
    { kind: "rounding", t: 7, boatId: "two" },
    { kind: "finish", t: 11, boatId: "two", rank: 2 },
  ],
  results: [
    { boatId: "one", rank: 1, elapsed: 10 },
    { boatId: "two", rank: 2, elapsed: 11 },
  ],
};

test("timeline derivation is deterministic and uses exact selected-boat event boundaries", () => {
  const first = deriveEvidenceTimeline(race, "one");
  const second = deriveEvidenceTimeline(race, "one");
  assert.deepEqual(second, first);
  assert.equal(first.selectedBoatId, "one");
  assert.deepEqual(
    first.lanes.map((lane) => lane.label),
    ["Phases ONE 1", "Race events", "Turns ONE 1"],
  );
  assert.deepEqual(
    first.lanes[0].items.map((item) => [item.label, item.from, item.to]),
    [
      ["Prestart", -2, 0],
      ["Beat", 0, 6],
      ["Run", 6, 10],
      ["Finished", 10, 12],
    ],
  );
  assert.equal(first.lanes[1].items.length, race.events.length);
});

test("timeline evidence names its source and maneuver method", () => {
  const timeline = deriveEvidenceTimeline(race, "one");
  for (const phase of timeline.lanes[0].items) {
    assert.deepEqual(phase.provenance, {
      source: "race.events",
      method: "event-boundary",
    });
  }
  for (const event of timeline.lanes[1].items) {
    assert.deepEqual(event.provenance, {
      source: "race.events",
      method: "recorded-event",
    });
  }
  assert.deepEqual(
    timeline.lanes[2].items.map((item) => [item.label, item.at]),
    [
      ["Tack", 1.13],
      ["Gybe", 5.13],
    ],
  );
  for (const maneuver of timeline.lanes[2].items) {
    assert.deepEqual(maneuver.provenance, {
      source: "race.fixes",
      method: "twa-sign-flip",
      sampleRateHz: 4,
    });
  }
});

test("focused windows preserve their duration and clamp at both race ends", () => {
  assert.deepEqual(clampTimelineWindow(race, 5, null), { from: -2, to: 12, span: 14 });
  assert.deepEqual(clampTimelineWindow(race, -1.5, 10), { from: -2, to: 8, span: 10 });
  assert.deepEqual(clampTimelineWindow(race, 11, 10), { from: 2, to: 12, span: 10 });
  assert.deepEqual(clampTimelineWindow(race, Number.NaN, 4), { from: -2, to: 2, span: 4 });
  assert.deepEqual(clampTimelineWindow(race, 5, 0), { from: 4.875, to: 5.125, span: 0.25 });
});

test("focused windows stay put for in-window seeks and recenter after external seeks", () => {
  const current = { from: 0, to: 10, span: 10 };
  assert.deepEqual(recenterTimelineWindow(race, current, 5, 10), {
    window: current,
    recentered: false,
  });
  assert.deepEqual(recenterTimelineWindow(race, current, 11.5, 10), {
    window: { from: 2, to: 12, span: 10 },
    recentered: true,
  });
});

test("focused windows repair stale bounds and reset to the whole new race", () => {
  const stale = { from: -10, to: 20, span: 30 };
  const nextRace = { tMin: 0, tMax: 18 };
  assert.deepEqual(recenterTimelineWindow(nextRace, stale, 17, 10), {
    window: { from: 8, to: 18, span: 10 },
    recentered: true,
  });
  assert.deepEqual(recenterTimelineWindow(nextRace, stale, 17, null), {
    window: { from: 0, to: 18, span: 18 },
    recentered: true,
  });
});

test("all shipped point lanes pack without collisions or edge escapes", (t) => {
  const geometries = [
    { name: "desktop", laneWidth: 640, clearance: 32 },
    { name: "phone", laneWidth: 288, clearance: 48 },
  ];
  const reused = new Set();
  let probes = 0;
  let maximumRows = 0;

  for (const meta of RACES) {
    const shipped = generateRace(meta.seed);
    const eventPoints = deriveEvidenceTimeline(shipped, shipped.boats[0].id).lanes[1].items;
    const lanes = [
      { name: "events", points: eventPoints },
      ...shipped.boats.map((boat) => ({
        name: "maneuvers",
        points: deriveEvidenceTimeline(shipped, boat.id).lanes[2].items,
      })),
    ];

    for (const lane of lanes) {
      for (const span of [null, 30, 10]) {
        const centers =
          span === null
            ? [(shipped.tMin + shipped.tMax) / 2]
            : [
                shipped.tMin,
                shipped.tMax,
                (shipped.tMin + shipped.tMax) / 2,
                ...lane.points.flatMap((point) => [
                  point.at,
                  point.at - span / 2,
                  point.at + span / 2,
                ]),
              ];

        for (const center of new Set(centers)) {
          const window = clampTimelineWindow(shipped, center, span);
          const unmeasured = packTimelinePoints(lane.points, window, 0, 0);
          const unmeasuredRows = new Map(
            unmeasured.items.map((point) => [point.item.id, point.row]),
          );
          for (const geometry of geometries) {
            probes++;
            const packed = packTimelinePoints(
              lane.points,
              window,
              geometry.laneWidth,
              geometry.clearance,
            );
            maximumRows = Math.max(maximumRows, packed.rowCount);
            assert.equal(packed.rowCount, unmeasured.rowCount);
            assert.deepEqual(
              new Map(packed.items.map((point) => [point.item.id, point.row])),
              unmeasuredRows,
              `${meta.id} ${lane.name} ${span ?? "whole"} ${geometry.name} changed row ownership`,
            );
            if (packed.items.length > packed.rowCount) reused.add(lane.name);

            for (const point of packed.items) {
              const centerPx = point.fraction * geometry.laneWidth;
              assert.ok(
                centerPx >= geometry.clearance / 2 - 1e-9,
                `${meta.id} ${lane.name} ${span ?? "whole"} ${geometry.name} escaped left`,
              );
              assert.ok(
                centerPx <= geometry.laneWidth - geometry.clearance / 2 + 1e-9,
                `${meta.id} ${lane.name} ${span ?? "whole"} ${geometry.name} escaped right`,
              );
            }

            for (let left = 0; left < packed.items.length; left++) {
              for (let right = left + 1; right < packed.items.length; right++) {
                const a = packed.items[left];
                const b = packed.items[right];
                if (a.row !== b.row) continue;
                const distance = Math.abs(a.fraction - b.fraction) * geometry.laneWidth;
                assert.ok(
                  distance + 1e-9 >= geometry.clearance,
                  `${meta.id} ${lane.name} ${span ?? "whole"} ${geometry.name} collided`,
                );
              }
            }
          }
        }
      }
    }
  }

  assert.deepEqual([...reused].sort(), ["events", "maneuvers"]);
  assert.ok(maximumRows <= 6, `shipped row count exceeded fleet bound: ${maximumRows}`);
  t.diagnostic(`${probes} race/window/size/lane probes, stable rows, max ${maximumRows}, zero collisions/escapes`);
});

test("packed targets keep their full focus footprint inside both lane edges", () => {
  const window = { from: 0, to: 10, span: 10 };
  const packed = packTimelinePoints([{ at: 0 }, { at: 10 }], window, 288, 48);
  assert.deepEqual(
    packed.items.map((item) => item.fraction),
    [48 / 2 / 288, 1 - 48 / 2 / 288],
  );
});

test("unmeasured boundary targets keep measured row ownership and defer edge footprints to CSS", async () => {
  const window = { from: 0, to: 10, span: 10 };
  const packed = packTimelinePoints([{ at: 0 }, { at: 10 }], window, 0, 0);
  const measured = packTimelinePoints([{ at: 0 }, { at: 10 }], window, 288, 48);
  assert.deepEqual(
    packed.items.map((item) => item.fraction),
    [0, 1],
  );
  assert.deepEqual(
    packed.items.map((item) => item.row),
    measured.items.map((item) => item.row),
  );
  assert.equal(packed.rowCount, measured.rowCount);

  const source = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /"--point-position": pct\(fraction\)/);
  assert.doesNotMatch(source, /style=\{\{ left: pct\(placed\.fraction\) \}\}/);
  assert.match(
    css,
    /\.pointRail\s*\{[\s\S]*?--point-edge-inset:\s*calc\(var\(--point-clearance\) \/ 2\)/,
  );
  assert.match(
    css,
    /\.pointMark\s*\{[\s\S]*?left:\s*clamp\(\s*var\(--point-edge-inset\),\s*var\(--point-position\),\s*calc\(100% - var\(--point-edge-inset\)\)\s*\)/,
  );
  assert.match(css, /\.eventMark\s*\{[\s\S]*?width:\s*24px;[\s\S]*?margin-left:\s*-12px/);
  assert.match(css, /\.manMark\s*\{[\s\S]*?width:\s*24px;[\s\S]*?margin-left:\s*-12px/);
  assert.match(css, /\.eventRail\s*\{[\s\S]*?--point-clearance:\s*32px/);
  assert.match(css, /\.manRail\s*\{[\s\S]*?--point-clearance:\s*32px/);

  const phone = css
    .split("@media (max-width: 900px) {")[1]
    ?.split("@media (max-width: 560px) {")[0] ?? "";
  assert.match(phone, /\.eventRail,\s*\.manRail\s*\{[\s\S]*?--point-clearance:\s*48px/);
  assert.match(phone, /\.eventMark\s*\{[\s\S]*?width:\s*40px;[\s\S]*?margin-left:\s*-20px/);
  assert.match(phone, /\.manMark\s*\{[\s\S]*?width:\s*40px;[\s\S]*?margin-left:\s*-20px/);

  const focusOutline = 2 + 2;
  for (const { target, clearance } of [
    { target: 24, clearance: 32 },
    { target: 40, clearance: 48 },
  ]) {
    assert.equal(clearance / 2, target / 2 + focusOutline);
  }
});

test("point placement and interval clipping use the focused window axis", () => {
  const window = { from: 2, to: 12, span: 10 };
  assert.deepEqual(placeTimelinePoint(2, window), { visible: true, fraction: 0 });
  assert.deepEqual(placeTimelinePoint(7, window), { visible: true, fraction: 0.5 });
  assert.deepEqual(placeTimelinePoint(12, window), { visible: true, fraction: 1 });
  assert.deepEqual(placeTimelinePoint(-5, window), { visible: false, fraction: 0 });
  assert.deepEqual(placeTimelinePoint(20, window), { visible: false, fraction: 1 });
  assert.deepEqual(clipTimelineInterval(-2, 6, window), {
    from: 2,
    to: 6,
    left: 0,
    width: 0.4,
  });
  assert.deepEqual(clipTimelineInterval(10, 20, window), {
    from: 10,
    to: 12,
    left: 0.8,
    width: 0.2,
  });
  assert.equal(clipTimelineInterval(-2, 2, window), null);
  assert.equal(clipTimelineInterval(12, 20, window), null);
});

test("timeline interactions seek the shared replay clock without replacing sample stepping", async () => {
  const source = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const store = await readFile(
    new URL("../src/components/layline/store.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /replay\.seek\(at\)/);
  assert.match(source, /const seekEvidence[^]*?replay\.seek\(at\);\s*\};/);
  assert.doesNotMatch(source, /const seekEvidence[^]*?replay\.pause\(\)[^]*?\};/);
  assert.match(source, /const seekSelectedRange[^]*?replay\.seek\(evidence\.seekTo\);\s*\};/);
  assert.doesNotMatch(source, /const seekSelectedRange[^]*?replay\.pause\(\)[^]*?\};/);
  assert.match(source, /timelineWindow\.from \+ fraction \* timelineWindow\.span/);
  assert.match(source, /store\.step\(-1\)/);
  assert.match(source, /store\.step\(1\)/);
  assert.match(store, /race\.tMin \+ n \/ FIX_HZ/);
  assert.doesNotMatch(source, /create\(|useReplay\.setState/);
});

test("both point rails use one measured packing and rendering path", async () => {
  const source = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );

  assert.equal((source.match(/function PackedPointRail/g) ?? []).length, 1);
  assert.equal((source.match(/<PackedPointRail/g) ?? []).length, 2);
  assert.equal((source.match(/packTimelinePoints\(/g) ?? []).length, 1);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /recenterTimelineWindow\(race, timelineWindow, live\.t, focusSpan\)/);
  assert.match(source, /--point-rows/);
  assert.match(source, /--point-row/);
  assert.match(css, /\.pointRail\s*\{[\s\S]*?height:\s*calc\(var\(--point-rows/);
  assert.match(css, /\.pointMark\s*\{[\s\S]*?top:\s*calc\(var\(--point-rail-pad/);
});

test("the scrub is one focusable slider whose keyboard contract matches the 4 Hz clock", async () => {
  const source = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /role="slider"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /aria-valuemin=\{timelineWindow\.from\}/);
  assert.match(source, /aria-valuemax=\{timelineWindow\.to\}/);
  assert.match(source, /aria-valuenow=\{liveTimeRef\.current\}/);
  assert.match(source, /aria-valuetext=\{timelineValueText\(/);
  assert.match(source, /aria-describedby=\{timelineHelpId\}/);
  assert.match(
    source,
    /event\.key === "ArrowRight" \|\| event\.key === "ArrowUp"\) store\.step\(1\)/,
  );
  assert.match(
    source,
    /event\.key === "ArrowLeft" \|\| event\.key === "ArrowDown"\) store\.step\(-1\)/,
  );
  assert.match(source, /event\.key === "Home"\) store\.seek\(timelineWindow\.from\)/);
  assert.match(source, /event\.key === "End"\) store\.seek\(timelineWindow\.to\)/);
  assert.doesNotMatch(source, /const NUDGE\s*=/);
  assert.doesNotMatch(source, /event\.shiftKey/);
});

test("timeline buttons and scrub keep usable source-sized targets through phone width", async () => {
  const source = await readFile(
    new URL("../src/components/layline/hud/Timeline.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /styles\.phaseBand/);
  assert.match(source, /styles\.pointMark} \$\{styles\.eventMark/);
  assert.match(source, /styles\.pointMark} \$\{styles\.manMark/);
  assert.doesNotMatch(source, /role="button"/);

  assert.match(css, /\.rangeButton\s*\{[\s\S]*?min-height:\s*24px/);
  assert.match(css, /\.track\s*\{[\s\S]*?height:\s*24px/);
  assert.match(css, /\.phaseBand\s*\{[\s\S]*?min-width:\s*24px/);
  assert.match(css, /\.eventMark\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px/);

  const phone = css
    .split("@media (max-width: 900px) {")[1]
    ?.split("@media (max-width: 560px) {")[0] ?? "";
  assert.match(phone, /\.rangeButton\s*\{[\s\S]*?min-height:\s*40px/);
  assert.match(phone, /\.phaseRail\s*\{[\s\S]*?height:\s*40px/);
  assert.match(phone, /\.phaseBand\s*\{[\s\S]*?min-width:\s*40px/);
  assert.match(
    phone,
    /\.eventRail,\s*\.manRail\s*\{[\s\S]*?--point-clearance:\s*48px;[\s\S]*?--point-row-pitch:\s*48px/,
  );
  assert.match(phone, /\.eventMark\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px/);
  assert.match(phone, /\.manMark\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px/);
  assert.match(phone, /\.track\s*\{[\s\S]*?height:\s*40px/);
});

test("timeline focus and reduced-motion rules preserve a complete visible control", async () => {
  const css = await readFile(
    new URL("../src/app/prototype/layline/layline.module.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.shell :is\(a, button, \[tabindex\]\):focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--focus-ring\);[\s\S]*?outline-offset:\s*2px/,
  );
  assert.doesNotMatch(css, /\.track(?::focus[^\{]*)?\s*\{[^}]*outline:\s*(?:0|none)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation-duration:\s*1ms;[\s\S]*?animation-iteration-count:\s*1;[\s\S]*?transition-duration:\s*1ms/,
  );
  assert.doesNotMatch(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.(?:timelineRow|timelineTools|track|phaseRail|pointRail|eventRail|manRail)[^}]*display:\s*none/,
  );
});
