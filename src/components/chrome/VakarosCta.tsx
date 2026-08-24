'use client';

import { useLayoutEffect, useRef } from 'react';
import { reducedMotion } from '@/lib/motion';
import { MARK_GLYPHS, MARK_VIEWBOX } from './vakarosMark';
import styles from './VakarosCta.module.css';

/* ============================================================================
   THE VAKAROS CTA, the title block the E-02 sheet carries instead of its own.

   On /layline-vid the rail's title block stands down and this takes the frame:
   the Vakaros wordmark drawn by hand in the set's graphite, then the route it
   points at. The letterforms are the company's own, traced from their artwork
   (see vakarosMark.ts for the source and the measured fidelity), so what draws
   is their word and not a lookalike.

   THE k GOES FIRST, alone, because it is the letter Vakaros redrew: its arm is
   an arrow. It draws, it pours, it stands by itself for a beat, and only then
   does the rest of the word come in behind it in reading order. The caption
   lands last, once the word is whole.

   Machinery, in contract order:
   - Each letter is drawn as a moving pen: its contour is stroked with a
     dash rig at pathLength 1, then the letter pours solid behind the finished
     line. Pencil first, then ink, the same order RailLogo works in.
   - The mark ships DRAWN, so a no-JS reader gets the finished word and the
     caption with no motion at all; the pre-paint hold in globals.css covers
     the finished state only until this effect arms the hidden one, so nothing
     flashes and nothing snaps away.
   - REDUCED MOTION STILL DRAWS HERE, and only here. This sheet carries the
     flag that opts one route out of the set's reduced-motion collapse: the
     address is the page, and a still mark is not it. src/lib/motion.ts holds
     the reasoning; the check below reads it rather than the media query, so
     moving this back under the preference is one edit in one file.
   - A teardown mid-draw leaves the finished mark, never a half-drawn word.
   ========================================================================= */

export const CTA_HREF = 'https://fullbuild.ai/prototype/layline/races';

/* Beats, ms. The k owns the opening; the rest of the word is deliberately
   slower than it, so the word reads as following the letter rather than
   racing it. */
const K_DRAW = 1400;
const K_POUR = 500;
const K_HOLD = 350; // the beat the k stands alone
const REST_DRAW = 1100;
const REST_STAGGER = 380;
const REST_POUR = 450;
const CAPTION_FADE = 600;

const REST_COUNT = MARK_GLYPHS.length - 1;
const WORD_DONE =
  K_DRAW + K_POUR + K_HOLD + (REST_COUNT - 1) * REST_STAGGER + REST_DRAW + REST_POUR;

export default function VakarosCta() {
  const svgRef = useRef<SVGSVGElement>(null);
  const capRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const caption = capRef.current;
    if (!svg || !caption) return;
    // This sheet runs its motion for everyone (src/lib/motion.ts), so the read
    // is here rather than absent: a caller that skips the check is a caller
    // that cannot be moved back under the preference in one edit.
    if (reducedMotion()) return; // the finished word stands, no motion

    const groups = Array.from(svg.querySelectorAll<SVGGElement>('g[data-glyph]'));
    if (!groups.length) return;
    const strokesOf = (g: SVGGElement) =>
      Array.from(g.querySelectorAll<SVGPathElement>('path[data-stroke]'));
    const pourOf = (g: SVGGElement) => g.querySelector<SVGPathElement>('path[data-pour]');

    /* Arm the hidden state in the same frame the pre-paint hold is covering,
       so the finished word never shows before its own drawing. visibility
       carries the wait rather than the dash alone: a dasharray against
       pathLength 1 leaks fragments in Firefox while a stroke waits. */
    for (const g of groups) {
      for (const p of strokesOf(g)) {
        p.style.transition = 'none';
        p.style.visibility = 'hidden';
        p.style.strokeDasharray = '1';
        p.style.strokeDashoffset = '1';
      }
      const pour = pourOf(g);
      if (pour) {
        pour.style.transition = 'none';
        pour.style.opacity = '0';
      }
    }
    caption.style.transition = 'none';
    caption.style.opacity = '0';
    svg.setAttribute('data-ws-armed', '');
    caption.setAttribute('data-ws-armed', '');
    svg.getBoundingClientRect(); // flush the hidden state before the beats

    const settle = (g: SVGGElement) => {
      for (const p of strokesOf(g)) {
        p.style.transition = 'none';
        p.style.visibility = '';
        p.style.strokeDasharray = '';
        p.style.strokeDashoffset = '';
      }
    };

    const timers: number[] = [];
    const draw = (g: SVGGElement, at: number, dur: number, pourDur: number) => {
      const strokes = strokesOf(g);
      for (const p of strokes) {
        p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(0.22,0.61,0.36,1) ${at}ms, visibility 0s ${at}ms`;
        p.style.visibility = 'visible';
        p.style.strokeDashoffset = '0';
      }
      const pour = pourOf(g);
      if (pour) {
        pour.style.transition = `opacity ${pourDur}ms ease ${at + dur}ms`;
        pour.style.opacity = '1';
      }
      /* A FINISHED STROKE CARRIES NO DASH: the rig comes off once the letter
         is poured, so what stands afterwards is a plain path, the same state
         teardown and no-JS leave behind. */
      timers.push(window.setTimeout(() => settle(g), at + dur + pourDur + 60));
    };

    const [k, ...rest] = groups;
    draw(k, 0, K_DRAW, K_POUR);
    const restAt = K_DRAW + K_POUR + K_HOLD;
    rest.forEach((g, i) => draw(g, restAt + i * REST_STAGGER, REST_DRAW, REST_POUR));

    timers.push(
      window.setTimeout(() => {
        caption.style.transition = `opacity ${CAPTION_FADE}ms ease`;
        caption.style.opacity = '1';
      }, WORD_DONE),
    );

    return () => {
      for (const t of timers) window.clearTimeout(t);
      for (const g of groups) {
        settle(g);
        const pour = pourOf(g);
        if (pour) {
          pour.style.transition = 'none';
          pour.style.opacity = '';
        }
      }
      caption.style.transition = 'none';
      caption.style.opacity = '';
    };
  }, []);

  return (
    <a
      className={styles.cta}
      href={CTA_HREF}
      aria-label="vakaros: the Layline prototype race replay"
    >
      <svg
        ref={svgRef}
        className={styles.mark}
        viewBox={`0 0 ${MARK_VIEWBOX.w} ${MARK_VIEWBOX.h}`}
        aria-hidden="true"
        data-draw-hold
      >
        {MARK_GLYPHS.map((g) => (
          <g key={g.id} data-glyph={g.id}>
            {g.paths.map((d, i) => (
              <path
                key={i}
                data-stroke
                className={styles.stroke}
                d={d}
                pathLength={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* one poured letter, counters cut by even-odd */}
            <path data-pour className={styles.pour} d={g.paths.join(' ')} fillRule="evenodd" />
          </g>
        ))}
      </svg>
      <span ref={capRef} className={styles.caption} data-draw-hold>
        <span className={styles.word}>layline prototype</span>
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
      </span>
    </a>
  );
}
