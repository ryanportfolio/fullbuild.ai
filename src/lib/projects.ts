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
   - No placeholder/lorem entries. If you have nothing real yet, ship the empty
     state — STATE 04 is designed to read as an honest awaiting-shipment sheet.

   TO ADD REAL WORK: append an entry below. That is the whole workflow.
   ========================================================================= */

export interface Metric {
  label: string;
  /** null => render an empty witness line (honest unknown), never a fake value. */
  value: string | null;
}

export interface Project {
  id: string;
  /** Sheet drawing number, e.g. "S-04.1". Keeps the drafting numbering honest. */
  sheet: string;
  title: string;
  href: string;
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
    // The self-referential anchor: this drawing set is itself a shipped, live
    // artifact. Red is earned. Its REV field is the real deployed commit.
    id: 'fullbuild-ai',
    sheet: 'S-04.0',
    title: 'fullbuild.ai',
    href: 'https://fullbuild.ai',
    live: true,
    role: 'idea → design → engineering → shipped',
    year: "'26",
    stack: ['Next.js', 'React Three Fiber', 'GLSL', 'GSAP'],
    metrics: [
      { label: 'runtime light', value: '1' },
      { label: 'motion verbs', value: '3' },
      { label: 'accent color', value: '1' },
    ],
    note: 'This sheet is the drawing set you are reading. It logs its own construction.',
  },
  // --- append real shipped projects here -----------------------------------
];

export const LIVE_PROJECTS = PROJECTS.filter((p) => p.live);

/** Total sheets = 4 pipeline states, fixed by the conceit (not by content). */
export const SHEET_COUNT = 4;
