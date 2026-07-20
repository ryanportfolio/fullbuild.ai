import Sheet from './Sheet';
import { Line } from '../drafting/Marks';
import copy from './copy.module.css';

/**
 * STATE 03 — ENGINEERING. Concrete. The load-bearing frame that was real but
 * unseen becomes an isometric wireframe of the actual structure. The stack is
 * dimensioned as mono strings — lettered in GRAPHITE so they clear contrast on
 * vellum. Still no red anywhere.
 */
const STACK: [string, string][] = [
  ['LVL 4', 'Vercel · edge'],
  ['LVL 3', 'GSAP · Lenis'],
  ['LVL 2', 'R3F · GLSL'],
  ['LVL 1', 'Next.js · TS'],
];

export default function SheetFrame() {
  return (
    <Sheet n="03" state="Engineering" ink="concrete" drawingSide="right" drawing={<IsoFrame />}>
      <p className={copy.eyebrow}>Sheet S-03 · structure</p>
      <h2 className={copy.heading}>The frame holds the whole load</h2>
      <p className={copy.prose}>
        Engineering is the part nobody sees and everybody stands on. Poured
        concrete, square corners, every member sized for the load above it. The
        structure is real here — it just hasn&apos;t been clad yet.
      </p>
      <dl className={copy.spec} aria-label="Structural schedule">
        {STACK.map(([lvl, v]) => (
          <div key={lvl} className={copy.specRow}>
            <span className={copy.specKey}>{lvl}</span>
            <span className={copy.specVal}>{v}</span>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

function IsoFrame() {
  const ox = 210;
  const oy = 330;
  const ex: [number, number] = [70, 40];
  const ey: [number, number] = [-70, 40];
  const up = -56;
  const stories = 4;

  const P = (i: number, j: number, k: number): [number, number] => [
    ox + i * ex[0] + j * ey[0],
    oy + i * ex[1] + j * ey[1] + k * up,
  ];
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  const rings: React.ReactNode[] = [];
  const columns: React.ReactNode[] = [];
  const braces: React.ReactNode[] = [];

  for (let k = 0; k <= stories; k++) {
    // ring beams
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % 4];
      const [x1, y1] = P(a[0], a[1], k);
      const [x2, y2] = P(b[0], b[1], k);
      rings.push(
        <Line key={`r${k}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2} ink="concrete" w={k === 0 || k === stories ? 1.5 : 1} o={k} />,
      );
    }
    // columns
    if (k < stories) {
      corners.forEach((c, ci) => {
        const [x1, y1] = P(c[0], c[1], k);
        const [x2, y2] = P(c[0], c[1], k + 1);
        columns.push(<Line key={`c${k}-${ci}`} x1={x1} y1={y1} x2={x2} y2={y2} ink="concrete" w={1.2} o={stories + 1 + k} />);
      });
    }
  }

  // One clean X-brace across the full front face — real bracing, not a per-story
  // tangle. Front face runs corner A(0,0) → B(1,0).
  {
    const [ax0, ay0] = P(0, 0, 0);
    const [ax1, ay1] = P(1, 0, stories);
    const [cx0, cy0] = P(1, 0, 0);
    const [cx1, cy1] = P(0, 0, stories);
    braces.push(<Line key="xb1" x1={ax0} y1={ay0} x2={ax1} y2={ay1} ink="concrete" w={0.8} o={stories * 2} />);
    braces.push(<Line key="xb2" x1={cx0} y1={cy0} x2={cx1} y2={cy1} ink="concrete" w={0.8} o={stories * 2 + 1} />);
  }

  return (
    <svg viewBox="0 0 420 470" role="img" aria-label="Isometric wireframe of the engineered frame">
      {rings}
      {columns}
      {braces}
      {/* stack leaders — graphite mono for legibility */}
      {STACK.map(([lvl], idx) => {
        const k = stories - idx; // top-down
        const [px, py] = P(1, 0, k);
        return (
          <g key={lvl}>
            {/* node tick where the leader meets a real structural node */}
            <Line x1={px - 3.5} y1={py - 3.5} x2={px + 3.5} y2={py + 3.5} ink="graphite" w={0.9} o={stories * 3 + idx} />
            <Line x1={px} y1={py} x2={px + 40} y2={py} ink="graphite" w={0.7} o={stories * 3 + idx} />
            <text
              x={px + 46}
              y={py}
              fill="var(--ink-graphite)"
              fontFamily="var(--font-mono)"
              fontSize={10}
              dominantBaseline="middle"
              style={{ letterSpacing: '0.03em' }}
            >
              {lvl}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
