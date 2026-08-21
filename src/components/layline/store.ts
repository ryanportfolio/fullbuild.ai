"use client";

import { create } from "zustand";
import { generateRace } from "@/lib/layline/sim";
import { RACE_SEED } from "@/lib/layline/types";
import type { RaceData, ReplayMode, RigName } from "@/lib/layline/types";

/* One race per document. The server builds its own copy from the same seed for
 * the chart and the results, so the two can differ only if the seed does. */
let generated: RaceData | null = null;

export function raceData(): RaceData {
  if (generated === null) generated = generateRace(RACE_SEED);
  return generated;
}

/* Written by the render loop, read by the capture hook. Kept out of the store
 * because a per-frame counter that re-rendered the HUD would cost more than it
 * reports. */
export const renderStats = { drawCalls: 0, triangles: 0 };

/* A mid-beat moment with the fleet split and the standings meaningful. Reduced
 * motion opens here rather than on an empty prestart line. */
export const OPEN_AT = 18;

/* Live playback starts inside the prestart so the gun is something you watch
 * happen rather than something you scrub back to. Five seconds is the whole
 * of it in a sprint: the hook has to land while the fleet is still winding up
 * to the line. */
export const AUTOPLAY_FROM = -5;

/* The replay is over when the last boat crosses. The fixes run on a few more
 * seconds so the evaluator has something to read past the line, but the clock
 * stops here and the results stand. */
let endStamp: number | null = null;
export function endOfReplay(): number {
  if (endStamp === null) {
    const race = raceData();
    let last = race.tMin;
    for (const result of race.results) if (result.elapsed > last) last = result.elapsed;
    endStamp = last;
  }
  return endStamp;
}

export type PlayRate = 1 | 2 | 4;

interface ReplayStore {
  t: number;
  playing: boolean;
  rate: PlayRate;
  mode: ReplayMode;
  rig: RigName;
  followId: string;
  reducedMotion: boolean;
  /* True once the renderer has put a frame on screen, not merely once the
   * canvas element exists: the fallback chart stays up until there is an
   * actual image to replace it with. */
  webglOk: boolean;
  hudReady: boolean;
  /* Capture hold. The frame loop stops advancing the clock and the canvas
   * drops to on-demand rendering, so a screenshot is taken of a stated time
   * rather than of whenever the shutter happened to fall. */
  frozen: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  advance: (seconds: number) => void;
  setRate: (rate: PlayRate) => void;
  setMode: (mode: ReplayMode) => void;
  setRig: (rig: RigName) => void;
  follow: (boatId: string) => void;
  setReducedMotion: (reduced: boolean) => void;
  setWebglOk: (ok: boolean) => void;
  setHudReady: (ready: boolean) => void;
  freeze: () => void;
  thaw: () => void;
}

function clampTime(t: number): number {
  const race = raceData();
  if (!Number.isFinite(t)) return race.tMin;
  if (t < race.tMin) return race.tMin;
  if (t > race.tMax) return race.tMax;
  return t;
}

export const useReplay = create<ReplayStore>((set, get) => ({
  t: OPEN_AT,
  playing: false,
  rate: 1,
  mode: "smooth",
  rig: "tv",
  followId: "nzl",
  reducedMotion: false,
  webglOk: false,
  hudReady: false,
  frozen: false,

  /* Play from the end means play it again: the replay never loops on its own,
   * and the one control that restarts it is the one a viewer just pressed. */
  play: () =>
    set(get().t >= endOfReplay() - 1e-6 ? { t: AUTOPLAY_FROM, playing: true } : { playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => {
    if (get().playing) get().pause();
    else get().play();
  },
  seek: (t) => set({ t: clampTime(t) }),

  /* The only thing that moves the clock on its own, and it is called from
   * inside the render loop so a frozen or backgrounded page cannot drift. */
  advance: (seconds) => {
    const state = get();
    const race = raceData();
    const end = endOfReplay();
    const next = state.t + seconds;
    if (next >= end) {
      set({ t: end, playing: false });
      return;
    }
    set({ t: next < race.tMin ? race.tMin : next });
  },

  setRate: (rate) => set({ rate }),
  setMode: (mode) => set({ mode }),
  setRig: (rig) => set({ rig }),
  follow: (boatId) => set({ followId: boatId }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  setWebglOk: (ok) => set({ webglOk: ok }),
  setHudReady: (ready) => set({ hudReady: ready }),
  freeze: () => set({ frozen: true, playing: false }),
  thaw: () => set({ frozen: false }),
}));
