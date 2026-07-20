'use client';

/* ============================================================================
   PLOTTED ON THE GRID — the hero wordmark assembles under a plotter sweep.

   DRAW, at hero scale. A pen line sweeps left→right; the drafting modules that
   fall inside the letterforms snap to graphite ink behind it, so the word
   resolves cell by cell on the grid rather than fading or sliding in. The real
   <h1> stays in the DOM the whole time (layout, a11y, SEO, theme-reactive); the
   canvas is a transient overlay that crossfades to the crisp text on completion.

   Contract: graphite only, hard-edged modules + one hair pen line — no gradient,
   blur, or glow. prefers-reduced-motion (or any capability gap) → the <h1>
   simply stands, no canvas, matching the static-set path.
   ========================================================================= */

import { useLayoutEffect, useRef } from 'react';
import copy from '../sheets/copy.module.css';
import styles from './MastheadPlot.module.css';

// --- tuning ----------------------------------------------------------------
const CELL_CSS = 5; // drafting module size (css px)
const ALPHA_MIN = 64; // ink coverage threshold (0..255) for a module to exist
const DURATION = 1400; // total plot time (ms)
const SWEEP_FRAC = 0.82; // fraction of DURATION the pen takes to cross the word
const JITTER = 170; // per-module reveal lag behind the pen (ms) — the "1 by 1" life
const OFFSET_Y = 0; // vertical nudge to align master baseline to the <h1> (css px)
const FONT_TIMEOUT = 1600; // if fonts never settle, give up and show plain text

interface Module {
  dx: number; // device-px cell rect
  dy: number;
  dw: number;
  dh: number;
  reveal: number; // ms
}

export default function MastheadPlot({ text }: { text: string }) {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const h1 = h1Ref.current;
    const canvas = canvasRef.current;
    const pen = penRef.current;
    if (!h1 || !canvas || !pen) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // <h1> already visible; nothing to do

    // Hide the real text before first paint so there is no flash of the finished
    // word before the pen starts. Restored if we bail for any reason.
    h1.style.opacity = '0';

    let raf = 0;
    let cancelled = false;
    let started = false;

    const bail = () => {
      if (started) return;
      cancelled = true;
      h1.style.opacity = '';
    };
    const timeout = window.setTimeout(bail, FONT_TIMEOUT);

    const run = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* fonts API absent — proceed; worst case fillText uses the same font
           the h1 resolved to anyway */
      }
      if (cancelled) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cs = getComputedStyle(h1);
      const color = cs.color; // resolved graphite for the active theme
      const fontSize = parseFloat(cs.fontSize) || 40;
      const fontWeight = cs.fontWeight || '700';
      const family = cs.fontFamily;
      // The word bleeds past its column at narrow widths, so measure the text
      // extent, not the (possibly narrower) box.
      const wCss = Math.max(1, Math.ceil(h1.scrollWidth));
      const hCss = Math.max(1, Math.ceil(h1.clientHeight));

      // --- master: render the word crisply in the real font -----------------
      const master = document.createElement('canvas');
      master.width = Math.ceil(wCss * dpr);
      master.height = Math.ceil(hCss * dpr);
      const mctx = master.getContext('2d');
      if (!mctx) return bail();

      // font-stretch: 125% == the "expanded" keyword; drives the wdth axis so
      // the master matches the h1's expanded instance. If the platform can't set
      // it, the shapes would be the wrong width — bail to the plain word rather
      // than ship a mismatch.
      if (!('fontStretch' in mctx)) return bail();
      (mctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch =
        'expanded';
      mctx.font = `${fontWeight} ${fontSize * dpr}px ${family}`;
      mctx.textBaseline = 'alphabetic';
      mctx.fillStyle = color;
      const metrics = mctx.measureText(text);
      const ascent =
        metrics.actualBoundingBoxAscent || fontSize * dpr * 0.72;
      const baseline = ascent + OFFSET_Y * dpr;
      mctx.fillText(text, 0, baseline);

      // --- quantise ink into grid modules -----------------------------------
      let data: Uint8ClampedArray;
      try {
        data = mctx.getImageData(0, 0, master.width, master.height).data;
      } catch {
        return bail();
      }
      const cell = Math.max(2, Math.round(CELL_CSS * dpr));
      const modules: Module[] = [];
      const sweepW = master.width;
      for (let y = 0; y < master.height; y += cell) {
        for (let x = 0; x < master.width; x += cell) {
          // sample the cell centre for coverage
          const sx = Math.min(master.width - 1, x + (cell >> 1));
          const sy = Math.min(master.height - 1, y + (cell >> 1));
          const a = data[(sy * master.width + sx) * 4 + 3];
          if (a < ALPHA_MIN) continue;
          const base = (x / sweepW) * (DURATION * SWEEP_FRAC);
          modules.push({
            dx: x,
            dy: y,
            dw: Math.min(cell, master.width - x),
            dh: Math.min(cell, master.height - y),
            reveal: base + Math.random() * JITTER,
          });
        }
      }
      if (!modules.length) return bail();
      modules.sort((a, b) => a.reveal - b.reveal);

      // --- visible canvas ----------------------------------------------------
      canvas.width = master.width;
      canvas.height = master.height;
      canvas.style.width = `${wCss}px`;
      canvas.style.height = `${hCss}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return bail();
      // pen line spans the text height; colour follows the ink
      pen.style.height = `${hCss}px`;
      pen.style.color = color;
      // now that we are genuinely plotting, reveal the overlay (hidden by default)
      canvas.style.display = 'block';
      pen.style.display = 'block';

      started = true;
      window.clearTimeout(timeout);

      let start = 0;
      let idx = 0;
      const penEnd = DURATION * SWEEP_FRAC;

      // Dev-only scrub handle: freeze the plot at an arbitrary elapsed time so an
      // automated screenshot can grab a stable mid-sweep frame (the plot runs on
      // its own rAF, so gsap's freeze does not stop it). Not shipped to prod.
      if (process.env.NODE_ENV !== 'production') {
        const drawUpTo = (e: number) => {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const m of modules) {
            if (m.reveal <= e) {
              ctx.drawImage(master, m.dx, m.dy, m.dw, m.dh, m.dx, m.dy, m.dw, m.dh);
            }
          }
          const px = Math.min(1, e / penEnd) * wCss;
          pen.style.opacity = e < penEnd ? '1' : '0';
          pen.style.transform = `translateX(${px}px)`;
          canvas.style.display = 'block';
          canvas.style.opacity = '1';
          pen.style.display = 'block';
          h1.style.transition = 'none';
          h1.style.opacity = '0';
        };
        (window as unknown as { __plot?: unknown }).__plot = {
          duration: DURATION,
          modules: modules.length,
          seek: drawUpTo,
        };
      }

      const frame = (t: number) => {
        if (cancelled) return;
        if (!start) start = t;
        const e = t - start;

        // commit every module now due (incremental — canvas is never cleared)
        while (idx < modules.length && modules[idx].reveal <= e) {
          const m = modules[idx++];
          ctx.drawImage(master, m.dx, m.dy, m.dw, m.dh, m.dx, m.dy, m.dw, m.dh);
        }

        // pen rides the sweep front, then lifts
        const penX = Math.min(1, e / penEnd) * wCss;
        if (e < penEnd) {
          pen.style.opacity = '1';
          pen.style.transform = `translateX(${penX}px)`;
        } else {
          pen.style.opacity = '0';
        }

        if (idx >= modules.length) {
          // handoff: crossfade the canvas out, the crisp <h1> in
          h1.style.transition = 'opacity 0.14s linear';
          h1.style.opacity = '1';
          canvas.style.opacity = '0';
          window.setTimeout(() => {
            if (cancelled) return;
            canvas.style.display = 'none';
            pen.style.display = 'none';
          }, 160);
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    run();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (raf) cancelAnimationFrame(raf);
      // leave the h1 visible if we tear down mid-plot
      if (h1) h1.style.opacity = '';
    };
  }, [text]);

  return (
    <div className={styles.wrap}>
      <h1 ref={h1Ref} className={copy.masthead}>
        {text}
      </h1>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <span ref={penRef} className={styles.pen} aria-hidden="true" />
    </div>
  );
}
