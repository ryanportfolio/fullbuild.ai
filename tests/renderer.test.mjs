import assert from "node:assert/strict";
import test from "node:test";

import { createArtifactGeometry, createSeededRandom } from "../src/renderer.mjs";

test("artifact geometry stays inside the declared budget", () => {
  const geometry = createArtifactGeometry();

  assert.ok(geometry.vertexCount <= 1400, `vertex budget exceeded: ${geometry.vertexCount}`);
  assert.ok(geometry.triangleCount <= 2800, `triangle budget exceeded: ${geometry.triangleCount}`);
  assert.equal(geometry.indices.length, geometry.triangleCount * 3);
  assert.ok(Math.max(...geometry.indices) < geometry.vertexCount);
});

test("all four manufacture states share one topology", () => {
  const { targets, vertexCount } = createArtifactGeometry();

  assert.deepEqual(Object.keys(targets), ["vapor", "blueprint", "machine", "fused"]);
  for (const key of Object.keys(targets)) {
    assert.equal(targets[key].length, vertexCount * 3, `${key} topology diverged`);
    assert.ok(targets[key].every(Number.isFinite), `${key} contains non-finite values`);
  }
});

test("manufacture is seeded and fully deterministic", () => {
  const first = createArtifactGeometry();
  const second = createArtifactGeometry();

  for (const key of Object.keys(first.targets)) {
    assert.deepEqual([...first.targets[key]], [...second.targets[key]], `${key} changed between runs`);
  }
  assert.deepEqual([...first.scatterDirections], [...second.scatterDirections]);

  const randomA = createSeededRandom();
  const randomB = createSeededRandom();
  assert.equal(randomA(), randomB());
  assert.equal(randomA(), randomB());
});
