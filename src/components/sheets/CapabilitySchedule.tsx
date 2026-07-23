import copy from './copy.module.css';

/**
 * Capability schedule — what these hands have shipped, drawn instead of
 * counted. Each row pairs a mono label with a drafted line icon in the value
 * cell; the title attribute carries the source repo, so the sheet keeps
 * proving its own figures. Icons follow the Marks register: currentColor
 * strokes, no fills except node dots, drafting-weight lines.
 */
const CAPS: { key: string; label: string; source: string; icon: React.ReactNode }[] = [
  {
    key: 'rag',
    label: 'RAG retrieval',
    source: 'Truenote: hybrid vector + full-text + trigram',
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
    key: 'council',
    label: 'Model council',
    source: 'CoreWise: six-model council over transcripts',
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
    key: 'evals',
    label: 'Deterministic evals',
    source: 'tracebench + willaicite: no LLM in the scoring path',
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
    key: 'gates',
    label: 'CI merge gates',
    source: 'SDLC Audit: plan, build, review, gate, merge',
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
    source: 'Kine Fractal: full-history replay after every close',
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
    source: 'RTK + savetokens.tips: 79.5% filtered, measured',
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
    source: 'Local PTT: CPU-only, fully offline',
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
    key: 'r3f',
    label: 'Realtime 3D',
    source: 'fullbuild.ai: R3F + GLSL, the frame this sheet erects',
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

export default function CapabilitySchedule() {
  return (
    <dl className={copy.spec} aria-label="Capability schedule: built and shipped across the repos">
      {CAPS.map((c) => (
        <div key={c.key} className={copy.specRow} title={c.source}>
          <span className={copy.specKey}>{c.label}</span>
          <span className={copy.specIcon}>
            <svg viewBox="0 0 20 20" role="img" aria-label={c.label} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              {c.icon}
            </svg>
          </span>
        </div>
      ))}
    </dl>
  );
}
