'use client';

import { useEffect } from 'react';
import { useWorkingSet, type HealthReading } from './store';
import { LIVE_PROJECTS } from './projects';

/**
 * Makes "red = live" self-enforcing rather than asserted. The server route
 * /api/health probes every live project with a real request — actual status
 * codes and measured latency, not the browser's opaque no-cors guess — and this
 * hook feeds those readings into the store. A project that fails de-ignites
 * from revision-red to graphite; the sheet also STAMPS the measurement
 * (`host · 200 · 87ms`) beside each ignited row, so the accent is a printed
 * measurement, not a decoration.
 *
 * Failure of the probe endpoint itself leaves readings absent (assume-live),
 * never fabricates them.
 */
export function useHealthProbe(intervalMs = 60_000): void {
  const setHealth = useWorkingSet((s) => s.setHealth);

  useEffect(() => {
    if (LIVE_PROJECTS.length === 0) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const readings = (await res.json()) as (HealthReading & { href: string })[];
        if (cancelled || !Array.isArray(readings)) return;
        for (const r of readings) {
          if (r && typeof r.href === 'string') {
            setHealth(r.href, { up: !!r.up, status: r.status ?? 0, ms: r.ms ?? 0, at: r.at ?? '' });
          }
        }
      } catch {
        /* endpoint unreachable — keep assume-live, never invent a reading */
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
