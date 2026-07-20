'use client';

import { useEffect, useState } from 'react';
import { useWorkingSet, type PipelineState } from '@/lib/store';
import styles from './TitleBlock.module.css';

const STATE_NAMES = ['Idea', 'Design', 'Engineering', 'Shipped'] as const;
const ANCHORS = ['state-01', 'state-02', 'state-03', 'state-04'] as const;

function scrollTo(anchor: string) {
  const el = document.getElementById(anchor);
  if (!el) return;
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function TitleBlock({ rev, sha }: { rev: string; sha: string }) {
  const state = useWorkingSet((s) => s.state);
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

  return (
    <aside className={styles.block} aria-label="Drawing set title block and navigation">
      <div className={styles.top}>
        <span className={styles.brand}>
          <b>fullbuild</b>.ai
        </span>
        <button className={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle drafting ground">
          {mounted ? (theme === 'dark' ? 'Table' : 'Vellum') : 'Ground'}
        </button>
      </div>

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
              aria-label={`Go to state ${i + 1}, ${STATE_NAMES[i]}`}
              aria-current={active ? 'true' : undefined}
            >
              {String(i + 1).padStart(2, '0')}
            </button>
          );
        })}
      </nav>

      <div className={styles.rev}>
        <span>REV {rev}</span>
        <span>{sha}</span>
      </div>
    </aside>
  );
}
