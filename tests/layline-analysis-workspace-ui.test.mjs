import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const targetUiModelUrl = new URL("../src/lib/layline/analysis-workspace-ui.ts", import.meta.url);
const legacyUiModelUrl = new URL(
  "../src/components/layline/hud/analysis-workspace-ui.ts",
  import.meta.url,
);
const uiModelUrl = existsSync(targetUiModelUrl) ? targetUiModelUrl : legacyUiModelUrl;

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

const analysisState = await import("../src/lib/layline/analysis-state.ts");
const { compareRange } = await import("../src/lib/layline/comparison.ts");
const { fixStamp } = await import("../src/lib/layline/format.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");
const ui = existsSync(uiModelUrl) ? await import(uiModelUrl.href) : null;

function source(path) {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("workspace tab model is labelled, roving and keyboard-complete", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const workspaceIds = [...analysisState.ANALYSIS_WORKSPACE_IDS];
  const taskIds = [...ui.ANALYSIS_AVAILABLE_TASK_IDS];
  assert.deepEqual(taskIds, ["start", "compare", "evidence"]);
  for (const active of workspaceIds) {
    const model = ui.analysisWorkspaceTabModel(active);
    assert.deepEqual(model.map((tab) => tab.id), taskIds);
    assert.deepEqual(
      model.map((tab) => tab.label),
      taskIds.map((id) => analysisState.ANALYSIS_WORKSPACE_PRESETS[id].label),
    );
    assert.equal(model.filter((tab) => tab.selected).length, taskIds.includes(active) ? 1 : 0);
    assert.equal(model.filter((tab) => tab.tabIndex === 0).length, 1);
    assert.ok(model.every((tab) => tab.role === "tab"));
    assert.ok(model.every((tab) => tab.controls === "analysis-workspace-panel"));
  }

  assert.equal(ui.nextAnalysisWorkspaceTabId("overview", "ArrowRight"), "start");
  assert.equal(ui.nextAnalysisWorkspaceTabId("overview", "ArrowLeft"), "evidence");
  assert.equal(ui.nextAnalysisWorkspaceTabId("evidence", "ArrowRight"), "start");
  assert.equal(ui.nextAnalysisWorkspaceTabId("performance", "Home"), "start");
  assert.equal(ui.nextAnalysisWorkspaceTabId("start", "End"), "evidence");
  assert.equal(ui.nextAnalysisWorkspaceTabId("compare", "PageDown"), null);

  const poststartIds = [...ui.ANALYSIS_POSTSTART_TASK_IDS];
  assert.deepEqual(poststartIds, ["compare", "evidence"]);
  assert.deepEqual(
    ui.analysisWorkspaceTabModel("overview", poststartIds).map((tab) => tab.id),
    poststartIds,
  );
  assert.equal(
    ui.nextAnalysisWorkspaceTabId("compare", "ArrowLeft", poststartIds),
    "evidence",
  );
  assert.equal(
    ui.nextAnalysisWorkspaceTabId("evidence", "ArrowRight", poststartIds),
    "compare",
  );
});

test("selection intent is controlled and owner state changes only through Stage 7A", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const race = generateRace(RACES[0].seed);
  const owner = {
    t: 22,
    playing: true,
    rate: 4,
    mode: "raw",
    rig: "freeform",
    followId: race.boats[0].id,
    chart2d: true,
    truthMode: true,
    reducedMotion: true,
    frozen: true,
    route: "/prototype/layline/races?race=long-beach",
    cameraSentinel: { x: 1 },
    analysis: analysisState.createAnalysisState(race, 22),
  };
  const snapshot = structuredClone(owner);
  const intent = ui.workspaceTabSelectionIntent("overview", "ArrowRight");
  assert.deepEqual(intent, { workspaceId: "start", handled: true });
  assert.deepEqual(owner, snapshot, "UI intent mutated its controlled owner");

  const transitioned = analysisState.transitionAnalysisWorkspaceOwner(race, owner, {
    type: "select-workspace",
    workspaceId: intent.workspaceId,
  });
  assert.equal(transitioned.analysis.active, "start");
  const { analysis: _beforeAnalysis, ...beforeOwner } = owner;
  const { analysis: _afterAnalysis, ...afterOwner } = transitioned;
  void _beforeAnalysis;
  void _afterAnalysis;
  assert.deepEqual(afterOwner, beforeOwner);
});

test("mounted tabs require one callback and route click and keyboard selection through it", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const selected = [];
  const onSelect = (workspaceId) => selected.push(workspaceId);
  ui.selectAnalysisWorkspaceTab("compare", onSelect);
  const intent = ui.workspaceTabSelectionIntent("compare", "ArrowRight");
  ui.selectAnalysisWorkspaceTab(intent.workspaceId, onSelect);
  assert.deepEqual(selected, ["compare", "evidence"]);

  const tabs = source("src/components/layline/hud/AnalysisWorkspaceTabs.tsx");
  const app = source("src/components/layline/LaylineApp.tsx");
  assert.match(tabs, /onSelect:\s*\(workspaceId: AnalysisWorkspaceId\) => void/);
  assert.match(tabs, /availableTaskIds:\s*readonly AnalysisWorkspaceId\[\]/);
  assert.doesNotMatch(tabs, /onSelect\?|onSelect\?\./);
  assert.match(tabs, /onClick=\{\(\) => selectAnalysisWorkspaceTab\(tab\.id, onSelect\)\}/);
  assert.match(tabs, /selectAnalysisWorkspaceTab\(intent\.workspaceId, onSelect\)/);
  assert.match(
    app,
    /analysisWorkspaces\?: boolean/,
  );
  assert.match(
    app,
    /useReplay\.getState\(\)\.selectAnalysisWorkspace\(workspaceId\)/,
  );
  assert.match(app, /return stage;/);
  assert.match(app, /const beforeGun = useReplay\(\(state\) => !analysisWorkspaces \|\| state\.t < 0\)/);
  assert.match(app, /analysis\.active === "start" && !beforeGun/);
  assert.match(app, /availableTaskIds=\{analysisTaskIds\}/);
});

test("Compare facts, timeline range and evidence targets share one controlled range", () => {
  assert.ok(ui, "production workspace UI model is missing");
  assert.equal(typeof ui.analysisWorkspaceSelectedRange, "function");
  assert.equal(typeof ui.analysisRangeEvidenceTarget, "function");

  const race = generateRace(RACES[0].seed);
  const primaryBoatId = race.boats[0].id;
  let session = analysisState.transitionAnalysisWorkspace(
    race,
    analysisState.createAnalysisState(race, 22),
    22,
    { type: "select-workspace", workspaceId: "compare" },
    { primaryBoatId },
  );
  session = analysisState.transitionAnalysisWorkspace(
    race,
    session,
    22,
    { type: "set-range", from: race.tMin, to: race.tMax, pinned: true },
    { primaryBoatId },
  );
  const resolved = analysisState.resolveAnalysisWorkspace(session, race, 22, {
    primaryBoatId,
  });
  const legacyRange = Object.freeze({
    from: 17,
    to: 27,
    fromMicros: 17_000_000,
    toMicros: 27_000_000,
  });
  const selectedRange = ui.analysisWorkspaceSelectedRange(resolved, legacyRange);
  const comparison = compareRange(race, {
    primaryBoatId,
    reference: session.reference,
    range: selectedRange,
  });

  assert.deepEqual(comparison.range, selectedRange);
  assert.deepEqual(selectedRange, resolved.range);
  assert.notDeepEqual(selectedRange, legacyRange);
  assert.equal(ui.analysisRangeEvidenceTarget(selectedRange, "in").seekTo, selectedRange.from);
  assert.equal(ui.analysisRangeEvidenceTarget(selectedRange, "out").seekTo, selectedRange.to);

  const app = source("src/components/layline/LaylineApp.tsx");
  const timeline = source("src/components/layline/hud/Timeline.tsx");
  assert.match(app, /range:\s*selectedAnalysisRange/);
  assert.match(
    app,
    /const timelineSelectedRange =\s*analysisWorkspace === null \? undefined : selectedAnalysisRange/,
  );
  assert.match(app, /selectedRange=\{timelineSelectedRange\}/);
  assert.doesNotMatch(timeline, /analysisEvidenceTarget\(replay\.analysis/);
  assert.match(timeline, /analysisRangeEvidenceTarget\(activeSelectedRange, edge\)/);
  assert.match(timeline, /activeSelectedRange\.from,\s*activeSelectedRange\.to/);
  assert.match(timeline, /clock\(activeSelectedRange\.from\)/);
  assert.match(
    timeline,
    /data-analysis-range=\{`\$\{activeSelectedRange\.fromMicros\}:\$\{activeSelectedRange\.toMicros\}`\}/,
  );
});

test("Comparison panel display and seeks use the passed result range when legacy state diverges", () => {
  assert.ok(ui, "production workspace UI model is missing");
  assert.equal(typeof ui.comparisonRangeEvidence, "function");

  const race = generateRace(RACES[0].seed);
  const primaryBoatId = race.boats[0].id;
  const controlledRange = Object.freeze({
    from: race.tMin,
    to: race.tMax,
    fromMicros: Math.round(race.tMin * 1_000_000),
    toMicros: Math.round(race.tMax * 1_000_000),
    durationMicros: Math.round((race.tMax - race.tMin) * 1_000_000),
  });
  const legacyRange = Object.freeze({
    from: 17,
    to: 27,
    fromMicros: 17_000_000,
    toMicros: 27_000_000,
  });
  const comparison = compareRange(race, {
    primaryBoatId,
    reference: { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    range: controlledRange,
  });
  const before = structuredClone(comparison);
  const evidence = ui.comparisonRangeEvidence(comparison);

  assert.deepEqual(comparison.range, controlledRange);
  assert.notDeepEqual(comparison.range, legacyRange);
  assert.equal(evidence.range, comparison.range);
  assert.equal(evidence.rangeLabel, `${fixStamp(comparison.range.from)} to ${fixStamp(comparison.range.to)}`);
  assert.deepEqual(evidence.in, {
    label: `Seek IN ${fixStamp(comparison.range.from)}`,
    range: comparison.range,
    seekTo: comparison.range.from,
  });
  assert.deepEqual(evidence.out, {
    label: `Seek OUT ${fixStamp(comparison.range.to)}`,
    range: comparison.range,
    seekTo: comparison.range.to,
  });
  assert.notEqual(evidence.in.seekTo, legacyRange.from);
  assert.notEqual(evidence.out.seekTo, legacyRange.to);
  assert.equal(
    evidence.in.seekTo,
    ui.analysisRangeEvidenceTarget(comparison.range, "in").seekTo,
    "controlled Timeline and panel IN targets diverged",
  );
  assert.equal(
    evidence.out.seekTo,
    ui.analysisRangeEvidenceTarget(comparison.range, "out").seekTo,
    "controlled Timeline and panel OUT targets diverged",
  );
  assert.deepEqual(comparison, before, "panel adapter mutated the comparison result");

  const legacyComparison = compareRange(race, {
    primaryBoatId,
    reference: { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    range: legacyRange,
  });
  const legacyEvidence = ui.comparisonRangeEvidence(legacyComparison);
  assert.equal(
    legacyEvidence.rangeLabel,
    `${fixStamp(legacyComparison.range.from)} to ${fixStamp(legacyComparison.range.to)}`,
  );
  assert.equal(legacyEvidence.in.seekTo, legacyComparison.range.from);
  assert.equal(legacyEvidence.out.seekTo, legacyComparison.range.to);

  const panel = source("src/components/layline/hud/ComparisonPanel.tsx");
  assert.match(panel, /comparisonRangeEvidence\(comparison\)/);
  assert.match(panel, /rangeEvidence\.rangeLabel/);
  assert.match(panel, /rangeEvidence\[edge\]\.seekTo/);
  assert.match(panel, /rangeEvidence\.in\.label/);
  assert.match(panel, /rangeEvidence\.out\.label/);
  assert.doesNotMatch(panel, /analysis\.selectedRange/);
});

test("resolved panels map to reused production surfaces with honest capability", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const race = generateRace(RACES[0].seed);
  const expected = {
    overview: "none",
    start: "start-line",
    compare: "comparison",
    performance: "performance-unavailable",
    evidence: "truth-inspector",
  };
  for (const workspaceId of analysisState.ANALYSIS_WORKSPACE_IDS) {
    const session = analysisState.transitionAnalysisWorkspace(
      race,
      analysisState.createAnalysisState(race, 22),
      22,
      { type: "select-workspace", workspaceId },
      { primaryBoatId: race.boats[0].id },
    );
    const resolved = analysisState.resolveAnalysisWorkspace(session, race, 22, {
      primaryBoatId: race.boats[0].id,
      performanceAvailable: false,
    });
    const panel = ui.analysisWorkspacePanelModel(resolved);
    assert.equal(panel.surface, expected[workspaceId], workspaceId);
    assert.equal(panel.panelId, resolved.panel);
    if (workspaceId === "performance") {
      assert.equal(resolved.surfaceAvailable, false);
      assert.equal(panel.available, false);
      assert.match(panel.description, /unavailable/i);
      assert.match(panel.description, /polar/i);
    } else {
      assert.equal(panel.available, true);
    }
  }

  const panelSource = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
  assert.doesNotMatch(panelSource, /import\s+\{\s*Standings\s*\}/);
  assert.doesNotMatch(panelSource, /<Standings\b/);
  assert.match(panelSource, /if \(model\.surface === "none"\) \{\s*surface = null;/);
  assert.match(panelSource, /<StartLine race=\{race\}/);
  assert.match(panelSource, /<ComparisonPanel race=\{race\}/);
  assert.match(panelSource, /<TruthInspector race=\{race\}/);
  assert.doesNotMatch(panelSource, /polarFrac|performanceReading|vmgToMark/);
});

test("Stage 7 layer controls expose four real capabilities and replace unavailable controls", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const race = generateRace(RACES[0].seed);
  const session = {
    ...analysisState.createAnalysisState(race, 22),
    active: "performance",
    layerOverrides: { wind: "on", performance: "on" },
  };
  const resolved = analysisState.resolveAnalysisWorkspace(session, race, 22, {
    primaryBoatId: race.boats[0].id,
    performanceAvailable: false,
  });
  const controls = ui.analysisLayerControlModels(session, resolved);
  assert.deepEqual(
    controls.filter((control) => control.available).map((control) => control.id),
    ["tracks", "laylines", "current", "raw-fixes"],
  );
  for (const id of ["wind", "performance"]) {
    const control = controls.find((entry) => entry.id === id);
    assert.equal(control.available, false);
    assert.equal(control.resolvedVisible, false);
    assert.match(control.unavailableWitness, /not available yet/i);
  }

  const disclosureSource = source("src/components/layline/hud/AnalysisLayerDisclosure.tsx");
  assert.match(disclosureSource, /layer\.available \? \(/);
  assert.match(disclosureSource, /data-layer-capability="unavailable"/);
  assert.match(disclosureSource, /layer\.unavailableWitness/);
  assert.match(disclosureSource, /disabled/);
});

test("timeline consumes only resolved lane intent, preserves order and stays bounded", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const race = generateRace(RACES[0].seed);
  for (const workspaceId of analysisState.ANALYSIS_WORKSPACE_IDS) {
    const resolved = analysisState.resolveAnalysisWorkspace(
      { ...analysisState.createAnalysisState(race, 22), active: workspaceId },
      race,
      22,
      { primaryBoatId: race.boats[0].id },
    );
    const layout = ui.analysisTimelineLayout(resolved.timelineLaneIds, true);
    assert.deepEqual(layout.visibleLaneIds, resolved.timelineLaneIds, workspaceId);
    assert.ok(layout.heightBudgetPx <= ui.ANALYSIS_TIMELINE_PHONE_MAX_HEIGHT_PX);
  }

  const hostile = ui.analysisTimelineLayout(
    ["raw-fix", "event", "event", "invalid", "gain-loss", "phase", "start", "maneuver"],
    false,
  );
  assert.deepEqual(hostile.visibleLaneIds, [
    "raw-fix",
    "event",
    "phase",
    "start",
    "maneuver",
  ]);
  assert.equal(hostile.rows.some((row) => row.id === "gain-loss"), false);
  assert.equal(hostile.showRawFixes, true);
  assert.ok(hostile.heightBudgetPx <= ui.ANALYSIS_TIMELINE_PHONE_MAX_HEIGHT_PX);

  const worst = ui.analysisTimelineLayout(
    ["start", "phase", "event", "maneuver", "gain-loss", "raw-fix"],
    true,
  );
  assert.equal(worst.heightBudgetPx, ui.ANALYSIS_TIMELINE_PHONE_MAX_HEIGHT_PX);
});

test("every lane subset assigns distinct deterministic label and rail rows", () => {
  assert.ok(ui, "production workspace UI model is missing");
  const laneIds = ["start", "phase", "event", "maneuver", "gain-loss", "raw-fix"];
  for (let mask = 0; mask < 2 ** laneIds.length; mask += 1) {
    const subset = laneIds.filter((_laneId, index) => (mask & (1 << index)) !== 0);
    for (const comparisonAvailable of [false, true]) {
      const first = ui.analysisTimelineLayout(subset, comparisonAvailable);
      const second = ui.analysisTimelineLayout(subset, comparisonAvailable);
      assert.deepEqual(second, first);
      for (const row of first.rows) {
        assert.notEqual(row.labelGridRow, row.railGridRow, `${mask}:${row.id}`);
        assert.ok(row.labelGridRow < row.railGridRow, `${mask}:${row.id}`);
      }
      const assigned = first.rows.flatMap((row) => [row.labelGridRow, row.railGridRow]);
      assigned.push(first.replayLabelGridRow, first.replayRailGridRow);
      assert.equal(new Set(assigned).size, assigned.length, `${mask}:duplicate row`);
      assert.ok(first.replayLabelGridRow < first.replayRailGridRow);
      assert.ok(first.replayRailGridRow < first.clockGridRow);
      assert.ok(first.heightBudgetPx <= ui.ANALYSIS_TIMELINE_PHONE_MAX_HEIGHT_PX);
    }
  }

  const timeline = source("src/components/layline/hud/Timeline.tsx");
  assert.match(timeline, /laneRow\("start"\)\?\.labelGridRow/);
  assert.match(timeline, /laneRow\("start"\)\?\.railGridRow/);
  assert.match(timeline, /layout\.replayLabelGridRow/);
  assert.match(timeline, /layout\.replayRailGridRow/);
});

test("dock ownership preserves one viewer and analyst", () => {
  assert.ok(ui, "production workspace UI model is missing");
  assert.equal(ui.analysisWorkspacePanelDock("standings-leg-summary"), "left");
  assert.equal(ui.analysisWorkspacePanelDock("start-line"), "left");
  assert.equal(ui.analysisWorkspacePanelDock("comparison"), "left");
  assert.equal(ui.analysisWorkspacePanelDock("performance"), "left");
  assert.equal(ui.analysisWorkspacePanelDock("truth-provenance"), "right");

  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const app = source("src/components/layline/LaylineApp.tsx");
  const tabs = source("src/components/layline/hud/AnalysisWorkspaceTabs.tsx");
  const panel = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
  const disclosure = source("src/components/layline/hud/AnalysisLayerDisclosure.tsx");
  const timeline = source("src/components/layline/hud/Timeline.tsx");

  assert.equal((workspace.match(/<LaylineApp\b/g) ?? []).length, 1);
  assert.equal((workspace.match(/<AnalystSection\b/g) ?? []).length, 1);
  assert.match(workspace, /<AnalystSection key=\{raceId\}/);
  assert.doesNotMatch(workspace, /analysisWorkspaceId|onAnalysisWorkspaceSelect|ANALYSIS_WORKSPACE_IDS/);
  assert.doesNotMatch(workspace, /useState\([^\n]*analysisWorkspace/i);

  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{tab\.selected\}/);
  assert.match(tabs, /tabIndex=\{tab\.tabIndex\}/);
  assert.match(tabs, /useState\(false\)/);
  assert.doesNotMatch(tabs, /localStorage|document\.cookie|URLSearchParams/);
  assert.match(tabs, />\s*Analyze\s*<\/button>/);
  assert.match(tabs, /Back to replay/);
  assert.match(app, /data-analysis-flow="viewer"/);
  assert.match(app, /const analysisWorkspaceReady = !briefed \|\| briefDone/);
  assert.match(app, /analysisNavigation=\{analysisWorkspaceReady \? analysisTabs : undefined\}/);
  assert.match(app, /analysisPanelDock === "left"/);
  assert.match(app, /analysisPanelDock === "right"/);
  assert.match(app, /analysisWorkspaceReady \? analysisLayers : null/);
  assert.match(disclosure, /<details className=\{styles\.analysisLayerDisclosure\}>/);
  assert.doesNotMatch(panel, /analysisLayerDisclosure/);
  assert.doesNotMatch(app, /className=\{styles\.analysisWorkspaceShell\}/);
  assert.match(timeline, /data-analysis-flow="timeline"/);
  assert.match(panel, /data-analysis-flow="panel"/);
  assert.match(timeline, /visibleLaneIds/);
  assert.doesNotMatch(timeline, /workspaceId|ANALYSIS_WORKSPACE_PRESETS/);
});

test("responsive CSS keeps task chrome inside stage docks", () => {
  const css = source("src/app/prototype/layline/layline.module.css");
  assert.doesNotMatch(css, /\.analysisWorkspaceTabs[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.analysisWorkspaceTabs[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.analysisWorkspaceTab:focus-visible/);
  assert.match(css, /\.dockTopAnalysis:has\(\.analysisTaskPicker\)[^}]*grid-template-rows:\s*48px 52px/);
  assert.match(css, /\.stage:has\(\.analysisTaskPicker\) \.dockLeft[^}]*top:\s*108px/);
  assert.match(css, /\.analysisLayerDisclosure/);
  assert.doesNotMatch(css, /\.analysisWorkspacePanel[^}]*max-height:\s*min\(30vh, 320px\)/);
  assert.doesNotMatch(css, /\.analysisWorkspacePanel[^}]*overflow-y:\s*auto/);
});

test("SVG titles use one React child", () => {
  const track = source("src/components/layline/svg/TrackChart.tsx");
  assert.doesNotMatch(track, /<title>\{CURRENT_FIELD_PROVENANCE\}\s+at t=0<\/title>/);
  assert.match(track, /<title>\{`\$\{CURRENT_FIELD_PROVENANCE\} at t=0`\}<\/title>/);
});

test("workspace UI helper has one production owner under lib", () => {
  assert.equal(existsSync(targetUiModelUrl), true);
  assert.equal(existsSync(legacyUiModelUrl), false);

  const srcRoot = new URL("../src/", import.meta.url);
  const owners = [];
  const visit = (url) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) visit(child);
      else if (entry.name === "analysis-workspace-ui.ts") owners.push(child.pathname);
    }
  };
  visit(srcRoot);
  assert.equal(owners.length, 1);
  assert.match(owners[0].replaceAll("\\", "/"), /\/src\/lib\/layline\/analysis-workspace-ui\.ts$/);
});
