/* ============================================================================
   CONTENT GATE — the single typed source of truth for shipped work.
   The build sizes STATE 04 to this array; the frame never exceeds the payload.

   CONTRACT:
   - `live: true` is the ONLY thing that earns revision-red. If it is not
     currently reachable in production, it must be `live: false` (renders in
     graphite, not red). lib/health.ts probes this at runtime and de-ignites
     red -> graphite if a project goes down.
   - A metric with `value: null` renders an EMPTY witness line (tick marks, no
     number). Never invent a number to fill it.
   - Every metric carries its `source` — where the number was measured or
     claimed. Numbers below were verified against the GitHub API, README
     claims, and the live sites on 2026-07-20. Sources ship in the DOM as
     title attributes: the sheet can prove its own figures.
   - No placeholder/lorem entries. If you have nothing real yet, ship the empty
     state — STATE 04 is designed to read as an honest awaiting-shipment sheet.

   TO ADD REAL WORK: append an entry below. That is the whole workflow.
   ========================================================================= */

export interface Metric {
  label: string;
  /** null => render an empty witness line (honest unknown), never a fake value. */
  value: string | null;
  /** Provenance of the figure — measured, API field, or README/site claim. */
  source?: string;
}

export interface Project {
  id: string;
  /** Sheet drawing number, e.g. "S-04.1". Keeps the drafting numbering honest. */
  sheet: string;
  title: string;
  /** Live production URL, or null for repo-only work. */
  href: string | null;
  /** Public repository, or null (private source — link the live site only). */
  repo: string | null;
  /** true = reachable in production right now. Gates revision-red. */
  live: boolean;
  role: string;
  /** Short year / ship marker, mono-rendered. */
  year: string;
  stack: string[];
  /**
   * Real source languages — the "materials" this drawing set is built from.
   * Markup (HTML) and shader (GLSL) count; runtimes/frameworks/libraries do not.
   * The cover's MATERIALS LEGEND is generated from this field and every count it
   * prints is derived here, so a number on the drawing can never drift from the
   * data. Verified against each repo's source on 2026-07-20.
   */
  langs: string[];
  metrics: Metric[];
  /** One-line drafted description. Real, specific — no marketing filler. */
  note: string;
}

export const PROJECTS: Project[] = [
  {
    id: 'truenote',
    sheet: 'S-04.1',
    title: 'Truenote',
    href: 'https://truenote.org/',
    repo: 'https://github.com/ryanportfolio/Truenote',
    live: true,
    role: 'solo build · retrieval, gating, evals',
    year: "'26",
    stack: ['TypeScript', 'React', 'PostgreSQL + pgvector'],
    langs: ['TypeScript'],
    metrics: [
      { label: 'commits', value: '466', source: 'GitHub API, commit pagination' },
    ],
    note: 'Citation-first RAG for support teams: hybrid vector + full-text + trigram retrieval, a confidence gate that refuses before any LLM call, citation validation that rejects unknown chunks.',
  },
  {
    id: 'corewise',
    sheet: 'S-04.2',
    title: 'CoreWise',
    href: 'https://corewise.video',
    repo: null, // source is private — the live site is the artifact
    live: true,
    role: 'solo build · client, server, DB, AI orchestration',
    year: "'25",
    stack: ['TypeScript', 'React', 'Express', 'Drizzle ORM'],
    langs: ['TypeScript'],
    metrics: [
      { label: 'commits', value: '14,879', source: 'GitHub API, commit pagination (private repo)' },
    ],
    note: 'Full-stack multi-model video-analysis product in production since Dec ’25; a six-model council answers over extracted transcripts.',
  },
  {
    id: 'willaicite',
    sheet: 'S-04.3',
    title: 'willaicite',
    href: 'https://willaicite.com',
    repo: 'https://github.com/ryanportfolio/willaicite',
    live: true,
    role: 'solo build · scoring engine, SSRF guard, site',
    year: "'26",
    stack: ['TypeScript strict', 'Node 20', 'Astro', 'SSE'],
    langs: ['TypeScript'],
    metrics: [
      { label: 'tests passing', value: '152', source: 'README badge' },
      { label: 'runtime deps', value: '0', source: 'package.json' },
      { label: 'commits', value: '112', source: 'GitHub API, commit pagination' },
    ],
    note: 'Deterministic AEO/GEO audit: no LLM in the scoring path. Instructions for your agent to fix.',
  },
  {
    id: 'agentic-audit',
    sheet: 'S-04.4',
    title: 'SDLC Audit',
    href: 'https://audit.corewise.academy/',
    repo: 'https://github.com/ryanportfolio/ryanportfolio',
    live: true,
    role: 'solo build · owner of every merge gate',
    year: "'26",
    stack: ['TypeScript', 'Node 20', 'GitHub API', 'GitHub Actions'],
    langs: ['TypeScript'],
    metrics: [
      { label: 'repos audited', value: '9', source: 'live scoreboard at audit.corewise.academy' },
      { label: 'gated commits', value: '62', source: 'GitHub API, commit pagination' },
    ],
    note: 'Scores AI-agent development discipline from GitHub metadata (deterministic, no LLM) and was built entirely through the plan → agent build → adversarial review → CI gate → human merge pipeline it documents.',
  },
  {
    id: 'tracebench',
    sheet: 'S-04.5',
    title: 'tracebench',
    href: 'https://ryanportfolio.github.io/tracebench/',
    repo: 'https://github.com/ryanportfolio/tracebench',
    live: true,
    role: 'solo build · tasks, grader, dashboard',
    year: "'26",
    stack: ['Python', 'TypeScript', 'React', 'GitHub Actions'],
    langs: ['Python', 'TypeScript'],
    metrics: [
      { label: 'transcripts', value: '108', source: 'live dashboard run list' },
      { label: 'correction gap', value: '0.96 / 0.81', source: 'dashboard: claude-sonnet-5 vs gpt-5.6-sol, N=3 per task' },
    ],
    note: 'Replayable evals harvested from my own failed agent sessions: does the agent verify claims, own mistakes, self-correct? Deterministic grading, every transcript committed, CI re-scores to prove zero drift.',
  },
  {
    id: 'savetokens',
    sheet: 'S-04.6',
    title: 'savetokens.tips',
    href: 'https://savetokens.tips',
    repo: 'https://github.com/ryanportfolio/savetokens',
    live: true,
    role: 'solo build · data pipeline + datasheet site',
    year: "'26",
    stack: ['HTML', 'Node scripts', 'PowerShell'],
    langs: ['HTML', 'JavaScript', 'PowerShell'],
    metrics: [
      { label: 'tokens filtered', value: '79.5%', source: 'measured: rtk gain log over 95,821 commands' },
      { label: 'tokens saved', value: '19.7M', source: 'per-command before/after logs, refreshed daily' },
      { label: 'commits', value: '55', source: 'GitHub API, commit pagination' },
    ],
    note: 'Usage optimization guide; every figure measured from logged commands and updated to site automatically.',
  },
  {
    id: 'whisper-ptt',
    sheet: 'S-04.7',
    title: 'Local PTT',
    href: null,
    repo: 'https://github.com/ryanportfolio/Local-CPU-only-PTT',
    live: false,
    role: 'solo build · hotkey daemon, model guard, CI release',
    year: "'26",
    stack: ['Python 3.11', 'CTranslate2', 'PyInstaller'],
    langs: ['Python'],
    metrics: [
      { label: 'model footprint', value: '~75MB int8', source: 'README: base.en int8, CPU-only real-time' },
      { label: 'local', value: 'fully', source: 'offline-first model guard, README: zero cloud calls' },
    ],
    note: 'Offline PTT for Windows: global hotkey, int8 Whisper on CPU in real time, transcript pasted into the focused window. No network.',
  },
  {
    id: 'securewall',
    sheet: 'S-04.8',
    title: 'SecureWall',
    href: null,
    repo: 'https://github.com/ryanportfolio/SecureWall',
    live: false,
    role: 'maintainer · derivative of TinyWall 3.5.1',
    year: "'26",
    stack: ['C#', '.NET 4.8', 'Windows Filtering Platform'],
    langs: ['C#'],
    metrics: [
      { label: 'installers', value: '3 MSI', source: 'GitHub releases: x64 / arm64 / x86 + SHA-256 manifest' },
      { label: 'C# codebase', value: '1.3MB', source: 'GitHub languages API' },
    ],
    note: 'Windows default-deny firewall keeping TinyWall’s service-owned WFP enforcement, adding one tightly scoped outbound-block prompt with a token-based permanent-allow flow.',
  },
  {
    id: 'zipflow',
    sheet: 'S-04.9',
    title: 'ZipFlow',
    href: null,
    repo: 'https://github.com/ryanportfolio/ZipFlow',
    live: false,
    role: 'solo build · extraction engine + shell integration',
    year: "'26",
    stack: ['C#', '.NET Framework', 'Windows Shell', '0 deps'],
    langs: ['C#'],
    metrics: [],
    note: 'Double click ZIP → get unzipped folder → zip gets deleted.',
  },
  {
    id: 'agent-firmware',
    sheet: 'S-04.10',
    title: 'Agent Firmware',
    href: null,
    repo: 'https://github.com/ryanportfolio/AI-Firmware',
    live: false,
    role: 'author · kernel rules, skills, sync scripts',
    year: "'26",
    stack: ['PowerShell', 'JavaScript', 'Markdown skills', '2 runtimes'],
    langs: ['PowerShell', 'JavaScript'],
    metrics: [
      { label: 'bundled skills', value: '34', source: 'repo description' },
      { label: 'Repo', value: 'Instant', source: 'spawns a ready-to-work repo in one step' },
    ],
    note: 'Self-syncing project template for AI coding agents. Instant repo creation with a built in rule kernel, 34 skills, efficient & durable memory. Super optimized token usage.',
  },
  {
    id: 'corewise-academy',
    sheet: 'S-04.11',
    title: 'CoreWise Academy',
    href: 'https://corewise.academy',
    repo: null, // source is private — the live site is the artifact
    live: true,
    role: 'author + editor · curriculum, site, pipeline',
    year: "'26",
    stack: ['Astro', 'MDX', 'TypeScript'],
    langs: ['JavaScript', 'HTML', 'TypeScript'],
    metrics: [
      { label: 'guides published', value: '18', source: 'corewise.academy catalog page' },
      { label: 'catalog reading', value: '133 min', source: 'corewise.academy: "18 published guides, about 133 minutes of reading in total"' },
      { label: 'commits', value: '327', source: 'GitHub API, commit pagination (private repo)' },
    ],
    note: 'Free course catalog on working with AI: 18 guides across 5 layers at 3 depth levels, each with objectives, exercises, and self-checks. No accounts, no fees: the whole catalog reads in about 133 minutes.',
  },
  {
    id: 'kinefractal',
    sheet: 'S-04.12',
    title: 'Kine Fractal',
    href: 'https://kinefractal.com',
    repo: null, // source is private — the live site is the artifact
    live: true,
    role: 'solo build · rules engine, backtest pipeline, site',
    year: "'26",
    stack: ['Python', 'TypeScript', 'React', 'Vite'],
    langs: ['Python', 'TypeScript'],
    metrics: [
      { label: 'index funds', value: '3', source: 'about page: SPY · QQQ · IWM, long only, end-of-day' },
      { label: 'engine', value: 'v4.7', source: 'about page header: "SPY · QQQ · IWM · ENGINE V4.7 · END-OF-DAY · LONG ONLY"' },
    ],
    note: 'A rules engine for buying and selling index funds. Python engine replays the full price history after every close, publishes plain data files, and every chart on the site benchmarks it against B&H.',
  },
  {
    // The self-referential anchor, drawn last: this drawing set is itself a
    // shipped artifact. Red is earned. Its REV field is the real deployed commit.
    id: 'fullbuild-ai',
    sheet: 'S-04.13',
    title: 'fullbuild.ai',
    href: 'https://fullbuild.ai',
    repo: null,
    live: true,
    role: 'idea → design → engineering → shipped',
    year: "'26",
    stack: ['Next.js', 'React Three Fiber', 'GLSL', 'GSAP'],
    langs: ['TypeScript', 'GLSL'],
    metrics: [{ label: '', value: 'hi@fullbuild.ai' }],
    note: 'The revision ledger below is the real git history of this page.',
  },
];

export const LIVE_PROJECTS = PROJECTS.filter((p) => p.live);

/** Total sheets = 4 pipeline states, fixed by the conceit (not by content). */
export const SHEET_COUNT = 4;
