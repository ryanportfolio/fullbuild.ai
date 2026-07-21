'use client';

import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import { buildBed, buildTicks, GRADE_Y, VIEW_W, VIEW_H } from '@/lib/flora';
import s from './planting.module.css';

/* ============================================================================
   L-101 — PLANTING PLAN, static floor. The finished flowerbed for the
   reduced-motion / no-WebGL path ONLY: when the R3F island runs, the live
   overgrowth (vines climbing the poured structure, Scene.tsx) owns the band
   cell and StaticFloor unmounts this plate. Twelve flowers — one per schedule
   entry, keyed 04.1–04.12 — stand fully drawn; live projects an open bloom,
   repo-only a closed bud. No growth driver, no dash state, no hydration
   flash: the server markup IS the finished end-state and never changes.
   ========================================================================= */

// Module scope: pure + deterministic (seeded PRNG), identical on both runtimes.
const BED = buildBed(PROJECTS);
const TICKS = buildTicks();

const DIM_Y = 193;

export default function PlantingPlan() {
  const health = useWorkingSet((st) => st.health);

  const first = BED[0];
  const last = BED[BED.length - 1];

  return (
    <svg className={s.plate} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
      {/* STATIC hardscape — concrete (engineering ink). */}
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

      {/* FLORA layer — one finished flower per schedule entry. The bloom-center
          dot keeps the red contract: live + probe-passing only. */}
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
              />
            ))}
            <circle className={s.bloomDot} cx={sp.dot[0]} cy={sp.dot[1]} r={2.2} />
          </g>
        );
      })}
    </svg>
  );
}
