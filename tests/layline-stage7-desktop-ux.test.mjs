import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const block = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
};

const timeline = source("src/components/layline/hud/Timeline.tsx");
const panel = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
const vector = source("src/components/layline/hud/VectorTriangle.tsx");
const laylineCss = source("src/app/prototype/layline/layline.module.css");
const racesCss = source("src/app/prototype/layline/races/races.module.css");

test("Race Events exposes every packed row without an internal scroll viewport", () => {
  const pointRail = block(laylineCss, ".pointRail");
  assert.doesNotMatch(pointRail, /max-height|overflow-y:\s*(?:auto|scroll|hidden)/);
  assert.match(pointRail, /height:\s*calc\(var\(--point-rows/);
  assert.match(timeline, /ariaLabel="Race events"/);
  assert.match(timeline, /ownershipClearance=\{28\}/);
});

test("Turns uses a compact labelled lane while preserving deterministic seek buttons", () => {
  const maneuverRail = timeline.match(/<PackedPointRail\s+className=\{styles\.manRail\}[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(maneuverRail, /reservedRows=\{1\}/);
  assert.match(maneuverRail, /ownershipClearance=\{46\}/);
  assert.match(timeline, /className=\{styles\.manLabel\}/);
  assert.match(maneuverRail, /onClick=\{\(\) => seekEvidence\(maneuver\.at\)\}/);
  assert.match(block(laylineCss, ".manMark"), /min-width:\s*44px/);
});

test("Compare compacts full-label turn targets below its narrowest adjacent center spacing", () => {
  const compareTurn = block(
    laylineCss,
    '.stage[data-analysis-workspace="compare"] .manMark',
  );
  const width = Number(compareTurn.match(/\bwidth:\s*([\d.]+)px/)?.[1]);
  const margin = Number(compareTurn.match(/\bmargin-left:\s*(-?[\d.]+)px/)?.[1]);

  assert.equal(width, 38);
  assert.equal(margin, -19);
  assert.match(compareTurn, /min-width:\s*38px/);
  assert.match(compareTurn, /padding:\s*0 2px/);
  assert.match(compareTurn, /gap:\s*2px/);

  const adjacentCenterSpacing = 872.703125 - 830.84375;
  assert.ok(
    adjacentCenterSpacing - width >= 3,
    "0:29 Tack and 0:42 Gybe need a visible desktop Compare gap",
  );
});

test("phase event and maneuver controls use immediate pointer and focus disclosure", () => {
  assert.doesNotMatch(timeline, /\btitle=/);
  assert.match(timeline, /"aria-describedby": descriptionId/);
  assert.equal((timeline.match(/evidenceDisclosureProps\(/g) ?? []).length >= 3, true);
  assert.match(timeline, /onPointerEnter:/);
  assert.match(timeline, /onFocus:/);
  assert.match(timeline, /data-evidence-disclosure/);
  assert.match(timeline, /Source \$\{/);
  assert.match(block(laylineCss, ".evidenceDisclosure"), /min-height/);
});

test("Analysis Layers is one readable control column with compact unavailable rows", () => {
  assert.match(block(laylineCss, ".analysisLayerGrid"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(laylineCss, /\.analysisLayerDisclosure\[open\]\s*~\s*\*\s*\{[\s\S]*?display:\s*none/);
  assert.match(block(laylineCss, ".analysisLayerControl"), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(120px,\s*auto\)/);
  assert.match(block(laylineCss, ".analysisLayerUnavailable"), /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(panel, /Default \(\{layer\.defaultVisible \? "on" : "off"\}\)/);
  assert.match(panel, /<option value="on">On<\/option>/);
  assert.match(panel, /<option value="off">Off<\/option>/);
  assert.match(panel, /Reset range and layers/);
});

test("vector witness gives plot provenance and exact values a readable hierarchy", () => {
  assert.match(block(laylineCss, ".vectorTriangle"), /grid-template-columns:\s*minmax\(112px,\s*0\.8fr\)\s+minmax\(0,\s*1\.2fr\)/);
  assert.match(block(laylineCss, ".vectorPlot"), /min-width:\s*112px/);
  assert.match(block(laylineCss, ".vectorHeader"), /font-size:\s*10px/);
  assert.match(block(laylineCss, ".vectorLegend"), /font-size:\s*10px/);
  assert.match(block(laylineCss, ".vectorTrace"), /font-size:\s*10px/);
  assert.match(vector, /Water vector plus current vector equals ground vector/);
  assert.match(vector, /ref=\{caption\}/);
  assert.match(vector, /ref=\{currentCaption\}/);
});

test("desktop race list and Debrief restore live five-track rail spacing", () => {
  const desktop = racesCss.match(/@media \(min-width: 1200px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(desktop, /grid-template-columns:\s*var\(--library-track\)\s+12px\s+minmax\(560px,\s*1fr\)\s+12px\s+var\(--analyst-track\)/);
  assert.match(desktop, /\.console\s*\{\s*grid-column:\s*3/);
  assert.match(desktop, /\.separator\[data-boundary="left"\]\s*\{\s*grid-column:\s*2/);
  assert.match(desktop, /\.separator\[data-boundary="right"\]\s*\{\s*grid-column:\s*4/);
  assert.doesNotMatch(desktop, /\.separator\s*\{[^}]*position:\s*absolute/);
  assert.match(desktop, /\.drawerBody\s*\{[^}]*padding-top:\s*0/);
});
