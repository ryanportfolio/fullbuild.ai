// Static + live-import verification for the authoritative WebGL module.
// Headless GL instantiation intentionally skipped (a software rasterizer would
// measure nothing meaningful); this checks syntax-level integrity, export surface,
// oracle uniform coverage, and main.mjs wiring contract.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(dir + "webgl.mjs", "utf8");
const mainSource = readFileSync(dir + "main.mjs", "utf8");

// export surface
assert.match(source, /export async function initWebGL\(/, "exports initWebGL");
for (const method of ["function update(", "function resize(", "function destroyInternal("]) {
  assert.ok(source.includes(method), "api method present: " + method);
}
assert.match(source, /return \{ update, resize, destroy: destroyInternal \};/, "returns api object");

// renderer options
assert.ok(source.includes("antialias: true"), "antialias");
assert.ok(source.includes("alpha: true"), "alpha");
assert.ok(source.includes("preserveDrawingBuffer: true"), "preserveDrawingBuffer");
assert.ok(source.includes("OrthographicCamera"), "ortho camera");

// oracle uniform coverage (program 2)
const halftoneUniformList = [
  "tMap", "uTextureSize", "uPlaneSize", "uResolution", "uColorDark", "uColorLight",
  "uMatrixSize", "uBias", "uDitherAmount", "uScaleResolution", "uOpacity", "uZoom",
  "uColorNum", "uPixelSize", "uPixelSizeMultiplier", "uTime", "uTrail",
  "uTrailIntensityMultiplier", "uBiasNoiseScale", "uBiasNoiseSpeed", "uBiasPulseSpeed",
  "uBiasNoiseWeight", "uBiasPulseWeight", "uBiasAnimationStrength",
];
for (const u of halftoneUniformList) assert.ok(source.includes(u), "uniform " + u);

// oracle uniform coverage (program 1)
const trailUniformList = [
  "u_texture", "uPointer", "uLastPointer", "uAspect", "uVelocity",
  "uInitialRadius", "uInitialRadiusMultiplier", "uBorderSize",
  "uBorderSizeMultiplier", "uDecayRate",
];
for (const u of trailUniformList) assert.ok(source.includes(u), "trail uniform " + u);

// live-captured values
for (const pair of [
  ["0.098039", "uColorDark r"], ["0.666667", "uColorDark b"],
  ["0.717647", "uColorLight r"], ["0.066", "initialRadius"],
  ["0.129", "borderSize"], ["0.057", "decayRate"],
  ["7.7", "pixelSizeMultiplier"], ["1.02", "trailIntensityMultiplier"],
]) assert.ok(source.includes(pair[0]), "value " + pair[1]);

// ping-pong + scroll driver
assert.ok(source.includes("setRenderTarget(writeRt)"), "trail renders into ping-pong target");
assert.match(source, /SCROLL_RANGE = 1200/, "scroll range constant");

// main.mjs wiring
assert.match(mainSource, /from "\.\/webgl\.mjs"/, "main imports webgl.mjs");
assert.ok(!mainSource.includes("canvas-scene"), "canvas-scene import removed");
assert.match(mainSource, /initWebGL\(/, "main calls initWebGL");

// live import (vendored three.module.js resolves as pure ESM under Node)
const mod = await import("./webgl.mjs");
assert.strictEqual(typeof mod.initWebGL, "function", "live import: initWebGL callable");

console.log("webgl.test.mjs: all assertions passed (static + live import)");
