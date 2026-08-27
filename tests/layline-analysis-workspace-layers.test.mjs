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

const analysis = await import("../src/lib/layline/analysis-state.ts");
const layerModel = await import("../src/lib/layline/analysis-layers.ts");
const surfaces = await import("../src/lib/layline/surfaces.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const races = RACES.map((meta) => generateRace(meta.seed));

test("3D, 2D and no-WebGL adapters stay identical for every preset and 3^6 override", (t) => {
  let models = 0;
  let assertions = 0;
  for (const race of races) {
    for (const workspaceId of analysis.ANALYSIS_WORKSPACE_IDS) {
      for (let encoded = 0; encoded < 3 ** analysis.ANALYSIS_LAYER_IDS.length; encoded++) {
        let cursor = encoded;
        const layerOverrides = {};
        for (const layerId of analysis.ANALYSIS_LAYER_IDS) {
          const value = cursor % 3;
          cursor = Math.floor(cursor / 3);
          if (value === 1) layerOverrides[layerId] = "on";
          if (value === 2) layerOverrides[layerId] = "off";
        }
        const session = {
          ...analysis.createAnalysisState(race, 22),
          active: workspaceId,
          layerOverrides,
        };
        const resolved = analysis.resolveAnalysisWorkspace(session, race, 22, {
          primaryBoatId: race.boats[0].id,
        });
        const scene = layerModel.rendererLayerVisibility(resolved.layers, "3d");
        const chart = layerModel.rendererLayerVisibility(resolved.layers, "2d");
        const fallback = layerModel.rendererLayerVisibility(resolved.layers, "no-webgl");
        assert.deepEqual(scene, chart);
        assert.deepEqual(chart, fallback);
        for (const layerId of analysis.ANALYSIS_LAYER_IDS) {
          const available = layerModel.STAGE7_ANALYSIS_LAYER_CAPABILITIES[layerId].available;
          assert.equal(scene[layerId], available && resolved.layers[layerId]);
          assertions++;
        }
        models += 3;
      }
    }
  }
  assert.equal(models, 3 * races.length * analysis.ANALYSIS_WORKSPACE_IDS.length * 3 ** 6);
  t.diagnostic(`${models} surface models; ${assertions} resolved-layer assertions`);
});

test("renderer modules consume visibility only and never workspace intent", () => {
  const renderers = [
    "src/components/layline/scene/LaylineScene.tsx",
    "src/components/layline/scene/CurrentField.tsx",
    "src/components/layline/scene/CourseGraphics.tsx",
    "src/components/layline/scene/BoatTracks.tsx",
    "src/components/layline/svg/ChartView.tsx",
    "src/components/layline/svg/TrackChart.tsx",
  ];
  for (const path of renderers) {
    const body = source(path);
    assert.match(
      body,
      /LayerVisibility|layers|visible|showLaylines|showTracks|showRawFixes|data-analysis-layer/,
    );
    assert.doesNotMatch(body, /AnalysisWorkspaceId|ANALYSIS_WORKSPACE_PRESETS|workspaceId/);
  }
});

test("one live store session drives tabs, panel, range, lanes and layers", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const panel = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
  assert.match(workspace, /analysisWorkspaces/);
  assert.match(app, /useReplay\(\(state\) => state\.analysis\)/);
  assert.match(app, /analysisWorkspaces && !state\.analysis\.rangePinned[\s\S]*analysisReplayCadenceKey\(state\.t\)/);
  const cadenceSubscription = app.match(
    /const analysisReplayCadence = useReplay[\s\S]*?const analysisWorkspace = useMemo/,
  )?.[0] ?? "";
  assert.doesNotMatch(cadenceSubscription, /requestAnimationFrame|setInterval|setTimeout|\.advance\(/);
  assert.match(app, /selectAnalysisWorkspace\(workspaceId\)/);
  assert.match(app, /resolveAnalysisWorkspace\(\s*analysis,/);
  assert.match(app, /visibleLaneIds=\{analysisWorkspace\?\.timelineLaneIds\}/);
  assert.match(app, /layers=\{sceneLayers\}/);
  assert.match(app, /layers=\{chartLayers\}/);
  assert.match(app, /layers=\{noWebglLayers\}/);
  assert.match(panel, /setAnalysisLayer|onLayerChange|onReset/);
  assert.equal((app.match(/<AnalysisWorkspacePanel\b/g) ?? []).length, 1);
  assert.doesNotMatch(app, /useState\([^\n]*analysisWorkspace/i);
  assert.doesNotMatch(workspace, /useState\([^\n]*analysisWorkspace/i);
});

test("manual layer controls expose default/on/off and scoped reset", () => {
  const panel = source("src/components/layline/hud/AnalysisWorkspacePanel.tsx");
  const css = source("src/app/prototype/layline/layline.module.css");
  assert.match(panel, /<details className=\{styles\.analysisLayerDisclosure\}>/);
  assert.match(panel, /<summary>Analysis layers<\/summary>/);
  assert.match(panel, /<fieldset/);
  /* All three states on the panel at once, not behind a select: the state a
     layer is in is legible without opening anything, and changing it costs one
     click rather than two. */
  assert.doesNotMatch(panel, /<select|<option/);
  assert.match(panel, /\{ value: "on", label: "On" \}/);
  assert.match(panel, /\{ value: "off", label: "Off" \}/);
  /* The preset's own call has no segment. It is not a third thing a layer can
     be doing, it is where the current state came from, so the segments read
     the resolved visibility and the row marks itself when an override is what
     put it there. Reset range and layers is the way back to the preset. */
  assert.doesNotMatch(panel, /label: "Default"/);
  assert.match(panel, /checked=\{layer\.resolvedVisible === \(choice\.value === "on"\)\}/);
  assert.match(panel, /role="radiogroup"/);
  assert.match(panel, /type="radio"/);
  assert.match(panel, /name=\{`analysis-layer-\$\{layer\.id\}`\}/);
  assert.match(panel, /onChange=\{\(\) => onLayerChange\(layer\.id, choice\.value\)\}/);
  /* The radio is the state and the keyboard, the segment is the paint. Hidden
     with display: none it would leave the group unreachable by tab. */
  const hidden = css.slice(
    css.indexOf(".analysisLayerChoice input {"),
    css.indexOf(".analysisLayerChoice > span {"),
  );
  assert.doesNotMatch(hidden, /display:\s*none|visibility:\s*hidden/);
  assert.match(hidden, /clip-path: inset\(50%\)/);
  /* Which one is selected has to be visible without reading a legend. */
  assert.match(
    panel,
    /data-selected=\{\s*layer\.resolvedVisible === \(choice\.value === "on"\) \? "yes" : "no"\s*\}/,
  );
  assert.match(css, /\.analysisLayerChoice\[data-selected="yes"\] \{/);
  assert.match(panel, /Reset range and layers/);
  /* An override is why a workspace can be showing something other than what
     its preset says, so the row states that separately from which segment is
     lit: the two agree when the preset is being followed. */
  assert.match(panel, /data-layer-override=/);
  assert.match(panel, /data-layer-resolved=/);
  assert.match(
    css,
    /\.analysisLayerControl\[data-layer-override="on"\] \.analysisLayerChoices,\s*\r?\n\.analysisLayerControl\[data-layer-override="off"\] \.analysisLayerChoices \{/,
  );
});

test("interactive no-WebGL uses the replay-aware chart while static first paint stays honest", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  const chart = source("src/components/layline/svg/TrackChart.tsx");
  const css = source("src/app/prototype/layline/layline.module.css");
  assert.match(app, /!live && analysisWorkspaceReady && \(analysisWorkspace !== null \|\| truthMode\)/);
  assert.match(app, /<ChartView race=\{race\} inspection=\{visibleInspection\} layers=\{noWebglLayers\}/);
  assert.match(chart, /data-analysis-layer="tracks"/);
  assert.match(chart, /data-analysis-layer="current"/);
  assert.doesNotMatch(chart, /data-analysis-layer="laylines"|data-analysis-layer="raw-fixes"/);
  assert.doesNotMatch(app, /data-layer-laylines=|data-layer-raw-fixes=/);
  assert.doesNotMatch(css, /\[data-renderer="static"\][^\n]*data-analysis-layer="laylines"/);
});

test("layer wiring retains resource caps, ownership and persistent geometry", () => {
  const tracks = source("src/components/layline/scene/BoatTracks.tsx");
  const current = source("src/components/layline/scene/CurrentField.tsx");
  const course = source("src/components/layline/scene/CourseGraphics.tsx");
  assert.match(tracks, /const TRACK_CAP = 288/);
  assert.match(tracks, /RAW_FIX_EVIDENCE_SLOTS_PER_BOAT/);
  assert.match(tracks, /createReplayRawFixEvidenceModel\(race\)/);
  assert.match(tracks, /sampleReplayRawFixEvidence\(race, t, followId, showRawFixes, truthMode, rawFixEvidence\)/);
  assert.match(tracks, /useMemo\(\(\) => \{/);
  assert.match(tracks, /for \(const ribbon of ribbons\) ribbon\.geometry\.dispose\(\)/);
  assert.doesNotMatch(tracks.match(/useFrame\([\s\S]*?\}, -55\);/)?.[0] ?? "", /new BufferGeometry|new InstancedBufferGeometry/);
  assert.match(current, /CURRENT_FIELD_3D_MAX_GLYPHS/);
  assert.match(current, /kit\.geometry\.dispose\(\)/);
  assert.match(current, /kit\.material\.dispose\(\)/);
  assert.doesNotMatch(current.match(/useFrame\([\s\S]*?\}, -57\);/)?.[0] ?? "", /new ConeGeometry|new MeshBasicMaterial/);
  assert.match(course, /const LINE_CAP = 1536/);
  assert.match(course, /useMemo\(\(\) => buildCourse/);
  assert.match(course, /useEffect\(\(\) => kit\.dispose/);
});

test("real inspection surface becomes finite SVG paths with an exact two-trace cap", (t) => {
  let probes = 0;
  for (const race of races) {
    const boatId = race.boats[0].id;
    const candidates = race.fixes[boatId].filter((_fix, index) => index % 40 === 0);
    const inspection = candidates
      .map((fix) => surfaces.buildLaylineInspectionSurface(race, boatId, fix.t))
      .find((surface) => surface.traces.some((entry) => entry.trace.points.length >= 2));
    assert.ok(inspection, `${race.id}: no drawable inspection surface`);
    const paths = surfaces.laylineInspectionSvgPaths(inspection);
    assert.ok(paths.length > 0 && paths.length <= 2, `${race.id}:${paths.length}`);
    assert.equal(paths.length, Math.min(2, inspection.traces.filter((entry) =>
      entry.trace.status !== "invalid" && entry.trace.points.length >= 2
    ).length));
    for (const path of paths) {
      assert.equal(path.provenance, inspection.provenance);
      assert.equal(path.sampledAt, inspection.sampledAt);
      assert.doesNotMatch(path.d, /NaN|Infinity/);
      assert.ok(path.pointCount >= 2);
      probes += path.pointCount;
    }
  }
  assert.ok(probes > 0);
  t.diagnostic(`${probes} finite layline SVG points from production inspection surfaces`);
});

test("SVG layline adapter rejects hostile geometry and never exceeds two traces", () => {
  const trace = (side, points) => ({
    side,
    trace: {
      status: "horizon",
      points,
      etaSeconds: null,
      closestApproachMeters: null,
      closestApproachTime: null,
      steps: points.length - 1,
      candidateEvaluations: 0,
    },
  });
  const hostile = {
    boatId: "hostile",
    fixIndex: 0,
    sampledAt: 4,
    leg: "beat",
    pace: 1,
    declaredTwaAbs: 44,
    provenance: surfaces.CURRENT_FIELD_PROVENANCE,
    traces: [
      trace("port", [{ x: 0, y: 0, t: 4 }, { x: 1, y: 2, t: 4.25 }]),
      trace("starboard", [{ x: -0, y: 0, t: 4 }, { x: -1, y: 2, t: 4.25 }]),
      trace("port", [{ x: 4, y: 4, t: 4 }, { x: 5, y: 5, t: 4.25 }]),
    ],
  };
  const capped = surfaces.laylineInspectionSvgPaths(hostile);
  assert.equal(capped.length, 2);
  assert.equal(capped[1].d.includes("-0"), false);

  for (const points of [
    [{ x: 0, y: 0, t: 0 }, { x: Number.NaN, y: 1, t: 1 }],
    [{ x: 0, y: 0, t: 0 }, { x: 1, y: Infinity, t: 1 }],
    [{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: Number.NaN }],
  ]) {
    assert.deepEqual(surfaces.laylineInspectionSvgPaths({ ...hostile, traces: [trace("port", points)] }), []);
  }
  const revoked = Proxy.revocable(hostile, {});
  revoked.revoke();
  assert.doesNotThrow(() => surfaces.laylineInspectionSvgPaths(revoked.proxy));
  assert.deepEqual(surfaces.laylineInspectionSvgPaths(revoked.proxy), []);
});

test("ChartView owns real layline/raw groups without recomputing either model", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  const chart = source("src/components/layline/svg/ChartView.tsx");
  assert.match(chart, /laylineInspectionSvgPaths\(inspection\)/);
  assert.match(chart, /data-analysis-layer="laylines"/);
  assert.match(chart, /data-analysis-layer="raw-fixes"/);
  assert.match(chart, /replayRawFixesVisible\(layers, truthMode\)/);
  assert.match(chart, /createReplayRawFixEvidenceModel\(race\)/);
  assert.match(chart, /sampleReplayRawFixEvidence\(/);
  assert.doesNotMatch(chart, /cachedTraceLaylineInspection|traceLaylineInspection|targetBoatSpeed|sampleWindField/);
  assert.equal((app.match(/inspection=\{visibleInspection\}/g) ?? []).length >= 3, true);
  assert.doesNotMatch(chart, /AnalysisWorkspaceId|ANALYSIS_WORKSPACE_PRESETS|workspaceId/);
});

test("raw fixes remain independent from replay truth and unavailable layers are masked", () => {
  const off = { ...layerModel.LEGACY_REPLAY_LAYER_VISIBILITY, "raw-fixes": false };
  const on = { ...off, "raw-fixes": true };
  assert.equal(layerModel.replayRawFixesVisible(off, false), false);
  assert.equal(layerModel.replayRawFixesVisible(on, false), true);
  assert.equal(layerModel.replayRawFixesVisible(off, true), true);
  assert.equal(layerModel.replayRawFixesVisible(on, true), true);
  for (const surface of ["3d", "2d", "no-webgl"]) {
    const masked = layerModel.rendererLayerVisibility({
      tracks: true,
      laylines: true,
      current: true,
      wind: true,
      performance: true,
      "raw-fixes": true,
    }, surface);
    assert.deepEqual(masked, {
      tracks: true,
      laylines: true,
      current: true,
      wind: false,
      performance: false,
      "raw-fixes": true,
    });
  }
});
