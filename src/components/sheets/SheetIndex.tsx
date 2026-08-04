'use client';

import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import { buildName, LETTERING, type NameGeometry } from '@/lib/letterStrokes';
import x from './index.module.css';

/**
 * SHEET INDEX — a real drawing set opens with one. Every entry in the S-04
 * schedule is a stamp card: the project title hand-lettered in the set's
 * single-stroke drafting alphabet inside a ruled stamp box, with the live-probe
 * dot and, on hover (or the no-pointer rotation), the drawing's title block —
 * its one-line note and stack. The dot beside an entry is probe-licensed
 * revision-red for a live, reachable site; a drawn outline for repo-only work.
 * Same store, same rule, no second source of truth.
 *
 * MOTION CONTRACT (mirrors DrawingSet's): geometry is deterministic, so the
 * server renders the finished lettering — no-JS and reduced-motion readers get
 * the drawn sheet. With motion, the pre-paint hold (data-draw-hold) keeps the
 * cards blank until the pen writes them on scroll, gated behind ws:cover-drawn
 * so the cover keeps one working hand at a time. Dash values are SVG
 * ATTRIBUTES in user units, never CSS px (the truncated-building bug).
 */
export default function SheetIndex() {
  const health = useWorkingSet((s) => s.health);
  const rootRef = useRef<HTMLDivElement>(null);
  const geoms = useMemo<NameGeometry[]>(() => PROJECTS.map((p, i) => buildName(p.title, i)), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const K = LETTERING;
    interface CardRig {
      card: HTMLAnchorElement;
      geo: NameGeometry;
      box: SVGPathElement;
      strokes: SVGPathElement[];
      overs: SVGPathElement[];
      drawn: boolean;
      boilRaf: number;
    }
    const rigs: CardRig[] = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[data-idx]'),
    ).map((card) => {
      const geo = geoms[Number(card.dataset.idx)];
      const paths = Array.from(card.querySelectorAll<SVGPathElement>('path'));
      return {
        card,
        geo,
        box: paths[0],
        strokes: paths.slice(1, 1 + geo.strokeCount),
        overs: paths.slice(1 + geo.strokeCount),
        drawn: false,
        boilRaf: 0,
      };
    });

    // Hold every stroke hidden-by-dash NOW, then arm it out of the pre-paint
    // CSS hold in the same frame — the finished lettering never flashes.
    const allPaths = (r: CardRig) => [r.box, ...r.strokes, ...r.overs];
    rigs.forEach((r) =>
      allPaths(r).forEach((el) => {
        const len = el.getTotalLength();
        el.setAttribute('stroke-dasharray', String(len));
        el.setAttribute('stroke-dashoffset', String(len));
        el.setAttribute('data-ws-armed', '');
      }),
    );

    const setInk = (r: CardRig, seed: number) => {
      const ink = r.geo.at(seed);
      r.box.setAttribute('d', ink.boxD);
      r.strokes.forEach((el, i) => el.setAttribute('d', ink.strokeDs[i]));
      r.overs.forEach((el, i) => el.setAttribute('d', ink.overDs[i]));
    };

    // --- draw-on: the lab's pen model (speed-based, pen lifts, box first) ---
    const master = gsap.timeline({ paused: true });
    rigs.forEach((r, ci) => {
      const tl = gsap.timeline();
      let t = 0;
      const pen = (el: SVGPathElement, speed: number, pause: number) => {
        const len = el.getTotalLength();
        const dur = len / speed;
        tl.to(
          el,
          {
            attr: { 'stroke-dashoffset': 0 },
            duration: dur,
            ease: 'none',
            onComplete: () => {
              // hand the stroke back to its authored presentation, so the
              // boil can re-letter it without a stale dash mis-measuring
              el.removeAttribute('stroke-dasharray');
              el.removeAttribute('stroke-dashoffset');
            },
          },
          t,
        );
        t += dur + K.PEN_LIFT_MS / 1000 + pause / 1000;
      };
      pen(r.box, K.BOX_SPEED, K.LETTER_PAUSE_MS);
      r.strokes.forEach((el) => pen(el, K.DRAW_SPEED, 0));
      r.overs.forEach((el) => {
        const len = el.getTotalLength();
        const dur = len / K.DRAW_SPEED;
        tl.to(
          el,
          {
            attr: { 'stroke-dashoffset': 0 },
            duration: dur,
            ease: 'none',
            onComplete: () => {
              el.removeAttribute('stroke-dasharray');
              el.removeAttribute('stroke-dashoffset');
            },
          },
          t,
        );
        // the second pass overlaps itself — reads as a quick re-ink, not a rewrite
        t += dur * 0.35;
      });
      tl.call(() => {
        r.drawn = true;
      });
      master.add(tl, (ci * K.CARD_STAGGER_MS) / 1000);
    });

    // --- hover boil: slow seed oscillation around the settled lettering ----
    const startBoil = (r: CardRig) => {
      if (!r.drawn || K.HOVER_BOIL_AMP <= 0) return;
      cancelAnimationFrame(r.boilRaf);
      const t0 = performance.now();
      const step = () => {
        const el = (performance.now() - t0) / 1000;
        setInk(r, K.SEED + Math.sin(el * 2 * Math.PI * K.HOVER_BOIL_HZ) * K.HOVER_BOIL_AMP);
        r.boilRaf = requestAnimationFrame(step);
      };
      r.boilRaf = requestAnimationFrame(step);
    };
    const stopBoil = (r: CardRig) => {
      cancelAnimationFrame(r.boilRaf);
      r.boilRaf = 0;
      if (r.drawn) setInk(r, K.SEED);
    };
    const enters = rigs.map((r) => () => startBoil(r));
    const leaves = rigs.map((r) => () => stopBoil(r));
    rigs.forEach((r, i) => {
      r.card.addEventListener('pointerenter', enters[i]);
      r.card.addEventListener('pointerleave', leaves[i]);
    });

    // --- no-pointer rotation: each card holds the hovered state in turn -----
    let cycleTimer = 0;
    let cycleIdx = -1;
    const noHover = window.matchMedia('(hover: none)').matches;
    const cycleTick = () => {
      const prev = cycleIdx >= 0 ? rigs[cycleIdx] : null;
      if (prev) {
        prev.card.removeAttribute('data-autohover');
        stopBoil(prev);
      }
      cycleIdx = (cycleIdx + 1) % rigs.length;
      const next = rigs[cycleIdx];
      next.card.setAttribute('data-autohover', '');
      startBoil(next);
      cycleTimer = window.setTimeout(cycleTick, K.AUTO_HOVER_DWELL_MS);
    };

    // --- trigger: index in view AND the cover's crewed pass finished --------
    let visible = false;
    let coverDone = Boolean((window as unknown as { __coverDrawn?: boolean }).__coverDrawn);
    let fired = false;
    const tryFire = () => {
      if (fired || !visible || !coverDone) return;
      fired = true;
      master.play();
      if (noHover) {
        cycleTimer = window.setTimeout(cycleTick, master.duration() * 1000 + 500);
      }
    };
    const onCover = () => {
      coverDone = true;
      tryFire();
    };
    window.addEventListener('ws:cover-drawn', onCover);
    // Safety: the index must never stay blank if the cover pass is torn down
    // mid-flight (fast scroll unmount, dev overlay) — draw anyway after a beat.
    const gateFallback = window.setTimeout(onCover, 6000);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          visible = true;
          io.disconnect();
          tryFire();
        });
      },
      { rootMargin: '0px 0px -18% 0px', threshold: 0 },
    );
    io.observe(root);

    return () => {
      io.disconnect();
      window.removeEventListener('ws:cover-drawn', onCover);
      window.clearTimeout(gateFallback);
      window.clearTimeout(cycleTimer);
      rigs.forEach((r, i) => {
        cancelAnimationFrame(r.boilRaf);
        r.card.removeEventListener('pointerenter', enters[i]);
        r.card.removeEventListener('pointerleave', leaves[i]);
      });
      master.kill();
    };
  }, [geoms]);

  return (
    <div className={x.index} ref={rootRef}>
      <div className={x.head}>
        <span>Sheet index</span>
      </div>
      <div className={x.grid}>
        {PROJECTS.map((p, i) => {
          const live = p.live && isUp(health, p.href);
          const href = p.href ?? p.repo ?? '#';
          const g = geoms[i];
          return (
            <a
              className={x.card}
              key={p.id}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={p.title}
              data-idx={i}
            >
              <span className={x.cardTop}>
                <span className={x.no}>{p.sheet}</span>
                <span
                  className={x.dot}
                  data-live={live ? 'true' : 'false'}
                  aria-label={live ? 'live in production' : 'repository only'}
                />
              </span>
              <span className={x.cardDraw}>
                <svg
                  viewBox={g.viewBox}
                  style={{ width: `${g.width}px`, maxWidth: '100%' }}
                  aria-hidden="true"
                  focusable="false"
                >
                  <path className={x.ink} d={g.base.boxD} data-draw-hold="" />
                  {g.base.strokeDs.map((d, si) => (
                    <path className={x.ink} key={`s${si}`} d={d} data-draw-hold="" />
                  ))}
                  {g.base.overDs.map((d, si) => (
                    <path className={`${x.ink} ${x.over}`} key={`o${si}`} d={d} data-draw-hold="" />
                  ))}
                </svg>
              </span>
              <span className={x.cardMeta}>
                <span className={x.cardNote}>{p.note}</span>
                <span className={x.cardStack}>{p.stack.join(' · ')}</span>
              </span>
            </a>
          );
        })}
      </div>
      {/* Not a shipped drawing — a link off the cover to the draft designs.
          Internal nav, so no target/probe dot; an arrow marks it as a page. */}
      <a className={x.row} href="/prototype">
        <span className={x.no}>P-01</span>
        <span className={x.name}>Prototypes</span>
        <span className={x.leader} aria-hidden="true" />
        <span className={x.arrow} aria-hidden="true">→</span>
      </a>
      <p className={x.legend}>
        <span className={x.dotSample} data-live="true" /> website&nbsp;&nbsp;
        <span className={x.dotSample} data-live="false" /> repo only
      </p>
    </div>
  );
}
