'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { canRunExperience } from '@/lib/webgl';

// WebGL must not render on the server; the Scene loads only after the gate
// passes, so no three.js JS ships to devices that will render the static sheets.
const Scene = dynamic(() => import('./Scene'), { ssr: false });

/**
 * Progressive-enhancement gate. Renders the WebGL walk-through only where the
 * device can hold the frame budget and motion is welcome; everywhere else it
 * renders nothing and the complete static drawing set stands on its own.
 */
export default function ExperienceIsland() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(canRunExperience());
  }, []);

  if (!enabled) return null;
  return <Scene />;
}
