/* ============================================================================
   MOTION PREFERENCE, read in one place.

   The set honours prefers-reduced-motion by default, and it can afford to:
   every sheet is server-rendered finished, so the reduced path loses the
   drawing and keeps the drawn.

   ONE SHEET OPTS OUT. E-02 is a record of a build in operation, opened by a
   reader who came to watch it play, and the drawn address in its rail is the
   thing the sheet exists to hand over. There is nothing on it that moves the
   ground under a reader: a pen line growing along its own path, a fill
   arriving behind it, a video the reader started. So the tape sheet runs its
   motion for everyone.

   The opt-out is one attribute written on <html> before first paint (see the
   motionAlways script in layout.tsx), which is what lets the CSS reduced-motion
   rule in globals.css and every JS caller here read the same decision on the
   same frame.
   ========================================================================= */

/** Written on <html> by the route-scoped pre-paint script in layout.tsx. */
export const MOTION_ALWAYS_ATTR = 'data-motion-always';

/**
 * True when the reader asked for less motion AND this sheet honours the ask.
 * SSR and any browser without matchMedia read false, which is the animated
 * path: those callers arm their own hidden state before painting anything.
 */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (document.documentElement.hasAttribute(MOTION_ALWAYS_ATTR)) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
