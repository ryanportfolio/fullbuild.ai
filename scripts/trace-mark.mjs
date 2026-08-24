/* ============================================================================
   TRACE A MARK, turning someone else's artwork into paths this set can draw.

   Takes a PNG whose alpha holds the mark (a logo served white on transparent,
   for instance) and walks the alpha's boundary into contour polygons, so an
   animated version draws the real letterforms instead of an impression of
   them.

     node scripts/trace-mark.mjs <mark.png> <out.json> [epsilon]

   Method: threshold the alpha at 50%, walk the lattice cracks with ink kept on
   the right (so outer contours and counters come out in opposite winding and
   fill even-odd correctly), then simplify each contour by Douglas-Peucker at
   `epsilon` source pixels (default 1.6). Output carries the normalized paths,
   a 100-unit cap height, and every contour's bounding box, in left-to-right
   order, so glyphs can be grouped by eye from the boxes alone.

   CHECK THE TRACE, DO NOT TRUST IT: render the paths back at source scale and
   compare with the original alpha. For the Vakaros wordmark in
   src/components/chrome/vakarosMark.ts that comparison gave IoU 0.994, with
   every disagreeing pixel on an edge.

   Needs ffmpeg on PATH for the alpha extraction.
   ========================================================================= */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , src, out, epsArg] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/trace-mark.mjs <mark.png> <out.json> [epsilon]');
  process.exit(1);
}
const EPS = Number(epsArg ?? 1.6);

const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src,
]);
if (probe.status !== 0) throw new Error(probe.stderr.toString());
const [W, H] = probe.stdout.toString().trim().split(',').map(Number);

const alpha = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', src, '-vf', 'alphaextract', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 28 },
);
if (alpha.status !== 0) throw new Error(alpha.stderr.toString());
const a = alpha.stdout;
if (a.length !== W * H) throw new Error(`alpha plane ${a.length} does not match ${W}x${H}`);

const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && a[y * W + x] > 127;

/* An edge leaving corner (x,y) in direction d is a boundary crack walked with
   ink on the right when the named cell is filled and its partner is not. */
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
function walkable(x, y, d) {
  if (d === 0) return on(x, y) && !on(x, y - 1);
  if (d === 1) return on(x - 1, y) && !on(x, y);
  if (d === 2) return on(x - 1, y - 1) && !on(x - 1, y);
  return on(x, y - 1) && !on(x - 1, y - 1);
}

const used = new Set();
const key = (x, y, d) => `${x},${y},${d}`;
const contours = [];

for (let y = 0; y <= H; y++) {
  for (let x = 0; x <= W; x++) {
    for (let d0 = 0; d0 < 4; d0++) {
      if (!walkable(x, y, d0) || used.has(key(x, y, d0))) continue;
      const pts = [];
      let cx = x, cy = y, d = d0, guard = 0;
      do {
        used.add(key(cx, cy, d));
        pts.push([cx, cy]);
        cx += DIRS[d][0];
        cy += DIRS[d][1];
        // one turn preference, so a saddle resolves the same way every run
        const order = [(d + 3) % 4, d, (d + 1) % 4, (d + 2) % 4];
        let nd = -1;
        for (const cand of order) if (walkable(cx, cy, cand)) { nd = cand; break; }
        if (nd < 0) break;
        d = nd;
        if (++guard > 2_000_000) throw new Error('runaway trace');
      } while (!(cx === x && cy === y && d === d0));
      // a contour under 40 steps is a stray speck, not a letter
      if (pts.length > 40) contours.push(pts);
    }
  }
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1;
    let bd = eps;
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[j];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    for (let k = i + 1; k < j; k++) {
      const dist = Math.abs((pts[k][0] - x1) * dy - (pts[k][1] - y1) * dx) / len;
      if (dist > bd) { bd = dist; best = k; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const simplified = contours
  .map((c) => {
    const pts = rdp(c, EPS);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      pts,
      raw: c.length,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    };
  })
  .sort((p, q) => p.box[0] - q.box[0]);

// normalize on the ink box, cap height exactly 100 units
const X0 = Math.min(...simplified.map((c) => c.box[0]));
const Y0 = Math.min(...simplified.map((c) => c.box[1]));
const X1 = Math.max(...simplified.map((c) => c.box[2]));
const Y1 = Math.max(...simplified.map((c) => c.box[3]));
const S = 100 / (Y1 - Y0);
const round = (v) => Number(v.toFixed(2));
const toPath = (c) =>
  c.pts.map((p, i) => `${i ? 'L' : 'M'}${round((p[0] - X0) * S)} ${round((p[1] - Y0) * S)}`).join(' ') + ' Z';

const result = {
  source: src,
  eps: EPS,
  inkBox: [X0, Y0, X1, Y1],
  viewBox: [round((X1 - X0) * S), round((Y1 - Y0) * S)],
  contours: simplified.map((c) => ({
    d: toPath(c),
    points: c.pts.length,
    rawPoints: c.raw,
    box: c.box,
  })),
};
writeFileSync(out, JSON.stringify(result, null, 1));

console.log(`viewBox ${result.viewBox.join(' x ')} from ink ${X1 - X0} x ${Y1 - Y0}`);
for (const [i, c] of result.contours.entries()) {
  console.log(`${i} points=${c.points} raw=${c.rawPoints} x ${c.box[0]}..${c.box[2]} y ${c.box[1]}..${c.box[3]}`);
}
