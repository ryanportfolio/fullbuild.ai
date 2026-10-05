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
import {
  applyShowMask,
  lens,
  resetShowMask,
  setLens,
  setShowMask,
  showMask,
  type LensPlacement,
  type ShowRequest,
} from "./scene/inspect";
import type { VenueAssetState } from "./store";
import type { ReplayMode, RigName } from "@/lib/layline/types";

/**
 * What `ready` means, in one place two call sites share.
 *
 * A frame on screen AND the venue coast drawn, if the race has one. `loading`
 * is the only venue state that holds it down, and it covers a fetched asset
 * that has not yet been through a draw as well as one still in flight: a
 * capture taken between the parse and the first venue frame is a screenshot of
 * a coastless Long Beach that claims to be ready. `failed` does not hold it
 * down, because the procedural arc goes up in the venue's place and that is a
 * finished picture; neither does `absent`, which is every race with no baked
 * coast at all.
 */
export function captureReady(state: { webglOk: boolean; venueAsset: VenueAssetState }): boolean {
  /* `failed` is a promise of a fallback coast that has not been drawn yet; a
   * capture taken there would contain neither coast. Readiness waits for the
   * fallback's own drawn frame (`fallback`), same rule as the real mesh. */
  return state.webglOk && state.venueAsset !== "loading" && state.venueAsset !== "failed";
}

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
  /* Where the inspection lens is standing and what the scene is showing.
   * Present outside production only, alongside the two calls that write them,
   * so a capture script can assert per pose that the pose it asked for is the
   * pose the next frame renders from. */
  lens?: LensReadback;
  show?: ShowReadback;
}

export interface LensReadback {
  active: boolean;
  /* eye */
  x: number;
  y: number;
  z: number;
  /* aim */
  lookAt: [number, number, number];
  fov: number;
}

export interface ShowReadback {
  boats: boolean;
  water: boolean;
  hud: boolean;
  /* null means every venue layer is drawn. */
  venueLayers: number[] | null;
}

export interface CameraPose {
  yaw?: number;
  pitch?: number;
  dist?: number;
}

export interface LaylineCapture {
  /* False until the renderer has actually put a frame up and the venue's
   * baked coast, if the race has one, has drawn one of its own. A capture that
   * starts before this is a screenshot of a loading state. */
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
  /* Stand the camera at an arbitrary world point looking at another, with no
   * clamp on range, height or pitch, and lens(null) to hand the camera back to
   * the rigs. Capture-only: nothing on the page can reach it, and the
   * visitor's own camera state is never written, so the restore is exact.
   * Present outside production only. */
  lens?: (placement: LensPlacement | null) => void;
  /* Draw or drop whole parts of the scene: the boats, the water, the race
   * overlay, and the venue's layers by class id. Visibility only, so nothing
   * unmounts and nothing reflows, and it composes with ui(false). Present
   * outside production only. */
  show?: (request: ShowRequest) => void;
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
 *
 * Two doors are the exception. `lens()` stands the camera outside every limit
 * the pointer obeys and `show()` takes parts of the scene out of the picture:
 * both exist to inspect how the venue is built, neither is anything a visitor
 * should be able to reach, and both are compiled out of a production build
 * along with the `info()` fields that read them back.
 */
export function CaptureBridge() {
  useEffect(() => {
    const store = useReplay;
    const api: LaylineCapture = {
      ready: captureReady(store.getState()),
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
      info: () => {
        const reading: CaptureInfo = {
          t: store.getState().t,
          drawnAt: renderStats.drawnAt,
          drawCalls: renderStats.drawCalls,
          triangles: renderStats.triangles,
          frames: renderStats.frames,
          yaw: freeform.yaw,
          pitch: freeform.pitch,
          dist: freeform.dist,
        };
        if (process.env.NODE_ENV !== "production") {
          reading.lens = {
            active: lens.active,
            x: lens.ex,
            y: lens.ey,
            z: lens.ez,
            lookAt: [lens.ax, lens.ay, lens.az],
            fov: lens.fov,
          };
          reading.show = {
            boats: showMask.boats,
            water: showMask.water,
            hud: showMask.hud,
            venueLayers: showMask.venueLayers === null ? null : [...showMask.venueLayers],
          };
        }
        return reading;
      },
    };
    if (process.env.NODE_ENV !== "production") {
      /* The two inspection doors. Both draw through the gate rather than
       * trusting the loop: async scenery on a paused replay never reaches the
       * screen on its own, and a frozen canvas has no next frame to read a
       * dirty flag. */
      api.lens = (placement) => {
        setLens(placement);
        requestSceneFrame();
      };
      api.show = (request) => {
        setShowMask(request);
        applyShowMask();
        requestSceneFrame();
      };
    }
    window.__layline = api;
    const unsubscribe = store.subscribe((state) => {
      api.ready = captureReady(state);
    });
    return () => {
      unsubscribe();
      if (process.env.NODE_ENV !== "production") {
        /* Both inspection states are module scope and outlive this component,
         * so leaving them set would hand the next visit a camera it has no
         * door to put down and a scene missing whatever the last capture
         * hid. */
        setLens(null);
        resetShowMask();
        applyShowMask();
      }
      if (window.__layline === api) delete window.__layline;
    };
  }, []);

  return null;
}
