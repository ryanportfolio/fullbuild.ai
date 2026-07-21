'use client';

import { PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import x from './index.module.css';

/**
 * SHEET INDEX — a real drawing set opens with one. Every entry in the S-04
 * schedule is listed on the cover, so the payload is visible from the first
 * viewport. The dot beside an entry is probe-licensed revision-red for a live,
 * reachable site; a drawn outline for repo-only work. Same store, same rule,
 * no second source of truth.
 */
export default function SheetIndex() {
  const health = useWorkingSet((s) => s.health);
  return (
    <div className={x.index}>
      <div className={x.head}>
        <span>Sheet index</span>
        <span>{PROJECTS.length} drawings</span>
      </div>
      {PROJECTS.map((p) => {
        const live = p.live && isUp(health, p.href);
        const href = p.href ?? p.repo ?? '#';
        return (
          <a className={x.row} key={p.id} href={href} target="_blank" rel="noreferrer">
            <span className={x.no}>{p.sheet}</span>
            <span className={x.name}>{p.title}</span>
            <span className={x.leader} aria-hidden="true" />
            <span className={x.dot} data-live={live ? 'true' : 'false'} aria-label={live ? 'live in production' : 'repository only'} />
          </a>
        );
      })}
      <p className={x.legend}>
        <span className={x.dotSample} data-live="true" /> website&nbsp;&nbsp;
        <span className={x.dotSample} data-live="false" /> repo only
      </p>
    </div>
  );
}
