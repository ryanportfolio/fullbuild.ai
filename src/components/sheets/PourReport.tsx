'use client';

import { useEffect, useState } from 'react';
import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import s from './shipped.module.css';

/**
 * POUR REPORT — the mono readout under the frame's band cell. The same store
 * value that drives the section plane and the DOM waterline, printed as an
 * inspector's tally: rows poured, latest ignition, last measured probe.
 */
export default function PourReport() {
  const health = useWorkingSet((st) => st.health);
  const [pour, setPour] = useState(() => useWorkingSet.getState().pour);

  useEffect(() => {
    // Reduced motion: report the finished end-state, matching the schedule.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPour(1);
      return;
    }
    return useWorkingSet.subscribe((st, prev) => {
      if (st.pour !== prev.pour) setPour(st.pour);
    });
  }, []);

  const n = PROJECTS.length;
  // Same threshold family as the schedule rows' --lit computation.
  const poured = Math.max(0, Math.min(n, Math.ceil(pour * n - 0.45)));
  const pouredRows = PROJECTS.slice(0, poured);
  const latest = pouredRows[pouredRows.length - 1];
  const lastLive = [...pouredRows].reverse().find((p) => p.live && p.href && isUp(health, p.href));
  const reading = lastLive?.href ? health[lastLive.href] : undefined;

  return (
    <div className={s.pourReport} aria-hidden="true">
      <span className={s.pourReportLine}>
        POUR {poured}/{n}
      </span>
      {latest && <span className={s.pourReportLine}>{latest.sheet} poured</span>}
      {reading && (
        <span className={s.pourReportLine} data-live="true">
          last probe {reading.ms}ms · {reading.status}
        </span>
      )}
    </div>
  );
}
