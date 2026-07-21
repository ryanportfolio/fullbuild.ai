import { PROJECTS } from '@/lib/projects';
import styles from './legend.module.css';

/**
 * MATERIALS LEGEND — the cover's language schedule, drawn as a real drafting
 * convention: every language is a construction MATERIAL with its own hatch, and
 * the matrix records which of the 11 drawings each material was specified in.
 * Present = a hatched cell in that material's pattern; absent = a witness tick
 * (the honest empty convention shared with Dim). It is generated wholly from
 * `Project.langs`, so every count it prints is the data — nothing to drift, no
 * fake proportion. Graphite only: revision-red stays reserved for the live
 * probe (SheetIndex), never spent on a legend.
 *
 * A legend is a pre-printed reference block, not a plotted stroke — so this is
 * intentionally NOT `ws-draw`. It reads fully inked while the cover plots,
 * exactly as a title block or key does on a real sheet, and needs no JS.
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

const KNOWN = new Set(HATCH.map((h) => h.lang));
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
}));
const totalMarks = PROJECTS.reduce((n, p) => n + p.langs.length, 0);

const label =
  `Materials legend — ${HATCH.length} languages across ${COLS} drawings. ` +
  rows.map((r) => `${r.lang} in ${r.count}`).join(', ') + '.';

export default function MaterialLegend() {
  return (
    <figure className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className={styles.svg}
      >
        <defs>
          {/* Each material a distinct hatch. userSpaceOnUse ties the tile to the
              viewBox so hatches scale with the drawing and read the same at any
              width. Stroke = graphite var → flips correctly on the night table. */}
          <pattern id="h-ts" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
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
        <text x={SW_X} y={23} className={styles.sub}>
          languages · one hatch each · columns are the {COLS} drawings
        </text>

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
          return (
            <g key={r.id}>
              {/* material swatch */}
              <rect x={SW_X} y={cy - SW / 2} width={SW} height={SW} fill={`url(#${r.id})`} />
              <rect x={SW_X} y={cy - SW / 2} width={SW} height={SW} fill="none" stroke="var(--ink-graphite)" strokeWidth="0.8" />
              <text x={NAME_X} y={cy} className={styles.name} dominantBaseline="middle">
                {r.lang}
              </text>

              {/* presence matrix */}
              {r.used.map((on, j) => {
                const cx = cellCX(j);
                return on ? (
                  <g key={j}>
                    <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={`url(#${r.id})`} />
                    <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="none" stroke="var(--ink-graphite)" strokeWidth="0.5" />
                  </g>
                ) : (
                  // honest witness: a dashed gap where this material is not used
                  <line key={j} x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy + 4} stroke="var(--ink-witness)" strokeWidth="0.7" strokeDasharray="1 2" />
                );
              })}

              {/* count — derived, right-aligned */}
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
    </figure>
  );
}
