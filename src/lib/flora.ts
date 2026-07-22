/* ============================================================================
   L-101 — PLANTING PLAN geometry. Pure and SSR-safe: every coordinate comes
   from a seeded PRNG keyed to the project id, so server and client markup are
   byte-identical (no hydration mismatch possible).

   ROOT-FIRST RULE (hard requirement): every path d-string starts at its growth
   origin — the stem at finished grade, a leaf at its stem attachment, a petal
   at the bloom center. The dash reveal grows from the path start; a tip-first
   path would grow backwards and read broken.
   ========================================================================= */

import { mulberry32, hashString } from './prng';
import type { Project } from './projects';

/* The salt string is the art-direction knob: bump the version to re-roll a
   bad composition without touching any other code. */
const SALT = 'flowerbed-v2:';

export const VIEW_W = 360;
export const VIEW_H = 200;
/** Finished-grade datum — the concrete line every specimen grows from. */
export const GRADE_Y = 166;

/** One drawable stroke of a specimen, in draw order. */
export interface FloraStroke {
  /** Root-first path data (see header rule). */
  d: string;
  /** Stroke width, SVG units. */
  w: number;
  /** Order within the flower: stem 0, leaves 1–2, bloom 3+. */
  k: number;
}

export interface Specimen {
  id: string;
  /** Keynote tag, e.g. "04.1" — keys the flower to its schedule row. */
  key: string;
  /** Slot position on grade (plan-symbol center). */
  x: number;
  /** Static morphology flag from projects.ts (open bloom vs closed bud). */
  live: boolean;
  strokes: FloraStroke[];
  /** Bloom-center dot position (the only mark allowed to spend red). */
  dot: [number, number];
}

/** A 45° grade-hatch tick below the datum. */
export interface GradeTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Deterministic 2-decimal rounding — stable d-strings on both runtimes. */
const r2 = (v: number): number => Math.round(v * 100) / 100;

/* ---- bloom archetypes ------------------------------------------------------
   Four hand-drafted archetypes. Each returns petal paths rooted at the bloom
   center; `open` (live project) splays them, closed (repo-only) converges the
   SAME archetype to a bud tip — morphology never depends on runtime probes.

   v2: petals are CLOSED LOOPS (out one flank, back the other), not single
   rays — four lone strokes read as a pitchfork, a loop reads as a petal. */

/** One petal: a closed teardrop from the bloom center toward `aDeg`. */
function petalLoop(
  cx: number,
  cy: number,
  aDeg: number,
  len: number,
  wid: number,
): string {
  const a = (aDeg * Math.PI) / 180;
  const tx = cx + Math.cos(a) * len;
  const ty = cy + Math.sin(a) * len;
  const px = -Math.sin(a); // unit perpendicular
  const py = Math.cos(a);
  const bx = cx + Math.cos(a) * len * 0.48;
  const by = cy + Math.sin(a) * len * 0.48;
  return (
    `M${r2(cx)} ${r2(cy)}` +
    ` Q${r2(bx + px * wid)} ${r2(by + py * wid)} ${r2(tx)} ${r2(ty)}` +
    ` Q${r2(bx - px * wid)} ${r2(by - py * wid)} ${r2(cx)} ${r2(cy)}`
  );
}

/** Daisy — six petal loops fanned over the top; bud: three tight upward loops. */
function bloomDaisy(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const pl = 10 + rng() * 3;
  if (open) {
    return [-170, -138, -106, -74, -42, -10].map((a) =>
      petalLoop(cx, cy, a, pl, pl * 0.26),
    );
  }
  return [-112, -90, -68].map((a) => petalLoop(cx, cy, a, pl * 0.55, pl * 0.13));
}

/** Umbel — rays ending in floret loops; bud: rays pulled tight to the axis. */
function bloomUmbel(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const rl = 9 + rng() * 3;
  const spreads = open ? [-58, -29, 0, 29, 58] : [-15, -7.5, 0, 7.5, 15];
  const len = open ? rl : rl * 0.62;
  const fr = open ? 1.7 : 0.9; // floret loop radius at the ray tip
  return spreads.map((sp) => {
    const a = ((-90 + sp) * Math.PI) / 180;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    return `M${r2(cx)} ${r2(cy)} L${r2(ex)} ${r2(ey)} a${fr} ${fr} 0 1 1 0.05 0`;
  });
}

/** Spike / raceme — small alternating floret loops up the top of the stem. */
function bloomSpike(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  open: boolean,
): string[] {
  const steps = open ? 6 : 5;
  const len = open ? 4.6 : 2.6;
  const wid = open ? 1.5 : 0.8;
  const paths: string[] = [];
  for (let n = 0; n <= steps; n++) {
    const px = sx + ((tx - sx) * n) / steps;
    const py = sy + ((ty - sy) * n) / steps;
    const side = n % 2 === 0 ? 1 : -1;
    // Florets angle upward as they climb; the crown floret points straight up.
    const a = n === steps ? -90 : -90 + side * (open ? 62 : 30);
    paths.push(petalLoop(px, py, a, len * (1 - n / (steps * 3.2)), wid));
  }
  return paths;
}

/** Tulip — three broad petal loops cupped upward; bud: one loop + a midrib. */
function bloomTulip(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const pl = 11 + rng() * 3;
  if (open) {
    return [
      petalLoop(cx, cy, -128, pl * 0.92, pl * 0.3),
      petalLoop(cx, cy, -90, pl * 1.05, pl * 0.32),
      petalLoop(cx, cy, -52, pl * 0.92, pl * 0.3),
    ];
  }
  const bud = pl * 0.7;
  return [
    petalLoop(cx, cy, -90, bud, bud * 0.26),
    `M${r2(cx)} ${r2(cy)} L${r2(cx)} ${r2(cy - bud)}`,
  ];
}

/* ---- the bed --------------------------------------------------------------- */

/** One specimen per project, slotted left→right in schedule order. */
export function buildBed(projects: Project[]): Specimen[] {
  const n = projects.length;
  return projects.map((p, i) => {
    const rng = mulberry32(hashString(SALT + p.id));
    const x = 24 + i * (312 / Math.max(1, n - 1)) + (rng() - 0.5) * 7;
    // Tamer height band than v1 (42..104 made neighbours read as weeds).
    const h = 54 + rng() * 40;
    const lean = (((rng() - 0.5) * 9) * Math.PI) / 180;
    const arch = Math.floor(rng() * 4);
    const dx = Math.tan(lean) * h;
    const tx = x + dx;
    const ty = GRADE_Y - h;

    const strokes: FloraStroke[] = [];

    // Stem — grade upward, the drafter's first construction line.
    strokes.push({
      d: `M${r2(x)} ${r2(GRADE_Y)} C${r2(x + dx * 0.15)} ${r2(GRADE_Y - h * 0.38)}, ${r2(x + dx * 0.6)} ${r2(GRADE_Y - h * 0.72)}, ${r2(tx)} ${r2(ty)}`,
      w: 1.1,
      k: 0,
    });

    // 1–2 leaves at 35% / 60% stem height, alternating sides.
    const leafCount = 1 + Math.floor(rng() * 2);
    const side0 = rng() < 0.5 ? 1 : -1;
    for (let l = 0; l < leafCount; l++) {
      const t = l === 0 ? 0.35 : 0.6;
      const side = side0 * (l === 0 ? 1 : -1);
      const len = 8 + rng() * 6;
      const ax = x + dx * t;
      const ay = GRADE_Y - h * t;
      strokes.push({
        d: `M${r2(ax)} ${r2(ay)} q${r2(side * len * 0.55)} ${r2(-len * 0.4)} ${r2(side * len)} ${r2(-len * 0.12)}`,
        w: 0.9,
        k: 1 + l,
      });
    }

    // Bloom — open for live projects, closed bud for repo-only.
    let petals: string[];
    if (arch === 0) petals = bloomDaisy(rng, tx, ty, p.live);
    else if (arch === 1) petals = bloomUmbel(rng, tx, ty, p.live);
    else if (arch === 2) petals = bloomSpike(x + dx * 0.7, GRADE_Y - h * 0.7, tx, ty, p.live);
    else petals = bloomTulip(rng, tx, ty, p.live);
    petals.forEach((d, pi) => strokes.push({ d, w: pi === 0 && arch === 2 ? 1.0 : 0.95, k: 3 + pi }));

    return {
      id: p.id,
      key: `04.${i + 1}`,
      x,
      live: p.live,
      strokes,
      dot: [tx, ty] as [number, number],
    };
  });
}

/** ~14 seeded 45° hatch ticks below the finished-grade datum. */
export function buildTicks(): GradeTick[] {
  const rng = mulberry32(hashString(SALT + 'grade'));
  const ticks: GradeTick[] = [];
  for (let i = 0; i < 14; i++) {
    const x = 14 + rng() * 332;
    ticks.push({ x1: r2(x), y1: 171, x2: r2(x - 5.5), y2: 176.5 });
  }
  return ticks;
}
