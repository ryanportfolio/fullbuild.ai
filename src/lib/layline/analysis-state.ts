import {
  normalizeAnalysisRange,
  type AnalysisRange,
  type ComparisonReference,
} from "./comparison";
import { clampTimelineWindow, type TimelineWindow } from "./timeline";
import type { RaceData } from "./types";

export interface AnalysisState {
  focusSpanSeconds: number | null;
  focusCenterSeconds: number;
  selectedRange: AnalysisRange;
  rangePinned: boolean;
  reference: ComparisonReference;
}

export interface AnalysisOwnerState {
  followId: string;
  analysis: AnalysisState;
}

export type AnalysisEvidenceEdge = "in" | "out";

export type AnalysisAction =
  | { type: "set-focus"; spanSeconds: number | null; centerSeconds?: number }
  | { type: "recenter-focus"; centerSeconds: number }
  | { type: "set-range"; from: number; to: number; pinned?: boolean }
  | { type: "set-range-in"; at: number }
  | { type: "set-range-out"; at: number }
  | { type: "use-focus" }
  | { type: "reset-range" }
  | { type: "set-reference"; reference: ComparisonReference };

function copyReference(reference: ComparisonReference): ComparisonReference {
  return reference.kind === "boat"
    ? { kind: "boat", boatId: reference.boatId }
    : { kind: "fleet-median", boatIds: [...reference.boatIds] };
}

function fleetReference(race: RaceData): ComparisonReference {
  return { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) };
}

function validReference(
  race: RaceData,
  reference: ComparisonReference,
  primaryBoatId: string,
): ComparisonReference {
  const knownIds = new Set(race.boats.map((boat) => boat.id));
  if (reference.kind === "boat") {
    if (knownIds.has(reference.boatId) && reference.boatId !== primaryBoatId) {
      return copyReference(reference);
    }
    const rival = race.boats.find((boat) => boat.id !== primaryBoatId);
    return rival === undefined ? fleetReference(race) : { kind: "boat", boatId: rival.id };
  }

  const requested = new Set(reference.boatIds);
  const boatIds = race.boats
    .map((boat) => boat.id)
    .filter((boatId) => requested.has(boatId));
  return boatIds.length === 0 ? fleetReference(race) : { kind: "fleet-median", boatIds };
}

export function analysisFocusWindow(race: RaceData, state: AnalysisState): TimelineWindow {
  return clampTimelineWindow(race, state.focusCenterSeconds, state.focusSpanSeconds);
}

export function createAnalysisState(
  race: RaceData,
  replayTime: number,
  reference: ComparisonReference = {
    kind: "fleet-median",
    boatIds: race.boats.map((boat) => boat.id),
  },
): AnalysisState {
  const center = Number.isFinite(replayTime)
    ? Math.min(race.tMax, Math.max(race.tMin, replayTime))
    : race.tMin;
  return {
    focusSpanSeconds: null,
    focusCenterSeconds: center,
    selectedRange: normalizeAnalysisRange(race, race.tMin, race.tMax),
    rangePinned: false,
    reference: copyReference(reference),
  };
}

/**
 * Clamp race-owned intent and repair a stale or self-referential rival. Viewer
 * and replay fields are deliberately outside this function.
 */
export function reconcileAnalysisState(
  race: RaceData,
  state: AnalysisState,
  primaryBoatId: string,
): AnalysisState {
  const focusSpanSeconds =
    state.focusSpanSeconds === null ||
    !Number.isFinite(state.focusSpanSeconds) ||
    state.focusSpanSeconds <= 0
      ? null
      : state.focusSpanSeconds;
  const focus = clampTimelineWindow(
    race,
    state.focusCenterSeconds,
    focusSpanSeconds,
  );
  const selectedRange =
    Number.isFinite(state.selectedRange.from) && Number.isFinite(state.selectedRange.to)
      ? normalizeAnalysisRange(race, state.selectedRange.from, state.selectedRange.to)
      : normalizeAnalysisRange(race, race.tMin, race.tMax);
  return {
    focusSpanSeconds,
    focusCenterSeconds: focus.from + focus.span / 2,
    selectedRange,
    rangePinned: state.rangePinned,
    reference: validReference(race, state.reference, primaryBoatId),
  };
}

/** Apply analysis intent without touching replay time, playback or viewer state. */
export function transitionAnalysisOwner<TState extends AnalysisOwnerState>(
  race: RaceData,
  state: TState,
  action: AnalysisAction,
): TState {
  return {
    ...state,
    analysis: reconcileAnalysisState(
      race,
      transitionAnalysisState(race, state.analysis, action),
      state.followId,
    ),
  };
}

/**
 * Existing follow selection is the primary-boat authority. Invalid IDs are
 * inert; a newly self-referential named rival heals deterministically.
 */
export function transitionAnalysisPrimary<TState extends AnalysisOwnerState>(
  race: RaceData,
  state: TState,
  primaryBoatId: string,
): TState {
  if (!race.boats.some((boat) => boat.id === primaryBoatId)) return state;
  return {
    ...state,
    followId: primaryBoatId,
    analysis: reconcileAnalysisState(race, state.analysis, primaryBoatId),
  };
}

/** Resolve a range evidence action without changing the selected range. */
export function analysisEvidenceTarget(
  state: AnalysisState,
  edge: AnalysisEvidenceEdge,
): { range: AnalysisRange; seekTo: number } {
  const range = { ...state.selectedRange };
  return { range, seekTo: edge === "in" ? range.from : range.to };
}

export function transitionAnalysisState(
  race: RaceData,
  state: AnalysisState,
  action: AnalysisAction,
): AnalysisState {
  if (action.type === "set-focus") {
    if (
      (action.spanSeconds !== null &&
        (!Number.isFinite(action.spanSeconds) || action.spanSeconds <= 0)) ||
      (action.centerSeconds !== undefined && !Number.isFinite(action.centerSeconds))
    ) {
      return state;
    }
    const center = action.centerSeconds ?? state.focusCenterSeconds;
    const window = clampTimelineWindow(race, center, action.spanSeconds);
    return {
      ...state,
      focusSpanSeconds: action.spanSeconds,
      focusCenterSeconds: window.from + window.span / 2,
    };
  }
  if (action.type === "recenter-focus") {
    if (!Number.isFinite(action.centerSeconds)) return state;
    const window = clampTimelineWindow(race, action.centerSeconds, state.focusSpanSeconds);
    return { ...state, focusCenterSeconds: window.from + window.span / 2 };
  }
  if (action.type === "set-range") {
    if (!Number.isFinite(action.from) || !Number.isFinite(action.to)) return state;
    return {
      ...state,
      selectedRange: normalizeAnalysisRange(race, action.from, action.to),
      rangePinned: action.pinned ?? true,
    };
  }
  if (action.type === "set-range-in") {
    if (!Number.isFinite(action.at)) return state;
    return {
      ...state,
      selectedRange: normalizeAnalysisRange(race, action.at, state.selectedRange.to),
      rangePinned: true,
    };
  }
  if (action.type === "set-range-out") {
    if (!Number.isFinite(action.at)) return state;
    return {
      ...state,
      selectedRange: normalizeAnalysisRange(race, state.selectedRange.from, action.at),
      rangePinned: true,
    };
  }
  if (action.type === "use-focus") {
    const focus = analysisFocusWindow(race, state);
    return {
      ...state,
      selectedRange: normalizeAnalysisRange(race, focus.from, focus.to),
      rangePinned: true,
    };
  }
  if (action.type === "reset-range") {
    return {
      ...state,
      selectedRange: normalizeAnalysisRange(race, race.tMin, race.tMax),
      rangePinned: false,
    };
  }
  return { ...state, reference: copyReference(action.reference) };
}
