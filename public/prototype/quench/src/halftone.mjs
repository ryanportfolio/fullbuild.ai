// quench · halftone.mjs
// The dissolve screen: one 2D canvas pass, no frame loop. A pool is sampled
// down to one pixel per cell, then redrawn as a lattice whose square size
// follows that cell's brightness, so the metal survives the screen instead of
// being replaced by it. Each cell is laid twice, once in --live and once in
// --pending at the opposite offset; the two weights are solved so the overlap
// adds back to a neutral cool white and the colour is left on the edges only.
// Nothing here is random: the same pool always screens the same way.

const LIVE = [94, 230, 208];
const PENDING = [255, 94, 168];

// Solved from live * a + pending * b = white on the red and green channels.
// Blue lands 13% over, which reads as the cool cast Quench's chrome already has
const LIVE_W = 0.824;
const PENDING_W = 0.696;

const MIN_CELL = 0.08; // a dead cell still leaves a speck, so the grid reads
const MAX_CELL = 1.0;  // and a lit one closes on its neighbours

// The material axis, keyed off the shader's own stillness table: a molten pool
// breaks into a fine screen of soft cells with its shadows lifted and its
// dispersion wide, a set one into a coarse crisp lattice that barely splits
export function screenParams(still) {
  const s = still < 0 ? 0 : still > 1 ? 1 : still;
  return {
    pitch: 24 + 15 * s,
    round: 0.34 - 0.22 * s,
    gamma: 0.62 + 0.6 * s,
    split: 0.07 - 0.032 * s
  };
}

function ctx2d(canvas, readback) {
  try {
    return canvas.getContext("2d", { alpha: false, willReadFrequently: !!readback });
  } catch (err) {
    return null;
  }
}

// Two-step downscale: browsers filter a halving well and a 20x reduction
// poorly, and the grid is the only thing that ever reads this
export function sampleGrid(src, rect, cols, rows) {
  if (!(cols > 0) || !(rows > 0)) return null;
  const mid = document.createElement("canvas");
  mid.width = cols * 4;
  mid.height = rows * 4;
  const mc = ctx2d(mid, false);
  if (!mc) return null;
  mc.imageSmoothingQuality = "high";
  try {
    mc.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, mid.width, mid.height);
  } catch (err) {
    return null;
  }
  const small = document.createElement("canvas");
  small.width = cols;
  small.height = rows;
  const sc = ctx2d(small, true);
  if (!sc) return null;
  sc.imageSmoothingQuality = "high";
  sc.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, cols, rows);
  try {
    return sc.getImageData(0, 0, cols, rows).data;
  } catch (err) {
    return null;
  }
}

// Every pool is lit somewhere, so a sample with no light in it is not a pool:
// it is a drawing buffer that was cleared out from under the read
export function hasLight(data, floor) {
  if (!data) return false;
  const lim = floor === undefined ? 10 : floor;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > lim || data[i + 1] > lim || data[i + 2] > lim) return true;
  }
  return false;
}

function rounded(g, x, y, w, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, w, r);
  else g.rect(x, y, w, w);
  g.fill();
}

function tint(rgb, weight, level) {
  const k = weight * level;
  return "rgb(" + Math.round(rgb[0] * k) + "," + Math.round(rgb[1] * k) + "," + Math.round(rgb[2] * k) + ")";
}

// Paints `canvas` (square, side px) with the screened form of `data`, which is
// a cols x rows RGBA sample of the pool. Returns the number of cells laid, or
// zero if there was nothing to lay them on
export function paintScreen(canvas, data, cols, rows, params, side) {
  const g = ctx2d(canvas, false);
  if (!g || !data) return 0;
  const pitch = side / cols;
  const g0 = params.gamma;
  g.fillStyle = "#050608";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = "lighter";
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const o = (j * cols + i) * 4;
      // Rec.601 luma: the pool is near neutral, so one channel would lie about
      // the iridescent rim on the state that will not set
      const lum = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
      const level = Math.pow(lum, g0);
      const w = pitch * (MIN_CELL + (MAX_CELL - MIN_CELL) * level);
      const r = w * params.round;
      const cx = (i + 0.5) * pitch - w / 2;
      const cy = (j + 0.5) * pitch - w / 2;
      // Split scales with the cell, so a fringe stays a fringe: a small cell
      // would otherwise be torn into two separate coloured specks
      const half = w * params.split;
      g.fillStyle = tint(LIVE, LIVE_W, level);
      rounded(g, cx - half, cy - half, w, r);
      g.fillStyle = tint(PENDING, PENDING_W, level);
      rounded(g, cx + half, cy + half, w, r);
    }
  }
  g.globalCompositeOperation = "source-over";
  return cols * rows;
}
