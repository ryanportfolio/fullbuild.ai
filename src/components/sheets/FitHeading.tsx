'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Fits each line of a stacked heading to the heading's own measure — the same
 * fit-to-width move MastheadPlot makes for the cover title, scoped to a copy
 * column. Every word runs flush to the end of its line; the CSS fallback size
 * holds until (and without) JS.
 */
export default function FitHeading({ className, lines }: { className: string; lines: string[] }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return;
    const spans = Array.from(h.children) as HTMLElement[];

    const fit = () => {
      const target = h.clientWidth;
      if (!target) return;
      for (const span of spans) {
        span.style.fontSize = ''; // remeasure from the CSS fallback size
        const base = parseFloat(getComputedStyle(span).fontSize);
        const range = document.createRange();
        range.selectNodeContents(span);
        const textW = range.getBoundingClientRect().width;
        range.detach();
        if (!base || !textW) continue;
        span.style.fontSize = `${base * (target / textW)}px`;
      }
    };

    fit();
    // Refit once real glyph metrics arrive, and on any column resize.
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    return () => ro.disconnect();
  }, [lines]);

  return (
    <h2 ref={ref} className={className}>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </h2>
  );
}
