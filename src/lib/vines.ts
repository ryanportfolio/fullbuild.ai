/* ============================================================================
   L-101 — OVERGROWTH geometry. Pure + deterministic, no three.js import
   (plain number tuples, same discipline as pour/frame.ts). Twelve vines —
   one per schedule entry — climb the SAME Frame the pour builds: a helix
   wrapped around a real column (radius derived from that member's thickness),
   continuing along a rafter, an eave girt, or the ridge purlin; leaves bud
   off the stem behind the growth tip and a flower closes the path. Every
   scattered choice is mulberry32-seeded per project id — never Math.random().

   ROOT-FIRST RULE (inherited from the 2D plate): the stem polyline starts at
   grade and ends at the flower, so a tip-first reveal is a drawRange from 0.

   Flower semantics (the flora contract, unchanged): open bloom = live
   project, closed bud = repo-only — static morphology, never a runtime probe.
   The bloom-center dot is the ONLY mark allowed to spend red, and that
   ignition happens scene-side.
   ========================================================================= */

import { mulberry32, hashString } from './prng';
import type { Frame, Member, Vec3 } from './pour/frame';

/* Art-direction knob: bump to 'overgrowth-v2:' to re-roll a bad composition. */
const SALT = 'overgrowth:';

export interface Vine {
  projectId: string;
  href: string | null;
  live: boolean;
  /** Stem polyline, flat xyz, root-first. */
  points: number[];
  /** Leaf linework, flat xyz SEGMENT pairs, ordered by spawn param. */
  leafSegs: number[];
  /** Per-SEGMENT spawn param (0..1 of stem arc), ascending with leafSegs. */
  leafSpawn: number[];
  /** Flower anchor — the stem's end point. */
  center: Vec3;
  /** Petal linework, flat xyz segment pairs, LOCAL to center (group scales). */
  petalSegs: number[];
}

/** One helical pass along a member axis. */
interface Run {
  p0: Vec3;
  p1: Vec3;
  radius: number;
  turns: number;
}

// --- tuple maths ------------------------------------------------------------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0];
};
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const UP: Vec3 = [0, 1, 0];

/** Perpendicular basis (u, v) for a member axis direction. */
function axisBasis(d: Vec3): { u: Vec3; v: Vec3 } {
  let u = cross(d, UP);
  if (len(u) < 1e-4) u = cross(d, [1, 0, 0]);
  u = norm(u);
  return { u, v: norm(cross(d, u)) };
}

/**
 * Sample one helical run into pts/nrm (flat xyz). Skips s=0 when continuing
 * an existing polyline. Returns the phase advance of the run.
 */
function sampleRun(
  pts: number[],
  nrm: number[],
  run: Run,
  phase: number,
  hand: number,
): number {
  const axis = sub(run.p1, run.p0);
  const axisLen = len(axis);
  const d = norm(axis);
  const { u, v } = axisBasis(d);
  const sweep = hand * run.turns * Math.PI * 2;
  const n = Math.max(10, Math.ceil(run.turns * 16 + axisLen * 6));
  const from = pts.length === 0 ? 0 : 1;
  for (let i = from; i <= n; i++) {
    const s = i / n;
    const th = phase + sweep * s;
    const ox = u[0] * Math.cos(th) + v[0] * Math.sin(th);
    const oy = u[1] * Math.cos(th) + v[1] * Math.sin(th);
    const oz = u[2] * Math.cos(th) + v[2] * Math.sin(th);
    pts.push(
      run.p0[0] + axis[0] * s + ox * run.radius,
      run.p0[1] + axis[1] * s + oy * run.radius,
      run.p0[2] + axis[2] * s + oz * run.radius,
    );
    nrm.push(ox, oy, oz);
  }
  return sweep;
}

/** Drawn leaf: stalk + two-arc blade outline + midrib. Six segments. */
function pushLeaf(
  segs: number[],
  spawn: number[],
  t: number,
  p: Vec3,
  tangent: Vec3,
  normal: Vec3,
  rng: () => number,
  flip: number,
): void {
  const tan = norm(tangent);
  const b = norm(cross(tan, normal));
  // Tilt the leaf plane a little around the stem tangent — hand-set, not flat.
  const phi = (rng() - 0.5) * 1.1;
  const n2 = norm(add(mul(normal, Math.cos(phi)), mul(b, Math.sin(phi) * flip)));
  const b2 = norm(cross(tan, n2));
  const stalk = 0.06 + rng() * 0.04;
  const blade = 0.12 + rng() * 0.08;
  const q = add(p, mul(n2, stalk));
  const tip = add(q, add(mul(n2, blade), mul(tan, (rng() - 0.5) * 0.06)));
  const s1 = add(q, add(mul(n2, blade * 0.45), mul(b2, blade * 0.3)));
  const s2 = add(q, add(mul(n2, blade * 0.45), mul(b2, -blade * 0.3)));
  const rib = add(q, mul(n2, blade * 0.72));
  const pairs: [Vec3, Vec3][] = [
    [p, q], // stalk
    [q, s1],
    [s1, tip], // blade side 1
    [q, s2],
    [s2, tip], // blade side 2
    [q, rib], // midrib
  ];
  for (const [a, c] of pairs) {
    segs.push(a[0], a[1], a[2], c[0], c[1], c[2]);
    spawn.push(t);
  }
}

/** Petal fan local to the flower center; open splays, bud converges. */
function buildPetals(
  rng: () => number,
  outward: Vec3,
  tangent: Vec3,
  open: boolean,
): number[] {
  // Flower axis leans outward from the member and slightly up + along travel.
  const a = norm(add(add(outward, mul(UP, 0.65)), mul(norm(tangent), 0.2)));
  let b1 = cross(a, UP);
  if (len(b1) < 1e-4) b1 = cross(a, [1, 0, 0]);
  b1 = norm(b1);
  const b2 = norm(cross(a, b1));
  const petals = open ? 5 : 4;
  const L = open ? 0.24 + rng() * 0.08 : 0.14 + rng() * 0.05;
  const lat = open ? 0.9 : 0.16;
  const ax = open ? 0.7 : 1;
  const phase0 = rng() * Math.PI * 2;
  const segs: number[] = [];
  for (let k = 0; k < petals; k++) {
    const al = phase0 + (k * Math.PI * 2) / petals;
    const lateral = add(mul(b1, Math.cos(al)), mul(b2, Math.sin(al)));
    const dir = norm(add(mul(a, ax), mul(lateral, lat)));
    const ctrl = add(mul(dir, L * 0.55), mul(a, L * 0.18));
    const tip = mul(dir, L);
    // quadratic bezier 0 -> ctrl -> tip (petal roots at the bloom center)
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 1; i <= 4; i++) {
      const s = i / 4;
      const w1 = 2 * (1 - s) * s;
      const w2 = s * s;
      const x = ctrl[0] * w1 + tip[0] * w2;
      const y = ctrl[1] * w1 + tip[1] * w2;
      const z = ctrl[2] * w1 + tip[2] * w2;
      segs.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
  }
  return segs;
}

/**
 * Build the twelve vines for the given schedule entries against the erected
 * frame. Live projects climb their OWN bent; repo-only entries take a seeded
 * bent — twelve vines spread across the eight bents, all id-salted.
 */
export function buildVines(
  frame: Frame,
  projects: ReadonlyArray<{ id: string; href: string | null; live: boolean }>,
): Vine[] {
  if (frame.bays.length === 0) return [];
  const byId = new Map(frame.members.map((m) => [m.id, m]));
  const bayIndex = new Map(frame.bays.map((b, i) => [b.projectId, i]));
  const member = (id: string): Member | undefined => byId.get(id);

  return projects.map((p) => {
    const rng = mulberry32(hashString(SALT + p.id));
    const bent = bayIndex.has(p.id)
      ? (bayIndex.get(p.id) as number)
      : Math.floor(rng() * frame.bays.length);
    const bayId = frame.bays[bent].projectId;
    const side = rng() < 0.5 ? 0 : 1; // 0 = left column, 1 = right
    const sideSign = side === 0 ? -1 : 1;
    const col = member(`${bayId}:column:${side}`);
    const rafter = member(`${bayId}:rafter:${side + 2}`);

    const runs: Run[] = [];
    if (col) {
      runs.push({
        p0: col.p0,
        p1: col.p1,
        radius: col.thickness * (0.68 + rng() * 0.14),
        turns: 2.1 + rng() * 1.5,
      });
    }

    // Continuation route beyond the eave: rafter partway / eave girt /
    // rafter to the apex then along the ridge purlin.
    const route = rng();
    // Rafters are clad boxes: the coil sits just proud of the section.
    // Girts/purlins draw as single tick lines: the coil must wrap TIGHT
    // (small radius, turns per unit length) or it reads as a floating halo.
    const rafterRun = (frac: number): Run | null =>
      rafter
        ? {
            p0: rafter.p0,
            p1: lerp3(rafter.p0, rafter.p1, frac),
            radius: rafter.thickness * (0.62 + rng() * 0.14),
            turns: (0.9 + rng() * 0.9) * frac,
          }
        : null;
    const tickRun = (p0: Vec3, p1: Vec3, thickness: number): Run => {
      const l = len(sub(p1, p0));
      return {
        p0,
        p1,
        radius: thickness * (0.42 + rng() * 0.12),
        turns: l * (1.6 + rng() * 0.8),
      };
    };

    if (route < 0.5 && col && rafter) {
      const run = rafterRun(0.55 + rng() * 0.45);
      if (run) runs.push(run);
    } else if (route < 0.78 && col) {
      // Eave girt: forward run (this bent -> next) if it exists, else the
      // backward one, traversed away from our bent. Axis starts at the REAL
      // column top so the stem stays continuous under the eave jitter.
      const fwd = member(`girt:${sideSign}:${bent + 1}`);
      const back = member(`girt:${sideSign}:${bent}`);
      const girt = fwd ?? back;
      if (girt) {
        const far = fwd ? girt.p1 : back ? back.p0 : girt.p1;
        const frac = 0.4 + rng() * 0.5;
        runs.push(tickRun(col.p1, lerp3(col.p1, far, frac), girt.thickness));
      } else {
        const run = rafterRun(0.55 + rng() * 0.45);
        if (run) runs.push(run);
      }
    } else if (col && rafter) {
      // Full rafter, then partway along the ridge purlin.
      const run = rafterRun(1);
      if (run) runs.push(run);
      const fwd = member(`purlin:ridge:${bent + 1}`);
      const back = member(`purlin:ridge:${bent}`);
      const purlin = fwd ?? back;
      if (purlin) {
        const near = fwd ? purlin.p0 : purlin.p1;
        const far = fwd ? purlin.p1 : purlin.p0;
        const frac = 0.3 + rng() * 0.45;
        runs.push(tickRun(near, lerp3(near, far, frac), purlin.thickness));
      }
    }

    // --- sample the helix runs into one root-first polyline ----------------
    const points: number[] = [];
    const normals: number[] = [];
    let phase = rng() * Math.PI * 2;
    const hand = rng() < 0.5 ? 1 : -1;
    for (const run of runs) phase += sampleRun(points, normals, run, phase, hand);

    // Cumulative arc param per point.
    const count = points.length / 3;
    const arcT = new Array<number>(count).fill(0);
    let total = 0;
    for (let j = 1; j < count; j++) {
      const dx = points[j * 3] - points[(j - 1) * 3];
      const dy = points[j * 3 + 1] - points[(j - 1) * 3 + 1];
      const dz = points[j * 3 + 2] - points[(j - 1) * 3 + 2];
      total += Math.hypot(dx, dy, dz);
      arcT[j] = total;
    }
    if (total > 0) for (let j = 0; j < count; j++) arcT[j] /= total;

    // --- leaves: bud off the stem at seeded arc intervals ------------------
    const leafSegs: number[] = [];
    const leafSpawn: number[] = [];
    let acc = 0;
    let nextAt = 0.5 + rng() * 0.3;
    let flip = rng() < 0.5 ? 1 : -1;
    for (let j = 1; j < count - 1; j++) {
      const dx = points[j * 3] - points[(j - 1) * 3];
      const dy = points[j * 3 + 1] - points[(j - 1) * 3 + 1];
      const dz = points[j * 3 + 2] - points[(j - 1) * 3 + 2];
      acc += Math.hypot(dx, dy, dz);
      if (acc < nextAt) continue;
      acc = 0;
      nextAt = 0.38 + rng() * 0.34;
      if (arcT[j] > 0.9) break; // leave the last reach for the flower
      const pnt: Vec3 = [points[j * 3], points[j * 3 + 1], points[j * 3 + 2]];
      const tangent: Vec3 = [
        points[(j + 1) * 3] - points[(j - 1) * 3],
        points[(j + 1) * 3 + 1] - points[(j - 1) * 3 + 1],
        points[(j + 1) * 3 + 2] - points[(j - 1) * 3 + 2],
      ];
      const nrm: Vec3 = [normals[j * 3], normals[j * 3 + 1], normals[j * 3 + 2]];
      pushLeaf(leafSegs, leafSpawn, arcT[j], pnt, tangent, nrm, rng, flip);
      flip = -flip;
    }

    // --- flower at the stem's end ------------------------------------------
    const last = count - 1;
    const center: Vec3 = [
      points[last * 3],
      points[last * 3 + 1],
      points[last * 3 + 2],
    ];
    const endTangent: Vec3 =
      count > 1
        ? [
            points[last * 3] - points[(last - 1) * 3],
            points[last * 3 + 1] - points[(last - 1) * 3 + 1],
            points[last * 3 + 2] - points[(last - 1) * 3 + 2],
          ]
        : [0, 1, 0];
    const endNormal: Vec3 = [
      normals[last * 3],
      normals[last * 3 + 1],
      normals[last * 3 + 2],
    ];
    const petalSegs = buildPetals(rng, endNormal, endTangent, p.live);

    return {
      projectId: p.id,
      href: p.href,
      live: p.live,
      points,
      leafSegs,
      leafSpawn,
      center,
      petalSegs,
    };
  });
}
