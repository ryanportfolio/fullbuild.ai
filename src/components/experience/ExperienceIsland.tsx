'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { canRunExperience } from '@/lib/webgl';
import { useWorkingSet } from '@/lib/store';

// WebGL must not render on the server; the Scene loads only after the gate
// passes, so no three.js JS ships to devices that will render the static sheets.
const Scene = dynamic(() => import('./Scene'), { ssr: false });

// The canvas layer is invisible until STATE 03 approaches, so the three.js
// chunk parse + context creation + shader compile have no business competing
// with the masthead plot on load. Mount once the reader is provably headed
// down the set (STATE 02 current, or a sheet of scroll behind them) — a full
// sheet of lead time before the first visible frame.
const shouldMount = (state: number, progress: number): boolean =>
  state >= 2 || progress > 0.1;

/**
 * Progressive-enhancement gate. Renders the WebGL walk-through only where the
 * device can hold the frame budget and motion is welcome; everywhere else it
 * renders nothing and the complete static drawing set stands on its own.
 */
export default function ExperienceIsland() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!canRunExperience()) return;
    const s = useWorkingSet.getState();
    if (shouldMount(s.state, s.progress)) {
      setEnabled(true);
      return;
    }
    const unsub = useWorkingSet.subscribe((st) => {
      if (shouldMount(st.state, st.progress)) {
        setEnabled(true);
        unsub();
      }
    });
    return unsub;
  }, []);

  if (!enabled) return null;
  return <Scene />;
}
