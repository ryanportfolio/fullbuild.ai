import Sheet from './Sheet';
import { Line, Path, Registration } from '../drafting/Marks';
import MastheadPlot from '../motion/MastheadPlot';
import SheetIndex from './SheetIndex';
import MaterialLegend from './MaterialLegend';
import MarginStudy from '../motion/MarginStudy';
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
      <p className={copy.tagline}>
        {/* Two nowrap groups: when the measure runs out, the line breaks once,
            cleanly, between the machine pipeline and the human audit clause —
            never mid-arrow. */}
        <span className={copy.taglineGroup}>
          <span className={copy.s1}>idea</span> → <span className={copy.s2}>design</span> →{' '}
          <span className={copy.s3}>engineering</span>
        </span>{' '}
        <span className={copy.taglineGroup}>
          → <span className={copy.audit}>audit</span>{' '}
          <span className={copy.loopGlyph} role="img" aria-label="verification loop, then">
            ⟳
          </span>{' '}
          <span className={copy.s4}>shipped</span>
        </span>
      </p>
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
    </svg>
  );
}
