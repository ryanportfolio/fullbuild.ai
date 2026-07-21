/* ============================================================================
   THE POCHÉ LINE — portal-frame geometry, pure + deterministic.

   Builds one real portal/gable bay per LIVE project. Primary members (columns,
   rafters, brace) sit on a deterministic grid; ONLY secondary fabrication marks
   (member lean, tie count + positions, thickness jitter) are seeded, via
   mulberry32(hashString(project.id)) from '@/lib/prng'. Never Math.random().

   No three.js import here: members are plain number tuples so this stays
   SSR-safe, testable, and cheap. Scene.tsx lifts them into R3 geometry.
   ========================================================================= */

import { mulberry32, hashString } from '@/lib/prng';

export type Vec3 = [number, number, number];

export type MemberRole = 'column' | 'rafter' | 'brace' | 'tie';

export interface Member {
  id: string;
  p0: Vec3;
  p1: Vec3;
  /** Cross-section side of the swept box tube. */
  thickness: number;
  role: MemberRole;
  /** Authored erection order — global, monotonic. Drives the POUR stagger. */
  order: number;
  /**
   * Erection position normalised to 0..1 across the CLAD (structural) sequence,
   * so cladding spreads over the whole pour travel instead of being crushed into
   * the first fraction. Ties (linework only) clamp at 1 and simply get consumed
   * near the end rather than dominating the normalisation.
   */
  stagger: number;
  /** Clad members gain concrete + a section cap; ties are drawn linework only. */
  clad: boolean;
}

export interface Bay {
  projectId: string;
  href: string;
  /** Ridge / keystone node — where the health-gated revision diamond sits. */
  apex: Vec3;
  /** Highest erection order among this bay's roof members (ignite gate). */
  ridgeOrder: number;
  /** ridgeOrder normalised like Member.stagger — drives the ignition timing. */
  ridgeStagger: number;
}

export interface Frame {
  members: Member[];
  bays: Bay[];
  /** Lowest y across the frame (pour start). */
  baseY: number;
  /** Highest ridge y across the frame (pour target). */
  apexY: number;
  /** Max erection order among CLAD members (normalises the stagger). */
  maxCladOrder: number;
  bounds: { min: Vec3; max: Vec3; center: Vec3; size: Vec3 };
}

// --- deterministic grid constants (NOT seeded) ------------------------------
// Bents (portal frames) repeat along +z — the true anatomy of a framed shed:
// one building, N identical bents receding in depth, erected front to back.
const BAY_WIDTH = 2.4; // column-to-column span (x)
const BAY_PITCH = 2.2; // bent-to-bent spacing along +z
const EAVE_H = 2.4; // column top height
const RIDGE_RISE = 0.7; // ridge above eave
const THICK = 0.21; // nominal member cross-section
const ORDER_STRIDE = 12; // order slots reserved per bent (front bents erect first)

interface Seed {
  (): number;
}

function jitter(rng: Seed, amp: number): number {
  return (rng() - 0.5) * 2 * amp;
}

/**
 * Build the frame for the given live projects. N === projects.length; the
 * geometry degrades cleanly to a single portal at N=1 and tiles for many.
 */
export function buildFrame(
  projects: ReadonlyArray<{ id: string; href: string | null }>,
): Frame {
  const members: Member[] = [];
  const bays: Bay[] = [];

  projects.forEach((project, bay) => {
    const rng = mulberry32(hashString(project.id));
    const base = bay * ORDER_STRIDE;
    const bz = -bay * BAY_PITCH; // bent origin along -z (recedes into depth)

    // Seeded secondary fabrication marks — lean, eave jitter, ridge offset.
    const leanL = jitter(rng, 0.1);
    const leanR = jitter(rng, 0.1);
    const eaveJitL = jitter(rng, 0.08);
    const eaveJitR = jitter(rng, 0.08);
    const ridgeXOff = jitter(rng, 0.12);
    const riseJit = jitter(rng, 0.12);
    const tOf = () => THICK + jitter(rng, 0.02);

    const L0: Vec3 = [-BAY_WIDTH / 2, 0, bz];
    const R0: Vec3 = [BAY_WIDTH / 2, 0, bz];
    const EL: Vec3 = [L0[0] + leanL, EAVE_H + eaveJitL, bz];
    const ER: Vec3 = [R0[0] + leanR, EAVE_H + eaveJitR, bz];
    const A: Vec3 = [
      (EL[0] + ER[0]) / 2 + ridgeXOff,
      EAVE_H + RIDGE_RISE + riseJit,
      bz,
    ];

    const push = (
      role: MemberRole,
      p0: Vec3,
      p1: Vec3,
      localOrder: number,
      clad: boolean,
    ) => {
      members.push({
        id: `${project.id}:${role}:${localOrder}`,
        p0,
        p1,
        thickness: tOf(),
        role,
        order: base + localOrder,
        stagger: 0, // filled in the normalisation pass below
        clad,
      });
    };

    // Authored erection order: columns -> rafters -> brace -> ties.
    push('column', L0, EL, 0, true);
    push('column', R0, ER, 1, true);
    push('rafter', EL, A, 2, true);
    push('rafter', ER, A, 3, true);
    push('brace', L0, ER, 4, true); // triangulating diagonal
    const ridgeOrder = base + 3; // latest roof member to reach the ridge

    // Seeded tie ticks — real fabrication marks, drawn linework only.
    const tieCount = 2 + Math.floor(rng() * 2); // 2..3
    for (let i = 0; i < tieCount; i++) {
      const f = 0.28 + ((i + 1) / (tieCount + 1)) * 0.5; // fraction up the column
      const half = BAY_WIDTH * 0.11;
      const yl = EL[1] * f;
      const yr = ER[1] * f;
      push(
        'tie',
        [L0[0] - half, yl, bz],
        [L0[0] + half, yl, bz],
        5 + i * 2,
        false,
      );
      push(
        'tie',
        [R0[0] - half, yr, bz],
        [R0[0] + half, yr, bz],
        6 + i * 2,
        false,
      );
    }

    bays.push({
      projectId: project.id,
      href: project.href ?? '',
      apex: A,
      ridgeOrder,
      ridgeStagger: 0, // filled below
    });
  });

  // --- longitudinal members: ridge purlin + eave girts ----------------------
  // What binds N bents into ONE building. Drawn linework (not clad): purlins
  // land after both bents they connect, so the pour consumes them last.
  for (let i = 1; i < bays.length; i++) {
    const a = bays[i - 1].apex;
    const b = bays[i].apex;
    members.push({
      id: `purlin:ridge:${i}`,
      p0: a,
      p1: b,
      thickness: THICK * 0.7,
      role: 'tie',
      order: i * ORDER_STRIDE + 9,
      stagger: 0,
      clad: false,
    });
    // eave girts, both sides — connect column tops of consecutive bents
    for (const side of [-1, 1] as const) {
      const x = (side * BAY_WIDTH) / 2;
      members.push({
        id: `girt:${side}:${i}`,
        p0: [x, EAVE_H, -(i - 1) * BAY_PITCH],
        p1: [x, EAVE_H, -i * BAY_PITCH],
        thickness: THICK * 0.7,
        role: 'tie',
        order: i * ORDER_STRIDE + 10,
        stagger: 0,
        clad: false,
      });
    }
  }

  // --- erection-stagger normalisation --------------------------------------
  // Normalise by the max CLAD order so the visible columns->rafters->brace
  // sequence fills the whole pour travel. Ties (order beyond the clad range)
  // clamp to 1 and get consumed near the end instead of compressing structure
  // into the first fraction of the pour (which left a dead tail).
  const maxCladOrder = members.reduce(
    (mx, m) => (m.clad ? Math.max(mx, m.order) : mx),
    1,
  );
  for (const m of members) m.stagger = Math.min(m.order / maxCladOrder, 1);
  for (const b of bays) b.ridgeStagger = Math.min(b.ridgeOrder / maxCladOrder, 1);

  // --- bounds + recentre so the frame is framed around x/z origin ----------
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: Vec3) => {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  };
  for (const m of members) {
    grow(m.p0);
    grow(m.p1);
  }
  if (members.length === 0) {
    // Empty-state safety — should not happen (fullbuild.ai is always live).
    min[0] = min[1] = min[2] = 0;
    max[0] = max[1] = max[2] = 1;
  }

  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const shift = (p: Vec3): Vec3 => [p[0] - cx, p[1], p[2] - cz];
  for (const m of members) {
    m.p0 = shift(m.p0);
    m.p1 = shift(m.p1);
  }
  for (const b of bays) b.apex = shift(b.apex);

  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const bounds = {
    min: [min[0] - cx, min[1], min[2] - cz] as Vec3,
    max: [max[0] - cx, max[1], max[2] - cz] as Vec3,
    center: [0, (min[1] + max[1]) / 2, 0] as Vec3,
    size,
  };

  return {
    members,
    bays,
    baseY: min[1],
    apexY: max[1],
    maxCladOrder,
    bounds,
  };
}
