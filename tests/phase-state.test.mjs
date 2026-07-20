import assert from "node:assert/strict";
import test from "node:test";

import { PHASE_TOKENS, interpolatePhase, resolvePhase } from "../src/phase-state.mjs";

test("lifecycle phases have distinct material laws", () => {
  assert.deepEqual(PHASE_TOKENS.map(({ id }) => id), ["idea", "design", "engineering", "shipped"]);
  assert.equal(new Set(PHASE_TOKENS.map(({ silhouette }) => silhouette)).size, 4);
  assert.ok(PHASE_TOKENS[0].width > PHASE_TOKENS[2].width);
  assert.ok(PHASE_TOKENS[3].depth > PHASE_TOKENS[0].depth);
});

test("phase tokens resolve by id or numeric index", () => {
  assert.equal(resolvePhase("design").index, 1);
  assert.equal(resolvePhase(2).id, "engineering");
  assert.equal(resolvePhase(-10).id, "idea");
  assert.equal(resolvePhase(99).id, "shipped");
});

test("phase interpolation returns exact endpoints", () => {
  assert.deepEqual(interpolatePhase(0, 1, 0), resolvePhase(0));
  assert.deepEqual(interpolatePhase(0, 1, 1), resolvePhase(1));
});

test("phase interpolation remains finite and preserves target identity", () => {
  const midpoint = interpolatePhase("design", "engineering", 0.5);
  assert.equal(midpoint.id, "engineering");
  assert.equal(midpoint.silhouette, "articulated");
  for (const key of ["width", "weight", "depth", "seam"]) assert.ok(Number.isFinite(midpoint[key]));
});
