/*
 * THE CLOCK, IN ONE FILE. Every duration, weight and beat the homepage intro obeys is
 * declared here and read from here. Nothing downstream may hold a second copy of a number:
 * the film's registration against the artifact and the warp's crossing beat are both
 * derived quantities, and a duplicated literal is how a derived quantity silently stops
 * being derived.
 *
 * Two clocks run, and they are deliberately different in kind:
 *
 *   ACT 1, the film, is a pure function of load percent. No wall clock reaches it. A fast
 *   machine plays it fast, a stalled signal parks it on a legitimate half inked sheet, and
 *   holding the percent reproduces any frame byte for byte.
 *
 *   ACTS 2 to 4, the cinematic, run on a wall clock because they are a camera move rather
 *   than a progress report. They are made capturable by the beat table below instead:
 *   pinning tPost and the pointer reproduces those frames exactly the same way.
 */

/* ── ACT 1: the load model ─────────────────────────────────────────────────── */

/*
 * Real signals, weighted to a hundred. Nothing here is a fake ramp dressed up as progress:
 * every weight is paid out by something the browser actually finished.
 *
 * Fonts carry the largest single share for a structural reason rather than a guess. The
 * FULLBUILD lockup interpolates font-weight and font-stretch on the loaded Archivo face,
 * so a film that finishes before the fonts land shows the lockup snapping its metrics at
 * the very moment the drawing is meant to become the object.
 */
export const INTRO_WEIGHTS = {
  FONTS: 30,
  PAGE: 22,
  CHUNK: 18,
  FIRST_FRAME: 30,
} as const;

export type IntroSignal = keyof typeof INTRO_WEIGHTS;

/* A warm cache still watches the drawing get drawn. */
export const INTRO_MIN_MS = 1450;
/* And a stalled signal never parks the film there forever. */
export const INTRO_MAX_MS = 4200;

/*
 * THE FOLLOWER, copied from the showcase loader with its values intact because the reasons
 * are intact. The loading clock emits every integer on the normal path, so nothing needs
 * smoothing; what needs protecting against is a jump. The WebGL compile blocks the main
 * thread through the first real frames, so a follower that banks that stalled time paints
 * its first live frame already nineteen points in, and a hidden tab freezes the frameloop
 * the same way. Capping the step at two frames of credit means a stall pauses the film
 * rather than fast-forwarding it.
 *
 * A rate limit rather than an exponential: an exponential lags the clock by around nine
 * points for free and the drawing hands over late. The landing window is the one eased
 * stretch, and the floor keeps a crawl alive so the counter decelerates to rest instead of
 * stopping mid-stride.
 *
 * The opening is the drawing act, and its speed is a constraint rather than a taste: the
 * drawn furniture lives entirely under load 0.11 and its narrowest bands (readout, each
 * lockup letter) are 2.2 load points wide, so no element may cross a whole band between
 * frames sampled 150ms apart. The follower therefore runs flat at INTRO_OPEN_RATIO through
 * the first INTRO_DRAW_POINTS: 1000 * 100 * 0.06 / 620 = 9.7 points per second, 1.45
 * points per 150ms frame, under the 2.2 point band width. Only past the draw zone does the
 * quadratic ramp to full pace begin. The previous ratio of 0.38 swept a letter band in
 * about 35ms of wall time, which read as letters popping in whole.
 */
export const INTRO_SWEEP_MS = 620;
export const INTRO_STEP_MS = 34;
export const INTRO_LAND_POINTS = 9;
export const INTRO_LAND_FLOOR = 0.12;
export const INTRO_DRAW_POINTS = 11;
export const INTRO_OPEN_POINTS = 22;
export const INTRO_OPEN_RATIO = 0.06;

/* ── ACTS 2 to 4: the cinematic ────────────────────────────────────────────── */

/*
 * HANDOVER. The film fades out over the artifact, which is already painted underneath at
 * the identical size and place. That registration is what makes this read as the drawing
 * becoming the object rather than as a crossfade between two pictures.
 */
export const HANDOVER_MS = 640;

/* THE BREATH. The world is alive and nothing is asked of the reader yet. */
export const REVEAL_MS = 1500;
/*
 * THE BUILD, INSIDE THE BREATH. The reveal used to be a second and a half of a face-on mark
 * breathing on a glow, which is a drawing lit from behind rather than an object: the arc is
 * drawn, then built, then alive, and the middle term had no frame that showed it. So the
 * object turns, once, out of the exact pose the film handed over.
 *
 * It starts after the handover's most opaque frames and finishes before the charge, so the
 * registration the film is judged on is untouched at either end: at tPost 0 the pose is the
 * film's last frame, and by the time the camera commits the turn has already settled.
 */
export const REVEAL_TURN_START = 240;
export const REVEAL_TURN_END = 1250;
/* Anticipation. The camera pulls back a hair and the light steps up before the run. */
export const CHARGE_MS = 180;
/* The run through the doorway. */
export const WARP_MS = 980;
/*
 * Where the lens crosses the panel plane, as a fraction of the warp. This is not measured
 * after the fact: the camera path in IntroScene is solved so the crossing lands here for
 * every viewport scale and every chase offset, which is what makes warp-through a fixed,
 * capturable beat instead of an accident of geometry.
 */
export const WARP_CROSS_U = 0.85;
/*
 * The burst overlaps the warp tail on purpose. Geometry pops as it passes the near plane,
 * and the flood is what covers exactly those frames.
 */
export const BURST_MS = 387;
/* The flood resolves to the page's own ground and fades off it. */
export const SETTLE_MS = 620;

/* A skip is not a fast-forward: it is the shortest honest way out from wherever you are. */
export const SKIP_FADE_MS = 260;

/*
 * THE HEAD START. The homepage has an opening act of its own, held behind this overlay from
 * before first paint (src/lib/introHold.ts), and the join between the two is the seam this
 * number exists to remove. Released at the same instant the overlay leaves, the page would
 * begin from zero on the frame after the veil cleared, which reads as two films in sequence:
 * the intro, then a beat, then the page starting. Released this far ahead of the end, the
 * pen is already sweeping the wordmark while the settle is still dissolving, so what comes
 * through the fade is a page mid-entrance rather than a page about to have one.
 *
 * Chosen at the top of the agreed 100 to 300ms band rather than the middle: the plot has a
 * few frames of canvas work to do between the release and its first visible ink, and the
 * settle's own fade is eased, so the last 220ms of it is where most of the page appears.
 *
 * It applies to the skip path too, measured back from the end of the short skip fade rather
 * than the end of the cinematic, so cutting the intro short still lands mid-entrance rather
 * than on a page that starts after the reader has already left.
 */
export const ENTRANCE_LEAD_MS = 220;

export const REVEAL_START = 0;
export const CHARGE_START = REVEAL_MS;
export const WARP_START = CHARGE_START + CHARGE_MS;
export const WARP_END = WARP_START + WARP_MS;
export const BURST_START = WARP_START + WARP_MS * WARP_CROSS_U;
export const SETTLE_START = BURST_START + BURST_MS;
export const INTRO_END = SETTLE_START + SETTLE_MS;

/*
 * THE BEAT TABLE. Named frames the capture hook can pin, so verification photographs the
 * same moment every time instead of whatever the wall clock happened to be showing.
 *
 * `reveal` sits mid-breath rather than at zero, so the captured frame has the glow up and
 * the chase alive rather than showing the instant the film left. `warp-through` is the
 * computed crossing, not a round number near it.
 */
export const INTRO_BEATS = {
  reveal: 700,
  charge: 1590,
  "warp-mid": 2170,
  "warp-through": BURST_START,
  burst: 2700,
  settle: 3100,
} as const;

export type IntroBeat = keyof typeof INTRO_BEATS;

export const INTRO_BEAT_NAMES = Object.keys(INTRO_BEATS) as IntroBeat[];

/* ── shared shaping ────────────────────────────────────────────────────────── */

export function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/* Deceleration into rest, no overshoot. The house easing, in one place. */
export function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function progressBetween(value: number, start: number, end: number) {
  return clamp01((value - start) / Math.max(1, end - start));
}

export type IntroPhase = "film" | "reveal" | "charge" | "warp" | "burst" | "settle" | "done";

/*
 * Which act a given tPost is in. Read for reporting and for the capture hook's state()
 * only: every layer computes its own eased term off tPost directly rather than branching
 * on a phase name, so nothing can arrive a frame late at a boundary.
 */
export function phaseAt(tPost: number): IntroPhase {
  if (tPost < 0) return "film";
  if (tPost >= INTRO_END) return "done";
  if (tPost >= SETTLE_START) return "settle";
  if (tPost >= BURST_START) return "burst";
  if (tPost >= WARP_START) return "warp";
  if (tPost >= CHARGE_START) return "charge";
  return "reveal";
}
