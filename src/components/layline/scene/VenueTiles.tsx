"use client";

/**
 * The venue as live-streamed Google Photorealistic 3D Tiles (spike).
 *
 * The second venue mode, beside the baked `VenueShore`. Nothing here is baked
 * or committed: the tileset is fetched at run time from
 * `tile.googleapis.com/v1/3dtiles/root.json` through `GoogleCloudAuthPlugin`,
 * which owns the key, the session token and the per-tile copyright strings.
 * Google's terms forbid caching or re-deriving that data, so this file only
 * ever draws it.
 *
 * Georeferencing. The tileset is ECEF. `ReorientationPlugin` inverts the
 * ellipsoid's object frame at the course origin, which puts that point at the
 * world origin with +Y up. The course's own frame is ENU rotated so +Y runs up
 * the course axis on bearing 215 deg true, and the scene maps course (x, y) to
 * world (x, -z) (see `scripts/layline-bake-venue.mjs`), so the plugin's
 * azimuth is `bearing - 180` = 35 deg: its +Z ("forward") lands on world +Z,
 * which is down-course. Verified numerically against the baker's own
 * projection, see `.tmp/tiles-spike/executor-report.md`.
 *
 * Sea level. The tiles are referenced to the WGS84 ellipsoid; the harbour's
 * water sits at the geoid, which at Long Beach is tens of metres below it. The
 * replay's water plane is y = 0, so the frame's origin is placed at the
 * measured ellipsoid height of the sea surface rather than at 0. The value
 * below was measured by raycasting the loaded tiles at open-water points, not
 * taken from a geoid table; `probe()` on the dev-only readout is the same
 * measurement, kept so it can be re-run.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  MeshBasicMaterial,
  Raycaster,
  RedFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { DownloadPriorityQueue, LRUCache, PriorityQueue } from "3d-tiles-renderer/core";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/core/plugins";
import {
  ReorientationPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
} from "3d-tiles-renderer/three/plugins";
import { useReplay } from "../store";
import { tilesQuality } from "./venue-tiles-config";
import { requestSceneFrame, sceneGate } from "./gate";
import { VENUE_LAYER_PREFIX, setVenueDrawnForMask } from "./inspect";
import { FallbackShore } from "./VenueShore";
import { SEA_GLSL, seaCentre, seaReach } from "./Water";

const DEG = Math.PI / 180;

/* The course frame, copied from the baker's venue table (long-beach). */
export const COURSE_LAT = 33.742;
export const COURSE_LON = -118.155;
export const COURSE_BEARING = 215;
/* ReorientationPlugin orients its +Z forward; the course axis runs the other
 * way in world z, so the azimuth is the reciprocal of the course bearing. */
export const TILES_AZIMUTH = COURSE_BEARING - 180;

/* Ellipsoid height of the harbour's water surface, in metres. MEASURED off the
 * loaded tileset, never taken from a geoid table.
 *
 * Method: mount the frame at height 0 (`?venue=tiles&sea=0`), stand the lens
 * off the course origin at six eye heights from 3 m to 1,200 m, and raycast
 * the ACTIVE tile set straight down on a 5 x 5 grid at 50 m spacing after each
 * pose has gone quiet. Google flattens water in the photorealistic tileset, so
 * every reading is one of two plateaux rather than a cloud, and the two do not
 * agree:
 *
 *   -36.2 m   the real sea surface. Holds over the whole up-course half of the
 *             grid at every eye height from 3 m to 150 m.
 *   -47.0 m   about 10.8 m lower, over the down-course half, and over the
 *             WHOLE grid once the eye is 400 m up or more.
 *
 * The seam between them runs diagonally through the course origin and moves
 * with the level of detail: two Google captures of the same water disagree
 * about where its surface is, and no single offset can satisfy both. -36.2 is
 * the one taken, on two grounds: it is what a camera at racing height sees,
 * and it is within 0.6 m of the EGM96 geoid at Long Beach, which is where mean
 * sea level physically is. The other plateau is 11 m of error.
 *
 * Consequence, and it is the argument for keeping the replay's own water: with
 * this offset the bad plateau sits 11 m BELOW y = 0, so the replay water plane
 * covers it. Mounted the other way up (offset -47.3, measured first from a
 * 1,200 m camera) the good water stood 11 m ABOVE y = 0 and swallowed the
 * fleet whole; that capture is `.tmp/tiles-spike/shots/c2-race-over-tiles.png`. */
export const SEA_LEVEL_H = -36.2;

/* How far the tileset is sunk below its own measured sea level, in metres.
 *
 * Zero, and the reason is the sea clip below. The spike shipped 1.5 m because
 * landing the frame exactly on the measured sea level put Google's flat water
 * and the replay's animated water on the same plane, and the frame broke into
 * teal and grey patches wherever the two disagreed by less than the depth
 * buffer could separate. Sinking hid the teal by pushing it under.
 *
 * It never removed it: over a 7 x 7 grid at 150 m spacing the tileset's water
 * still reached 1.62 m ABOVE the replay plane in one cell of 49 with the sink
 * applied, which is the teal sheet the owner reported behind the shoreline.
 * And the sink bought that at a price paid everywhere: 1.5 m of extra flooding
 * on every low shore, and 1.5 m of extra draught on every moored hull, which
 * is what made Google's berthed vessels read as half-sunk wrecks.
 *
 * `SEA_CLIP` removes the water outright instead, so nothing is owed to the
 * sink. Measured before and after in `.tmp/tiles-fix/executor-report.md`. */
export const WATER_SINK = 0;

/* Google's own sea, removed rather than hidden.
 *
 * The photorealistic tileset carries the harbour's water as its own flattened
 * surface. Two of them, in fact, 10.8 m apart (see SEA_LEVEL_H), and neither is
 * wanted: the replay's water is animated, carries the wave shader the boats and
 * wakes were built against, and is the surface the whole scene is lit for.
 *
 * The removal is a fragment test on the tile materials, not a plugin.
 * `TileFlatteningPlugin`, which ships in the same package, was read and
 * rejected: it snaps every vertex inside a shape's footprint onto that shape,
 * so a horizontal shape big enough to cover the harbour would flatten the
 * Queen Mary and downtown Long Beach onto it as well. Its `threshold` bounds
 * how far BELOW the shape a vertex may be and still be lifted; there is no
 * bound on how far above, and there is no way to name water. It also raycasts
 * every vertex of every tile against the shape on the CPU.
 *
 * The test that IS water: a fragment is discarded when it is (a) below the sea
 * surface plus `SEA_CLIP`, (b) on a near-horizontal surface, and (c) inside the
 * square the replay's water clipmap covers. (b) is what keeps a moored hull's
 * plating and a riprap slope, which are steep, while taking a flat sheet; (c)
 * is what keeps the ocean beyond the clipmap's edge, where the replay water
 * stops and Google's own sea is all there is. Outside those three the tileset
 * is untouched.
 *
 * SEA_CLIP is 0.8 m, and it is swept rather than chosen. At racing detail the
 * water at the course centre reads 0.00 m with a spread of 0.01 m over a 5 x 5
 * cluster, so 0.8 m is already generous for the sea the boats sail on. Wider
 * looked tempting, because a teal wedge survives beyond the water clipmap and
 * a bigger clip eats into it, and wider is WRONG: swept at 0.8, 1.6, 2.4 and
 * 3.2 m over the chase and tv rigs and four shoreline poses with the replay
 * water on (.tmp/tiles-fix/clipsweep.mjs), 1.6 m drains the lagoon in front of
 * the arena, which is a real pond standing a metre or so above the sea, and 3.2
 * m takes the shoreline car parks and roads with it
 * (clipsweep-marina-low-clip0p8 against -clip1p6 and -clip3p2). Anything the
 * clip cannot reach at 0.8 m is written up as a residual instead.
 *
 * SEA_FLAT is cos(10 deg). A sheet of water is level to a fraction of a degree;
 * riprap, a hull and a quay wall are not. The exposure is flat ground low
 * enough to sit inside SEA_CLIP, which at 0.8 m is intertidal. */
export const SEA_CLIP = 0.8;
export const SEA_FLAT = 0.985;

/* The second, unconditional cut: any tile fragment this far BELOW the sea goes,
 * flat or not.
 *
 * It costs almost nothing to look at, because the replay's water is opaque and
 * covers everything under it, and it takes the geometry the flatness test
 * cannot: the near-vertical skirts Google hangs between adjacent water sheets.
 * Those survived the flatness test as a lattice of teal streaks across the near
 * water, and with the sink gone they were on top of the CHASE RIG, a framing
 * the owner has already signed off. Swept at four depths over the chase and tv
 * rigs and three shoreline poses (`.tmp/tiles-fix/deep.mjs`): 0.6 and 0.2 both
 * still draw the streaks, 0 and -0.3 are clean and indistinguishable.
 *
 * 0 is taken, the shallowest that works: at 0 the cut is exactly the sea
 * surface, so the wave shader's own troughs (0.45 m either side) are the only
 * thing that can uncover it, and a deeper cut would only widen that band. */
export const SEA_DEEP = 0;

/* ---------------------------------------------------------------------------
 * The water mask: what the clip's own pixel test could never know.
 *
 * `SEA_CLIP` at 0.8 m leaves a teal wedge wherever Google's capture puts the
 * harbour's water above the geoid by more than that, and the sweep in
 * `.tmp/tiles-fix/clipsweep.mjs` proved a wider clip is not the answer while
 * the test is geometric: 1.6 m drains the arena lagoon and 3.2 m takes the
 * shoreline car parks, because a level surface a metre over the sea is exactly
 * what a car park, a lawn and a pond all are.
 *
 * The mask replaces the guess with the venue's own ingested map data. It is a
 * top-down signed distance to the OSM waterline, baked over a 12 km square
 * about the course origin, positive on land and negative on water, so the
 * shader knows which side of the shore a fragment is on before it decides
 * anything. Where the mask says water the clip may open to `SEA_MASK_CLIP`;
 * where it says land, or where the fragment is outside the mask's coverage,
 * the shipped 0.8 m clip applies unchanged. Land is therefore untouched by
 * construction rather than by tuning, which is the whole point: no band, no
 * colour key and no range gate can drain the lagoon if the lagoon is not water
 * in the mask, and it is not, because it is not joined to the sea.
 *
 * What stays beside it: the distance haze (`SEA_HAZE`), OFF by default. Every
 * tile fragment fades toward the sky with eye distance, the same treatment
 * `VenueShore` gives the baked coast and `Water` gives the far sea. It knows
 * nothing about water and removes 2 per cent of the teal at its legibility
 * limit, so it is a look the owner can ask for, not a fix.
 *
 * What was removed: the far-water recolour (`tint`), which pulled a plausible
 * water fragment's output colour toward the replay sea's. It needed a colour
 * key on Google's own teal to avoid repainting a third of the marina frame,
 * the owner judged it too janky, and the mask does the job by deleting the
 * sheet rather than painting over it.
 * ------------------------------------------------------------------------- */

/* Where the baked mask is served from, and the frame it was baked in.
 *
 * The texture is 8-bit grey holding a SIGNED SQUARE ROOT of the distance to the
 * waterline: `t = value * 2 - 1`, `d = sign(t) * t * t * SEA_MASK_RANGE` metres,
 * positive on land, with row 0 at course y = -SEA_MASK_HALF. The curve is there
 * because the shader asks two questions of one byte. Where is the waterline, to
 * sub-metre, which decides how far a widened clip may be inset behind it; and
 * how far from ANY shore is this fragment, to the nearest ten metres out to
 * several hundred, which is what holds the steep cut to open water. One level
 * is 0.063 m at the waterline and 12 m at 500 m out.
 *
 * The mask is projected in the frame the TILES are in, not the one the baked
 * venue is in: same origin and bearing, but metres per degree taken from the
 * WGS84 radii at the origin (110,917.73 and 92,663.15) instead of the baker's
 * flat-earth constants. The spike measured that difference as up to 10.31 m of
 * disagreement at downtown Long Beach, and this is the consumer that would
 * have paid it. */
export const SEA_MASK_URL = "/prototype/layline/venues/long-beach-water-mask.png";
export const SEA_MASK_HALF = 6000;
export const SEA_MASK_RANGE = 1024;

/* How far above the sea a flat fragment over MAPPED water may stand and still
 * be discarded, in metres. This is the number `SEA_CLIP` could not have: at
 * 0.8 m it is bounded by what an intertidal car park can be, and here it is
 * bounded only by Google's own disagreement with the geoid, because there is
 * no car park inside it.
 *
 * Swept on one page load (`.tmp/tiles-mask/sweep.mjs`) at the flagged wedge
 * pose, teal pixels left of 73,738: 2 m leaves 78.5 per cent, 3 m 58.3, 4 m
 * 44.1, 5 m 43.0, 6 m 42.4, 8 m 41.7. It saturates at 4 to 5 m, which is where
 * Google's own water stops disagreeing with the geoid, and every one of those
 * arms changed the marina frame by 0.00 per cent. 5 m is taken as the first
 * value past the knee. */
export const SEA_MASK_CLIP = 5;

/* How far INSIDE the mapped waterline the widened clip stays away from, and
 * the distance it then ramps over, both in metres.
 *
 * The inset is a registration budget, not a taste setting. Two errors stack at
 * the shore: the mask's own reconstruction of the waterline (measured at
 * 0.20 m RMS and 2.30 m worst case over 54,513 samples taken on the ways
 * themselves) and OSM's own digitisation of a quay edge. The third, the
 * 0.2 per cent scale disagreement between the tiles and the baked course frame
 * that the spike measured at 10.31 m downtown, is not in this budget because
 * the mask is projected in the tiles' own frame and never picks it up.
 *
 * The pair is swept together against the land poses, not argued: 4 and 12
 * leaves the marina frame 32 pixels of 1.26 M different from its off arm and
 * White Island's rim byte-identical, while 2 and 8 puts 2,721 pixels of
 * shoreline rock at the bottom of the marina frame inside the widened clip.
 * 8 and 16 costs 3 percentage points of the wedge for 4 pixels of the marina.
 *
 * The feather is also what stops the transition drawing a line: the band is
 * mixed continuously from 0.8 m to SEA_MASK_CLIP across it, so the cut walks
 * out from the shore instead of stepping. */
export const SEA_MASK_INSET = 4;
export const SEA_MASK_FEATHER = 12;

/* Ordered dither on the band inside the feather, in metres, peak to peak. The
 * feather already moves the cut smoothly, but a smooth cut through a flat-ish
 * sheet still leaves one contour where the surface crosses it; breaking that
 * contour over a 4 x 4 Bayer cell turns it into a stipple. Shot at 0, 0.6 and
 * 2 m in the same window: the teal count moves by 0.1 per cent between them,
 * so this is a judgement about what the boundary LOOKS like, and 0.6 is where
 * the jagged edge of the 0 arm becomes a stipple without the 2 arm's speckle
 * reaching out into open water. */
export const SEA_MASK_DITHER = 0.6;

/* The steep cut, and the only thing that reaches Google's skirts.
 *
 * Between two adjacent water sheets at different heights Google hangs a
 * near-vertical wall. The flatness test excludes those by design, `SEA_DEEP`
 * only reaches the part below the sea surface, and with the sheets themselves
 * removed by the mask they are what is left: a lattice of teal lines over the
 * replay water, which is section 11.8's residual 1 now that nothing covers it.
 *
 * `SEA_MASK_STEEP` is how far above the sea a fragment the flatness test
 * REJECTED may stand and still be discarded. It cannot be applied over all
 * mapped water, because a moored hull's plating is steep too and slicing five
 * metres off a berthed ship's waterline is the ghost-ship regression again. So
 * it is gated on distance from the shore, which the mask carries and which
 * separates the two cases: a berthed ship is inside its own beam of a quay,
 * and the skirts run out across the whole harbour.
 *
 * `SEA_MASK_DEEP` is how far out from the waterline the cut ramps to full
 * strength: nothing at the shore, everything past it. Swept in
 * `.tmp/tiles-mask/shore.mjs` at the wedge, which wants it small, and at the
 * Queen Mary's quay and the container wharf, which are what it must not reach.
 * At 80 m the wedge keeps 24.2 per cent of its teal and the quay pose moves
 * 159 pixels of 1.26 M, all of them a hairline at the waterline of a basin
 * 200 m behind the ships. At 40 m the wedge is barely better (25.6 against
 * 27.2 at the 8 m inset) and the quay pose moves three times as many. At 160
 * and 320 m the skirt lattice comes back (31.2 and 34.8 per cent).
 *
 * Without the steep cut at all the wedge keeps 38.1 per cent and the lattice is
 * the picture's most obvious remaining fault, which is what the cut is for. */
export const SEA_MASK_STEEP = 5;
export const SEA_MASK_DEEP = 80;

/* The sky, in output sRGB, as the tiles see it: `mix(low, high, pow(dir.y, k))`.
 *
 * Fitted off `shots/final-shore-island-350.png` at three elevations above the
 * horizon (dir.y 0.01, 0.065, 0.167 reading rgb(213,226,234), (187,203,216),
 * (168,186,202)); the solve gives k = 0.55, low rgb(215,228,236) and high
 * rgb(89,116,146), and reproduces the middle sample to within 2 levels. A flat
 * horizon colour would leave a seam against the dome wherever a hazed ridge
 * stands more than a degree or so up; this does not.
 *
 * The haze fades toward this, and the water's own far colour ends at it too, so
 * a hazed hillside and the replay's own far sea arrive at one colour. */
export const SKY_LOW_SRGB: readonly [number, number, number] = [215 / 255, 228 / 255, 236 / 255];
export const SKY_HIGH_SRGB: readonly [number, number, number] = [89 / 255, 116 / 255, 146 / 255];

/* B: how much haze the farthest tile may take, 0 to 1, and the extinction and
 * the free distance in front of it. 0 is off. */
export const SEA_HAZE = 0;
export const SEA_HAZE_RHO = 1 / 9000;
export const SEA_HAZE_START = 600;

/* Cross-fade between levels of detail, in milliseconds, through
 * `TilesFadePlugin`. Without it a refining tileset swaps a coarse tile for a
 * sharp one between two frames and the swap reads as a pop. */
export const FADE_MS = 300;

/* Streaming shape: how fast the picture gets sharp where the boats are.
 *
 * The library's defaults are 25 concurrent downloads per origin and 5 concurrent
 * parses, on module-level queues SHARED by every TilesRenderer in the process.
 * This mounts its own queues and its own cache instead, so a setting here cannot
 * leak into another tileset and cannot outlive the component.
 *
 * `NEAR_FIRST` is `loadAncestors = false`, which is the library's switch from
 * sorting the queue by screen-space error to sorting it by distance from the
 * camera. It sounds like exactly what "sharpen the boats first" asks for and it
 * MEASURED WORSE, so it is off: cold, on one page load each, it reached the
 * opening picture 2.1 s sooner but took 18.6 s to settle the chase rig against
 * 6.9 s, and pulled 2,670 tiles and 41.9 MiB against 1,821 and 25.4 MiB
 * (.tmp/tiles-fix/stream.json). The gain came from the parallelism beside it,
 * not from the ordering. */
export const DOWNLOAD_JOBS = 25;
export const PARSE_JOBS = 5;
export const NEAR_FIRST = false;

/* Tiles held in memory before the cache starts evicting. The library defaults
 * are 6,000 / 8,000 tiles and 0.3 / 0.4 GB; both are far above what this venue
 * reaches, which is the measurement that says LRU sizing is not what makes a
 * revisited pose re-blur. Kept as constants so the claim can be re-run. */
export const LRU_MIN = 6000;
export const LRU_MAX = 8000;

/* Where the Google session token is parked between page loads.
 *
 * Every tile URL carries `?session=<token>`, so a fresh token on every reload
 * changes every URL and misses the browser's HTTP cache wholesale. The token is
 * good for hours. `sessionStorage`, not `localStorage`: it dies with the tab,
 * which is the right lifetime for a credential-adjacent string, and it is the
 * token only, never the API key. */
const SESSION_STORE = "layline.tiles.session";

/* `tilesQuality`, `ERROR_LADDER`, and the device tier table live in
 * `venue-tiles-config.ts` so the scene can import them without this module's
 * `3d-tiles-renderer` weight; this file re-imports `tilesQuality` above. */

/* The screen-space error the traversal relaxes to WHILE THE CAMERA IS MOVING,
 * and how still the camera has to be to earn the sharp one back.
 *
 * A moving camera cannot be looked at closely and every tile it pulls is thrown
 * away a frame later, so refining to 12 px through a rig change spends bytes on
 * a picture nobody sees. Quiescence is read off the camera itself, not off a
 * timer: the world position and the look direction, compared against the last
 * frame, under a threshold for `SETTLE_FRAMES` consecutive frames. */
export const MOVING_ERROR_TARGET = 28;
export const SETTLE_FRAMES = 6;
const SETTLE_MOVE = 0.35; /* metres per frame */
const SETTLE_TURN = 0.0025; /* radians per frame, about 0.14 deg */

/* Screen-space error the tileset refines to, in pixels. The Google auth
 * plugin's own recommended setting is 20; 12 is one step sharper and is what
 * the spike's captures were shot at. Overridable per load for measurement. */
export const DEFAULT_ERROR_TARGET = 12;

/* The mask name the tiles group answers to, so `__layline.show({venueLayers})`
 * can take the whole streamed venue out of a picture and, more importantly, so
 * the mask's walk stops at the group instead of recursing through every loaded
 * tile mesh. 9 is outside the baked asset's class ids (1..6). */
export const TILES_LAYER_CLASS = 9;

export interface TilesReadout {
  /* Root tileset fetched and parsed. */
  rootLoaded: boolean;
  /* Tiles still on the wire or in the parser. Zero plus `loading === false` is
   * quiescence: the tileset has refined as far as this camera asks it to. */
  queued: number;
  downloading: number;
  parsing: number;
  loading: boolean;
  progress: number;
  /* Tiles the traversal chose to draw in the last update. */
  visible: number;
  /* Tile models with geometry currently attached to the scene. */
  models: number;
  /* Attribution string the tileset is currently asking to have on screen. */
  attribution: string;
  seaLevelH: number;
  errorTarget: number;
  lit: boolean;
  /* Metres above the sea surface below which a flat tile fragment is dropped,
   * and the cosine that decides "flat". */
  seaClip: number;
  seaDeep: number;
  seaFlat: number;
  /* Half-side of the square the clip is applied inside, and where that square
   * is centred this frame. Outside it the tileset keeps its own sea, because
   * that is where the replay's water clipmap stops. */
  seaReach: number;
  seaCentre: [number, number];
  /* The water mask and the haze, so a capture reports the arm it is in rather
   * than trusting the query string it asked for. `seaMaskLoaded` is false until
   * the texture has decoded, and while it is false the frame is the one the
   * 0.8 m clip alone draws. */
  seaMask: number;
  seaMaskLoaded: boolean;
  seaMaskClip: number;
  seaMaskInset: number;
  seaMaskFeather: number;
  seaMaskDither: number;
  seaMaskSteep: number;
  seaMaskDeep: number;
  seaMaskHalf: number;
  seaMaskSize: number;
  seaHaze: number;
  seaHazeRho: number;
  seaHazeStart: number;
  fadeMs: number;
  /* Streaming shape actually in force, so a capture reports it rather than
   * assuming the query string was honoured. */
  downloadJobs: number;
  parseJobs: number;
  nearFirst: boolean;
  lruMax: number;
  inCache: number;
  movingTarget: number;
  liveTarget: number;
  errorCeiling: number;
  settled: boolean;
  sessionReused: boolean;
  tier: string;
  /* Tile meshes that arrived with a normal channel against those that did not:
   * the flatness test reads the vertex normal where there is one. */
  tileNormals: { with: number; without: number };
}

/* Dev-only readout, hung on `window` by the component below. Deliberately not
 * part of `__layline`: CaptureBridge's contract ships in production builds and
 * this is a spike instrument. */
declare global {
  interface Window {
    __laylineTiles?: {
      info: () => TilesReadout;
      /* Raycast the loaded tiles straight down at a world xz and return the
       * surface height, or null if nothing is loaded there. This is the
       * sea-level measurement. */
      probe: (x: number, z: number, from?: number) => number | null;
      /* Change the screen-space error the traversal refines to, without a
       * reload: a reload would spend another billable session. */
      setErrorTarget: (px: number) => void;
      /* Sweep the sea clip (metres above the sea surface, and the cosine below
       * which a surface is too steep to be water) on a live tileset, for the
       * same reason: one page load, every setting. */
      setSeaClip: (metres: number, deep?: number, flat?: number, reach?: number) => void;
      /* The water mask and the distance haze, both on live uniforms for the
       * same reason: one page load, every arm. `setSeaMask(0)` is the off arm
       * and returns the frame to the one the 0.8 m clip alone draws. */
      setSeaMask: (
        amount: number,
        clip?: number,
        inset?: number,
        feather?: number,
        dither?: number,
        steep?: number,
        deep?: number,
      ) => void;
      setSeaHaze: (amount: number, rho?: number, start?: number) => void;
      /* What the loaded tile meshes are actually made of, so a capture can say
       * whether the scene's lights touch them rather than assume. */
      materials: () => Record<string, number>;
      /* The screen-space error the drawn tiles ACHIEVE, in pixels, next to the
       * one that was asked for. A tileset that has run out of children cannot
       * refine further whatever the target says, and this is the number that
       * says so: it is what "the picture is coarser than requested" measures
       * as, and it is how the camera envelope below was derived rather than
       * guessed. */
      error: () => {
        target: number;
        n: number;
        median: number;
        p90: number;
        max: number;
        nearest: number;
        exhausted: number;
      };
      /* Area of the loaded tile geometry that is near-horizontal, bucketed by
       * world height. Google flattens water into a handful of very large
       * horizontal triangles, so its sea shows up here as a spike of hundreds
       * of thousands of square metres in one bin while real ground spreads
       * across many; this is how the water band below was measured rather than
       * guessed. `up` is the minimum triangle normal Y counted as horizontal. */
      surfaces: (options?: { bin?: number; up?: number; stride?: number; above?: number }) => {
        triangles: number;
        counted: number;
        bin: number;
        up: number;
        /* [height of bin floor, square metres, triangle count], area order. */
        bands: [number, number, number][];
        /* Near-horizontal area standing more than `above` metres over the sea
         * surface, clustered into 200 m cells: this is what a sea clip has left
         * behind, and where it is. */
        overSea: {
          metres: number;
          area: number;
          cells: { x: number; z: number; area: number; minY: number; maxY: number; overSea: number }[];
        };
      };
    };
  }
}

/* `stats` and `isLoading` are fields on TilesRendererBase and are what the
 * library's own examples read for load state, but the shipped `.d.ts` stops at
 * `loadProgress` and does not declare them. Naming the shape here keeps the
 * cast to one place and makes it obvious what would break on an upgrade. */
interface TileViewError {
  inView: boolean;
  error: number;
  distanceFromCamera: number;
}

interface TilesLoadState {
  stats: { inCache: number; queued: number; downloading: number; parsing: number; visible: number };
  isLoading: boolean;
  errorTarget: number;
  visibleTiles: Set<object>;
  raycast: (raycaster: Raycaster, intersects: { point: Vector3 }[]) => void;
  calculateTileViewError: (tile: object, target: TileViewError) => void;
}

/* The auth helper the plugin owns. Its shipped .d.ts stops at the constructor,
 * so the one field this needs is named here rather than cast at each use; if an
 * upgrade moves it, this line is what breaks. */
interface GoogleAuthHolder {
  auth: { sessionToken: string | null };
}

function authOf(plugin: GoogleCloudAuthPlugin): GoogleAuthHolder["auth"] {
  return (plugin as unknown as GoogleAuthHolder).auth;
}

function loadState(tiles: TilesRendererImpl): TilesLoadState {
  return tiles as unknown as TilesLoadState;
}

function unlit(mesh: Mesh, material: Material): Material {
  const map = (material as { map?: MeshBasicMaterial["map"] }).map ?? null;
  const replacement = new MeshBasicMaterial({ map, toneMapped: true });
  mesh.material = replacement;
  material.dispose();
  return replacement;
}

/* The uniforms the sea clip runs off, shared by every tile material so one
 * write per frame covers the whole tileset. */
/* How many tile meshes carried a normal channel, so the report can say which
 * path the flatness test actually took rather than assume it. */
interface NormalCounts {
  with: number;
  without: number;
}

interface SeaUniforms {
  uSeaCentre: { value: Vector2 };
  uSeaReach: { value: number };
  uSeaClip: { value: number };
  uSeaDeep: { value: number };
  uSeaFlat: { value: number };
  uSeaCurve: { value: number };
  /* The water mask. `uSeaMask` holds a 1 x 1 land texel until the baked one
   * has decoded, and `uSeaMaskOn` stays 0 until then, so a tile drawn during
   * the load is drawn by the shipped clip and nothing flashes. */
  uSeaMask: { value: Texture };
  uSeaMaskOn: { value: number };
  uSeaMaskHalf: { value: number };
  uSeaMaskRange: { value: number };
  uSeaMaskClip: { value: number };
  uSeaMaskInset: { value: number };
  uSeaMaskFeather: { value: number };
  uSeaMaskDither: { value: number };
  uSeaMaskSteep: { value: number };
  uSeaMaskDeep: { value: number };
  /* The distance haze. */
  uSeaHaze: { value: number };
  uSeaHazeRho: { value: number };
  uSeaHazeStart: { value: number };
  /* The sky the haze fades toward. */
  uSkyLow: { value: Vector3 };
  uSkyHigh: { value: Vector3 };
}

/* Injected into every tile material.
 *
 * Flatness is read off the INTERPOLATED VERTEX NORMAL, not off screen-space
 * derivatives of the world position. Derivatives were tried first and fail
 * twice over, both failures shot: a 2 x 2 quad that straddles a triangle edge
 * gets a normal belonging to neither triangle, which left Google's water as a
 * lattice of teal lines across the near sea (`after-shore-island-low.png` from
 * the first attempt), and once a tile's triangles fall under a pixel the
 * derivative is noise, which left the whole far half of the sea teal
 * (`after-nowater-sweep-clip-3p2.png` from the same run). The vertex normal is
 * stable at every range and costs one varying.
 *
 * `LAYLINE_TILE_NORMAL` is defined per material from the geometry: a tile
 * without a normal channel would read the default attribute and normalize a
 * zero vector, so those keep the derivative path. */
const SEA_CLIP_GLSL = /* glsl */ `
uniform vec2 uSeaCentre;
uniform float uSeaReach;
uniform float uSeaClip;
uniform float uSeaDeep;
uniform float uSeaFlat;
uniform sampler2D uSeaMask;
uniform float uSeaMaskOn;
uniform float uSeaMaskHalf;
uniform float uSeaMaskRange;
uniform float uSeaMaskClip;
uniform float uSeaMaskInset;
uniform float uSeaMaskFeather;
uniform float uSeaMaskDither;
uniform float uSeaMaskSteep;
uniform float uSeaMaskDeep;
uniform float uSeaHaze;
uniform float uSeaHazeRho;
uniform float uSeaHazeStart;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
varying vec3 vLaylineWorld;
#ifdef LAYLINE_TILE_NORMAL
varying vec3 vLaylineNormal;
#endif
${SEA_GLSL}

/* The dome as the tiles see it, in OUTPUT sRGB: see SKY_LOW_SRGB. The haze
 * fades toward this, so it cannot leave a seam against the sky. */
vec3 laylineTileSky(vec3 dir) {
  return mix(uSkyLow, uSkyHigh, pow(clamp(dir.y, 0.0, 1.0), 0.55));
}

/* 4 x 4 ordered dither, 0 to 1, from the recursive 2 x 2 form. Screen-space and
 * stable for a still camera, which is what a pixel comparison needs. */
float laylineBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float laylineBayer4(vec2 a) {
  return laylineBayer2(a * 0.5) * 0.25 + laylineBayer2(a);
}

/* Metres from the mapped waterline, positive on land, and how far inside the
 * mask's own square the fragment is. Both come out of one fetch. */
vec2 laylineMaskRead(vec2 xz) {
  vec2 courseXY = vec2(xz.x, -xz.y);
  vec2 uv = courseXY / (2.0 * uSeaMaskHalf) + 0.5;
  vec2 edge = min(uv, 1.0 - uv);
  /* Clamped rather than returned early: the fetch stays in control flow that is
   * uniform over the draw call, which is what a sampler with implicit LOD is
   * owed even with mipmaps off. */
  float t = texture2D(uSeaMask, clamp(uv, 0.0, 1.0)).r * 2.0 - 1.0;
  return vec2(sign(t) * t * t * uSeaMaskRange, min(edge.x, edge.y) * 2.0 * uSeaMaskHalf);
}
`;

const SEA_CLIP_VERTEX = /* glsl */ `
  vLaylineWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #ifdef LAYLINE_TILE_NORMAL
  vLaylineNormal = mat3(modelMatrix) * normal;
  #endif
`;

/* The derivative fallback is taken at the top of main, in uniform control flow:
 * a derivative under a branch is undefined by the spec even where a driver
 * happens to answer. */
const SEA_CLIP_BODY = /* glsl */ `
  #ifdef LAYLINE_TILE_NORMAL
  vec3 laylineFace = vLaylineNormal;
  #else
  vec3 laylineFace = cross(dFdx(vLaylineWorld), dFdy(vLaylineWorld));
  #endif
  float laylineFaceLen = length(laylineFace);
  vec2 laylineFromCentre = abs(vLaylineWorld.xz - uSeaCentre);
  float laylineDepth = laylineSeaY(vLaylineWorld.xz) - vLaylineWorld.y;
  bool laylineInside = max(laylineFromCentre.x, laylineFromCentre.y) < uSeaReach;
  bool laylineLevel = laylineFaceLen > 0.0 && abs(laylineFace.y) / laylineFaceLen > uSeaFlat;

  /* The mask decides how wide the flat clip is allowed to be HERE. At water
   * weight 0, which is all of the land, all of the shore and everything outside
   * the mask's square, the band is uSeaClip and the test below is the shipped
   * one to the bit. The dither only bites inside the feather, where the two
   * bands are being mixed; a fragment on open water or on land takes the same
   * band as its neighbour and no stipple appears. */
  vec2 laylineMask = laylineMaskRead(vLaylineWorld.xz);
  float laylineCoverW = smoothstep(0.0, 64.0, laylineMask.y) * uSeaMaskOn;
  float laylineWaterW = laylineCoverW *
    (1.0 - smoothstep(-(uSeaMaskInset + uSeaMaskFeather), -uSeaMaskInset, laylineMask.x));
  float laylineBand = mix(uSeaClip, uSeaMaskClip, laylineWaterW);
  if (uSeaMaskDither > 0.0 && laylineWaterW > 0.0 && laylineWaterW < 1.0) {
    laylineBand += (laylineBayer4(gl_FragCoord.xy) - 0.5) * uSeaMaskDither;
  }
  /* The steep cut, held off the berths: see SEA_MASK_STEEP. Ramped from
   * nothing at the waterline to full at uSeaMaskDeep metres out, so a hull
   * lying alongside is never inside it and no ring is drawn where it starts. */
  float laylineDeepW = laylineCoverW * smoothstep(0.0, uSeaMaskDeep, -laylineMask.x);
  float laylineSteepBand = uSeaMaskSteep * laylineDeepW;
  bool laylineSteepCut = laylineSteepBand > 0.0 && laylineDepth > -laylineSteepBand;
  if (
    laylineInside &&
    (laylineDepth > uSeaDeep || (laylineLevel && laylineDepth > -laylineBand) || laylineSteepCut)
  ) discard;
`;

/* Applied AFTER `<colorspace_fragment>`, so the mix happens in the same output
 * sRGB the constants were measured in. Mixing before tone mapping would put a
 * screenshot's numbers through the tone curve twice. */
const SEA_COLOUR_BODY = /* glsl */ `
  if (uSeaHaze > 0.0) {
    vec3 laylineToEye = vLaylineWorld - cameraPosition;
    float laylineEyeDist = length(laylineToEye);
    vec3 laylineEyeDir = laylineToEye / max(laylineEyeDist, 1e-4);
    float laylineHazeW =
      uSeaHaze * (1.0 - exp(-max(laylineEyeDist - uSeaHazeStart, 0.0) * uSeaHazeRho));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, laylineTileSky(laylineEyeDir), laylineHazeW);
  }
`;

function withSeaClip(material: Material, uniforms: SeaUniforms, hasNormal: boolean): void {
  if (hasNormal) material.defines = { ...material.defines, LAYLINE_TILE_NORMAL: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vLaylineWorld;\n${
      hasNormal ? "varying vec3 vLaylineNormal;\n" : ""
    }${shader.vertexShader}`.replace(
      "#include <project_vertex>",
      `${SEA_CLIP_VERTEX}#include <project_vertex>`,
    );
    shader.fragmentShader = `${SEA_CLIP_GLSL}${shader.fragmentShader}`
      .replace("void main() {", `void main() {\n${SEA_CLIP_BODY}`)
      /* The include is re-emitted rather than consumed: `TilesFadePlugin` wraps
       * this material afterwards and does its own replaces on the same text. */
      .replace(
        "#include <colorspace_fragment>",
        `#include <colorspace_fragment>\n${SEA_COLOUR_BODY}`,
      );
  };
  /* Every tile material of a kind carries the same injection, so they can all
   * share one compiled program; without a stated key three.js keys on the
   * closure's own source text, which is the same string but re-derived per
   * material. */
  material.customProgramCacheKey = () => `layline-sea-clip-${hasNormal ? "n" : "d"}`;
}

/**
 * The plugin that owns what a tile is made of.
 *
 * It is a plugin rather than a bare `load-model` listener so that registration
 * order decides who sees a tile first. `TilesFadePlugin` wraps whatever
 * material it finds on the model it is handed and chains that material's
 * existing `onBeforeCompile`; if it ran first, the material this replaces would
 * take the fade wrap with it and nothing would cross-fade. Registered before
 * the fade plugin, this one swaps the material and installs the clip, and the
 * fade plugin then wraps the material that is actually drawn.
 */
/* One land texel, so the sampler is bound to something real from the first
 * compiled program. `uSeaMaskOn` is 0 until the baked mask has decoded, so this
 * is never read for a decision; it exists so three.js does not have to invent a
 * default texture for an unset sampler. */
function placeholderMask(): DataTexture {
  const texture = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Decode the baked water mask into a single-channel texture.
 *
 * Through `createImageBitmap` and a canvas rather than `TextureLoader`: the
 * loader would hand three.js an HTMLImageElement, which uploads as RGBA and
 * costs four bytes a texel for one byte of information. Read back here and
 * repacked, a 2048 mask is 4 MiB on the GPU instead of 16.
 *
 * `flipY` is false, which is the DataTexture default and is why the baker
 * writes row 0 at course y = -half rather than at the top of the picture.
 */
async function loadSeaMask(url: string, signal: AbortSignal): Promise<DataTexture> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`water mask ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("no 2d context for the water mask");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = context.getImageData(0, 0, width, height).data;
  const red = new Uint8Array(width * height);
  for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4];
  const texture = new DataTexture(red, width, height, RedFormat, UnsignedByteType);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function materialsPlugin(uniforms: SeaUniforms, lit: boolean, normalCounts: NormalCounts) {
  let owner: TilesRendererImpl | null = null;
  /* The materials this made, so they can be released with the tile. The
   * renderer's own disposal list was filled from the model BEFORE `load-model`
   * fired, so it holds the material this replaced and never learns about the
   * replacement; a streamed session loads thousands of tiles and each one would
   * otherwise leave a live material, and with it a shader program reference,
   * behind. */
  const ours = new WeakSet<Material>();
  const onLoadModel = (event: { scene: Object3D }) => {
    event.scene.traverse((node) => {
      const mesh = node as Mesh;
      const material = mesh.material as Material | Material[] | undefined;
      if (material === undefined || Array.isArray(material)) return;
      const hasNormal = mesh.geometry?.attributes?.normal !== undefined;
      normalCounts[hasNormal ? "with" : "without"] += 1;
      let target = material;
      if (!lit) {
        target = unlit(mesh, material);
        ours.add(target);
      }
      withSeaClip(target, uniforms, hasNormal);
    });
  };
  const onDisposeModel = (event: { scene: Object3D }) => {
    event.scene.traverse((node) => {
      const material = (node as Mesh).material as Material | Material[] | undefined;
      if (material === undefined || Array.isArray(material)) return;
      if (ours.has(material)) material.dispose();
    });
  };
  return {
    name: "LAYLINE_TILE_MATERIALS",
    /* Ahead of the fade plugin's -2, so this runs first on a shared event: the
     * fade plugin wraps whatever material it is handed, and a material replaced
     * after it had wrapped would not fade. */
    priority: -50,
    init(tiles: TilesRendererImpl) {
      owner = tiles;
      tiles.addEventListener("load-model", onLoadModel as never);
      tiles.addEventListener("dispose-model", onDisposeModel as never);
    },
    dispose() {
      owner?.removeEventListener("load-model", onLoadModel as never);
      owner?.removeEventListener("dispose-model", onDisposeModel as never);
      owner = null;
    },
  };
}

/**
 * Streamed venue mode. Mounted instead of `VenueShore`, never beside it: the
 * two draw the same harbour and the baked coast would z-fight the photogrammetry.
 */
export function VenueTiles({
  apiKey,
  errorTarget = DEFAULT_ERROR_TARGET,
  seaLevel = SEA_LEVEL_H + WATER_SINK,
  seaClip = SEA_CLIP,
  seaDeep = SEA_DEEP,
  seaMask = 1,
  seaHaze = SEA_HAZE,
  fadeMs = FADE_MS,
  downloadJobs = DOWNLOAD_JOBS,
  parseJobs = PARSE_JOBS,
  nearFirst = NEAR_FIRST,
  lruMax = LRU_MAX,
  movingTarget = MOVING_ERROR_TARGET,
  reuseSession = true,
  tierName = "base",
  lit = false,
}: {
  apiKey: string;
  errorTarget?: number;
  seaLevel?: number;
  seaClip?: number;
  seaDeep?: number;
  seaMask?: number;
  seaHaze?: number;
  fadeMs?: number;
  downloadJobs?: number;
  parseJobs?: number;
  nearFirst?: boolean;
  lruMax?: number;
  movingTarget?: number;
  reuseSession?: boolean;
  tierName?: string;
  lit?: boolean;
}) {
  const [tiles, setTiles] = useState<TilesRendererImpl | null>(null);
  const status = useReplay((state) => state.venueAsset);
  const drawn = useRef(false);
  const attribution = useRef("");
  const overlay = useRef<HTMLDivElement | null>(null);

  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  /* One object per mount, handed to every tile material and written once a
   * frame from the frame hook below. A ref rather than state: it is read by the
   * GPU, never by React, and a set-state per camera move would re-render the
   * scene tree. */
  const normals = useRef<NormalCounts>({ with: 0, without: 0 });
  /* Side of the decoded mask in texels, 0 while it has not landed. */
  const maskSize = useRef(0);
  const reused = useRef(false);
  /* Settle-sharpening state: the last frame's eye and look, and how many
   * consecutive frames the camera has held both. */
  const lastEye = useRef(new Vector3());
  const lastLook = useRef(new Vector3(0, 0, -1));
  const look = useRef(new Vector3());
  const still = useRef(0);
  const sea = useRef<SeaUniforms | null>(null);
  if (sea.current === null) {
    sea.current = {
      uSeaCentre: { value: new Vector2() },
      /* The streamed venue's own sea square, which is the one the water draws:
       * the clip and the mesh must agree, or the edge shows. */
      uSeaReach: { value: seaReach(true) },
      uSeaClip: { value: seaClip },
      uSeaDeep: { value: seaDeep },
      uSeaFlat: { value: SEA_FLAT },
      uSeaCurve: { value: 1 },
      uSeaMask: { value: placeholderMask() },
      uSeaMaskOn: { value: 0 },
      uSeaMaskHalf: { value: SEA_MASK_HALF },
      uSeaMaskRange: { value: SEA_MASK_RANGE },
      uSeaMaskClip: { value: SEA_MASK_CLIP },
      uSeaMaskInset: { value: SEA_MASK_INSET },
      uSeaMaskFeather: { value: SEA_MASK_FEATHER },
      uSeaMaskDither: { value: SEA_MASK_DITHER },
      uSeaMaskSteep: { value: SEA_MASK_STEEP },
      uSeaMaskDeep: { value: SEA_MASK_DEEP },
      uSeaHaze: { value: seaHaze },
      uSeaHazeRho: { value: SEA_HAZE_RHO },
      uSeaHazeStart: { value: SEA_HAZE_START },
      uSkyLow: { value: new Vector3(...SKY_LOW_SRGB) },
      uSkyHigh: { value: new Vector3(...SKY_HIGH_SRGB) },
    };
  }

  /**
   * The tileset, built by hand rather than through `3d-tiles-renderer/r3f`.
   *
   * The R3F wrapper rebuilds its TilesRenderer whenever the effect that owns
   * it re-runs, and this scene changes the Canvas `frameloop` prop every time
   * a capture freezes or thaws. MEASURED: `__layline.freeze()` on the wrapper
   * disposed the live tileset and constructed a second one mid-flight, which
   * (a) bought a second billable root-tileset session and (b) threw
   * `Cannot read properties of undefined (reading 'loadingState')` out of
   * `resetFailedTiles` during the new auth plugin's init, taking the whole
   * React tree down with it and with it `window.__layline`. Owning the
   * instance here makes it survive every frameloop change, which is what the
   * capture contract needs.
   *
   * The load is also the scene's one asynchronous thing in this mode, so it
   * takes the same tri-state the baked asset uses: `loading` holds
   * `__layline.ready` down until a frame has been drawn with tiles in it.
   */
  useEffect(() => {
    useReplay.getState().setVenueAsset("loading");
    drawn.current = false;
    setVenueDrawnForMask(false);

    const instance = new TilesRendererImpl();
    instance.errorTarget = errorTarget;

    /* Queues and cache owned by this tileset rather than the module-level
     * singletons the library hands out, so a setting cannot leak into another
     * renderer or outlive this component. Both have to be assigned before the
     * first `update()`; the library says so and enforces nothing. */
    const downloads = new DownloadPriorityQueue();
    downloads.maxJobsPerOrigin = downloadJobs;
    downloads.priorityCallback = instance.downloadQueue.priorityCallback;
    instance.downloadQueue = downloads;
    const parses = new PriorityQueue();
    parses.maxJobs = parseJobs;
    parses.priorityCallback = instance.parseQueue.priorityCallback;
    instance.parseQueue = parses;
    const cache = new LRUCache();
    cache.unloadPriorityCallback = instance.lruCache.unloadPriorityCallback;
    cache.minSize = Math.min(LRU_MIN, Math.round(lruMax * 0.75));
    cache.maxSize = lruMax;
    instance.lruCache = cache;
    /* Near-field first: see NEAR_FIRST. The library's own unified priority
     * callback switches from sorting by screen-space error to sorting by
     * distance from the camera exactly when this is off. */
    instance.loadAncestors = !nearFirst;

    /* `useRecommendedSettings` is off because its one effect is to write
     * errorTarget = 20 from inside the plugin's own init, which would land
     * after the line above and silently overrule it.
     *
     * `autoRefreshToken` is off because it is billable. Google charges per
     * root-tileset request, not per tile, and the refresh path re-requests the
     * root on ANY 4xx: the handful of tile URIs that arrive without a session
     * parameter (measured at 3 in 912) would each buy a fresh session. The
     * token is good for hours, which is longer than a visit. */
    const auth = new GoogleCloudAuthPlugin({
      apiToken: apiKey,
      autoRefreshToken: false,
      useRecommendedSettings: false,
    });
    /* Carry the session token across a reload.
     *
     * Every tile URL carries `?session=<token>`, and the 3D Tiles API hands the
     * token back inside the ROOT TILESET, not from a separate endpoint: the
     * plugin's own `GoogleCloudAuth.fetch` reads it out of the first tile URI in
     * the root JSON. So a stored token cannot skip the root request and cannot
     * save the billable session; what it does is keep every tile URL BYTE
     * IDENTICAL to the previous load's, which is the only way the browser's HTTP
     * cache can hit at all. Seeded here, before the plugin is registered and
     * before anything is fetched. Numbers in the report. */
    let sessionReused = false;
    if (reuseSession && typeof sessionStorage !== "undefined") {
      try {
        const stored = sessionStorage.getItem(SESSION_STORE);
        if (stored !== null && stored !== "") {
          authOf(auth).sessionToken = stored;
          sessionReused = true;
        }
      } catch {
        /* Private mode and blocked storage both throw on read; not a failure. */
      }
    }
    reused.current = sessionReused;
    instance.registerPlugin(auth);
    /* Georeferencing: see the file header. The plugin inverts the ellipsoid's
     * object frame at the course origin, so that point lands at the world
     * origin with the course axis on world -z. */
    instance.registerPlugin(
      new ReorientationPlugin({
        lat: COURSE_LAT * DEG,
        lon: COURSE_LON * DEG,
        height: seaLevel,
        azimuth: TILES_AZIMUTH * DEG,
      }),
    );
    /* Materials before fade: see `materialsPlugin`. Both are registered here
     * rather than from a later effect so the order is the registration order
     * and not whatever order React happens to run effects in. */
    /* Google's photorealistic tiles arrive with NO normal channel. MEASURED,
     * not assumed: over three settled views the material plugin below counted
     * 1,101, 1,627 and 2,291 tile meshes and a normal on none of them
     * (`.tmp/tiles-fix/tune.json`). Without one the sea clip has to read
     * flatness off screen-space derivatives, which breaks twice: at triangle
     * edges, and wherever a tile's triangles fall under a pixel. Both failures
     * are shot in the report.
     *
     * `TileCompressionPlugin` from the same package runs `computeVertexNormals`
     * on every tile as it is parsed, before `load-model` is dispatched, so the
     * material plugin below sees a normal and takes the stable path. Nothing
     * else about the plugin is turned on. */
    instance.registerPlugin(new TileCompressionPlugin({ generateNormals: true }));
    tilesQuality.active = true;
    tilesQuality.ceiling = 0;
    tilesQuality.target = errorTarget;
    normals.current = { with: 0, without: 0 };
    instance.registerPlugin(materialsPlugin(sea.current as SeaUniforms, lit, normals.current));
    if (fadeMs > 0) {
      /* Cross-fade level-of-detail swaps instead of cutting them. The plugin
       * keeps the outgoing tile drawn for the duration, so draw calls rise
       * while a fade is in flight; measured in the report. It also dispatches
       * `needs-render` on every fade step, which the wake below turns into a
       * drawn frame, so a paused replay still fades rather than freezing
       * half-way through one. */
      instance.registerPlugin(new TilesFadePlugin({ fadeDuration: fadeMs }));
    }
    /* The mask's walk stops at a name it owns, which is what keeps
     * `applyShowMask` from descending through every loaded tile mesh, and it
     * gives `__layline.show({venueLayers})` a handle on the streamed venue. */
    instance.group.name = `${VENUE_LAYER_PREFIX}${TILES_LAYER_CLASS}`;

    /* Park the token once the root has landed, and throw it away the moment a
     * tile refuses it. Google's token is good for hours, but "hours" is not
     * "always", and a stale one makes every tile 4xx. `autoRefreshToken` stays
     * off, so there is no retry loop here either: the stored token is dropped
     * and the NEXT page load pays for one fresh root request. */
    const onRootLoaded = () => {
      if (!reuseSession || typeof sessionStorage === "undefined") return;
      const token = authOf(auth).sessionToken;
      if (typeof token !== "string" || token === "") return;
      try {
        sessionStorage.setItem(SESSION_STORE, token);
      } catch {
        /* Storage full or blocked; the next load simply asks for a new token. */
      }
    };
    const onAnyError = () => {
      if (typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.removeItem(SESSION_STORE);
      } catch {
        /* nothing to do */
      }
    };
    instance.addEventListener("load-root-tileset", onRootLoaded as never);
    instance.addEventListener("load-error", onAnyError as never);

    setTiles(instance);

    return () => {
      instance.removeEventListener("load-root-tileset", onRootLoaded as never);
      instance.removeEventListener("load-error", onAnyError as never);
      tilesQuality.active = false;
      tilesQuality.ceiling = 0;
      instance.dispose();
      setTiles(null);
      useReplay.getState().setVenueAsset("absent");
      setVenueDrawnForMask(false);
    };
    /* Built once per venue. errorTarget and seaLevel are read from the query
     * string at mount and never change under a live tileset; rebuilding for
     * either would spend another session. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  /* The baked water mask, fetched once and independent of the tileset: it costs
   * no Google session, it does not gate readiness, and until it lands the clip
   * is the shipped 0.8 m one. A venue whose mask 404s therefore degrades to the
   * frame this file already drew rather than to a broken one. */
  useEffect(() => {
    if (seaMask <= 0) return;
    const abort = new AbortController();
    let live = true;
    let loaded: DataTexture | null = null;
    loadSeaMask(SEA_MASK_URL, abort.signal)
      .then((texture) => {
        if (!live) {
          texture.dispose();
          return;
        }
        loaded = texture;
        const uniforms = sea.current as SeaUniforms;
        uniforms.uSeaMask.value.dispose();
        uniforms.uSeaMask.value = texture;
        uniforms.uSeaMaskOn.value = seaMask;
        maskSize.current = texture.image.width;
        requestSceneFrame();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        console.warn("layline: water mask unavailable, keeping the near-sea clip", error);
      });
    return () => {
      live = false;
      abort.abort();
      const uniforms = sea.current as SeaUniforms;
      uniforms.uSeaMaskOn.value = 0;
      maskSize.current = 0;
      if (loaded !== null) {
        uniforms.uSeaMask.value = placeholderMask();
        loaded.dispose();
      }
    };
  }, [seaMask]);

  /* The camera the traversal measures screen-space error against. The lens and
   * the rigs both write the scene's one camera, so there is only ever this
   * one. */
  useEffect(() => {
    if (tiles === null) return;
    tiles.setCamera(camera);
    return () => {
      tiles.deleteCamera(camera);
    };
  }, [tiles, camera]);

  /* Priority 0: after the rigs (-60) have posed the camera for this frame and
   * before RenderGate draws it at 1, so the traversal and the picture agree. */
  useFrame(() => {
    if (tiles === null) return;
    camera.updateMatrixWorld();

    /* Settle-sharpening. A camera in motion throws away every tile it pulls a
     * frame later, so the traversal is relaxed while it moves and only asked
     * for the sharp target once it stops. Quiescence is read off the camera,
     * not off a timer: world position and look direction against the last
     * frame, both under threshold for SETTLE_FRAMES consecutive frames. */
    if (movingTarget > 0) {
      camera.getWorldDirection(look.current);
      const moved = camera.position.distanceTo(lastEye.current);
      const turned = look.current.angleTo(lastLook.current);
      lastEye.current.copy(camera.position);
      lastLook.current.copy(look.current);
      still.current =
        moved < SETTLE_MOVE && turned < SETTLE_TURN ? Math.min(still.current + 1, SETTLE_FRAMES) : 0;
      /* The governor owns the ceiling, settle-sharpening owns below it. */
      const asked = still.current >= SETTLE_FRAMES ? errorTarget : movingTarget;
      const wanted = Math.max(asked, tilesQuality.ceiling);
      if (tiles.errorTarget !== wanted) {
        tiles.errorTarget = wanted;
        /* Sharpening needs a frame to act on; the gate may otherwise be idle. */
        if (wanted <= asked) requestSceneFrame();
      }
    }

    /* The clip square, written from the same function the water's clipmap uses
     * so the two are the same square to the bit: a boundary the two worked out
     * separately would show as a seam of Google's teal along the water's edge.
     * The water sets its own position at priority -90, this runs at 0, so the
     * value read here is the one the water is drawn at this frame. */
    const [cx, cz] = seaCentre(camera.position.x, camera.position.z);
    (sea.current as SeaUniforms).uSeaCentre.value.set(cx, cz);
    /* A gated frame draws nothing, so traversing the tileset for it only
     * burns CPU and schedules downloads nobody sees. The wake doors below
     * dirty the gate whenever the tileset itself needs a frame, so skipping
     * here cannot starve streaming: the next wanted frame traverses. */
    if (!sceneGate.willRender) return;
    tiles.setResolutionFromRenderer(camera, gl);
    tiles.update();
  }, 0);

  /* Streaming has to reach a page that is not drawing. Two states need it: a
   * paused replay, where the gate only draws on a dirty flag, and a frozen
   * capture, where the loop is at "never" and only `requestSceneFrame` can
   * advance it. Both are exactly what the gate's wake door is for, and a tile
   * that lands without one would sit in memory unseen. */
  useEffect(() => {
    if (tiles === null) return;
    const wake = () => requestSceneFrame();
    for (const type of ["needs-render", "needs-update", "load-model", "tiles-load-end"]) {
      tiles.addEventListener(type as "needs-render", wake);
    }
    /* A tile that 404s is a hole in the picture, not a broken venue; only a
     * root tileset that never arrived (bad key, no network, quota) is a
     * failure the readiness contract has to report, and it is the one case
     * where `tiles.root` is still null when the error lands. */
    const onError = (event: { error?: unknown }) => {
      if (tiles.root != null) return;
      console.warn("venue tiles root failed to load", event.error);
      useReplay.getState().setVenueAsset("failed");
      requestSceneFrame();
    };
    tiles.addEventListener("load-error", onError as never);
    return () => {
      for (const type of ["needs-render", "needs-update", "load-model", "tiles-load-end"]) {
        tiles.removeEventListener(type as "needs-render", wake);
      }
      tiles.removeEventListener("load-error", onError as never);
    };
  }, [tiles]);

  /* Google requires the tileset's own attribution on screen wherever its data
   * is drawn. The strings arrive per tile and change as the view moves, so the
   * overlay is written imperatively from the frame hook below rather than held
   * in React state: a set-state per visibility change would re-render the
   * scene tree every time a tile came into view. */
  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.laylineTilesAttribution = "true";
    Object.assign(element.style, {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "2147483000",
      padding: "4px 8px",
      font: "11px/1.4 ui-sans-serif, system-ui, sans-serif",
      color: "rgba(255,255,255,0.92)",
      background: "rgba(0,0,0,0.45)",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    /* `__layline.ui(false)` bares the page by hiding every non-canvas element
     * for clean scenery captures. Attribution is not something a capture gets
     * to drop: Google's terms ask for it wherever the data is drawn, and an
     * inline important beats the bare stylesheet's. */
    element.style.setProperty("visibility", "visible", "important");
    document.body.appendChild(element);
    overlay.current = element;
    return () => {
      element.remove();
      overlay.current = null;
    };
  }, []);

  const probe = useCallback(
    (x: number, z: number, from = 2000): number | null => {
      if (tiles === null) return null;
      const caster = new Raycaster();
      caster.set(new Vector3(x, from, z), new Vector3(0, -1, 0));
      caster.far = from + 4000;
      /* `tiles.raycast` visits the ACTIVE tile set, which is what is drawn.
       * (Measured equivalent to `intersectObject(tiles.group, true)` on this
       * tileset, because the renderer unparents a tile the moment it is
       * deactivated; the explicit call is still the one with the guarantee.) */
      const hits: { point: Vector3 }[] = [];
      loadState(tiles).raycast(caster, hits);
      if (hits.length === 0) return null;
      let best = hits[0].point.y;
      for (const hit of hits) best = Math.max(best, hit.point.y);
      return best;
    },
    [tiles],
  );

  const readout = useCallback((): TilesReadout => {
    const state = tiles === null ? null : loadState(tiles);
    const stats = state?.stats;
    return {
      rootLoaded: tiles?.root != null,
      queued: stats?.queued ?? 0,
      downloading: stats?.downloading ?? 0,
      parsing: stats?.parsing ?? 0,
      loading: state?.isLoading === true,
      progress: tiles?.loadProgress ?? 0,
      visible: stats?.visible ?? 0,
      models: tiles === null ? 0 : tiles.group.children.length,
      attribution: attribution.current,
      seaLevelH: seaLevel,
      errorTarget,
      lit,
      seaClip: (sea.current as SeaUniforms).uSeaClip.value,
      seaDeep: (sea.current as SeaUniforms).uSeaDeep.value,
      seaFlat: (sea.current as SeaUniforms).uSeaFlat.value,
      seaReach: (sea.current as SeaUniforms).uSeaReach.value,
      seaCentre: [
        (sea.current as SeaUniforms).uSeaCentre.value.x,
        (sea.current as SeaUniforms).uSeaCentre.value.y,
      ],
      seaMask: (sea.current as SeaUniforms).uSeaMaskOn.value,
      seaMaskLoaded: maskSize.current > 0,
      seaMaskClip: (sea.current as SeaUniforms).uSeaMaskClip.value,
      seaMaskInset: (sea.current as SeaUniforms).uSeaMaskInset.value,
      seaMaskFeather: (sea.current as SeaUniforms).uSeaMaskFeather.value,
      seaMaskDither: (sea.current as SeaUniforms).uSeaMaskDither.value,
      seaMaskSteep: (sea.current as SeaUniforms).uSeaMaskSteep.value,
      seaMaskDeep: (sea.current as SeaUniforms).uSeaMaskDeep.value,
      seaMaskHalf: (sea.current as SeaUniforms).uSeaMaskHalf.value,
      seaMaskSize: maskSize.current,
      seaHaze: (sea.current as SeaUniforms).uSeaHaze.value,
      seaHazeRho: (sea.current as SeaUniforms).uSeaHazeRho.value,
      seaHazeStart: (sea.current as SeaUniforms).uSeaHazeStart.value,
      fadeMs,
      downloadJobs,
      parseJobs,
      nearFirst,
      lruMax,
      inCache: stats?.inCache ?? 0,
      movingTarget,
      liveTarget: tiles === null ? 0 : tiles.errorTarget,
      errorCeiling: tilesQuality.ceiling,
      settled: still.current >= SETTLE_FRAMES,
      sessionReused: reused.current,
      tier: tierName,
      tileNormals: { ...normals.current },
    };
  }, [tiles, seaLevel, errorTarget, lit, fadeMs, downloadJobs, parseJobs, nearFirst, lruMax, movingTarget, tierName]);

  const setErrorTarget = useCallback(
    (px: number) => {
      if (tiles === null) return;
      tiles.errorTarget = px;
      requestSceneFrame();
    },
    [tiles],
  );

  const setSeaClip = useCallback(
    (metres: number, deep?: number, flat?: number, reach?: number) => {
      const uniforms = sea.current as SeaUniforms;
      uniforms.uSeaClip.value = metres;
      if (deep !== undefined) uniforms.uSeaDeep.value = deep;
      if (flat !== undefined) uniforms.uSeaFlat.value = flat;
      if (reach !== undefined) uniforms.uSeaReach.value = reach;
      requestSceneFrame();
    },
    [],
  );

  const setSeaMask = useCallback(
    (
      amount: number,
      clip?: number,
      inset?: number,
      feather?: number,
      dither?: number,
      steep?: number,
      deep?: number,
    ) => {
      const uniforms = sea.current as SeaUniforms;
      /* Arming the mask before its texture has landed would read the 1 x 1 land
       * placeholder and mask nothing, which is a silent wrong answer in a
       * sweep, so the request is refused rather than half-honoured. */
      uniforms.uSeaMaskOn.value = maskSize.current > 0 ? amount : 0;
      if (clip !== undefined) uniforms.uSeaMaskClip.value = clip;
      if (inset !== undefined) uniforms.uSeaMaskInset.value = inset;
      if (feather !== undefined) uniforms.uSeaMaskFeather.value = feather;
      if (dither !== undefined) uniforms.uSeaMaskDither.value = dither;
      if (steep !== undefined) uniforms.uSeaMaskSteep.value = steep;
      if (deep !== undefined) uniforms.uSeaMaskDeep.value = deep;
      requestSceneFrame();
    },
    [],
  );

  const setSeaHaze = useCallback((amount: number, rho?: number, start?: number) => {
    const uniforms = sea.current as SeaUniforms;
    uniforms.uSeaHaze.value = amount;
    if (rho !== undefined) uniforms.uSeaHazeRho.value = rho;
    if (start !== undefined) uniforms.uSeaHazeStart.value = start;
    requestSceneFrame();
  }, []);

  const materials = useCallback((): Record<string, number> => {
    const counts: Record<string, number> = {};
    if (tiles === null) return counts;
    tiles.group.traverse((node) => {
      const material = (node as Mesh).material as Material | Material[] | undefined;
      if (material === undefined || Array.isArray(material)) return;
      counts[material.type] = (counts[material.type] ?? 0) + 1;
    });
    return counts;
  }, [tiles]);

  const error = useCallback(() => {
    const target = tiles === null ? 0 : loadState(tiles).errorTarget;
    const empty = { target, n: 0, median: 0, p90: 0, max: 0, nearest: 0, exhausted: 0 };
    if (tiles === null) return empty;
    const state = loadState(tiles);
    const reading: TileViewError = { inView: false, error: 0, distanceFromCamera: 0 };
    const errors: number[] = [];
    let nearest = Infinity;
    for (const tile of state.visibleTiles) {
      state.calculateTileViewError(tile, reading);
      if (!reading.inView) continue;
      errors.push(reading.error);
      nearest = Math.min(nearest, reading.distanceFromCamera);
    }
    if (errors.length === 0) return empty;
    errors.sort((a, b) => a - b);
    const at = (p: number) => Number(errors[Math.floor((errors.length - 1) * p)].toFixed(2));
    return {
      target,
      n: errors.length,
      median: at(0.5),
      p90: at(0.9),
      max: at(1),
      nearest: Number(nearest.toFixed(2)),
      /* Tiles the traversal wanted to refine and could not, because they have
       * no children left: the leaves of Google's own ladder. */
      exhausted: errors.filter((value) => value > target).length,
    };
  }, [tiles]);

  /* Where the tileset's horizontal surface area sits, in world height. The
   * measurement behind `TILE_WATER_BAND`: a flattened sea is a few enormous
   * horizontal triangles all at one height, which no real ground ever is. */
  const surfaces = useCallback(
    (options: { bin?: number; up?: number; stride?: number; above?: number } = {}) => {
      const bin = options.bin ?? 0.5;
      const up = options.up ?? 0.999;
      const stride = options.stride ?? 1;
      const above = options.above ?? SEA_CLIP;
      const bands = new Map<number, { area: number; n: number }>();
      const over = new Map<string, { x: number; z: number; area: number; minY: number; maxY: number; overSea: number }>();
      let overArea = 0;
      let triangles = 0;
      let counted = 0;
      if (tiles !== null) {
        const a = new Vector3();
        const b = new Vector3();
        const c = new Vector3();
        const ab = new Vector3();
        const ac = new Vector3();
        const cross = new Vector3();
        tiles.group.traverse((node) => {
          const mesh = node as Mesh;
          const geometry = mesh.geometry;
          if (geometry?.attributes?.position === undefined) return;
          const position = geometry.attributes.position;
          const index = geometry.index;
          const faces = (index === null ? position.count : index.count) / 3;
          for (let f = 0; f < faces; f += stride) {
            triangles += 1;
            const i0 = index === null ? f * 3 : index.getX(f * 3);
            const i1 = index === null ? f * 3 + 1 : index.getX(f * 3 + 1);
            const i2 = index === null ? f * 3 + 2 : index.getX(f * 3 + 2);
            a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
            c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
            ab.subVectors(b, a);
            ac.subVectors(c, a);
            cross.crossVectors(ab, ac);
            const twice = cross.length();
            if (twice === 0) continue;
            if (Math.abs(cross.y) / twice < up) continue;
            counted += 1;
            const midY = (a.y + b.y + c.y) / 3;
            const height = Math.floor(midY / bin) * bin;
            const cell = bands.get(height) ?? { area: 0, n: 0 };
            const area = twice / 2;
            cell.area += area;
            cell.n += 1;
            bands.set(height, cell);

            /* Level area standing clear of the sea by more than the clip: what
             * the sea clip cannot reach, and where. */
            const midX = (a.x + b.x + c.x) / 3;
            const midZ = (a.z + b.z + c.z) / 3;
            const seaY = -(midX * midX + midZ * midZ) / 12742017.6;
            if (midY - seaY <= above) continue;
            overArea += area;
            const key = `${Math.round(midX / 200)}:${Math.round(midZ / 200)}`;
            const patch = over.get(key) ?? {
              x: Math.round(midX / 200) * 200,
              z: Math.round(midZ / 200) * 200,
              area: 0,
              minY: Infinity,
              maxY: -Infinity,
              overSea: 0,
            };
            patch.area += area;
            patch.minY = Math.min(patch.minY, midY);
            patch.maxY = Math.max(patch.maxY, midY);
            patch.overSea = Math.max(patch.overSea, midY - seaY);
            over.set(key, patch);
          }
        });
      }
      const rows: [number, number, number][] = [...bands.entries()]
        .map(([height, cell]): [number, number, number] => [
          Number(height.toFixed(3)),
          Number(cell.area.toFixed(1)),
          cell.n,
        ])
        .sort((x, y) => y[1] - x[1]);
      const cells = [...over.values()]
        .sort((x, y) => y.area - x.area)
        .slice(0, 20)
        .map((patch) => ({
          x: patch.x,
          z: patch.z,
          area: Number(patch.area.toFixed(0)),
          minY: Number(patch.minY.toFixed(2)),
          maxY: Number(patch.maxY.toFixed(2)),
          overSea: Number(patch.overSea.toFixed(2)),
        }));
      return {
        triangles,
        counted,
        bin,
        up,
        bands: rows.slice(0, 40),
        overSea: { metres: above, area: Number(overArea.toFixed(0)), cells },
      };
    },
    [tiles],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__laylineTiles = {
      info: readout,
      probe,
      setErrorTarget,
      setSeaClip,
      setSeaMask,
      setSeaHaze,
      materials,
      error,
      surfaces,
    };
    return () => {
      delete window.__laylineTiles;
    };
  }, [
    readout,
    probe,
    setErrorTarget,
    setSeaClip,
    setSeaMask,
    setSeaHaze,
    materials,
    error,
    surfaces,
  ]);

  /* After the render (RenderGate draws at 1), so the readiness promotion below
   * describes a frame that is already on screen rather than one that is about
   * to be. */
  useFrame(() => {
    if (tiles === null) return;
    const state = loadState(tiles);
    const stats = state.stats;

    /* Readiness, stated honestly. `rendered` here means: a frame has been
     * drawn while the traversal had at least one tile marked visible, i.e.
     * SOME Google geometry is on screen. It does NOT mean the view has
     * finished refining; the tileset keeps replacing coarse tiles with sharper
     * ones for as long as the camera stands still, and a capture that wants
     * the refined picture has to wait for quiescence
     * (`__laylineTiles.info()`: queued + downloading + parsing === 0 and
     * loading === false). Promoting on the first drawn tile rather than on
     * quiescence is deliberate: quiescence is a property of a camera pose, not
     * of the page, so a `ready` that waited for it would go false again every
     * time the visitor moved. */
    if (!drawn.current && sceneGate.willRender && stats.visible > 0) {
      drawn.current = true;
      useReplay.getState().setVenueAsset("rendered");
      setVenueDrawnForMask(true);
    }

    /* A refining tileset owes the screen more frames. The gate stops drawing a
     * paused replay the moment nothing is dirty, which would freeze the view
     * at whatever coarse tile happened to be up. */
    if (stats.queued + stats.downloading + stats.parsing > 0 || state.isLoading) {
      requestSceneFrame();
    }

    const element = overlay.current;
    if (element === null) return;
    const parts: string[] = [];
    for (const entry of tiles.getAttributions()) {
      if (entry.type === "string" && entry.value !== "") parts.push(entry.value);
    }
    const text = parts.join(" | ");
    if (text !== attribution.current) {
      attribution.current = text;
      /* Google's own copyright string already leads the list the tileset
       * hands back; nothing is prefixed to it. */
      element.textContent = text;
    }
  }, 2);

  /* Same rule the baked venue follows: a venue that could not load puts the
   * procedural arc up, and readiness waits for THAT mesh's own drawn frame
   * (`failed` is not ready; the arc promotes it to `fallback`). */
  if (status === "failed" || status === "fallback") return <FallbackShore />;

  if (tiles === null) return null;
  return <primitive object={tiles.group} />;
}
