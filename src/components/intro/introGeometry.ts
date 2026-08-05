import { hashSeed, randomBetween, seededRandom } from "@/components/showcase/prng";

/*
 * THE MARK AS A VOLUME, in the icon's own coordinates. Every number below is read straight
 * off src/app/icon.svg's viewBox, so there is no second mapping to keep in step and the
 * geometry can be checked against the icon file by eye:
 *
 *   baseline     M8 82 H92
 *   drawn half   M18 82 V48 L35 32 L52 48 V82, plus M25 76 l12 -12 and M25 66 l9 -9
 *   poured half  M52 48 H82 V82 and M52 48 L68 32 L82 46, filled solid
 *
 * Both halves share the party wall at x52, which is why the two panel grids start and stop
 * on it: the shed reads as one construction cut down the middle rather than as two
 * buildings parked beside each other.
 *
 * This file is pure. No React, no three, no live clock, no unseeded randomness. It hands
 * back plain numbers and typed arrays, and the scene turns them into geometry. That is what
 * lets the aperture below be asserted in a test without standing up a renderer.
 */

export const INTRO_LOGO_UNIT = 20;
export const INTRO_LOGO_ORIGIN_X = 50;
export const INTRO_LOGO_ORIGIN_Y = 57;

export function introLogoX(x: number) {
  return (x - INTRO_LOGO_ORIGIN_X) / INTRO_LOGO_UNIT;
}

// The viewBox counts downward and the scene counts upward, so the mark is flipped here
// once rather than at every call site.
export function introLogoY(y: number) {
  return (INTRO_LOGO_ORIGIN_Y - y) / INTRO_LOGO_UNIT;
}

export const INTRO_LOGO_WIDTH = introLogoX(92) - introLogoX(8);
export const INTRO_LOGO_HEIGHT = introLogoY(32) - introLogoY(82);

/*
 * The plane the visible line work sits on. It is also the plane the camera has to cross to
 * be through the doorway, which is why the aperture below carries it as its own z.
 */
export const INTRO_LINE_FRONT = 0.034;
export const INTRO_LINE_LANE = 0.0072;

/*
 * THE APERTURE. The drawn half is the glass half, so the doorway is a window in it, and it
 * is derived rather than chosen by eye: the drawn wall is a nine panel grid on columns
 * [18, 29, 40, 52] and rows [48, 59.5, 71, 82], so its centre panel spans columns 29 to 40
 * and rows 59.5 to 71 and the middle of that panel is viewBox (34.5, 65.25).
 *
 * Being derived is the point. The camera flies at this local offset on the artifact's own
 * group, so the doorway stays the same window at any viewport scale, any chase offset and
 * any pose the reveal leaves the mark in.
 */
export const INTRO_APERTURE_VB = [34.5, 65.25] as const;
export const INTRO_APERTURE_LOCAL = [
  introLogoX(INTRO_APERTURE_VB[0]), // -0.775
  introLogoY(INTRO_APERTURE_VB[1]), // -0.4125
  INTRO_LINE_FRONT, //  0.034
] as const;

/*
 * WHAT IS ON THE OTHER SIDE. The doorway's light sits down the doorway rather than in its
 * mouth, and the distance is the reason: parked on the aperture itself the disc arrives at
 * the lens at the same instant the lens arrives at the wall, so it degenerates to nothing on
 * the one frame it is supposed to be flooding.
 *
 * THE DEPTH IS SOLVED AGAINST THE CAMERA PATH, not picked, and it is solved twice.
 *
 * The run ends at throughZ, which is Za - (CAM_Z_CHARGE - Za) * THROUGH_OVERSHOOT, about world
 * z -1.58 at the desktop rest pose. A light nearer than that gets OVERTAKEN: at 1.48 back the
 * camera passed it before the burst even started and finished the run with the light 0.82
 * units behind the lens, so the frame the burst is meant to flood had no source in it and the
 * lift arrived as a flat sheet of colour over a warp.
 *
 * But merely staying ahead is not enough either. At 3.6 back the lens ends up 0.39 from the
 * disc, and a disc that close is not a light in the picture, it IS the picture: measured, the
 * frame corners came out at 80% of peak and the burst beat photographed as blank white with
 * nothing in it at all. At 8 back the lens ends 2.94 away, the disc covers about one and a
 * half frame heights at the burst and the corners fall to zero, so it reads as light coming
 * out of somewhere rather than as a white card.
 *
 * The x and y are the aperture's own, so on screen the light sits in the doorway all the way
 * down the approach.
 */
export const INTRO_THRESHOLD_LOCAL_Z = INTRO_LINE_FRONT - 8;

/*
 * THE REST POSE AND THE SCALE, which are the registration contract with the film. The film
 * sizes its plate off --mark-unit, and --mark-unit is derived from exactly these four
 * numbers plus the camera. Change one here without recomputing the stylesheet and the
 * drawing stops becoming the object: it becomes a second drawing at a slightly wrong size.
 *
 *   unit   = 100 * (S / 20) / (2 * (5 - 0.1 - 0.034 * S) * tan(25deg))
 *   offset = 100 * 0.12     / (2 * (5 - 0.1 - 0.034 * S) * tan(25deg))
 */
export const INTRO_REST_POSE = [0, 0.12, 0.1] as const;
export const INTRO_SCALE_DESKTOP = 0.58;
export const INTRO_SCALE_HANDSET = 0.44;

export function introViewportScale(pixelWidth: number) {
  return pixelWidth < 768 ? INTRO_SCALE_HANDSET : INTRO_SCALE_DESKTOP;
}

/* The pointer moves the artifact, bounded by the frustum so a corner never posts it off
   screen. The reveal is the only act that chases; the warp latches and flies straight. */
export const INTRO_CHASE_X = 2.3;
export const INTRO_CHASE_Y = 1.42;
export const INTRO_CHASE_RISE = 0.12;

export function introChaseTarget(
  pointerX: number,
  pointerY: number,
  viewport: { width: number; height: number },
  pixelWidth: number,
) {
  const scale = introViewportScale(pixelWidth);
  const reachX = Math.max(0.5, viewport.width / 2 - INTRO_LOGO_WIDTH * scale * 0.42);
  const reachY = Math.max(0.4, viewport.height / 2 - INTRO_LOGO_HEIGHT * scale * 0.42);
  const x = pointerX * INTRO_CHASE_X;
  const y = pointerY * INTRO_CHASE_Y + INTRO_CHASE_RISE;
  return [
    Math.min(reachX, Math.max(-reachX, x)),
    Math.min(reachY, Math.max(-reachY, y)),
  ] as const;
}

export type IntroLogoPoint = readonly [number, number];

function introGridPanels(columns: number[], rows: number[]): IntroLogoPoint[][] {
  const panels: IntroLogoPoint[][] = [];
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns.length - 1; column += 1) {
      const left = columns[column];
      const right = columns[column + 1];
      const top = rows[row];
      const bottom = rows[row + 1];
      panels.push([[left, top], [right, top], [right, bottom], [left, bottom]]);
    }
  }
  return panels;
}

/*
 * The drawn half: a nine panel wall under three gable pieces. The wall is cut into panels
 * rather than left as one face because the doorway is one of those panels, and a single
 * plate would have no centre for the camera to aim at.
 */
export const INTRO_DRAWN_PANELS: IntroLogoPoint[][] = [
  ...introGridPanels([18, 29, 40, 52], [48, 59.5, 71, 82]),
  [[18, 48], [26.5, 40], [35, 40], [35, 48]],
  [[35, 48], [35, 40], [43.5, 40], [52, 48]],
  [[26.5, 40], [35, 32], [43.5, 40]],
];

/*
 * The poured half takes the same cut so the party wall lines up panel for panel. Its gable
 * is the asymmetric one the mark draws: apex at x68 and the right eave landing two units
 * above the wall head, which is what keeps the poured volume from reading as a mirror of
 * the drawn one.
 */
export const INTRO_POURED_PANELS: IntroLogoPoint[][] = [
  ...introGridPanels([52, 63, 73, 82], [48, 60, 71, 82]),
  [[52, 48], [60, 40], [68, 40], [68, 48]],
  [[68, 48], [68, 40], [76, 40], [82, 46], [82, 48]],
  [[60, 40], [68, 32], [76, 40]],
];

/*
 * ONE POUR, ONE BODY. Held together as twelve coplanar prisms, every shared boundary fights
 * for the depth buffer and picks itself out as a seam on a wall that is meant to have none.
 * So the pour is one extrusion of its own silhouette: the mark's poured path closed onto
 * the baseline, with the collinear eaves at x60 and x76 dropped because they sit on the
 * gable runs rather than turning them.
 */
export const INTRO_POURED_SILHOUETTE: IntroLogoPoint[] = [
  [52, 82], [52, 48], [68, 32], [82, 46], [82, 82],
];

/* The hairline gap that makes the drawn half read as built tiles rather than one painted
   plane. The pour takes a negative seam instead: its cells knit rather than butt, because
   two coplanar meshes covering a shared edge do not add back to one and the field comes
   through every join as a lit slot. */
export const INTRO_SEAM = 0.004;
export const INTRO_POURED_KNIT = -0.004;

/*
 * THE DEPTH, AND WHY IT IS NOT A HAIRLINE. The mark used to be built a thirty-fourth of a
 * unit thick against a body 4.2 units wide: one and a half per cent, which is a plate, not a
 * volume. Measured against the film's own last frame that was the defect: the plate the film
 * hands over draws extrusion on both gables and a ground in perspective, and the object it
 * handed over to had neither, so the handover gave up dimensional information rather than
 * gaining it.
 *
 * Every millimetre of this depth runs AWAY from the lens. INTRO_PANEL_FRONT is where the
 * front face sits and it is unchanged, so the silhouette the film is registered against is
 * the silhouette it always was: --mark-unit and --mark-cy are derived from the front plane
 * and the rest pose, and neither moves. What changes is that there is now something behind
 * it.
 *
 * It is also what makes the doorway a doorway. At the crossing the lens is at the front face
 * with this much wall still ahead of it, so the jambs of the panels around the aperture are
 * what fills the frame: passing THROUGH something, rather than past the plane where it was.
 */
export const INTRO_BODY_DEPTH = 0.55;
export const INTRO_PANEL_FRONT = 0.017;
export const INTRO_POURED_DEPTH = INTRO_BODY_DEPTH;

/*
 * THE REVEAL OF THE OPENING, and what is written on it.
 *
 * At the crossing the lens is at the front plane with the whole body depth still ahead of
 * it, so the surface that fills the right of the frame is not the wall's face: it is the
 * jamb, the side of the panel next to the doorway, seen broadside from a few centimetres.
 * Measured at 1440x900 it covered x1016 to the frame edge over the full height, and it
 * photographed as one value, rgb(0 17 146), standard deviation 1.5 with the DOM grain tile
 * accounting for all of it. The reason is in the material rather than in the light: the
 * glass carries metalness 0.94 over a near black albedo, so its specular tint is near black
 * too and every view dependent term it has evaluates to nothing. What survives is a
 * constant emissive, and a constant emissive is the same number from every angle and every
 * distance. The climax frame had no material response in it at all.
 *
 * COURSES, NOT A TEXTURE. The reveal is ruled on the wall's own rows: the drawn grid steps
 * 11.5 viewBox units between 48, 59.5, 71 and 82, and a course every eighth of that step
 * puts eight to a panel and none of them anywhere the grid does not already go. At a
 * quarter step the crossing frame carried two of them over nine hundred pixels of wall,
 * which is a wall with two lines on it rather than a wall that is built of something. They
 * are confined to the jamb faces, so the glass the mark is read on never picks up a rule.
 */
export const INTRO_JAMB_COURSE = 11.5 / 20 / 8;
/*
 * And none of it is drawn from further off than this. A course is a hairline at a metre and
 * would only alias; the band is wide enough that it opens across the last few frames of the
 * approach rather than switching on, and its far end is well past the warp's midpoint, where
 * the lens is still three units out.
 */
export const INTRO_JAMB_NEAR = 0.16;
export const INTRO_JAMB_FAR = 1.6;

export type IntroPanel = {
  outline: Array<[number, number]>;
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  poured: boolean;
};

function introPanel(points: readonly IntroLogoPoint[], poured: boolean, index: number): IntroPanel {
  const random = seededRandom(hashSeed(`intro-${poured ? "poured" : "drawn"}-${index}`));
  const world = points.map(([x, y]) => [introLogoX(x), introLogoY(y)] as [number, number]);
  const xs = world.map(([x]) => x);
  const ys = world.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const width = right - left;
  const height = top - bottom;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  const seam = poured ? INTRO_POURED_KNIT : INTRO_SEAM;
  const insetX = 1 - seam / width;
  const insetY = 1 - seam / height;

  return {
    outline: world.map(([x, y]) => [(x - centerX) * insetX, (y - centerY) * insetY]),
    /*
     * The poured half sits dead flat and dead square. Even a hundredth of a radian of yaw
     * per tile catches the key differently tile by tile and turns one pour into a lit grid,
     * which is exactly what a pour is not. Only the drawn half carries jitter, and only a
     * few thousandths of it: any wider and a panel's own face crosses in front of the
     * stroke plane and the drawing ends up behind the wall it is meant to bound.
     */
    position: [centerX, centerY, poured ? 0 : randomBetween(random, -0.003, 0.003)],
    size: [
      width,
      height,
      // Depth runs backward from a shared front face, so the jitter is a few thousandths on
      // the back of the wall where it reads as build tolerance, never on the face the film
      // is registered against.
      poured ? INTRO_POURED_DEPTH : INTRO_BODY_DEPTH + randomBetween(random, -0.004, 0.004),
    ],
    rotation: poured
      ? [0, 0, 0]
      : [
          randomBetween(random, -0.008, 0.008),
          randomBetween(random, -0.008, 0.008),
          randomBetween(random, -0.004, 0.004),
        ],
    poured,
  };
}

export const INTRO_PANEL_LAYOUT: IntroPanel[] = [
  ...INTRO_DRAWN_PANELS.map((panel, index) => introPanel(panel, false, index)),
  ...INTRO_POURED_PANELS.map((panel, index) => introPanel(panel, true, index)),
];

/*
 * LINE WORK. The mark is a drawing before it is a volume, so the strokes the icon actually
 * carries are drawn as strokes rather than left to the panel edges.
 */
export const INTRO_OUTLINE_STROKES: IntroLogoPoint[][] = [
  [[18, 82], [18, 48], [35, 32], [52, 48], [52, 82]],
];
export const INTRO_BASELINE_STROKES: IntroLogoPoint[][] = [
  [[8, 82], [92, 82]],
];
export const INTRO_HATCH_STROKES: IntroLogoPoint[][] = [
  [[25, 76], [37, 64]],
  [[25, 66], [34, 57]],
];
export const INTRO_TICK_STROKES: IntroLogoPoint[][] = [
  [[8, 78.5], [8, 85.5]],
  [[18, 78.5], [18, 85.5]],
  [[52, 78.5], [52, 85.5]],
  [[82, 78.5], [82, 85.5]],
  [[92, 78.5], [92, 85.5]],
  [[47, 48], [57, 48]],
  [[35, 28.5], [35, 35.5]],
];
/* The poured half is a solid, so the mark's own strokes are all it gets: the gable run and
   the wall head. A near-black volume on a near-black field has no silhouette without them. */
export const INTRO_POURED_STROKES: IntroLogoPoint[][] = [
  [[52, 48], [68, 32], [82, 46], [82, 82]],
  [[52, 48], [82, 48]],
];

/*
 * GL lines are one pixel wide whatever the hardware, and one pixel of white on a lit field
 * is not a drawing, it is a scratch. Every stroke is laid down as a few parallel lanes
 * offset along its own normal, which is what gives the mark a stroke weight the way the
 * icon has one.
 */
function pushIntroLane(
  points: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  plane: number,
  weight: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = (-dy / length) * INTRO_LINE_LANE;
  const normalY = (dx / length) * INTRO_LINE_LANE;

  for (let lane = 0; lane < weight; lane += 1) {
    const offset = lane - (weight - 1) / 2;
    points.push(
      ax + normalX * offset, ay + normalY * offset, plane,
      bx + normalX * offset, by + normalY * offset, plane,
    );
  }
}

/*
 * Hands back a flat position array rather than a BufferGeometry, so this module stays free
 * of three entirely and can be read, tested and reasoned about without a renderer.
 */
export function makeIntroLineWork(
  bands: Array<{
    strokes: IntroLogoPoint[][];
    planes: number[];
    rails?: boolean;
    weight?: number;
  }>,
): Float32Array {
  const points: number[] = [];

  for (const { strokes, planes, rails, weight = 1 } of bands) {
    for (const stroke of strokes) {
      const world = stroke.map(([x, y]) => [introLogoX(x), introLogoY(y)] as const);
      for (const plane of planes) {
        for (let index = 0; index < world.length - 1; index += 1) {
          const [ax, ay] = world[index];
          const [bx, by] = world[index + 1];
          pushIntroLane(points, ax, ay, bx, by, plane, weight);
        }
      }
      if (rails && planes.length > 1) {
        const front = planes[0];
        const back = planes[planes.length - 1];
        for (const [x, y] of world) points.push(x, y, front, x, y, back);
      }
    }
  }

  return new Float32Array(points);
}

/*
 * THE SPACE, seeded. Counts are fixed and every position comes out of the repo's one PRNG,
 * so the field is identical on every load and every capture.
 *
 * The near motes are not decoration. Far stars barely move under five units of dolly, so
 * only near geometry streaks, and the motes are the population that makes the warp read as
 * speed at all. Their z band puts them squarely in the camera's path.
 */
export const INTRO_STAR_PINPOINT_COUNT = 5200;
export const INTRO_STAR_MID_COUNT = 980;
export const INTRO_STAR_BOKEH_COUNT = 118;
/*
 * THE NEAR FIELD, DOUBLED, and measured against the thing this piece was told to beat.
 * Counted as local maxima standing at least 22 counts of luminance clear of their eight
 * neighbours, in two type free bands of the same frame on both pages, the showcase entry
 * put 103 lit points on screen and the intro's reveal put 115: ahead on the arithmetic and
 * plainly behind on the picture, because the showcase carries a shard curtain across its
 * near field and this scene's whole near field was three hundred and forty motes spread
 * through seven units of depth.
 *
 * The motes are also the streaks. They are one of the two populations makeIntroStreaks
 * draws from, so this number is the near field at the breath and the count of tails at the
 * warp, and the two cannot drift apart.
 */
export const INTRO_MOTE_COUNT = 680;
export const INTRO_DEBRIS_COUNT = 150;

export function introStarPositions(seed: string, count: number, spread: number): Float32Array {
  const random = seededRandom(hashSeed(seed));
  const values = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    values[index * 3] = randomBetween(random, -9.5 * spread, 9.5 * spread);
    values[index * 3 + 1] = randomBetween(random, -5.5 * spread, 5.5 * spread);
    values[index * 3 + 2] = randomBetween(random, -105, 4);
  }

  return values;
}

export function introMotePositions(seed: string, count: number): Float32Array {
  const random = seededRandom(hashSeed(seed));
  const values = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    values[index * 3] = randomBetween(random, -5.2, 5.2);
    values[index * 3 + 1] = randomBetween(random, -3.4, 3.4);
    values[index * 3 + 2] = randomBetween(random, -6, 1);
  }

  return values;
}

/*
 * STREAK GEOMETRY. Two vertices per point sharing one position, tagged head or tail, so a
 * vertex shader can push the tail along +z by one uniform. One uniform per frame, zero CPU
 * per frame, no geometry rebuild while the camera is moving fastest.
 */
export function makeIntroStreaks(sources: Float32Array[]): {
  positions: Float32Array;
  tails: Float32Array;
} {
  const total = sources.reduce((sum, source) => sum + source.length / 3, 0);
  const positions = new Float32Array(total * 6);
  const tails = new Float32Array(total * 2);
  let vertex = 0;

  for (const source of sources) {
    for (let index = 0; index < source.length / 3; index += 1) {
      const x = source[index * 3];
      const y = source[index * 3 + 1];
      const z = source[index * 3 + 2];
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      tails[vertex] = 0;
      vertex += 1;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      tails[vertex] = 1;
      vertex += 1;
    }
  }

  return { positions, tails };
}

export type IntroDebrisSeed = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  spin: number;
};

export function introDebrisSeeds(seed: string, count: number): IntroDebrisSeed[] {
  const random = seededRandom(hashSeed(seed));

  return Array.from({ length: count }, () => ({
    position: [
      randomBetween(random, -6.5, 6.5),
      randomBetween(random, -4, 4),
      randomBetween(random, -9, 0.6),
    ] as [number, number, number],
    rotation: [
      randomBetween(random, 0, Math.PI * 2),
      randomBetween(random, 0, Math.PI * 2),
      randomBetween(random, 0, Math.PI * 2),
    ] as [number, number, number],
    /*
     * BIGGER, BECAUSE THE SMALL ONES WERE NOT THERE. One hundred and fifty plates is a
     * population; at a fortieth of a unit across, over a wash that reaches most of the
     * frame, it is a population nobody can see. The count is deliberately unchanged: each
     * plate is its own mesh and its own material, so counting them up is the expensive way
     * to buy presence and sizing them up is the free one.
     */
    scale: randomBetween(random, 0.022, 0.09),
    spin: randomBetween(random, -0.32, 0.32),
  }));
}

/*
 * THE ANALOG FLOOR, seeded and drawn once. Single dots over the field rather than a
 * repeating gradient: three co-prime gradient tiles produce a regular weave that reads as a
 * screen door up close, and a real grain has to survive a two pixel step.
 *
 * Denser than the showcase's, because this film is watched for five seconds on a page that
 * is otherwise paper. It is a DOM tile over the canvas rather than a post pass, which is
 * the whole reason the scene can ship without an EffectComposer.
 */
export const INTRO_GRAIN_TILE = 512;
/*
 * DENSER THAN THE SHOWCASE'S 0.44, AND BY ENOUGH TO MEASURE. Matching the showcase's layer
 * opacity took this floor from about half the reference to about three quarters of it, which
 * closed the stated cause and still left the frame reading emptier than the thing it was
 * meant to beat: mean absolute horizontal luminance difference, sampled in four type free
 * patches, 2.07 to 2.30 against 2.89 to 3.26.
 *
 * The rest is taken on the tile rather than by driving the layer past the reference, because
 * the tile is the honest lever: more grain, not a heavier wash of it. Dots land on an even
 * lattice, so the horizontal energy runs roughly with density times dot value.
 *
 * AND 0.72 STILL DID NOT CLEAR IT. Re-measured in four type free patches of the same frame
 * on both pages, the reveal came in at 2.67 to 2.85 against the showcase entry's 2.69 to
 * 3.00: near parity, which is not what this piece was asked for. The remaining lever is
 * density, because the dot value cannot go much further without folding the tile's three
 * levels into one: at 172 the hot tier already clamps at 255, and past about 180 the middle
 * tier joins it and the floor stops scattering brighter specks at all. So the density goes
 * up and the value moves only as far as the clamp allows.
 */
export const INTRO_GRAIN_DOT_DENSITY = 0.8;
export const INTRO_GRAIN_ODD_SHARE = 0.09;
export const INTRO_GRAIN_DOT_BLUE = 178;

export function makeIntroGrainTile(): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = INTRO_GRAIN_TILE;
  canvas.height = INTRO_GRAIN_TILE;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(INTRO_GRAIN_TILE, INTRO_GRAIN_TILE);
  const pixels = image.data;
  const random = seededRandom(hashSeed("intro-analog-floor"));
  const light = (index: number, blue: number) => {
    pixels[index + 2] = blue;
    pixels[index + 3] = 255;
  };

  for (let y = 0; y < INTRO_GRAIN_TILE; y += 2) {
    for (let x = 0; x < INTRO_GRAIN_TILE; x += 2) {
      if (random() < INTRO_GRAIN_DOT_DENSITY) {
        // Nearly every dot sits at one level and a handful run hot, which is how a real
        // floor scatters brighter specks through an otherwise even field.
        const roll = random();
        const blue = roll > 0.985
          ? INTRO_GRAIN_DOT_BLUE * 1.62
          : roll > 0.955
            ? INTRO_GRAIN_DOT_BLUE * 1.34
            : INTRO_GRAIN_DOT_BLUE;
        light((y * INTRO_GRAIN_TILE + x) * 4, Math.min(255, Math.round(blue)));
      }
      if (random() < INTRO_GRAIN_DOT_DENSITY * INTRO_GRAIN_ODD_SHARE) {
        light(((y + 1) * INTRO_GRAIN_TILE + x + 1) * 4, INTRO_GRAIN_DOT_BLUE);
      }
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
