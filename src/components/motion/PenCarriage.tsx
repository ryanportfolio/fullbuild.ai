'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { penBus, type PenInk } from '@/lib/penBus';
import styles from './PenCarriage.module.css';

const INK_VAR: Record<PenInk, string> = {
  graphite: 'var(--ink-graphite)',
  cyanotype: 'var(--ink-cyanotype)',
  concrete: 'var(--ink-concrete)',
  live: 'var(--accent-live)',
};

/**
 * THE PEN — one drafting instrument, in the room the whole time. It leads
 * every DRAW stroke (the bus feeds it stroke-tip positions), rides the pour
 * waterline through the schedule, and parks on the rail between sheets,
 * swapping its ink chip to the state's pen at each dock. Movement runs on
 * gsap's ticker, so the capture freeze halts it with everything else.
 * Pure annotation: aria-hidden, pointer-events none, and it never exists
 * under reduced motion (the bus never fires there).
 */
export default function PenCarriage() {
  const ref = useRef<HTMLDivElement>(null);
  const nibRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    const nib = nibRef.current;
    if (!el || !nib) return;

    // 0.32s lerp: long enough that stroke-to-stroke hops read as one hand
    // travelling, short enough to stay on the newest stroke's tip.
    const xTo = gsap.quickTo(el, 'x', { duration: 0.32, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.32, ease: 'power3.out' });
    let shown = false;
    let curInk: PenInk | null = null;
    let curMode = '';
    // Rail telemetry cells — real coords, throttled to readable rate.
    const telMode = document.getElementById('pen-telemetry-mode');
    const telXY = document.getElementById('pen-telemetry-xy');
    const MODE_TEXT = {
      draw: 'plotting',
      pour: 'riding the pour',
      dock: 'docked',
      hide: 'parked',
    } as const;
    let lastTel = 0;

    const unsub = penBus.subscribe((t) => {
      // Off-stage: the [data-mode='hide'] CSS rule fades it out in place
      // (see module.css); forget the position so the next appearance
      // materialises at its target instead of streaking across.
      if (t.mode === 'hide') {
        if (shown) {
          gsap.killTweensOf(el, 'opacity');
          // park the inline value at 0 too, so the eventual re-show fades in
          // from transparent instead of popping at full ink
          gsap.set(el, { opacity: 0 });
          shown = false;
        }
        if (t.mode !== curMode) {
          curMode = t.mode;
          el.dataset.mode = t.mode;
          if (telMode) telMode.textContent = MODE_TEXT.hide;
        }
        return;
      }
      if (!shown) {
        // first target: appear in place, no cross-screen streak
        gsap.set(el, { x: t.x, y: t.y });
        gsap.to(el, { opacity: 1, duration: 0.3, ease: 'power2.out' });
        shown = true;
      } else {
        xTo(t.x);
        yTo(t.y);
      }
      if (t.ink !== curInk) {
        curInk = t.ink;
        nib.style.color = INK_VAR[t.ink];
        // the pen-change beat: a quick quarter-turn as the carriage swaps pens
        gsap.fromTo(nib, { rotation: -90 }, { rotation: 0, duration: 0.45, ease: 'power2.out' });
      }
      if (t.mode !== curMode) {
        curMode = t.mode;
        el.dataset.mode = t.mode;
        if (telMode) telMode.textContent = `${MODE_TEXT[t.mode]} · ${t.ink}`;
      }
      const now = performance.now();
      if (telXY && now - lastTel > 90) {
        lastTel = now;
        telXY.textContent = `x ${Math.round(t.x)} · y ${Math.round(t.y)}`;
      }
    });

    return () => {
      unsub();
    };
  }, []);

  return (
    <div ref={ref} className={styles.pen} aria-hidden="true">
      <svg ref={nibRef} viewBox="0 0 28 28" className={styles.nib}>
        {/* reticle */}
        <line x1="14" y1="0" x2="14" y2="9" stroke="currentColor" strokeWidth="1" />
        <line x1="14" y1="19" x2="14" y2="28" stroke="currentColor" strokeWidth="1" />
        <line x1="0" y1="14" x2="9" y2="14" stroke="currentColor" strokeWidth="1" />
        <line x1="19" y1="14" x2="28" y2="14" stroke="currentColor" strokeWidth="1" />
        <circle cx="14" cy="14" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
        {/* nib dot — the ink chip */}
        <circle cx="14" cy="14" r="1.8" fill="currentColor" />
      </svg>
    </div>
  );
}
