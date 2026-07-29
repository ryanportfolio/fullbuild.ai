/* ============================================================================
   ORDERED-DITHER ENGINE — shared by the lab bench and the cover masthead, so
   the two can never drift apart.

   The pipeline, in order: source canvas -> downscale to one sample per output
   cell -> Rec. 709 luma -> auto-level against the 2nd/98th percentile (computed
   ONCE per build; a still source has nothing to pulse) -> invert -> floor ->
   8x8 Bayer quantise into N tone levels -> draw each cell as a module whose
   size scales with its level.

   Everything downstream of the build reads the small cell buffer, which is why
   the pointer warp is free: it displaces the SAMPLING coordinates, not the
   drawn output.
   ========================================================================= */

/** 8x8 Bayer threshold matrix, normalised to 0..1. Built by recursing 2x2. */
function buildBayer8(): Float32Array {
  let m: number[][] = [
    [0, 2],
    [3, 1],
  ];
  for (let step = 0; step < 2; step++) {
    const n = m.length;
    const next: number[][] = Array.from({ length: n * 2 }, () => Array(n * 2).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y][x];
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    m = next;
  }
  const out = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = (m[y][x] + 0.5) / 64;
  return out;
}

export const BAYER = buildBayer8();

/** Residual anti-aliasing below this normalised tone is dropped entirely. */
export const FLOOR = 0.02;

export interface Field {
  cols: number;
  rows: number;
  luma: Float32Array;
}

/**
 * Downscale a source canvas into a cell-resolution luma field, auto-levelled
 * and inverted so ink lands on a DARK-on-light subject. Returns null if the
 * 2D context is unavailable.
 */
export function buildField(src: HTMLCanvasElement, cols: number, rows: number): Field | null {
  const small = document.createElement('canvas');
  small.width = Math.max(1, cols);
  small.height = Math.max(1, rows);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(src, 0, 0, small.width, small.height);

  let data: Uint8ClampedArray;
  try {
    data = sctx.getImageData(0, 0, small.width, small.height).data;
  } catch {
    return null;
  }

  const luma = new Float32Array(small.width * small.height);
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4;
    luma[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
  }

  // Auto-level, pinned: one percentile pair for the life of this field.
  const sorted = Float32Array.from(luma).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const range = Math.max(1e-4, hi - lo);
  for (let i = 0; i < luma.length; i++) {
    let v = (luma[i] - lo) / range;
    v = 1 - Math.min(1, Math.max(0, v)); // dark subject on a light source ground
    luma[i] = v < FLOOR ? 0 : v;
  }

  return { cols: small.width, rows: small.height, luma };
}

/** Deterministic per-cell scatter direction (hash -> unit vector). */
export function scatterDir(i: number, j: number): [number, number] {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  const a = (((h ^ (h >> 16)) >>> 0) / 4294967296) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
}

/** Eased falloff (smoothstep) so the warp reads as a field, not a cursor bubble. */
export function falloff(d: number, r: number): number {
  const t = Math.min(1, d / r);
  const s = 1 - t;
  return s * s * (3 - 2 * s);
}

/* --- BREATHING -------------------------------------------------------------
   dotScale and spacing sweep their full ranges on two slow sines with
   unrelated periods and a phase offset, so the pair never returns to a
   previous state and the drift never reads as a cycle. */
export const DOT_RANGE: readonly [number, number] = [0.4, 1];
export const GAP_RANGE: readonly [number, number] = [0.1, 0.6];
export const BREATHE_DOT_PERIOD = 13; // s
export const BREATHE_GAP_PERIOD = 21; // s
export const BREATHE_PHASE = 2.1; // rad

/** Current breathing values at time t (seconds). */
export function breatheAt(t: number): { dotScale: number; gap: number } {
  const s1 = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / BREATHE_DOT_PERIOD);
  const s2 = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / BREATHE_GAP_PERIOD + BREATHE_PHASE);
  return {
    dotScale: DOT_RANGE[0] + (DOT_RANGE[1] - DOT_RANGE[0]) * s1,
    gap: GAP_RANGE[0] + (GAP_RANGE[1] - GAP_RANGE[0]) * s2,
  };
}

export type Shape = 'square' | 'dot';
export type Warp = 'lean' | 'scatter' | 'twist' | 'none';

export interface DrawOpts {
  cell: number; // css px per cell
  gap: number; // fraction of the cell left empty
  dotScale: number; // module size as a fraction of what remains
  levels: number; // tone steps
  shape: Shape;
  warp: Warp;
  color: string;
  /** Pointer position in CELL units, plus how much warp to apply (0..1). */
  px: number;
  py: number;
  energy: number;
  radius: number; // css px
  strength: number; // max sampling displacement, in cells
  twistMax: number; // radians at the cursor
  width: number; // canvas css width (for the clear)
  height: number;
}

/**
 * Draw a field. One path is built for the whole frame and filled once, so the
 * cost is a single rasterise regardless of module count.
 */
export function drawField(ctx: CanvasRenderingContext2D, field: Field, o: DrawOpts): void {
  const { cols, rows, luma } = field;
  ctx.clearRect(0, 0, o.width, o.height);
  ctx.fillStyle = o.color;

  const maxHalf = (o.cell * (1 - o.gap) * o.dotScale) / 2;
  const n = Math.max(2, o.levels);
  const warpOn = o.energy > 0.001 && o.warp !== 'none';

  ctx.beginPath();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let si = i;
      let sj = j;
      if (warpOn) {
        const dx = i - o.px;
        const dy = j - o.py;
        const f = falloff(Math.hypot(dx, dy) * o.cell, o.radius) * o.energy;
        if (f > 0.001) {
          const s = o.strength * f;
          if (o.warp === 'lean') {
            si = i + (dx >= 0 ? 1 : -1) * s;
            sj = j - s * 0.35;
          } else if (o.warp === 'scatter') {
            const [ux, uy] = scatterDir(i, j);
            si = i + ux * s;
            sj = j + uy * s;
          } else {
            const a = o.twistMax * f;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            si = o.px + dx * ca - dy * sa;
            sj = o.py + dx * sa + dy * ca;
          }
        }
      }
      const ii = Math.round(si);
      const jj = Math.round(sj);
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      const v = luma[jj * cols + ii];
      if (v <= 0) continue;

      const t = v * (n - 1);
      const base = Math.floor(t);
      const level = base + (t - base > BAYER[(j & 7) * 8 + (i & 7)] ? 1 : 0);
      if (level <= 0) continue;

      const half = maxHalf * (level / (n - 1));
      const cx = i * o.cell + o.cell / 2;
      const cy = j * o.cell + o.cell / 2;
      if (o.shape === 'square') {
        ctx.rect(cx - half, cy - half, half * 2, half * 2);
      } else {
        ctx.moveTo(cx + half, cy);
        ctx.arc(cx, cy, half, 0, Math.PI * 2);
      }
    }
  }
  ctx.fill();
}
