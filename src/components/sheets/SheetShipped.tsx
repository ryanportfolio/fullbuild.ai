'use client';

import { PROJECTS } from '@/lib/projects';
import { useWorkingSet } from '@/lib/store';
import { useHealthProbe } from '@/lib/health';
import s from './shipped.module.css';

/**
 * STATE 04 — SHIPPED. Revision-red arrives for the FIRST and ONLY time, and only
 * on elements genuinely live in production. A project that fails the health
 * probe de-ignites to graphite — red never asserts what it can't prove. This is
 * the recruiter landing zone: real links, no theater in the way.
 */
export default function SheetShipped() {
  useHealthProbe();
  const health = useWorkingSet((st) => st.health);

  return (
    <section id="state-04" data-state="04" data-ink="live" className={s.sheet} aria-label="Sheet 04 of 4 — Shipped">
      <div className={s.frame}>
        <header className={s.head}>
          <span className={`${s.stateNo} u-mono`}>STATE&nbsp;04</span>
          <span className={`${s.stateName} u-label`}>Shipped</span>
          <span className={`${s.sheetNo} u-mono`}>S-04 / 4</span>
        </header>

        <p className={s.kicker}>Sheet S-04 · shipped payload</p>
        <div className={s.lead}>
          <h2 className={s.pour}>The&nbsp;Pour</h2>
          <p className={s.leadNote}>
            The frame fills and the cladding goes on. Below, the accent is spent
            on one thing only — the mark of what is live in production right now.
          </p>
        </div>

        {PROJECTS.length === 0 ? (
          <p className={s.empty}>
            [ awaiting shipment — witness lines reserved, no fabricated payload ]
          </p>
        ) : (
          <div className={s.ledger}>
            {PROJECTS.map((p) => {
              const up = health[p.href] !== false; // undefined = assume live until probed
              const live = p.live && up;
              return (
                <article className={s.row} key={p.id}>
                  <span className={s.rowSheet}>{p.sheet}</span>
                  <div>
                    <a
                      className={s.title}
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                      data-live={live ? 'true' : 'false'}
                    >
                      <span className={s.dot} aria-hidden="true" />
                      {p.title}
                    </a>
                    <p className={s.role}>{p.note}</p>
                    <p className={s.stack}>{p.stack.join('  ·  ')}</p>
                  </div>
                  <div className={s.metrics}>
                    {p.metrics.map((m) => (
                      <div className={s.metric} key={m.label}>
                        <div className={s.metricVal} data-empty={m.value === null ? 'true' : undefined}>
                          {m.value}
                        </div>
                        <div className={s.metricLbl}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className={s.close}>
          <div className={s.scalebar} aria-hidden="true">
            <ScaleBar />
          </div>
          <p className={s.closeNote}>
            Revision&#8209;red is spent on one semantic: <b>live in production</b>.
            A project that goes down falls back to graphite — the accent never
            asserts what it can&apos;t reach.
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
