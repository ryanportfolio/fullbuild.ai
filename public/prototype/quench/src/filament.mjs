// quench · filament.mjs
// One hairline thread stitched through the lifecycle discs. Measured at boot,
// on resize and after font reflow, never per frame: the result is a static
// path in the section's own pixel space. The canvas paints below main, so
// nothing in the DOM can sit behind a disc; the thread is cut where each disc
// stands instead, which reads the same and costs one path.

import { DISC_R } from "./bake.mjs";

const GAP = 1.06;   // cut radius as a multiple of the drawn disc radius
const ENTER = 0.36; // radians from the top of a disc where the thread goes in
const EXIT = -0.58; // and from the bottom where it comes back out

function n(v) {
  return Math.round(v * 10) / 10;
}

// Cubic with vertical tangents at both ends, so the thread bends only between
// the cells it connects
function curveTo(a, b) {
  const dy = (b.y - a.y) * 0.42;
  return " C" + n(a.x) + " " + n(a.y + dy) + " " + n(b.x) + " " + n(b.y - dy) + " " + n(b.x) + " " + n(b.y);
}

export function layoutFilament(root) {
  const scope = root || document;
  const svg = scope.querySelector(".filament");
  const path = svg ? svg.querySelector(".filament-line") : null;
  const host = svg ? svg.parentElement : null;
  if (!svg || !path || !host) return false;

  const hostRect = host.getBoundingClientRect();
  const w = hostRect.width;
  const h = hostRect.height;
  if (!(w > 8) || !(h > 8)) return false;

  const discs = [];
  for (const el of host.querySelectorAll(".cell-disc")) {
    const r = el.getBoundingClientRect();
    if (r.width < 8) continue;
    discs.push({
      cx: r.left - hostRect.left + r.width / 2,
      cy: r.top - hostRect.top + r.height / 2,
      r: r.width * DISC_R * GAP
    });
  }
  if (!discs.length) return false;

  const first = discs[0];
  const last = discs[discs.length - 1];
  const pts = [{ x: first.cx + first.r * 1.15, y: 0, cut: false }];
  for (const d of discs) {
    pts.push({ x: d.cx + d.r * Math.sin(ENTER), y: d.cy - d.r * Math.cos(ENTER), cut: true });
    pts.push({ x: d.cx + d.r * Math.sin(EXIT), y: d.cy + d.r * Math.cos(EXIT), cut: false });
  }
  pts.push({ x: last.cx - last.r * 0.85, y: h, cut: false });

  let d = "M" + n(pts[0].x) + " " + n(pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.cut) d += " M" + n(b.x) + " " + n(b.y);
    else d += curveTo(a, b);
  }

  svg.setAttribute("viewBox", "0 0 " + n(w) + " " + n(h));
  path.setAttribute("d", d);
  return true;
}

// One debounced resize listener plus the font reflow, no rAF: the thread only
// moves when layout moves, and the prototype owns exactly one frame chain.
// Wired for every boot path, including the one that never reaches the loop
export function wireFilament(root) {
  let timer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => layoutFilament(root), 160);
  }, { passive: true });
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(() => layoutFilament(root));
  }
  return layoutFilament(root);
}
