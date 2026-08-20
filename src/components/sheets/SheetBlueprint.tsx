import type { CSSProperties } from 'react';
import Sheet from './Sheet';
import InstrumentsOverlay from './InstrumentsOverlay';
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
 * THE SET'S SECOND CREWED SHEET: the design sheet is where drafting happens,
 * so arriving at it starts a performance — DrawingSet plots the plan in full
 * view on its own clock (never scrubbed by scroll): structure, each room
 * furnished with its stage's convention, annotations, then THE RISE, a
 * plan-oblique massing whose room heights are the pipeline order. The
 * carriage rides the front stroke; spec rows ignite and lettering arrives on
 * the drawing's clock (--act).
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
      <p className={copy.eyebrow} data-rise="">Sheet S-02 · design intent</p>
      <FitHeading className={`${copy.heading} ${copy.headingFit}`} lines={['Solving', 'Bottlenecks']} />
      <p className={`${copy.lede} ${copy.ledeLarge}`} data-rise="">
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
  // sheet instead of crisscrossing it. This order is what the act performs on
  // its own clock, and each <text> letters in (--reveal) only after the
  // linework it names has been drawn.
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
        { x: 135, y: 170, t: '01', rv: 0.19 },
        { x: 265, y: 170, t: '02', rv: 0.25 },
        { x: 135, y: 340, t: '03', rv: 0.31 },
        { x: 265, y: 340, t: '04', rv: 0.37 },
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
      <Dim x1={70} y1={48} x2={330} y2={48} value="1440" o={11} reveal={0.44} />
      <Dim x1={44} y1={80} x2={44} y2={420} value={null} o={14} />
      <Dim x1={70} y1={440} x2={200} y2={440} value="720" o={15} reveal={0.6} />
      <Dim x1={200} y1={440} x2={330} y2={440} value="720" o={16} reveal={0.63} />

      <text
        x={90}
        y={104}
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize={9}
        style={{ '--reveal': 0.4 } as CSSProperties}
      >
        2.25
      </text>

      {/* THE RISE — the annotated plan projects into a plan-oblique massing,
          the beat a drawing set earns only after the plan is dimensioned.
          Heights are honest: each room extrudes to its STAGE's height in the
          pipeline (01 lowest, 04 tallest), so the massing is a bar chart of
          progress wearing its own architecture. Same wireframe language the
          S-03 frame assembles in, so the act hands off to the WebGL band
          mid-thought. Crossing the dim strings is deliberate — the table's
          rules pass through the print, and a projection passes through its
          own annotations. */}
      <AxonRise />

      {/* the drafter's tools land on the sheet last, and they really move */}
      <InstrumentsOverlay />
    </svg>
  );
}

/**
 * Plan-oblique extrusion of the four stages. Plan geometry stays true (the
 * drafting convention) and each room rises up-right at 45 degrees to a height
 * proportional to its place in the pipeline — 01 lowest through 04 tallest —
 * so the massing is a real figure of progress, not decoration. Drawn last
 * (data-o 20+) and slightly slowed (data-draw-speed) so the rise reads as the
 * act's finale.
 */
function AxonRise() {
  const rooms: { c: [number, number][]; h: number; o: number }[] = [
    { c: [[70, 80], [200, 80], [200, 250], [70, 250]], h: 25, o: 20 },
    { c: [[200, 80], [330, 80], [330, 250], [200, 250]], h: 50, o: 22 },
    { c: [[70, 250], [200, 250], [200, 420], [70, 420]], h: 75, o: 24 },
    { c: [[200, 250], [330, 250], [330, 420], [200, 420]], h: 100, o: 26 },
  ];
  return (
    <g data-draw-speed="0.8">
      {rooms.map((r, ri) => {
        const dx = Math.round(r.h * 0.7);
        const dy = -Math.round(r.h * 0.7);
        const top = r.c.map(([x, y]) => `${x + dx} ${y + dy}`);
        return (
          <g key={ri}>
            {r.c.map(([x, y], ci) => (
              <Line
                key={ci}
                x1={x}
                y1={y}
                x2={x + dx}
                y2={y + dy}
                w={0.9}
                o={r.o}
              />
            ))}
            <Path
              d={`M${top[0]} L${top[1]} L${top[2]} L${top[3]} Z`}
              w={1.1}
              o={r.o + 1}
            />
          </g>
        );
      })}
    </g>
  );
}
