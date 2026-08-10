'use client';

/* The page's red, under the site's one law: registry-live AND probe-agreed.
   The probe runs once for the page (started here; the store is shared) and is
   keyed by the registry row's href, so every evidence link on the sheet
   de-ignites together if the product goes down. An absent reading stays
   assume-live without ever being counted as confirmation, and the server
   render assumes live for a `live` row, so the no-JS floor shows the same
   mark the probe would leave standing. */

import type { ReactNode } from 'react';
import { useHealthProbe } from '@/lib/health';
import { useWorkingSet } from '@/lib/store';
import styles from './prediction-lab.module.css';

export default function LiveLink({
  href,
  probeKey,
  live,
  children,
}: {
  /** The link's destination, e.g. a deep evidence URL. */
  href: string;
  /** The registry href the health probe reports under. */
  probeKey: string;
  live: boolean;
  children: ReactNode;
}) {
  useHealthProbe();
  const health = useWorkingSet((s) => s.health);
  const reading = health[probeKey];
  const ignited = live && (reading ? reading.up : true);
  return (
    <a
      className={`${styles.evidenceLink} u-mono`}
      href={href}
      target="_blank"
      rel="noreferrer"
      data-live={ignited ? 'true' : undefined}
    >
      {children}
    </a>
  );
}
