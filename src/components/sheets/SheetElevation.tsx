import Sheet from './Sheet';
import { Dim, Line, Path } from '../drafting/Marks';
import MastheadPlot from '../motion/MastheadPlot';
import SheetIndex from './SheetIndex';
import MaterialLegend from './MaterialLegend';
import MarginStudy from '../motion/MarginStudy';
import TaglineFit from './TaglineFit';
import { LIVE_PROJECTS } from '@/lib/projects';
import copy from './copy.module.css';

/**
 * STAGE 01 — IDEA. Doubles as the set's cover: the wordmark is the drawing
 * TITLE, plotted at full sheet measure across its own band (clear zone — no
 * program element touches the letterforms), then dimensioned like any other
 * drawing on the set. Below it the cover program: a long-shed elevation of the
 * exact structure STAGE 04 pours (one bent per live project), then the SHEET
 * INDEX listing every drawing in the schedule. DRAW previews POUR.
 */
export default function SheetElevation() {
  return (
    <Sheet
      n="01"
      state="Idea"
      ink="graphite"
      drawingSide="right"
      masthead={
        <>
          <p className={copy.eyebrow}>Working drawing set · rev&#8209;controlled</p>
          <MastheadPlot text="fullbuild.ai" />
        </>
      }
      drawing={
        <div>
          <Elevation />
          <SheetIndex />
        </div>
      }
    >
      <TaglineFit />
      <MaterialLegend />
      <MarginStudy />
    </Sheet>
  );
}

/**
 * Front elevation of the long shed the pour fills: one structural bent per
 * live project, ridge line binding them into a single building. The same
 * geometry the R3F island erects in STATE 03 and pours in STATE 04.
 */
function Elevation() {
  const n = LIVE_PROJECTS.length;
  const x0 = 46;
  const x1 = 354;
  const groundY = 132;
  const eaveY = 74;
  const ridgeY = 52;
  const pitch = (x1 - x0) / n;

  return (
    // data-draw-speed 0.75: stroke travel AND the beat between strokes both
    // stretch by 1/0.75, roughly doubling the elevation's total plot time
    // against the old fixed stagger — the cover drawing draws at half pace.
    <svg
      viewBox="0 0 380 168"
      data-draw-speed="0.75"
      role="img"
      aria-label={`Elevation of the shipped structure: ${n} bents, one per live project`}
    >
      {/* construction lines: eave + ridge datums. Serpentine — the eave runs
          left→right, the ridge returns right→left — so the pen sweeps back
          instead of snapping across the sheet between datums. */}
      <Line x1={x0 - 18} y1={eaveY} x2={x1 + 18} y2={eaveY} ink="graphite" w={0.5} dash="2 4" o={0} />
      <Line x1={x1 + 18} y1={ridgeY} x2={x0 - 18} y2={ridgeY} ink="graphite" w={0.5} dash="2 4" o={1} />

      {/* ground line + hatch */}
      <Line x1={x0 - 26} y1={groundY} x2={x1 + 26} y2={groundY} ink="graphite" w={1.5} o={2} />
      {Array.from({ length: 14 }).map((_, i) => {
        const x = x0 - 14 + i * 24;
        return <Line key={`g${i}`} x1={x} y1={groundY} x2={x - 8} y2={groundY + 10} ink="graphite" w={0.6} o={3} />;
      })}

      {/* bents: column + gable profile per live project, ridge purlin binding */}
      {Array.from({ length: n }).map((_, i) => {
        const bx = x0 + i * pitch;
        const cx = bx + pitch / 2;
        return (
          <g key={`b${i}`}>
            <Line x1={bx} y1={groundY} x2={bx} y2={eaveY} ink="graphite" w={1.1} o={5 + i} />
            <Path d={`M${bx} ${eaveY} L${cx} ${ridgeY} L${bx + pitch} ${eaveY}`} ink="graphite" w={1} o={6 + i} />
          </g>
        );
      })}
      <Line x1={x1} y1={groundY} x2={x1} y2={eaveY} ink="graphite" w={1.1} o={5 + n} />
      {/* ridge line binding the bents into one building */}
      <Line x1={x0 + pitch / 2} y1={ridgeY} x2={x1 - pitch / 2} y2={ridgeY} ink="graphite" w={0.8} o={7 + n} />

      {/* keystone diamond at the first ridge — graphite here; it earns red
          only in STATE 04, and only from the probe */}
      <Path
        d={`M${x0 + pitch / 2} ${ridgeY - 10} l5 5 l-5 5 l-5 -5 Z`}
        ink="graphite"
        w={1}
        o={8 + n}
      />

      <Annotation n={n} x0={x0} x1={x1} pitch={pitch} groundY={groundY} eaveY={eaveY} ridgeY={ridgeY} />
    </svg>
  );
}

/**
 * SECOND PASS — the drafter comes back and works the standing drawing.
 *
 * The elevation used to finish in one sweep and then sit still for the whole
 * time the cover is on screen. This is what a hand does next: names the two
 * construction datums it has already laid, runs a dimension string under the
 * building, and places the section mark that says which sheet cuts it.
 *
 * Everything here is a plain `.ws-draw` stroke on the cover's own timeline
 * rather than a second instrument, so it inherits the pen, the dash-attribute
 * handling, and the no-JS and reduced-motion contracts for free. The nested
 * data-draw-speed is what makes it read as a separate operation: the annotation
 * pass runs slower than the structure it annotates, and a change of tempo is
 * the cheapest honest way to say a different job has started.
 *
 * Line WEIGHT carries the hierarchy — witness lines hairline, dimensions light,
 * section flags heavy. The 3D island cannot do this (WebGL core lines are always
 * one pixel and it has to fade tone instead); SVG can, so it should.
 */
function Annotation({
  n,
  x0,
  x1,
  pitch,
  groundY,
  eaveY,
  ridgeY,
}: {
  n: number;
  x0: number;
  x1: number;
  pitch: number;
  groundY: number;
  eaveY: number;
  ridgeY: number;
}) {
  const tagX = x1 + 12; // level tags sit outboard of the building
  // Cut on a bay centre near the middle, but deliberately NOT the middle: the
  // dimension string's empty witness gap is centred too, and the two marks
  // crowded each other into one illegible cluster there.
  const secX = x0 + (Math.max(0, Math.ceil(n / 2) - 2) + 0.5) * pitch;
  const secTop = 36;
  const secBot = 147;
  const flag = 14; // arm length of a section flag
  const dimY = 156;
  const witTop = groundY + 13; // clear of the grade hatch
  const o = 20; // annotation orders start clear of the structure's

  /** Level datum: a tag whose apex touches the construction line it names. */
  const level = (y: number, order: number) => (
    <Path
      d={`M${tagX - 6} ${y - 7} L${tagX + 6} ${y - 7} L${tagX} ${y} Z`}
      ink="graphite"
      w={0.8}
      o={order}
    />
  );

  /** Section flag: heavy arm off the cut, arrowhead showing the view direction. */
  const flagAt = (y: number, order: number) => (
    <g key={`f${y}`}>
      <Line x1={secX} y1={y} x2={secX - flag} y2={y} ink="graphite" w={1.6} o={order} />
      <Line x1={secX - flag} y1={y} x2={secX - flag + 5} y2={y - 2.5} ink="graphite" w={1.2} o={order + 1} />
      <Line x1={secX - flag} y1={y} x2={secX - flag + 5} y2={y + 2.5} ink="graphite" w={1.2} o={order + 1} />
    </g>
  );

  return (
    // 0.55 against the drawing's own 0.75: the annotation is laid down more
    // deliberately than the building was, and both the stroke travel and the
    // beat between strokes stretch, so it is a slower HAND and not just slower
    // ink.
    <g data-draw-speed="0.55">
      {/* the two construction datums are already on the sheet; name them */}
      {level(eaveY, o)}
      {level(ridgeY, o + 1)}

      {/* running dimension under the building: a witness line and a tick at
          every bent, so the string counts the bays it measures. Left without a
          figure on purpose — the empty witness gap is this set's mark for a
          number that is not ours to invent. */}
      {Array.from({ length: n + 1 }).map((_, i) => (
        <Line
          key={`w${i}`}
          x1={x0 + i * pitch}
          y1={witTop}
          x2={x0 + i * pitch}
          y2={dimY + 5}
          ink="graphite"
          w={0.5}
          o={o + 2 + i}
        />
      ))}
      <Dim x1={x0} y1={dimY} x2={x1} y2={dimY} value={null} ink="graphite" o={o + 3 + n} />
      {Array.from({ length: n - 1 }).map((_, i) => {
        const bx = x0 + (i + 1) * pitch;
        return (
          <Line
            key={`t${i}`}
            x1={bx - 3.5}
            y1={dimY + 3.5}
            x2={bx + 3.5}
            y2={dimY - 3.5}
            ink="graphite"
            w={0.8}
            o={o + 4 + n + i}
          />
        );
      })}

      {/* SECTION MARK — where the set cuts. STATE 03 erects this building and
          STATE 04 pours it in section, so the cover ends by pointing at them.
          Chain dash is the convention for a cut line and keeps it reading as an
          overlay on the elevation rather than another member of it. */}
      <Line
        x1={secX}
        y1={secTop}
        x2={secX}
        y2={secBot}
        ink="graphite"
        w={0.7}
        dash="9 3 2 3"
        o={o + 4 + n * 2}
      />
      {flagAt(secTop, o + 5 + n * 2)}
      {flagAt(secBot, o + 7 + n * 2)}
    </g>
  );
}
