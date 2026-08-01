/**
 * DEAD LOW: today's tide, as constants and one curve.
 *
 * Every figure here comes from the route reference table in
 * `.tmp/anti-slop-brand-spec.md` (section 1) and the tide model in section 2.7.
 * Nothing is fetched, nothing is derived from the wall clock: the page clock is
 * a value this module is handed, so the rendered scene is fully determined by
 * the clock-step control.
 */

/** Minutes past midnight. Every time on the page is one of these. */
export const DEAD_LOW = 13 * 60 + 42; // 13:42
export const WINDOW_START = 12 * 60 + 47; // 12:47
export const WINDOW_END = 14 * 60 + 37; // 14:37
export const WINDOW_MINUTES = WINDOW_END - WINDOW_START; // 110
export const MUSTER = 12 * 60 + 30; // 12:30
/**
 * The scene's own now, and it is the muster. The page opens at the moment the
 * drawing is worth looking at: the flat drying, water still standing in the
 * channel and the two guts, and the almanac line legible across the dry ground.
 * Step the clock back and the sea comes in over all of it.
 */
export const PAGE_NOW = MUSTER; // 12:30

/** Section 2.7: the semidiurnal model this day is drawn from. */
export const PERIOD_MINUTES = 745; // 12h 25m
export const SPRINGS_RANGE_M = 7.6;
export const NEAPS_RANGE_M = 3.2;
export const PREDICTED_LOW_M = 0.4;
/** Southwest wind piling water in. Constant across the day, so the gap holds. */
export const SURGE_M = 0.3;
export const OBSERVED_LOW_M = PREDICTED_LOW_M + SURGE_M; // 0.7
/** Derived, not chosen: the level the route is walkable under. */
export const CROSSING_LEVEL_M = 1.1;

/**
 * Section 2.3 as amended by commitments P1 and P3 (amendment A51). The
 * drawing's vertical frame is fixed in METRES, not in pixels, and the pixels
 * per metre are derived from whatever height the section renders at.
 *
 * The frame is CROPPED TO THE TIDAL ZONE: 0.25 m of ground below chart datum so
 * the datum line is drawn rather than implied, up to 3.25 m, which is 1.87 m
 * over the highest water the window reaches. The two land ends of the route,
 * the 6.20 m ramp and the 5.40 m shingle, run off the top of the frame the way
 * land runs off the top of any tidal section.
 *
 * The repealed frame was -0.5 to 6.5 m, which drew 7 m of relief to show a
 * 0.30 m disagreement: the whole product argument rendered at 4 percent of the
 * frame and the middle of the drawing was a flat wash with nothing in it. At
 * 3.5 m the surge draws at 72 to 85px and the bed profile uses the whole box.
 */
export const FRAME_TOP_M = 3.25;
export const FRAME_BOTTOM_M = -0.25;
export const FRAME_SPAN_M = FRAME_TOP_M - FRAME_BOTTOM_M; // 3.5

/**
 * viewBox units. The horizontal is schematic (2.3) and the vertical is metric,
 * so the box is 100 units per metre of frame and `preserveAspectRatio="none"`
 * maps those units onto whatever height the section is given. One unit is one
 * centimetre of tide at every viewport, which is what makes the scale derived
 * rather than declared.
 */
export const UNITS_PER_METRE = 100;
export const VIEW_W = 680;
export const VIEW_H = FRAME_SPAN_M * UNITS_PER_METRE; // 350
export const DATUM_Y = FRAME_TOP_M * UNITS_PER_METRE; // 325

/**
 * Commitment P1: the rendered scale, per viewport. The section's height is a
 * viewport fraction (2.3), so this is the figure the level readouts and the
 * predicted-versus-observed gap are recomputed from.
 */
export function pxPerMetre(sectionHeightPx: number): number {
  return sectionHeightPx / FRAME_SPAN_M;
}

/** Commitment P3: the drawn disagreement, in real pixels, at a given height. */
export function gapPx(sectionHeightPx: number): number {
  return SURGE_M * pxPerMetre(sectionHeightPx);
}

/**
 * The section's height, as a percentage of viewport height, per 2.2 tier.
 * These are not taste. They are the heights at which the muster card, the
 * display block and the readout strip all stand inside the section with the
 * observed level crossing the type (P4), given the 3.5 m frame above.
 *
 * The phone takes 92vh (amendment A52): the whole answer, the drawing, both
 * horizons and the labelled surge are inside a 390x844 fold, which is what the
 * two reviews both called blocking about the repealed 76vh stack.
 */
export const SECTION_VH = { phone: 92, tablet: 80, desk: 94 };

/**
 * Amendment A53. The clock scrubber's range: a six hour day around dead low,
 * so the reader can drag the water from over the ramp to the bottom of the
 * tide and watch the ground come out. The window is drawn as a lit segment of
 * this track, which is what turns the control into a picture of the day.
 */
export const SCRUB_START = 10 * 60 + 30; // 10:30
export const SCRUB_END = 16 * 60 + 30; // 16:30
export const SCRUB_SPAN = SCRUB_END - SCRUB_START; // 360

/**
 * The tide range scale beside "springs and neaps" is a separate instrument and
 * keeps the 24px-per-metre bar 2.3 dimensions, because a range bar has no
 * viewport to derive from.
 */
export const SCALE_PX_PER_METRE = 24;

export const PLACES = 14;
export const CHANNEL_BED_M = 0.35;
/** Wading depth at dead low: observed low over the lowest ground on the route. */
export const CHANNEL_DEPTH_M = Math.round((OBSERVED_LOW_M - CHANNEL_BED_M) * 100) / 100; // 0.35

export type Station = {
  x: number;
  distance: string;
  name: string;
  bed: number;
  note: string;
};

/** Ramp at x=0 to holm at x=680, bed heights above chart datum. */
export const STATIONS: Station[] = [
  { x: 0, distance: '0.00 mi', name: 'Cross Farm ramp', bed: 6.2, note: 'muster here, boots on' },
  { x: 145, distance: '0.85 mi', name: 'Hard sand ends', bed: 2.1, note: 'last firm ground' },
  { x: 272, distance: '1.60 mi', name: 'Marram Gut', bed: 1.2, note: 'poles set every twenty paces' },
  { x: 408, distance: '2.40 mi', name: 'Soft ground', bed: 1.6, note: 'walk the line, not the shortcut' },
  { x: 527, distance: '3.10 mi', name: 'Sker Channel', bed: 0.35, note: 'lowest ground, wade it' },
  { x: 629, distance: '3.70 mi', name: 'Second gut', bed: 1.1, note: 'ankle deep on springs' },
  { x: 680, distance: '4.00 mi', name: 'Sker Holm shore', bed: 5.4, note: 'shingle, then the path up' },
];

/**
 * Commitment P2. The route is the page's spine: vertical scroll moves the
 * reader horizontally along it, and the scroll length of each leg is that
 * leg's share of the four miles. This is what gives the scroll position a
 * unit. Parallax moves because moving is decorative; this moves because the
 * reader is somewhere on a four mile walk.
 */
export const TRACK_VH = 64;
export const LEGS = STATIONS.slice(0, -1).map((s, i) => ({
  from: s,
  to: STATIONS[i + 1],
  /** Viewport heights of scroll this leg is worth, proportional to its length. */
  vh: ((STATIONS[i + 1].x - s.x) / VIEW_W) * TRACK_VH,
}));

/** Distance along the route, in schematic viewBox units, for a scroll fraction. */
export function routeX(progress: number): number {
  return Math.min(1, Math.max(0, progress)) * VIEW_W;
}

/** The station the reader has reached at a scroll fraction. */
export function stationAt(progress: number): Station {
  const x = routeX(progress);
  let found = STATIONS[0];
  for (const s of STATIONS) if (s.x <= x + 1e-9) found = s;
  return found;
}

/**
 * Its place in the numbered route, zero based. The readout strip states it so
 * the strip reads as row one of the same list the legs below continue, rather
 * than as a separate instrument that happens to sit above a list starting at
 * two (amendment A42).
 */
export function stationIndexAt(progress: number): number {
  const x = routeX(progress);
  let found = 0;
  STATIONS.forEach((s, i) => {
    if (s.x <= x + 1e-9) found = i;
  });
  return found;
}

/**
 * A bed height as a fraction of the frame, for the ledger's inline profile
 * column (amendment A46 as amended by A54). Clamped at the frame top, because
 * the ramp and the shingle stand above it.
 */
export function bedFraction(metres: number): number {
  return Math.min(1, (metres - FRAME_BOTTOM_M) / FRAME_SPAN_M);
}

/** A height in metres above chart datum, plotted in viewBox units. */
export function yForMetres(metres: number): number {
  return (FRAME_TOP_M - metres) * UNITS_PER_METRE;
}

/**
 * The same height as a percentage of the section's rendered height, clamped to
 * the frame.
 *
 * Amendment A58. Unclamped, a level above FRAME_TOP_M returned a negative
 * percentage, which carried the horizon rails and everything hung on them above
 * the drawing and into the station ruler: at 16:10 on the clock control the gap
 * callout printed over the ruler numerals at 768 and 1440. Clamping is also the
 * truthful drawing: the frame holds 3.25 m and water standing higher than that
 * fills it, so the rail pins to the top edge rather than leaving the picture.
 * The bottom was already clamped one function up.
 */
export function pctForMetres(metres: number): number {
  const pct = ((FRAME_TOP_M - metres) / FRAME_SPAN_M) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * The almanac. A single semidiurnal cosine pinned to today's dead low, so the
 * curve passes through 0.4 m at 13:42 and reaches 8.0 m at high water.
 */
export function predictedMetres(minutes: number): number {
  const phase = (2 * Math.PI * (minutes - DEAD_LOW)) / PERIOD_MINUTES;
  return PREDICTED_LOW_M + (SPRINGS_RANGE_M / 2) * (1 - Math.cos(phase));
}

/** The sea. The almanac plus what the wind is doing to it today. */
export function observedMetres(minutes: number): number {
  return predictedMetres(minutes) + SURGE_M;
}

/** True while the tide is making, false while it is ebbing. */
export function isFlooding(minutes: number): boolean {
  const phase = (((minutes - DEAD_LOW) % PERIOD_MINUTES) + PERIOD_MINUTES) % PERIOD_MINUTES;
  return phase < PERIOD_MINUTES / 2;
}

export function formatClock(minutes: number): string {
  const wrapped = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMetres(metres: number): string {
  return metres.toFixed(2);
}

export type CountdownState = {
  /** Uppercase-free label, set as sentence case and cased by CSS. */
  label: string;
  value: string;
  /** True once the window is open, so the copy can say closes instead of opens. */
  open: boolean;
};

/**
 * Before the window it counts to the opening, inside it counts to the closing.
 * Seconds are shown because the thing being counted is a door, not a mood.
 */
export function countdownFor(minutes: number): CountdownState {
  const open = minutes >= WINDOW_START && minutes < WINDOW_END;
  const past = minutes >= WINDOW_END;
  const target = open ? WINDOW_END : WINDOW_START;
  const remaining = Math.max(0, (target - minutes) * 60);
  const total = Math.floor(remaining);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const value = past
    ? '0:00:00'
    : `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const label = past
    ? 'The window is shut for today'
    : open
      ? 'Until the window shuts'
      : 'Until the window opens';
  return { label, value, open };
}
