"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, type ReactNode } from "react";
import styles from "@/app/prototype/layline/layline.module.css";
import { CaptureBridge } from "./CaptureBridge";
import { Instruments } from "./hud/Instruments";
import { Standings } from "./hud/Standings";
import { Timeline } from "./hud/Timeline";
import { TopBar } from "./hud/TopBar";
import { Transport } from "./hud/Transport";
import { AUTOPLAY_FROM, raceData, useReplay } from "./store";

/* WebGL cannot render on the server, and the loading state has nothing to add:
 * the server-rendered chart is already on screen in the layer above and stays
 * there until the renderer has a real frame to replace it with. */
const SceneIsland = dynamic(() => import("./scene/LaylineScene").then((m) => m.LaylineScene), {
  ssr: false,
  loading: () => null,
});

export function LaylineApp({ children }: { children: ReactNode }) {
  const race = useMemo(() => raceData(), []);
  const live = useReplay((state) => state.webglOk);

  /* Read once at mount. A visitor who has asked for less motion gets the
   * replay paused at a mid-beat moment with everything reachable by hand,
   * never a still frame of an empty start line and never an autoplay. */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const replay = useReplay.getState();
    replay.setReducedMotion(reduced);
    replay.setHudReady(true);
    if (reduced) return;
    replay.seek(AUTOPLAY_FROM);
    replay.play();
  }, []);

  return (
    <div className={styles.stage}>
      <div className={styles.canvasLayer}>
        <SceneIsland race={race} />
      </div>

      <TopBar race={race} />

      {/* Instruments describe a scene. Until there is one, the docks stay out
          of the way of the chart that is standing in for it. */}
      <div className={styles.dockLeft} data-dock="standings">
        {live ? <Standings race={race} /> : null}
      </div>
      <div className={styles.dockRight} data-dock="instruments">
        {live ? <Instruments race={race} /> : null}
      </div>
      <div className={styles.dockBottom} data-dock="transport">
        {live ? (
          <div className={styles.panel}>
            <Transport />
            <Timeline race={race} />
          </div>
        ) : null}
      </div>

      {live ? null : <div className={styles.fallbackLayer}>{children}</div>}

      <CaptureBridge />
    </div>
  );
}
