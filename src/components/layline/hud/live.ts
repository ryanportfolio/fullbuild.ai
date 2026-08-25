"use client";

import { createPose, legAt, poseAt, standingsAt, windAt } from "@/lib/layline/interpolate";
import type {
  LegName,
  Pose,
  RaceData,
  ReplayMode,
  StandingsRow,
  WindSample,
} from "@/lib/layline/types";
import { windAxisVmgFromComponents } from "@/lib/layline/velocity";
import { requestSceneFrame } from "../scene/gate";
import { setFocusHover } from "../scene/interaction";
import { useReplay } from "../store";

/** Shared keyboard/pointer focus seam for every standings row. */
export function focusLiveBoat(boatId: string | null): void {
  if (setFocusHover(boatId)) requestSceneFrame();
}

export interface LiveSample {
  t: number;
  mode: ReplayMode;
  followId: string;
  leg: LegName;
  /* The followed boat, evaluated once. The scene poses that boat from this
   * same object, so a reading in the dock can only differ from the hull it
   * describes by being asked about a different instant. */
  pose: Pose;
  wind: WindSample;
  /* Live rows, shared and re-sorted in place by the evaluator. Read it inside
   * the listener; do not keep it. */
  rows: StandingsRow[];
}

const pose: Pose = createPose();
const wind: WindSample = { t: 0, twd: 0, tws: 0 };
const sample: LiveSample = {
  t: Number.NaN,
  mode: "smooth",
  followId: "",
  leg: "prestart",
  pose,
  wind,
  rows: [],
};

let sampledRace: RaceData | null = null;
let sampledT = Number.NaN;
let sampledMode: ReplayMode | "" = "";
let sampledFollow = "";

/**
 * One evaluation per instant, shared by every reader on the page. The clock,
 * the mode and the followed boat are the whole input, so a second call inside
 * the same frame costs three compares and allocates nothing: every visible
 * reader calls this every frame, and a joined key would be a string per frame
 * per reader for an answer that is usually already on hand.
 */
export function sampleLive(race: RaceData): LiveSample {
  const state = useReplay.getState();
  if (
    race === sampledRace &&
    state.t === sampledT &&
    state.mode === sampledMode &&
    state.followId === sampledFollow
  ) {
    return sample;
  }
  sampledRace = race;
  sampledT = state.t;
  sampledMode = state.mode;
  sampledFollow = state.followId;
  sample.t = state.t;
  sample.mode = state.mode;
  sample.followId = state.followId;
  sample.leg = legAt(race, state.followId, state.t);
  poseAt(race, state.followId, state.t, state.mode, pose);
  windAt(race, state.t, wind);
  sample.rows = standingsAt(race, state.t);
  return sample;
}

/**
 * Fires once now and then on every store change. The clock only ever moves
 * inside a drawn frame, so this runs at frame rate while the replay plays and
 * not at all while it is frozen: the HUD never schedules a loop of its own.
 */
export function onLive(race: RaceData, listener: (live: LiveSample) => void): () => void {
  listener(sampleLive(race));
  return useReplay.subscribe(() => listener(sampleLive(race)));
}

/* Text goes in through here so an unchanged reading never touches the DOM. */
export function setText(node: { textContent: string | null } | null, text: string): void {
  if (node !== null && node.textContent !== text) node.textContent = text;
}

/**
 * Velocity made good along the wind axis, signed: positive upwind, negative
 * down. One of the two made-good readings the page carries, and this is the
 * one the instrument dock owns, labelled VMG there.
 *
 * The other is vmgToMark in lib/layline/analytics, speed along the fixed
 * course axis toward the next mark, and the strip under the transport owns
 * that one, labelled To mark. The wind shifts through the race and the course
 * does not, so the two readings differ in size as well as in sign and neither
 * can be read off the other.
 */
export function vmgOf(p: Pose, twd: number): number | null {
  return windAxisVmgFromComponents(
    p.waterX,
    p.waterY,
    p.currentX,
    p.currentY,
    twd,
  )?.ground ?? null;
}

/** Starboard tack when the wind is over the starboard side, port otherwise. */
export function tackOf(p: Pose): string {
  return p.twa < 0 ? "P" : "S";
}
