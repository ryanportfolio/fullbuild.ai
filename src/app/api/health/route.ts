import { NextResponse } from 'next/server';
import { LIVE_PROJECTS } from '@/lib/projects';

/* ============================================================================
   THE PROBE — server-side, real status codes, measured latency.

   The browser's no-cors fetch can only prove "something answered"; this route
   proves WHAT answered and HOW FAST, and those two facts are design elements:
   the schedule stamps `host · 200 · 87ms` beside each ignited row. Red is a
   measurement, not an assertion.

   Cached for 60s (in-process + CDN header) so a burst of visitors costs the
   probed sites one request a minute, total.
   ========================================================================= */

export interface ProbeResult {
  href: string;
  up: boolean;
  /** HTTP status, or 0 when the request itself failed. */
  status: number;
  /** Round-trip latency in ms, measured server-side. */
  ms: number;
  /** ISO timestamp of the probe. */
  at: string;
}

const TIMEOUT_MS = 6_500;
const TTL_MS = 60_000;

let cache: { at: number; results: ProbeResult[] } | null = null;
let inflight: Promise<ProbeResult[]> | null = null;

async function probe(href: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(href, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'fullbuild.ai health probe' },
    });
    return {
      href,
      up: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    };
  } catch {
    return {
      href,
      up: false,
      status: 0,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    };
  }
}

async function probeAll(): Promise<ProbeResult[]> {
  return Promise.all(LIVE_PROJECTS.map((p) => probe(p.href as string)));
}

export async function GET(): Promise<NextResponse> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    // Single flight: concurrent visitors share one probe sweep.
    inflight ??= probeAll().then((results) => {
      cache = { at: Date.now(), results };
      inflight = null;
      return results;
    });
    await inflight;
  }
  return NextResponse.json(cache!.results, {
    headers: { 'cache-control': 's-maxage=60, stale-while-revalidate=120' },
  });
}
