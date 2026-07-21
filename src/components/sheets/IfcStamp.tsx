'use client';

import { LIVE_PROJECTS } from '@/lib/projects';
import { useWorkingSet, isUp } from '@/lib/store';
import u from './unconformity.module.css';

/**
 * ISSUED FOR CONSTRUCTION — the set's closing stamp. The count is the live
 * aggregate of the health probe. It may ink itself red ONLY while this very
 * site's own production probe passes (the stamp licenses itself by the same
 * rule as every other red mark); otherwise it stands in honest graphite.
 */
export default function IfcStamp() {
  const health = useWorkingSet((s) => s.health);
  const probed = Object.keys(health).length > 0;
  const upCount = LIVE_PROJECTS.filter((p) => isUp(health, p.href)).length;
  const selfUp = probed && isUp(health, 'https://fullbuild.ai');
  const lit = selfUp && upCount > 0;

  return (
    <div className={u.stamp} data-lit={lit ? 'true' : undefined} aria-label="Issue stamp">
      <span className={u.stampTitle}>Issued for construction</span>
      <span className={`${u.stampCount} u-mono`}>
        {probed ? upCount : '—'}
        <span className={u.stampTotal}>/{LIVE_PROJECTS.length}</span> IN SERVICE
      </span>
    </div>
  );
}
