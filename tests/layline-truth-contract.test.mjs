import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
      }
      if (!specifier.startsWith('.')) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { replayRawFixesVisible } = await import('../src/lib/layline/analysis-layers.ts');

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('truth mode is explicit state and does not replace the playback lens', async () => {
  const [store, topBar, transport] = await Promise.all([
    read('src/components/layline/store.ts'),
    read('src/components/layline/hud/TopBar.tsx'),
    read('src/components/layline/hud/Transport.tsx'),
  ]);

  assert.match(store, /mode: "smooth"/);
  assert.match(store, /truthMode: false/);
  assert.match(store, /transitionReplay\(state, \{ type: "set-mode", mode \}\)/);
  assert.match(store, /transitionReplay\(state, \{ type: "set-truth", on \}\)/);
  assert.match(topBar, /data-control="truth-mode"/);
  assert.match(topBar, /aria-pressed=\{truthMode\}/);
  assert.match(topBar, /aria-label=\{`Telemetry truth mode, \$\{truthMode \? "on" : "off"\}`\}/);
  assert.match(transport, /setMode\(raw \? "smooth" : "raw"\)/);
  assert.doesNotMatch(transport, /setTruthMode/);
});

test('inspector states provenance and reads one shared derivation helper', async () => {
  const inspector = await read('src/components/layline/hud/TruthInspector.tsx');

  assert.match(inspector, /import \{[^}]*fixStamp[^}]*heading[^}]*\} from "@\/lib\/layline\/format"/);
  assert.doesNotMatch(inspector, /function (?:fixStamp|heading)\(/);
  assert.match(inspector, /telemetryTruthAt\(race, live\.followId, live\.t, buffer\.current\)/);
  assert.match(inspector, /Recorded current sample/);
  assert.match(inspector, /Reconstructed current from recorded fixes/);
  assert.match(inspector, /<VectorTriangle race=\{race\} inspection=\{inspection\} \/>/);
  assert.match(inspector, /MEASURED · BEFORE \/ CURRENT/);
  assert.match(inspector, /MEASURED · AFTER \/ CURRENT/);
  assert.match(inspector, /DERIVED · CLOCK POSITION/);
  assert.match(inspector, /RAW HOLD · MEASURED/);
  assert.match(inspector, /SMOOTH · RECONSTRUCTED/);
  assert.match(inspector, /SHARED REPLAY TIME/);
  assert.match(inspector, /2D TRACK · RENDERER UNAVAILABLE/);
  assert.match(inspector, /posePosition\(truth\.raw\)/);
  assert.match(inspector, /poseHeading\(truth\.raw\)/);
  assert.match(inspector, /posePosition\(truth\.reconstructed\)/);
  assert.match(inspector, /poseHeading\(truth\.reconstructed\)/);
  assert.match(inspector, /value === null \? "X \/ Y"/);
  assert.match(inspector, /value === null \? "NO SAMPLE"/);
  assert.doesNotMatch(inspector, /(?:initial|truth)\.(?:raw|reconstructed)\.(?:x|y|hdg)/);
  assert.doesNotMatch(inspector, /confidence|packet arrival|GPS error/i);
});

test('3D truth fixes reuse persistent instances and dispose every render resource', async () => {
  const tracks = await read('src/components/layline/scene/BoatTracks.tsx');

  assert.match(tracks, /createReplayRawFixEvidenceModel\(race\)/);
  assert.match(tracks, /sampleReplayRawFixEvidence\(race, t, followId, showRawFixes, truthMode, rawFixEvidence\)/);
  assert.match(tracks, /replayRawFixesVisible\(showRawFixes, truthMode\)/);
  assert.match(tracks, /dots\.visible = rawFixesVisible/);
  assert.doesNotMatch(tracks, /dots\.visible = \(showTracks && raw\)/);
  assert.match(tracks, /for \(const entry of rawFixEvidence\.slots\)/);
  assert.match(tracks, /kit\.dotData\[offset\] = fix\.x/);
  assert.match(tracks, /new InstancedBufferGeometry\(\)/);
  assert.match(tracks, /for \(const ribbon of ribbons\) ribbon\.geometry\.dispose\(\)/);
  assert.match(tracks, /dots\.dispose\(\)/);
  assert.match(tracks, /dotMaterial\.dispose\(\)/);
  assert.doesNotMatch(tracks.match(/useFrame\(\(state\) => \{[\s\S]*?\n  \}, -55\);/)?.[0] ?? '', /new (BufferGeometry|InstancedBufferGeometry)/);
});

test('raw-fix evidence visibility follows layer or truth across both replay modes', (t) => {
  let states = 0;
  for (const replayMode of ['raw', 'smooth']) {
    for (const rawFixesLayerOn of [false, true]) {
      for (const truthMode of [false, true]) {
        const layers = { 'raw-fixes': rawFixesLayerOn };
        assert.equal(
          replayRawFixesVisible(rawFixesLayerOn, truthMode),
          rawFixesLayerOn || truthMode,
          `3D ${replayMode}: layer=${rawFixesLayerOn}, truth=${truthMode}`,
        );
        assert.equal(
          replayRawFixesVisible(layers, truthMode),
          rawFixesLayerOn || truthMode,
          `2D/no-WebGL ${replayMode}: layer=${rawFixesLayerOn}, truth=${truthMode}`,
        );
        states++;
      }
    }
  }
  assert.equal(states, 8);
  t.diagnostic(`${states} raw-fix visibility states`);
});

test('2D and no-WebGL paths draw the shared measured evidence model', async () => {
  const [chart, app, styles] = await Promise.all([
    read('src/components/layline/svg/ChartView.tsx'),
    read('src/components/layline/LaylineApp.tsx'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  assert.match(chart, /data-truth-fixes=\{rawFixEvidence\.kind === "truth-witness" \? followId : undefined\}/);
  assert.match(chart, /data-raw-fix-boats=\{\s*rawFixEvidence\.kind === "fleet-window" \? rawFixEvidence\.boatCount : undefined\s*\}/);
  assert.match(chart, /data-provenance="measured"/);
  assert.match(chart, /createReplayRawFixEvidenceModel\(race\)/);
  assert.match(chart, /sampleReplayRawFixEvidence\([\s\S]*?live\.followId,[\s\S]*?layers,[\s\S]*?truthMode,[\s\S]*?rawFixEvidence/);
  assert.match(chart, /rawFixEvidence\.slots\.map\(\(entry\)/);
  assert.doesNotMatch(chart, /function truthWindowStart/);
  assert.doesNotMatch(chart, /beforeIndex - Math\.floor/);
  assert.doesNotMatch(await read('src/components/layline/scene/BoatTracks.tsx'), /beforeIndex - Math\.floor/);
  assert.match(app, /!live && analysisWorkspaceReady && \(analysisWorkspace !== null \|\| truthMode\)/);
  assert.match(app, /className=\{styles\.truthFallbackLayer\}/);
  assert.match(app, /<ChartView race=\{race\} inspection=\{visibleInspection\} layers=\{noWebglLayers\} \/>/);
  assert.match(styles, /\.truthFallbackLayer \{[\s\S]*?background: var\(--water-deep\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('truth control swaps inspector and instruments while preserving the no-WebGL vector surface', async () => {
  const [topBar, app, workspacePanel, inspector, styles] = await Promise.all([
    read('src/components/layline/hud/TopBar.tsx'),
    read('src/components/layline/LaylineApp.tsx'),
    read('src/components/layline/hud/AnalysisWorkspacePanel.tsx'),
    read('src/components/layline/hud/TruthInspector.tsx'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  assert.match(topBar, /aria-controls=\{truthMode \? "truth-inspector" : undefined\}/);
  assert.match(topBar, /aria-pressed=\{truthMode\}/);
  assert.doesNotMatch(topBar, /aria-controls="truth-inspector"/);
  /* The truth branch outranks Compare's empty instrument dock so that the
     TopBar's aria-controls="truth-inspector" target can exist in every
     workspace; only the Evidence panel, which embeds the same inspector,
     still supersedes it. */
  assert.match(app, /truthMode && analysisWorkspace\?\.panel !== "truth-provenance" \? \([\s\S]*?<TruthInspector race=\{race\} inspection=\{visibleInspection\} \/>[\s\S]*?\) : analysisWorkspace\?\.panel === "comparison" \? null : live \? \([\s\S]*?<Instruments race=\{race\} inspection=\{visibleInspection\} \/>[\s\S]*?\) : null/);
  assert.match(workspacePanel, /<TruthInspector race=\{race\} inspection=\{inspection\} \/>/);
  assert.doesNotMatch(app, /<TruthInspector[^>]+hidden=/);
  assert.match(inspector, /id="truth-inspector"/);
  assert.doesNotMatch(inspector, /hidden=\{/);
  assert.doesNotMatch(styles, /\.truthInspector\[hidden\]/);
  assert.match(styles, /\.dockLeft:empty,\s*\.dockRight:empty,\s*\.dockBottom:empty\s*\{\s*display:\s*none/);
  assert.match(styles, /@media \(max-width: 900px\)/);
});
