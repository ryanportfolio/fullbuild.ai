"use client";

import { useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { NeutralToneMapping } from "three";
import type { RaceData } from "@/lib/layline/types";
import { renderStats, useReplay } from "../store";
import { BoatLabels } from "./BoatLabels";
import { BoatTracks } from "./BoatTracks";
import { CameraRigs } from "./CameraRigs";
import { CourseGraphics } from "./CourseGraphics";
import { Fleet } from "./Fleet";
import { SKY_HORIZON } from "./sky";
import { Water } from "./Water";
import { SkyDome } from "./SkyDome";
import { WakeTrails } from "./WakeTrails";

/* The clock lives here and nowhere else. Nothing outside a drawn frame moves
 * time, so a frozen page holds the instant it was frozen at. */
function Clock() {
  useFrame((state, delta) => {
    const replay = useReplay.getState();
    if (replay.playing && !replay.frozen) {
      replay.advance(Math.min(delta, 0.25) * replay.rate);
    }
    const render = state.gl.info.render;
    renderStats.drawCalls = render.calls;
    renderStats.triangles = render.triangles;
    if (!replay.webglOk) replay.setWebglOk(true);
  }, -100);
  return null;
}

/* On-demand rendering needs someone to ask for the frame, and only a change
 * that moves the picture may ask. Playing, rate, the ready flags and the freeze
 * itself all travel through this store too, and a frame drawn for one of those
 * is a frame nobody wanted: while the loop is running it is one more draw per
 * store write, and while it is frozen it breaks the promise that a held page
 * renders nothing at all. */
function DemandBridge() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(
    () =>
      useReplay.subscribe((state, previous) => {
        if (!state.frozen) return;
        if (
          state.t !== previous.t ||
          state.rig !== previous.rig ||
          state.mode !== previous.mode ||
          state.followId !== previous.followId
        ) {
          invalidate();
        }
      }),
    [invalidate],
  );
  return null;
}

export function LaylineScene({ race }: { race: RaceData }) {
  const frozen = useReplay((state) => state.frozen);

  /* The store is one per document and outlives every canvas mounted into it,
   * so leaving the flag set would let the next visit to this route pull the
   * chart down before its renderer had drawn anything, and leave a blank
   * console behind if the context never came back. The flag belongs to the
   * canvas that raised it and dies with it. */
  useEffect(() => () => useReplay.getState().setWebglOk(false), []);

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={frozen ? "demand" : "always"}
      camera={{ position: [44, 34, 76], fov: 40, near: 1, far: 12000 }}
      gl={{
        /* Multisampling is free here only because nothing post-processes the
         * frame: with no render target chain the default framebuffer can carry
         * MSAA. Adding an effect pass takes it away again. */
        antialias: true,
        powerPreference: "high-performance",
        /* Stated, never assumed. The default under this renderer is ACES
         * filmic, whose hue shift moves six team liveries that have to stay
         * recognisable; neutral rolls the sun highlight without touching them. */
        toneMapping: NeutralToneMapping,
        toneMappingExposure: 1.05,
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={[SKY_HORIZON]} />
      <SkyDome />
      <Water race={race} />
      <CourseGraphics race={race} />
      <Fleet race={race} />
      <WakeTrails race={race} />
      <BoatTracks race={race} />
      <CameraRigs race={race} />
      <BoatLabels race={race} />
      <Clock />
      <DemandBridge />
    </Canvas>
  );
}
