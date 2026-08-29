"use client";

import { useEffect } from "react";
import { renderStats, useReplay } from "./store";
import {
  DIST_MAX,
  DIST_MIN,
  PITCH_MAX,
  PITCH_MIN,
  clamp,
  freeform,
} from "./scene/interaction";
import { requestSceneFrame } from "./scene/gate";
import type { ReplayMode, RigName } from "@/lib/layline/types";

export interface CaptureInfo {
  t: number;
  /* The replay time the last drawn frame was drawn at. Equal to t whenever the
   * page is drawing, which the capture hold guarantees; behind it while the
   * gate is holding, where the clock still runs and the picture does not. The
   * counts below describe that frame, not t. */
  drawnAt: number;
  drawCalls: number;
  triangles: number;
  /* Frames the renderer has actually drawn since this canvas came up. Held
   * either side of an action, it says whether anything was drawn for that
   * action, which a screenshot of a settled page cannot. */
  frames: number;
  /* The freeform orbit pose the next frame will render from. Read back after
   * camera() to prove a requested pose actually took. */
  yaw: number;
  pitch: number;
  dist: number;
}

export interface CameraPose {
  yaw?: number;
  pitch?: number;
  dist?: number;
}

export interface LaylineCapture {
  /* False until the renderer has actually put a frame up and the venue's
   * baked coast, if the race has one, has landed. A capture that starts
   * before this is a screenshot of a loading state. */
  ready: boolean;
  freeze: () => void;
  thaw: () => void;
  step: (ms: number) => void;
  seek: (seconds: number) => void;
  rig: (name: RigName) => void;
  follow: (boatId: string) => void;
  mode: (mode: ReplayMode) => void;
  /* Set the freeform orbit pose directly, no pointer synthesis. Values are
   * clamped to the same limits the pointer obeys, so a capture cannot stand
   * anywhere a hand cannot. Switches to the freeform rig if needed and draws
   * a frame even while frozen. */
  camera: (pose: CameraPose) => void;
  /* ui(false) hides every DOM element except the canvases (visibility, not
   * display, so nothing reflows and the scene keeps its exact size) for
   * clean environment captures; ui(true) restores. */
  ui: (show: boolean) => void;
  info: () => CaptureInfo;
}

declare global {
  interface Window {
    __layline?: LaylineCapture;
  }
}

/**
 * The determinism contract for every frame anyone captures off this page.
 * Freeze holds the clock and drops the canvas to on-demand rendering, step
 * moves the clock by an exact number of milliseconds and draws exactly one
 * frame, and info reports the time that frame was drawn at alongside what it
 * cost. Two runs asking for the same time get the same picture.
 *
 * It ships in production builds as well as development. A capture tool that
 * only works against a dev server can only ever verify a dev server.
 */
export function CaptureBridge() {
  useEffect(() => {
    const store = useReplay;
    const api: LaylineCapture = {
      /* A frame on screen AND the venue coast in, if the race has one: ready
       * promises the picture is not a loading state, and the shore mesh is the
       * scene's one asynchronous load. */
      ready: store.getState().webglOk && store.getState().sceneryOk,
      freeze: () => store.getState().freeze(),
      thaw: () => store.getState().thaw(),
      step: (ms) => {
        const state = store.getState();
        state.seek(state.t + ms / 1000);
      },
      seek: (seconds) => store.getState().seek(seconds),
      rig: (name) => store.getState().setRig(name),
      follow: (boatId) => store.getState().follow(boatId),
      mode: (mode) => store.getState().setMode(mode),
      camera: (pose) => {
        const state = store.getState();
        if (state.rig !== "freeform") state.setRig("freeform");
        if (pose.yaw !== undefined) freeform.yaw = pose.yaw;
        if (pose.pitch !== undefined) {
          freeform.pitch = clamp(pose.pitch, PITCH_MIN, PITCH_MAX);
        }
        if (pose.dist !== undefined) {
          freeform.dist = clamp(pose.dist, DIST_MIN, DIST_MAX);
        }
        /* A framing move in flight would keep easing the centre and range
         * after this returns; the pose asked for is the pose delivered. */
        freeform.left = 0;
        freeform.pending = null;
        freeform.retarget = false;
        requestSceneFrame();
      },
      ui: (show) => {
        const root = document.documentElement;
        if (show) {
          delete root.dataset.laylineBare;
        } else {
          root.dataset.laylineBare = "true";
          if (document.getElementById("layline-bare-style") === null) {
            const style = document.createElement("style");
            style.id = "layline-bare-style";
            style.textContent = [
              /* visibility, not display: the layout must not reflow, so the
               * scene canvas keeps the exact size a framed capture expects.
               * A canvas turns itself back visible under hidden ancestors;
               * HUD-owned canvases (the dock strips) stay hidden. */
              "html[data-layline-bare] body *:not(canvas){visibility:hidden !important;}",
              "html[data-layline-bare] canvas{visibility:visible !important;}",
              "html[data-layline-bare] [data-dock] canvas{visibility:hidden !important;}",
            ].join("\n");
            document.head.appendChild(style);
          }
        }
        requestSceneFrame();
      },
      info: () => ({
        t: store.getState().t,
        drawnAt: renderStats.drawnAt,
        drawCalls: renderStats.drawCalls,
        triangles: renderStats.triangles,
        frames: renderStats.frames,
        yaw: freeform.yaw,
        pitch: freeform.pitch,
        dist: freeform.dist,
      }),
    };
    window.__layline = api;
    const unsubscribe = store.subscribe((state) => {
      api.ready = state.webglOk && state.sceneryOk;
    });
    return () => {
      unsubscribe();
      if (window.__layline === api) delete window.__layline;
    };
  }, []);

  return null;
}
