/**
 * Scene inspection state: where a capture-only camera stands, and which of the
 * scene's groups are drawn.
 *
 * Both are here for one reason. The venue's close-range look is judged by
 * eye, and the two things an eye needs are a camera that can stand anywhere
 * (`interaction.ts` deliberately clamps the pointer's camera to distances and
 * pitches a hand should be able to reach, which is exactly wrong for standing
 * sixty metres off an island) and a way to take the race out of the picture so
 * the coast is the only thing left in it.
 *
 * Module scope, like the render gate and the freeform camera, and for the same
 * reason: the frame loop reads the lens once per frame and a store read per
 * frame would cost more than it saves. Nothing here is React state.
 *
 * No three import, so the whole thing runs under node and its rules are held to
 * a test rather than to a screenshot. The mask is applied to a scene graph
 * through `MaskNode`, which any `Object3D` satisfies structurally.
 *
 * Neither door is opened in a production build: `CaptureBridge` only hangs
 * `lens()` and `show()` on `window.__layline` outside production, and the one
 * read in the frame loop is behind the same constant, so the minifier drops it.
 */

/* The lens's own field of view, used whenever a placement does not state one.
 * 45 degrees is the tactical rig's lens and the value the audit battery's
 * pixel arithmetic has always been done in (pitfalls-layline: freeform
 * inherits the entering rig's fov, and the battery enters at 45). */
export const LENS_FOV = 45;

export interface LensPlacement {
  x: number;
  y: number;
  z: number;
  lookAt: readonly [number, number, number];
  fov?: number;
}

export interface LensState {
  /* While false the rigs own the camera and nothing here is read. */
  active: boolean;
  ex: number;
  ey: number;
  ez: number;
  ax: number;
  ay: number;
  az: number;
  fov: number;
}

export const lens: LensState = {
  active: false,
  ex: 0,
  ey: 0,
  ez: 0,
  ax: 0,
  ay: 0,
  az: 0,
  fov: LENS_FOV,
};

/**
 * Stand the capture camera at a world point looking at another, or hand the
 * camera back to the rigs with `null`.
 *
 * Nothing in `interaction.ts` is touched, on purpose: the restore path has to
 * put the visitor's own camera back exactly as they left it, and the cheapest
 * way to promise that is never to write it. A placement is not clamped either.
 * The clamps exist so a hand cannot put the camera somewhere the scene was not
 * built to be seen from; this is a capture tool whose whole job is to go
 * there and photograph what it finds.
 */
export function setLens(placement: LensPlacement | null): LensState {
  if (placement === null) {
    lens.active = false;
    return lens;
  }
  lens.active = true;
  lens.ex = placement.x;
  lens.ey = placement.y;
  lens.ez = placement.z;
  lens.ax = placement.lookAt[0];
  lens.ay = placement.lookAt[1];
  lens.az = placement.lookAt[2];
  lens.fov = placement.fov === undefined ? LENS_FOV : placement.fov;
  return lens;
}

/* ------------------------------------------------------------------ mask */

/* The names the scene hangs on the groups this mask can reach. Held as
 * constants rather than as string literals at both ends so a rename cannot
 * silently turn the mask into a no-op: the scene and the mask read the same
 * value. */
export const GROUP_WATER = "layline-water";
export const GROUP_BOATS = "layline-boats";
export const GROUP_HUD = "layline-hud";
/* One venue layer mesh per semantic class, named by the class id the baker's
 * layer table gives it (1 terrain, 2 massing, 3 port, 4 heroes, 5 curtain). */
export const VENUE_LAYER_PREFIX = "venue-layer-";

export interface ShowMask {
  /* Hulls, rigs and their wakes. */
  boats: boolean;
  /* The sea surface. */
  water: boolean;
  /* The race drawn over the water: course marks, laylines, tracks, raw fixes,
   * the current field. The DOM half of the instrument panel is not here; that
   * is what `ui(false)` is for, and the two compose. */
  hud: boolean;
  /* Venue layer class ids to draw, or null for all of them. */
  venueLayers: readonly number[] | null;
}

export const showMask: ShowMask = {
  boats: true,
  water: true,
  hud: true,
  venueLayers: null,
};

export interface ShowRequest {
  boats?: boolean;
  water?: boolean;
  hud?: boolean;
  venueLayers?: readonly number[] | null;
  /* Set every group at once, before the named fields are read: `{all: false,
   * water: true}` is "water only" without listing what to hide. */
  all?: boolean;
}

export function setShowMask(request: ShowRequest): ShowMask {
  if (request.all !== undefined) {
    showMask.boats = request.all;
    showMask.water = request.all;
    showMask.hud = request.all;
    showMask.venueLayers = request.all ? null : [];
  }
  if (request.boats !== undefined) showMask.boats = request.boats;
  if (request.water !== undefined) showMask.water = request.water;
  if (request.hud !== undefined) showMask.hud = request.hud;
  if (request.venueLayers !== undefined) {
    showMask.venueLayers = request.venueLayers === null ? null : [...request.venueLayers];
  }
  return showMask;
}

export function resetShowMask(): ShowMask {
  return setShowMask({ all: true });
}

/**
 * Whether an object carrying this name is drawn, or null when the name is not
 * one the mask owns. Null is the answer for every object in the scene bar the
 * three group wrappers and the venue's layer meshes, which is what keeps the
 * walk below from having an opinion about anything else.
 */
export function maskVisible(mask: ShowMask, name: string): boolean | null {
  if (name === GROUP_WATER) return mask.water;
  if (name === GROUP_BOATS) return mask.boats;
  if (name === GROUP_HUD) return mask.hud;
  if (name.startsWith(VENUE_LAYER_PREFIX)) {
    if (mask.venueLayers === null) return true;
    const classId = Number(name.slice(VENUE_LAYER_PREFIX.length));
    return mask.venueLayers.includes(classId);
  }
  return null;
}

/* What the walk needs of a scene node. `Object3D` satisfies it structurally,
 * which is how this file stays free of three. */
export interface MaskNode {
  name: string;
  visible: boolean;
  children: MaskNode[];
}

let root: MaskNode | null = null;

/** The scene the mask is applied to, installed by the bridge inside the canvas. */
export function setMaskRoot(node: MaskNode | null): void {
  root = node;
  if (node !== null) applyShowMask();
}

/**
 * Write the mask onto the scene graph.
 *
 * Visibility, not unmounting: a hidden mesh keeps its geometry, its material
 * and its place in the render list, so toggling a group costs no React render,
 * no reflow and no shader recompile, and the venue's `onAfterRender` readiness
 * latch is not disturbed. Once a name is matched the walk stops there, because
 * a group's children carry none of the names it could match.
 */
export function applyShowMask(): void {
  if (root !== null) walk(root);
}

function walk(node: MaskNode): void {
  const want = maskVisible(showMask, node.name);
  if (want !== null) {
    node.visible = want;
    return;
  }
  for (const child of node.children) walk(child);
}
