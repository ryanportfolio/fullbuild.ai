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
    role: 'solo build — retrieval, gating, evals',
    year: "'26",
    stack: ['TypeScript', 'React', 'PostgreSQL + pgvector', 'Cohere rerank'],
    metrics: [
      { label: 'commits', value: '466', source: 'GitHub API, commit pagination' },
      { label: 'CodeQL baselined', value: '51', source: 'README: safe baseline accounts for all 51 retained results' },
      { label: 'TS share', value: '88%', source: 'GitHub languages API, 1.70M of 1.92M bytes' },
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
    role: 'solo build — client, server, DB, AI orchestration',
    year: "'25",
    stack: ['TypeScript', 'React', 'Express', 'Drizzle ORM'],
    metrics: [
      { label: 'commits', value: '14,879', source: 'GitHub API, commit pagination (private repo)' },
      { label: 'models per council', value: '6', source: 'corewise.video landing page' },
      { label: 'guest runs free', value: '3', source: 'corewise.video landing page' },
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
    role: 'solo build — scoring engine, SSRF guard, site',
    year: "'26",
    stack: ['TypeScript strict', 'Node 20', 'Astro', 'SSE'],
    metrics: [
      { label: 'tests passing', value: '152', source: 'README badge' },
      { label: 'runtime deps', value: '0', source: 'package.json' },
      { label: 'commits', value: '112', source: 'GitHub API, commit pagination' },
    ],
    note: 'Deterministic GEO audit — no LLM in the scoring path, so the same URL always scores the same; per-line evidence down to the exact robots.txt rule that blocks a crawler.',
  },
  {
    id: 'agentic-audit',
    sheet: 'S-04.4',
    title: 'Agentic-SDLC Audit',
    href: 'https://audit.corewise.academy/',
    repo: 'https://github.com/ryanportfolio/ryanportfolio',
    live: true,
    role: 'solo build — owner of every merge gate',
    year: "'26",
    stack: ['TypeScript', 'Node 20', 'GitHub API', 'GitHub Actions'],
    metrics: [
      { label: 'repos audited', value: '9', source: 'live scoreboard at audit.corewise.academy' },
      { label: 'gated commits', value: '62', source: 'GitHub API, commit pagination' },
      { label: 'own score', value: '78/100', source: 'self-scored by the deterministic tool' },
    ],
    note: 'Scores AI-agent development discipline from GitHub metadata — deterministic, no LLM — and was built entirely through the plan → agent build → adversarial review → CI gate → human merge pipeline it documents.',
  },
  {
    id: 'tracebench',
    sheet: 'S-04.5',
    title: 'tracebench',
    href: 'https://ryanportfolio.github.io/tracebench/',
    repo: 'https://github.com/ryanportfolio/tracebench',
    live: true,
    role: 'solo build — tasks, grader, dashboard',
    year: "'26",
    stack: ['Python', 'TypeScript', 'React', 'GitHub Actions'],
    metrics: [
      { label: 'transcripts', value: '108', source: 'live dashboard run list' },
      { label: 'correction gap', value: '0.96 / 0.81', source: 'dashboard: claude-sonnet-5 vs gpt-5.6-sol, N=3 per task' },
      { label: 'task families', value: '2 of 4', source: 'README roadmap — 18 tasks published' },
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
    role: 'solo build — data pipeline + datasheet site',
    year: "'26",
    stack: ['HTML', 'Node scripts', 'PowerShell', 'no build step'],
    metrics: [
      { label: 'tokens filtered', value: '79.5%', source: 'measured — rtk gain log over 95,821 commands' },
      { label: 'tokens saved', value: '19.7M', source: 'per-command before/after logs, refreshed daily' },
      { label: 'commits', value: '55', source: 'GitHub API, commit pagination' },
    ],
    note: 'Token-saving techniques published as a component datasheet: every figure is measured from 95,821 logged commands or printed grey with a tilde; a verify script fails the build on a stale number.',
  },
  {
    id: 'whisper-ptt',
    sheet: 'S-04.7',
    title: 'whisper-ptt',
    href: null,
    repo: 'https://github.com/ryanportfolio/Local-CPU-only-PTT',
    live: false,
    role: 'solo build — hotkey daemon, model guard, CI release',
    year: "'26",
    stack: ['Python 3.11', 'faster-whisper', 'CTranslate2', 'PyInstaller'],
    metrics: [
      { label: 'model footprint', value: '~75MB int8', source: 'README: base.en int8, CPU-only real-time' },
      { label: 'releases', value: '3', source: 'GitHub releases API, latest v0.2.3' },
      { label: 'cloud calls', value: '0', source: 'offline-first model guard, README' },
    ],
    note: 'Offline push-to-talk dictation for Windows: global hotkey, int8 Whisper on CPU in real time, transcript pasted into the focused window. No network, by design.',
  },
  {
    id: 'securewall',
    sheet: 'S-04.8',
    title: 'SecureWall',
    href: null,
    repo: 'https://github.com/ryanportfolio/SecureWall',
    live: false,
    role: 'maintainer — derivative of TinyWall 3.5.1',
    year: "'26",
    stack: ['C#', '.NET 4.8', 'Windows Filtering Platform', 'WiX'],
    metrics: [
      { label: 'installers', value: '3 MSI', source: 'GitHub releases: x64 / arm64 / x86 + SHA-256 manifest' },
      { label: 'C# codebase', value: '1.3MB', source: 'GitHub languages API' },
      { label: 'test matrix', value: 'VM, real WFP', source: 'README: VM-based real-firewall test matrix' },
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
    role: 'solo build — extraction engine + shell integration',
    year: "'26",
    stack: ['C#', '.NET Framework', 'Windows Shell', '0 deps'],
    metrics: [
      { label: 'bomb guards', value: '1000:1 cap', source: 'README: 1 GiB/file, 4 GiB total, ratio cap' },
      { label: 'releases', value: '2', source: 'GitHub releases API: v1.0.0, v1.1.0' },
      { label: 'third-party deps', value: '0', source: 'README: built-in .NET Framework only' },
    ],
    note: 'Double-click a ZIP and get the folder — transactionally: CRC-32 validated, path traversal / ADS / reparse points blocked before the source archive is ever recycled.',
  },
  {
    id: 'agent-firmware',
    sheet: 'S-04.10',
    title: 'Agent Firmware',
    href: null,
    repo: 'https://github.com/ryanportfolio/AI-Firmware',
    live: false,
    role: 'author — kernel rules, skills, sync scripts',
    year: "'26",
    stack: ['PowerShell', 'JavaScript', 'Markdown skills', '2 runtimes'],
    metrics: [
      { label: 'bundled skills', value: '34', source: 'repo description' },
      { label: 'commits', value: '56', source: 'GitHub API, commit pagination' },
      { label: 'agent runtimes', value: '2', source: 'README: Claude Code + Codex from one canonical source' },
    ],
    note: 'Self-syncing project template for AI coding agents: rule kernel, 34 skills, committed memory — improvements flow both ways between the template and the projects it spawns.',
  },
  {
    // The self-referential anchor, drawn last: this drawing set is itself a
    // shipped artifact. Red is earned. Its REV field is the real deployed commit.
    id: 'fullbuild-ai',
    sheet: 'S-04.11',
    title: 'fullbuild.ai',
    href: 'https://fullbuild.ai',
    repo: null,
    live: true,
    role: 'idea → design → engineering → shipped',
    year: "'26",
    stack: ['Next.js', 'React Three Fiber', 'GLSL', 'GSAP'],
    metrics: [
      { label: 'grounds', value: '2', source: 'this stylesheet' },
      { label: 'motion verbs', value: '3', source: 'DrawingSet.tsx' },
      { label: 'accent color', value: '1', source: 'this stylesheet' },
    ],
    note: 'This sheet is the drawing set you are reading. It logs its own construction — the revision ledger below is the real git history of this page.',
  },
];

export const LIVE_PROJECTS = PROJECTS.filter((p) => p.live);

/** Total sheets = 4 pipeline states, fixed by the conceit (not by content). */
export const SHEET_COUNT = 4;
