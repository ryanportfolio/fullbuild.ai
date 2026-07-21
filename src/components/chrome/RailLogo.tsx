'use client';

import { useLayoutEffect, useRef } from 'react';

/* ============================================================================
   RAIL LOGO — the mark. A long shed half-drawn, half-poured: the left bay is
   still pencil linework under its dimension string; the right bay is poured
   solid. Idea → shipped in one glyph, living in the rail's upper reach.

   Draws itself on load, but only after the masthead wordmark settles (one
   instrument, one hand — same gate the cover uses). Reduced motion, JS-off,
   and SSR all get the finished mark — the same floor rule as every sheet.
   Values tuned in the logo lab (2026-07-21): 96px, 2.7px stroke, 2400ms
   draw, 60ms stagger, no tilt.
   ========================================================================= */

const STROKE_W = 2.7; // px, non-scaling
const DRAW_DUR = 2400; // ms per stroke
const DRAW_STAGGER = 60; // ms between stroke starts

// [path, stroke-width multiplier] — authored draw order
const STROKES: Array<[string, number]> = [
  ['M4 82 H96', 0.9], // ground
  ['M16 82 V46 L34 30 L52 46 V82', 1], // drawn bay: gable outline
  ['M52 46 H84 V82', 1], // poured bay: walls
  ['M52 46 L70 30 L84 44', 1], // poured bay: roof
  ['M22 78 l14 -14 M22 68 l12 -12 M22 58 l8 -8', 0.5], // pencil hatch, still drawing
  ['M16 24 V88 M8 40 H60', 0.4], // dimension string over the drawn half
];
const POUR = 'M52 46 H84 V82 H52 Z'; // the poured solid, fades in last

export default function RailLogo({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // finished mark stands, no motion

    const strokes = Array.from(svg.querySelectorAll<SVGPathElement>('path[data-stroke]'));
    const pour = svg.querySelector<SVGPathElement>('path[data-pour]');
    if (!strokes.length || !pour) return;

    // Hide before first paint so there is no flash of the finished mark.
    strokes.forEach((p) => {
      p.style.transition = 'none';
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = '1';
    });
    pour.style.transition = 'none';
    pour.style.opacity = '0';

    let timer = 0;
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      window.removeEventListener('ws:plot-settled', begin);
      window.clearTimeout(timer);
      svg.getBoundingClientRect(); // flush the hidden state
      strokes.forEach((p, i) => {
        p.style.transition = `stroke-dashoffset ${DRAW_DUR}ms cubic-bezier(0.22,0.61,0.36,1) ${i * DRAW_STAGGER}ms`;
        p.style.strokeDashoffset = '0';
      });
      pour.style.transition = `opacity ${DRAW_DUR}ms ease ${strokes.length * DRAW_STAGGER}ms`;
      pour.style.opacity = '1';
    };

    // One hand: wait for the wordmark plot (latched flag covers late mount);
    // fallback keeps the mark drawing even if the plot never signals.
    if ((window as unknown as { __plotSettled?: boolean }).__plotSettled) begin();
    else {
      window.addEventListener('ws:plot-settled', begin);
      timer = window.setTimeout(begin, 2600);
    }

    return () => {
      window.removeEventListener('ws:plot-settled', begin);
      window.clearTimeout(timer);
      // teardown mid-draw → leave the finished mark
      strokes.forEach((p) => {
        p.style.transition = 'none';
        p.style.strokeDasharray = '';
        p.style.strokeDashoffset = '';
      });
      pour.style.transition = 'none';
      pour.style.opacity = '';
    };
  }, []);

  return (
    <svg ref={ref} className={className} viewBox="0 0 100 100" aria-hidden="true">
      {STROKES.map(([d, wm], i) => (
        <path
          key={i}
          d={d}
          data-stroke=""
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={(STROKE_W * wm).toFixed(2)}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={POUR} data-pour="" fill="currentColor" stroke="none" />
    </svg>
  );
}
