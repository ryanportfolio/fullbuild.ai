import { PROJECTS } from '../../lib/projects';
import copy from './copy.module.css';

/**
 * Capability schedule — what these hands have shipped, drawn instead of
 * counted. Each row pairs a mono label with a drafted line icon in the value
 * cell. Rows resolve their link through lib/projects.ts (the single typed
 * source of truth), preferring the live site over the public repo, so a
 * capability can never point somewhere the shipped sheet doesn't. The title
 * attribute carries the source proof. Icons follow the Marks register:
 * currentColor strokes, no fills except node dots, drafting-weight lines.
 */
const CAPS: {
  key: string;
  label: string;
  source: string;
  /** id in PROJECTS; href resolves to project.href ?? project.repo. */
  projectId?: string;
  /** Explicit target when the project entry can't provide one. */
  href?: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'rag',
    label: 'RAG retrieval',
    source: 'Truenote: hybrid vector + BM25 + trigram, Cohere rerank',
    projectId: 'truenote',
    icon: (
      <>
        {/* document with a fold, lens over its corner */}
        <path d="M4 2.5 H11 L13.5 5 V13 H4 Z" />
        <path d="M11 2.5 V5 H13.5" />
        <circle cx="13.5" cy="13.5" r="3.2" />
        <path d="M15.8 15.8 L18 18" />
      </>
    ),
  },
  {
    key: 'cited',
    label: 'Cited answers',
    source: 'Truenote: every answer cites its sources or refuses outright',
    projectId: 'truenote',
    icon: (
      <>
        {/* quote strokes over text lines; the short last line is the citation */}
        <path d="M5.5 3 L4 6.5" />
        <path d="M8.5 3 L7 6.5" />
        <path d="M4 10 H16" />
        <path d="M4 13 H16" />
        <path d="M4 16 H10" />
      </>
    ),
  },
  {
    key: 'council',
    label: 'Model council',
    source: 'CoreWise: six-model council over extracted transcripts',
    projectId: 'corewise',
    icon: (
      <>
        {/* five nodes ringed around a center, spoked */}
        <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
        {[
          [10, 3.4],
          [16.3, 8],
          [13.9, 15.4],
          [6.1, 15.4],
          [3.7, 8],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="1.7" />
            <path d={`M10 10 L${x} ${y}`} />
          </g>
        ))}
      </>
    ),
  },
  {
    key: 'research',
    label: 'Deep research',
    source: 'CoreWise: web + academic retrieval over Linkup and OpenAlex',
    projectId: 'corewise',
    icon: (
      <>
        {/* globe: equator and one meridian */}
        <circle cx="10" cy="10" r="6.5" />
        <path d="M3.5 10 H16.5" />
        <path d="M10 3.5 C13 6 13 14 10 16.5 C7 14 7 6 10 3.5" />
      </>
    ),
  },
  {
    key: 'evals',
    label: 'Deterministic evals',
    source: 'tracebench: weighted-checklist grading, no LLM in the scoring path',
    projectId: 'tracebench',
    icon: (
      <>
        {/* gauge: dial arc, ticks, needle parked at pass */}
        <path d="M3.5 14 A6.5 6.5 0 0 1 16.5 14" />
        <path d="M10 5.5 V7" />
        <path d="M4.6 10 L5.9 10.8" />
        <path d="M15.4 10 L14.1 10.8" />
        <path d="M10 14 L13.6 9.6" />
        <circle cx="10" cy="14" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: 'geo',
    label: 'Answer-engine audit',
    source: 'willaicite: 9-dimension GEO score, deterministic, no LLM calls',
    projectId: 'willaicite',
    icon: (
      <>
        {/* crosshair over a ranked list */}
        <circle cx="7" cy="10" r="4.5" />
        <path d="M7 4 V6.5 M7 13.5 V16 M1.5 10 H4 M10 10 H12.5" />
        <path d="M14.5 6 H18 M14.5 10 H18 M14.5 14 H16.5" />
      </>
    ),
  },
  {
    key: 'gates',
    label: 'CI merge gates',
    source: 'SDLC Audit: plan, build, review, gate, merge',
    projectId: 'agentic-audit',
    icon: (
      <>
        {/* rails with a gate valve between them */}
        <path d="M4.5 3 V17" />
        <path d="M15.5 3 V17" />
        <path d="M10 5.5 L14 10 L10 14.5 L6 10 Z" />
        <path d="M4.5 10 H6 M14 10 H15.5" />
      </>
    ),
  },
  {
    key: 'backtest',
    label: 'Backtest engine',
    source: 'Kine Fractal: full-history replay after every close, 513 tests',
    projectId: 'kinefractal',
    icon: (
      <>
        {/* axes and a stepped equity line */}
        <path d="M3.5 3.5 V16.5 H17" />
        <path d="M3.5 13 H7 V9.5 H10.5 V11.5 H14 V5.5 H17" />
      </>
    ),
  },
  {
    key: 'tokens',
    label: 'Token pipeline',
    source: 'RTK + STK + savetokens.tips: 79.5% filtered, measured',
    projectId: 'savetokens',
    icon: (
      <>
        {/* funnel with the filtered stream leaving the spout */}
        <path d="M3.5 4 H16.5 L12 9.5 V13.5 H8 V9.5 Z" />
        <path d="M10 15 V17.5" />
      </>
    ),
  },
  {
    key: 'speech',
    label: 'Speech capture',
    source: 'Local PTT: int8 Whisper on CPU, fully offline',
    projectId: 'whisper-ptt',
    icon: (
      <>
        {/* waveform bars about the centerline */}
        <path d="M3.5 8.5 V11.5" />
        <path d="M6.5 6.5 V13.5" />
        <path d="M9.5 3.5 V16.5" />
        <path d="M12.5 5.5 V14.5" />
        <path d="M15.5 8 V12" />
      </>
    ),
  },
  {
    key: 'firewall',
    label: 'Default-deny firewall',
    source: 'SecureWall: WFP enforcement, scoped outbound prompts',
    projectId: 'securewall',
    icon: (
      <>
        {/* brick courses, staggered */}
        <path d="M3.5 5 H16.5 V15.5 H3.5 Z" />
        <path d="M3.5 8.5 H16.5" />
        <path d="M3.5 12 H16.5" />
        <path d="M10 5 V8.5" />
        <path d="M6.75 8.5 V12" />
        <path d="M13.25 8.5 V12" />
        <path d="M10 12 V15.5" />
      </>
    ),
  },
  {
    key: 'r3f',
    label: 'Realtime 3D',
    source: 'fullbuild.ai: R3F + GLSL, the frame this sheet erects',
    // Linking this page to itself would be circular; the public repo is the proof.
    href: 'https://github.com/ryanportfolio/fullbuild.ai',
    icon: (
      <>
        {/* isometric cube, the same solid the band cell pours */}
        <path d="M10 2.5 L16.5 6.25 V13.75 L10 17.5 L3.5 13.75 V6.25 Z" />
        <path d="M3.5 6.25 L10 10 L16.5 6.25" />
        <path d="M10 10 V17.5" />
      </>
    ),
  },
];

function resolveHref(c: (typeof CAPS)[number]): string | null {
  if (c.href) return c.href;
  const p = c.projectId ? PROJECTS.find((x) => x.id === c.projectId) : undefined;
  return p ? (p.href ?? p.repo) : null;
}

export default function CapabilitySchedule() {
  return (
    <dl className={copy.spec} aria-label="Capability schedule: built and shipped across the repos">
      {CAPS.map((c) => {
        const href = resolveHref(c);
        const words = c.label.split(' ');
        const last = words.pop();
        const cells = (
          <>
            <span className={copy.specKey}>
              {words.length > 0 && `${words.join(' ')} `}
              {/* The plotted ↗ stays glued to the last word across wraps. */}
              <span className={copy.specNowrap}>
                {last}
                {href && <span className={copy.specMark} aria-hidden="true">↗</span>}
              </span>
            </span>
            <span className={copy.specIcon}>
              <svg viewBox="0 0 20 20" role="img" aria-label={c.label} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                {c.icon}
              </svg>
            </span>
          </>
        );
        return (
          <div key={c.key}>
            {href ? (
              <a
                className={`${copy.specRow} ${copy.specRowCap} ${copy.specLink}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                title={c.source}
                aria-label={`${c.label}. ${c.source}`}
              >
                {cells}
              </a>
            ) : (
              <div className={`${copy.specRow} ${copy.specRowCap}`} title={c.source}>
                {cells}
              </div>
            )}
          </div>
        );
      })}
    </dl>
  );
}
