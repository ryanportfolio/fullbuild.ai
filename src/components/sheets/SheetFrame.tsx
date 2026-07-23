import { Line } from '../drafting/Marks';
import StaticFloor from './StaticFloor';
import CapabilitySchedule from './CapabilitySchedule';
import copy from './copy.module.css';
import s from './shipped.module.css';

/**
 * STATE 03 — ENGINEERING. Concrete. The band cell beside this copy is where
 * the REAL structure assembles: the R3F island erects one bent per live
 * project in graphite wireframe as this sheet arrives (the same geometry the
 * next sheet pours). The capability schedule below draws what has shipped
 * across the repos — each row's title carries its source.
 */
/**
 * Structural stack, read as a building: floors are construction layers from
 * footing to envelope, not a difficulty ranking. Grouped from a full inventory
 * of the repos (2026-07-23); each row's title carries its proof.
 */
const STACK: { lvl: string; name: string; items: string; source: string }[] = [
  {
    lvl: 'L5',
    name: 'Envelope',
    items: 'Vercel · Actions · CI gates',
    source: 'Ship and gate: Vercel (fullbuild.ai, savetokens.tips), Replit autoscale (Truenote), GitHub Pages (tracebench), GitHub Actions CI and merge gates (SDLC Audit, SecureWall releases)',
  },
  {
    lvl: 'L4',
    name: 'Finish',
    items: 'R3F · GLSL · GSAP · Lenis',
    source: 'Motion and realtime 3D: the R3F island and GLSL on this sheet, Three.js at CoreWise Academy, canvas game engine in PixelSwarm',
  },
  {
    lvl: 'L3',
    name: 'Services',
    items: 'Postgres · pgvector · Claude · GPT · Gemini',
    source: 'Data and AI run through the walls: pgvector + pg_trgm retrieval (Truenote), SQLite FTS5 (research mirror), model council (CoreWise), Whisper STT (Local PTT)',
  },
  {
    lvl: 'L2',
    name: 'Frame',
    items: 'Next.js · React · Astro · Node · Tauri',
    source: 'Runtimes and UI frames: Next.js (fullbuild.ai), React 19 (Truenote, PixelSwarm), Astro (CoreWise Academy), Express + Drizzle (CoreWise), Tauri 2 desktop (PixelSwarm)',
  },
  {
    lvl: 'L1',
    name: 'Footing',
    items: 'TypeScript · Python · Rust · Go · C#',
    source: 'Languages the work is poured in: TypeScript across the stack, Python (Kine Fractal, tracebench, Local PTT), Rust (RTK, STK), Go (research mirror), C# (SecureWall, ZipFlow)',
  },
];

export default function SheetFrame() {
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
            <p className={`${copy.lede} ${copy.ledeLarge}`}>
              Building with AI in a safe, maintainable, and request-aligned way
            </p>

            <CapabilitySchedule />

            <dl className={copy.spec} aria-label="Structural stack: construction layers from footing to envelope">
              {STACK.map((f) => (
                <div key={f.lvl} className={copy.specRow} title={f.source}>
                  <span className={copy.specKey}>{f.lvl} · {f.name}</span>
                  <span className={copy.specVal}>{f.items}</span>
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
  const up = -48;
  const stories = STACK.length;

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
      {STACK.map((f, idx) => {
        const k = stories - idx; // top-down
        const [px, py] = P(1, 0, k);
        return (
          <g key={f.lvl}>
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
              {f.lvl} {f.name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
