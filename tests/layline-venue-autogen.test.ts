/**
 * The machine-generated venue's contract, held where a screenshot cannot hold
 * it: the manifest reader, the node-to-layer-class mapping, the vendored
 * decoder bytes, and the code split that keeps the default page free of all of
 * it.
 *
 * Run: npx --yes tsx --test tests/layline-venue-autogen.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  ANCHOR_EPSILON_DEG,
  AUTOGEN_ASSET,
  AUTOGEN_MANIFEST,
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  VENDORED_DECODERS,
  disposeScene,
  layerClassOf,
  parseAutogenManifest,
  type DisposableNode,
} from "../src/components/layline/scene/venue-autogen-config";
import { maskVisible, resetShowMask, setShowMask, showMask } from "../src/components/layline/scene/inspect";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LAYLINE_SCENE = "src/components/layline/scene/LaylineScene.tsx";
const VENUE_AUTOGEN = "src/components/layline/scene/VenueAutogen.tsx";

const GOOD = {
  origin: { lat: 33.742, lon: -118.155, yDatum: 0 },
  extentM: 900,
  nodes: ["ground", "buildings", "port"],
  stats: { bytes: 4712, triangles: 84, textureBytes: 1216, drawCalls: 3 },
  sha256: "a".repeat(64),
  sources: { lidar: "x", imagery: "x", footprints: "x", water: "x" },
  bake: { seed: 1 },
};

test("a manifest is read for the four things the runtime places the mesh by", () => {
  const manifest = parseAutogenManifest(GOOD);
  assert.deepEqual(manifest.origin, { lat: 33.742, lon: -118.155, yDatum: 0 });
  assert.equal(manifest.extentM, 900);
  assert.deepEqual(manifest.nodes, ["ground", "buildings", "port"]);
  assert.equal(manifest.stats.triangles, 84);
  /* provenance is carried, not inspected */
  assert.equal(manifest.sources.lidar, "x");
  assert.deepEqual(manifest.bake, { seed: 1 });
});

test("a manifest missing the anchor is a failed venue, not a mesh placed at a guess", () => {
  for (const broken of [
    null,
    {},
    { ...GOOD, origin: { lat: 33.742, lon: -118.155 } },
    { ...GOOD, origin: { lat: 33.742, lon: "west", yDatum: 0 } },
    { ...GOOD, extentM: 0 },
    { ...GOOD, nodes: [] },
    { ...GOOD, nodes: [1, 2] },
  ]) {
    assert.throws(() => parseAutogenManifest(broken), /autogen manifest/);
  }
});

test("stats and provenance are optional; the placement fields are not", () => {
  const spare = parseAutogenManifest({
    origin: { lat: 0, lon: 0, yDatum: -1.5 },
    extentM: 10,
    nodes: ["ground"],
  });
  assert.deepEqual(spare.stats, { bytes: 0, triangles: 0, textureBytes: 0, drawCalls: 0 });
  assert.equal(spare.sha256, "");
  assert.equal(spare.origin.yDatum, -1.5);
});

test("the manifest's node order is the layer table the inspection mask reaches", () => {
  const manifest = parseAutogenManifest(GOOD);
  assert.equal(layerClassOf(manifest, "ground"), 1);
  assert.equal(layerClassOf(manifest, "buildings"), 2);
  assert.equal(layerClassOf(manifest, "port"), 3);
  /* a node the manifest never listed draws but cannot be singled out */
  assert.equal(layerClassOf(manifest, "unlisted"), 0);

  resetShowMask();
  setShowMask({ venueLayers: [2] });
  assert.equal(maskVisible(showMask, "venue-layer-2"), true);
  assert.equal(maskVisible(showMask, "venue-layer-1"), false);
  assert.equal(maskVisible(showMask, "venue-layer-3"), false);
  resetShowMask();
  assert.equal(showMask.venueLayers, null);
});

test("the anchor check is a typo check, not a tolerance", () => {
  /* 0.001 degrees is about 111 m of latitude: inside one terrain quad, far
     outside any rounding a manifest would carry. */
  assert.equal(ANCHOR_EPSILON_DEG, 0.001);
  const scene = source(VENUE_AUTOGEN);
  assert.match(scene, /Math\.abs\(manifest\.origin\.lat - anchorLat\) > ANCHOR_EPSILON_DEG/);
  assert.match(scene, /Math\.abs\(manifest\.origin\.lon - anchorLon\) > ANCHOR_EPSILON_DEG/);
});

test("the decoders are served from this origin and are byte-identical to the installed three", () => {
  assert.match(DRACO_DECODER_PATH, /^\/prototype\/layline\/decoders\/draco\/$/);
  assert.match(BASIS_TRANSCODER_PATH, /^\/prototype\/layline\/decoders\/basis\/$/);
  for (const decoder of VENDORED_DECODERS) {
    const served = readFileSync(
      new URL(`../public/prototype/layline/decoders/${decoder.served}`, import.meta.url),
    );
    const installed = readFileSync(
      new URL(`../node_modules/three/examples/jsm/libs/${decoder.source}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(served).digest("hex"),
      createHash("sha256").update(installed).digest("hex"),
      `${decoder.served} has drifted from node_modules/three/examples/jsm/libs/${decoder.source}`,
    );
  }
});

test("no decoder, no asset and no loader is named from a CDN", () => {
  const config = source("src/components/layline/scene/venue-autogen-config.ts");
  const scene = source(VENUE_AUTOGEN);
  for (const text of [config, scene]) {
    assert.doesNotMatch(text, /https?:\/\//);
  }
  assert.match(AUTOGEN_ASSET, /^\/prototype\/layline\/venues\//);
  assert.match(AUTOGEN_MANIFEST, /^\/prototype\/layline\/venues\//);
});

test("the heavy module is reached only through a lazy import behind the parameter", () => {
  const scene = source(LAYLINE_SCENE);
  /* the loaders live in the lazy chunk and nowhere else: the scene must not
     import the module it lazily loads, or the split is a no-op */
  assert.match(
    scene,
    /const VenueAutogen = lazy\(\(\) =>\s*\r?\n\s*import\("\.\/VenueAutogen"\)\.then\(\(m\) => \(\{ default: m\.VenueAutogen \}\)\),\s*\r?\n\);/,
  );
  assert.doesNotMatch(scene, /^import .*VenueAutogen/m);
  assert.doesNotMatch(scene, /GLTFLoader|DRACOLoader|KTX2Loader/);
  assert.match(scene, /autogen: params\.get\("venue"\) === "autogen",/);
  /* mounted only when the parameter asked AND the race has an anchor to check
     the manifest against */
  assert.match(
    scene,
    /const autogenOrigin =\s*\r?\n?\s*venue\.current\.autogen && scenery !== undefined \? scenery\.origin : null;/,
  );
  assert.match(scene, /<VenueAutogen origin=\{autogenOrigin\} \/>/);

  const component = source(VENUE_AUTOGEN);
  for (const loader of ["GLTFLoader", "DRACOLoader", "KTX2Loader"]) {
    assert.match(component, new RegExp(`from "three/examples/jsm/loaders/${loader}\\.js"`));
  }
});

test("unmount disposes every geometry, material and texture exactly once", () => {
  const counts = new Map<string, number>();
  const resource = (name: string) => ({
    name,
    dispose: () => counts.set(name, (counts.get(name) ?? 0) + 1),
  });
  /* One KTX2 image shared by two materials, which is the ordinary glTF case and
     the one a naive per-material walk double-frees. */
  const shared = { ...resource("shared-map"), isTexture: true };
  const own = { ...resource("own-map"), isTexture: true };
  const ground = resource("m-ground") as Record<string, unknown>;
  ground.map = shared;
  const port = resource("m-port") as Record<string, unknown>;
  port.map = shared;
  port.roughnessMap = own;
  /* a material array, and a node with no geometry at all: both occur in glTF */
  const root: DisposableNode = {
    children: [
      {
        children: [
          { children: [], geometry: resource("g-ground"), material: ground as never },
        ],
      },
      {
        children: [],
        geometry: resource("g-port"),
        material: [port as never, resource("m-extra")],
      },
    ],
    clear: () => counts.set("cleared", (counts.get("cleared") ?? 0) + 1),
  };

  const released = disposeScene(root);
  assert.deepEqual(released, { geometries: 2, materials: 3, textures: 2 });
  for (const name of [
    "g-ground",
    "g-port",
    "m-ground",
    "m-port",
    "m-extra",
    "shared-map",
    "own-map",
    "cleared",
  ]) {
    assert.equal(counts.get(name), 1, `${name} was disposed ${counts.get(name)} times, not once`);
  }
  assert.equal(counts.size, 8, "nothing else was touched");
});

test("the load goes through the render gate and gives everything back on unmount", () => {
  const component = source(VENUE_AUTOGEN);
  /* a paused replay draws nothing on its own: the arrival and the failure both
     have to ask for a frame */
  assert.match(component, /setVenueAsset\("failed"\);[\s\S]{0,220}?requestSceneFrame\(\);/);
  assert.match(component, /setScene\(built\);\s*\r?\n\s*requestSceneFrame\(\);/);
  /* a stale load is aborted rather than allowed to install over a newer venue,
     and a parse that already allocated has to be given back too */
  assert.match(component, /const controller = new AbortController\(\);/);
  assert.match(component, /if \(controller\.signal\.aborted\) \{\s*\r?\n\s*disposeScene\(gltf\.scene\);/);
  /* geometries, materials, textures, and the two decoder pools */
  assert.match(component, /if \(built !== null\) disposeScene\(built\.root\);/);
  assert.match(component, /draco\.dispose\(\);\s*\r?\n\s*ktx2\.dispose\(\);/);
  /* readiness is a drawn frame, never a settled fetch */
  assert.match(component, /onAfterRender = markDrawn/);
  assert.equal((component.match(/setVenueAsset\("rendered"\)/g) ?? []).length, 2);
  /* the dev-only readback door is behind the same constant the others are */
  assert.match(component, /if \(process\.env\.NODE_ENV === "production"\) return;/);
});
