'use client';

import { create } from 'zustand';

export type PipelineState = 1 | 2 | 3 | 4;

/** One probe reading for a live project, as measured by /api/health. */
export interface HealthReading {
  up: boolean;
  /** HTTP status, or 0 when the request failed outright. */
  status: number;
  /** Measured round-trip latency, ms. */
  ms: number;
  /** ISO timestamp of the probe. */
  at: string;
}

interface WorkingSetStore {
  /** Current pipeline STATE (01-04), drives ink, HINGE, title block. */
  state: PipelineState;
  /** Normalized scroll progress across the whole set, 0..1. */
  progress: number;
  /** POUR progress specifically (STATE 03 -> 04), 0..1. */
  pour: number;
  /** Live-health readings keyed by project href. Missing = assume live until probed. */
  health: Record<string, HealthReading>;
  /** True once the WebGL island has mounted (used to tune the DOM layer). */
  webglActive: boolean;
  setState: (s: PipelineState) => void;
  setProgress: (p: number) => void;
  setPour: (p: number) => void;
  setHealth: (href: string, reading: HealthReading) => void;
  setWebglActive: (v: boolean) => void;
}

/** Convenience: is this href considered up? Missing reading = assume live. */
export function isUp(
  health: Record<string, HealthReading>,
  href: string | null,
): boolean {
  if (!href) return false;
  const r = health[href];
  return r ? r.up : true;
}

export const useWorkingSet = create<WorkingSetStore>((set) => ({
  state: 1,
  progress: 0,
  pour: 0,
  health: {},
  webglActive: false,
  setState: (s) => set((cur) => (cur.state === s ? cur : { state: s })),
  setProgress: (p) => set({ progress: p }),
  setPour: (p) => set({ pour: p }),
  setHealth: (href, reading) =>
    set((cur) => ({ health: { ...cur.health, [href]: reading } })),
  setWebglActive: (v) => set({ webglActive: v }),
}));
