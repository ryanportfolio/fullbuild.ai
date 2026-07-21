'use client';

/* ============================================================================
   MARGIN STUDY — a drafter's margin exercise under the Materials Legend.

   Openly decorative furniture: unlike everything else on the cover it derives
   from NO data, so it is labeled as what it is ("MARGIN STUDY" / "PLOTTER
   EXERCISE · NTS") and borrows the exact stroke idiom of the cover Elevation
   (baseline, grade hatch, gable rafters, apex witness + registration) — the
   same hand practicing a joint detail in the margin, forever.

   The loop: a tiny local nib plots the study stroke by stroke, holds it for
   reading, un-plots it in reverse like a lifted pencil, then redraws at the
   next roof pitch from a fixed deterministic list. No randomness: SSR markup,
   cycle 0, and every replay agree exactly.

   Contracts honored here:
   - Graphite only; no fake data, no invented numbers.
   - Every frame rides gsap.ticker (one timeline + one delayedCall), so the
     dev-only window.__capture.freeze() halts it for screenshots with no extra
     code. Offscreen (IntersectionObserver) and hidden-tab states pause it.
   - Dash values are SVG ATTRIBUTES, never CSS — GSAP's CSSPlugin serializes
     to px and Chrome mis-scales px dashes against pathLength=1 (pitfalls.md).
   - Strokes are classed `ms-stroke`, NEVER `ws-draw`: DrawingSet's crewed
     STATE 01 timeline claims every .ws-draw in the section, and adopting
     these would drag the site pen into the figure and clobber the dash attrs.
   - One instrument, one hand: nothing runs until ws:cover-drawn — the
     carriage's own completion signal for the crewed cover — plus a short
     breath. The moving instrument is a nib INSIDE the viewBox, an order of
     magnitude smaller than the DOM PenCarriage; penBus is never touched.
   - prefers-reduced-motion / SSR / no-JS: the finished cycle-0 study simply
     stands — no dash attrs are authored in markup, so it paints complete.
   ========================================================================= */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import styles from './MarginStudy.module.css';

// --- deterministic geometry (viewBox units) --------------------------------
// viewBox matches MaterialLegend's W=384 so the two figures column-align at
// the copy column's 42ch. The joint sits on a 144-unit baseline (120→264)
// with a 72-unit half-span; apexY follows the pitch.
const BASE_Y = 88;
const BASE_X0 = 120;
const BASE_X1 = 264;
const APEX_X = 192;
const HALF_SPAN = 72;
// Fixed pitch list, cycled in order — the only variation source. 18° is
// cycle 0 and therefore the SSR / reduced-motion frame.
const PITCHES = [18, 24, 30, 36, 27] as const;
const HATCH_XS = [138, 172, 206, 240] as const;

const apexAt = (deg: number): number =>
  +(BASE_Y - HALF_SPAN * Math.tan((deg * Math.PI) / 180)).toFixed(2);

// Pitch-dependent geometry, rewritten between cycles (strokes 6-9).
const leftRafterD = (apexY: number) => `M${BASE_X0} ${BASE_Y} L${APEX_X} ${apexY}`;
// Right rafter starts AT the apex (where the left rafter just ended) so the
// nib sweeps back down instead of snapping across to the far baseline end.
const rightRafterD = (apexY: number) => `M${APEX_X} ${apexY} L${BASE_X1} ${BASE_Y}`;
const witnessD = (apexY: number) => `M${APEX_X} ${apexY - 12} L${APEX_X} ${apexY - 4}`;

// --- timeline beats (seconds) ----------------------------------------------
const RETRACT_AT = 0; // strokes lift in reverse plot order
const RETRACT_DUR = 0.3;
const RETRACT_STAGGER = 0.06;
const REST_AT = 0.9; // blank beat; geometry rewrites for the next pitch
const DRAW_AT = 1.7; // strokes re-plot in order
const STROKE_DUR = 0.5;
const HOLD_END = 9.2; // finished study rests until the cycle repeats
const NIB_FADE = 0.2;
const ARM_DELAY = 1.5; // seconds of breath after ws:cover-drawn before the first retract
// Generous fallback: a torn-down cover (or one that never completes) must
// still let the vignette live. The wordmark plot settles by ~2.4s worst case
// and the crewed elevation draws in ~4s, so 12s clears the whole opening
// performance with margin before the fallback fires.
const COVER_FALLBACK_MS = 12000;

const STATIC_APEX = apexAt(PITCHES[0]);

export default function MarginStudy({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nibRef = useRef<SVGGElement>(null);

  useEffect(() => {
    // First act, before touching any attribute or timer: reduced motion gets
    // the identical static finished drawing — no gsap, no observers, nothing.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const svg = svgRef.current;
    const nib = nibRef.current;
    if (!svg || !nib) return;

    // Plot order = document order (the JSX is authored in plot order).
    const strokes = Array.from(svg.querySelectorAll<SVGGeometryElement>('.ms-stroke'));
    if (strokes.length === 0) return;
    // Strokes 6-9 (indices 5-8): rafters, witness tick, registration circle —
    // the pitch-dependent geometry rewritten between cycles.
    const [rafterL, rafterR, witness, ring] = strokes.slice(5, 9);

    // getPointAtLength needs REAL user-unit lengths (pathLength=1 only
    // normalizes dashes); cache them and refresh after every d rewrite so the
    // nib never pays a getTotalLength per frame.
    const lengths = new Map<SVGGeometryElement, number>();
    const cacheLength = (el: SVGGeometryElement) => lengths.set(el, el.getTotalLength());
    strokes.forEach(cacheLength);

    let cycle = 0; // index into PITCHES; SSR markup already shows cycle 0
    let tl: gsap.core.Timeline | null = null;
    let io: IntersectionObserver | null = null;
    let armed: gsap.core.Tween | null = null;
    let fallbackId = 0;

    // Between retract and redraw: swap in the next pitch, then defensively
    // re-assert the dash normalization and re-cache lengths — a UA could drop
    // either on a d/cy rewrite, mis-drawing the stroke or misplacing the nib.
    const advanceGeometry = () => {
      cycle = (cycle + 1) % PITCHES.length;
      const apexY = apexAt(PITCHES[cycle]);
      rafterL.setAttribute('d', leftRafterD(apexY));
      rafterR.setAttribute('d', rightRafterD(apexY));
      witness.setAttribute('d', witnessD(apexY));
      ring.setAttribute('cy', String(apexY));
      [rafterL, rafterR, witness, ring].forEach((el) => {
        el.setAttribute('stroke-dasharray', '1 1');
        cacheLength(el);
      });
    };

    // The nib rides the currently drawing stroke's tip, in LOCAL viewBox
    // coordinates — no getScreenCTM, no DOM coupling.
    const rideNib = (el: SVGGeometryElement, p: number) => {
      const len = lengths.get(el) ?? 0;
      const pt = el.getPointAtLength(Math.max(0, Math.min(1, p)) * len);
      nib.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
    };

    const start = () => {
      // Dash attrs arrive only now, offset 0 first — the standing SSR frame
      // never blanks; the loop's opening act is the RETRACT of that frame.
      gsap.set(strokes, { attr: { 'stroke-dasharray': '1 1', 'stroke-dashoffset': 0 } });

      tl = gsap.timeline({ repeat: -1, paused: true });

      // RETRACT — reverse plot order, the pencil lifting its own marks.
      strokes.forEach((el, i) => {
        const k = strokes.length - 1 - i; // reverse order position
        tl!.to(
          el,
          { attr: { 'stroke-dashoffset': 1 }, duration: RETRACT_DUR, ease: 'power1.in' },
          RETRACT_AT + k * RETRACT_STAGGER,
        );
      });

      // REST — blank beat while the joint moves to its next pitch.
      tl.call(advanceGeometry, undefined, REST_AT);

      // DRAW — the 9 strokes sequentially, nib on the tip throughout.
      tl.to(nib, { attr: { opacity: 1 }, duration: NIB_FADE }, DRAW_AT);
      strokes.forEach((el, i) => {
        tl!.to(
          el,
          {
            attr: { 'stroke-dashoffset': 0 },
            duration: STROKE_DUR,
            ease: 'power2.out',
            onUpdate() {
              rideNib(el, this.progress());
            },
          },
          DRAW_AT + i * STROKE_DUR,
        );
      });
      tl.to(nib, { attr: { opacity: 0 }, duration: NIB_FADE }, DRAW_AT + strokes.length * STROKE_DUR);

      // HOLD — an empty tween pads the cycle so the finished study rests.
      tl.to({}, { duration: 0.01 }, HOLD_END - 0.01);

      // Power discipline: pause offscreen and on hidden tab. Two independent
      // gates feed one sync so overlapping resume events can never double-play.
      let inView = true;
      const sync = () => {
        const run = inView && !document.hidden;
        if (run && tl!.paused()) tl!.play();
        else if (!run && !tl!.paused()) tl!.pause();
      };
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            inView = e.isIntersecting;
          });
          sync();
        },
        { threshold: 0 },
      );
      io.observe(svg);
      document.addEventListener('visibilitychange', sync);
      cleanupVisibility = () => document.removeEventListener('visibilitychange', sync);

      // sync, not an unconditional play: if the tab went hidden during the
      // arm window the loop must stay paused until visibility returns (the
      // observers can't deliver while hidden, so check document.hidden now).
      sync();
    };
    let cleanupVisibility: (() => void) | null = null;

    // Start gate: ws:cover-drawn — the carriage's real completion signal for
    // the crewed cover (latch first, DrawingSet's pattern) — then a short
    // breath. The delayedCall lives on the ticker so __capture.freeze()
    // halts the countdown too.
    let gated = false;
    const arm = () => {
      if (gated) return;
      gated = true;
      window.removeEventListener('ws:cover-drawn', arm);
      window.clearTimeout(fallbackId);
      armed = gsap.delayedCall(ARM_DELAY, start);
    };
    if ((window as unknown as { __coverDrawn?: boolean }).__coverDrawn) {
      arm();
    } else {
      window.addEventListener('ws:cover-drawn', arm);
      fallbackId = window.setTimeout(arm, COVER_FALLBACK_MS);
    }

    return () => {
      gated = true;
      window.removeEventListener('ws:cover-drawn', arm);
      window.clearTimeout(fallbackId);
      armed?.kill();
      tl?.kill();
      io?.disconnect();
      cleanupVisibility?.();
      // Return the strokes to their authored (fully drawn, dash-free) state.
      strokes.forEach((el) => {
        el.removeAttribute('stroke-dasharray');
        el.removeAttribute('stroke-dashoffset');
      });
    };
  }, []);

  // Shared stroke props. `ms-stroke` (never ws-draw) keeps these out of the
  // crewed cover timeline's querySelectorAll('.ws-draw') claim.
  const stroke = {
    className: 'ms-stroke',
    stroke: 'var(--ink-graphite)',
    strokeLinecap: 'butt' as const,
    pathLength: 1,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  };

  return (
    <figure className={`${styles.wrap}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg ref={svgRef} viewBox="0 0 384 120" className={styles.svg}>
        {/* Static lettering — server-rendered, never animated. The labels ARE
            the honesty device: this figure is furniture, and says so. */}
        <text x={4} y={12} className={styles.title}>
          MARGIN STUDY
        </text>
        <text x={4} y={117} className={styles.foot}>
          PLOTTER EXERCISE · NTS
        </text>

        {/* The study, authored fully drawn at cycle 0 (18°), in plot order:
            baseline, four grade-hatch ticks (the Elevation's exact idiom),
            rafters, apex witness tick, apex registration circle. */}
        <line {...stroke} x1={BASE_X0} y1={BASE_Y} x2={BASE_X1} y2={BASE_Y} strokeWidth={1.2} />
        {HATCH_XS.map((x) => (
          <path key={x} {...stroke} d={`M${x} ${BASE_Y} l-8 10`} strokeWidth={0.6} />
        ))}
        <path {...stroke} d={leftRafterD(STATIC_APEX)} strokeWidth={1} />
        <path {...stroke} d={rightRafterD(STATIC_APEX)} strokeWidth={1} />
        <path {...stroke} d={witnessD(STATIC_APEX)} strokeWidth={0.7} />
        <circle {...stroke} cx={APEX_X} cy={STATIC_APEX} r={5} strokeWidth={0.8} />

        {/* The study's own instrument: a tiny graphite nib (dot + 45° lead),
            parked invisible; the timeline rides it along the drawing stroke. */}
        <g ref={nibRef} opacity={0}>
          <circle cx={0} cy={0} r={1.4} fill="var(--ink-graphite)" />
          <line x1={0} y1={0} x2={4.2} y2={-4.2} stroke="var(--ink-graphite)" strokeWidth={0.7} />
        </g>
      </svg>
    </figure>
  );
}
