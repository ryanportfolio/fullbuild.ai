import { Line } from '../drafting/Marks';
import StaticFloor from './StaticFloor';
import { buildFrame } from '@/lib/pour/frame';
import { LIVE_PROJECTS } from '@/lib/projects';
import copy from './copy.module.css';
import s from './shipped.module.css';

/**
 * STATE 03 — ENGINEERING. Concrete. The band cell beside this copy is where
 * the REAL structure assembles: the R3F island erects one bent per live
 * project in graphite wireframe as this sheet arrives (the same geometry the
 * next sheet pours). The member schedule below is computed from that exact
 * geometry at build time — the numbers cannot drift from the drawing.
 */
const STACK: [string, string][] = [
  ['LVL 4', 'Vercel · edge'],
  ['LVL 3', 'GSAP · Lenis'],
  ['LVL 2', 'R3F · GLSL'],
  ['LVL 1', 'Next.js · TS'],
];

export default function SheetFrame() {
  // Same call the Scene makes — pure and deterministic, so the schedule below
  // is a true readout of the erected geometry.
  const frame = buildFrame(LIVE_PROJECTS.map((p) => ({ id: p.id, href: p.href })));
  const count = (role: string) => frame.members.filter((m) => m.role === role).length;
  const ties = frame.members.filter((m) => m.role === 'tie' && !m.id.startsWith('purlin') && !m.id.startsWith('girt')).length;
  const purlins = frame.members.filter((m) => m.id.startsWith('purlin')).length;
  const girts = frame.members.filter((m) => m.id.startsWith('girt')).length;

  return (
    <section id="state-03" data-state="03" data-ink="concrete" className={s.sheet} aria-label="Sheet 03 of 4 · Engineering">
      <div className={s.frame}>
        <header className={s.head}>
          <span className={`${s.stateNo} u-mono`}>STAGE&nbsp;03</span>
          <span className={`${s.stateName} u-label`}>Engineering</span>
          <span className={`${s.sheetNo} u-mono`}>S-03 / 04</span>
        </header>

        <div className={s.body}>
          <div className={s.copyCol}>
            <p className={copy.eyebrow}>Sheet S-03 · structure</p>
            <h2 className={copy.heading}>
              <span className={copy.headingGoal}>Goal</span>
              Verification <span className={copy.headingMark}>Loop</span>
            </h2>
            <p className={copy.lede}>
              Building with AI in a safe, maintainable, and request-aligned way
            </p>

            <dl className={copy.spec} aria-label="Member schedule: computed from the erected geometry">
              <div className={copy.specRow}>
                <span className={copy.specKey}>Bents</span>
                <span className={copy.specVal}>{frame.bays.length}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Columns</span>
                <span className={copy.specVal}>{count('column')}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Rafters</span>
                <span className={copy.specVal}>{count('rafter')}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Braces</span>
                <span className={copy.specVal}>{count('brace')}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Ties</span>
                <span className={copy.specVal}>{ties}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Ridge purlins</span>
                <span className={copy.specVal}>{purlins}</span>
              </div>
              <div className={copy.specRow}>
                <span className={copy.specKey}>Eave girts</span>
                <span className={copy.specVal}>{girts}</span>
              </div>
            </dl>

            <dl className={copy.spec} aria-label="Structural stack">
              {STACK.map(([lvl, v]) => (
                <div key={lvl} className={copy.specRow}>
                  <span className={copy.specKey}>{lvl}</span>
                  <span className={copy.specVal}>{v}</span>
                </div>
              ))}
            </dl>
          </div>

          {/* Band cell: the R3F wireframe assembles here. Static floor stands
              in when the island can't run. */}
          <div className={s.bandCell}>
            <StaticFloor>
              <IsoFrame />
            </StaticFloor>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Static isometric floor — the no-WebGL / reduced-motion spec of the frame. */
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
    for (let c = 0; c < 4; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % 4];
      const [x1, y1] = P(a[0], a[1], k);
      const [x2, y2] = P(b[0], b[1], k);
      rings.push(
        <Line key={`r${k}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2} ink="concrete" w={k === 0 || k === stories ? 1.5 : 1} o={k} />,
      );
    }
    if (k < stories) {
      corners.forEach((c, ci) => {
        const [x1, y1] = P(c[0], c[1], k);
        const [x2, y2] = P(c[0], c[1], k + 1);
        columns.push(<Line key={`c${k}-${ci}`} x1={x1} y1={y1} x2={x2} y2={y2} ink="concrete" w={1.2} o={stories + 1 + k} />);
      });
    }
  }

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
      {STACK.map(([lvl], idx) => {
        const k = stories - idx; // top-down
        const [px, py] = P(1, 0, k);
        return (
          <g key={lvl}>
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
