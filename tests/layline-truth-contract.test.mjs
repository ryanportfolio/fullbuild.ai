import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

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

  assert.match(inspector, /import \{ fixStamp, heading \} from "@\/lib\/layline\/format"/);
  assert.doesNotMatch(inspector, /function (?:fixStamp|heading)\(/);
  assert.match(inspector, /telemetryTruthAt\(race, live\.followId, live\.t, buffer\.current\)/);
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

  assert.match(tracks, /telemetryTruthAt\(race, followId, t, truth\)/);
  assert.match(tracks, /truthFixWindow\(fixes\.length, truth\.beforeIndex\)/);
  assert.match(tracks, /dots\.visible = raw \|\| truthMode/);
  assert.match(tracks, /kit\.dotData\[at \* 3\] = fix\.x/);
  assert.match(tracks, /new InstancedBufferGeometry\(\)/);
  assert.match(tracks, /for \(const ribbon of ribbons\) ribbon\.geometry\.dispose\(\)/);
  assert.match(tracks, /dots\.dispose\(\)/);
  assert.match(tracks, /dotMaterial\.dispose\(\)/);
  assert.doesNotMatch(tracks.match(/useFrame\(\(state\) => \{[\s\S]*?\n  \}, -55\);/)?.[0] ?? '', /new (BufferGeometry|InstancedBufferGeometry)/);
});

test('2D and no-WebGL truth paths draw measured selected-boat fixes', async () => {
  const [chart, app, styles] = await Promise.all([
    read('src/components/layline/svg/ChartView.tsx'),
    read('src/components/layline/LaylineApp.tsx'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  assert.match(chart, /data-truth-fixes=\{followId\}/);
  assert.match(chart, /data-provenance="measured"/);
  assert.match(chart, /const fix = fixes\[index\]/);
  assert.match(chart, /telemetryTruthAt\(race, live\.followId, live\.t, truth\.current\)/);
  assert.match(chart, /truthFixWindow\(fixes\.length, reading\.beforeIndex\)/);
  assert.doesNotMatch(chart, /function truthWindowStart/);
  assert.doesNotMatch(chart, /beforeIndex - Math\.floor/);
  assert.doesNotMatch(await read('src/components/layline/scene/BoatTracks.tsx'), /beforeIndex - Math\.floor/);
  assert.match(app, /truthMode && !live/);
  assert.match(app, /className=\{styles\.truthFallbackLayer\}/);
  assert.match(app, /<ChartView race=\{race\} \/>/);
  assert.match(styles, /\.truthFallbackLayer \{[\s\S]*?background: var\(--water-deep\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('truth control mounts a matching inspector only while on and leaves an empty mobile dock off', async () => {
  const [topBar, app, inspector, styles] = await Promise.all([
    read('src/components/layline/hud/TopBar.tsx'),
    read('src/components/layline/LaylineApp.tsx'),
    read('src/components/layline/hud/TruthInspector.tsx'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  assert.match(topBar, /aria-controls=\{truthMode \? "truth-inspector" : undefined\}/);
  assert.match(topBar, /aria-pressed=\{truthMode\}/);
  assert.doesNotMatch(topBar, /aria-controls="truth-inspector"/);
  assert.match(app, /\{truthMode \? <TruthInspector race=\{race\} \/> : live \? <Instruments race=\{race\} \/> : null\}/);
  assert.doesNotMatch(app, /<TruthInspector[^>]+hidden=/);
  assert.match(inspector, /id="truth-inspector"/);
  assert.doesNotMatch(inspector, /hidden=\{/);
  assert.doesNotMatch(styles, /\.truthInspector\[hidden\]/);
  assert.match(styles, /\.dockLeft:empty,\s*\.dockRight:empty,\s*\.dockBottom:empty\s*\{\s*display:\s*none/);
  assert.match(styles, /@media \(max-width: 900px\)/);
});
