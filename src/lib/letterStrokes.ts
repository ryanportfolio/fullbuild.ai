/* ============================================================================
   HAND-LETTERED INDEX — single-stroke drafting alphabet + name geometry.

   Every project title on the SHEET INDEX is lettered by hand: a one-stroke-per
   -pen-path alphabet (drafting-machine heritage), wobbled and jittered by a
   seeded noise field so the letterforms read as a drafter's hand, not a font.

   DETERMINISM CONTRACT: everything here is pure — hash noise keyed on
   (seed, site index), no Math.random, no Date. The server renders the exact
   same d-strings the client hydrates, so the fully-drawn lettering ships in
   the HTML (no-JS readers get the finished sheet) with zero hydration drift.

   Values in LETTERING were tuned in a live lab (.tmp lab, 2026-08-04) and
   ported 1:1 — keys match the lab's Copy Settings JSON.
   ========================================================================= */

export const LETTERING = {
  /** Cap height in svg user units (units render 1:1 px at intrinsic width). */
  LETTER_HEIGHT: 37,
  STROKE_WIDTH: 2.1,
  LETTER_SPACING: 6.5,
  /** Forward architect slant, degrees. */
  SLANT_DEG: 10,
  /** Per-point hand tremor, user units. */
  WOBBLE: 0.55,
  /** Per-letter placement drift, user units. */
  JITTER_POS: 2.1,
  /** Per-letter rotation drift, degrees. */
  JITTER_ROT: 1.5,
  /** Base seed for the noise field. */
  SEED: 5,
  /** Pen travel speed for letters, user units / second. */
  DRAW_SPEED: 420,
  /** Pen-up gap between consecutive strokes, ms. */
  PEN_LIFT_MS: 40,
  /** Extra beat after the stamp box before lettering starts, ms. */
  LETTER_PAUSE_MS: 60,
  /** Stagger between cards when the grid draws on, ms. */
  CARD_STAGGER_MS: 140,
  /** Second-pass overdraw ink alpha (0 disables the pass). */
  OVERDRAW_ALPHA: 0.35,
  /** Overdraw stroke offset, user units. */
  OVERDRAW_OFFSET: 0.8,
  /** Stamp box padding around the lettered name, user units. */
  BOX_PAD_X: 14,
  BOX_PAD_Y: 10,
  /** Box pen speed — the rectangle is ruled faster than letters are written. */
  BOX_SPEED: 900,
  /** Title-block reveal transition, ms (mirrored in index.module.css). */
  HOVER_REVEAL_MS: 180,
  /** Hovered ink weight = STROKE_WIDTH * boost (mirrored in CSS). */
  HOVER_INK_BOOST: 2.5,
  /** Hover boil: seed oscillation amplitude (seed units) + frequency (Hz). */
  HOVER_BOIL_AMP: 2,
  HOVER_BOIL_HZ: 0.4,
  /** No-pointer devices: each card holds the hovered state this long, ms. */
  AUTO_HOVER_DWELL_MS: 6000,
  /** P-01 only: the hand searches while it writes — the seed sweeps this
      range across the draw, then settles at PROTO_DRIFT_TO (lab v2 drift,
      kept off the grid cards by choice). */
  PROTO_DRIFT_FROM: 1,
  PROTO_DRIFT_TO: 99,
  /** Grid columns (mirrored in index.module.css). */
  GRID_COLS: 3,
} as const;

/* ---------------------------------------------------------------- alphabet
   10-unit cap height, y down, baseline y=10; lowercase x-height tops at 3,
   descenders reach 13. s = pen strokes in writing order. */
type Glyph = { w: number; s: number[][][] };

const G: Record<string, Glyph> = {
  A: { w: 8, s: [[[0, 10], [3.5, 0], [7, 10]], [[1.4, 6.2], [5.6, 6.2]]] },
  B: { w: 6.5, s: [[[0, 10], [0, 0], [4, 0], [5, 1], [5, 4], [4, 5], [0, 5]], [[4, 5], [5, 6], [5, 9], [4, 10], [0, 10]]] },
  C: { w: 7, s: [[[6, 1.5], [4.5, 0], [2, 0], [0.5, 1.5], [0, 3.5], [0, 6.5], [0.5, 8.5], [2, 10], [4.5, 10], [6, 8.5]]] },
  D: { w: 7, s: [[[0, 10], [0, 0], [3.5, 0], [5.5, 2], [6, 5], [5.5, 8], [3.5, 10], [0, 10]]] },
  E: { w: 6.5, s: [[[6, 0], [0, 0], [0, 10], [6, 10]], [[0, 5], [4.5, 5]]] },
  F: { w: 6, s: [[[6, 0], [0, 0], [0, 10]], [[0, 5], [4.5, 5]]] },
  G: { w: 7, s: [[[6, 1.5], [4.5, 0], [2, 0], [0.5, 1.5], [0, 3.5], [0, 6.5], [0.5, 8.5], [2, 10], [4.5, 10], [6, 8.5], [6, 6], [3.5, 6]]] },
  H: { w: 7, s: [[[0, 0], [0, 10]], [[6, 0], [6, 10]], [[0, 5], [6, 5]]] },
  I: { w: 2, s: [[[0.5, 0], [0.5, 10]]] },
  J: { w: 5, s: [[[4, 0], [4, 8], [3, 10], [1, 10], [0, 8.5]]] },
  K: { w: 6.5, s: [[[0, 0], [0, 10]], [[5.5, 0], [0, 5.5]], [[2, 3.9], [6, 10]]] },
  L: { w: 6, s: [[[0, 0], [0, 10], [5.5, 10]]] },
  M: { w: 9, s: [[[0, 10], [0, 0], [4, 9], [8, 0], [8, 10]]] },
  N: { w: 7, s: [[[0, 10], [0, 0], [6, 10], [6, 0]]] },
  O: { w: 7, s: [[[2, 0], [0.5, 1.5], [0, 3.5], [0, 6.5], [0.5, 8.5], [2, 10], [4, 10], [5.5, 8.5], [6, 6.5], [6, 3.5], [5.5, 1.5], [4, 0], [2, 0]]] },
  P: { w: 6.5, s: [[[0, 10], [0, 0], [4.5, 0], [5.5, 1], [5.5, 4], [4.5, 5], [0, 5]]] },
  Q: { w: 7, s: [[[2, 0], [0.5, 1.5], [0, 3.5], [0, 6.5], [0.5, 8.5], [2, 10], [4, 10], [5.5, 8.5], [6, 6.5], [6, 3.5], [5.5, 1.5], [4, 0], [2, 0]], [[4, 7.5], [6.5, 10.6]]] },
  R: { w: 7, s: [[[0, 10], [0, 0], [4.5, 0], [5.5, 1], [5.5, 4], [4.5, 5], [0, 5]], [[3, 5], [6, 10]]] },
  S: { w: 7, s: [[[6, 1.5], [4.5, 0], [1.5, 0], [0, 1.5], [0, 3.5], [1.5, 5], [4.5, 5], [6, 6.5], [6, 8.5], [4.5, 10], [1.5, 10], [0, 8.5]]] },
  T: { w: 7.5, s: [[[0, 0], [7, 0]], [[3.5, 0], [3.5, 10]]] },
  U: { w: 7, s: [[[0, 0], [0, 8], [1.5, 10], [4.5, 10], [6, 8], [6, 0]]] },
  V: { w: 7.5, s: [[[0, 0], [3.5, 10], [7, 0]]] },
  W: { w: 9.5, s: [[[0, 0], [2, 10], [4.5, 2], [7, 10], [9, 0]]] },
  X: { w: 6.5, s: [[[0, 0], [6, 10]], [[6, 0], [0, 10]]] },
  Y: { w: 7.5, s: [[[0, 0], [3.5, 5], [7, 0]], [[3.5, 5], [3.5, 10]]] },
  Z: { w: 6.5, s: [[[0, 0], [6, 0], [0, 10], [6, 10]]] },
  a: { w: 6, s: [[[5, 4], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 9]], [[5, 3], [5, 10]]] },
  b: { w: 6, s: [[[0, 0], [0, 10]], [[0, 4], [1.5, 3], [3.5, 3], [5, 4.5], [5, 8.5], [3.5, 10], [1.5, 10], [0, 9]]] },
  c: { w: 5.5, s: [[[5, 4], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 9]]] },
  d: { w: 6, s: [[[5, 0], [5, 10]], [[5, 4], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 9]]] },
  e: { w: 5.5, s: [[[0, 6.5], [5, 6.5], [5, 4.5], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [4.8, 9.2]]] },
  f: { w: 3.5, s: [[[3.2, 0.3], [2, 0], [1.2, 1], [1.2, 10]], [[0, 3], [3, 3]]] },
  g: { w: 6, s: [[[5, 4], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8], [1.5, 9.5], [3.5, 9.5], [5, 8]], [[5, 3], [5, 11], [4, 13], [1.5, 13], [0.3, 12]]] },
  h: { w: 6, s: [[[0, 0], [0, 10]], [[0, 4.5], [1.5, 3], [3.5, 3], [5, 4.5], [5, 10]]] },
  i: { w: 1.5, s: [[[0.5, 3], [0.5, 10]], [[0.5, 0.8], [0.5, 1.1]]] },
  j: { w: 3, s: [[[2, 3], [2, 11.5], [1, 13], [0, 12.3]], [[2, 0.8], [2, 1.1]]] },
  k: { w: 5.5, s: [[[0, 0], [0, 10]], [[4.5, 3], [0, 7]], [[1.8, 5.7], [5, 10]]] },
  l: { w: 1.5, s: [[[0.5, 0], [0.5, 10]]] },
  m: { w: 9, s: [[[0, 3], [0, 10]], [[0, 4.5], [1.2, 3], [2.8, 3], [4, 4.5], [4, 10]], [[4, 4.5], [5.2, 3], [6.8, 3], [8, 4.5], [8, 10]]] },
  n: { w: 6, s: [[[0, 3], [0, 10]], [[0, 4.5], [1.5, 3], [3.5, 3], [5, 4.5], [5, 10]]] },
  o: { w: 6, s: [[[1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 4.5], [3.5, 3], [1.5, 3]]] },
  p: { w: 6, s: [[[0, 3], [0, 13]], [[0, 4], [1.5, 3], [3.5, 3], [5, 4.5], [5, 8.5], [3.5, 10], [1.5, 10], [0, 9]]] },
  q: { w: 6, s: [[[5, 3], [5, 13]], [[5, 4], [3.5, 3], [1.5, 3], [0, 4.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 9]]] },
  r: { w: 4.5, s: [[[0, 3], [0, 10]], [[0, 4.8], [1.3, 3.3], [2.8, 3], [4, 3.4]]] },
  s: { w: 5.5, s: [[[4.5, 4], [3.2, 3], [1.3, 3], [0.2, 4], [0.2, 5.4], [1.3, 6.2], [3.4, 6.6], [4.6, 7.6], [4.6, 9], [3.4, 10], [1.3, 10], [0, 9]]] },
  t: { w: 4, s: [[[1.2, 0.5], [1.2, 8.8], [2, 10], [3.5, 9.5]], [[0, 3], [3.5, 3]]] },
  u: { w: 6, s: [[[0, 3], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5]], [[5, 3], [5, 10]]] },
  v: { w: 5.5, s: [[[0, 3], [2.5, 10], [5, 3]]] },
  w: { w: 7.5, s: [[[0, 3], [1.5, 10], [3.5, 4.5], [5.5, 10], [7, 3]]] },
  x: { w: 5, s: [[[0, 3], [4.5, 10]], [[4.5, 3], [0, 10]]] },
  y: { w: 5.5, s: [[[0, 3], [2.6, 9.7]], [[5, 3], [1.6, 13], [0.5, 12.5]]] },
  z: { w: 5, s: [[[0, 3], [4.5, 3], [0, 10], [4.5, 10]]] },
  '0': { w: 6, s: [[[1.5, 0], [0, 2], [0, 8], [1.5, 10], [3.5, 10], [5, 8], [5, 2], [3.5, 0], [1.5, 0]]] },
  '1': { w: 4, s: [[[0.6, 1.8], [2.4, 0], [2.4, 10]]] },
  '2': { w: 6, s: [[[0, 2], [1, 0.3], [3.5, 0], [5, 1.5], [5, 3], [0, 10], [5, 10]]] },
  '3': { w: 6, s: [[[0.3, 1], [2, 0], [4, 0], [5, 1.5], [5, 3.5], [3.5, 4.7], [2, 4.7]], [[3.5, 4.7], [5, 6], [5, 8.5], [3.7, 10], [1.5, 10], [0, 9]]] },
  '4': { w: 6, s: [[[4, 10], [4, 0], [0, 7], [5.5, 7]]] },
  '5': { w: 6, s: [[[4.8, 0], [0.6, 0], [0.3, 4.5], [2, 3.8], [3.6, 3.8], [5, 5], [5, 8.5], [3.6, 10], [1.3, 10], [0, 9]]] },
  '6': { w: 6, s: [[[4.6, 0.6], [3, 0], [1.6, 0.6], [0.3, 2.6], [0, 6], [0, 8], [1.4, 10], [3.4, 10], [4.8, 8.7], [4.8, 6.6], [3.5, 5.4], [1.5, 5.4], [0, 6.6]]] },
  '7': { w: 6, s: [[[0, 0], [5.5, 0], [1.8, 10]]] },
  '8': { w: 6, s: [[[1.6, 4.7], [0.4, 3.6], [0.4, 1.4], [1.7, 0], [3.3, 0], [4.6, 1.4], [4.6, 3.6], [3.4, 4.7], [1.6, 4.7], [0.3, 6], [0.3, 8.6], [1.7, 10], [3.3, 10], [4.7, 8.6], [4.7, 6], [3.4, 4.7]]] },
  '9': { w: 6, s: [[[4.7, 4.2], [3.4, 5.3], [1.4, 5.3], [0.2, 4.1], [0.2, 1.5], [1.4, 0.2], [3.4, 0.2], [4.7, 1.5], [4.7, 7], [3.4, 9.4], [1.8, 10]]] },
  '.': { w: 1.6, s: [[[0.5, 9.5], [0.6, 10]]] },
  '-': { w: 4.5, s: [[[0.3, 5.3], [3.8, 5.3]]] },
  ' ': { w: 4, s: [] },
};

/* -------------------------------------------------------------- seed noise
   Indexed hash noise, NOT a sequential RNG stream: value(seed, idx) is stable
   per draw-site, so a fractional seed lerps between integer seed states — the
   hover boil morphs smoothly instead of teleporting. */
function hashNoise(seed: number, idx: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(idx | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Fractional-seed noise in [-1, 1]. */
function noiseF(s: number, idx: number): number {
  const f = Math.floor(s);
  const fr = s - f;
  const a = hashNoise(f, idx);
  const b = hashNoise(f + 1, idx);
  return (a + (b - a) * fr) * 2 - 1;
}

type Pt = [number, number];

/** Split long segments so the wobble bends lines, not just their endpoints. */
function subdivide(stroke: Pt[], maxSeg: number): Pt[] {
  const out: Pt[] = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1];
    const [x1, y1] = stroke[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / maxSeg));
    for (let j = 1; j <= n; j++) out.push([x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n]);
  }
  return out;
}
function pathD(pts: Pt[]): string {
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
}

/* ------------------------------------------------------------ status icons
   One hand-drawn mark per project, replacing the abstract probe dot. Unit
   space 16x16, y down, same single-stroke discipline as the alphabet. The
   COLOR carries the probe semantic (revision-red = live, graphite = repo
   only) — the drawing carries what the thing IS. */
const INDEX_ICONS: Record<string, number[][][]> = {
  // cited page: sheet with a folded corner and reference lines
  truenote: [
    [[3, 1], [10, 1], [13, 4], [13, 15], [3, 15], [3, 1]],
    [[10, 1], [10, 4], [13, 4]],
    [[5.5, 9], [10.5, 9]],
    [[5.5, 11.5], [8.5, 11.5]],
  ],
  // video frame with a play wedge
  corewise: [
    [[1, 3], [15, 3], [15, 13], [1, 13], [1, 3]],
    [[6.5, 5.5], [10.5, 8], [6.5, 10.5], [6.5, 5.5]],
  ],
  // audit lens over the page edge
  willaicite: [
    [[13, 6], [11.8, 8.8], [9, 10], [6.2, 8.8], [5, 6], [6.2, 3.2], [9, 2], [11.8, 3.2], [13, 6]],
    [[6.3, 8.9], [2.5, 13.5]],
  ],
  // mortarboard + tassel
  'corewise-academy': [
    [[8, 2], [15, 5], [8, 8], [1, 5], [8, 2]],
    [[15, 5], [15, 9]],
    [[4.5, 6.5], [4.5, 10], [8, 12], [11.5, 10], [11.5, 6.5]],
  ],
  // price series on its axes
  kinefractal: [
    [[2, 2], [2, 14], [15, 14]],
    [[3.5, 11.5], [6, 8], [8, 10], [11, 5], [13.5, 6.5]],
  ],
  // a token, cut
  savetokens: [
    [[13.5, 8], [11.9, 11.9], [8, 13.5], [4.1, 11.9], [2.5, 8], [4.1, 4.1], [8, 2.5], [11.9, 4.1], [13.5, 8]],
    [[4, 12], [12, 4]],
  ],
  // microphone on its stand
  'whisper-ptt': [
    [[6.5, 2], [9.5, 2], [10, 3], [10, 7.5], [9.5, 9], [6.5, 9], [6, 7.5], [6, 3], [6.5, 2]],
    [[3.5, 7], [3.5, 8.5], [5.5, 10.5], [8, 11], [10.5, 10.5], [12.5, 8.5], [12.5, 7]],
    [[8, 11], [8, 14]],
    [[5.5, 14], [10.5, 14]],
  ],
  // running bond wall
  securewall: [
    [[1.5, 3], [14.5, 3], [14.5, 13], [1.5, 13], [1.5, 3]],
    [[1.5, 8], [14.5, 8]],
    [[8, 3], [8, 8]],
    [[4.75, 8], [4.75, 13]],
    [[11.25, 8], [11.25, 13]],
  ],
  // archive open, contents out
  zipflow: [
    [[2, 5], [2, 13], [14, 13], [14, 5]],
    [[8, 11], [8, 3]],
    [[5.5, 5.5], [8, 3], [10.5, 5.5]],
  ],
  // the chip the harness flashes
  'agent-firmware': [
    [[4, 4], [12, 4], [12, 12], [4, 12], [4, 4]],
    [[6, 4], [6, 1.5]],
    [[10, 4], [10, 1.5]],
    [[6, 12], [6, 14.5]],
    [[10, 12], [10, 14.5]],
    [[4, 6], [1.5, 6]],
    [[4, 10], [1.5, 10]],
    [[12, 6], [14.5, 6]],
    [[12, 10], [14.5, 10]],
  ],
  // gate passed: shield + check
  'agentic-audit': [
    [[8, 1.5], [14, 3.5], [14, 8], [11, 12.5], [8, 14.5], [5, 12.5], [2, 8], [2, 3.5], [8, 1.5]],
    [[5, 8], [7.2, 10.2], [11, 5.5]],
  ],
  // trace on the bench scope
  tracebench: [
    [[1.5, 3], [14.5, 3], [14.5, 13], [1.5, 13], [1.5, 3]],
    [[3, 8], [5, 8], [6, 4.5], [8, 11.5], [9.5, 6], [10.5, 8], [13, 8]],
  ],
  // the coil itself
  maimcoil: [
    [[8, 8], [10, 7], [10.5, 9.5], [8, 10.8], [5.5, 9.5], [5.2, 6.5], [8, 4.8], [11, 5.5], [12.5, 8.5], [11.5, 11.5], [8, 13], [4.5, 11.8], [2.8, 8.5], [3.5, 5], [6.5, 2.8], [10.5, 2.8], [13.5, 5]],
  ],
  // clamp brackets squeezing the read
  stk: [
    [[6, 2], [3, 2], [3, 14], [6, 14]],
    [[10, 2], [13, 2], [13, 14], [10, 14]],
    [[6.5, 8], [9.5, 8]],
  ],
  // the two laylines converging on the windward mark
  layline: [
    [[1.5, 14.5], [6.6, 5.2]],
    [[14.5, 14.5], [9.4, 5.2]],
    [[8, 1.2], [10, 3.2], [8, 5.2], [6, 3.2], [8, 1.2]],
  ],
  // the set's keystone
  'fullbuild-ai': [
    [[8, 2], [13, 8], [8, 14], [3, 8], [8, 2]],
  ],
};

export interface IconGeometry {
  viewBox: string;
  ds: string[];
}

/** The keystone mark alone — the legend's color-semantic sample. */
export function keystoneIcon(): IconGeometry {
  return buildIcon('fullbuild-ai', 999) as IconGeometry;
}

/** Hand-drawn status icon for a project card. Pure + deterministic. */
export function buildIcon(projectId: string, cardIdx: number): IconGeometry | null {
  const strokes = INDEX_ICONS[projectId];
  if (!strokes) return null;
  const K = LETTERING;
  const idx0 = cardIdx * 100000 + 95000;
  let n = 0;
  const ds = strokes.map((st) => {
    const sub = subdivide(st as Pt[], 2);
    return pathD(
      sub.map(([x, y]): Pt => {
        const wx = noiseF(K.SEED, idx0 + n * 2) * K.WOBBLE;
        const wy = noiseF(K.SEED, idx0 + n * 2 + 1) * K.WOBBLE;
        n++;
        return [x + wx, y + wy];
      }),
    );
  });
  return { viewBox: '-1.5 -1.5 19 19', ds };
}

export interface NameInk {
  boxD: string;
  strokeDs: string[];
  overDs: string[];
}
export interface NameGeometry {
  viewBox: string;
  /** Intrinsic size in user units (render 1:1 px, shrink via max-width). */
  width: number;
  height: number;
  strokeCount: number;
  /** d-strings at the base seed — what the server renders. */
  base: NameInk;
  /** Re-letter at any (fractional) seed — drives the hover boil. */
  at: (seed: number) => NameInk;
}

/** Build the full lettered-name geometry for one card. Pure + deterministic. */
export function buildName(name: string, cardIdx: number): NameGeometry {
  const K = LETTERING;
  const scale = K.LETTER_HEIGHT / 10;
  const slant = Math.tan((K.SLANT_DEG * Math.PI) / 180);
  const idx0 = cardIdx * 100000;

  interface BaseStroke { base: Pt[]; idxS: number }
  interface BaseLetter { strokes: BaseStroke[]; cx: number; cy: number; idxL: number }

  const letters: BaseLetter[] = [];
  let cursor = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  [...name].forEach((c, li) => {
    const g = G[c] ?? G[' '];
    const cx = cursor + (g.w * scale) / 2;
    const cy = 5 * scale;
    const strokes = g.s.map((st, si) => {
      const sub = subdivide(st as Pt[], 2.5);
      const base = sub.map(([ux, uy]): Pt => {
        let x = cursor + ux * scale;
        const y = uy * scale;
        x -= (y - 10 * scale) * slant;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        return [x, y];
      });
      return { base, idxS: idx0 + li * 997 + si * 89 };
    });
    letters.push({ strokes, cx, cy, idxL: idx0 + li * 997 });
    cursor += g.w * scale + K.LETTER_SPACING;
    if (!g.s.length) {
      minY = Math.min(minY, 3 * scale);
      maxY = Math.max(maxY, 10 * scale);
    }
  });
  const wordW = cursor - K.LETTER_SPACING;
  if (!Number.isFinite(minY)) {
    minY = 0;
    maxY = 10 * scale;
  }

  const bx0 = -K.BOX_PAD_X;
  const by0 = minY - K.BOX_PAD_Y;
  const bx1 = wordW + K.BOX_PAD_X;
  const by1 = maxY + K.BOX_PAD_Y;
  const boxBase: BaseStroke = {
    base: subdivide([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1], [bx0, by0]], 12),
    idxS: idx0 + 90000,
  };

  const at = (s: number): NameInk => {
    const strokeDs: string[] = [];
    const overDs: string[] = [];
    letters.forEach((l) => {
      const jx = noiseF(s, l.idxL + 1) * K.JITTER_POS;
      const jy = noiseF(s, l.idxL + 2) * K.JITTER_POS;
      const jr = (noiseF(s, l.idxL + 3) * K.JITTER_ROT * Math.PI) / 180;
      const cos = Math.cos(jr);
      const sin = Math.sin(jr);
      l.strokes.forEach((st) => {
        const pts = st.base.map(([x, y], pi): Pt => {
          const wx = noiseF(s, st.idxS + pi * 2) * K.WOBBLE;
          const wy = noiseF(s, st.idxS + pi * 2 + 1) * K.WOBBLE;
          const dx = x - l.cx;
          const dy = y - l.cy;
          return [l.cx + dx * cos - dy * sin + jx + wx, l.cy + dx * sin + dy * cos + jy + wy];
        });
        strokeDs.push(pathD(pts));
        if (K.OVERDRAW_ALPHA > 0) {
          const ox = noiseF(s, st.idxS + 7) * K.OVERDRAW_OFFSET;
          const oy = noiseF(s, st.idxS + 8) * K.OVERDRAW_OFFSET;
          overDs.push(pathD(pts.map(([x, y]): Pt => [x + ox, y + oy])));
        }
      });
    });
    const boxD = pathD(
      boxBase.base.map(([x, y], pi): Pt => [
        x + noiseF(s, boxBase.idxS + pi * 2) * K.WOBBLE,
        y + noiseF(s, boxBase.idxS + pi * 2 + 1) * K.WOBBLE,
      ]),
    );
    return { boxD, strokeDs, overDs };
  };

  const pad = K.STROKE_WIDTH * 2 + K.WOBBLE + K.JITTER_POS + 3;
  const vx = bx0 - pad;
  const vy = by0 - pad;
  const vw = bx1 - bx0 + 2 * pad;
  const vh = by1 - by0 + 2 * pad;

  return {
    viewBox: `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`,
    width: Math.round(vw),
    height: Math.round(vh),
    strokeCount: letters.reduce((n, l) => n + l.strokes.length, 0),
    base: at(K.SEED),
    at,
  };
}
