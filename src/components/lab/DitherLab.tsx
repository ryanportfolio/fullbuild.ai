'use client';

/* ============================================================================
   LAB — ordered-dither wordmark study.

   The cover title rendered as a Bayer-quantised module field: the wordmark is
   drawn to an offscreen buffer, downscaled so one cell covers each pixelSize
   block, converted to luma, auto-levelled once (pinned — a still source, so
   nothing can pulse), inverted (dark subject on light ground → ink lands on
   the glyphs), floored, then quantised through an 8×8 Bayer matrix into N tone
   levels. Each cell draws as a square module or a dot whose size scales with
   its tone level.

   Pointer displaces the SAMPLING coordinates, not the drawn output — wide
   radius, eased falloff. Lean / scatter / twist; no radial ripple.

   Contract-compatible: one ink (graphite), hard-edged modules, no gradients.
   The render loop is demand-driven — at rest zero rAF frames are scheduled.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import {
  breatheAt,
  buildField,
  drawField,
  DOT_RANGE,
  GAP_RANGE,
  type Field,
  type Shape,
  type Warp,
} from '@/lib/dither';

// --- tuning ----------------------------------------------------------------
interface Params {
  pixelSize: number; // cell size, css px
  spacing: number; // fraction of cell left as gap
  dotScale: number; // module size as fraction of remaining cell
  levels: number; // tone steps incl. zero
  shape: Shape;
  warp: Warp;
  breathe: boolean; // slow ambient drift of dotScale + spacing
}

const DEFAULTS: Params = {
  pixelSize: 11,
  spacing: 0.4,
  dotScale: 0.55,
  levels: 6,
  shape: 'dot',
  warp: 'twist',
  breathe: true,
};

// Breathing sweeps dotScale and spacing across their FULL slider ranges (the
// ranges and the sine periods live in @/lib/dither, shared with the masthead).
// While breathing, the two sliders show the live value and manual input is off.
const WARP_STRENGTH = 3.2; // max sampling displacement, in cells
const TWIST_MAX = 0.6; // radians at cursor centre

export default function DitherLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null); // breathing readout, written imperatively
  const [params, setParams] = useState<Params>(DEFAULTS);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let field: Field | null = null;
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let cancelled = false;

    // Pointer state, smoothed. energy eases in on entry and out on leave so the
    // field settles and the demand loop can stop.
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let energy = 0;
    let energyTarget = 0;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ink = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--ink-graphite').trim() ||
      '#211f1c';

    /** Rebuild the source buffer: wordmark → luma grid at cell resolution. */
    const build = () => {
      const p = paramsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(cssW / p.pixelSize);
      const rows = Math.ceil(cssH / p.pixelSize);

      // Source: the wordmark drawn dark-on-light at grid resolution ×3 for
      // cleaner glyph edges, then downscaled into the cell buffer.
      const ss = 3;
      const src = document.createElement('canvas');
      src.width = cols * ss;
      src.height = rows * ss;
      const sctx = src.getContext('2d');
      if (!sctx) return;
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, src.width, src.height);
      const family =
        getComputedStyle(document.body).getPropertyValue('--font-display').trim() ||
        'system-ui, sans-serif';
      // Match the masthead voice: Archivo expanded 700, tight tracking, lowercase.
      const text = 'fullbuild.ai';
      let size = src.height * 0.5;
      sctx.font = `700 ${size}px ${family}`;
      const fsctx = sctx as CanvasRenderingContext2D & { fontStretch?: string };
      if ('fontStretch' in fsctx) fsctx.fontStretch = 'expanded';
      sctx.font = `700 ${size}px ${family}`; // reapply after fontStretch
      let w = sctx.measureText(text).width;
      size *= (src.width * 0.86) / w;
      sctx.font = `700 ${size}px ${family}`;
      if ('fontStretch' in fsctx) fsctx.fontStretch = 'expanded';
      sctx.font = `700 ${size}px ${family}`;
      w = sctx.measureText(text).width;
      sctx.fillStyle = '#000';
      sctx.textBaseline = 'middle';
      sctx.fillText(text, (src.width - w) / 2, src.height * 0.46);

      field = buildField(src, cols, rows);
    };

    const render = () => {
      if (!field) return;
      const p = paramsRef.current;

      // Ambient breathe: full-range sweep of dotScale + spacing, sine-smooth.
      let dotScale = p.dotScale;
      let gap = p.spacing;
      if (p.breathe && !reduce) {
        ({ dotScale, gap } = breatheAt(performance.now() / 1000));
        if (liveRef.current)
          liveRef.current.textContent = `breathing · dot ${dotScale.toFixed(2)} · gap ${gap.toFixed(2)}`;
      } else if (liveRef.current && liveRef.current.textContent) {
        liveRef.current.textContent = '';
      }

      drawField(ctx, field, {
        cell: p.pixelSize,
        gap,
        dotScale,
        levels: p.levels,
        shape: p.shape,
        warp: reduce ? 'none' : p.warp,
        color: ink(),
        px: cur.x / p.pixelSize,
        py: cur.y / p.pixelSize,
        energy,
        radius: Math.max(cssW, cssH) * 0.6,
        strength: WARP_STRENGTH,
        twistMax: TWIST_MAX,
        width: cssW,
        height: cssH,
      });
    };

    // Demand-driven loop: runs only while the pointer state is still moving.
    const tick = () => {
      raf = 0;
      cur.x += (target.x - cur.x) * 0.14;
      cur.y += (target.y - cur.y) * 0.14;
      energy += (energyTarget - energy) * 0.08;
      render();
      const moving =
        (paramsRef.current.breathe && !reduce) ||
        Math.abs(target.x - cur.x) > 0.5 ||
        Math.abs(target.y - cur.y) > 0.5 ||
        Math.abs(energyTarget - energy) > 0.004;
      if (moving && !cancelled) raf = requestAnimationFrame(tick);
      else if (energyTarget === 0) {
        energy = 0;
        render();
      }
    };
    const wake = () => {
      if (!raf && !cancelled) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      energyTarget = 1;
      wake();
    };
    const onLeave = () => {
      energyTarget = 0;
      wake();
    };

    const rebuild = () => {
      build();
      render();
    };

    // Fonts first — the source draws the display face.
    let ro: ResizeObserver | null = null;
    const start = () => {
      if (cancelled) return;
      rebuild();
      wake(); // breathe (if on) needs the loop from frame one
      ro = typeof ResizeObserver === 'function' ? new ResizeObserver(rebuild) : null;
      ro?.observe(canvas);
      if (!reduce) {
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerleave', onLeave);
      }
    };
    if (document.fonts?.ready) document.fonts.ready.then(start).catch(start);
    else start();

    // Params changed → rebuild (cheap; still source), re-kick the loop in case
    // breathe was just switched on.
    const onParams = () => {
      rebuild();
      wake();
    };
    window.addEventListener('lab:dither-params', onParams);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('lab:dither-params', onParams);
    };
  }, []);

  // Any param change → tell the engine to rebuild.
  useEffect(() => {
    window.dispatchEvent(new Event('lab:dither-params'));
  }, [params]);

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem' };
  const lbl: React.CSSProperties = { width: '5.2rem', flexShrink: 0 };

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--ground)',
        overflow: 'hidden',
      }}
    >
      {/* Margin Law: the field ends at the rail border, like every sheet. */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'calc(100% - var(--rail-w))',
          height: '100%',
        }}
        aria-label="fullbuild.ai wordmark rendered as an ordered-dither module field"
        role="img"
      />
      <div
        data-lab-panel
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.68rem',
          letterSpacing: '0.06em',
          color: 'var(--ink-witness)',
          background: 'var(--ground)',
          border: '1px solid var(--rule-strong)',
          padding: '0.8rem 0.9rem',
          display: 'grid',
          gap: '0.45rem',
          userSelect: 'none',
        }}
      >
        <div style={row}>
          <span style={lbl}>pixelSize {params.pixelSize}</span>
          <input
            style={{ width: '7rem' }}
            type="range"
            min={5}
            max={16}
            step={1}
            value={params.pixelSize}
            onChange={(e) => set('pixelSize', Number(e.target.value))}
          />
        </div>
        <div style={{ ...row, opacity: params.breathe ? 0.35 : 1 }}>
          <span style={lbl}>dotScale {params.dotScale.toFixed(2)}</span>
          <input
            style={{ width: '7rem' }}
            type="range"
            min={DOT_RANGE[0]}
            max={DOT_RANGE[1]}
            step={0.05}
            disabled={params.breathe}
            value={params.dotScale}
            onChange={(e) => set('dotScale', Number(e.target.value))}
          />
        </div>
        <div style={{ ...row, opacity: params.breathe ? 0.35 : 1 }}>
          <span style={lbl}>spacing {params.spacing.toFixed(2)}</span>
          <input
            style={{ width: '7rem' }}
            type="range"
            min={GAP_RANGE[0]}
            max={GAP_RANGE[1]}
            step={0.05}
            disabled={params.breathe}
            value={params.spacing}
            onChange={(e) => set('spacing', Number(e.target.value))}
          />
        </div>
        <div style={row}>
          <span style={lbl}>levels {params.levels}</span>
          <input
            style={{ width: '7rem' }}
            type="range"
            min={2}
            max={6}
            step={1}
            value={params.levels}
            onChange={(e) => set('levels', Number(e.target.value))}
          />
        </div>
        <div style={row}>
          <span style={lbl}>shape</span>
          {(['square', 'dot'] as const).map((s) => (
            <button
              key={s}
              onClick={() => set('shape', s)}
              style={{
                font: 'inherit',
                letterSpacing: 'inherit',
                padding: '0.15rem 0.5rem',
                background: params.shape === s ? 'var(--ink-graphite)' : 'transparent',
                color: params.shape === s ? 'var(--ground)' : 'inherit',
                border: '1px solid var(--rule-strong)',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={row}>
          <span style={lbl}>warp</span>
          {(['lean', 'scatter', 'twist', 'none'] as const).map((m) => (
            <button
              key={m}
              onClick={() => set('warp', m)}
              style={{
                font: 'inherit',
                letterSpacing: 'inherit',
                padding: '0.15rem 0.4rem',
                background: params.warp === m ? 'var(--ink-graphite)' : 'transparent',
                color: params.warp === m ? 'var(--ground)' : 'inherit',
                border: '1px solid var(--rule-strong)',
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div style={row}>
          <span style={lbl}>breathe</span>
          {([true, false] as const).map((b) => (
            <button
              key={String(b)}
              onClick={() => set('breathe', b)}
              style={{
                font: 'inherit',
                letterSpacing: 'inherit',
                padding: '0.15rem 0.5rem',
                background: params.breathe === b ? 'var(--ink-graphite)' : 'transparent',
                color: params.breathe === b ? 'var(--ground)' : 'inherit',
                border: '1px solid var(--rule-strong)',
                cursor: 'pointer',
              }}
            >
              {b ? 'on' : 'off'}
            </button>
          ))}
        </div>
        <span ref={liveRef} style={{ minHeight: '1em' }} />
        <div style={row}>
          <span style={lbl}>theme</span>
          <button
            onClick={() => {
              const d = document.documentElement;
              d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark';
              window.dispatchEvent(new Event('lab:dither-params'));
            }}
            style={{
              font: 'inherit',
              letterSpacing: 'inherit',
              padding: '0.15rem 0.5rem',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid var(--rule-strong)',
              cursor: 'pointer',
            }}
          >
            flip
          </button>
        </div>
      </div>
    </main>
  );
}
