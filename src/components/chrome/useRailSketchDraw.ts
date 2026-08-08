'use client';

/* ============================================================================
   THE SITE LOG DRAWS ITSELF — one-shot draw-in for the rail sketch on routes
   that have no DrawingSet.

   On the set itself, DrawingSet scrubs every `.ws-scrub` mark by scroll
   progress: the pencil record advances as the reader advances. Standalone
   sheets (the exhibit, and any future route outside the set) have no such
   scroll narrative, and until now nothing armed those strokes at all. That was
   not merely a missing animation: layout.tsx stamps `data-draw-pending` on
   <html> before first paint on EVERY route, and globals.css hides every
   unarmed `.ws-scrub` while it stands. With no owner to arm them, the rail sat
   blank for the full three seconds of the safety guard and then popped the
   finished record into place — the exact flash the hold exists to prevent.

   So this hook is the missing owner. It arms the strokes in its first effect
   (which drops them out of the hold in the same frame, no blank rail), then
   walks a monotonic front across them in ordinal order, exactly the way
   DrawingSet's applySketch does. Same technique, same math, different clock:
   time here, scroll there.

   Contract notes:
   - Dash state is written as ATTRIBUTES, never CSS: the paths carry
     pathLength=1, and Chrome divides CSS px dash lengths by the render scale
     (the truncated-building trap DrawingSet documents).
   - Monotonic: the pencil only ever adds.
   - Reduced motion resolves to the finished record (the server-rendered
     state), never to a hidden or half-drawn one.
   - Ships the deterministic capture hook every animated loop here owes
     Playwright: window.__railSketch = { freeze, thaw, step }.
   ========================================================================= */

import { useEffect } from 'react';

/** Whole-record duration, ms. Long enough to read as a hand, short enough to
    be finished before a reader who came for the page's content looks up. */
const DURATION = 2400;

/** Marks in flight at once. DrawingSet's scroll scrub uses 1 (a hard sweep,
    correct when the reader's own scrolling sets the pace). On a fixed clock a
    single-mark front across 76 strokes gives each one ~30ms, which reads as a
    wipe rather than a pencil, so the front here is softened to four. */
const OVERLAP = 4;

/** Deceleration into rest, no overshoot — the site's motion doctrine. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function useRailSketchDraw(): void {
  useEffect(() => {
    // DrawingSet claims the log only where it has scroll distance to scrub it
    // with, and it stamps that claim from its own effect. This hook runs after
    // that effect (the rail is rendered after the page's children, and React
    // flushes child effects first), so the flag is settled by the time it is
    // read here. Unclaimed means the record is this hook's to draw: standalone
    // sheets, and pages like /contact whose scroll range is zero.
    if (document.querySelector('[data-site-log="scrubbed"]')) return;

    const strokes = Array.from(document.querySelectorAll<SVGPathElement>('.ws-scrub')).sort(
      (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
    );
    if (!strokes.length) return;

    // Arming is what releases the pre-paint hold, so it happens on every path
    // through this hook, including the reduced-motion one.
    const arm = () => strokes.forEach((el) => el.setAttribute('data-ws-armed', ''));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // The server-rendered strokes carry no dash state, so they already ARE
      // the finished record. Arm and leave.
      arm();
      return;
    }

    const paintAt = (p: number) => {
      const front = p * (strokes.length + OVERLAP);
      for (let i = 0; i < strokes.length; i++) {
        const local = Math.min(1, Math.max(0, (front - i) / OVERLAP));
        strokes[i].setAttribute('stroke-dashoffset', String(1 - local));
      }
    };

    for (const el of strokes) {
      el.setAttribute('stroke-dasharray', '1 1');
      el.setAttribute('stroke-dashoffset', '1');
    }
    arm();

    let raf = 0;
    let frozen = false;
    // Elapsed is ACCUMULATED rather than derived from a start stamp, so a
    // freeze/thaw resumes the record where it stood. Deriving it from a start
    // time would either restart the pencil or jump it forward by the length of
    // the freeze, and a capture pause must cost the drawing nothing.
    let elapsed = 0;
    let last = 0;

    const tick = (now: number) => {
      if (frozen) return;
      if (!last) last = now;
      elapsed += now - last;
      last = now;
      const p = Math.min(1, elapsed / DURATION);
      paintAt(easeOut(p));
      raf = p < 1 ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);

    const freeze = () => {
      frozen = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0; // the frozen gap is not drawing time
    };

    window.__railSketch = {
      freeze,
      thaw: () => {
        if (!frozen) return;
        frozen = false;
        if (elapsed < DURATION) raf = requestAnimationFrame(tick);
      },
      // Freezes first by design: a running frame would overwrite the stepped
      // state before a screenshot could catch it.
      step: (p: number) => {
        freeze();
        const clamped = Math.min(1, Math.max(0, p));
        elapsed = clamped * DURATION;
        paintAt(easeOut(clamped));
      },
    };

    return () => {
      if (raf) cancelAnimationFrame(raf);
      delete window.__railSketch;
    };
  }, []);
}

declare global {
  interface Window {
    __railSketch?: {
      freeze: () => void;
      thaw: () => void;
      /** Jump the record to a progress point, 0..1 — deterministic capture. */
      step: (p: number) => void;
    };
  }
}
