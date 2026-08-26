'use client';

import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { PROJECTS, type Project } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import { buildIcon, buildName, keystoneIcon, LETTERING, type NameGeometry } from '@/lib/letterStrokes';
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
/** The shipped drawing pulled out of the grid onto the register foot, beside
    the prototypes link — half width each, so neither sits on a row alone. */
const FOOT_ROW_ID = 'layline';

export default function SheetIndex() {
  const health = useWorkingSet((s) => s.health);
  const rootRef = useRef<HTMLDivElement>(null);
  // One extra geometry past the schedule: the P-01 register card.
  const geoms = useMemo<NameGeometry[]>(
    () => [...PROJECTS.map((p, i) => buildName(p.title, i)), buildName('Prototypes', PROJECTS.length)],
    [],
  );
  const icons = useMemo(() => PROJECTS.map((p, i) => buildIcon(p.id, i)), []);
  const keystone = useMemo(() => keystoneIcon(), []);
  const proto = geoms[PROJECTS.length];

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
      icon: SVGPathElement[];
      drawn: boolean;
      boilRaf: number;
      /** The seed the lettering rests at — the boil oscillates around this. */
      seedBase: number;
    }
    const rigs: CardRig[] = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('a[data-idx]'),
    ).map((card) => {
      const geo = geoms[Number(card.dataset.idx)];
      const paths = Array.from(
        card.querySelectorAll<SVGPathElement>('svg[data-lettering] path'),
      );
      return {
        card,
        geo,
        box: paths[0],
        strokes: paths.slice(1, 1 + geo.strokeCount),
        overs: paths.slice(1 + geo.strokeCount),
        icon: Array.from(card.querySelectorAll<SVGPathElement>('svg[data-status] path')),
        drawn: false,
        boilRaf: 0,
        seedBase: LETTERING.SEED,
      };
    });

    // Hold every stroke hidden-by-dash NOW, then arm it out of the pre-paint
    // CSS hold in the same frame — the finished lettering never flashes.
    const allPaths = (r: CardRig) => [r.box, ...r.strokes, ...r.overs, ...r.icon];
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
      // the status mark is sealed last — the pen's final act on the stamp
      r.icon.forEach((el) => pen(el, K.DRAW_SPEED, 0));
      // P-01 only: the hand searches while it writes. The seed sweeps
      // PROTO_DRIFT_FROM -> PROTO_DRIFT_TO across this card's draw and the
      // lettering settles where the sweep ends (dash lengths were measured at
      // the base seed; wobble-induced length change is <1%, invisible).
      const isProto = Number(r.card.dataset.idx) === geoms.length - 1;
      if (isProto) {
        tl.eventCallback('onUpdate', () => {
          setInk(r, K.PROTO_DRIFT_FROM + (K.PROTO_DRIFT_TO - K.PROTO_DRIFT_FROM) * tl.progress());
        });
      }
      tl.call(() => {
        if (isProto) r.seedBase = K.PROTO_DRIFT_TO;
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
        setInk(r, r.seedBase + Math.sin(el * 2 * Math.PI * K.HOVER_BOIL_HZ) * K.HOVER_BOIL_AMP);
        r.boilRaf = requestAnimationFrame(step);
      };
      r.boilRaf = requestAnimationFrame(step);
    };
    const stopBoil = (r: CardRig) => {
      cancelAnimationFrame(r.boilRaf);
      r.boilRaf = 0;
      if (r.drawn) setInk(r, r.seedBase);
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
    // The one-hand gate yields to the reader: a fast scroller must never sit
    // on blank stamps waiting for the elevation pen. Once the index is in
    // view, the cover gets one short beat to finish — then the cards draw.
    let gateFallback = 0;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          visible = true;
          io.disconnect();
          tryFire();
          if (!fired) gateFallback = window.setTimeout(onCover, 800);
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

  // One stamp card. Shared by the grid and the register foot so the foot's
  // Layline card is pixel-identical to a grid card — same lettering rig
  // (data-idx), same probe-licensed status ink, same hover title block.
  const renderCard = (p: Project, i: number) => {
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
          {icons[i] ? (
            <svg
              className={x.icon}
              viewBox={icons[i].viewBox}
              /* inline size: .drawing's global svg{width:100%} must not
                 inflate the mark (same trap as the lettering svg) */
              style={{ width: '1.05rem', height: '1.05rem' }}
              data-live={live ? 'true' : 'false'}
              role="img"
              aria-label={live ? 'live in production' : 'repository only'}
              focusable="false"
              data-status=""
            >
              {icons[i].ds.map((d, si) => (
                <path key={si} d={d} data-draw-hold="" />
              ))}
            </svg>
          ) : null}
        </span>
        <span className={x.cardDraw}>
          <svg
            viewBox={g.viewBox}
            style={{ width: `${g.width}px`, maxWidth: '100%' }}
            aria-hidden="true"
            focusable="false"
            data-lettering=""
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
  };

  const footProject = PROJECTS.find((p) => p.id === FOOT_ROW_ID);

  return (
    <div className={x.index} ref={rootRef}>
      <div className={x.head}>
        <span>Sheet index</span>
      </div>
      <div className={x.grid}>
        {PROJECTS.map((p, i) => (p.id === FOOT_ROW_ID ? null : renderCard(p, i)))}
      </div>
      {/* Register foot — two half-width cards on one row. Left: Layline, a
          shipped drawing kept out of the grid so it never sits on a row of
          its own. Right: the prototypes link off the cover to the draft
          designs. Internal nav, so no status mark; an arrow marks it as a
          page — and the only stamp whose hand SEARCHES as it writes (the
          seed sweeps the whole range across its draw). */}
      <div className={x.protoRow}>
        {footProject && renderCard(footProject, PROJECTS.indexOf(footProject))}
        <a className={x.protoCard} href="/prototype" aria-label="Prototypes" data-idx={PROJECTS.length}>
          <span className={x.cardTop}>
            <span className={x.no}>P-01</span>
            <span className={x.arrow} aria-hidden="true">→</span>
          </span>
          <span className={x.cardDraw}>
            <svg
              viewBox={proto.viewBox}
              style={{ width: `${proto.width}px`, maxWidth: '100%' }}
              aria-hidden="true"
              focusable="false"
              data-lettering=""
            >
              <path className={x.ink} d={proto.base.boxD} data-draw-hold="" />
              {proto.base.strokeDs.map((d, si) => (
                <path className={x.ink} key={`s${si}`} d={d} data-draw-hold="" />
              ))}
              {proto.base.overDs.map((d, si) => (
                <path className={`${x.ink} ${x.over}`} key={`o${si}`} d={d} data-draw-hold="" />
              ))}
            </svg>
          </span>
        </a>
      </div>
      <p className={x.legend}>
        <svg
          className={x.legendMark}
          viewBox={keystone.viewBox}
          style={{ width: '0.7rem', height: '0.7rem' }}
          data-live="true"
          aria-hidden="true"
          focusable="false"
        >
          {keystone.ds.map((d, si) => (
            <path key={si} d={d} />
          ))}
        </svg>{' '}
        website&nbsp;&nbsp;
        <svg
          className={x.legendMark}
          viewBox={keystone.viewBox}
          style={{ width: '0.7rem', height: '0.7rem' }}
          data-live="false"
          aria-hidden="true"
          focusable="false"
        >
          {keystone.ds.map((d, si) => (
            <path key={si} d={d} />
          ))}
        </svg>{' '}
        repo only
      </p>
    </div>
  );
}
