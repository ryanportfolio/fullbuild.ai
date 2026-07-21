'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWorkingSet, isUp, type PipelineState } from '@/lib/store';
import { LIVE_PROJECTS } from '@/lib/projects';
import RailLogo from './RailLogo';
import RailSketch from './RailSketch';
import styles from './TitleBlock.module.css';

/**
 * Day/night glyphs for the ground toggle — drawn, not iconed: the sun is a
 * drafting circle with eight witness rays, the moon a crescent cut by a second
 * circle. Each glows via its CSS class (layered drop-shadows + a slow breath).
 */
function SunGlyph() {
  return (
    <svg className={styles.sunGlyph} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" fill="currentColor" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 8 + Math.cos(a) * 4.6;
        const y1 = 8 + Math.sin(a) * 4.6;
        const x2 = 8 + Math.cos(a) * 6.6;
        const y2 = 8 + Math.sin(a) * 6.6;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg className={styles.moonGlyph} viewBox="0 0 16 16" aria-hidden="true">
      {/* crescent: full disc minus an offset disc, via even-odd-ish mask */}
      <mask id="ws-moon-cut">
        <rect width="16" height="16" fill="white" />
        <circle cx="10.6" cy="6.2" r="4.6" fill="black" />
      </mask>
      <circle cx="8" cy="8" r="5.2" fill="currentColor" mask="url(#ws-moon-cut)" />
      {/* two witness stars */}
      <circle cx="12.4" cy="3.4" r="0.7" fill="currentColor" />
      <circle cx="13.6" cy="6.8" r="0.45" fill="currentColor" />
    </svg>
  );
}

const STATE_NAMES = ['Idea', 'Design', 'Engineering', 'Shipped'] as const;
const ANCHORS = ['state-01', 'state-02', 'state-03', 'state-04'] as const;

function scrollTo(anchor: string) {
  const el = document.getElementById(anchor);
  if (!el) return;
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * THE RAIL — the Margin Law's visible edge. A fixed full-height title-block
 * column: registration mark, vertical set lettering, per-sheet ticker, and the
 * title block itself at the bottom. The IN SERVICE line is a live aggregate of
 * the health probe — a measurement, so it may spend the accent.
 */
export default function TitleBlock({ rev, sha }: { rev: string; sha: string }) {
  const state = useWorkingSet((s) => s.state);
  const health = useWorkingSet((s) => s.health);
  // On the standalone dispatch sheet the set's sheet counter, stage nav, and
  // service rows have nothing to point at; the block carries one instruction
  // home instead.
  const onContact = usePathname() === '/contact';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cur = (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
    setTheme(cur);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('ws-theme', next);
    } catch {
      /* private mode — theme just won't persist */
    }
    setTheme(next);
  };

  const nn = String(state).padStart(2, '0');
  // Aggregate probe: count only once readings exist; missing = assume live.
  const probed = Object.keys(health).length > 0;
  const upCount = LIVE_PROJECTS.filter((p) => isUp(health, p.href)).length;

  return (
    <aside className={styles.rail} data-rail aria-label="Drawing set title block and navigation">
      <svg className={styles.reg} viewBox="0 0 16 16" aria-hidden="true">
        <line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1" />
        <line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="1" />
        <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      {/* Upper reach: the mark holds the space beside the vertical lettering —
          half pencil, half poured, drawn after the wordmark settles. */}
      <div className={styles.upper}>
        <a href="/" className={styles.logoLink} aria-label="The Working Set — home">
          <RailLogo className={styles.logo} />
        </a>
        <span className={styles.setName}>The Working Set</span>
      </div>

      {/* Rail rule + site log share the rail's middle reach: the station ruler
          keeps time on the left; beside it, the site-log pencil record draws
          itself as the reader advances the set. */}
      <div className={styles.scene} aria-hidden="true">
        <svg className={styles.ruler} viewBox="0 0 24 400" preserveAspectRatio="none">
          {Array.from({ length: 41 }).map((_, i) => {
            const y = (i / 40) * 400;
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1="0"
                y1={y}
                x2={major ? 10 : 5}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <line x1="0" y1="0" x2="0" y2="400" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <RailSketch className={styles.sketch} />
      </div>

      {/* Carriage telemetry — live readout of the one instrument. PenCarriage
          writes these cells directly (real coords, real mode, no theater). */}
      <div className={styles.telemetry} aria-hidden="true">
        <span className={styles.telemetryHead}>Carriage</span>
        <span id="pen-telemetry-mode" className={styles.telemetryLine}>
          idle
        </span>
        <span id="pen-telemetry-xy" className={styles.telemetryLine}>
          x ––– · y –––
        </span>
      </div>

      <div className={styles.block}>
        <div className={styles.top}>
          <a href="/contact" className={styles.brand} aria-label="Contact — hi@fullbuild.ai">
            hi@<b>fullbuild</b>.ai
          </a>
          <button
            className={styles.themeBtn}
            onClick={toggleTheme}
            aria-label={
              mounted && theme === 'dark' ? 'Switch to day table' : 'Switch to night table'
            }
          >
            {!mounted ? (
              'Ground'
            ) : theme === 'dark' ? (
              <>
                <MoonGlyph />
                Night
              </>
            ) : (
              <>
                <SunGlyph />
                Day
              </>
            )}
          </button>
        </div>

        {onContact ? (
          /* Dispatch sheet: one instruction, letter-large, back to the cover. */
          <a href="/" className={styles.homeCta}>
            <span className={styles.homeCtaLabel}>Return to</span>
            <span className={styles.homeCtaWord}>Homepage</span>
            <span className={styles.homeCtaArrow} aria-hidden="true">←</span>
          </a>
        ) : (
          <>
        <div className={styles.mid}>
          <span>
            <span className={styles.sheetLabel}>Sheet</span>
            <br />
            <span className={styles.sheetNo}>{nn} / 04</span>
          </span>
          <span className={styles.stateName}>{STATE_NAMES[state - 1]}</span>
        </div>

        <nav className={styles.nav}>
          {ANCHORS.map((anchor, i) => {
            const active = state === ((i + 1) as PipelineState);
            return (
              <button
                key={anchor}
                className={styles.navBtn}
                data-active={active ? 'true' : undefined}
                onClick={() => scrollTo(anchor)}
                aria-label={`Go to stage ${i + 1}, ${STATE_NAMES[i]}`}
                aria-current={active ? 'true' : undefined}
              >
                {String(i + 1).padStart(2, '0')}
              </button>
            );
          })}
        </nav>

        <div className={styles.service} data-lit={probed && upCount > 0 ? 'true' : undefined}>
          <span>IN SERVICE</span>
          <span>
            {/* red is spent on the measured numerator only — the total is not
                a probe-verified fact, so it stays in witness ink */}
            <b>{probed ? upCount : '·'}</b>
            <span className={styles.serviceTotal}>/{LIVE_PROJECTS.length}</span>
          </span>
        </div>

        <a
          href="/prototype"
          className={styles.drafts}
          aria-label="View design prototypes, 4 on file"
        >
          <span>PROTOTYPES</span>
          <span>04 →</span>
        </a>
          </>
        )}

        <div className={styles.rev}>
          <span>REV {rev}</span>
          <span>{sha}</span>
        </div>
      </div>
    </aside>
  );
}
