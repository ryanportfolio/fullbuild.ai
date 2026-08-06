export type ShowcaseProject = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  tags: readonly string[];
  colors: readonly [string, string, string];
  media: string;
  motif: "fault" | "assembly" | "burn" | "quench" | "market" | "loop" | "thread" | "morrow" | "dead-low";
  /** The real prototype page this chapter opens, same behavior as the source's case pages. */
  href: string;
};

/*
 * 21 screens, up from 17: every beat threshold is a fraction of the track, so a longer
 * track stretches each chapter's dwell without moving any handover or the finale.
 */
export const TRACK_SCREENS = 21;

/*
 * Every chapter owns the same slice of the track. Uneven centres left a three-screen
 * dead stretch between projects six and seven and crammed the last two into barely one,
 * so a reader could scroll a whole viewport and meet no new event.
 */
const PROJECT_CENTERS = [0, 0.117, 0.234, 0.351, 0.468, 0.585, 0.702, 0.819, 0.936] as const;
// The run-out into the finale is not a chapter, and it is shorter than one: the ninth
// crystal has to be clear of the frame before the contact lockup fades up at 0.978.
const FINALE_RUN_OUT = 0.082;

export const SHOWCASE_PROJECTS: readonly ShowcaseProject[] = [
  {
    id: "morrow",
    href: "/prototype/morrow",
    title: "Morrow",
    eyebrow: "Future utility",
    summary: "A quiet instrument for making tomorrow feel close enough to inspect and shape",
    tags: ["Product", "Identity", "R3F"],
    colors: ["#c6beff", "#654eff", "#110d29"],
    media: "/prototype/showcase/media/morrow-crystal-v3.png",
    motif: "morrow",
  },
  {
    id: "burn-in",
    href: "/prototype/burn-in",
    title: "Burn-In",
    eyebrow: "Cultural archive",
    summary: "A permanent image afterglow built from memory, repetition, and luminous residue",
    tags: ["Editorial", "Archive", "Canvas"],
    colors: ["#fc3f87", "#702dff", "#100622"],
    media: "/prototype/showcase/media/burn-in.webp",
    motif: "burn",
  },
  {
    id: "fault-line",
    href: "/prototype/fault-line",
    title: "Fault Line",
    eyebrow: "Interactive campaign",
    summary: "A pressure field that turns an invisible structural force into a tactile launch story",
    tags: ["WebGL", "Direction", "Motion"],
    colors: ["#ff5038", "#ffbc2f", "#120816"],
    media: "/prototype/showcase/media/fault-line.webp",
    motif: "fault",
  },
  {
    id: "assembly-line",
    href: "/prototype/assembly-line",
    title: "Assembly Line",
    eyebrow: "Product narrative",
    summary: "An industrial system made legible through rhythm, sequence, and exact visual feedback",
    tags: ["3D", "Product", "Systems"],
    colors: ["#d7ff47", "#4c5f25", "#10130d"],
    media: "/prototype/showcase/media/assembly-line.webp",
    motif: "assembly",
  },
  {
    id: "quench",
    href: "/prototype/quench",
    title: "Quench",
    eyebrow: "Launch platform",
    summary: "A cold material study where depth and speed make a technical product feel immediate",
    tags: ["WebGL", "Launch", "Identity"],
    colors: ["#79efff", "#1670e8", "#061426"],
    media: "/prototype/showcase/media/quench.webp",
    motif: "quench",
  },
  {
    id: "fahrzeugmarkt",
    href: "/prototype/fahrzeugmarkt",
    title: "Fahrzeugmarkt",
    eyebrow: "Marketplace prototype",
    summary: "A dense vehicle market recut as one precise, cinematic path through selection",
    tags: ["Commerce", "Interface", "3D"],
    colors: ["#f6efdd", "#ff532e", "#1c1a19"],
    media: "/prototype/showcase/media/fahrzeugmarkt.webp",
    motif: "market",
  },
  {
    id: "loop-zero",
    href: "/prototype/loop-zero",
    title: "Loop Zero",
    eyebrow: "Autonomous systems",
    summary: "A looping control room for work that learns, adapts, and returns with a better answer",
    tags: ["AI", "Product", "Motion"],
    colors: ["#78ffb6", "#03736e", "#031b1b"],
    media: "/prototype/showcase/media/loop-zero.webp",
    motif: "loop",
  },
  {
    id: "threadline",
    href: "/prototype/threadline",
    title: "Threadline",
    eyebrow: "Network story",
    summary: "Distributed work shown as a living line that gathers context without losing its origin",
    tags: ["Data", "Narrative", "WebGL"],
    colors: ["#ffdf5b", "#f05922", "#251005"],
    media: "/prototype/showcase/media/threadline.webp",
    motif: "thread",
  },
  {
    id: "dead-low",
    href: "/prototype/deadlow",
    title: "Dead Low",
    eyebrow: "Signal experiment",
    summary: "A low-frequency digital object assembled from interference, compression, and control",
    tags: ["Experimental", "Audio-free", "WebGL"],
    colors: ["#f4f4e8", "#9bff24", "#080a08"],
    media: "/prototype/showcase/media/dead-low.webp",
    motif: "dead-low",
  },
] as const;

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function projectProgress(scrollProgress: number) {
  return clamp01((scrollProgress - 0.055) / 0.84);
}

export function projectFloat(scrollProgress: number) {
  const progress = clamp01(scrollProgress);
  for (let index = 0; index < PROJECT_CENTERS.length - 1; index += 1) {
    const start = PROJECT_CENTERS[index];
    const end = PROJECT_CENTERS[index + 1];
    if (progress <= end) {
      return index + clamp01((progress - start) / Math.max(0.001, end - start));
    }
  }
  // The tail keeps travelling instead of freezing on the last chapter, so the ninth
  // crystal leaves the frame rather than blinking out under the finale.
  const last = PROJECT_CENTERS.length - 1;
  return last + (progress - PROJECT_CENTERS[last]) / FINALE_RUN_OUT;
}

/*
 * The ledger hands over at 38 percent of a transition, not at the midpoint. By then the
 * outgoing crystal is a clipped corner on its way off the frame and the incoming one is
 * a whole readable object, so the block always names whatever owns the screen.
 */
const LEDGER_HANDOVER = 0.62;

export function activeProjectIndex(scrollProgress: number) {
  return Math.min(
    SHOWCASE_PROJECTS.length - 1,
    Math.max(0, Math.floor(projectFloat(scrollProgress) + LEDGER_HANDOVER)),
  );
}
