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
  /**
   * Foundation linework at grade — pad outlines under every column plus the
   * longitudinal setting-out line binding them. Flat xyz SEGMENT pairs, drawn
   * (never clad), revealed by the erection clock like the frame above it.
   */
  footingSegs: number[];
  /** Per-SEGMENT reveal param on the Member.stagger axis, ascending. */
  footingSpawn: number[];
  /**
   * Running dimension string at grade, outboard of the right-hand column line:
   * one station per bent, each with an extension line and a 45° tick, joined by
   * the dimension line itself. Flat xyz SEGMENT pairs. Deliberately NOT folded
   * into `bounds` — it rides the framing margin rather than shrinking the set
   * that is actually being drawn.
   */
  dimSegs: number[];
  /** Per-SEGMENT reveal param, 0..1 front bent to back, ascending. */
  dimSpawn: number[];
  /**
   * Revision cloud over the front bent's keystone — the last mark made on the
   * sheet before it is issued. Drawn in the front bent's own plane, so it reads
   * as an annotation on the elevation rather than a floating decal. No revision
   * delta beside it: a delta means the number it carries, this scene has no
   * typeface, and an empty triangle reads as noise next to the mark that does
   * carry meaning.
   */
  reviseSegs: number[];
  /** Per-SEGMENT reveal param, 0..1 around the cloud, ascending. */
  reviseSpawn: number[];
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
// Dimension string: how far outboard of the frame's own extents the line runs,
// how far its extension lines overshoot it, and the reach of a tick slash.
const DIM_OFFSET = 0.75;
const DIM_OVERSHOOT = 0.12;
const DIM_TICK = 0.11;
// Revision cloud: the marked region around the front keystone, the scallop
// chord walked around its perimeter, and the delta that flags it.
// Sized to enclose the whole keystone node and the heads of both rafters. A
// tighter cloud was legible on its own but not against the front bent, which by
// the time this mark lands carries the most-grown vine on the frame and the
// brightest of the lit diamonds.
const CLOUD_HALF_X = 0.66;
const CLOUD_HALF_Y = 0.5;
const CLOUD_RISE = 0.2; // cloud centre above the apex node (where the diamond sits)
const CLOUD_CHORD = 0.26;
const CLOUD_BULGE = 0.088;
const CLOUD_ARC_STEPS = 4;

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
  // What binds N bents into ONE building. Drawn linework (not clad): they reveal
  // as the pour front reaches their level and stay built — Scene clips non-clad
  // members below the cut, so a binder never floats above the structure.
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

  // --- foundations: pads at grade + the longitudinal setting-out line -------
  // Built AFTER the recentre shift so pad coordinates match the members that
  // stand on them. Each pad leads its own column slightly: the ground is set
  // out before the frame lands on it, which is what gives the axon a floor to
  // sit on instead of hanging in the paper.
  const FOOT_LEAD = 0.05;
  const PAD_HALF = THICK * 1.6;
  const columns = members.filter((m) => m.role === 'column');
  const footEntries: { spawn: number; segs: number[] }[] = [];
  for (let b = 0; b < bays.length; b++) {
    for (const side of [0, 1] as const) {
      const col = columns[b * 2 + side];
      if (!col) continue;
      const [x, , z] = col.p0;
      const spawn = Math.max(0, col.stagger - FOOT_LEAD);
      // Pad outline in plan, closed.
      const c0: Vec3 = [x - PAD_HALF, 0, z - PAD_HALF];
      const c1: Vec3 = [x + PAD_HALF, 0, z - PAD_HALF];
      const c2: Vec3 = [x + PAD_HALF, 0, z + PAD_HALF];
      const c3: Vec3 = [x - PAD_HALF, 0, z + PAD_HALF];
      footEntries.push({
        spawn,
        segs: [...c0, ...c1, ...c1, ...c2, ...c2, ...c3, ...c3, ...c0],
      });
      // Setting-out line back to the previous bent's pad on this side.
      const prev = columns[(b - 1) * 2 + side];
      if (b > 0 && prev) {
        footEntries.push({
          spawn,
          segs: [prev.p0[0], 0, prev.p0[2], x, 0, z],
        });
      }
    }
  }
  footEntries.sort((a, b) => a.spawn - b.spawn);
  const footingSegs: number[] = [];
  const footingSpawn: number[] = [];
  for (const entry of footEntries) {
    for (let i = 0; i < entry.segs.length; i += 6) {
      for (let k = 0; k < 6; k++) footingSegs.push(entry.segs[i + k]);
      footingSpawn.push(entry.spawn);
    }
  }

  // --- the running dimension string ----------------------------------------
  // A set gets dimensioned once it stands. This is the bent spacing, measured
  // along the building at grade and read off station by station from the front
  // bent back, which is the one drawing operation with as many beats in it as
  // there are bents — so it has something to say for the whole stretch after
  // the pour has topped out and only the planting is still moving.
  //
  // It stays OUT of `bounds` on purpose. Folding it in would widen the fit and
  // shrink the frame itself in its cell for the entire sheet, to make room for
  // an annotation that is only on the paper for part of it. FRAME_MARGIN already
  // leaves slack around the fitted extents; the string spends some of that.
  const dimX = max[0] - cx + DIM_OFFSET;
  const padOuterX = max[0] - cx + PAD_HALF;
  const dimSegs: number[] = [];
  const dimSpawn: number[] = [];
  const pushDim = (spawn: number, seg: number[]) => {
    for (const v of seg) dimSegs.push(v);
    dimSpawn.push(spawn);
  };
  for (let b = 0; b < bays.length; b++) {
    const z = bays[b].apex[2]; // already shifted
    const spawn = bays.length > 1 ? b / (bays.length - 1) : 0;
    // The run back to the previous station comes first, so the line reaches a
    // station before that station's own witness marks land on it.
    if (b > 0) {
      pushDim(spawn, [dimX, 0, bays[b - 1].apex[2], dimX, 0, z]);
    }
    // Extension line, overshooting the dimension line by convention.
    pushDim(spawn, [padOuterX, 0, z, dimX + DIM_OVERSHOOT, 0, z]);
    // 45° tick slash through the station, struck in the ground plane.
    pushDim(spawn, [
      dimX - DIM_TICK,
      0,
      z - DIM_TICK,
      dimX + DIM_TICK,
      0,
      z + DIM_TICK,
    ]);
  }

  // --- the revision cloud ---------------------------------------------------
  // Scalloped perimeter around the front bent's keystone. Built in that bent's
  // own x/y plane and walked in one continuous direction, so the reveal draws it
  // the way a hand would.
  const reviseSegs: number[] = [];
  const reviseSpawn: number[] = [];
  const front = bays[0];
  if (front) {
    const [ax, ay, az] = front.apex;
    const cy = ay + CLOUD_RISE;
    // Perimeter corners, walked anticlockwise from the lower left.
    const corners: [number, number][] = [
      [ax - CLOUD_HALF_X, cy - CLOUD_HALF_Y],
      [ax + CLOUD_HALF_X, cy - CLOUD_HALF_Y],
      [ax + CLOUD_HALF_X, cy + CLOUD_HALF_Y],
      [ax - CLOUD_HALF_X, cy + CLOUD_HALF_Y],
    ];
    // Walk the whole perimeter first to know its length, so scallop spawns can
    // be a true fraction of the trip round.
    const edges = corners.map((c, i) => {
      const n = corners[(i + 1) % corners.length];
      const dx = n[0] - c[0];
      const dy = n[1] - c[1];
      return { c, dx, dy, len: Math.hypot(dx, dy) };
    });
    const perim = edges.reduce((sum, e) => sum + e.len, 0);
    let walked = 0;
    for (const e of edges) {
      const ux = e.dx / e.len;
      const uy = e.dy / e.len;
      // Outward normal for an anticlockwise walk is the right-hand side.
      const nx = uy;
      const ny = -ux;
      const scallops = Math.max(1, Math.round(e.len / CLOUD_CHORD));
      const chord = e.len / scallops;
      for (let s = 0; s < scallops; s++) {
        const s0 = s * chord;
        const spawn = (walked + s0) / perim;
        // Each scallop is a shallow outward arc across its chord.
        let px = e.c[0] + ux * s0;
        let py = e.c[1] + uy * s0;
        for (let k = 1; k <= CLOUD_ARC_STEPS; k++) {
          const t = k / CLOUD_ARC_STEPS;
          const bulge = Math.sin(t * Math.PI) * CLOUD_BULGE;
          const qx = e.c[0] + ux * (s0 + chord * t) + nx * bulge;
          const qy = e.c[1] + uy * (s0 + chord * t) + ny * bulge;
          reviseSegs.push(px, py, az, qx, qy, az);
          reviseSpawn.push(spawn);
          px = qx;
          py = qy;
        }
      }
      walked += e.len;
    }
  }

  // Pads sit proud of the columns in plan, so the framing bounds have to own
  // them or the outermost footing clips at the cell edge.
  const size: Vec3 = [
    max[0] - min[0] + PAD_HALF * 2,
    max[1] - min[1],
    max[2] - min[2] + PAD_HALF * 2,
  ];
  const bounds = {
    min: [min[0] - cx - PAD_HALF, min[1], min[2] - cz - PAD_HALF] as Vec3,
    max: [max[0] - cx + PAD_HALF, max[1], max[2] - cz + PAD_HALF] as Vec3,
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
    footingSegs,
    footingSpawn,
    dimSegs,
    dimSpawn,
    reviseSegs,
    reviseSpawn,
  };
}
