/**
 * When `window.__layline.ready` is allowed to say yes, and what the scene does
 * when the venue's baked coast never arrives.
 *
 * Every reference capture on this page is taken behind `ready`, so the flag is
 * the contract: it has to mean a picture, not a fetch. Round 5 raised it when
 * the fetch settled, which is two states early. It could rise on an asset that
 * had parsed and never been drawn, and it rose on a failed fetch that left the
 * scene with no coast at all and no fallback.
 *
 * Run: npx --yes tsx --test tests/layline-venue-ready.test.ts
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";

import { captureReady } from "../src/components/layline/CaptureBridge";
import { useReplay } from "../src/components/layline/store";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const VENUE_SHORE = "src/components/layline/scene/VenueShore.tsx";
const CAMERA_RIGS = "src/components/layline/scene/CameraRigs.tsx";

beforeEach(() => {
  useReplay.setState({ webglOk: false, venueAsset: "absent", venueInFrame: true });
});

test("the store opens with no venue, in frame, and nothing drawn", () => {
  const state = useReplay.getState();
  assert.equal(state.venueAsset, "absent");
  assert.equal(state.venueInFrame, true);
  assert.equal(state.webglOk, false);
});

test("ready waits for a drawn frame and for a drawn coast, in either order", () => {
  /* nothing drawn yet */
  assert.equal(captureReady({ webglOk: false, venueAsset: "absent" }), false);
  assert.equal(captureReady({ webglOk: false, venueAsset: "rendered" }), false);
  /* a frame is up, the venue is still coming: a capture here is a coastless
     Long Beach, which is the failure the flag exists to prevent */
  assert.equal(captureReady({ webglOk: true, venueAsset: "loading" }), false);
  /* both in */
  assert.equal(captureReady({ webglOk: true, venueAsset: "rendered" }), true);
  /* a race with no baked coast never waits for one */
  assert.equal(captureReady({ webglOk: true, venueAsset: "absent" }), true);
  /* a failure whose fallback arc has not been drawn yet is NOT a picture:
     a capture there would contain neither coast (codex round-6 P1) */
  assert.equal(captureReady({ webglOk: true, venueAsset: "failed" }), false);
  /* the fallback arc has been through onAfterRender: finished picture */
  assert.equal(captureReady({ webglOk: true, venueAsset: "fallback" }), true);
});

test("a fetched but undrawn asset does not count as ready", () => {
  /* The round-5 flag rose in the fetch's `finally`, so this sequence reported
     ready with the mesh parsed and no venue pixel on screen. The state machine
     has no way to express that any more: nothing but the mesh's own
     onAfterRender writes `rendered`. */
  useReplay.setState({ webglOk: true });
  useReplay.getState().setVenueAsset("loading");
  assert.equal(captureReady(useReplay.getState()), false);
  useReplay.getState().setVenueAsset("rendered");
  assert.equal(captureReady(useReplay.getState()), true);
});

test("a race switch takes readiness back down and the next venue puts it back", () => {
  useReplay.setState({ webglOk: true });
  useReplay.getState().setVenueAsset("rendered");
  assert.equal(captureReady(useReplay.getState()), true);
  /* VenueShore's cleanup, then its effect for the new asset */
  useReplay.getState().setVenueAsset("absent");
  useReplay.getState().setVenueAsset("loading");
  assert.equal(captureReady(useReplay.getState()), false);
  useReplay.getState().setVenueAsset("rendered");
  assert.equal(captureReady(useReplay.getState()), true);
});

test("the failure path is a fallback coast, and ready waits for its drawn frame", () => {
  useReplay.setState({ webglOk: true });
  useReplay.getState().setVenueAsset("loading");
  assert.equal(captureReady(useReplay.getState()), false);
  /* fetch died: the fallback is promised but not yet on screen */
  useReplay.getState().setVenueAsset("failed");
  assert.equal(captureReady(useReplay.getState()), false);
  /* the arc's own onAfterRender fired */
  useReplay.getState().setVenueAsset("fallback");
  assert.equal(captureReady(useReplay.getState()), true);

  const shore = source(VENUE_SHORE);
  /* the fallback is the scene's own procedural arc, the one every race without
     a baked coast already draws, not a second invented shoreline */
  assert.match(shore, /import \{ shorelineGeometry \} from "\.\/SkyDome"/);
  assert.match(shore, /if \(status === "failed" \|\| status === "fallback"\) return <FallbackShore \/>;/);
  /* the catch wakes the render gate, or a paused replay never draws the arc */
  assert.match(shore, /setVenueAsset\("failed"\);\s*\n(\s*\/\*[\s\S]*?\*\/\s*\n)?\s*requestSceneFrame\(\);/);
  /* only the arc's drawn frame promotes failed to fallback */
  assert.match(shore, /if \(state\.venueAsset === "failed"\) state\.setVenueAsset\("fallback"\);/);
});

test("the venue mesh raises rendered from a drawn frame, not from the fetch", () => {
  const shore = source(VENUE_SHORE);
  assert.match(shore, /onAfterRender=\{layer === last \? markDrawn : undefined\}/);
  /* the LAST layer in draw order, so every venue layer has been through the
     pipe before the flag goes up */
  assert.match(shore, /const last = layers\[layers\.length - 1\];/);
  /* nothing else may write `rendered`, and in particular not the fetch's own
     settlement: two writers, the onAfterRender callback and the rig-withheld
     effect, and both go through the same guard */
  const writes = shore.match(/setVenueAsset\("rendered"\)/g) ?? [];
  assert.equal(writes.length, 2);
  assert.equal((shore.match(/drawn\.current = true;/g) ?? []).length, 2);
  /* and the old boolean is gone from the whole component */
  assert.doesNotMatch(shore, /setSceneryOk/);
});

test("a stale fetch is aborted rather than allowed to install over a newer venue", () => {
  const shore = source(VENUE_SHORE);
  assert.match(shore, /const controller = new AbortController\(\);/);
  assert.match(shore, /fetch\(asset, \{ signal: controller\.signal \}\)/);
  assert.match(shore, /controller\.abort\(\);/);
  /* the guards that matter are the ones AFTER an await: the abort ends the
     fetch, and these stop a continuation that already had its bytes from
     writing a mesh or a store state for a venue nobody is looking at */
  assert.ok((shore.match(/controller\.signal\.aborted/g) ?? []).length >= 3);
});

test("an unknown layer class is skipped and said out loud, not painted as terrain", () => {
  const shore = source(VENUE_SHORE);
  assert.match(shore, /function drawable\(layer: VenueLayer\): boolean \{/);
  assert.match(shore, /console\.warn\(\s*`venue asset carries layer class \$\{layer\.classId\}/);
  assert.match(shore, /setLayers\(loaded\.filter\(drawable\)\);/);
  /* the silent fallback the round-4d residual named is gone: the material
     table is indexed directly, and only layers it answers for are drawn */
  assert.doesNotMatch(shore, /MATERIALS\[layer\.classId\] \?\? MATERIAL_FALLBACK/);
});

test("the venue is dropped only once the tactical hand-over has landed", () => {
  const rigs = source(CAMERA_RIGS);
  /* keyed on the composed shot, so the coast survives the 1.2 s flight into
     the rig rather than popping out at the start of it */
  assert.match(rigs, /const venueInFrame = !\(move\.to === "tactical" && mix >= 1\);/);
  /* one compare per frame against a module mirror, and a store write only when
     the answer changes */
  assert.match(rigs, /if \(venueInFrame !== venueWasInFrame\) \{/);
  assert.match(rigs, /^let venueWasInFrame = true;$/m);
  /* and the mirror goes back to its opening value with the canvas, the way
     sceneGate and renderStats do */
  assert.match(rigs, /venueWasInFrame = true;\s*\r?\n\s*replay\.setVenueInFrame\(true\);/);
});

test("holding the venue out of frame does not strand ready at loading", () => {
  const shore = source(VENUE_SHORE);
  /* A page that opens on the tactical rig draws no venue frame at all, so the
     onAfterRender path never runs and `ready` would never rise. */
  assert.match(shore, /if \(layers === null \|\| inFrame \|\| drawn\.current\) return;/);
  assert.match(shore, /if \(layers === null \|\| !inFrame\) return null;/);
});
