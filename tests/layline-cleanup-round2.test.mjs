import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const analysis = await import("../src/lib/layline/analysis-state.ts");
const ui = await import("../src/lib/layline/analysis-workspace-ui.ts");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Analyze exposes only available tasks while the five workspace IDs remain compatible", () => {
  assert.deepEqual([...analysis.ANALYSIS_WORKSPACE_IDS], [
    "overview",
    "start",
    "compare",
    "performance",
    "evidence",
  ]);
  assert.deepEqual(Object.keys(analysis.ANALYSIS_WORKSPACE_PRESETS), [
    "overview",
    "start",
    "compare",
    "performance",
    "evidence",
  ]);
  assert.deepEqual([...ui.ANALYSIS_AVAILABLE_TASK_IDS], ["start", "compare", "evidence"]);
  assert.deepEqual(
    ui.analysisWorkspaceTabModel("overview").map(({ id, label }) => ({ id, label })),
    [
      { id: "start", label: "Start review" },
      { id: "compare", label: "Compare" },
      { id: "evidence", label: "Evidence" },
    ],
  );
  assert.equal(ui.nextAnalysisWorkspaceTabId("start", "ArrowLeft"), "evidence");
  assert.equal(ui.nextAnalysisWorkspaceTabId("evidence", "ArrowRight"), "start");
  assert.equal(ui.nextAnalysisWorkspaceTabId("compare", "Home"), "start");
  assert.equal(ui.nextAnalysisWorkspaceTabId("compare", "End"), "evidence");
});

test("Analyze picker is disclosure-driven, keyboard complete and never renders Performance", async () => {
  const picker = await read("src/components/layline/hud/AnalysisWorkspaceTabs.tsx");

  assert.match(picker, />\s*Analyze\s*<\/button>/);
  assert.match(picker, /aria-expanded=\{open\}/);
  assert.match(picker, /aria-controls=\{ANALYSIS_TASK_PICKER_ID\}/);
  assert.match(picker, /open \? \(/);
  assert.match(picker, /role="tablist"/);
  assert.match(picker, /Back to replay/);
  assert.match(picker, /event\.key !== "Escape"/);
  assert.match(picker, /selectAnalysisWorkspaceTab\("overview", onSelect\)/);
  assert.match(picker, /analyzeRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(picker, />Performance</);
});

test("race workspace hides Truth while the story player retains the control", async () => {
  const [app, topBar] = await Promise.all([
    read("src/components/layline/LaylineApp.tsx"),
    read("src/components/layline/hud/TopBar.tsx"),
  ]);

  assert.match(topBar, /showTruthControl = true/);
  assert.match(topBar, /\{showTruthControl \? \(/);
  assert.match(app, /showTruthControl=\{!analysisWorkspaces\}/);
  assert.match(app, /!analysisWorkspaces && truthMode/);
  assert.match(app, /if \(!analysisWorkspaces \|\| !truthMode\) return;[\s\S]*setTruthMode\(false\)/);
  assert.match(app, /Performance is unavailable\. Replay selected\./);
  assert.match(app, /role="status"/);
});

test("Evidence defaults measured fixes on without changing replay lens state", () => {
  assert.equal(analysis.ANALYSIS_WORKSPACE_PRESETS.evidence.layerIntent["raw-fixes"], "on");
  assert.deepEqual(analysis.ANALYSIS_WORKSPACE_PRESETS.evidence.controls, [
    "truth-mode",
    "replay-mode",
  ]);
});

test("Start review and camera Line are separate visible actions", async () => {
  const transport = await read("src/components/layline/hud/Transport.tsx");

  assert.equal(analysis.ANALYSIS_WORKSPACE_PRESETS.start.label, "Start review");
  assert.match(
    transport,
    /\{ target: "start", label: "Line", described: "Frame the start line" \}/,
  );
  assert.doesNotMatch(transport, /target: "start", label: "Start"/);
});

test("touch layouts use 44px controls and task navigation cannot scroll sideways", async () => {
  const css = await read("src/app/prototype/layline/layline.module.css");
  const racesCss = await read("src/app/prototype/layline/races/races.module.css");
  const mobile = css.split("@media (max-width: 900px) {")[1] ?? "";
  const racesMobile = racesCss.split("@media (max-width: 900px) {")[1] ?? "";

  assert.doesNotMatch(css, /\.analysisWorkspaceTabs[^}]*overflow-x:\s*auto/);
  assert.match(mobile, /\.analysisWorkspaceTab[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.analysisLayerDisclosure > summary[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.truthButton[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.playButton[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(
    mobile,
    /\.segButton,\s*\.snapButton,\s*\.return3dButton[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
  );
  assert.match(
    mobile,
    /\.dockBottom \.cameraGroup \.viewButton[^}]*min-width:\s*44px/,
  );
  assert.match(
    mobile,
    /\.comparisonRangeBand[^}]*top:\s*0[^}]*bottom:\s*auto[^}]*height:\s*44px[^}]*min-width:\s*44px/,
  );
  assert.match(
    racesMobile,
    /\.themeButton,\s*\.panelToggle[^}]*width:\s*44px[^}]*height:\s*44px/,
  );
  assert.match(racesCss, /\.themeIcon[^}]*width:\s*18px[^}]*height:\s*18px/);
  assert.match(racesCss, /\.panelToggleIcon[^}]*width:\s*18px[^}]*height:\s*18px/);
  assert.match(css, /@media \(max-width: 479px\)[\s\S]*\.analysisWorkspaceTabs[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
