import Sheet from './Sheet';
import { Line, Path, Dim, Registration } from '../drafting/Marks';
import copy from './copy.module.css';

/**
 * STATE 01 — IDEA. Doubles as the cover. Graphite only. The hero is an
 * orthographic elevation that draws itself on load (construction lines first,
 * then object, then dimensions) — a pen plotter, not a floating hero.
 */
export default function SheetElevation() {
  return (
    <Sheet
      n="01"
      state="Idea"
      ink="graphite"
      drawingSide="right"
      drawing={<Elevation />}
    >
      <p className={copy.eyebrow}>Working drawing set · rev-controlled</p>
      <h1 className={copy.masthead}>fullbuild.ai</h1>
      <p className={copy.tagline}>
        <span className={copy.s1}>idea</span> →{' '}
        <span className={copy.s2}>design</span> →{' '}
        <span className={copy.s3}>engineering</span> →{' '}
        <span className={copy.s4}>shipped</span>
      </p>
      <p className={copy.prose}>
        One hand carries a single idea through every stage of making. This is not
        a page you scroll — it is a drawing set you advance, and it draws itself
        as you go.
      </p>
      <p className={copy.prose}>
        It begins, like everything, in graphite: loose, unresolved, a first pass
        on the table. Keep advancing and the sketch resolves, frames up, and — at
        the last sheet — pours into the built thing, live.
      </p>
    </Sheet>
  );
}

function Elevation() {
  // Four stacked bays = four states. Ground at y=470, top at y=110.
  const bays = [
    { y0: 380, y1: 470, tag: '01' },
    { y0: 290, y1: 380, tag: '02' },
    { y0: 200, y1: 290, tag: '03' },
    { y0: 110, y1: 200, tag: '04' },
  ];
  return (
    <svg viewBox="0 0 380 520" role="img" aria-label="Orthographic elevation of the build, four stacked states">
      {/* --- construction lines (drawn first) --- */}
      {[110, 200, 290, 380, 470].map((y, i) => (
        <Line key={`h${y}`} x1={70} y1={y} x2={330} y2={y} ink="graphite" w={0.6} dash="2 4" o={0 + i} />
      ))}
      {[120, 300].map((x, i) => (
        <Line key={`v${x}`} x1={x} y1={90} x2={x} y2={492} ink="graphite" w={0.6} dash="2 4" o={2 + i} />
      ))}

      {/* --- ground line + hatch --- */}
      <Line x1={40} y1={470} x2={350} y2={470} ink="graphite" w={1.6} o={6} />
      {Array.from({ length: 13 }).map((_, i) => {
        const x = 52 + i * 24;
        return <Line key={`g${i}`} x1={x} y1={470} x2={x - 9} y2={482} ink="graphite" w={0.7} o={7} />;
      })}

      {/* --- object: outer outline + floor lines --- */}
      <Path d="M120 470 L120 110 L300 110 L300 470" ink="graphite" w={1.6} o={9} />
      {bays.slice(1).map((b, i) => (
        <Line key={`f${i}`} x1={120} y1={b.y1} x2={300} y2={b.y1} ink="graphite" w={1.2} o={10 + i} />
      ))}

      {/* --- per-bay stage marks (all graphite at idea stage) --- */}
      {/* 01 idea: a loose scribble of first thought */}
      <Path d="M140 448 q14 -22 28 -4 q10 12 24 -6 q12 -16 26 2" ink="graphite" w={1} o={14} />
      {/* 02 design: a resolved window grid */}
      <Line x1={150} y1={335} x2={270} y2={335} ink="graphite" w={0.9} o={15} />
      <Line x1={210} y1={300} x2={210} y2={370} ink="graphite" w={0.9} o={15} />
      {/* 03 engineering: a diagonal brace / truss */}
      <Path d="M140 288 L210 208 L280 288 M140 208 L280 208" ink="graphite" w={1} o={16} />
      {/* 04 shipped: a solid keystone block (graphite here; ignites red only in STATE 04) */}
      <Path d="M186 150 L214 150 L222 186 L178 186 Z" ink="graphite" w={1.2} o={17} />

      {/* --- bay tags via dimension leaders (right) --- */}
      {bays.map((b, i) => (
        <g key={`tag${b.tag}`}>
          <Line x1={300} y1={(b.y0 + b.y1) / 2} x2={326} y2={(b.y0 + b.y1) / 2} ink="graphite" w={0.7} o={18 + i} />
          <text
            x={330}
            y={(b.y0 + b.y1) / 2}
            fill="var(--ink-graphite)"
            fontFamily="var(--font-mono)"
            fontSize={11}
            dominantBaseline="middle"
            style={{ letterSpacing: '0.04em' }}
          >
            {b.tag}
          </text>
        </g>
      ))}

      {/* --- overall height dimension (left) --- */}
      <Dim x1={92} y1={110} x2={92} y2={470} value="4 STATES" ink="graphite" o={22} />

      {/* --- section cut symbol + registration --- */}
      <circle cx={300} cy={110} r={9} fill="none" stroke="var(--ink-graphite)" strokeWidth={1} className="ws-draw" pathLength={1} data-o={23} />
      <text x={300} y={114} fill="var(--ink-graphite)" fontFamily="var(--font-mono)" fontSize={9} textAnchor="middle">A</text>
      <Registration x={60} y={100} o={24} />
      <Registration x={340} y={492} o={24} />
    </svg>
  );
}
