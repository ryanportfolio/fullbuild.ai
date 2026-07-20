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
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export default function DrawingSet({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // The pour backdrop belongs to STATE 04 (its home). Drive the layer opacity off
  // how centred STATE 04 is in the viewport: it emerges as STATE 04 arrives, is
  // full while it's read, and fades out both before it (STATE 03's own linework)
  // and after it (the revision-log appendix) so the 3D never sits behind that copy.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const apply = () => {
      const sec = document.getElementById('state-04');
      if (!sec) return;
      const r = sec.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const dist = Math.abs(r.top + r.height / 2 - vh / 2) / vh; // 0 = centred
      el.style.opacity = String(smoothstep(0.78, 0.06, dist));
    };
    apply();
    return useWorkingSet.subscribe((s, p) => {
      if (s.progress !== p.progress) apply();
    });
  }, []);

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

    // A 3D-rotated element is composited into one GPU texture and bilinear-
    // resampled, softening vector linework + text. So the sheet currently being
    // read (>= half in view) is held FLAT (de-composited) and stays pixel-crisp;
    // only sheets entering or leaving carry the HINGE rotation, where the softness
    // is masked by motion and off-center position.
    const flat = new Set<Element>();
    const flatIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const el = e.target as HTMLElement;
          if (e.isIntersecting && e.intersectionRatio >= 0.45) {
            flat.add(el);
            el.style.transform = 'none';
            el.style.transformStyle = 'flat';
          } else {
            flat.delete(el);
          }
        });
      },
      { threshold: [0, 0.45, 0.9] },
    );
    sections.forEach((s) => flatIO.observe(s));

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Dev-only capture handle. Lenis + GSAP drive rAF continuously, so the page
    // never idles and CDP Page.captureScreenshot times out. sleep() halts the
    // ticker (and Lenis, whose raf runs on it) so automated screenshots can grab
    // a stable frame; wake() resumes cleanly with no reload. Not shipped to prod.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __capture?: { freeze: () => void; thaw: () => void } }).__capture = {
        freeze: () => gsap.ticker.sleep(),
        thaw: () => gsap.ticker.wake(),
      };
      // Dev handle for the store — inspect/drive state (e.g. health) when verifying.
      (window as unknown as { __ws?: typeof useWorkingSet }).__ws = useWorkingSet;
    }

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

      // HINGE — subtle page-turn about the leading edge. A 3D-rotated element is
      // composited into one GPU texture and bilinear-resampled, which softens the
      // vector linework and text (worse the larger the window). So we rotate ONLY
      // while a sheet is entering or leaving, and snap it to transform:none through
      // the central reading band — where the sheet is the one being read, and must
      // rasterize pixel-crisp. The page-turn survives; the blur does not.
      const HINGE_START = 1.6;
      const HINGE_END = -1.4;
      sections.forEach((sec) => {
        const el = sec as HTMLElement;
        el.style.transformOrigin = 'left center';
        ScrollTrigger.create({
          trigger: sec,
          start: 'top bottom',
          end: 'bottom top',
          onUpdate: (self) => {
            // The active (crisp) sheet is owned by flatIO — leave it de-composited.
            if (flat.has(el)) return;
            const angle = HINGE_START + (HINGE_END - HINGE_START) * self.progress;
            el.style.transformStyle = 'preserve-3d';
            el.style.transform = `rotateY(${angle.toFixed(2)}deg)`;
          },
        });
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
      flatIO.disconnect();
      ctx.revert();
      // HINGE sets inline transforms directly (not via gsap), so clear them here.
      sections.forEach((s) => {
        s.style.transform = '';
        s.style.transformStyle = '';
      });
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
      delete (window as unknown as { __capture?: unknown }).__capture;
    };
  }, []);

  return (
    <>
      {/* The WebGL backdrop MUST live outside .set: .set has `perspective`, which
          makes it the containing block for position:fixed descendants, so a fixed
          canvas nested inside would size to the full document height and scroll
          with the page instead of staying a viewport-fixed backdrop. */}
      <div ref={canvasRef} className={styles.canvasLayer} aria-hidden="true">
        <ExperienceIsland />
      </div>
      <div ref={rootRef} className={styles.set}>
        {children}
      </div>
    </>
  );
}
