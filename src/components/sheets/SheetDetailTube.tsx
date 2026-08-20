'use client';

import { useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsapClient';
import t from './tube.module.css';

/**
 * DETAIL LIBRARY — the one motion the vertical set cannot express: drawings
 * pulled sideways out of a tube. A pinned band holds a horizontal strip of
 * detail plates, vertical scroll drives the strip, and each plate inks as it
 * crosses the middle of the glass. The details are honest: every plate
 * documents a real mechanism of THIS page, with its real numbers (hinge
 * degrees, escapement turn, dash rig, pour scrub, depth ratchet).
 *
 * Deliberately OUTSIDE DrawingSet's machinery: no data-state, so the state
 * tracker, HINGE, flatten and DRAW timelines never touch it, which keeps
 * every ancestor of the pinned element transform-free (the one hard law of
 * pinning here). Reduced motion, no-JS, touch and narrow windows get the
 * floor: a wrapped, fully inked plate grid. The strip tween is scrubbed with
 * ease none (shape the mapping, not the tween) and runs on the ticker, so
 * the capture freeze owns it like everything else.
 */
const DETAILS = [
  {
    no: 'D-01',
    name: 'Hinge',
    note: '1.6° entering · gain ×4 by end of set',
    art: (
      <>
        <path className="ws-detail" data-o={0} pathLength={1} d="M18 72 H102" strokeWidth={1.4} />
        <path className="ws-detail" data-o={1} pathLength={1} d="M18 72 L84 24" strokeWidth={1} />
        <path className="ws-detail" data-o={2} pathLength={1} d="M46 72 A28 28 0 0 0 41 56" strokeWidth={0.9} />
        <path className="ws-detail" data-o={3} pathLength={1} d="M30 40 h14 M30 40 v14" strokeWidth={0.8} />
      </>
    ),
  },
  {
    no: 'D-02',
    name: 'Escapement',
    note: '90° per seated sheet',
    art: (
      <>
        <path className="ws-detail" data-o={0} pathLength={1} d="M60 18 V78 M30 48 H90" strokeWidth={1} />
        <path className="ws-detail" data-o={1} pathLength={1} d="M60 30 A18 18 0 1 1 42 48" strokeWidth={1.1} />
        <path className="ws-detail" data-o={2} pathLength={1} d="M42 48 l-5 -7 M42 48 l8 -3" strokeWidth={0.9} />
      </>
    ),
  },
  {
    no: 'D-03',
    name: 'Dash rig',
    note: 'pathLength 1 · attrs only · shed on completion',
    art: (
      <>
        <path className="ws-detail" data-o={0} pathLength={1} d="M16 62 C 36 30, 66 30, 86 50" strokeWidth={1.3} />
        <path className="ws-detail" data-o={1} pathLength={1} d="M86 50 l14 10" strokeDasharray="2 3" strokeWidth={1} />
        <path className="ws-detail" data-o={2} pathLength={1} d="M86 50 l-3 -8 M86 50 l8 -1" strokeWidth={0.8} />
      </>
    ),
  },
  {
    no: 'D-04',
    name: 'Pour',
    note: '--pour scrubbed 0 to 1 · read by the 3D',
    art: (
      <>
        <path className="ws-detail" data-o={0} pathLength={1} d="M24 22 H96 V74 H24 Z" strokeWidth={1.1} />
        <path className="ws-detail" data-o={1} pathLength={1} d="M24 48 H96" strokeWidth={0.9} />
        <path className="ws-detail" data-o={2} pathLength={1} d="M30 56 l8 -8 M42 60 l12 -12 M58 62 l14 -14 M76 64 l14 -14" strokeWidth={0.8} />
      </>
    ),
  },
  {
    no: 'D-05',
    name: 'Ratchet',
    note: '--depth · 24 steps · never backward',
    art: (
      <>
        <path className="ws-detail" data-o={0} pathLength={1} d="M20 70 H100" strokeWidth={1.1} />
        <path className="ws-detail" data-o={1} pathLength={1} d="M28 70 v-8 M40 70 v-5 M52 70 v-8 M64 70 v-5 M76 70 v-8 M88 70 v-5" strokeWidth={0.9} />
        <path className="ws-detail" data-o={2} pathLength={1} d="M52 54 l6 8 l-12 0 Z" strokeWidth={0.9} />
        <path className="ws-detail" data-o={3} pathLength={1} d="M58 46 l10 0 l-4 -4 M68 46 l-4 4" strokeWidth={0.8} />
      </>
    ),
  },
];

export default function SheetDetailTube() {
  const sectionRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const strip = stripRef.current;
    if (!section || !strip) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(min-width: 901px)').matches) return;

    const cards = Array.from(strip.querySelectorAll<HTMLElement>('[data-detail]'));
    const rigs = cards.map((card) => ({
      card,
      strokes: Array.from(card.querySelectorAll<SVGElement>('.ws-detail')).sort(
        (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
      ),
      // authored dashes are stashed and restored exactly like .ws-draw
      front: 0,
    }));

    const ctx = gsap.context(() => {
      // strip layout on, then hold every stroke and arm it out of the
      // pre-paint hold in the same frame (the .ws-draw contract)
      section.setAttribute('data-tube', '');
      rigs.forEach((r) =>
        r.strokes.forEach((el) => {
          const authored = el.getAttribute('stroke-dasharray');
          if (authored) el.dataset.wsDash = authored;
          el.setAttribute('stroke-dasharray', '1 1');
          el.setAttribute('stroke-dashoffset', '1');
          el.setAttribute('visibility', 'hidden');
          el.setAttribute('data-ws-armed', '');
        }),
      );

      // Per-card ink from strip progress: pure arithmetic off cached offsets,
      // no rect reads per tick. A card inks as its centre crosses the middle
      // half of the glass; the front is ratcheted, the pencil only adds.
      let dist = 0;
      let glass = 1;
      let centers: number[] = [];
      const measure = () => {
        glass = Math.max(1, section.clientWidth);
        dist = Math.max(1, strip.scrollWidth - glass);
        centers = cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
      };
      const ink = (p: number) => {
        // The band's exit force-completes the library: the last plate parks
        // right of the read line, and a finished stroke must never keep its
        // dash (a flick straight past the band lands here in one update).
        const done = p >= 0.999;
        rigs.forEach((r, i) => {
          // card centre in glass coords at this progress
          const x = centers[i] - p * dist;
          // 0 at 85% of glass, 1 at 45% — inked by the time it is read
          const local = done ? 1 : Math.min(1, Math.max(0, (0.85 - x / glass) / 0.4));
          const front = local * r.strokes.length;
          if (front <= r.front) return;
          r.front = front;
          r.strokes.forEach((el, si) => {
            const s = Math.min(1, Math.max(0, front - si));
            if (s >= 1) {
              el.removeAttribute('visibility');
              const authored = el.dataset.wsDash;
              if (authored) el.setAttribute('stroke-dasharray', authored);
              else el.removeAttribute('stroke-dasharray');
              el.removeAttribute('stroke-dashoffset');
            } else if (s > 0) {
              el.removeAttribute('visibility');
              el.setAttribute('stroke-dashoffset', String(1 - s));
            }
          });
        });
      };

      gsap.to(strip, {
        x: () => -(strip.scrollWidth - section.clientWidth),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + Math.round(strip.scrollWidth - section.clientWidth + window.innerHeight * 0.4),
          pin: true,
          // DrawingSet's <main> carries `perspective`, which makes it the
          // containing block for position:fixed — a normally pinned element
          // would fix against <main> and drift. Reparenting to <body> for the
          // pin's duration is the documented escape hatch; one element, class
          // -scoped styles, so nothing visual depends on its ancestry.
          pinReparent: true,
          anticipatePin: 1,
          scrub: true,
          invalidateOnRefresh: true,
          onRefresh: measure,
          onUpdate: (self) => ink(self.progress),
        },
      });
    }, section);

    return () => {
      ctx.revert();
      section.removeAttribute('data-tube');
      rigs.forEach((r) =>
        r.strokes.forEach((el) => {
          const authored = el.dataset.wsDash;
          if (authored) el.setAttribute('stroke-dasharray', authored);
          else el.removeAttribute('stroke-dasharray');
          el.removeAttribute('stroke-dashoffset');
          el.removeAttribute('visibility');
        }),
      );
    };
  }, []);

  return (
    <section ref={sectionRef} className={t.band} aria-label="Detail library, how this page moves">
      <div className={t.head}>
        <span className="u-mono">DETAIL LIBRARY</span>
        <span className={`${t.headNote} u-mono`}>as built · this page</span>
      </div>
      <div ref={stripRef} className={t.strip}>
        {DETAILS.map((d) => (
          <figure key={d.no} className={t.card} data-detail="">
            <svg viewBox="0 0 120 90" role="img" aria-label={`${d.no} ${d.name}, ${d.note}`}>
              <g fill="none" stroke="currentColor">{d.art}</g>
            </svg>
            <figcaption className={t.caption}>
              <span className={`${t.no} u-mono`}>{d.no}</span>
              <span className={t.name}>{d.name}</span>
              <span className={`${t.note} u-mono`}>{d.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
