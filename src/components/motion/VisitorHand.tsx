'use client';

import { useEffect } from 'react';
import { penBus } from '@/lib/penBus';
import { afterIntroHold } from '@/lib/introHold';

/* ============================================================================
   THE VISITOR'S HAND — the T-01 handoff, promoted to the whole site.

   The carriage follows the visitor's pointer on every route, whenever the
   site itself is not using the instrument. Ownership is read straight off the
   bus: a site write (a crewed DRAW stroke, the pour waterline) is mode
   'draw'/'pour' with no hand, and the visitor stands down until the site
   parks ('hide') or docks ('dock') the pen again. The one site plot that ends
   without parking is T-01's courier pass — its completion event IS the
   handoff, so it is taken here as one (the carriage glides from the last
   stroke to the cursor, exactly the old sheet-local behaviour).

   While the visitor holds the instrument, <html data-visitor-hand="true">
   lets globals.css retire the native cursor — the carriage is the pointer —
   with links and buttons keeping the house mark (they answer a click; the
   pen only draws). The attribute drops whenever the site takes the pen back.

   Same floor as the T-01 handoff: fine pointer + wide viewport + full motion
   only. Reduced motion, touch, and narrow screens never engage, so the
   attribute never appears and every cursor stays native. On the homepage the
   hand arms only after the intro lets the page go — the pen must not roam
   over the film.
   ========================================================================= */
export default function VisitorHand() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const wide = window.matchMedia('(min-width: 901px)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const html = document.documentElement;

    const supported = () => fine.matches && wide.matches && !reduce.matches;

    let armed = false;
    let holding = false;
    // The courier's completion can arrive before the pointer has ever moved
    // (a reader who loads /contact and just watches): the release is latched
    // so the FIRST move still takes the instrument, even though the bus is
    // left holding a site-owned 'draw'.
    let released = false;
    const pointer = { x: -1, y: -1 };

    const setHolding = (v: boolean) => {
      if (holding === v) return;
      holding = v;
      if (v) html.setAttribute('data-visitor-hand', 'true');
      else html.removeAttribute('data-visitor-hand');
    };

    const mayTake = () => {
      const last = penBus.last;
      return !last || last.mode === 'hide' || last.mode === 'dock' || last.hand === 'visitor';
    };

    const feed = (x: number, y: number) => {
      penBus.set({ x, y, ink: 'graphite', mode: 'draw', hand: 'visitor' });
      setHolding(true);
    };

    const move = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!armed || !supported()) return;
      if (mayTake() || released) {
        released = false;
        feed(e.clientX, e.clientY);
      }
    };

    // The site preempts by writing its own targets: the native cursor comes
    // back for the duration of its plot.
    const unsub = penBus.subscribe((t) => {
      if (t.hand !== 'visitor' && (t.mode === 'draw' || t.mode === 'pour')) {
        released = false;
        setHolding(false);
      }
    });

    // T-01's courier plot ends in mode 'draw' with no park — the completion
    // event hands the instrument over.
    const onHandoff = () => {
      if (!armed || !supported()) return;
      if (pointer.x >= 0) feed(pointer.x, pointer.y);
      else released = true;
    };
    window.addEventListener('ws:t01-drawn', onHandoff);

    // Pointer leaves the window: the pen parks in place, ready to resume on
    // the next move inside.
    const out = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      if (penBus.last?.hand === 'visitor') penBus.set({ ...penBus.last, mode: 'hide' });
    };
    window.addEventListener('pointerout', out);

    // Support can lapse live (a resize under 901px): give everything back.
    const drop = () => {
      if (supported()) return;
      setHolding(false);
      if (penBus.last?.hand === 'visitor') penBus.set({ ...penBus.last, mode: 'hide' });
    };
    fine.addEventListener('change', drop);
    wide.addEventListener('change', drop);
    reduce.addEventListener('change', drop);

    const unhold = afterIntroHold(() => {
      armed = true;
    });

    window.addEventListener('pointermove', move);
    return () => {
      unhold();
      unsub();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('ws:t01-drawn', onHandoff);
      window.removeEventListener('pointerout', out);
      fine.removeEventListener('change', drop);
      wide.removeEventListener('change', drop);
      reduce.removeEventListener('change', drop);
      setHolding(false);
      if (penBus.last?.hand === 'visitor') penBus.set({ ...penBus.last, mode: 'hide' });
    };
  }, []);

  return null;
}
