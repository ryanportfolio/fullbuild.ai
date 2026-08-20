'use client';

import { useEffect, useRef } from 'react';
import { gsap, Draggable } from '@/lib/gsapClient';

/**
 * DRAFTING INSTRUMENTS — a parallel rule and a set square resting on the S-02
 * plan. They are real linework in the plan's own coordinate space, plotted by
 * the act as its last strokes (data-o after the rise: the drafter lays down
 * tools when the drawing is done), and they reward the one visitor who
 * touches them: the rule drags vertically and clicks onto the plan's grid
 * module, the square spins and snaps to the drafting angles. Fine pointers
 * only; everyone else gets the instruments parked, which is also the no-JS
 * and reduced-motion floor. Supplementary marks, so the group is aria-hidden
 * and nothing here is the only path to anything.
 */
const GRID = 17; // the plan's module: (420 - 80) / 20, in viewBox units

export default function InstrumentsOverlay() {
  const ruleRef = useRef<SVGGElement>(null);
  const triRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const rule = ruleRef.current;
    const tri = triRef.current;
    if (!rule || !tri) return;

    // The square spins about its own centroid, not the svg origin.
    gsap.set(tri, { svgOrigin: '299 66' });

    const snapY = gsap.utils.snap(GRID);
    // Parked on the y=250 partition; travel keeps it on the sheet (90..410).
    const clampY = gsap.utils.clamp(-160, 160);
    const drags = Draggable.create(rule, {
      type: 'y',
      cursor: 'grab',
      activeCursor: 'grabbing',
      inertia: true,
      snap: { y: (v: number) => snapY(clampY(v)) },
    }).concat(
      Draggable.create(tri, {
        type: 'rotation',
        cursor: 'grab',
        activeCursor: 'grabbing',
        inertia: true,
        // the angles a set square is actually used at
        snap: (v: number) => Math.round(v / 15) * 15,
      }),
    );
    return () => drags.forEach((d) => d.kill());
  }, []);

  return (
    <g aria-hidden="true">
      {/* PARALLEL RULE — parked on the plan's mid partition */}
      <g ref={ruleRef} style={{ touchAction: 'none' }}>
        {/* blank paper takes no nib: the catcher makes the whole rule grabbable */}
        <rect x={44} y={239} width={312} height={22} fill="none" pointerEvents="fill" />
        <path className="ws-draw" data-o={30} pathLength={1} d="M56 250 H344" fill="none" stroke="currentColor" strokeWidth={2} />
        <path className="ws-draw" data-o={30} pathLength={1} d="M48 243 h8 v14 h-8 Z M344 243 h8 v14 h-8 Z" fill="none" stroke="currentColor" strokeWidth={1} />
      </g>
      {/* SET SQUARE — 45 degrees, resting clear of the dim strings */}
      <g ref={triRef} style={{ touchAction: 'none' }}>
        <rect x={280} y={48} width={36} height={34} fill="none" pointerEvents="fill" />
        <path className="ws-draw" data-o={31} pathLength={1} d="M284 80 L314 80 L314 50 Z" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinejoin="round" />
        <path className="ws-draw" data-o={31} pathLength={1} d="M292 74 L308 74 L308 58 Z" fill="none" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
      </g>
    </g>
  );
}
