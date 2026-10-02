"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnalystSection } from "@/components/layline/analyst/AnalystSection";
import { LaylineApp } from "@/components/layline/LaylineApp";
import { pointAtRace, useReplay } from "@/components/layline/store";
import { raceMeta } from "@/lib/layline/races";
import styles from "./races.module.css";

/** One row of the rail, measured on the server from that race's own build. */
export interface RaceRow {
  id: string;
  name: string;
  venue: string;
  dateLabel: string;
  boats: number;
  /** Winning elapsed, already formatted on the clock the finish table uses. */
  elapsed: string;
}

/**
 * The three panes and the one race they share.
 *
 * Binding order is the whole of this component. The client store holds one
 * race at a time behind a zero-argument raceData(), and the viewer reads it
 * while it renders, so the URL's race has to be loaded before the viewer's
 * first render rather than in an effect after it. The initializer below does
 * that half, moving the module pointer alone: a store write during a render
 * would notify the page being navigated away from, which is still mounted.
 * The effect brings the store itself to the same race straight after. Both in
 * the browser only, because the store module is one object per server process
 * and a render that wrote to it would hand a concurrent request for another
 * race the wrong one.
 *
 * Which leaves the server rendering the shipped race's id while the browser
 * renders the URL's. Everything the markup spends the id on reads `initial`
 * until mount for exactly that reason, and the analyst, whose whole tree is
 * built from the loaded race, waits for mount rather than hydrating against
 * the wrong one.
 */
export function RaceWorkspace({
  initialRaceId,
  rows,
  analystOffline = false,
  children,
}: {
  initialRaceId: string;
  rows: readonly RaceRow[];
  /* The server knows whether a key or the mock is configured; the client
   * cannot. Offline, the rail says so instead of mounting a composer whose
   * every question would come back a dropped connection. */
  analystOffline?: boolean;
  children: ReactNode;
}) {
  useState(() => {
    if (typeof window !== "undefined") pointAtRace(initialRaceId);
    return null;
  });

  const router = useRouter();
  const pathname = usePathname();
  const storeRaceId = useReplay((state) => state.raceId);
  const [mounted, setMounted] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  /* Mount the analyst on first use, then keep it alive while its drawer is
   * closed. A question thread and an in-flight answer belong to the selected
   * race, not to whether its panel is taking width this moment. */
  const [analystReady, setAnalystReady] = useState(false);

  /* Also the back button: a navigation changes the prop, and the store follows
   * it. Selecting a race the store already holds is a no-op, so the mount pass
   * costs nothing. */
  useEffect(() => {
    useReplay.getState().selectRace(initialRaceId);
    setMounted(true);
  }, [initialRaceId]);

  const raceId = mounted ? storeRaceId : initialRaceId;
  const meta = raceMeta(raceId);
  const venue = meta?.venue;

  /* The URL moves and the store follows it through the effect above, when the
   * navigation hands back the new prop with the new server children. One
   * committer means the fallback chart, the finish table and the viewer can
   * never describe two races at once, whatever the navigation does; a store
   * that jumped ahead here would strand a WebGL-less visitor on a fallback
   * from one race under a rail naming another. Replace rather than push:
   * picking a race is changing what you are looking at, not a place to come
   * back to, and the history would fill with one entry per glance. */
  const select = (id: string) => {
    if (id === raceId) return;
    router.replace(`${pathname}?race=${id}`, { scroll: false });
  };

  return (
    <main
      className={styles.workspace}
      data-library-open={libraryOpen}
      data-analyst-open={analystOpen}
    >
      <aside
        id="race-list"
        className={styles.libraryPane}
        aria-label="Race library"
        tabIndex={-1}
      >
        <div className={styles.paneBar}>
          <button
            id="race-list-toggle"
            type="button"
            className={styles.paneToggle}
            aria-controls="race-library-panel"
            aria-expanded={libraryOpen}
            aria-label={libraryOpen ? "Close race library" : "Open race library"}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            <span className={styles.paneArrow} aria-hidden="true">
              {libraryOpen ? "‹" : "›"}
            </span>
            <span className={styles.paneLabel}>Races</span>
          </button>
        </div>
        <section
          id="race-library-panel"
          className={`${styles.drawerBody} ${styles.library}`}
          aria-labelledby="race-list-heading"
          hidden={!libraryOpen}
        >
          <h2 id="race-list-heading" className={styles.libraryHeading}>
            Race library
          </h2>
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-current={row.id === raceId ? "true" : undefined}
                  onClick={() => select(row.id)}
                >
                  <span className={styles.rowName}>{row.name}</span>
                  <span className={styles.rowMeta}>{`${row.venue} · ${row.dateLabel}`}</span>
                  <span className={styles.rowStats}>
                    <span>{`${row.boats} boats`}</span>
                    <span>
                      Winner <strong>{row.elapsed}</strong>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {/* The id the analyst's moment chips scroll to, same as on the story
          page, so a chip drives the viewer from either layout. */}
      <section
        id="replay-console"
        className={styles.console}
        aria-label="Race replay console"
        tabIndex={-1}
      >
        <LaylineApp
          key={raceId}
          venue={venue}
          autoplay="immediate"
          boot="sea"
          bootLabel={meta?.name}
        >
          {children}
        </LaylineApp>
      </section>

      <aside
        id="race-analyst"
        className={styles.analystPane}
        aria-label="Race debrief"
        tabIndex={-1}
      >
        <div className={styles.paneBar}>
          <button
            id="race-analyst-toggle"
            type="button"
            className={styles.paneToggle}
            aria-controls="race-debrief-panel"
            aria-expanded={analystOpen}
            aria-label={analystOpen ? "Close debrief" : "Open debrief"}
            onClick={() => {
              if (!analystOpen) setAnalystReady(true);
              setAnalystOpen((open) => !open);
            }}
          >
            <span className={styles.paneLabel}>Debrief</span>
            <span className={styles.paneArrow} aria-hidden="true">
              {analystOpen ? "›" : "‹"}
            </span>
          </button>
        </div>
        {/* Remounted with the race. Closing the drawer only hides it, so its
            thread stays intact. Changing races still aborts any answer for the
            race nobody is watching. */}
        <div
          id="race-debrief-panel"
          className={`${styles.drawerBody} ${styles.analyst}`}
          hidden={!analystOpen}
        >
          {analystOffline ? (
            <div className={styles.analystOffline}>
              <h2 className={styles.offlineHeading}>Debrief</h2>
              <p className={styles.offlineLine}>Analyst offline in this build</p>
              <p className={styles.offlineLine}>
                It answers when a model key or the mock mode is configured
              </p>
            </div>
          ) : mounted && analystReady ? (
            <AnalystSection key={raceId} variant="rail" />
          ) : (
            <div className={styles.analystHold} aria-hidden="true" />
          )}
        </div>
      </aside>
    </main>
  );
}
