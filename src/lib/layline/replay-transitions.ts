import type { ReplayMode, RigName } from "./types";

export const OPEN_AT = 18;

export type ReplayTransitionState = {
  raceId: string;
  t: number;
  playing: boolean;
  rate: 1 | 2 | 4;
  mode: ReplayMode;
  rig: RigName;
  followId: string;
  chart2d: boolean;
  truthMode: boolean;
  reducedMotion: boolean;
  frozen: boolean;
};

export type ReplayTransition =
  | { type: "select-race"; raceId: string }
  | { type: "set-mode"; mode: ReplayMode }
  | { type: "set-chart-2d"; on: boolean }
  | { type: "set-truth"; on: boolean };

export const RACE_REPLAY_DEFAULTS = {
  t: OPEN_AT,
  playing: false,
  followId: "nzl",
  rig: "tv" as RigName,
  chart2d: false,
};

/**
 * Apply replay-view transitions without React or Zustand. The store calls this
 * reducer directly, so race reset and independent view-layer rules have one
 * executable definition.
 */
export function transitionReplay(
  state: ReplayTransitionState,
  transition: ReplayTransition,
): ReplayTransitionState {
  if (transition.type === "select-race") {
    return { ...state, raceId: transition.raceId, ...RACE_REPLAY_DEFAULTS };
  }
  if (transition.type === "set-mode") return { ...state, mode: transition.mode };
  if (transition.type === "set-chart-2d") return { ...state, chart2d: transition.on };
  return { ...state, truthMode: transition.on };
}
