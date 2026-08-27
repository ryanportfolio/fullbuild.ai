import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const block = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
};

/* block() takes the last rule whose selector text ends in the one asked for,
   which is the wrong one when a later rule scopes that same class under a
   parent. This takes the standalone rule: the selector starting its own line. */
const ownRule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
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

test("event and maneuver controls carry described evidence without a hover status line", () => {
  /* Not the native title attribute: it waits about a second before it appears,
     which is the complaint that put a tooltip on the marks in the first place. */
  assert.doesNotMatch(timeline, /\btitle=/);
  assert.match(timeline, /aria-describedby=\{descriptionId\}/);
  assert.match(timeline, /Source \$\{/);
  /* The visible hover-disclosure strip is gone by owner direction; the
     description spans stay wired through aria-describedby. A tooltip on the
     mark itself is not that strip: it is the same description, shown where the
     pointer already is, instead of in a status line elsewhere on the page. */
  assert.doesNotMatch(timeline, /data-evidence-disclosure/);
  assert.doesNotMatch(laylineCss, /\.evidenceDisclosure/);
});

test("a race-event mark says what the event is on hover and on keyboard focus", () => {
  /* One span, not two: the tooltip is the aria-describedby target, so what a
     pointer reads and what a screen reader reads cannot drift apart. */
  assert.match(
    timeline,
    /<span id=\{descriptionId\} role="tooltip" className=\{styles\.pointTip\}>/,
  );
  assert.equal((timeline.match(/styles\.pointTip/g) ?? []).length, 1);
  assert.match(laylineCss, /\.pointMark:hover \.pointTip,\s*\r?\n\.pointMark:focus-visible \.pointTip \{/);
  const tip = ownRule(laylineCss, ".pointTip");
  /* Hidden by opacity alone. visibility and display would take the span out of
     the accessibility tree and the description with it. */
  assert.match(tip, /opacity:\s*0/);
  assert.doesNotMatch(tip, /visibility:\s*hidden|display:\s*none/);
  /* It must not eat the hover that summoned it, which would flicker the
     tooltip against its own mark. */
  assert.match(tip, /pointer-events:\s*none/);
  /* Immediate: a fade short enough to read as instant, and none at all for a
     reader who asked for less motion. */
  const fade = Number(tip.match(/transition:\s*opacity\s+(\d+)ms/)?.[1]);
  assert.ok(fade <= 80, `tooltip fade is ${fade}ms, which reads as a delay`);
  assert.match(
    laylineCss,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\r?\n\s*\.pointTip \{\s*\r?\n\s*transition: none;/,
  );
  /* A mark can sit hard against either end of the rail, and a tooltip centred
     on it then runs past the viewport and loses the end of its own text with
     nothing to scroll. Measured at 390px before the clamp: 37px past the right
     edge. CSS cannot do this on its own, because the offset is the tooltip's
     width against the viewport and a percentage inside the mark resolves
     against a 24px box. Measured on arrival, never per frame. */
  assert.match(tip, /transform:\s*translateX\(calc\(-50% \+ var\(--tip-shift, 0px\)\)\)/);
  assert.match(timeline, /onPointerEnter=\{clampTipToViewport\}/);
  assert.match(timeline, /onFocus=\{clampTipToViewport\}/);
  assert.match(timeline, /const past = box\.right - \(document\.documentElement\.clientWidth - TIP_MARGIN\)/);
  assert.match(timeline, /const short = TIP_MARGIN - box\.left/);
  /* The reset before the measure: without it a second hover measures a box
     that is already shifted and walks the tooltip off the other edge. */
  assert.match(timeline, /tip\.style\.setProperty\("--tip-shift", "0px"\);\s*\r?\n\s*const box = tip\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(timeline, /useFrame|requestAnimationFrame[\s\S]{0,80}--tip-shift/);
});

test("the race-events lane is collapsible and starts closed", () => {
  assert.match(timeline, /const \[eventsOpen, setEventsOpen\] = useState\(false\)/);
  assert.match(timeline, /aria-expanded=\{eventsOpen\}/);
  assert.match(timeline, /eventsOpen \|\| id !== "event"/);
  assert.match(timeline, /Race events \$\{raceEvents\.length\}/);
});

test("Analysis Layers is one readable control column with compact unavailable rows", () => {
  assert.match(block(laylineCss, ".analysisLayerGrid"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(laylineCss, /\.analysisLayerDisclosure\[open\]\s*~\s*\*\s*\{[\s\S]*?display:\s*none/);
  /* Two segments fit beside the longest label the dock carries, so the row
     keeps the shape the select had and the panel keeps its height. */
  assert.match(
    block(laylineCss, ".analysisLayerControl"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(104px,\s*auto\)/,
  );
  assert.match(
    ownRule(laylineCss, ".analysisLayerChoices"),
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(block(laylineCss, ".analysisLayerUnavailable"), /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(panel, /\{ value: "on", label: "On" \}/);
  assert.match(panel, /\{ value: "off", label: "Off" \}/);
  assert.match(panel, /Reset range and layers/);
});

test("Analysis Layers draws its own segments, so no theme depends on a native menu", () => {
  /* This replaced a native select whose popup the OS drew, which is why the
     rule it replaced had to hand color-scheme to four themes by name. The
     segments are painted by the page in the theme's own tokens, so contrast
     follows the ground the panel already sits on and every theme is covered by
     one rule instead of a list that a fifth theme could fall off. */
  assert.doesNotMatch(panel, /<select|<option/);
  assert.doesNotMatch(laylineCss, /\.analysisLayerControl select/);
  assert.doesNotMatch(ownRule(laylineCss, ".analysisLayerChoices"), /color-scheme/);
  assert.match(ownRule(laylineCss, ".analysisLayerChoices"), /background:\s*color-mix\(in srgb, var\(--ink\)/);
  assert.match(ownRule(laylineCss, ".analysisLayerChoices"), /border:\s*1px solid var\(--rule\)/);
  assert.match(
    ownRule(laylineCss, '.analysisLayerChoice[data-selected="yes"]'),
    /background:\s*color-mix\(in srgb, var\(--ink\)/,
  );
  assert.match(ownRule(laylineCss, '.analysisLayerChoice[data-selected="yes"]'), /color:\s*var\(--ink\)/);
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
