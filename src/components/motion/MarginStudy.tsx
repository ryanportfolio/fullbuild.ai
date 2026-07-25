'use client';

/* ============================================================================
   MARGIN STUDY — a drafter's margin exercise under the Materials Legend.

   Openly decorative furniture: unlike everything else on the cover it derives
   from NO data, so it is labeled as what it is ("PLOTTER EXERCISE · NTS")
   and borrows the exact stroke idiom of the cover Elevation
   (baseline, grade hatch, gable rafters, apex witness + registration) — the
   same hand practicing a joint detail in the margin, forever.

   THE LOOP is a five-cycle super-loop, not one cycle repeated. Four SHORT
   cycles lift only the ATTEMPT (rafters, witness, ring, pitch arc) and leave
   the SHEET (baseline + grade hatch) standing, because a drafter re-trying
   five roof pitches does not redraw the ground line five times. The fifth is
   LONG: it lifts all ten strokes, wipes the accumulated ghosts, and replots
   the whole study from the baseline up. That is what gives the figure a
   period of five cycles instead of one.

   Every lifted attempt leaves a faint GHOST behind, up to three deep, so the
   figure accumulates a fan of past pitches the way a real study sheet does,
   and the long cycle's wipe reads as a fresh sheet.

   Between strokes the nib TRAVELS: it moves from the mark it just finished to
   the start of the next one with the pen lifted (dimmed), instead of cutting
   there instantly. That is the difference between an SVG animation and a
   machine drawing.

   No randomness: SSR markup, cycle 0, and every replay agree exactly.

   Contracts honored here:
   - Graphite only; no fake data, no invented numbers. The pitch arc carries no
     figure for the same reason nothing else here does.
   - Every frame rides gsap.ticker (one timeline + one delayedCall), so the
     dev-only window.__capture.freeze() halts it for screenshots with no extra
     code. Offscreen (IntersectionObserver) and hidden-tab states pause it.
   - Dash values are SVG ATTRIBUTES, never CSS — GSAP's CSSPlugin serializes
     to px and Chrome mis-scales px dashes against pathLength=1 (pitfalls.md).
   - Strokes are classed `ms-stroke`, NEVER `ws-draw`: DrawingSet's crewed
     STATE 01 timeline claims every .ws-draw in the section, and adopting
     these would drag the site pen into the figure and clobber the dash attrs.
     Ghosts are `ms-ghost` so the retract/draw staggers never claim them.
   - One instrument, one hand: nothing runs until ws:cover-drawn — the
     carriage's own completion signal for the crewed cover — plus a short
     breath. The moving instrument is a nib INSIDE the viewBox, an order of
     magnitude smaller than the DOM PenCarriage; penBus is never touched.
   - prefers-reduced-motion / SSR / no-JS: the finished cycle-0 study simply
     stands — no dash attrs are authored in markup, so it paints complete, and
     the ghosts are authored at opacity 0.
   ========================================================================= */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import styles from './MarginStudy.module.css';

// --- deterministic geometry (viewBox units) --------------------------------
// viewBox WIDTH matches MaterialLegend's W=384 so the two figures column-align
// at the copy column's 42ch, and so the mono lettering keeps the legend's exact
// register (font sizes are viewBox units; changing the width would rescale
// them). The joint spans the full measure, 24→360, on a 168-unit half-span;
// apexY follows the pitch. The box is deep enough for the STEEPEST pitch on the
// list plus the apex furniture — shallower cycles leave air above, which is
// what a pitch study looks like.
// The study is a whole BENT, not a bare gable: columns off the ground line up
// to the eave, then the roof. That is the structure frame.ts generates and the
// cover Elevation draws once per project, so the margin is practicing the set's
// own vocabulary — and the column height, being constant, holds the drawing
// down the sheet at every pitch instead of only the steep ones.
const VB_H = 400;
const GROUND_Y = 350;
const EAVE_Y = 190;
const BASE_X0 = 24;
const BASE_X1 = 360;
const APEX_X = 192;
const HALF_SPAN = 168;
// Fixed pitch list, cycled in order — the only variation source. 18° is
// cycle 0 and therefore the SSR / reduced-motion frame.
const PITCHES = [18, 24, 30, 36, 27] as const;
const HATCH_XS = [66, 118, 170, 222, 274, 326] as const;

const apexAt = (deg: number): number =>
  +(EAVE_Y - HALF_SPAN * Math.tan((deg * Math.PI) / 180)).toFixed(2);

// Pitch-dependent geometry, rewritten between cycles (the ATTEMPT strokes).
const leftRafterD = (apexY: number) => `M${BASE_X0} ${EAVE_Y} L${APEX_X} ${apexY}`;
// Right rafter starts AT the apex (where the left rafter just ended) so the
// nib sweeps back down instead of snapping across to the far eave.
const rightRafterD = (apexY: number) => `M${APEX_X} ${apexY} L${BASE_X1} ${EAVE_Y}`;
const witnessD = (apexY: number) => `M${APEX_X} ${apexY - 28} L${APEX_X} ${apexY - 9}`;

// The pitch arc: a protractor check swung off the left eave, from the springing
// line up to the rafter. It is the one mark whose SHAPE changes with the pitch,
// so it makes the subject of the exercise legible instead of merely implied.
// The springing line is the hairline horizontal datum drawn with the frame —
// pitch is measured against the horizontal, and with the ground line now 160
// units below the eave there has to be one up here to measure against.
const SPRING_X1 = 124;
//
// Bare arc, no terminal tick: a tick would have to run radially to read as one,
// and the radius through the arc's end IS the rafter, so it landed invisibly on
// top of it. The arc alone is the standard angular mark and needs no help.
// R is set for legibility, not geometry — the sweep is fixed by the pitch, so
// arc LENGTH is the only handle on how readable a shallow 18° mark is.
//
// Sweep flag 0 = anticlockwise on screen.
const ARC_R = 75;
const pitchArcD = (deg: number): string => {
  const a = (deg * Math.PI) / 180;
  const f = (v: number) => +v.toFixed(2);
  const ex = f(BASE_X0 + ARC_R * Math.cos(a));
  const ey = f(EAVE_Y - ARC_R * Math.sin(a));
  return `M${BASE_X0 + ARC_R} ${EAVE_Y} A${ARC_R} ${ARC_R} 0 0 0 ${ex} ${ey}`;
};

// --- loop structure ---------------------------------------------------------
// The LAST strokes in plot order are the attempt (rafters, witness, ring, arc);
// everything before them is the standing frame. Counted from the end, so adding
// a mark to the frame can never silently split the sets wrongly.
const ATTEMPT_COUNT = 5;
const GHOST_OPACITY = [0.24, 0.14, 0.08] as const; // newest attempt first
const GHOST_KEEP = GHOST_OPACITY.length;

// --- timeline beats (seconds) ----------------------------------------------
const RETRACT_DUR = 0.3; // strokes lift in reverse plot order
const RETRACT_STAGGER = 0.06;
const GHOST_FADE = 0.5; // long cycle only: the accumulated fan wipes
const REST = 0.35; // blank beat; geometry rewrites for the next pitch
const STROKE_DUR = 0.42;
const TRAVEL_DUR = 0.18; // pen-up move between consecutive strokes
const TRAVEL_OP = 0.35; // nib dims while the pen is off the sheet
const NIB_FADE = 0.2;
const HOLD_SHORT = 1.35; // the finished study rests before the next try
const HOLD_LONG = 1.5;
const ARM_DELAY = 1.5; // seconds of breath after ws:cover-drawn before the first retract
// Generous fallback: a torn-down cover (or one that never completes) must
// still let the vignette live. The wordmark plot settles by ~2.4s worst case
// and the crewed elevation draws in ~4s, so 12s clears the whole opening
// performance with margin before the fallback fires.
const COVER_FALLBACK_MS = 12000;

const STATIC_APEX = apexAt(PITCHES[0]);

type Pt = { x: number; y: number };

export default function MarginStudy({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nibRef = useRef<SVGGElement>(null);
  const ghostRef = useRef<SVGGElement>(null);

  useEffect(() => {
    // First act, before touching any attribute or timer: reduced motion gets
    // the identical static finished drawing — no gsap, no observers, nothing.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const svg = svgRef.current;
    const nib = nibRef.current;
    const ghostGroup = ghostRef.current;
    if (!svg || !nib || !ghostGroup) return;

    // Plot order = document order (the JSX is authored in plot order).
    const strokes = Array.from(svg.querySelectorAll<SVGGeometryElement>('.ms-stroke'));
    if (strokes.length <= ATTEMPT_COUNT) return;
    const attempt = strokes.slice(strokes.length - ATTEMPT_COUNT);
    // The pitch-dependent geometry, rewritten between cycles.
    const [rafterL, rafterR, witness, ring, arc] = attempt;
    const ghostPairs = Array.from(ghostGroup.children) as SVGGElement[];

    // getPointAtLength needs REAL user-unit lengths (pathLength=1 only
    // normalizes dashes); cache them and refresh after every d rewrite so the
    // nib never pays a getTotalLength per frame. Endpoints are cached from the
    // same measurement so the travel moves cost nothing per frame either.
    const lengths = new Map<SVGGeometryElement, number>();
    const starts = new Map<SVGGeometryElement, Pt>();
    const ends = new Map<SVGGeometryElement, Pt>();
    const cachePoints = (el: SVGGeometryElement) => {
      const len = el.getTotalLength();
      lengths.set(el, len);
      const a = el.getPointAtLength(0);
      const b = el.getPointAtLength(len);
      starts.set(el, { x: a.x, y: a.y });
      ends.set(el, { x: b.x, y: b.y });
    };
    strokes.forEach(cachePoints);

    let cycle = 0; // index into PITCHES; SSR markup already shows cycle 0
    let tl: gsap.core.Timeline | null = null;
    let io: IntersectionObserver | null = null;
    let armed: gsap.core.Tween | null = null;
    let fallbackId = 0;

    // --- ghosts -------------------------------------------------------------
    // Apex heights of the most recent attempts, newest first. Painted straight
    // from that list, so the fan is a pure function of loop position.
    const ghostApex: number[] = [];
    const paintGhosts = () => {
      ghostPairs.forEach((pair, i) => {
        const apexY = ghostApex[i];
        if (apexY === undefined) {
          pair.setAttribute('opacity', '0');
          return;
        }
        pair.children[0].setAttribute('d', leftRafterD(apexY));
        pair.children[1].setAttribute('d', rightRafterD(apexY));
        pair.setAttribute('opacity', String(GHOST_OPACITY[i]));
      });
    };
    // Fired as the attempt starts to lift, so the mark being erased leaves its
    // own trace behind rather than a ghost popping in during the blank beat.
    const pushGhost = () => {
      ghostApex.unshift(apexAt(PITCHES[cycle]));
      ghostApex.length = Math.min(ghostApex.length, GHOST_KEEP);
      paintGhosts();
    };
    const clearGhosts = () => {
      ghostApex.length = 0;
      paintGhosts();
      ghostGroup.setAttribute('opacity', '1');
    };

    // Between retract and redraw: swap in the next pitch, then defensively
    // re-assert the dash normalization and re-cache points — a UA could drop
    // either on a d/cy rewrite, mis-drawing the stroke or misplacing the nib.
    const advanceGeometry = () => {
      cycle = (cycle + 1) % PITCHES.length;
      const apexY = apexAt(PITCHES[cycle]);
      rafterL.setAttribute('d', leftRafterD(apexY));
      rafterR.setAttribute('d', rightRafterD(apexY));
      witness.setAttribute('d', witnessD(apexY));
      ring.setAttribute('cy', String(apexY));
      arc.setAttribute('d', pitchArcD(PITCHES[cycle]));
      attempt.forEach((el) => {
        el.setAttribute('stroke-dasharray', '1 1');
        cachePoints(el);
      });
    };

    // --- the nib ------------------------------------------------------------
    const place = (x: number, y: number) => nib.setAttribute('transform', `translate(${x} ${y})`);
    // The nib rides the currently drawing stroke's tip, in LOCAL viewBox
    // coordinates — no getScreenCTM, no DOM coupling.
    const rideNib = (el: SVGGeometryElement, p: number) => {
      const len = lengths.get(el) ?? 0;
      const pt = el.getPointAtLength(Math.max(0, Math.min(1, p)) * len);
      place(pt.x, pt.y);
    };
    const parkNib = (el: SVGGeometryElement) => {
      const p = starts.get(el);
      if (p) place(p.x, p.y);
    };
    // Pen-up travel proxy: fromTo so it replays identically on every repeat.
    const carriage = { t: 0 };

    const start = () => {
      // Dash attrs arrive only now, offset 0 first — the standing SSR frame
      // never blanks; the loop's opening act is the RETRACT of that frame.
      gsap.set(strokes, { attr: { 'stroke-dasharray': '1 1', 'stroke-dashoffset': 0 } });

      tl = gsap.timeline({ repeat: -1, paused: true });

      /**
       * One cycle: lift `set`, advance the pitch, replot `set` with the nib
       * travelling between marks. `long` also wipes the ghost fan. Returns the
       * timeline position the next cycle should start at.
       */
      const addCycle = (at: number, set: SVGGeometryElement[], long: boolean): number => {
        let t = at;

        // RETRACT — reverse plot order, the pencil lifting its own marks.
        tl!.call(pushGhost, undefined, t);
        set.forEach((el, i) => {
          const k = set.length - 1 - i; // reverse order position
          tl!.to(
            el,
            { attr: { 'stroke-dashoffset': 1 }, duration: RETRACT_DUR, ease: 'power1.in' },
            t + k * RETRACT_STAGGER,
          );
        });
        t += (set.length - 1) * RETRACT_STAGGER + RETRACT_DUR;

        // WIPE — only on the long cycle: the accumulated fan goes, and the
        // next act starts from a sheet with nothing on it at all.
        if (long) {
          tl!.to(ghostGroup, { attr: { opacity: 0 }, duration: GHOST_FADE, ease: 'none' }, t);
          tl!.call(clearGhosts, undefined, t + GHOST_FADE);
          t += GHOST_FADE;
        }

        // REST — blank beat while the joint moves to its next pitch.
        t += REST;
        tl!.call(advanceGeometry, undefined, t);

        // DRAW — sequential strokes, nib on the tip, pen-up moves between.
        tl!.call(() => parkNib(set[0]), undefined, t);
        tl!.to(nib, { attr: { opacity: 1 }, duration: NIB_FADE }, t);
        set.forEach((el, i) => {
          if (i > 0) {
            const from = set[i - 1];
            tl!.fromTo(
              carriage,
              { t: 0 },
              {
                t: 1,
                duration: TRAVEL_DUR,
                ease: 'sine.inOut',
                // Without this, fromTo renders its start state at BUILD time,
                // firing onStart and lighting the nib during the opening hold.
                immediateRender: false,
                onStart() {
                  nib.setAttribute('opacity', String(TRAVEL_OP));
                },
                onUpdate() {
                  const a = ends.get(from);
                  const b = starts.get(el);
                  if (!a || !b) return;
                  place(a.x + (b.x - a.x) * carriage.t, a.y + (b.y - a.y) * carriage.t);
                },
                onComplete() {
                  nib.setAttribute('opacity', '1');
                },
              },
              t,
            );
            t += TRAVEL_DUR;
          }
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
            t,
          );
          t += STROKE_DUR;
        });

        // HOLD — the nib leaves and the finished study rests for reading.
        tl!.to(nib, { attr: { opacity: 0 }, duration: NIB_FADE }, t);
        return t + NIB_FADE + (long ? HOLD_LONG : HOLD_SHORT);
      };

      // The super-loop: one cycle per pitch, and the one that lands back on
      // PITCHES[0] rebuilds the whole sheet. Because it ends where it began
      // (pitch 0, every stroke drawn, no ghosts), repeat: -1 seams cleanly.
      let t = 0;
      for (let k = 0; k < PITCHES.length; k++) {
        const long = (k + 1) % PITCHES.length === 0;
        t = addCycle(t, long ? strokes : attempt, long);
      }
      // Pad the timeline out to the computed end so the last hold is real.
      tl.to({}, { duration: 0.01 }, t - 0.01);

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
      // Return the strokes to their authored (fully drawn, dash-free) state,
      // and the ghosts to the hidden state the markup ships them in.
      strokes.forEach((el) => {
        el.removeAttribute('stroke-dasharray');
        el.removeAttribute('stroke-dashoffset');
      });
      ghostGroup.setAttribute('opacity', '1');
      ghostPairs.forEach((pair) => pair.setAttribute('opacity', '0'));
      nib.setAttribute('opacity', '0');
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
  // Ghosts are never dashed and never staggered, so no pathLength and a class
  // the timeline's `.ms-stroke` query cannot reach.
  const ghost = {
    className: 'ms-ghost',
    stroke: 'var(--ink-graphite)',
    strokeLinecap: 'butt' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeWidth: 1.3,
    fill: 'none',
  };

  return (
    <figure className={`${styles.wrap}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg ref={svgRef} viewBox={`0 0 384 ${VB_H}`} className={styles.svg}>
        {/* Static lettering — server-rendered, never animated. The foot label
            IS the honesty device: this figure is furniture, and says so. Its
            size is a viewBox unit and the width is unchanged, so it holds the
            legend's register while the drawing above it grew. */}
        <text x={4} y={VB_H - 3} className={styles.foot}>
          PLOTTER EXERCISE · NTS
        </text>

        {/* The fan of past attempts, under everything and shipped invisible so
            the SSR / no-JS / reduced-motion frame is one clean study. */}
        <g ref={ghostRef} opacity={1}>
          {GHOST_OPACITY.map((_, i) => (
            <g key={i} opacity={0}>
              <path {...ghost} d={leftRafterD(STATIC_APEX)} />
              <path {...ghost} d={rightRafterD(STATIC_APEX)} />
            </g>
          ))}
        </g>

        {/* The study, authored fully drawn at cycle 0 (18°), in plot order.
            First the FRAME: ground line and grade hatch (the Elevation's exact
            idiom), the two columns, and the springing line the pitch is
            measured against. All of it stands between tries.

            The columns run right then left so the pen finishes at the left eave,
            where the springing line and then the first rafter begin. */}
        <line {...stroke} x1={BASE_X0} y1={GROUND_Y} x2={BASE_X1} y2={GROUND_Y} strokeWidth={1.6} />
        {HATCH_XS.map((x) => (
          <path key={x} {...stroke} d={`M${x} ${GROUND_Y} l-16 20`} strokeWidth={0.7} />
        ))}
        <path {...stroke} d={`M${BASE_X1} ${GROUND_Y} L${BASE_X1} ${EAVE_Y}`} strokeWidth={1.3} />
        <path {...stroke} d={`M${BASE_X0} ${GROUND_Y} L${BASE_X0} ${EAVE_Y}`} strokeWidth={1.3} />
        <path {...stroke} d={`M${BASE_X0} ${EAVE_Y} L${SPRING_X1} ${EAVE_Y}`} strokeWidth={0.5} />

        {/* Then the ATTEMPT: rafters, apex witness tick, apex registration
            circle, and the protractor arc checking the angle just drawn. */}
        <path {...stroke} d={leftRafterD(STATIC_APEX)} strokeWidth={1.3} />
        <path {...stroke} d={rightRafterD(STATIC_APEX)} strokeWidth={1.3} />
        <path {...stroke} d={witnessD(STATIC_APEX)} strokeWidth={0.9} />
        <circle {...stroke} cx={APEX_X} cy={STATIC_APEX} r={11} strokeWidth={1} />
        <path {...stroke} d={pitchArcD(PITCHES[0])} strokeWidth={0.7} />

        {/* The study's own instrument: a tiny graphite nib (dot + 45° lead),
            parked invisible; the timeline rides it along the drawing stroke.
            Sized in viewBox units so it grew with the joint it draws. */}
        <g ref={nibRef} opacity={0}>
          <circle cx={0} cy={0} r={3.2} fill="var(--ink-graphite)" />
          <line x1={0} y1={0} x2={9.8} y2={-9.8} stroke="var(--ink-graphite)" strokeWidth={0.9} />
        </g>
      </svg>
    </figure>
  );
}
