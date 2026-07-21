'use client';

import { useEffect, useRef } from 'react';
import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import { buildBed, buildTicks, GRADE_Y, VIEW_W, VIEW_H } from '@/lib/flora';
import s from './planting.module.css';

/* ============================================================================
   L-101 — PLANTING PLAN. A landscape-series sheet fragment in the shipped
   sheet's band cell, directly under the poured structure. Twelve flowers —
   one per schedule entry, keyed 04.1–04.12 — start as plan symbols on the
   finished-grade line and resolve stroke-by-stroke into drawn elevations in
   lockstep with the pour waterline igniting their row. Live projects grow an
   open bloom; repo-only projects a closed bud. Scrolling up never un-grows.

   The server markup IS the finished bloomed bed: strokes carry no dash
   offsets and the CSS --fg fallback is 1, so no-JS and reduced-motion both
   get the complete drawing. The effect below only animates.
   ========================================================================= */

// Module scope: pure + deterministic (seeded PRNG), identical on both runtimes.
const BED = buildBed(PROJECTS);
const TICKS = buildTicks();

/* Mirrors Marks.tsx drawProps but with its OWN class — DrawingSet collects
   ws-draw (per sheet) and ws-scrub (document-wide); ws-grow belongs to this
   component's growth driver alone. */
const growProps = (order: number) => ({
  className: 'ws-grow',
  pathLength: 1,
  'data-o': order,
  vectorEffect: 'non-scaling-stroke' as const,
});

const DIM_Y = 193;

export default function PlantingPlan() {
  const health = useWorkingSet((st) => st.health);
  const rootRef = useRef<SVGSVGElement>(null);

  // GROWTH DRIVER. Direct style writes only — no GSAP (sidesteps the
  // pathLength=1 CSSPlugin autoRound trap), no rAF loop, no ScrollTrigger:
  // the store subscription fires on pour deltas, and pour is already
  // frame-locked to the 3D section plane and the DOM waterline.
  useEffect(() => {
    // Reduced motion FIRST, before any stroke is hidden: DrawingSet never
    // wires the pour trigger under reduce (pour stays 0), so the bed must
    // stand finished — which the untouched server markup already is.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The plate is display:none below 1024px — don't drive dash writes into a
    // hidden SVG. (A viewport that later crosses 1024px gets the finished bed,
    // the same stand-complete fallback every other no-animation path uses.)
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const root = rootRef.current;
    if (!root) return;

    const flowers = Array.from(root.querySelectorAll<SVGGElement>(`.${s.flower}`)).map((g) => ({
      g,
      strokes: Array.from(g.querySelectorAll<SVGPathElement>('.ws-grow')).sort(
        (a, b) => Number(a.dataset.o) - Number(b.dataset.o),
      ),
    }));

    // Hide immediately (accepted one-frame exposure, same as ws-draw — STAGE
    // 04 is far below the fold).
    for (const f of flowers) {
      for (const el of f.strokes) {
        el.style.strokeDasharray = '1';
        el.style.strokeDashoffset = '1';
      }
    }

    const n = flowers.length;
    // Monotonic front — growth is add-only (pencil only adds); seeding from
    // the store handles mid-page scroll restoration.
    let front = 0;
    const tick = () => {
      for (let i = 0; i < n; i++) {
        // Starts ~0.8 row-heights before row i ignites (--lit flips at
        // pour*n - i = 0.45), mid-growth at the ignition instant. Window 1.35
        // keeps 3–4 flowers mid-growth at once AND lets flower n-1 reach
        // g = 1 exactly at pour = 1 ((n - (n-1) + 0.35) / 1.35 = 1).
        const g = Math.min(1, Math.max(0, (front * n - i + 0.35) / 1.35));
        const f = flowers[i];
        f.g.style.setProperty('--fg', g.toFixed(3));
        const m = f.strokes.length;
        for (let k = 0; k < m; k++) {
          const local = Math.min(1, Math.max(0, (g - k / m) * m));
          const eased = 1 - (1 - local) * (1 - local); // decelerate into rest
          f.strokes[k].style.strokeDashoffset = String(1 - eased);
        }
      }
    };
    front = useWorkingSet.getState().pour;
    tick();
    const unsub = useWorkingSet.subscribe((st, prev) => {
      if (st.pour !== prev.pour && st.pour > front) {
        front = st.pour;
        tick();
      }
    });
    return () => {
      unsub();
      for (const f of flowers) {
        f.g.style.removeProperty('--fg');
        for (const el of f.strokes) {
          el.style.strokeDasharray = '';
          el.style.strokeDashoffset = '';
        }
      }
    };
  }, []);

  const first = BED[0];
  const last = BED[BED.length - 1];

  return (
    <svg
      ref={rootRef}
      className={s.plate}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
    >
      {/* STATIC layer — always drawn, never animated. Concrete = the poured
          hardscape (engineering ink). */}
      <g stroke="var(--ink-concrete)" fill="none">
        {/* finished-grade datum + double-line bed edging */}
        <line x1={8} y1={GRADE_Y} x2={352} y2={GRADE_Y} strokeWidth={1.3} />
        <line x1={14} y1={169} x2={346} y2={169} strokeWidth={0.7} />
        <line x1={14} y1={171} x2={346} y2={171} strokeWidth={0.7} />
        {/* seeded 45° grade hatch */}
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={0.6} />
        ))}
        {/* plan symbols: circle + center tick at each slot */}
        {BED.map((sp) => (
          <g key={sp.id} strokeWidth={0.8}>
            <circle cx={sp.x} cy={GRADE_Y} r={3} />
            <line x1={sp.x - 2.2} y1={GRADE_Y} x2={sp.x + 2.2} y2={GRADE_Y} />
            <line x1={sp.x} y1={GRADE_Y - 2.2} x2={sp.x} y2={GRADE_Y + 2.2} />
          </g>
        ))}
        {/* hand-rolled dimension line (tick geometry per Marks.tsx Dim — not
            imported: Marks emits ws-draw, which DrawingSet would hijack) */}
        <line x1={first.x} y1={DIM_Y} x2={last.x} y2={DIM_Y} strokeWidth={0.7} />
        <line x1={first.x - 3} y1={DIM_Y - 3} x2={first.x + 3} y2={DIM_Y + 3} strokeWidth={0.7} />
        <line x1={last.x - 3} y1={DIM_Y - 3} x2={last.x + 3} y2={DIM_Y + 3} strokeWidth={0.7} />
      </g>

      {/* witness voice: keynotes, dim value, corner strip */}
      <g fill="var(--ink-witness)" fontFamily="var(--font-mono)">
        {BED.map((sp) => (
          <text key={sp.id} x={sp.x} y={182} fontSize={5.5} textAnchor="middle">
            {sp.key}
          </text>
        ))}
        <text
          x={(first.x + last.x) / 2}
          y={DIM_Y - 3}
          fontSize={6}
          textAnchor="middle"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {PROJECTS.length} EA.
        </text>
        <text x={8} y={11} fontSize={6} style={{ letterSpacing: '0.08em' }}>
          L-101 · PLANTING PLAN · FIN. GRADE
        </text>
      </g>

      {/* GROWTH layer — one group per flower. ws-grow strokes carry NO React
          style prop: the driver owns their inline dash state, and a health
          re-render must never clobber it. */}
      {BED.map((sp, i) => {
        const p = PROJECTS[i];
        const live = p.live && isUp(health, p.href);
        return (
          <g key={sp.id} className={s.flower} data-live={live ? 'true' : 'false'}>
            {sp.strokes.map((st) => (
              <path
                key={st.k}
                d={st.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={st.w}
                strokeLinecap="round"
                {...growProps(i * 10 + st.k)}
              />
            ))}
            <circle className={s.bloomDot} cx={sp.dot[0]} cy={sp.dot[1]} r={2.2} />
          </g>
        );
      })}
    </svg>
  );
}
