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

/* The salt string is the art-direction knob: bump to 'flowerbed-v2:' to
   re-roll a bad composition without touching any other code. */
const SALT = 'flowerbed:';

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
   SAME archetype to a bud tip — morphology never depends on runtime probes. */

function bloomSpline(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const pl = 9 + rng() * 4;
  if (open) {
    return [-64, -24, 24, 64].map((sp) => {
      const a = ((-90 + sp) * Math.PI) / 180;
      const qa = ((-90 + sp * 1.6) * Math.PI) / 180;
      const ex = cx + Math.cos(a) * pl;
      const ey = cy + Math.sin(a) * pl;
      const qx = cx + Math.cos(qa) * pl * 0.62;
      const qy = cy + Math.sin(qa) * pl * 0.62;
      return `M${r2(cx)} ${r2(cy)} Q${r2(qx)} ${r2(qy)} ${r2(ex)} ${r2(ey)}`;
    });
  }
  const bud = pl * 0.78;
  return [-9, -3, 3, 9].map(
    (sp) =>
      `M${r2(cx)} ${r2(cy)} Q${r2(cx + sp * 0.45)} ${r2(cy - bud * 0.55)} ${r2(cx)} ${r2(cy - bud)}`,
  );
}

function bloomUmbel(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const rl = 8 + rng() * 4;
  const spreads = open ? [-52, -18, 18, 52] : [-13, -4.5, 4.5, 13];
  const len = open ? rl : rl * 0.7;
  const fr = open ? 1.5 : 0.9; // floret loop radius at the ray tip
  return spreads.map((sp) => {
    const a = ((-90 + sp) * Math.PI) / 180;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    return `M${r2(cx)} ${r2(cy)} L${r2(ex)} ${r2(ey)} a${fr} ${fr} 0 1 1 0.05 0`;
  });
}

/** One zigzag stroke of florets riding the top 30% of the stem. */
function bloomSpike(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  open: boolean,
): string[] {
  const steps = 6;
  const amp = open ? 4.2 : 2.3;
  let d = `M${r2(sx)} ${r2(sy)}`;
  for (let n = 1; n <= steps; n++) {
    const px = sx + ((tx - sx) * n) / steps;
    const py = sy + ((ty - sy) * n) / steps;
    const mx = sx + ((tx - sx) * (n - 0.5)) / steps;
    const my = sy + ((ty - sy) * (n - 0.5)) / steps;
    const side = n % 2 === 0 ? 1 : -1;
    d += ` Q${r2(mx + side * amp)} ${r2(my)} ${r2(px)} ${r2(py)}`;
  }
  return [d];
}

function bloomTri(rng: () => number, cx: number, cy: number, open: boolean): string[] {
  const pl = 10 + rng() * 4;
  if (open) {
    return [
      `M${r2(cx)} ${r2(cy)} C${r2(cx - pl * 0.55)} ${r2(cy - pl * 0.15)}, ${r2(cx - pl * 0.75)} ${r2(cy - pl * 0.7)}, ${r2(cx - pl * 0.35)} ${r2(cy - pl)}`,
      `M${r2(cx)} ${r2(cy)} Q${r2(cx)} ${r2(cy - pl * 0.6)} ${r2(cx)} ${r2(cy - pl * 1.08)}`,
      `M${r2(cx)} ${r2(cy)} C${r2(cx + pl * 0.55)} ${r2(cy - pl * 0.15)}, ${r2(cx + pl * 0.75)} ${r2(cy - pl * 0.7)}, ${r2(cx + pl * 0.35)} ${r2(cy - pl)}`,
    ];
  }
  const bud = pl * 0.8;
  return [
    `M${r2(cx)} ${r2(cy)} Q${r2(cx - bud * 0.38)} ${r2(cy - bud * 0.5)} ${r2(cx)} ${r2(cy - bud)}`,
    `M${r2(cx)} ${r2(cy)} L${r2(cx)} ${r2(cy - bud)}`,
    `M${r2(cx)} ${r2(cy)} Q${r2(cx + bud * 0.38)} ${r2(cy - bud * 0.5)} ${r2(cx)} ${r2(cy - bud)}`,
  ];
}

/* ---- the bed --------------------------------------------------------------- */

/** One specimen per project, slotted left→right in schedule order. */
export function buildBed(projects: Project[]): Specimen[] {
  const n = projects.length;
  return projects.map((p, i) => {
    const rng = mulberry32(hashString(SALT + p.id));
    const x = 24 + i * (312 / Math.max(1, n - 1)) + (rng() - 0.5) * 7;
    const h = 42 + rng() * 62;
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
    if (arch === 0) petals = bloomSpline(rng, tx, ty, p.live);
    else if (arch === 1) petals = bloomUmbel(rng, tx, ty, p.live);
    else if (arch === 2) petals = bloomSpike(x + dx * 0.7, GRADE_Y - h * 0.7, tx, ty, p.live);
    else petals = bloomTri(rng, tx, ty, p.live);
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
