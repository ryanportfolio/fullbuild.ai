'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useWorkingSet, type PipelineState } from '@/lib/store';
import ExperienceIsland from '../experience/ExperienceIsland';
import styles from './DrawingSet.module.css';

/**
 * Single scroll authority. Lenis drives one RAF loop that feeds both GSAP and
 * the R3F camera, so DOM and WebGL can never desync. Three motion verbs, nothing
 * else moves:
 *   DRAW  — .ws-draw strokes plot themselves in authored order (no fade).
 *   HINGE — each sheet turns a few degrees about its leading edge as it passes.
 *   POUR  — STATE 03→04 progress drives the section-plane fill (read by the 3D).
 * Under prefers-reduced-motion every verb resolves to its finished end-state and
 * only the title-block state tracker runs.
 */
export default function DrawingSet({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const { setState, setProgress, setPour } = useWorkingSet.getState();
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-state]'));

    const stateFromAttr = (v: string | null): PipelineState | null => {
      const n = Number(v);
      return n >= 1 && n <= 4 ? (n as PipelineState) : null;
    };

    // Title-block state tracker — runs in ALL modes.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const s = stateFromAttr(e.target.getAttribute('data-state'));
          if (s) setState(s);
        });
      },
      { threshold: 0.55 },
    );
    sections.forEach((s) => io.observe(s));

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      return () => io.disconnect();
    }

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      // DRAW — reveal strokes per sheet in authored order.
      sections.forEach((sec) => {
        const strokes = gsap.utils.toArray<SVGElement>(sec.querySelectorAll('.ws-draw'));
        if (!strokes.length) return;
        strokes.sort(
          (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
        );
        gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });
        gsap.to(strokes, {
          strokeDashoffset: 0,
          ease: 'power2.out',
          duration: 0.9,
          stagger: 0.03,
          scrollTrigger: { trigger: sec, start: 'top 78%', once: true },
        });
      });

      // HINGE — subtle page-turn about the leading edge.
      sections.forEach((sec) => {
        gsap.fromTo(
          sec,
          { rotateY: 1.6, transformOrigin: 'left center' },
          {
            rotateY: -1.4,
            ease: 'none',
            scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
      });

      // Overall progress (feeds the 3D camera).
      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => setProgress(self.progress),
      });

      // POUR — STATE 03 → 04 fill progress.
      const shipped = document.getElementById('state-04');
      if (shipped) {
        ScrollTrigger.create({
          trigger: shipped,
          start: 'top bottom',
          end: 'top top',
          scrub: true,
          onUpdate: (self) => setPour(self.progress),
        });
      }
    }, root);

    return () => {
      io.disconnect();
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.set}>
      <div className={styles.canvasLayer} aria-hidden="true">
        <ExperienceIsland />
      </div>
      {children}
    </div>
  );
}
