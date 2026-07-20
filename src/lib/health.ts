'use client';

import { useEffect } from 'react';
import { useWorkingSet } from './store';
import { LIVE_PROJECTS } from './projects';

/**
 * Makes "red = live" self-enforcing rather than asserted. Throttled, off the
 * render loop. A project that fails de-ignites from revision-red to graphite in
 * the store, which the sheets + canvas read. Best-effort: cross-origin targets
 * return opaque responses, so a resolved fetch (even opaque) counts as up and
 * only a thrown network error counts as down — we never falsely down a site.
 */
async function probe(href: string): Promise<boolean> {
  try {
    await fetch(href, { mode: 'no-cors', cache: 'no-store', redirect: 'follow' });
    return true;
  } catch {
    return false;
  }
}

export function useHealthProbe(intervalMs = 60_000): void {
  const setHealth = useWorkingSet((s) => s.setHealth);

  useEffect(() => {
    let cancelled = false;
    const targets = LIVE_PROJECTS.map((p) => p.href);
    if (targets.length === 0) return;

    const run = async () => {
      for (const href of targets) {
        const up = await probe(href);
        if (!cancelled) setHealth(href, up);
      }
    };

    run();
    const id = window.setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setHealth, intervalMs]);
}
