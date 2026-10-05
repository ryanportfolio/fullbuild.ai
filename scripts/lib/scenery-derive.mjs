/**
 * The geometry stage: point columns in, derived scenery products out.
 *
 * Pure functions, no I/O and no clock, so the whole stage replays from a cache
 * and two runs agree byte for byte. Every grid origin comes from the venue
 * config rather than from the data's own extent, which is what keeps a product
 * identical after a cached node is deleted and refetched.
 *
 * Neither LA collection classifies vegetation or buildings, so nothing here
 * keys off class 5 or 6. Structure is geometric: a minimum-z ground surface
 * from classes 2 and 20, a maximum-z surface from everything that is not noise
 * or water, and the difference between them as a canopy height model. Local
 * maxima on that model are crowns; connected components over 20 m are masses.
 * Semantics stay with OSM, which is where they are actually recorded.
 */
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/** Empty cell in a committed height field: Int16 minimum, unreachable as a
 * real elevation in centimetres. */
export const NODATA_CM = -32768;

/** A course-frame axis-aligned raster, sized from config alone. */
export function makeGrid({ centreX, centreY, halfM, cell }) {
  const x0 = Math.round(centreX) - halfM;
  const y0 = Math.round(centreY) - halfM;
  const w = Math.round((2 * halfM) / cell);
  return { x0, y0, x1: x0 + w * cell, y1: y0 + w * cell, w, h: w, cell };
}

const NODATA = NaN;

/** Rasterise points to `grid`, keeping the min or max z per cell. Cells with no
 * accepted point stay NaN. */
export function rasterize(points, grid, mode, accept) {
  const { x0, y0, w, h, cell } = grid;
  const g = new Float32Array(w * h).fill(NODATA);
  for (let i = 0; i < points.n; i++) {
    if (accept && !accept(points.c[i])) continue;
    const gx = Math.floor((points.x[i] - x0) / cell);
    const gy = Math.floor((points.y[i] - y0) / cell);
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
    const k = gy * w + gx;
    const z = points.z[i];
    const v = g[k];
    if (Number.isNaN(v)) g[k] = z;
    else if (mode === "max") {
      if (z > v) g[k] = z;
    } else if (z < v) g[k] = z;
  }
  return g;
}

/** Which cells hold a real observation. One byte per cell here; the committed
 * product packs it to one bit. */
export function observedMask(values) {
  const mask = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) mask[i] = Number.isNaN(values[i]) ? 0 : 1;
  return mask;
}

/** Fill empty cells from their filled 4-neighbours, repeatedly. Deterministic
 * because every pass reads a frozen copy of the previous one, so the result
 * does not depend on scan order. `passes` bounds how far a value can travel:
 * 40 passes is 40 cells, which at 1 m is 40 m. */
export function fillHoles(values, grid, passes = 40) {
  const { w, h } = grid;
  let out = Float32Array.from(values);
  for (let pass = 0; pass < passes; pass++) {
    let filled = 0;
    const src = Float32Array.from(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!Number.isNaN(src[k])) continue;
        let sum = 0;
        let count = 0;
        for (const nk of [x + 1 < w ? k + 1 : -1, x > 0 ? k - 1 : -1, y + 1 < h ? k + w : -1, y > 0 ? k - w : -1]) {
          if (nk < 0 || Number.isNaN(src[nk])) continue;
          sum += src[nk];
          count++;
        }
        if (count) {
          out[k] = sum / count;
          filled++;
        }
      }
    }
    if (!filled) break;
  }
  return out;
}

/** Canopy height model: surface minus ground, NaN wherever either is missing. */
export function canopyHeightModel(surface, ground) {
  const chm = new Float32Array(surface.length);
  for (let i = 0; i < surface.length; i++) {
    const s = surface[i];
    const g = ground[i];
    chm[i] = Number.isNaN(s) || Number.isNaN(g) ? NODATA : s - g;
  }
  return chm;
}

/** NaN-aware box mean over a (2r+1)^2 window. One pass before the local-maximum
 * sweep: raw 1 m maxima fire several times per crown. */
export function smooth(values, grid, radius) {
  if (!radius) return values;
  const { w, h } = grid;
  const out = new Float32Array(values.length).fill(NODATA);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const v = values[ny * w + nx];
          if (!Number.isNaN(v)) {
            sum += v;
            count++;
          }
        }
      }
      if (count) out[y * w + x] = sum / count;
    }
  }
  return out;
}

/**
 * Variable-window local maxima on a canopy height model.
 *
 * The window grows with height, the standard individual-tree-detection rule.
 * Ties are broken by raster order so a plateau yields exactly one top. Crown
 * radius grows outward while the ring stays above 40 per cent of the top, then
 * gets clamped against the nearest neighbour by `clampToNeighbours`: in closed
 * canopy the growth rule merges neighbours, so the clamped radius is a lower
 * bound rather than a measurement.
 */
export function findCrowns(values, grid, { minHeight, maxHeight }) {
  const { w, h, cell, x0, y0 } = grid;
  const tops = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = values[y * w + x];
      if (Number.isNaN(v) || v < minHeight || v > maxHeight) continue;
      const rad = Math.max(1, Math.round((1.2 + 0.12 * v) / cell));
      let isMax = true;
      for (let dy = -rad; dy <= rad && isMax; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const u = values[ny * w + nx];
          if (!Number.isNaN(u) && (u > v || (u === v && (ny < y || (ny === y && nx < x))))) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;
      let r = 0;
      const cap = Math.max(rad + 2, Math.round(12 / cell));
      for (let rr = 1; rr <= cap; rr++) {
        let above = 0;
        let total = 0;
        for (let dy = -rr; dy <= rr; dy++) {
          for (let dx = -rr; dx <= rr; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > rr * rr || d2 < (rr - 1) * (rr - 1)) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            total++;
            const u = values[ny * w + nx];
            if (!Number.isNaN(u) && u > 0.4 * v) above++;
          }
        }
        if (!total || above / total < 0.5) break;
        r = rr;
      }
      tops.push({
        x: round2(x0 + (x + 0.5) * cell),
        y: round2(y0 + (y + 0.5) * cell),
        height: round2(v),
        crownRadius: round2(Math.max(cell, r * cell)),
      });
    }
  }
  return tops;
}

/** Cap each crown radius at half the distance to its nearest neighbour, the
 * usual competition rule, so a merged crown does not become a giant billboard. */
export function clampToNeighbours(crowns) {
  const capped = crowns.map((c) => ({ ...c }));
  for (let i = 0; i < capped.length; i++) {
    let near = Infinity;
    for (let j = 0; j < capped.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(capped[i].x - capped[j].x, capped[i].y - capped[j].y);
      if (d < near) near = d;
    }
    if (Number.isFinite(near)) {
      capped[i].crownRadius = round2(Math.min(capped[i].crownRadius, near / 2));
    }
  }
  return capped;
}

/** Connected components of cells over a height threshold: tower slabs, crane
 * gantry rows, building blocks. Eight-connected, so a diagonal step still
 * belongs to the same structure. */
export function findMasses(values, grid, threshold, minCells) {
  const { w, h, cell, x0, y0 } = grid;
  const seen = new Uint8Array(w * h);
  const out = [];
  const neighbours = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const seed = y * w + x;
      if (seen[seed] || Number.isNaN(values[seed]) || values[seed] < threshold) continue;
      const stack = [seed];
      seen[seed] = 1;
      const cells = [];
      while (stack.length) {
        const k = stack.pop();
        cells.push(k);
        const cx = k % w;
        const cy = (k / w) | 0;
        for (const [dx, dy] of neighbours) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = ny * w + nx;
          if (seen[nk] || Number.isNaN(values[nk]) || values[nk] < threshold) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      if (cells.length < minCells) continue;
      let sx = 0;
      let sy = 0;
      let top = -Infinity;
      let bx0 = Infinity;
      let bx1 = -Infinity;
      let by0 = Infinity;
      let by1 = -Infinity;
      for (const k of cells) {
        const cx = k % w;
        const cy = (k / w) | 0;
        sx += cx;
        sy += cy;
        if (values[k] > top) top = values[k];
        if (cx < bx0) bx0 = cx;
        if (cx > bx1) bx1 = cx;
        if (cy < by0) by0 = cy;
        if (cy > by1) by1 = cy;
      }
      out.push({
        x: round2(x0 + (sx / cells.length + 0.5) * cell),
        y: round2(y0 + (sy / cells.length + 0.5) * cell),
        top: round2(top),
        footprintM2: round1(cells.length * cell * cell),
        widthM: round1((bx1 - bx0 + 1) * cell),
        depthM: round1((by1 - by0 + 1) * cell),
        boundsX: [round2(x0 + bx0 * cell), round2(x0 + (bx1 + 1) * cell)],
        boundsY: [round2(y0 + by0 * cell), round2(y0 + (by1 + 1) * cell)],
      });
    }
  }
  /* Tallest first, then a total order on position so equal tops cannot swap. */
  out.sort((a, b) => b.top - a.top || a.x - b.x || a.y - b.y);
  return out;
}

/** Drop crowns standing inside a detected mass's BOUNDING BOX (plus pad), not
 * its exact cell footprint: on these islands the 15-25 m band mixes real trees
 * with sculpted screen panels and rig structure, and the box errs toward
 * dropping (audited cost: 10 of 1,197 raw crowns, 0.8%, drop on box slack). */
export function excludeCrownsInMasses(crowns, masses, padM) {
  return crowns.filter(
    (c) =>
      !masses.some(
        (m) =>
          c.x >= m.boundsX[0] - padM &&
          c.x <= m.boundsX[1] + padM &&
          c.y >= m.boundsY[0] - padM &&
          c.y <= m.boundsY[1] + padM,
      ),
  );
}

/** Signed distance from a point to a closed ring, positive inside. */
export function signedDistanceToRing(ring, px, py) {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (d < best) best = d;
    if (y1 > py !== y2 > py && px < x1 + ((py - y1) / (y2 - y1)) * dx) inside = !inside;
  }
  return inside ? best : -best;
}

/**
 * Ground elevation against signed distance to an island's OSM waterline ring.
 *
 * Class 20, ignored ground, is kept alongside class 2: on a riprap rim it is
 * the rock the classifier declined to call ground, which is exactly the
 * material being measured.
 */
export function shorelineProfile(points, ring, options) {
  const {
    shorelineBinM,
    shorelineRangeM,
    shorelineDeckWindowM,
    shorelineCrownWindowM,
    shorelineMinBinPoints,
    groundClasses,
  } = options;
  const bins = new Map();
  let binned = 0;
  for (let i = 0; i < points.n; i++) {
    if (!groundClasses.includes(points.c[i])) continue;
    const d = Math.round(signedDistanceToRing(ring, points.x[i], points.y[i]) / shorelineBinM) * shorelineBinM;
    if (d < shorelineRangeM[0] || d > shorelineRangeM[1]) continue;
    let bin = bins.get(d);
    if (!bin) bins.set(d, (bin = []));
    bin.push(points.z[i]);
    binned++;
  }
  const distances = [...bins.keys()].sort((a, b) => a - b);

  const deckSamples = [];
  for (const d of distances) {
    if (d >= shorelineDeckWindowM[0] && d <= shorelineDeckWindowM[1]) deckSamples.push(...bins.get(d));
  }
  const deckZ = percentile(deckSamples, 0.5);

  let crownAt = null;
  let crownZ = -Infinity;
  for (const d of distances) {
    const bin = bins.get(d);
    if (bin.length < shorelineMinBinPoints) continue;
    if (d < shorelineCrownWindowM[0] || d > shorelineCrownWindowM[1]) continue;
    const median = percentile(bin, 0.5);
    if (median > crownZ) {
      crownZ = median;
      crownAt = d;
    }
  }

  let batter = null;
  if (crownAt !== null) {
    const outer = distances.filter(
      (d) => d <= crownAt && d >= crownAt - 40 && bins.get(d).length >= shorelineMinBinPoints,
    );
    if (outer.length > 1) {
      const first = outer[0];
      const z0 = percentile(bins.get(first), 0.5);
      const run = crownAt - first;
      const rise = crownZ - z0;
      batter = {
        fromM: first,
        runM: run,
        riseM: round2(rise),
        ratio: round2(run / Math.max(0.01, rise)),
        angleDeg: round2((Math.atan2(rise, run) * 180) / Math.PI),
      };
    }
  }

  const profile = distances
    .filter((d) => bins.get(d).length >= shorelineMinBinPoints)
    .map((d) => {
      const bin = bins.get(d);
      return {
        distanceM: d,
        points: bin.length,
        z10: round2(percentile(bin, 0.1)),
        z50: round2(percentile(bin, 0.5)),
        z90: round2(percentile(bin, 0.9)),
      };
    });

  return {
    binnedPoints: binned,
    deckZ: round2(deckZ),
    crownZ: crownAt === null ? null : round2(crownZ),
    crownAtM: crownAt,
    lipM: crownAt === null ? null : round2(crownZ - deckZ),
    batter,
    profile,
  };
}

/** Rank percentile with the research round's convention, kept identical so the
 * numbers in report.md and the numbers in the products are the same statistic. */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export const round1 = (v) => Number(v.toFixed(1));
export const round2 = (v) => Number(v.toFixed(2));

/** Extremes by iteration. `Math.max(...values)` spreads a 160,000-cell raster
 * onto the call stack and throws RangeError long before it reaches an answer. */
export function maxOf(values, fallback = 0) {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
  return m === -Infinity ? fallback : m;
}
export function minOf(values, fallback = 0) {
  let m = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < m) m = values[i];
  return m === Infinity ? fallback : m;
}

/** Median z of the water class, which is the tide at scan time and therefore
 * the sea plane these heights are measured against. */
export function seaLevel(points, waterClasses) {
  const z = [];
  for (let i = 0; i < points.n; i++) if (waterClasses.includes(points.c[i])) z.push(points.z[i]);
  if (!z.length) return null;
  return {
    points: z.length,
    z10: round2(percentile(z, 0.1)),
    z50: round2(percentile(z, 0.5)),
    z90: round2(percentile(z, 0.9)),
  };
}

/**
 * Ground raster as little-endian centimetre integers, gzipped and base64'd.
 *
 * Row-major from the grid origin with +x fastest. `dataSha256` is over the
 * uncompressed bytes, so a value-level claim survives a different zlib build
 * packing the same numbers into different compressed bytes.
 */
export function encodeHeightField(values) {
  const raw = Buffer.allocUnsafe(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const cm = Number.isNaN(v) ? NODATA_CM : Math.max(-32767, Math.min(32767, Math.round(v * 100)));
    raw.writeInt16LE(cm, i * 2);
  }
  return {
    base64: gzipSync(raw).toString("base64"),
    dataSha256: createHash("sha256").update(raw).digest("hex"),
    rawBytes: raw.length,
  };
}

/** Observed-cell mask, one bit per cell, LSB first within each byte. */
export function encodeMask(mask) {
  const raw = Buffer.alloc(Math.ceil(mask.length / 8));
  for (let i = 0; i < mask.length; i++) if (mask[i]) raw[i >> 3] |= 1 << (i & 7);
  return {
    base64: gzipSync(raw).toString("base64"),
    dataSha256: createHash("sha256").update(raw).digest("hex"),
    rawBytes: raw.length,
  };
}

/** Class histogram, ordered by class number so two runs print the same table. */
export function classHistogram(points) {
  const counts = new Map();
  for (let i = 0; i < points.n; i++) counts.set(points.c[i], (counts.get(points.c[i]) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([classId, count]) => ({ classId, count }));
}
