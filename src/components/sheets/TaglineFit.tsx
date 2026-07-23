'use client';

import { useLayoutEffect, useRef } from 'react';
import copy from './copy.module.css';

/**
 * The cover pipeline, set as two flush lines: the machine pipeline above, the
 * human audit clause below scaled so its measure lands exactly at the end of
 * "engineering" — the same fit-to-width move FitHeading makes on S-02. The CSS
 * size is the no-JS fallback (line two simply runs shorter).
 */
export default function TaglineFit() {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const p = ref.current;
    if (!p) return;
    const [g1, g2] = Array.from(p.children) as HTMLElement[];

    const measure = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect().width;
      range.detach();
      return w;
    };

    const fit = () => {
      g2.style.fontSize = ''; // remeasure from the CSS fallback size
      const w1 = measure(g1);
      const w2 = measure(g2);
      const base = parseFloat(getComputedStyle(g2).fontSize);
      if (!w1 || !w2 || !base) return;
      let size = base * (w1 / w2);
      g2.style.fontSize = `${size}px`;
      // Corrective pass: spacing does not scale perfectly linearly with the
      // type, so measure once more at the fitted size and trim the residual.
      const w2b = measure(g2);
      if (w2b) {
        size *= w1 / w2b;
        g2.style.fontSize = `${size}px`;
      }
    };

    fit();
    // Refit once real glyph metrics arrive, and on any measure change.
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(p);
    return () => ro.disconnect();
  }, []);

  return (
    <p ref={ref} className={copy.tagline}>
      <span className={copy.taglineGroup}>
        <span className={copy.s1}>idea</span> → <span className={copy.s2}>design</span> →{' '}
        <span className={copy.s3}>engineering</span>
      </span>
      <span className={copy.taglineGroup}>
        → <span className={copy.audit}>audit</span>{' '}
        <span className={copy.loopGlyph} role="img" aria-label="verification loop, then">
          <LoopGlyph />
        </span>{' '}
        <span className={copy.s4}>shipped</span>
      </span>
    </p>
  );
}

/**
 * The audit cycle, drawn instead of typed: a 270° arc with a drafting
 * arrowhead, indexing through quarter turns like a mechanical carriage —
 * the review loop running. CSS drives the motion (copy.module.css); it
 * parks for prefers-reduced-motion.
 */
function LoopGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {/* clockwise from 12 o'clock, 270° around to 9 o'clock */}
      <path
        d="M 8 2.5 A 5.5 5.5 0 1 1 2.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {/* arrowhead at the open end, aimed along the travel (upward) */}
      <polygon points="0.7,9.2 4.3,9.2 2.5,5.4" fill="currentColor" />
    </svg>
  );
}
