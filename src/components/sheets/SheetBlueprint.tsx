import type { CSSProperties } from 'react';
import Sheet from './Sheet';
import { Line, Path, Dim } from '../drafting/Marks';
import { IgnitionGlyph } from './SheetGlyphs';
import FitHeading from './FitHeading';
import copy from './copy.module.css';

/**
 * STATE 02 — DESIGN. Cyanotype. The sketch is resolved into a dimensioned
 * blueprint: witness lines, extension lines, mono spec strings with REAL
 * numbers from this site's own design system. Dark theme renders as a true
 * cyanotype negative (blue ground, pale lines).
 *
 * THE SET'S ONE ACT SHEET: the design sheet is where drafting happens, so it
 * is the sheet the reader drafts. `act` seats it on a sticky dwell and
 * DrawingSet hands its DRAW verb to the scroll — the plan plots stroke by
 * stroke under the reader's own hand, the carriage riding the front stroke,
 * and each spec row ignites (--act) as its figure is earned.
 */
export default function SheetBlueprint() {
  return (
    <Sheet
      n="02"
      state="Design"
      ink="cyanotype"
      drawingSide="left"
      negative
      act
      drawing={
        <>
          <Plan />
          <p className={copy.drawingCaption}>PLAN · FOUR STAGES · N.T.S.</p>
        </>
      }
    >
      <p className={copy.eyebrow}>Sheet S-02 · design intent</p>
      <FitHeading className={`${copy.heading} ${copy.headingFit}`} lines={['Solving', 'Bottlenecks']} />
      <p className={`${copy.lede} ${copy.ledeLarge}`}>
        Imagination machine <IgnitionGlyph />
      </p>
      <dl className={copy.spec} style={{ '--n': 5 } as CSSProperties}>
        <SpecRow i={0} k="Type family" v="Archivo / Martian Mono" />
        <SpecRow i={1} k="Ink budget" v="4 (1 accent)" />
        <SpecRow i={2} k="Base grid" v="2.25 rem" />
        <SpecRow i={3} k="Motion verbs" v={'draw · hinge · pour'} />
        <SpecRow i={4} k="Contrast floor" v="WCAG AA" />
      </dl>
    </Sheet>
  );
}

function SpecRow({ i, k, v }: { i: number; k: string; v: string | null }) {
  return (
    // dt/dd, not spans: a <dl> may only contain dt/dd groups (optionally
    // wrapped in a div). The classes carry all the styling, so this is a
    // semantics-only swap. --i feeds the act ignition (copy.module.css).
    <div className={copy.specRow} style={{ '--i': i } as CSSProperties}>
      <dt className={copy.specKey}>{k}</dt>
      <dd className={copy.specVal} data-empty={v === null ? 'true' : undefined}>
        {v}
      </dd>
    </div>
  );
}

function Plan() {
  // Stroke order (data-o) is one continuous drafting path — structure first,
  // then each room furnished with ITS OWN STAGE'S convention (01 sketch, 02
  // dimensioned figure, 03 column grid, 04 pour hatch), annotations last,
  // walking the perimeter — so the carriage travels like a hand across the
  // sheet instead of crisscrossing it. On the act dwell this order is what the
  // reader's scroll plots, and each <text> letters in (--reveal) only after
  // the linework it names has been drawn.
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

      {/* ROOM 01 — IDEA: the loose pencil line a stage begins as */}
      <Path d="M104 132 C 114 114, 132 116, 138 130 S 158 144, 166 126" w={0.8} o={5} />

      {/* ROOM 02 — DESIGN: a figure with its dimension already on it */}
      <Path d="M246 114 L286 114 L286 140 L246 140 Z" w={0.9} o={6} />
      <Line x1={246} y1={106} x2={286} y2={106} w={0.7} o={6} />
      <Line x1={243} y1={103} x2={249} y2={109} w={0.7} o={6} />
      <Line x1={283} y1={103} x2={289} y2={109} w={0.7} o={6} />

      {/* ROOM 03 — ENGINEERING: two column-grid marks */}
      <Line x1={112} y1={306} x2={112} y2={322} w={0.8} o={7} />
      <Line x1={104} y1={314} x2={120} y2={314} w={0.8} o={7} />
      <Line x1={158} y1={306} x2={158} y2={322} w={0.8} o={7} />
      <Line x1={150} y1={314} x2={166} y2={314} w={0.8} o={7} />

      {/* ROOM 04 — SHIPPED: the pour hatch, poured into the corner */}
      <Line x1={252} y1={318} x2={268} y2={302} w={0.8} o={8} />
      <Line x1={262} y1={320} x2={280} y2={302} w={0.8} o={8} />
      <Line x1={272} y1={322} x2={292} y2={302} w={0.8} o={8} />
      <Line x1={284} y1={322} x2={302} y2={304} w={0.8} o={8} />

      {/* grid tick module marker — back to the top-left corner */}
      <Line x1={70} y1={80} x2={82} y2={92} w={0.7} o={4} />

      {/* witness/extension lines — top pair, then the left pair on the way down */}
      {[70, 330].map((x, i) => (
        <Line key={`wx${x}`} x1={x} y1={60} x2={x} y2={40} w={0.7} o={9 + i} />
      ))}
      {[80, 420].map((y, i) => (
        <Line key={`wy${y}`} x1={60} y1={y} x2={40} y2={y} w={0.7} o={12 + i} />
      ))}

      {/* room tags — each letters in only after its room's mark is drawn
          (--reveal, in act travel; fallback = fully lettered) */}
      {[
        { x: 135, y: 170, t: '01', rv: 0.2 },
        { x: 265, y: 170, t: '02', rv: 0.31 },
        { x: 135, y: 340, t: '03', rv: 0.42 },
        { x: 265, y: 340, t: '04', rv: 0.53 },
      ].map((r) => (
        <text
          key={r.t}
          x={r.x}
          y={r.y}
          fill="currentColor"
          fontFamily="var(--font-mono)"
          fontSize={13}
          textAnchor="middle"
          style={{ letterSpacing: '0.05em', '--reveal': r.rv } as CSSProperties}
        >
          {r.t}
        </text>
      ))}

      {/* dimension strings — top, down the left, then across the bottom */}
      <Dim x1={70} y1={48} x2={330} y2={48} value="1440" o={11} reveal={0.68} />
      <Dim x1={44} y1={80} x2={44} y2={420} value={null} o={14} />
      <Dim x1={70} y1={440} x2={200} y2={440} value="720" o={15} reveal={0.86} />
      <Dim x1={200} y1={440} x2={330} y2={440} value="720" o={16} reveal={0.9} />

      <text
        x={90}
        y={104}
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize={9}
        style={{ '--reveal': 0.6 } as CSSProperties}
      >
        2.25
      </text>
    </svg>
  );
}
