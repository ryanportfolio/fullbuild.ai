'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useWorkingSet, type PipelineState } from '@/lib/store';
import { penBus, type PenInk } from '@/lib/penBus';
import ExperienceIsland from '../experience/ExperienceIsland';
import PenCarriage from './PenCarriage';
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

  // The band cell hosts the frame across its whole life: it assembles as
  // graphite wireframe beside STATE 03 (engineering) and pours through STATE 04
  // (shipped). Opacity ramps in as STATE 03 arrives and out after STATE 04
  // hands off to the appendix — the 3D exists exactly where the story needs it.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const apply = () => {
      const s3 = document.getElementById('state-03');
      const s4 = document.getElementById('state-04');
      if (!s3 || !s4) return;
      const vh = window.innerHeight || 1;
      const enter = smoothstep(0.9, 0.35, s3.getBoundingClientRect().top / vh);
      const exit = smoothstep(0.12, 0.55, s4.getBoundingClientRect().bottom / vh);
      el.style.opacity = String(Math.min(enter, exit));
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

    // Title-block state tracker — runs in ALL modes. A sheet is "current" when
    // it crosses the viewport's centre band (NOT a visible-fraction threshold:
    // the schedule sheet is taller than the viewport and would never reach 55%).
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const s = stateFromAttr(e.target.getAttribute('data-state'));
          if (s) setState(s);
        });
      },
      // Band sits at 40-45% so the chip flips as the incoming header crosses
      // the upper-middle of the glass — never lagging a fully visible header.
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
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

    // --- THE PEN: helpers feeding the carriage from real stroke geometry ----
    const inkOf = (sec: HTMLElement): PenInk => {
      const v = sec.dataset.ink;
      return v === 'cyanotype' || v === 'concrete' || v === 'live'
        ? v
        : 'graphite';
    };
    const dockPen = (ink: PenInk) => {
      const rail = document.querySelector<HTMLElement>('[data-rail]');
      if (!rail) return;
      const r = rail.getBoundingClientRect();
      penBus.set({
        x: r.left + r.width / 2,
        y: Math.min(r.top + 150, window.innerHeight * 0.3),
        ink,
        mode: 'dock',
      });
    };
    const penToStroke = (el: SVGElement, p: number, ink: PenInk) => {
      const geo = el as unknown as SVGGeometryElement;
      if (typeof geo.getTotalLength !== 'function') return;
      try {
        const pt = geo.getPointAtLength(geo.getTotalLength() * Math.max(0, Math.min(1, p)));
        const m = geo.getScreenCTM();
        if (!m) return;
        penBus.set({
          x: m.a * pt.x + m.c * pt.y + m.e,
          y: m.b * pt.x + m.d * pt.y + m.f,
          ink,
          mode: 'draw',
        });
      } catch {
        /* detached node mid-teardown — skip the frame */
      }
    };

    const ctx = gsap.context(() => {
      // DRAW — reveal strokes per sheet in authored order, the pen leading the
      // newest stroke's tip (one instrument, one hand).
      sections.forEach((sec) => {
        const strokes = gsap.utils.toArray<SVGElement>(sec.querySelectorAll('.ws-draw'));
        if (!strokes.length) return;
        strokes.sort(
          (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
        );
        gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });
        const ink = inkOf(sec);
        let leader = -1;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: sec, start: 'top 78%', once: true },
          onComplete: () => dockPen(ink),
        });
        strokes.forEach((el, i) => {
          tl.to(
            el,
            {
              strokeDashoffset: 0,
              ease: 'power2.out',
              duration: 0.9,
              onStart: () => {
                leader = i;
              },
              onUpdate() {
                if (leader === i) penToStroke(el, this.progress(), ink);
              },
            },
            i * 0.03,
          );
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

      // POUR — STATE 03 → 04 fill progress. The pen rides the waterline while
      // the schedule is actively pouring (concrete pen — red is never a pen).
      const shipped = document.getElementById('state-04');
      if (shipped) {
        ScrollTrigger.create({
          trigger: shipped,
          start: 'top bottom',
          end: 'top top',
          scrub: true,
          onUpdate: (self) => {
            setPour(self.progress);
            if (self.progress > 0.02 && self.progress < 0.985) {
              const wl = document.querySelector<HTMLElement>('[data-waterline]');
              if (wl) {
                const r = wl.getBoundingClientRect();
                penBus.set({ x: r.right - 6, y: r.bottom, ink: 'concrete', mode: 'pour' });
              }
            } else if (penBus.last?.mode === 'pour') {
              dockPen('concrete');
            }
          },
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
      <PenCarriage />
      <div ref={rootRef} className={styles.set}>
        {children}
      </div>
    </>
  );
}
