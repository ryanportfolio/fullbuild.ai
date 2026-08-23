/**
 * The freeform camera's geometry and the water's pointer rules.
 *
 * Both are pure functions on purpose: the camera is described in numbers and
 * composed into a shot by the rig, and the press rule is one decision rather
 * than a chain of early returns inside an event handler. Neither needs a
 * renderer to be held to its contract.
 *
 * Run: npx --yes tsx --test tests/layline-camera.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DIST_MAX,
  DIST_MIN,
  EYE_FLOOR,
  PITCH_MAX,
  PITCH_MIN,
  distanceFor,
  freeform,
  metresPerPixel,
  newFreeformCamera,
  newStand,
  orbit,
  pan,
  pickBoatAt,
  pressOutcome,
  resetFreeformCamera,
  seedFreeformFromShot,
  setBoatPicker,
  standOf,
  zoom,
} from "../src/components/layline/scene/interaction";

const stand = newStand();

test("entering freeform from a rig's shot stands exactly where that rig stood", () => {
  const camera = newFreeformCamera();
  /* A chase shot: eighteen metres astern, three and a half up, aimed at a boat
   * a little way up the course. */
  seedFreeformFromShot(camera, 40, 8.6, 92, 30, 2.4, 78, 55, 30, 0, 78);
  standOf(camera, 30, 2.4, 78, stand);
  for (const [name, seen, want] of [
    ["ex", stand.ex, 40],
    ["ey", stand.ey, 8.6],
    ["ez", stand.ez, 92],
    ["ax", stand.ax, 30],
    ["ay", stand.ay, 2.4],
    ["az", stand.az, 78],
  ] as const) {
    assert.ok(Math.abs(seen - want) < 1e-9, `${name} was ${seen}, expected ${want}`);
  }
  assert.equal(camera.fov, 55, "the lens carries over with the station");
  assert.equal(camera.follow, true, "a camera taken over mid-chase keeps the boat");
});

test("the seeded centre is an offset, so the camera travels with its boat", () => {
  const camera = newFreeformCamera();
  /* Aimed two metres ahead of the boat and one above it. */
  seedFreeformFromShot(camera, 10, 12, 40, 2, 1, 22, 45, 0, 0, 20);
  assert.deepEqual([camera.ox, camera.oy, camera.oz], [2, 1, 2]);
  /* The boat sails forty metres up the course; the aim goes with it. */
  standOf(camera, 0 + camera.ox, camera.oy, -40 + camera.oz, stand);
  assert.equal(stand.ax, 2);
  assert.equal(stand.az, -38);
});

test("orbit and zoom stay inside the bounds a lens can actually stand in", () => {
  const camera = newFreeformCamera();
  orbit(camera, 0, 100000);
  assert.equal(camera.pitch, PITCH_MAX);
  orbit(camera, 0, -100000);
  assert.equal(camera.pitch, PITCH_MIN);
  zoom(camera, 100000);
  assert.equal(camera.dist, DIST_MAX);
  zoom(camera, -100000);
  assert.equal(camera.dist, DIST_MIN);
  /* Yaw is free: a camera you cannot carry all the way round the boat is a
   * camera that stops mid-gesture for no reason the hand can see. */
  orbit(camera, 100000, 0);
  assert.ok(Number.isFinite(camera.yaw));
});

test("the eye never drops under the sea state", () => {
  const camera = newFreeformCamera();
  camera.pitch = PITCH_MIN;
  camera.dist = DIST_MIN;
  standOf(camera, 0, 0, 0, stand);
  assert.ok(stand.ey >= EYE_FLOOR, `eye at ${stand.ey}`);
});

test("a pan moves the water under the pointer, not the pointer", () => {
  const camera = newFreeformCamera();
  camera.follow = false;
  camera.yaw = 0;
  /* Yaw zero puts the eye on +z looking toward -z. Dragging right has to send
   * the centre left, and dragging down has to send it away from the eye. */
  pan(camera, 10, 0, 1);
  assert.ok(camera.tx < 0, `dragging right moved the centre to ${camera.tx}`);
  camera.tx = 0;
  camera.tz = 0;
  pan(camera, 0, 10, 1);
  assert.ok(camera.tz < 0, `dragging down moved the centre to ${camera.tz}`);
});

test("a pan is measured in the water under the frame, not in pixels", () => {
  const camera = newFreeformCamera();
  camera.dist = 50;
  camera.fov = 45;
  const near = metresPerPixel(camera, 800);
  camera.dist = 500;
  const far = metresPerPixel(camera, 800);
  assert.ok(far > near * 9, "ten times the range is about ten times the reach");
  assert.equal(metresPerPixel(camera, 0), 0, "a canvas with no height asks for nothing");
});

test("framing a wider subject stands further off, inside the range limits", () => {
  const close = distanceFor(11, 45, 1.6);
  const wide = distanceFor(400, 45, 1.6);
  assert.ok(wide > close);
  assert.ok(close >= DIST_MIN);
  assert.ok(wide <= DIST_MAX);
  /* The shorter axis of the frame is the one that has to hold the subject, so
   * a tall narrow canvas stands further off than a wide one. */
  assert.ok(distanceFor(100, 45, 0.6) > distanceFor(100, 45, 1.6));
});

test("a framing move eases out of where the camera was and lands on the target", () => {
  const camera = newFreeformCamera();
  camera.follow = false;
  camera.tx = 100;
  camera.ty = 3;
  camera.tz = -100;
  camera.dist = 200;
  camera.fromX = 0;
  camera.fromY = 3;
  camera.fromZ = 0;
  camera.fromDist = 60;
  camera.left = camera.span;
  standOf(camera, camera.tx, camera.ty, camera.tz, stand);
  assert.ok(Math.abs(stand.ax - 0) < 1e-9, "it starts on the centre it came from");
  assert.ok(Math.abs(stand.dist - 60) < 1e-9, "and at the range it came from");
  camera.left = 0;
  standOf(camera, camera.tx, camera.ty, camera.tz, stand);
  assert.equal(stand.ax, 100);
  assert.equal(stand.dist, 200);
});

test("a race swap puts the camera back where it opens", () => {
  freeform.follow = false;
  freeform.tx = 400;
  freeform.dist = 700;
  freeform.pending = "fleet";
  freeform.busy = true;
  resetFreeformCamera();
  assert.deepEqual(
    {
      follow: freeform.follow,
      tx: freeform.tx,
      dist: freeform.dist,
      pending: freeform.pending,
      busy: freeform.busy,
    },
    { follow: true, tx: 0, dist: 90, pending: null, busy: false },
  );
});

test("a press on a boat selects it and never reaches playback", () => {
  assert.equal(
    pressOutcome({ gesture: false, hitId: "nzl", live: true, chart2d: false, button: 0 }),
    "select",
  );
});

test("a still press on open water is the play and pause it has always been", () => {
  assert.equal(
    pressOutcome({ gesture: false, hitId: null, live: true, chart2d: false, button: 0 }),
    "toggle",
  );
});

test("a camera gesture selects nothing and toggles nothing", () => {
  assert.equal(
    pressOutcome({ gesture: true, hitId: "nzl", live: true, chart2d: false, button: 0 }),
    "none",
  );
  assert.equal(
    pressOutcome({ gesture: true, hitId: null, live: true, chart2d: false, button: 0 }),
    "none",
  );
});

test("the chart, a boot with no frame, and a second mouse button all reach nothing", () => {
  assert.equal(
    pressOutcome({ gesture: false, hitId: null, live: true, chart2d: true, button: 0 }),
    "none",
  );
  assert.equal(
    pressOutcome({ gesture: false, hitId: null, live: false, chart2d: false, button: 0 }),
    "none",
  );
  assert.equal(
    pressOutcome({ gesture: false, hitId: "nzl", live: true, chart2d: false, button: 2 }),
    "none",
  );
});

test("a pick with no scene under it answers nothing rather than throwing", () => {
  setBoatPicker(null);
  assert.equal(pickBoatAt(0, 0), null);
  setBoatPicker((nx) => (nx > 0 ? "usa" : null));
  assert.equal(pickBoatAt(0.5, 0), "usa");
  assert.equal(pickBoatAt(-0.5, 0), null);
  setBoatPicker(null);
});
