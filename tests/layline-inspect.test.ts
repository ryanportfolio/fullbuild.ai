/**
 * The venue inspection doors: an unclamped capture camera and a visibility
 * mask over the scene's groups.
 *
 * Both are pure data with pure rules, which is the point of keeping them out
 * of React and out of three: what a placement does to the visitor's own camera
 * (nothing) and what a mask does to a scene graph can be held to a test rather
 * than to a screenshot.
 *
 * Run: npx --yes tsx --test tests/layline-inspect.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  GROUP_BOATS,
  GROUP_HUD,
  GROUP_WATER,
  LENS_FOV,
  VENUE_LAYER_PREFIX,
  applyShowMask,
  lens,
  maskVisible,
  resetShowMask,
  setLens,
  setMaskRoot,
  setShowMask,
  showMask,
  type MaskNode,
} from "../src/components/layline/scene/inspect";
import {
  DIST_MAX,
  PITCH_MIN,
  freeform,
  resetFreeformCamera,
} from "../src/components/layline/scene/interaction";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const CAPTURE_BRIDGE = "src/components/layline/CaptureBridge.tsx";
const CAMERA_RIGS = "src/components/layline/scene/CameraRigs.tsx";
const LAYLINE_SCENE = "src/components/layline/scene/LaylineScene.tsx";
const VENUE_SHORE = "src/components/layline/scene/VenueShore.tsx";

test("a lens placement stands where no hand could, and states its own aim", () => {
  setLens(null);
  /* Three kilometres out and forty metres under the eye floor: past DIST_MAX
   * and past PITCH_MIN, which is exactly the ground the clamped pointer camera
   * is not allowed to cover and the ground a close inspection needs. */
  setLens({ x: 1200, y: -40, z: -2800, lookAt: [1180, 6, -2760] });
  assert.equal(lens.active, true);
  assert.equal(lens.ex, 1200);
  assert.equal(lens.ey, -40, "no eye floor: the lens is allowed under the water");
  assert.equal(lens.ez, -2800);
  assert.deepEqual([lens.ax, lens.ay, lens.az], [1180, 6, -2760]);
  assert.ok(
    Math.hypot(lens.ex - lens.ax, lens.ey - lens.ay, lens.ez - lens.az) < DIST_MAX,
    "this particular placement is close in; the point is that nothing clamped it",
  );
  assert.equal(lens.fov, LENS_FOV, "an unstated field of view is the lens's own");
  setLens({ x: 0, y: 10, z: 0, lookAt: [0, 0, -60], fov: 24 });
  assert.equal(lens.fov, 24, "a stated field of view is kept");
});

test("standing and putting down the lens never writes the visitor's camera", () => {
  resetFreeformCamera();
  freeform.yaw = 1.234;
  freeform.pitch = PITCH_MIN + 0.4;
  freeform.dist = 271;
  const before = { yaw: freeform.yaw, pitch: freeform.pitch, dist: freeform.dist };
  setLens({ x: 4000, y: 900, z: -4000, lookAt: [0, 0, 0], fov: 12 });
  setLens(null);
  assert.equal(lens.active, false, "lens(null) hands the camera back");
  assert.deepEqual(
    { yaw: freeform.yaw, pitch: freeform.pitch, dist: freeform.dist },
    before,
    "the freeform orbit the pointer owns is untouched either way",
  );
  /* And the last placement is still on file, so a readback after the restore
   * says where the lens had been standing rather than reporting zeros. */
  assert.equal(lens.ex, 4000);
});

test("the mask sets every group at once and then the named exceptions", () => {
  resetShowMask();
  assert.deepEqual(
    { ...showMask },
    { boats: true, water: true, hud: true, venueLayers: null },
    "reset is everything drawn, with no layer list to maintain",
  );
  /* `all` is read first on purpose: "water only" is one call, not four. */
  setShowMask({ all: false, water: true });
  assert.deepEqual({ ...showMask }, { boats: false, water: true, hud: false, venueLayers: [] });
  setShowMask({ all: false });
  setShowMask({ water: true });
  assert.equal(showMask.water, true);
  assert.equal(showMask.boats, false);
  setShowMask({ venueLayers: [1, 4] });
  assert.deepEqual(showMask.venueLayers, [1, 4]);
  setShowMask({ venueLayers: null });
  assert.equal(showMask.venueLayers, null, "null is every layer, not no layer");
});

test("the mask owns three group names and the venue's layer meshes, nothing else", () => {
  resetShowMask();
  setShowMask({ all: false, hud: true, venueLayers: [1, 5] });
  assert.equal(maskVisible(showMask, GROUP_WATER), false);
  assert.equal(maskVisible(showMask, GROUP_BOATS), false);
  assert.equal(maskVisible(showMask, GROUP_HUD), true);
  assert.equal(maskVisible(showMask, `${VENUE_LAYER_PREFIX}1`), true);
  assert.equal(maskVisible(showMask, `${VENUE_LAYER_PREFIX}5`), true);
  assert.equal(maskVisible(showMask, `${VENUE_LAYER_PREFIX}4`), false);
  /* Everything the scene draws that is not one of those is not this mask's
   * business, and the null is what stops the walk having an opinion on it. */
  assert.equal(maskVisible(showMask, "committee"), null);
  assert.equal(maskVisible(showMask, ""), null);
  setShowMask({ venueLayers: null });
  assert.equal(maskVisible(showMask, `${VENUE_LAYER_PREFIX}4`), true);
});

test("applying the mask writes visibility and stops at the group it matched", () => {
  const leaf = (name: string): MaskNode => ({ name, visible: true, children: [] });
  const hullInsideBoats = leaf("kestrel");
  const scene: MaskNode = {
    name: "",
    visible: true,
    children: [
      { name: GROUP_WATER, visible: true, children: [leaf("water-mesh")] },
      { name: GROUP_BOATS, visible: true, children: [hullInsideBoats] },
      { name: GROUP_HUD, visible: true, children: [leaf("course-lines")] },
      leaf(`${VENUE_LAYER_PREFIX}1`),
      leaf(`${VENUE_LAYER_PREFIX}4`),
      /* the sky dome and the labels: named by nobody, touched by nobody */
      { name: "", visible: true, children: [leaf("")] },
    ],
  };
  resetShowMask();
  setMaskRoot(scene);
  setShowMask({ all: false, venueLayers: [4] });
  applyShowMask();
  const byName = (name: string) => scene.children.find((child) => child.name === name);
  assert.equal(byName(GROUP_WATER)?.visible, false);
  assert.equal(byName(GROUP_BOATS)?.visible, false);
  assert.equal(byName(GROUP_HUD)?.visible, false);
  assert.equal(byName(`${VENUE_LAYER_PREFIX}1`)?.visible, false);
  assert.equal(byName(`${VENUE_LAYER_PREFIX}4`)?.visible, true);
  assert.equal(
    hullInsideBoats.visible,
    true,
    "the hull under a hidden group keeps its own flag: hiding is one write on the group, and turning the group back on must not need six",
  );
  resetShowMask();
  applyShowMask();
  assert.equal(byName(GROUP_BOATS)?.visible, true, "and the restore is one call");
  setMaskRoot(null);
  /* With no scene installed the mask is inert rather than a crash, which is
   * what lets a page without a canvas answer show() at all. */
  setShowMask({ all: false });
  applyShowMask();
  resetShowMask();
});

test("both doors are compiled out of a production build", () => {
  const bridge = source(CAPTURE_BRIDGE);
  assert.match(bridge, /if \(process\.env\.NODE_ENV !== "production"\) \{\s*\r?\n[\s\S]{0,400}api\.lens = /);
  assert.match(bridge, /api\.show = \(request\) => \{/);
  /* the readback fields travel with the calls that write them */
  assert.match(bridge, /reading\.lens = \{/);
  assert.match(bridge, /reading\.show = \{/);
  /* and the one read in the frame loop is behind the same constant, so the
     minifier drops the branch instead of paying a boolean a frame for it */
  const rigs = source(CAMERA_RIGS);
  assert.match(
    rigs,
    /const inspecting = process\.env\.NODE_ENV !== "production" && captureLens\.active;/,
  );
  assert.match(source(LAYLINE_SCENE), /\{process\.env\.NODE_ENV !== "production" && <InspectBridge \/>\}/);
});

test("both doors draw through the gate, because a frozen page has no next frame", () => {
  const bridge = source(CAPTURE_BRIDGE);
  assert.match(bridge, /api\.lens = \(placement\) => \{\s*\r?\n\s*setLens\(placement\);\s*\r?\n\s*requestSceneFrame\(\);/);
  assert.match(
    bridge,
    /api\.show = \(request\) => \{\s*\r?\n\s*setShowMask\(request\);\s*\r?\n\s*applyShowMask\(\);\s*\r?\n\s*requestSceneFrame\(\);/,
  );
  /* and neither survives the bridge: module scope outlives the component, so a
     lens left standing would be a camera with no door left to put it down */
  assert.match(bridge, /setLens\(null\);\s*\r?\n\s*resetShowMask\(\);/);
});

test("the scene hangs the three group names the mask matches, and the venue names its layers", () => {
  const scene = source(LAYLINE_SCENE);
  assert.match(scene, /<group name=\{GROUP_WATER\}>/);
  assert.match(scene, /<group name=\{GROUP_HUD\}>/);
  assert.match(scene, /<group name=\{GROUP_BOATS\}>/);
  /* the boats are the hulls and their wakes; the overlay is the course, the
     tracks and the current field. Every one of those meshes states its own
     renderOrder, which is what makes the regrouping free of a draw-order
     change. */
  assert.match(scene, /<group name=\{GROUP_BOATS\}>\s*\r?\n\s*<Fleet race=\{race\} \/>\s*\r?\n\s*<WakeTrails race=\{race\} \/>/);
  assert.match(source(VENUE_SHORE), /name=\{`\$\{VENUE_LAYER_PREFIX\}\$\{layer\.classId\}`\}/);
});
