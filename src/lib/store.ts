'use client';

import { create } from 'zustand';

export type PipelineState = 1 | 2 | 3 | 4;

interface WorkingSetStore {
  /** Current pipeline STATE (01-04), drives ink, HINGE, title block. */
  state: PipelineState;
  /** Normalized scroll progress across the whole set, 0..1. */
  progress: number;
  /** POUR progress specifically (STATE 03 -> 04), 0..1. */
  pour: number;
  /** Live-health map keyed by project href. Missing = assume live until probed. */
  health: Record<string, boolean>;
  /** True once the WebGL island has mounted (used to tune the DOM layer). */
  webglActive: boolean;
  setState: (s: PipelineState) => void;
  setProgress: (p: number) => void;
  setPour: (p: number) => void;
  setHealth: (href: string, up: boolean) => void;
  setWebglActive: (v: boolean) => void;
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
  setHealth: (href, up) =>
    set((cur) => ({ health: { ...cur.health, [href]: up } })),
  setWebglActive: (v) => set({ webglActive: v }),
}));
