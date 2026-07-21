'use client';

import { useEffect, useRef } from 'react';
import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import { useHealthProbe } from '@/lib/health';
import PlantingPlan from './PlantingPlan';
import StaticFloor from './StaticFloor';
import s from './shipped.module.css';

/* ============================================================================
   STATE 04 — SHIPPED. The drawing schedule.

   Twelve real rows — every figure verified against the GitHub API, README
   claims, or the live site itself (sources ship as title attributes). The DOM
   pour: the same store value that drives the 3D section plane sweeps a poché
   waterline down this schedule; a row is "poured" when the line passes it, and
   ONLY a poured row whose health probe passes may spend revision-red. The
   probe stamp beside an ignited row is a real measurement: host · status · ms.
   ========================================================================= */

export default function SheetShipped() {
  useHealthProbe();
  const health = useWorkingSet((st) => st.health);
  const scheduleRef = useRef<HTMLDivElement>(null);

  // POUR → CSS. One custom property, written straight to the DOM on store
  // change (no React re-render per scroll tick); each row derives its own
  // ignition factor from --pour and --i in pure CSS.
  useEffect(() => {
    const el = scheduleRef.current;
    if (!el) return;
    // Reduced motion: the schedule stands fully poured (the finished end-state
    // is the spec) — never let the scroll-scrubbed store value dim it.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--pour', '1');
      return;
    }
    const apply = (p: number) => el.style.setProperty('--pour', p.toFixed(4));
    apply(useWorkingSet.getState().pour);
    return useWorkingSet.subscribe((st, prev) => {
      if (st.pour !== prev.pour) apply(st.pour);
    });
  }, []);

  const n = PROJECTS.length;

  return (
    <section id="state-04" data-state="04" data-ink="live" className={s.sheet} aria-label="Sheet 04 of 4 · Shipped">
      <div className={s.frame}>
        <header className={s.head}>
          <span className={`${s.stateNo} u-mono`}>STAGE&nbsp;04</span>
          <span className={`${s.stateName} u-label`}>Shipped</span>
          <span className={`${s.sheetNo} u-mono`}>S-04 / 04</span>
        </header>

        <div className={s.body}>
          <div className={s.copyCol}>
            <p className={s.kicker}>Sheet S-04</p>
            <div className={s.lead}>
              <h2 className={s.pour}>Made</h2>
              <p className={s.leadNote}>
                Judgment, mission, management, relationships, and growth still
                need human agency
              </p>
            </div>

            <div className={s.schedule} ref={scheduleRef} style={{ '--n': n } as React.CSSProperties}>
              {/* the waterline — same store value as the 3D section plane */}
              <div className={s.waterline} data-waterline aria-hidden="true">
                <span className={s.waterTag}>POUR</span>
              </div>

              {PROJECTS.map((p, i) => {
                const up = isUp(health, p.href);
                const live = p.live && up;
                const primaryHref = p.href ?? p.repo ?? '#';
                return (
                  <article
                    className={s.row}
                    key={p.id}
                    style={{ '--i': i } as React.CSSProperties}
                    data-live={live ? 'true' : 'false'}
                  >
                    <span className={s.rowSheet}>
                      {p.sheet}
                      <svg className={s.diamond} viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z" />
                      </svg>
                    </span>
                    <div className={s.rowMain}>
                      <span className={s.titleLine}>
                        <a className={s.title} href={primaryHref} target="_blank" rel="noreferrer">
                          {p.title}
                        </a>
                        {p.href && p.repo && (
                          <a className={s.repoLink} href={p.repo} target="_blank" rel="noreferrer">
                            repo&nbsp;↗
                          </a>
                        )}
                        {!p.href && (
                          <span className={s.repoOnly}>repo&nbsp;only</span>
                        )}
                        {p.href && !p.repo && (
                          <span className={s.repoOnly}>source&nbsp;private</span>
                        )}
                      </span>
                      <p className={s.role}>{p.note}</p>
                      <p className={s.factLine}>
                        <span className={s.stack}>{p.stack.join(' · ')}</span>
                      </p>
                      <p className={s.metricLine}>
                        {p.metrics.map((m) => {
                          const isEmail = !!m.value && m.value.includes('@');
                          return isEmail ? (
                            <a className={s.contact} key={m.value} href={`mailto:${m.value}`}>
                              <b>{m.value}</b>
                            </a>
                          ) : (
                            <span className={s.metric} key={m.label || m.value} title={m.source}>
                              <b>{m.value ?? '––––'}</b> {m.label}
                            </span>
                          );
                        })}
                        {p.href && (
                          <a
                            className={s.urlLink}
                            href={p.href}
                            target="_blank"
                            rel="noreferrer"
                            data-live={live ? 'true' : 'false'}
                          >
                            <span className={s.urlText}>{new URL(p.href).host}</span>
                          </a>
                        )}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Band cell — reserved for the R3F pour (the Margin Law). When the
              island runs, the L-101 overgrowth grows IN the scene (vines on
              the poured structure, Scene.tsx) and this cell stays bare; where
              it can't, the static finished flowerbed stands instead. */}
          <div className={s.bandCell} aria-hidden="true">
            <StaticFloor>
              <PlantingPlan />
            </StaticFloor>
          </div>
        </div>

        <div className={s.close}>
          <div className={s.scalebar} aria-hidden="true">
            <ScaleBar />
          </div>
          <p className={s.closeNote}>
            Create verification loops before scaling AI-generated work. Every
            serious AI workflow needs checks for correctness, security,
            durability, and fit with the original goal.
          </p>
        </div>
      </div>
    </section>
  );
}

/** A drafting graphic scale — anchors the sheet and reads as a real drawing. */
function ScaleBar() {
  const ticks = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 300 34" role="img" aria-label="Graphic scale">
      <line x1="6" y1="22" x2="294" y2="22" stroke="currentColor" strokeWidth="1" />
      {ticks.map((t) => {
        const x = 6 + (t / 5) * 288;
        return (
          <g key={t}>
            <line x1={x} y1="16" x2={x} y2="22" stroke="currentColor" strokeWidth="1" />
            <text
              x={x}
              y="12"
              fill="currentColor"
              fontFamily="var(--font-mono)"
              fontSize="8"
              textAnchor="middle"
            >
              {t}
            </text>
          </g>
        );
      })}
      {/* alternating filled scale segments, drafting convention */}
      {ticks.slice(0, 5).map((t) =>
        t % 2 === 0 ? (
          <rect
            key={`f${t}`}
            x={6 + (t / 5) * 288}
            y="22"
            width={288 / 5}
            height="4"
            fill="currentColor"
          />
        ) : null,
      )}
      <text x="6" y="34" fill="currentColor" fontFamily="var(--font-mono)" fontSize="7.5">
        SHIPPED UNITS
      </text>
    </svg>
  );
}
