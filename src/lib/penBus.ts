/* ============================================================================
   PEN BUS — transient position channel for the plotter carriage.

   DRAW tweens and the pour trigger write targets here at animation rate; the
   carriage reads them with a direct DOM write. Deliberately NOT the Zustand
   store: these are 60fps transients with exactly one consumer, and routing
   them through React state would be churn for nothing.
   ========================================================================= */

export type PenInk = 'graphite' | 'cyanotype' | 'concrete' | 'live';

export interface PenTarget {
  /** Viewport coords. */
  x: number;
  y: number;
  ink: PenInk;
  /** draw = nib down following a stroke; pour = riding the waterline;
      dock = parked on the rail; hide = off-stage (fades out in place). */
  mode: 'draw' | 'pour' | 'dock' | 'hide';
}

type Listener = (t: PenTarget) => void;

const listeners = new Set<Listener>();

export const penBus = {
  last: null as PenTarget | null,
  set(t: PenTarget): void {
    this.last = t;
    listeners.forEach((l) => l(t));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
