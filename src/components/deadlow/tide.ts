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

/** Section 2.3: the drawing is metric in the vertical, schematic across. */
export const PX_PER_METRE = 24;
export const DATUM_Y = 232;
export const VIEW_W = 680;
export const VIEW_H = 260;

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

/** A height in metres above chart datum, plotted in viewBox units. */
export function yForMetres(metres: number): number {
  return DATUM_Y - PX_PER_METRE * metres;
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
