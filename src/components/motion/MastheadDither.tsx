'use client';

/* ============================================================================
   THE SECOND PASS — the drafter comes back and SCREENS the standing title.

   STATE 01 already plots the wordmark left to right and hands off to the crisp
   <h1>. This is the pass after that one: the pen re-enters from the right, runs
   back across the finished title at a slower tempo, and the word screens up into
   an ordered-dither field behind it. Crisp ahead of the pen, dot field behind
   it, hard edge on the pen line itself.

   Three site conventions carry this, none of them invented here:
   - SERPENTINE RETURN. SheetElevation runs its two datums in opposite
     directions so the pen sweeps back instead of snapping across the sheet.
     The plot went left to right, so the screening pass returns right to left.
   - A SLOWER TEMPO MEANS A DIFFERENT JOB. SheetElevation's annotation pass runs
     at 0.55 against the drawing's own 0.75. This pass is ~0.57 of the plot
     sweep's pace for the same reason: a change of tempo is the cheapest honest
     way to say a second operation has started.
   - NO DISSOLVES. The word is never crossfaded out and replaced. It is
     re-screened: the <h1> and this canvas are clipped to complementary halves
     of the same pen position, so exactly one of them paints any given column.

   What the field MEANS: a dither is a reprographic screen. The plotted original
   leaves the board and gets screened for reproduction. That is why the title is
   allowed to get coarser after it is finished, and it is why the field then
   keeps breathing rather than sitting still.

   The <h1> keeps its box and its text throughout (layout, a11y, SEO, theme);
   this is an overlay that never enters flow. Reduced motion and every
   MastheadPlot bail path skip it entirely, so those visitors keep the crisp
   title — the same floor rule the rest of the set follows.

   Contract-safe: one ink (the h1's own resolved colour), hard-edged modules, a
   hard wipe edge, no gradient and no blur anywhere. The loop runs only while the
   band is on screen, and the pass itself accumulates only on-screen time, so
   scrolling away pauses it rather than letting it run out of sight.
   ========================================================================= */

import { useEffect, useRef } from 'react';
import { breatheAt, buildField, drawField, type Field } from '@/lib/dither';
import styles from './MastheadDither.module.css';

// --- tuning ----------------------------------------------------------------
// The cell is derived from the word's HEIGHT rather than fixed, so the field
// always carries the same number of rows and the wordmark resolves the same at
// every measure. A fixed 11px cell left the 430px viewport with six rows of
// dots — illegible mush, the classic coarse-grid-on-a-small-canvas failure.
// The desktop case (224px tall title) falls out of this as 11px, which is the
// value judged in the lab.
const ROWS_TARGET = 20;
const CELL_MIN = 3;
const CELL_MAX = 14;
const cellFor = (h: number) =>
  Math.max(CELL_MIN, Math.min(CELL_MAX, Math.round(h / ROWS_TARGET)));
const LEVELS = 6;
const SS = 3; // source supersample, for clean glyph edges before downscaling

// This pass goes EARLY, and deliberately so. Gating it on the carriage put it
// at ~12.4s, long after the reader has scrolled past the cover; gating it on the
// lettering pass still cost it 1.7s. It now takes the SAME signal the lettering
// pass does (ws:plot-settled) and runs alongside it: the title screens while the
// pipeline letters in, one movement rather than two in sequence.
//
// That is a deliberate departure from the note in DrawingSet.tsx — three pens
// are on the sheet at once here (elevation, lettering, screening). They work
// separate regions and the cover reads as one event; sequencing them is what
// pushed the last one past the point where anyone is still looking.
const GATE_FALLBACK = 7000; // screen anyway if the plot never signals
// No beat between the plot finishing and the screening starting: the two passes
// are meant to land as one. Raise this to give the crisp word a moment first.
const HOLD = 0; // ms of on-screen time before the pen returns
// The plot's sweep is 1148ms (DURATION 1400 * SWEEP_FRAC 0.82). This pass is
// deliberately slower — see the tempo note above.
const WIPE = 2000; // ms for the pen to cross the word right to left

// Far gentler than the lab's free-field values: this field IS the wordmark, so
// the warp has to read as the letters breathing under the cursor, never as the
// name coming apart. Measured against the lab at 1.6 cells / 0.32 rad, which
// visibly scrambled the "fu" at the left margin.
const WARP_STRENGTH = 0.9; // cells of sampling displacement at the cursor
const TWIST_MAX = 0.16; // rad at the cursor
const RADIUS_FRAC = 0.42; // warp field radius as a fraction of the canvas' long side

/** Smoothstep — the pen eases off the right edge and settles at the left. */
const smoothstep = (p: number) => p * p * (3 - 2 * p);


export default function MastheadDither({
  h1Ref,
}: {
  h1Ref: React.RefObject<HTMLHeadingElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pen = penRef.current;
    const h1 = h1Ref.current;
    if (!canvas || !pen || !h1) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let field: Field | null = null;
    let cell = CELL_MAX;
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let cancelled = false;
    let onScreen = true;

    // Pass state. Both clocks accumulate FRAME time, not wall time, so a pass
    // that scrolls out of view pauses instead of finishing unseen. `released`
    // is the relay gate: nothing advances until the plot has settled.
    let released = false;
    let held = 0;
    let wiped = 0;
    let done = false;
    let lastT = 0;

    // Ink follows the active ground; re-read only when the theme actually flips.
    let ink = getComputedStyle(h1).color;
    const themeWatch = new MutationObserver(() => {
      const el = h1Ref.current;
      if (el) {
        ink = getComputedStyle(el).color;
        pen.style.background = ink;
      }
    });
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Pointer state, smoothed. Warp energy eases in on first move and out when
    // the pointer leaves the window.
    const target = { x: -1e4, y: -1e4 };
    const cur = { x: -1e4, y: -1e4 };
    let energy = 0;
    let energyTarget = 0;

    /**
     * Render the word exactly as the <h1> paints it — same face, expanded
     * width axis, letter-spacing and line-box baseline — into a supersampled
     * black-on-white buffer, then reduce it to one luma sample per cell.
     */
    const build = (): boolean => {
      const el = h1Ref.current;
      if (!el) return false;
      const cs = getComputedStyle(el);
      cssW = Math.max(1, Math.ceil(el.scrollWidth));
      cssH = Math.max(1, Math.ceil(el.clientHeight));
      cell = cellFor(cssH);
      const cols = Math.max(1, Math.ceil(cssW / cell));
      const rows = Math.max(1, Math.ceil(cssH / cell));

      const src = document.createElement('canvas');
      src.width = cols * SS;
      src.height = rows * SS;
      const sctx = src.getContext('2d');
      if (!sctx) return false;
      // Source ground is WHITE and the subject BLACK regardless of theme: the
      // engine inverts a dark-on-light source, and the OUTPUT ink is what
      // carries the theme. Source polarity and page polarity are independent.
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, src.width, src.height);

      const k = src.width / cssW; // source px per css px
      const fontSize = (parseFloat(cs.fontSize) || 40) * k;
      sctx.font = `${cs.fontWeight || '700'} ${fontSize}px ${cs.fontFamily}`;
      // MUST come after `font`: the shorthand setter resets font-stretch, so
      // setting it first renders the master at normal width and the field comes
      // out narrower than the word it is meant to replace.
      if (!('fontStretch' in sctx)) return false;
      (sctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'expanded';
      if ('letterSpacing' in sctx) {
        const ls = parseFloat(cs.letterSpacing);
        (sctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${
          Number.isFinite(ls) ? ls * k : 0
        }px`;
      }
      sctx.textBaseline = 'alphabetic';
      sctx.fillStyle = '#000';

      const text = el.textContent || '';
      const m = sctx.measureText(text);
      // Baseline from the LINE BOX (line-height < 1 here), not the ink box, so
      // the field sits exactly where the glyphs sat.
      const lineHpx = parseFloat(cs.lineHeight);
      const lineBox = (Number.isFinite(lineHpx) ? lineHpx : cssH) * k;
      const fA = m.fontBoundingBoxAscent;
      const fD = m.fontBoundingBoxDescent;
      const baseline =
        fA && fD ? (lineBox - (fA + fD)) / 2 + fA : m.actualBoundingBoxAscent || fontSize * 0.72;
      sctx.fillText(text, 0, baseline);

      field = buildField(src, cols, rows);
      if (!field) return false;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      // The h1 hangs its optical margin outside the wrap origin — anchor to the
      // element's real box or the field lands off the word.
      canvas.style.left = `${el.offsetLeft}px`;
      canvas.style.top = `${el.offsetTop}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      pen.style.left = `${el.offsetLeft}px`;
      pen.style.top = `${el.offsetTop}px`;
      pen.style.height = `${cssH}px`;
      pen.style.background = ink;
      return true;
    };

    /**
     * Clip the <h1> and the canvas to complementary sides of the pen, so exactly
     * one of them paints any column and there is no crossfade anywhere.
     * `x` is the pen position in the shared local space (0 = left edge of the
     * word, cssW = right edge). Screened region is to the RIGHT of the pen.
     */
    const clipAt = (x: number) => {
      const el = h1Ref.current;
      if (el) {
        // keep the crisp word only to the LEFT of the pen
        const rightInset = Math.max(0, el.offsetWidth - x);
        el.style.clipPath = `inset(0px ${rightInset}px 0px 0px)`;
      }
      // keep the field only to the RIGHT of the pen
      canvas.style.clipPath = `inset(0px 0px 0px ${Math.max(0, x)}px)`;
    };

    /** The pass is over: drop the clips, hide the crisp word, lift the pen. */
    const finish = () => {
      done = true;
      const el = h1Ref.current;
      if (el) {
        el.style.clipPath = '';
        el.style.opacity = '0';
      }
      canvas.style.clipPath = '';
      pen.style.opacity = '0';
    };

    const render = () => {
      if (!field) return;
      const { dotScale, gap } = breatheAt(performance.now() / 1000);
      drawField(ctx, field, {
        cell,
        gap,
        dotScale,
        levels: LEVELS,
        shape: 'dot',
        warp: 'twist',
        color: ink,
        px: cur.x / cell,
        py: cur.y / cell,
        energy,
        radius: Math.max(cssW, cssH) * RADIUS_FRAC,
        strength: WARP_STRENGTH,
        twistMax: TWIST_MAX,
        width: cssW,
        height: cssH,
      });
    };

    const tick = (t: number) => {
      raf = 0;
      if (cancelled) return;

      // Frame delta, clamped so a backgrounded tab cannot jump the pass.
      const dt = lastT ? Math.min(64, t - lastT) : 16;
      lastT = t;

      cur.x += (target.x - cur.x) * 0.14;
      cur.y += (target.y - cur.y) * 0.14;
      energy += (energyTarget - energy) * 0.08;

      if (!done && released) {
        if (held < HOLD) {
          held += dt;
        } else {
          wiped += dt;
          const p = Math.min(1, wiped / WIPE);
          const x = cssW * (1 - smoothstep(p));
          clipAt(x);
          pen.style.transform = `translateX(${x}px)`;
          pen.style.opacity = '1';
          if (p >= 1) finish();
        }
      }

      render();
      if (onScreen) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && !cancelled && onScreen) {
        lastT = 0; // resuming: do not bill the time spent off screen
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      if (cur.x < -1e3) {
        cur.x = target.x; // first sighting: no sweep in from off-screen
        cur.y = target.y;
      }
      energyTarget = 1;
    };
    const onLeave = () => {
      energyTarget = 0;
    };

    // The band scrolls away — stop rendering, and stop the pass advancing,
    // rather than breathe into an empty compositor.
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
              if (onScreen) wake();
            },
            { rootMargin: '120px' }
          )
        : null;

    if (!build()) return;
    // Fully clipped away before the first paint, so the field never flashes over
    // the standing title while the hold runs.
    clipAt(cssW);
    render();
    canvas.style.opacity = '1';
    wake();
    io?.observe(canvas);

    const ro =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            if (cancelled) return;
            if (!build()) return;
            // Re-apply the clip at the pass's current position, or restore the
            // finished state, so a resize mid-pass cannot un-screen the word.
            if (done) {
              canvas.style.clipPath = '';
            } else {
              clipAt(held < HOLD ? cssW : cssW * (1 - smoothstep(Math.min(1, wiped / WIPE))));
            }
            render();
          })
        : null;
    if (ro && h1Ref.current) ro.observe(h1Ref.current);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    // Take the plot's own signal, the same one the lettering pass takes, so the
    // two start together. Latched on window like every other signal in the set.
    let gate = 0;
    const release = () => {
      if (released || cancelled) return;
      released = true;
      window.removeEventListener('ws:plot-settled', release);
      window.clearTimeout(gate);
      wake();
    };
    if ((window as unknown as { __plotSettled?: boolean }).__plotSettled) {
      release();
    } else {
      window.addEventListener('ws:plot-settled', release);
      gate = window.setTimeout(release, GATE_FALLBACK);
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(gate);
      window.removeEventListener('ws:plot-settled', release);
      io?.disconnect();
      ro?.disconnect();
      themeWatch.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      // Hand the crisp word back on teardown, whatever state we were in.
      const el = h1Ref.current;
      if (el) {
        el.style.clipPath = '';
        el.style.opacity = '';
      }
    };
  }, [h1Ref]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />
      <span ref={penRef} className={styles.pen} aria-hidden="true" />
    </>
  );
}
