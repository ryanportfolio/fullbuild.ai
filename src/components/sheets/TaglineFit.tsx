'use client';

import { useLayoutEffect, useRef } from 'react';
import { afterIntroHold } from '@/lib/introHold';
import copy from './copy.module.css';

/* --- the lettering pass ----------------------------------------------------
   The pen travels the measure and the type is CLIPPED to it, so the line is
   wiped in rather than faded — the masthead's instrument, not a new one. A real
   carriage return between the two lines is what makes it read as a pipeline
   being laid out rather than as typing.

   ORDER, chosen by measurement. Everything on the cover takes ONE signal —
   ws:plot-settled, fired when the wordmark finishes plotting — and runs from
   there together: this lettering pass, the masthead's screening pass, and the
   carriage's elevation. Sequencing them was tried and measured: behind the
   carriage the line landed 10s into the load, and screening behind the
   lettering still cost it another 1.7s. The cover now resolves as one movement.

     plot -> ws:plot-settled -> lettering + screening + elevation

   That is more than one instrument on the sheet at once, which the note in
   DrawingSet.tsx argues against. Deliberate: they work separate regions, and
   holding each behind the last pushed the tail past the point where anyone is
   still looking at the cover.

   The carriage return between the two lines is what makes this read as a
   pipeline being laid out rather than as typing.

   Because TaglineFit already fits line two to line one's exact measure, both
   lines are the same width, so a constant-speed pen takes the same time on each
   without any per-line tuning.
   -------------------------------------------------------------------------- */
const LINE_MS = 700; // travel time per line at constant speed
const RETURN_MS = 220; // carriage lift, return, drop
const GATE_FALLBACK = 3000; // letter anyway if the plot never signals

/**
 * Hand back the pre-paint hide. The head inline script clipped the line before
 * first paint (data-pipeline-pending on <html>) so a slow hydration never
 * flashes the finished pipeline; once this effect owns the clip — or provably
 * is not lettering — clear the script's safety timer and lift the attribute.
 * Idempotent.
 */
function clearPipelinePending() {
  const w = window as unknown as { __pipelineGuard?: number };
  if (w.__pipelineGuard) window.clearTimeout(w.__pipelineGuard);
  document.documentElement.removeAttribute('data-pipeline-pending');
}

/**
 * The cover pipeline, set as two flush lines: the machine pipeline above, the
 * human audit clause below scaled so its measure lands exactly at the end of
 * "engineering" — the same fit-to-width move FitHeading makes on S-02. CSS
 * already sizes line two at the fitted ratio (copy.module.css), so the server
 * paint lands at the final size and this pass only trims the residual; it also
 * covers a different mono (webfont still swapping, no-JS is simply the CSS
 * ratio).
 */
export default function TaglineFit() {
  const ref = useRef<HTMLParagraphElement>(null);
  const penRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const p = ref.current;
    if (!p) return;
    const [g1, g2] = Array.from(p.children).filter(
      (el) => el !== penRef.current,
    ) as HTMLElement[];

    const measure = (el: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect().width;
      range.detach();
      return w;
    };

    const fit = () => {
      g2.style.fontSize = ''; // remeasure from the CSS fallback size
      const w1 = measure(g1);
      const w2 = measure(g2);
      const base = parseFloat(getComputedStyle(g2).fontSize);
      if (!w1 || !w2 || !base) return;
      let size = base * (w1 / w2);
      g2.style.fontSize = `${size}px`;
      // Corrective pass: spacing does not scale perfectly linearly with the
      // type, so measure once more at the fitted size and trim the residual.
      const w2b = measure(g2);
      if (w2b) {
        size *= w1 / w2b;
        g2.style.fontSize = `${size}px`;
      }
    };

    fit();
    // Refit once real glyph metrics arrive, and on any measure change.
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(p);

    // ---- the lettering pass -------------------------------------------------
    const pen = penRef.current;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Reduced motion (and no-JS, which never runs any of this) keeps the fully
    // lettered line from the first frame — the same floor rule as the rest of
    // the set. Nothing below may hide anything on those paths.
    if (reduce || !pen || !g1 || !g2) {
      clearPipelinePending(); // nothing will letter — the line must stand
      return () => ro.disconnect();
    }

    const groups = [g1, g2];
    // Take the hide from the head script's CSS clip. Inline, in the same
    // pre-paint frame, and to the same value — so there is no frame in which
    // the finished line is visible, on any hydration timing.
    groups.forEach((g) => {
      g.style.clipPath = 'inset(0 100% 0 0)';
    });
    clearPipelinePending();

    let raf = 0;
    let cancelled = false;
    let onScreen = true;
    let lastT = 0;
    let line = 0; // which group the pen is on
    let travelled = 0; // ms spent travelling the current line
    let returning = 0; // ms spent in the carriage return
    let done = false;

    /** Text extent of a line, which is what the pen actually crosses. */
    const widthOf = (g: HTMLElement) => measure(g) || g.offsetWidth;

    const place = (g: HTMLElement, x: number) => {
      pen.style.left = `${g.offsetLeft + x}px`;
      pen.style.top = `${g.offsetTop}px`;
      pen.style.height = `${g.offsetHeight}px`;
    };

    const finish = () => {
      done = true;
      groups.forEach((g) => {
        g.style.clipPath = '';
      });
      pen.style.opacity = '0';
    };

    const step = (t: number) => {
      raf = 0;
      if (cancelled || done) return;
      const dt = lastT ? Math.min(64, t - lastT) : 16;
      lastT = t;

      const g = groups[line];
      const w = widthOf(g);
      const speed = w / LINE_MS; // px per ms, constant across both lines

      if (returning > 0) {
        // carriage lifted: travelling back to the left margin, drawing nothing
        returning -= dt;
        pen.style.opacity = '0';
        if (returning <= 0) {
          returning = 0;
          travelled = 0;
          place(groups[line], 0);
        }
      } else {
        travelled += dt;
        const x = Math.min(w, travelled * speed);
        // Inset from the BORDER BOX, which `width: max-content` has made equal
        // to the painted line (see copy.module.css) — so the wipe edge tracks
        // the pen for the whole measure instead of clipping the overflowing
        // tail away and popping it in at the end.
        g.style.clipPath = `inset(0 ${Math.max(0, g.offsetWidth - x)}px 0 0)`;
        place(g, x);
        pen.style.opacity = '1';

        if (x >= w) {
          g.style.clipPath = '';
          if (line === 0) {
            line = 1;
            returning = RETURN_MS;
          } else {
            finish();
            return;
          }
        }
      }

      if (onScreen) raf = requestAnimationFrame(step);
    };

    const wake = () => {
      if (!raf && !cancelled && !done && onScreen) {
        lastT = 0; // resuming: never bill time spent off screen
        raf = requestAnimationFrame(step);
      }
    };

    // Take the plot's signal, the same one the screening pass and the carriage
    // take, so the cover's three passes start together.
    let begun = false;
    let gate = 0;
    const begin = () => {
      if (begun || cancelled) return;
      begun = true;
      window.removeEventListener('ws:plot-settled', begin);
      window.clearTimeout(gate);
      place(g1, 0);
      wake();
    };
    let unhold: (() => void) | null = null;
    if ((window as unknown as { __plotSettled?: boolean }).__plotSettled) {
      begin();
    } else {
      window.addEventListener('ws:plot-settled', begin);
      // The fallback's clock starts when the intro overlay lets the page go, not
      // at mount: the plot it is waiting on is held behind the intro for several
      // seconds by design, and a fallback measured from mount would call that
      // hold a failure and letter the pipeline behind the curtain. Unheld, this
      // runs synchronously and the timer is armed exactly as before.
      unhold = afterIntroHold(() => {
        unhold = null;
        if (begun || cancelled) return;
        gate = window.setTimeout(begin, GATE_FALLBACK);
      });
    }

    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
              if (onScreen && begun) wake();
            },
            { rootMargin: '120px' },
          )
        : null;
    io?.observe(p);

    return () => {
      cancelled = true;
      unhold?.();
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(gate);
      window.removeEventListener('ws:plot-settled', begin);
      io?.disconnect();
      ro.disconnect();
      // Hand the finished lettering back, whatever state we were in.
      groups.forEach((g) => {
        g.style.clipPath = '';
      });
    };
  }, []);

  return (
    <p ref={ref} className={copy.tagline}>
      <span ref={penRef} className={copy.taglinePen} aria-hidden="true" />
      <span className={copy.taglineGroup}>
        <span className={copy.s1}>idea</span> → <span className={copy.s2}>design</span> →{' '}
        <span className={copy.s3}>engineering</span>
      </span>
      <span className={copy.taglineGroup}>
        → <span className={copy.audit}>audit</span>{' '}
        <span className={copy.loopGlyph} role="img" aria-label="verification loop, then">
          <LoopGlyph />
        </span>{' '}
        <span className={copy.s4}>shipped</span>
      </span>
    </p>
  );
}

/**
 * The audit cycle, drawn instead of typed: a 270° arc with a drafting
 * arrowhead, indexing through quarter turns like a mechanical carriage —
 * the review loop running. CSS drives the motion (copy.module.css); it
 * parks for prefers-reduced-motion.
 */
function LoopGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {/* clockwise from 12 o'clock, 270° around to 9 o'clock */}
      <path
        d="M 8 2.5 A 5.5 5.5 0 1 1 2.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {/* arrowhead at the open end, aimed along the travel (upward) */}
      <polygon points="0.7,9.2 4.3,9.2 2.5,5.4" fill="currentColor" />
    </svg>
  );
}
