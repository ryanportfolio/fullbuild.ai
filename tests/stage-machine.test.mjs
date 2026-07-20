import assert from "node:assert/strict";
import test from "node:test";

import { createStageMachine } from "../src/stage-machine.mjs";

const stages = [
  { id: "idea" },
  { id: "design" },
  { id: "engineering" },
  { id: "shipped", locked: true },
];

test("stage navigation follows the official order", () => {
  const changes = [];
  const machine = createStageMachine({
    stages,
    deploymentVerified: false,
    reducedMotion: false,
    onChange: (state) => changes.push(state),
  });

  assert.equal(machine.getState().id, "idea");
  assert.equal(machine.next(), true);
  assert.equal(machine.getState().id, "design");
  assert.equal(machine.handleKey("ArrowRight"), true);
  assert.equal(machine.getState().id, "engineering");
  assert.equal(machine.handleKey("ArrowLeft"), true);
  assert.equal(machine.getState().id, "design");
  assert.ok(changes.length >= 3);
});

test("unverified deployment cannot activate shipped", () => {
  const machine = createStageMachine({ stages, deploymentVerified: false });
  machine.set(2);
  assert.equal(machine.set(3), false);
  assert.equal(machine.getState().id, "engineering");
});

test("reduced motion reports discrete completed transitions", () => {
  const machine = createStageMachine({ stages, deploymentVerified: false, reducedMotion: true });
  machine.set(1);
  assert.equal(machine.getState().progress, 1);
  assert.equal(machine.getState().reducedMotion, true);
});
