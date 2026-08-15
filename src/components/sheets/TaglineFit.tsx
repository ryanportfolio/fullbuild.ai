'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
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

/* --- the audit cycle -------------------------------------------------------
   The audit slot cycles the review loop's own verbs — audit, iterate, refine,
   harden — and three instruments take the transitions in rotation, one each:

     greenline  the auditor approves: a hand-drawn underline in the approval
                ink draws under the word, holds, and the word retires passed
     plot       the plotter's pen erases the word and letters the next one in,
                the same instrument the lettering pass uses
     stamp      the next word slams in over a ghost of the last, which fades
                like an over-stamped sheet

   The cycle starts only after the lettering pass has finished, so it never
   fights the pen for the line. Reduced motion parks the slot on "audit" (the
   same floor rule as everything else on the cover), and the slot is
   aria-hidden with a visually hidden static "audit" beside it, because a
   word that changes every few seconds is a ticker, not a tagline, to a
   screen reader.

   Every number below was tuned in a live lab (2026-08-15) and ported
   verbatim; the approval ink is --accent-pass in globals.css. */
const CYCLE_WORDS = ['audit', 'iterate', 'refine', 'harden'];
const CYCLE_MECHANISMS = ['greenline', 'plot', 'stamp'] as const;
const CYCLE_DWELL_MS = 3600;
const SLOT_RESHAPE_MS = 800;
const UNDERLINE_MS = 340;
const UNDERLINE_HOLD_MS = 280;
const UNDERLINE_TILT_DEG = -0.8;
const UNDERLINE_WOBBLE_PX = 0.9;
const UNDERLINE_THICKNESS_PX = 4;
const UNDERLINE_DROP_PX = 7;
const SWAP_OUT_MS = 220;
const LETTER_MS = 420;
const PEN_WIDTH_PX = 2;
const ERASE_MS = 300;
const STAMP_MS = 160;
const STAMP_SCALE_FROM = 1.45;
const STAMP_TILT_DEG = -2;
const GHOST_OPACITY = 0.1;
const GHOST_DECAY_MS = 3000;

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

  // the audit cycle's fixtures, all inside the slot
  const slotRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<SVGSVGElement>(null);
  const cyclePenRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  // The lettering pass calls this when it finishes, so the cycle never fights
  // the pen for the line. A ref rather than state: no re-render, no dep churn.
  const cycleStartRef = useRef<() => void>(() => {});

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

    /*
     * The registration word for the flush-fit is always "audit". The cycle may
     * be showing a longer verb when a refit lands (fonts.ready, a resize), and
     * fitting to that verb would shrink the whole line and leave it short of
     * flush once the slot comes back around. Normalise the measure to the
     * parked word instead: swap the displayed word's width for "audit"'s.
     */
    const measureLine2 = () => {
      let w2 = measure(g2);
      const slotWord = wordRef.current;
      const slotMeasure = measureRef.current;
      if (slotWord && slotMeasure && slotWord.textContent && slotWord.textContent !== 'audit') {
        slotMeasure.textContent = slotWord.textContent;
        const shown = slotMeasure.getBoundingClientRect().width;
        slotMeasure.textContent = 'audit';
        w2 += slotMeasure.getBoundingClientRect().width - shown;
      }
      return w2;
    };

    const fit = () => {
      g2.style.fontSize = ''; // remeasure from the CSS fallback size
      const w1 = measure(g1);
      const w2 = measureLine2();
      const base = parseFloat(getComputedStyle(g2).fontSize);
      if (!w1 || !w2 || !base) return;
      let size = base * (w1 / w2);
      g2.style.fontSize = `${size}px`;
      // Corrective pass: spacing does not scale perfectly linearly with the
      // type, so measure once more at the fitted size and trim the residual.
      const w2b = measureLine2();
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
      // The line is down; the audit cycle may take the slot.
      cycleStartRef.current();
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

  /*
   * THE AUDIT CYCLE. Armed here, started by the lettering pass's finish() via
   * cycleStartRef, and never started at all under reduced motion: the server
   * markup IS the parked state, so no-JS and reduced motion both read a still
   * "audit" with nothing to undo.
   */
  useEffect(() => {
    const slot = slotRef.current;
    const word = wordRef.current;
    const ghost = ghostRef.current;
    const mark = markRef.current;
    const pen = cyclePenRef.current;
    const meas = measureRef.current;
    if (!slot || !word || !ghost || !mark || !pen || !meas) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let cancelled = false;
    let started = false;
    let timer = 0;
    let raf = 0;
    let idx = 0; // which verb is standing
    let turn = 0; // which instrument takes the next transition

    const widthOf = (text: string) => {
      meas.textContent = text;
      return meas.getBoundingClientRect().width;
    };
    const setSlotWidth = (text: string, animate: boolean) => {
      slot.style.transition = animate
        ? `width ${SLOT_RESHAPE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
        : 'none';
      slot.style.width = `${widthOf(text)}px`;
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });

    /*
     * The approval mark: a hand-drawn underline in the approval ink, wobble
     * and tilt from the lab, revealed by dashoffset the way every stroke on
     * this site is drawn. Ink comes from the CSS (.cycleMark currentColor),
     * so the mark re-inks itself under the night theme.
     */
    const drawUnderline = (w: number, h: number) => {
      const y0 = h * 0.92 + UNDERLINE_DROP_PX;
      const segs = 14;
      const pts: string[] = [];
      for (let i = 0; i <= segs; i += 1) {
        const x = (w + 8) * (i / segs) - 4;
        const y =
          y0 +
          Math.sin(i * 1.7 + 0.6) * UNDERLINE_WOBBLE_PX +
          (i / segs - 0.5) * 2 * Math.tan((UNDERLINE_TILT_DEG * Math.PI) / 180) * (w / 2);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      mark.setAttribute('viewBox', `0 0 ${w} ${h + 14}`);
      mark.setAttribute('width', String(w));
      mark.setAttribute('height', String(h + 14));
      mark.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="${UNDERLINE_THICKNESS_PX}" stroke-linecap="round" stroke-linejoin="round"/>`;
      const line = mark.querySelector<SVGPolylineElement>('polyline');
      if (!line) return;
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      line.getBoundingClientRect(); // flush, so the reveal transitions
      line.style.transition = `stroke-dashoffset ${UNDERLINE_MS}ms cubic-bezier(0.55, 0, 0.45, 1)`;
      line.style.strokeDashoffset = '0';
    };

    /* One pen for both directions: reveal wipes the word in left to right,
       erase wipes it out right to left — the lettering pass's instrument. */
    const sweep = (ms: number, reveal: boolean) =>
      new Promise<void>((resolve) => {
        const w = widthOf(word.textContent ?? '');
        const t0 = performance.now();
        pen.style.width = `${PEN_WIDTH_PX}px`;
        const tick = (now: number) => {
          if (cancelled) return;
          const p = Math.min(1, (now - t0) / ms);
          const x = w * (reveal ? p : 1 - p);
          word.style.clipPath = `inset(0 ${Math.max(0, w - x)}px 0 0)`;
          pen.style.left = `${x}px`;
          pen.style.opacity = p < 1 ? '1' : '0';
          if (p < 1) raf = requestAnimationFrame(tick);
          else {
            if (reveal) word.style.clipPath = '';
            resolve();
          }
        };
        raf = requestAnimationFrame(tick);
      });

    const letterIn = async (text: string) => {
      word.textContent = text;
      word.style.opacity = '1';
      word.style.transform = 'none';
      word.style.transition = 'none';
      word.style.clipPath = 'inset(0 100% 0 0)';
      await sweep(LETTER_MS, true);
    };

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void advance();
      }, CYCLE_DWELL_MS);
    }

    async function advance() {
      if (cancelled || !word || !mark || !ghost) return;
      const mech = CYCLE_MECHANISMS[turn % CYCLE_MECHANISMS.length];
      const next = CYCLE_WORDS[(idx + 1) % CYCLE_WORDS.length];
      const cur = word.textContent ?? 'audit';
      const h = word.getBoundingClientRect().height;

      if (mech === 'greenline') {
        // approved: the underline draws, holds, and the word retires passed
        drawUnderline(widthOf(cur), h);
        await wait(UNDERLINE_MS + UNDERLINE_HOLD_MS);
        if (cancelled) return;
        word.style.transition = `opacity ${SWAP_OUT_MS}ms ease`;
        mark.style.transition = `opacity ${SWAP_OUT_MS}ms ease`;
        word.style.opacity = '0';
        mark.style.opacity = '0';
        await wait(SWAP_OUT_MS);
        if (cancelled) return;
        mark.innerHTML = '';
        mark.style.opacity = '1';
        mark.style.transition = 'none';
        setSlotWidth(next, true);
        await wait(SLOT_RESHAPE_MS);
        if (cancelled) return;
        await letterIn(next);
      } else if (mech === 'plot') {
        await sweep(ERASE_MS, false);
        if (cancelled) return;
        setSlotWidth(next, true);
        await wait(SLOT_RESHAPE_MS);
        if (cancelled) return;
        await letterIn(next);
      } else {
        // stamped: the next verb slams in over a ghost of the last
        ghost.textContent = cur;
        ghost.style.transition = 'none';
        ghost.style.opacity = String(GHOST_OPACITY);
        setSlotWidth(next, true);
        word.textContent = next;
        word.style.clipPath = '';
        word.style.transition = 'none';
        word.style.opacity = '0';
        word.style.transform = `scale(${STAMP_SCALE_FROM}) rotate(${STAMP_TILT_DEG}deg)`;
        word.getBoundingClientRect(); // flush, so the slam transitions
        word.style.transition = `transform ${STAMP_MS}ms cubic-bezier(0.2, 0, 0.1, 1), opacity ${Math.round(STAMP_MS * 0.6)}ms ease-in`;
        word.style.opacity = '1';
        word.style.transform = 'scale(1) rotate(0deg)';
        await wait(STAMP_MS);
        if (cancelled) return;
        ghost.style.transition = `opacity ${GHOST_DECAY_MS}ms ease-out`;
        ghost.style.opacity = '0';
      }

      if (cancelled) return;
      idx = (idx + 1) % CYCLE_WORDS.length;
      turn += 1;
      schedule();
    }

    // A resize mid-dwell re-derives the slot's frozen width at the new type
    // size; transitions re-freeze it themselves on their next swap.
    const onResize = () => {
      if (started) setSlotWidth(word.textContent ?? 'audit', false);
    };
    window.addEventListener('resize', onResize);

    cycleStartRef.current = () => {
      if (started || cancelled) return;
      started = true;
      setSlotWidth(word.textContent ?? 'audit', false);
      schedule();
    };

    return () => {
      cancelled = true;
      cycleStartRef.current = () => {};
      window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
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
        → <span className={copy.srOnly}>audit</span>
        <span className={copy.cycleSlot} ref={slotRef} aria-hidden="true">
          <span ref={wordRef} className={`${copy.audit} ${copy.cycleWord}`}>
            audit
          </span>
          <span ref={ghostRef} className={`${copy.audit} ${copy.cycleGhost}`} />
          <svg ref={markRef} className={copy.cycleMark} width={0} height={0} />
          <span ref={cyclePenRef} className={copy.cyclePen} />
          <span ref={measureRef} className={copy.cycleMeasure} />
        </span>{' '}
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
