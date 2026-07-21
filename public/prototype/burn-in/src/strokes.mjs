// Single-stroke letterforms for the beam, Hershey simplex spirit, authored here.
// Grid: y grows downward, cap line at 0, baseline at 14. One source of truth for
// the live shader path and the no-WebGL SVG fallback.

const GLYPHS = {
  " ": { w: 6, s: [] },
  "'": { w: 1.8, s: [[[1.4, 0], [0.4, 3.6]]] },
  A: { w: 8, s: [[[0, 14], [4, 0], [8, 14]], [[1.5, 9], [6.5, 9]]] },
  B: {
    w: 7.5,
    s: [
      [[0, 0], [0, 14]],
      [[0, 0], [5, 0], [6.5, 0.9], [7, 2.2], [7, 4.6], [6.5, 6], [5, 7], [0, 7]],
      [[0, 7], [5.5, 7], [7, 7.9], [7.5, 9.3], [7.5, 11.6], [7, 13], [5.5, 14], [0, 14]]
    ]
  },
  D: {
    w: 8,
    s: [
      [[0, 0], [0, 14]],
      [[0, 0], [4.5, 0], [6.5, 1], [7.5, 2.8], [8, 5.4], [8, 8.6], [7.5, 11.2], [6.5, 13], [4.5, 14], [0, 14]]
    ]
  },
  E: { w: 8, s: [[[8, 0], [0, 0], [0, 14], [8, 14]], [[0, 7], [6, 7]]] },
  F: { w: 8, s: [[[0, 14], [0, 0], [8, 0]], [[0, 7], [6, 7]]] },
  G: {
    w: 8,
    s: [
      [[8, 3], [7, 1.2], [5.5, 0.2], [4, 0], [2.4, 0.4], [1, 1.6], [0.3, 3.5], [0, 7], [0.3, 10.5], [1, 12.4], [2.4, 13.6], [4, 14], [5.6, 13.7], [7, 12.6], [8, 10.8], [8, 8]],
      [[5, 8], [8, 8]]
    ]
  },
  H: { w: 8, s: [[[0, 0], [0, 14]], [[8, 0], [8, 14]], [[0, 7], [8, 7]]] },
  I: { w: 1, s: [[[0.5, 0], [0.5, 14]]] },
  L: { w: 8, s: [[[0, 0], [0, 14], [8, 14]]] },
  M: { w: 10, s: [[[0, 14], [0, 0], [5, 10], [10, 0], [10, 14]]] },
  N: { w: 8, s: [[[0, 14], [0, 0], [8, 14], [8, 0]]] },
  O: {
    w: 8,
    s: [
      [[4, 0], [2.4, 0.4], [1, 1.6], [0.3, 3.5], [0, 7], [0.3, 10.5], [1, 12.4], [2.4, 13.6], [4, 14], [5.6, 13.6], [7, 12.4], [7.7, 10.5], [8, 7], [7.7, 3.5], [7, 1.6], [5.6, 0.4], [4, 0]]
    ]
  },
  R: {
    w: 8,
    s: [
      [[0, 14], [0, 0], [5, 0], [6.7, 0.9], [7.3, 2.3], [7.3, 4.6], [6.7, 6], [5, 7], [0, 7]],
      [[4.5, 7], [8, 14]]
    ]
  },
  S: {
    w: 8,
    s: [
      [[7.6, 2.2], [6.4, 0.6], [4.2, 0], [2.4, 0.2], [0.9, 1.2], [0.4, 2.8], [0.9, 4.4], [2.4, 5.4], [5.6, 6.6], [7.1, 7.8], [7.6, 9.4], [7.4, 11.4], [6.2, 13.2], [4, 14], [1.8, 13.6], [0.4, 12]]
    ]
  },
  T: { w: 8, s: [[[0, 0], [8, 0]], [[4, 0], [4, 14]]] },
  U: { w: 8, s: [[[0, 0], [0, 10], [0.5, 12], [2, 13.6], [4, 14], [6, 13.6], [7.5, 12], [8, 10], [8, 0]]] },
  W: { w: 10, s: [[[0, 0], [2, 14], [5, 3], [8, 14], [10, 0]]] },
  Y: { w: 8, s: [[[0, 0], [4, 7], [8, 0]], [[4, 7], [4, 14]]] }
};

const CAP_HEIGHT = 14;

// Lay a string (with \n line breaks) out as arc-length-parameterized polylines.
// Returns { width, height, total, strokes, segs } in glyph grid units.
export function strokeLayout(text, opts = {}) {
  const tracking = opts.tracking ?? 3;
  const lineGap = opts.lineGap ?? 8;
  const lines = String(text).toUpperCase().split("\n");
  const lineH = CAP_HEIGHT + lineGap;

  const widths = lines.map((line) => {
    let x = 0;
    let any = false;
    for (const ch of line) {
      const g = GLYPHS[ch] || GLYPHS[" "];
      x += g.w + tracking;
      any = true;
    }
    return any ? x - tracking : 0;
  });
  const width = Math.max(1, ...widths);

  const strokes = [];
  lines.forEach((line, li) => {
    let x = (width - widths[li]) / 2;
    const y0 = li * lineH;
    for (const ch of line) {
      const g = GLYPHS[ch] || GLYPHS[" "];
      for (const s of g.s) {
        strokes.push(s.map(([px, py]) => [x + px, y0 + py]));
      }
      x += g.w + tracking;
    }
  });

  const segs = [];
  let total = 0;
  const outStrokes = strokes.map((pts) => {
    const cum = [0];
    const start = total;
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push({
        ax: pts[i - 1][0], ay: pts[i - 1][1],
        bx: pts[i][0], by: pts[i][1],
        s0: total, s1: total + len
      });
      total += len;
      cum.push(cum[i - 1] + len);
    }
    return { points: pts, cum, start, length: cum[cum.length - 1] };
  });

  return {
    width,
    height: (lines.length - 1) * lineH + CAP_HEIGHT,
    total,
    strokes: outStrokes,
    segs
  };
}

// Segments overlapping the arc-length window [s0, s1], clipped at both ends.
export function segmentsForRange(layout, s0, s1) {
  const out = [];
  if (!(s1 > s0)) return out;
  for (const seg of layout.segs) {
    if (seg.s1 <= s0 || seg.s0 >= s1) continue;
    const len = seg.s1 - seg.s0;
    const f0 = Math.max(0, (s0 - seg.s0) / len);
    const f1 = Math.min(1, (s1 - seg.s0) / len);
    out.push([
      seg.ax + (seg.bx - seg.ax) * f0, seg.ay + (seg.by - seg.ay) * f0,
      seg.ax + (seg.bx - seg.ax) * f1, seg.ay + (seg.by - seg.ay) * f1
    ]);
  }
  return out;
}

// Beam head position at arc length s.
export function endPoint(layout, s) {
  const segs = layout.segs;
  if (!segs.length) return [0, 0];
  if (s <= 0) return [segs[0].ax, segs[0].ay];
  for (const seg of segs) {
    if (s <= seg.s1) {
      const f = (s - seg.s0) / Math.max(1e-6, seg.s1 - seg.s0);
      return [seg.ax + (seg.bx - seg.ax) * f, seg.ay + (seg.by - seg.ay) * f];
    }
  }
  const last = segs[segs.length - 1];
  return [last.bx, last.by];
}
