import Sheet from './Sheet';
import { Line, Path, Dim } from '../drafting/Marks';
import { IgnitionGlyph } from './SheetGlyphs';
import copy from './copy.module.css';

/**
 * STATE 02 — DESIGN. Cyanotype. The sketch is resolved into a dimensioned
 * blueprint: witness lines, extension lines, mono spec strings with REAL
 * numbers from this site's own design system. Dark theme renders as a true
 * cyanotype negative (blue ground, pale lines).
 */
export default function SheetBlueprint() {
  return (
    <Sheet
      n="02"
      state="Design"
      ink="cyanotype"
      drawingSide="left"
      negative
      drawing={
        <>
          <Plan />
          <p className={copy.drawingCaption}>PLAN · FOUR STATES · N.T.S.</p>
        </>
      }
    >
      <p className={copy.eyebrow}>Sheet S-02 · design intent</p>
      <h2 className={copy.heading}>Resolved, dimensioned, spec&#8209;locked</h2>
      <p className={copy.lede}>
        Imagination machine <IgnitionGlyph />
      </p>
      <dl className={copy.spec}>
        <SpecRow k="Type family" v="Archivo / Martian Mono" />
        <SpecRow k="Ink budget" v="4 (1 accent)" />
        <SpecRow k="Base grid" v="2.25 rem" />
        <SpecRow k="Motion verbs" v={'draw · hinge · pour'} />
        <SpecRow k="Contrast floor" v="WCAG AA" />
      </dl>
    </Sheet>
  );
}

function SpecRow({ k, v }: { k: string; v: string | null }) {
  return (
    <div className={copy.specRow}>
      <span className={copy.specKey}>{k}</span>
      <span className={copy.specVal} data-empty={v === null ? 'true' : undefined}>
        {v}
      </span>
    </div>
  );
}

function Plan() {
  // Stroke order (data-o) is one continuous drafting path — structure first,
  // annotations after, walking the perimeter — so the carriage travels like a
  // hand across the sheet instead of crisscrossing it.
  return (
    <svg viewBox="0 0 400 480" role="img" aria-label="Dimensioned plan of the design system">
      {/* outer plan rectangle */}
      <Path d="M70 80 L330 80 L330 420 L70 420 Z" w={1.6} o={0} />

      {/* interior partitions -> a 2x2 = the four states in plan */}
      <Line x1={70} y1={250} x2={330} y2={250} w={1} o={1} />
      <Line x1={200} y1={80} x2={200} y2={420} w={1} o={2} />

      {/* a door swing (design flourish that MEANS an opening) */}
      <Path d="M200 250 A40 40 0 0 1 240 290" w={0.8} o={3} />
      <Line x1={200} y1={250} x2={200} y2={290} w={0.8} o={3} />

      {/* grid tick module marker — back to the top-left corner */}
      <Line x1={70} y1={80} x2={82} y2={92} w={0.7} o={4} />

      {/* witness/extension lines — top pair, then the left pair on the way down */}
      {[70, 330].map((x, i) => (
        <Line key={`wx${x}`} x1={x} y1={60} x2={x} y2={40} w={0.7} o={5 + i} />
      ))}
      {[80, 420].map((y, i) => (
        <Line key={`wy${y}`} x1={60} y1={y} x2={40} y2={y} w={0.7} o={8 + i} />
      ))}

      {/* room tags */}
      {[
        { x: 135, y: 170, t: '01' },
        { x: 265, y: 170, t: '02' },
        { x: 135, y: 340, t: '03' },
        { x: 265, y: 340, t: '04' },
      ].map((r) => (
        <text
          key={r.t}
          x={r.x}
          y={r.y}
          fill="currentColor"
          fontFamily="var(--font-mono)"
          fontSize={13}
          textAnchor="middle"
          style={{ letterSpacing: '0.05em' }}
        >
          {r.t}
        </text>
      ))}

      {/* dimension strings — top, down the left, then across the bottom */}
      <Dim x1={70} y1={48} x2={330} y2={48} value="1440" o={7} />
      <Dim x1={44} y1={80} x2={44} y2={420} value={null} o={10} />
      <Dim x1={70} y1={440} x2={200} y2={440} value="720" o={11} />
      <Dim x1={200} y1={440} x2={330} y2={440} value="720" o={12} />

      <text x={90} y={104} fill="currentColor" fontFamily="var(--font-mono)" fontSize={9}>
        2.25
      </text>
    </svg>
  );
}
