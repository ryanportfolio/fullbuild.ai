'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import styles from './SetEdge.module.css';

/**
 * THE BOUND EDGE — the set seen edge-on, and the page's only scrollbar.
 *
 * The strip outboard of the rail is where a real drawing set is bound, so that
 * is what is drawn there: every sheet in the document as its own band, at its
 * own true share of the scroll, in its own ink, with the reader's grip riding
 * the stack. The platform bar is suppressed only once this has mounted and only
 * at widths where it actually draws (see globals.css), so no path is ever left
 * with neither.
 *
 * Everything here is measured. The band count is however many sheets the route
 * really has — six on the homepage, one on the dispatch sheet — and every band's
 * top and height come from layout, never from a division of the track into
 * pleasing equal parts. There is no decorative segment anywhere in this file.
 */

/** Sheet ink → the token that carries that ink's meaning. Same four inks, same
 *  four meanings as everywhere else; the accent reaches the margin only on the
 *  sheet that is already the live one. */
const INK: Record<string, string> = {
  graphite: 'var(--ink-graphite)',
  cyanotype: 'var(--ink-cyanotype)',
  concrete: 'var(--ink-concrete)',
  live: 'var(--accent-live)',
};

/** Marks for the two sheets that carry no 01-04 number. RV and TR are the
 *  drawing-office abbreviations for a revision sheet and a transmittal — not
 *  letters chosen to fill the box. */
const MARK: Record<string, string> = { rev: 'RV', t01: 'TR' };

/** Shorter than this and a lettered numeral would be clipped rather than small. */
const NO_FLOOR = 26;
/** A grip must stay catchable on a very long document. */
const GRIP_FLOOR = 24;

interface Band {
  /** Fraction of the document at which this sheet starts. */
  top: number;
  /** This sheet's fraction of the document. */
  height: number;
  ink: string;
  mark: string;
  key: string;
}

/**
 * Document-space top by the LAYOUT box, walking offsetParent — deliberately not
 * getBoundingClientRect. The sheets carry the HINGE's rotateY as they pass, and
 * a transformed element reports a transformed rect: measuring that way made the
 * bands breathe a pixel or two while the reader scrolled past them. offsetTop is
 * the position the sheet actually occupies in the flow, which is the thing the
 * edge is claiming to draw.
 */
function docTop(el: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

export default function SetEdge() {
  const pathname = usePathname();
  // The app-router prototypes own their whole canvas and mount no site chrome,
  // so they keep the platform's scrollbar. Same gate the rail uses.
  const onAppPrototype = pathname === '/prototype' || pathname.startsWith('/prototype/');

  const edgeRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const noRef = useRef<HTMLSpanElement>(null);
  const [bands, setBands] = useState<Band[]>([]);

  // Read by the paint loop without re-rendering: the geometry of the last
  // measure, and the mark currently lettered on the grip.
  const geo = useRef({ range: 0, travel: 0, docH: 1, viewH: 1 });
  const bandsRef = useRef<Band[]>([]);
  /** Index of the sheet the grip is lettered for; -1 = nothing held yet. */
  const heldRef = useRef(-1);
  /** Signature of the last band set published to React, so a document that
   *  reflows constantly does not re-render the stack on every observation. */
  const sigRef = useRef('');

  useEffect(() => {
    if (onAppPrototype) return;
    const edge = edgeRef.current;
    const grip = gripRef.current;
    if (!edge || !grip) return;

    const html = document.documentElement;
    // The flag that stands the platform bar down. Set here, at mount, so the
    // suppression cannot outlive the thing replacing it.
    html.dataset.setEdge = '';

    let raf = 0;

    const paint = () => {
      raf = 0;
      const { range, travel, docH, viewH } = geo.current;
      if (range <= 0) return;
      const y = Math.min(range, Math.max(0, window.scrollY));
      grip.style.transform = `translateY(${((y / range) * travel).toFixed(2)}px)`;

      // Which sheet is under the thumb. Sampled at 42.5% of the viewport, which
      // is the centre of the band the rail's own state observer uses (rootMargin
      // -40%/-55%) — so the number on the grip and the number in the title block
      // can never disagree about which sheet the reader is on.
      const at = (y + viewH * 0.425) / docH;
      const list = bandsRef.current;
      let held = -1;
      for (let i = 0; i < list.length; i += 1) {
        if (at >= list[i].top) held = i;
      }
      if (held !== heldRef.current) {
        heldRef.current = held;
        const band = held >= 0 ? list[held] : null;
        grip.style.setProperty('--grip-ink', band ? band.ink : 'var(--ink-graphite)');
        if (noRef.current) noRef.current.textContent = band ? band.mark : '';
        // The stack marks the held sheet too, so the margin says it in ink as
        // well as in numerals. Written straight to the DOM on change only —
        // this runs inside the scroll loop and must not re-render the stack.
        const drawn = edge.querySelectorAll<HTMLElement>('[data-band]');
        drawn.forEach((el, i) => {
          if (i === held) el.dataset.held = 'true';
          else delete el.dataset.held;
        });
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const measure = () => {
      const docH = html.scrollHeight;
      const viewH = window.innerHeight;
      const range = docH - viewH;
      // ANY range at all, and deliberately not the half-viewport floor the site
      // log uses. That floor answers "is there room for the record to be worth
      // scrubbing", which is a question about an animation. This is a control,
      // and the flag on <html> has already stood the platform's bar down: a
      // route with 300px of overhang would have been left with no bar of any
      // kind. Below one pixel there is genuinely no position to report, and
      // /contact — one sheet, a range of exactly zero — is the only such route.
      const scrollable = range > 1;
      edge.dataset.scrollable = scrollable ? 'true' : 'false';
      if (!scrollable) {
        geo.current = { range: 0, travel: 0, docH: 1, viewH: 1 };
        bandsRef.current = [];
        if (sigRef.current !== '') {
          sigRef.current = '';
          setBands([]);
        }
        return;
      }

      const trackH = edge.clientHeight;
      // The grip is the viewport's true share of the document. The floor only
      // engages on a document long enough that the honest grip would be
      // uncatchable, and `travel` absorbs it so the grip still lands exactly on
      // both ends of the track.
      const gripH = Math.max(GRIP_FLOOR, (viewH / docH) * trackH);
      grip.style.height = `${gripH.toFixed(2)}px`;
      grip.dataset.tight = gripH < NO_FLOOR ? 'true' : 'false';
      geo.current = { range, travel: trackH - gripH, docH, viewH };

      const next = Array.from(html.querySelectorAll<HTMLElement>('[data-state]')).map((el) => {
        const key = el.dataset.state ?? '';
        const n = Number(key);
        return {
          top: docTop(el) / docH,
          height: el.offsetHeight / docH,
          ink: INK[el.dataset.ink ?? 'graphite'] ?? INK.graphite,
          mark: n >= 1 && n <= 4 ? String(n).padStart(2, '0') : (MARK[key] ?? key.slice(0, 2).toUpperCase()),
          key,
        };
      });
      bandsRef.current = next;
      const sig = next.map((b) => `${b.key}:${b.top.toFixed(5)}:${b.height.toFixed(5)}`).join('|');
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setBands(next);
      }
      // Force the next paint to re-letter: a re-measure can move the reader onto
      // a different sheet without the scroll position changing at all.
      heldRef.current = -1;
      paint();
    };

    // --- driving the page ---------------------------------------------------
    // Lenis owns scroll wherever it is mounted, so a raw window.scrollTo would be
    // overwritten by its next frame. Where it is absent (routes with no
    // DrawingSet) the native call is the right one.
    //
    // FORCED, and that is not belt-and-braces. Lenis' scrollTo opens with
    // `if ((isStopped || isLocked) && !force) return` — it refuses, silently, and
    // returns nothing to say so. The homepage intro holds isStopped for its whole
    // ~6s run, and a hand on this grip during a lock would have got a control that
    // moved under the cursor and left the page where it was: the worst failure a
    // scrollbar has, because it looks like it worked. Nothing is given away by
    // forcing: every scroll lock this site has also covers the strip, so the only
    // way to reach the grip at all is for the lock to be over.
    const scrollTo = (y: number, immediate: boolean) => {
      const lenis = (
        window as unknown as {
          __lenis?: { scrollTo: (t: number, o?: { immediate?: boolean; force?: boolean }) => void };
        }
      ).__lenis;
      if (lenis) lenis.scrollTo(y, { immediate, force: true });
      else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
    };

    let dragFrom = 0;
    let dragTop = 0;

    const onGripDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const { range, travel } = geo.current;
      if (travel <= 0) return;
      dragFrom = e.clientY;
      dragTop = (Math.min(range, Math.max(0, window.scrollY)) / range) * travel;
      edge.dataset.drag = 'true';
      grip.setPointerCapture(e.pointerId);
    };

    const onGripMove = (e: PointerEvent) => {
      if (edge.dataset.drag !== 'true') return;
      const { range, travel } = geo.current;
      if (travel <= 0) return;
      const top = Math.min(travel, Math.max(0, dragTop + (e.clientY - dragFrom)));
      scrollTo((top / travel) * range, true);
    };

    const onGripUp = (e: PointerEvent) => {
      if (edge.dataset.drag !== 'true') return;
      delete edge.dataset.drag;
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
    };

    // A click on the stack is a page turn, so it travels: Lenis' own easing
    // carries the set to that sheet rather than teleporting the reader.
    const onTrackDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { range, travel } = geo.current;
      if (travel <= 0) return;
      const rect = edge.getBoundingClientRect();
      const gripH = grip.getBoundingClientRect().height;
      const top = Math.min(travel, Math.max(0, e.clientY - rect.top - gripH / 2));
      scrollTo((top / travel) * range, false);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    grip.addEventListener('pointerdown', onGripDown);
    grip.addEventListener('pointermove', onGripMove);
    grip.addEventListener('pointerup', onGripUp);
    grip.addEventListener('pointercancel', onGripUp);
    edge.addEventListener('pointerdown', onTrackDown);

    // The document grows and shrinks under this thing all session — fonts land,
    // the intro lifts, the schedule pours, sheets reflow. Re-measure off the body
    // box rather than re-reading scrollHeight every scroll frame, which would
    // force a layout flush inside the one loop that must not stall.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    measure();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
      grip.removeEventListener('pointerdown', onGripDown);
      grip.removeEventListener('pointermove', onGripMove);
      grip.removeEventListener('pointerup', onGripUp);
      grip.removeEventListener('pointercancel', onGripUp);
      edge.removeEventListener('pointerdown', onTrackDown);
      delete html.dataset.setEdge;
    };
  }, [onAppPrototype, pathname]);

  if (onAppPrototype) return null;

  return (
    /* Hidden from assistive tech on purpose, and nothing is lost by it: this is a
       redundant visual affordance over a document that still scrolls by keyboard
       exactly as it did before. A role="scrollbar" here would promise a focusable
       widget contract the platform's own bar never offered either. */
    <div
      ref={edgeRef}
      className={styles.edge}
      data-set-edge
      data-scrollable="false"
      aria-hidden="true"
    >
      {bands.map((b) => (
        <div
          key={b.key}
          className={styles.band}
          data-band
          style={
            {
              top: `${(b.top * 100).toFixed(4)}%`,
              height: `${(b.height * 100).toFixed(4)}%`,
              '--band-ink': b.ink,
            } as CSSProperties
          }
        />
      ))}
      <div ref={gripRef} className={styles.grip} data-grip>
        <span ref={noRef} className={styles.gripNo} />
      </div>
    </div>
  );
}
