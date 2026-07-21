'use client';

import { useEffect, useRef, useState } from 'react';
import { PROJECTS } from '@/lib/projects';
import styles from './legend.module.css';

/**
 * MATERIALS LEGEND — the cover's language schedule, drawn as a real drafting
 * convention: every language is a construction MATERIAL with its own hatch, and
 * the matrix records which of the 11 drawings each material was specified in.
 * Present = a hatched cell in that material's pattern; absent = a witness tick
 * (the honest empty convention shared with Dim). Generated wholly from
 * `Project.langs`, so every count it prints is the data — nothing to drift.
 * Graphite only: revision-red stays reserved for the live probe (SheetIndex).
 *
 * Hover / focus / tap a material row and a DETAIL callout draws the full
 * assembly built on that language — the frameworks and libraries the legend
 * deliberately omits (React, Next.js, Astro…), each drawing's real `stack`.
 * On wide sheets the callout is an absolute overlay to the RIGHT of the
 * legend (beside the rows it details, bottom-aligned) so the copy column
 * never shifts. On narrow, stacked sheets it expands IN FLOW below the legend
 * like an accordion — an overlay there would scroll behind the fixed bottom
 * title-block strip. The row highlights, the rest dim.
 */

// Material palette — order fixed by prominence / first appearance, each a
// distinct hatch. The guard below fails the build if projects.ts ever names a
// language with no hatch here, so the drawing can never silently omit a material.
const HATCH = [
  { lang: 'TypeScript', id: 'h-ts' },
  { lang: 'Python', id: 'h-py' },
  { lang: 'C#', id: 'h-cs' },
  { lang: 'PowerShell', id: 'h-ps' },
  { lang: 'JavaScript', id: 'h-js' },
  { lang: 'HTML', id: 'h-html' },
  { lang: 'GLSL', id: 'h-glsl' },
] as const;

const KNOWN = new Set<string>(HATCH.map((h) => h.lang));
for (const lang of new Set(PROJECTS.flatMap((p) => p.langs))) {
  if (!KNOWN.has(lang)) {
    throw new Error(
      `MaterialLegend: language "${lang}" in projects.ts has no hatch pattern. ` +
        `Add it to HATCH or drop it from the project's langs.`,
    );
  }
}

// ── geometry (viewBox units) ──────────────────────────────────────────────
const COLS = PROJECTS.length;
const W = 384;
const SW_X = 4; // swatch left
const SW = 14; // swatch size
const NAME_X = 24;
const MAT_X0 = 116;
const MAT_X1 = 344;
const PITCH = (MAT_X1 - MAT_X0) / COLS;
const COUNT_X = 372;
const HEAD_Y = 34;
const RULE_Y = 39;
const ROWS_TOP = 43;
const RP = 22;
const H = ROWS_TOP + HATCH.length * RP + 20;

const cellCX = (j: number) => MAT_X0 + PITCH * j + PITCH / 2;
const rowCY = (i: number) => ROWS_TOP + i * RP + RP / 2;

const rows = HATCH.map((h) => ({
  ...h,
  used: PROJECTS.map((p) => p.langs.includes(h.lang)),
  count: PROJECTS.filter((p) => p.langs.includes(h.lang)).length,
  // full assembly: every drawing built on this material, with its real stack
  assembly: PROJECTS.filter((p) => p.langs.includes(h.lang)).map((p) => ({
    sheet: p.sheet,
    title: p.title,
    stack: p.stack,
  })),
}));
const totalMarks = PROJECTS.reduce((n, p) => n + p.langs.length, 0);

const svgLabel =
  `Materials legend: ${HATCH.length} languages across ${COLS} drawings. ` +
  rows.map((r) => `${r.lang} in ${r.count}`).join(', ') + '.';

export default function MaterialLegend() {
  const [active, setActive] = useState<string | null>(null);
  // Pinned = kept open by a click, so the reader can move onto the callout (and
  // read all of it) without the pointer leaving a row and dismissing it. Hover
  // only previews; a pinned selection ignores hover so crossing other rows on
  // the way to the callout never swaps the content out from under the cursor.
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const activeRow = rows.find((r) => r.lang === active) ?? null;

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    // 240ms grace: on wide sheets the callout sits to the RIGHT of the legend,
    // so the pointer crosses a real gap to reach it — enough time not to lose it.
    closeTimer.current = window.setTimeout(() => setActive(null), 240);
  };
  const preview = (lang: string) => {
    cancelClose();
    if (!pinned) setActive(lang);
  };
  const focusLang = (lang: string) => {
    cancelClose();
    setActive(lang);
  };
  const toggle = (lang: string) => {
    cancelClose();
    if (pinned && active === lang) {
      setPinned(false);
      setActive(null);
    } else {
      setActive(lang);
      setPinned(true);
    }
  };
  const close = () => {
    cancelClose();
    setPinned(false);
    setActive(null);
  };
  useEffect(() => cancelClose, []);

  return (
    <figure
      className={styles.wrap}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div className={styles.board}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={svgLabel}
          className={styles.svg}
        >
          <defs>
            {/* Each material a distinct hatch. userSpaceOnUse ties the tile to
                the viewBox so hatches scale with the drawing and read the same at
                any width. Stroke = graphite var → flips on the night table. */}
            <pattern id="h-ts" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0,5 L5,0" stroke="var(--ink-graphite)" strokeWidth="0.7" />
            </pattern>
            <pattern id="h-py" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0,5 L5,0 M0,0 L5,5" stroke="var(--ink-graphite)" strokeWidth="0.6" />
            </pattern>
            <pattern id="h-cs" width="5" height="4" patternUnits="userSpaceOnUse">
              <path d="M0,2 L5,2" stroke="var(--ink-graphite)" strokeWidth="0.7" />
            </pattern>
            <pattern id="h-ps" width="4" height="5" patternUnits="userSpaceOnUse">
              <path d="M2,0 L2,5" stroke="var(--ink-graphite)" strokeWidth="0.7" />
            </pattern>
            <pattern id="h-js" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="2.5" cy="2.5" r="0.8" fill="var(--ink-graphite)" />
            </pattern>
            <pattern id="h-html" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0,0 L5,5" stroke="var(--ink-graphite)" strokeWidth="0.6" strokeDasharray="2 1.6" />
            </pattern>
            <pattern id="h-glsl" width="3" height="3" patternUnits="userSpaceOnUse">
              <path d="M0,3 L3,0" stroke="var(--ink-graphite)" strokeWidth="0.55" />
            </pattern>
          </defs>

          {/* title block */}
          <text x={SW_X} y={12} className={styles.title}>MATERIALS LEGEND</text>

          {/* column heads: drawing number 1…11, over the matrix */}
          {PROJECTS.map((p, j) => (
            <text key={p.id} x={cellCX(j)} y={HEAD_Y} className={styles.colno} textAnchor="middle">
              {j + 1}
            </text>
          ))}
          <line x1={SW_X} y1={RULE_Y} x2={MAT_X1} y2={RULE_Y} stroke="var(--rule-strong)" strokeWidth="0.8" />

          {/* rows: swatch · name · presence matrix · count */}
          {rows.map((r, i) => {
            const cy = rowCY(i);
            const dim = active !== null && active !== r.lang;
            return (
              <g key={r.id} opacity={dim ? 0.28 : 1} style={{ transition: 'opacity .18s ease' }}>
                <rect x={SW_X} y={cy - SW / 2} width={SW} height={SW} fill={`url(#${r.id})`} />
                <rect x={SW_X} y={cy - SW / 2} width={SW} height={SW} fill="none" stroke="var(--ink-graphite)" strokeWidth={active === r.lang ? 1.4 : 0.8} />
                <text x={NAME_X} y={cy} className={styles.name} dominantBaseline="middle">
                  {r.lang}
                </text>

                {r.used.map((on, j) => {
                  const cx = cellCX(j);
                  return on ? (
                    <g key={j}>
                      <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={`url(#${r.id})`} />
                      <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="none" stroke="var(--ink-graphite)" strokeWidth="0.5" />
                    </g>
                  ) : (
                    <line key={j} x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy + 4} stroke="var(--ink-witness)" strokeWidth="0.7" strokeDasharray="1 2" />
                  );
                })}

                <text x={COUNT_X} y={cy} className={styles.count} textAnchor="end" dominantBaseline="middle">
                  {r.count}
                </text>

                {i < rows.length - 1 && (
                  <line x1={SW_X} y1={cy + RP / 2} x2={MAT_X1} y2={cy + RP / 2} stroke="var(--rule)" strokeWidth="0.6" />
                )}
              </g>
            );
          })}

          {/* footer schedule note — every figure derived from projects.ts */}
          <line x1={SW_X} y1={H - 14} x2={MAT_X1} y2={H - 14} stroke="var(--rule-strong)" strokeWidth="0.8" />
          <text x={SW_X} y={H - 3} className={styles.foot}>
            {HATCH.length} MATERIALS · {totalMarks} SPECIFIED · {COLS} DRAWINGS
          </text>
          <text x={COUNT_X} y={H - 3} className={styles.footKey} textAnchor="end">
            1 HATCH = 1 LANGUAGE
          </text>
        </svg>

        {/* interaction layer: one hit-strip per material row, aligned to the
            viewBox geometry in %, so hover/focus/tap works at any render width */}
        <div className={styles.hits}>
          {rows.map((r, i) => (
            <button
              key={r.id}
              type="button"
              className={styles.hit}
              style={{ top: `${((ROWS_TOP + i * RP) / H) * 100}%`, height: `${(RP / H) * 100}%` }}
              onMouseEnter={() => preview(r.lang)}
              onFocus={() => focusLang(r.lang)}
              onClick={() => toggle(r.lang)}
              aria-label={`${r.lang}: full assembly of ${r.count} drawing${r.count === 1 ? '' : 's'}`}
              aria-expanded={active === r.lang}
              aria-pressed={pinned && active === r.lang}
            />
          ))}
        </div>
      </div>

      <p className={styles.afford} aria-hidden="true">
        <span className={styles.afford_mark}>▸</span>
        <span className={styles.affordFine}>hover to preview · click to keep open</span>
        <span className={styles.affordCoarse}>tap a material for its full assembly</span>
      </p>

      {/* DETAIL callout — absolute overlay, no layout shift, no inner scroll (the
          whole assembly is shown). Hovering the callout keeps it alive; a click
          on a row pins it so the pointer can travel here without dismissing it.
          Re-keyed on the active language so the draw-in animation retriggers. */}
      {activeRow && (
        <div
          className={styles.callout}
          key={activeRow.lang}
          role="status"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className={styles.calloutHead}>
            <span className={styles.calloutLang}>{activeRow.lang}</span>
            <span className={styles.calloutMeta}>
              base of {activeRow.count} · full assembly
            </span>
            {pinned && (
              <button type="button" className={styles.calloutClose} onClick={close} aria-label="close">
                ✕
              </button>
            )}
          </div>
          <ul className={styles.asmList}>
            {activeRow.assembly.map((a, k) => (
              <li className={styles.asm} style={{ animationDelay: `${0.03 + k * 0.035}s` }} key={a.sheet}>
                <span className={styles.asmSheet}>{a.sheet}</span>
                <span className={styles.asmTitle}>{a.title}</span>
                <span className={styles.asmStack}>{a.stack.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
