'use client';

import type { ReactNode } from 'react';
import { useWorkingSet } from '@/lib/store';

/**
 * The static-SVG floor for a band cell: server-rendered, SEO-visible, and the
 * exact reduced-motion / no-WebGL spec. When the R3F island mounts and claims
 * the cell, the floor yields (the live frame IS the drawing); when the island
 * can't run, the floor stands. Never both.
 */
export default function StaticFloor({ children }: { children: ReactNode }) {
  const webglActive = useWorkingSet((s) => s.webglActive);
  if (webglActive) return null;
  return <>{children}</>;
}
