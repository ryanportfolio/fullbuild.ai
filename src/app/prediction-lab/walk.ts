import { PROJECTS } from '@/lib/projects';

/* ============================================================================
   THE WALK — locked facts for the E-02 record of demonstration.

   The exhibit obeys the law of the product it documents: no number without its
   provenance, no view that a link cannot reproduce. Every figure here was
   measured, never asserted:
   - duration / frames / fps: ffprobe on the encoded deliverable
     (prediction-lab-demo-1080p.mp4, the screen-capture master remuxed
     losslessly to faststart; stream copy, so its timing IS the master's).
   - Chapter boundaries: read frame-by-frame from the ENCODED deliverable at
     1 s resolution (contact sheets + boundary strips, 2026-08-10). Good to
     ±1 s; each `at` lands on or just before the first frame of its chapter.
   - Step evidence links: every URL parameter below was exercised against the
     live product on 2026-08-10 and the restored state was verified by hand.
     The origin is READ from the registry row, so a link cannot drift from
     the content gate, and `live` gates every red on the page.
   - Run figures in HIGHLIGHTS: read off the live run 234 overview and its
     decision record on 2026-08-10.
   tests/prediction-lab-walk.test.mjs holds these claims to the data.
   ========================================================================= */

export const WALK = {
  /** Served as a GitHub release asset: free range-request hosting, no new infra. */
  src: 'https://github.com/ryanportfolio/fullbuild.ai/releases/download/media-prediction-lab-v1/prediction-lab-demo-1080p.mp4',
  poster: '/prediction-lab/poster.jpg',
  /** One 160x90 thumb per 2 s, 11 per row — generated from the same encode. */
  sprites: '/prediction-lab/scrub-sprites.jpg',
  spriteEvery: 2,
  spriteCols: 11,
  spriteCount: 77,
  spriteW: 160,
  spriteH: 90,
  /** ffprobe, container duration of the encoded file, seconds. */
  duration: 153.34,
  /** ffprobe, video stream frame count. */
  frames: 9198,
  /** ffprobe, r_frame_rate 60/1 — a screen capture at an even minute-metre. */
  fps: '60',
  width: 1920,
  height: 1080,
} as const;

/* The registry row is the single source for title, origin, and the red gate.
   The walk cannot exist without it: throw at build time, name the id. */
const row = PROJECTS.find((p) => p.id === 'prediction-lab');
if (!row || !row.href) throw new Error('walk requires the prediction-lab registry row with an href');

export const LAB = {
  title: row.title,
  href: row.href,
  repo: row.repo,
  live: row.live,
} as const;

/** The run the whole exhibit reads from. Every figure on the page is from it. */
export const RUN = {
  id: '234',
  model: 'Bodily Injury Frequency',
  baseline: 'v12',
  approved: 'v13',
} as const;

/* Run figures, read off the live overview and decision record on 2026-08-10.
   Held to the page by test; re-verify against the live run before changing. */
export const HIGHLIGHTS = [
  { label: 'experiments', value: '7 / 7', note: 'one winner, two carried in, four scrapped' },
  { label: 'question to decision', value: '9.3s', note: 'goal in, decision package out' },
  { label: 'Gini', value: '0.236 → 0.249', note: 'train +0.013 · holdout +0.011' },
  { label: 'guardrails', value: '3 / 3 held', note: 'two experiments scrapped by them' },
  { label: 'agent record', value: '26 actions', note: '4 refused by the platform itself' },
] as const;

export interface WalkStep {
  /** Ledger id, W-01..W-09 — also the in-page anchor the chapter log cites. */
  id: string;
  title: string;
  /** What changed and why, in the merged PRs' own reasoning. */
  why: string;
  /** Merged lab-demo PR numbers. Printed as links to the paper trail. */
  prs: number[];
  /** Query string after the origin, `/`-rooted path, or null (state not in URL). */
  params: string | null;
  /**
   * Figure beside the step. Captured from the live product at 1600x1000, then
   * cropped to the region the step is about and drawn up, so the claim is
   * readable rather than merely present. The crop region and the file's own
   * size are both stated: the caption prints them and the scale between them,
   * so the arithmetic on the sheet closes.
   */
  fig: string;
  cropW: number;
  cropH: number;
  figW: number;
  figH: number;
  figAlt: string;
  /** What the figure shows that the others do not, printed under it. */
  capture: string;
  /**
   * What the evidence link cannot carry. A record says where its own proof
   * stops; printed in witness ink in the slot the red link would take, so a
   * reader has seen the gate refuse and knows the red means something.
   */
  absent?: string;
  /**
   * A string the product itself produced, quoted verbatim where the figure
   * cannot carry the claim (an exported file is not a screen).
   */
  artifact?: string;
}

const STEP_SPEC: WalkStep[] = [
  {
    id: 'W-01',
    title: 'The studio holds chart and chat together',
    why: 'Asking used to open a panel on top of the chart. The full-screen studio docks the conversation beside it instead, so a question and the evidence it is about hold one screen between them.',
    prs: [45],
    params: '?full=1&exp=EXP-07&chart=age_curve',
    fig: '/prediction-lab/fig-w01-studio.jpg',
    cropW: 1600,
    cropH: 1000,
    figW: 1600,
    figH: 1000,
    figAlt: 'The whole studio: a list of every chart in the run down the left, the driver age chart and its table of exact numbers in the middle, and the question rail down the right',
    capture: 'the whole screen, once, so the crops below have a home',
  },
  {
    id: 'W-02',
    title: 'Right-click asks about the selection',
    why: 'Right-click a pinned slice and the question arrives in the rail with the selection attached, so it forms where the reader is already looking.',
    prs: [51],
    params: '?full=1&exp=EXP-07&chart=age_curve&sel=89:89',
    fig: '/prediction-lab/fig-w02-rightclick.jpg',
    cropW: 480,
    cropH: 130,
    figW: 1200,
    figH: 325,
    figAlt: 'The question box, pre-filled by the right-click, above a grey chip reading: Asking about EXP-07, driver age relativity, 89, level view',
    capture: 'the composer, filled by one right-click on age 89',
  },
  {
    id: 'W-03',
    title: 'A navigator docks the whole run',
    why: 'Every chart the run produced, grouped by experiment. A coloured dot carries each experiment’s verdict: blue for still standing, red for thrown out, green for the winner. Search reaches any of them, and a star floats one to the top. Changing charts no longer means leaving the studio.',
    prs: [47, 50, 57],
    params: '?full=1&exp=EXP-04&chart=accidents',
    /* The pins are browser-local, so the link carries the chart but leaves the
       two starred rows in the figure behind. Said on the sheet, not hidden. */
    absent: 'the star pins are saved per browser, so this link carries the chart and leaves the pins behind',
    fig: '/prediction-lab/fig-w03-navigator.jpg',
    cropW: 280,
    cropH: 660,
    figW: 840,
    figH: 1980,
    figAlt: 'The chart list: a pinned section on top holding two starred charts, then experiments EXP-01 through EXP-05, each with a coloured verdict dot and its own charts underneath',
    capture: 'two charts starred to the top, five experiments below',
  },
  {
    id: 'W-04',
    title: 'Uncertainty is on by default',
    why: 'A curve looks equally solid whether the data under it is thick or thin, and a price set from the thin part is a bad price. So the shaded error band and the grey bars showing how much data sits behind each age are drawn without being asked for, every reading carries its interval, and the weakest point in the chart is named in words.',
    prs: [59],
    params: '?full=1&exp=EXP-07&chart=age_curve&sel=89:89&tbl=off',
    fig: '/prediction-lab/fig-w04-uncertainty.jpg',
    cropW: 800,
    cropH: 640,
    figW: 1200,
    figH: 960,
    figAlt: 'The fitted curve inside a shaded error band, grey bars behind it showing how much data sits at each age, and a line reading: thinnest evidence, age 89, 180 earned car-years',
    capture: 'the band and the data bars, over the sentence naming the weakest age',
  },
  {
    id: 'W-05',
    title: 'Every chart has an exact-value twin',
    why: 'A table of the same numbers sits beside the chart, below it, alone, or off. It selects like a spreadsheet: sweeping cells moves the band on the plot, and clicking the plot lights the rows. Numbers you can only reach by hovering are slow to read and invisible to a screen reader.',
    prs: [59, 64, 65, 67],
    params: '?full=1&exp=EXP-07&chart=age_curve&tbl=side&sel=19:21',
    fig: '/prediction-lab/fig-w05-table-side.jpg',
    cropW: 800,
    cropH: 470,
    figW: 1200,
    figH: 705,
    figAlt: 'Rows 19, 20 and 21 swept as a tinted block in the table, with the matching band drawn on the chart beside it',
    capture: 'rows 19 to 21 swept by hand, and the band the sweep drew',
  },
  {
    id: 'W-06',
    title: 'Numbers leave with their provenance',
    why: 'Copy and the CSV both open with a line naming the chart, the experiment, the run, and the model version fitted against, and the file is named the same way. A block of figures pasted into a spreadsheet can still be traced back to where it came from.',
    prs: [62, 64],
    params: '?full=1&exp=EXP-07&chart=age_curve&tbl=only',
    fig: '/prediction-lab/fig-w06-table-only.jpg',
    cropW: 800,
    cropH: 300,
    figW: 1200,
    figH: 450,
    figAlt: 'The table standing alone, its Copy and Download CSV controls in the header above the column titles',
    capture: 'the two controls that carry the numbers out',
    artifact:
      'Driver age relativity · EXP-07 · run 234 · on v12 · BI claims / earned car year   ·   exp-07-age-curve-run-234-v12.csv',
  },
  {
    id: 'W-07',
    title: 'Approval freezes the evidence',
    why: 'Signing off draws the charts and their exact values once, inside the approval itself, and the record page reprints those stored drawings. A reader opening it years later sees what was signed, even if the code that drew it has moved on.',
    prs: [60],
    params: '/record/234',
    fig: '/prediction-lab/fig-w07-record.jpg',
    cropW: 830,
    cropH: 700,
    figW: 1245,
    figH: 1050,
    figAlt: 'The decision record: the frozen driver age chart above its table of exact values, set in a print palette rather than the app one',
    capture: 'the frozen drawing, reprinted from the signed record',
  },
  {
    id: 'W-08',
    title: 'The URL is the view',
    why: 'The open studio, the chart, the selection, where the table sits, and which comparison is showing all ride in the link, so a shared reading opens exactly where its author left it. Every link on this sheet works because of it.',
    prs: [45, 53, 64, 65],
    params: '?full=1&exp=EXP-07&chart=age_curve&mode=change&sel=19:21',
    fig: '/prediction-lab/fig-w08-share-view.jpg',
    cropW: 800,
    cropH: 640,
    figW: 1200,
    figH: 960,
    figAlt: 'The chart reopened from a cold link, showing change against v12 rather than the level view, with rows 19 to 21 still selected',
    capture: 'opened cold from the link beside it: change view, same rows',
  },
  {
    id: 'W-09',
    title: 'Four themes, styled to the scrollbars',
    why: 'Light, dark, night, gold. Each theme mixes its own scrollbar thumb, which is the last piece of system chrome a theme usually forgets. Below are two of the four.',
    prs: [38, 39, 62],
    params: null,
    absent: 'the theme is saved per browser and never enters the URL, so no link can carry it',
    fig: '/prediction-lab/fig-w09-gold.jpg',
    cropW: 1600,
    cropH: 1000,
    figW: 1600,
    figH: 1000,
    figAlt: 'The run overview in the gold theme: yellow ground, olive neutrals, every chart and panel restyled to match',
    capture: 'gold above, night below: the same screen on two grounds',
  },
] as const;


export const STEPS: WalkStep[] = STEP_SPEC.map((s) => {
  if (s.params !== null && !/^[?/]/.test(s.params)) {
    throw new Error(`step ${s.id} params must be a query string or a rooted path`);
  }
  return s;
});

/** Evidence URL for a step: the registry origin carrying the step's state. */
export function stepHref(s: WalkStep): string {
  if (s.params === null) return LAB.href;
  if (s.params.startsWith('/')) return `${LAB.href}${s.params}`;
  return `${LAB.href}/${s.params}`;
}

export interface WalkChapter {
  /** Chapter number 1..10 — also the digit key that jumps to it (0 = 10). */
  n: number;
  /** Start, seconds into the reel, measured from the encoded file. */
  at: number;
  title: string;
  /** Steps this chapter demonstrates, by ledger id. */
  steps: string[];
}

/* One word per chapter: the chapter log is a grid reference, not a synopsis.
   Each word names what the reel is doing there, and the steps beside it carry
   the detail. */
const CHAPTER_SPEC: Array<{ at: number; title: string; steps: string[] }> = [
  { at: 0, title: 'Themes', steps: ['W-09'] },
  { at: 3, title: 'Run', steps: ['W-08'] },
  { at: 18, title: 'Selection', steps: ['W-02', 'W-04'] },
  { at: 25, title: 'Studio', steps: ['W-01'] },
  { at: 46, title: 'Navigator', steps: ['W-03'] },
  { at: 62, title: 'Table', steps: ['W-05', 'W-06'] },
  { at: 94, title: 'Change', steps: ['W-08'] },
  { at: 106, title: 'Scrapped', steps: ['W-04'] },
  { at: 128, title: 'Package', steps: ['W-07'] },
  { at: 147, title: 'Record', steps: ['W-02', 'W-07'] },
];

export const CHAPTERS: WalkChapter[] = CHAPTER_SPEC.map((c, i) => {
  for (const id of c.steps) {
    if (!STEPS.some((s) => s.id === id)) {
      throw new Error(`chapter ${i + 1} cites unknown step ${id}`);
    }
  }
  return { n: i + 1, at: c.at, title: c.title, steps: c.steps };
});

/** Chapter under a given playback time. */
export function chapterAt(t: number): WalkChapter {
  let cur = CHAPTERS[0];
  for (const c of CHAPTERS) {
    if (t >= c.at) cur = c;
    else break;
  }
  return cur;
}

/** Mono timecode, MM:SS. The walk is under three minutes by design. */
export function timecode(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
