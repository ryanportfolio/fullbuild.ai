"use client";

import { Suspense, lazy, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { NeutralToneMapping } from "three";
import type { RaceData } from "@/lib/layline/types";
import { RACES } from "@/lib/layline/races";
import type { LayerVisibility } from "@/lib/layline/analysis-state";
import { renderStats, resetRenderStats, useReplay } from "../store";
import {
  requestSceneFrame,
  resetSceneGate,
  sceneGate,
  setFrozenFrameRequest,
} from "./gate";
import { BoatLabels } from "./BoatLabels";
import { BoatPicker } from "./BoatPicker";
import { BoatTracks } from "./BoatTracks";
import { CameraRigs } from "./CameraRigs";
import { CourseGraphics } from "./CourseGraphics";
import { CurrentField } from "./CurrentField";
import { Fleet } from "./Fleet";
import { GROUP_BOATS, GROUP_HUD, GROUP_WATER, setMaskRoot } from "./inspect";
import { SKY_HORIZON } from "./sky";
import { Water } from "./Water";
import { SkyDome } from "./SkyDome";
import { VenueShore } from "./VenueShore";
import {
  ERROR_LADDER,
  TIER_TABLE,
  readTilesTier,
  tilesQuality,
  type TilesTier,
} from "./venue-tiles-config";
import { WakeTrails } from "./WakeTrails";

/* The streamed venue is the only importer of `3d-tiles-renderer`, so it loads
 * lazily: without `?venue=tiles` the chunk is never even fetched, and the
 * baked page pays nothing for the toggle existing. */
const VenueTiles = lazy(() =>
  import("./VenueTiles").then((m) => ({ default: m.VenueTiles })),
);

/* And the same arrangement for the machine-generated venue, which is the only
 * importer of three's GLTF, Draco and KTX2 loaders and of the decoder binaries
 * under `public/prototype/layline/decoders/`: without `?venue=autogen` its
 * chunk is never fetched and no decoder is ever asked for. */
const VenueAutogen = lazy(() =>
  import("./VenueAutogen").then((m) => ({ default: m.VenueAutogen })),
);

/* Which venue the query string is asking for.
 *
 * `?venue=tiles` streams Google Photorealistic 3D Tiles instead of the baked
 * coast (spike, amendment 8) and `?venue=autogen` draws the machine-generated
 * glTF venue instead; anything else, including no parameter at all, keeps the
 * baked venue, and the two modes are values of one parameter so they cannot both
 * be asked for. Two knobs ride along for the spike's own captures:
 * `water=0` drops the replay's sea plane so the photogrammetry's own water is
 * what is judged, and `err=<px>` sets the tileset's screen-space error target.
 *
 * Read synchronously rather than in an effect: these components produce no DOM
 * of their own (they are R3F scene nodes, and the reconciler that draws them
 * only runs on the client), so there is no markup for the server and the
 * client to disagree about, and an effect would mount the baked venue for one
 * commit and start a fetch nobody wanted. */
export interface VenueMode {
  tiles: boolean;
  /* `?venue=autogen` draws the machine-generated glTF venue instead of the
   * hand-baked LVN coast. One value of one parameter, no knobs of its own: the
   * asset's own settings live in its manifest, not in the query string. */
  autogen: boolean;
  water: boolean;
  errorTarget: number | undefined;
  /* Ellipsoid height the tiles frame is pinned at, for re-measuring the sea
   * level the shipped constant was derived from: `sea=0` mounts the tileset
   * unshifted so a raycast reads the water's raw ellipsoid height. */
  seaLevel: number | undefined;
  /* Metres above the sea surface below which a flat tile fragment is dropped,
   * so a capture can sweep the clip on one page load; `seaclip=0` turns
   * Google's own water back on, which is the before arm of that A/B. */
  seaClip: number | undefined;
  /* `mask=0` turns the baked water mask off, which is the before arm of the
   * mask A/B: the clip falls back to its 0.8 m near-sea band everywhere.
   * `haze=<0..1>` is the distance haze, off unless asked for. The thresholds
   * behind both live on `__laylineTiles.setSeaMask/setSeaHaze` so a sweep costs
   * one page load rather than one billable session per value. */
  seaMask: number | undefined;
  seaHaze: number | undefined;
  /* Level-of-detail cross-fade in milliseconds; `fade=0` cuts instead, which
   * is the before arm of the pop-in A/B. */
  fadeMs: number | undefined;
  /* `flat=1` holds the replay sea on the tangent plane, the way the baked
   * venue has it, so the flooding the curve removes can be shot both ways. */
  flatSea: boolean;
  /* Streaming-shape overrides, so one knob can be measured at a time on one
   * page load: a reload would spend another billable Google session. */
  downloadJobs: number | undefined;
  parseJobs: number | undefined;
  nearFirst: boolean | undefined;
  movingTarget: number | undefined;
  reuseSession: boolean;
  /* Force a device tier instead of reading the connection. */
  tier: string | null;
  /* `gov=0` stops the governor walking the tileset's error ceiling, which is
   * the before arm of the interaction frame-time A/B. */
  governor: boolean;
  /* Frame-time miss threshold the governor works to. Capture-only, so its
   * ladder can be made to walk on a machine that never misses. */
  missMs: number | undefined;
  lit: boolean;
}

export function readVenueMode(search: string): VenueMode {
  const params = new URLSearchParams(search);
  const error = Number(params.get("err"));
  const sea = params.get("sea");
  const seaLevel = sea === null ? Number.NaN : Number(sea);
  const clip = params.get("seaclip");
  const seaClip = clip === null ? Number.NaN : Number(clip);
  const mask = params.get("mask");
  const seaMask = mask === null ? Number.NaN : Number(mask);
  const haze = params.get("haze");
  const seaHaze = haze === null ? Number.NaN : Number(haze);
  const fade = params.get("fade");
  const fadeMs = fade === null ? Number.NaN : Number(fade);
  const dl = Number(params.get("dl"));
  const parse = Number(params.get("parse"));
  const moving = params.get("moving");
  const movingTarget = moving === null ? Number.NaN : Number(moving);
  const near = params.get("near");
  const miss = Number(params.get("miss"));
  const water = params.get("water") !== "0";
  return {
    tiles: params.get("venue") === "tiles",
    autogen: params.get("venue") === "autogen",
    water,
    errorTarget: Number.isFinite(error) && error > 0 ? error : undefined,
    seaLevel: Number.isFinite(seaLevel) ? seaLevel : undefined,
    /* `water=0` exists to show Google's own sea; with the replay water gone
     * the clip and mask would discard that sea too and leave holes, so both
     * default OFF there. An explicit `seaclip=`/`mask=` still wins. */
    seaClip: Number.isFinite(seaClip) && seaClip >= 0 ? seaClip : water ? undefined : 0,
    seaMask: Number.isFinite(seaMask) && seaMask >= 0 ? seaMask : water ? undefined : 0,
    seaHaze: Number.isFinite(seaHaze) && seaHaze >= 0 ? seaHaze : undefined,
    fadeMs: Number.isFinite(fadeMs) && fadeMs >= 0 ? fadeMs : undefined,
    flatSea: params.get("flat") === "1",
    downloadJobs: Number.isFinite(dl) && dl > 0 ? dl : undefined,
    parseJobs: Number.isFinite(parse) && parse > 0 ? parse : undefined,
    nearFirst: near === null ? undefined : near !== "0",
    movingTarget: Number.isFinite(movingTarget) && movingTarget >= 0 ? movingTarget : undefined,
    reuseSession: params.get("tok") !== "0",
    tier: params.get("tier"),
    governor: params.get("gov") !== "0",
    missMs: Number.isFinite(miss) && miss > 0 ? miss : undefined,
    lit: params.get("tilesLit") === "1",
  };
}

const TILES_KEY = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";

/* The shared replay clock lives above the optional renderer so the SVG path
 * can play too. This frame gate settles whether the current scene frame is
 * drawn. The governor below and the render at the bottom both answer to that
 * one verdict rather than deciding for themselves, so a frame cannot be half
 * skipped: the governor must not resize a buffer nobody is about to fill. */
function Clock() {
  useFrame((state) => {
    const replay = useReplay.getState();
    /* A resized drawing buffer is a cleared drawing buffer, and the governor
     * resizes it from inside this same loop, so the comparison is made before
     * the verdict rather than after it. */
    const canvas = state.gl.domElement;
    if (canvas.width !== sceneGate.bufferWidth || canvas.height !== sceneGate.bufferHeight) {
      sceneGate.dirty = true;
    }

    /* Frozen is a capture, and a capture is always drawn: the hold only ever
     * asks for a frame when something wants one. An unready page draws too,
     * whatever else is true, because the chart, the docks and the intro are all
     * waiting on the first frame and 2D mode would otherwise be a state the
     * page could never leave after a lost context. */
    sceneGate.willRender =
      !sceneGate.contextLost &&
      (replay.frozen ||
        !replay.webglOk ||
        (sceneGate.onScreen &&
          sceneGate.pageVisible &&
          !replay.chart2d &&
          (replay.playing || sceneGate.dirty || sceneGate.chase > 0)));
  }, -100);
  return null;
}

/* A phone gets the same water as a desktop GPU, so quality follows measured
 * frame time instead of a device guess: a sustained miss walks the pixel ratio
 * down one rung, waits out a settle window, and looks again. It never walks
 * back up, because resolution that oscillates reads worse than resolution that
 * settles low. A machine already rendering at ratio 1 has no rungs below it
 * and the governor stands down. */
const DPR_LADDER = [1.5, 1.25, 1];
const MISS_MS = 22; // sustained EMA above this, ~45 fps, is a shed
/* And below this, ~85 fps, there is room to give detail back. Only the
 * tileset's error ceiling walks back up; the pixel ratio never does. */
const HEADROOM_MS = 11.5;
const EMA_GAIN = 0.05; // ~60-frame horizon
const SETTLE_FRAMES = 120; // shader warm-up at mount, resize churn after a shed

function QualityGovernor() {
  const setDpr = useThree((state) => state.setDpr);
  const gl = useThree((state) => state.gl);
  const rungs = useRef<number[] | null>(null);
  const tier = useRef<number | null>(null);
  const ema = useRef(1000 / 60);
  const settle = useRef(SETTLE_FRAMES);
  /* -1 is "no ceiling": whatever error target the tier asked for stands. */
  const errorRung = useRef(-1);
  useFrame((state, delta) => {
    if (rungs.current === null) rungs.current = DPR_LADDER.filter((v) => v < gl.getPixelRatio());
    if (useReplay.getState().frozen) return;
    /* Only frames that are actually drawn are evidence about how long a frame
     * takes, and only a drawn frame can afford a resize: setDpr clears the
     * buffer, and clearing one the gate is about to leave alone would blank a
     * canvas that is on screen. The settle window is reset on the way past, so
     * the reading that resumes playback is never the one that sheds. */
    if (!sceneGate.willRender) {
      settle.current = SETTLE_FRAMES;
      return;
    }
    /* Any Canvas re-render (freeze and thaw toggle the frameloop prop) re-runs
     * the reconfigure pass, which reapplies the dpr prop and lifts the ratio
     * back to the device value. The governor holds its tier and reasserts it
     * instead of spending settle windows earning the shed a second time. A
     * capture taken while frozen still gets the full-resolution frame. */
    if (tier.current !== null && gl.getPixelRatio() > tier.current) {
      setDpr(tier.current);
      settle.current = SETTLE_FRAMES;
      return;
    }
    const ms = delta * 1000;
    /* A background tab reports its whole absence as one delta; that is not a
     * slow frame, and the EMA restarts clean when the page comes back. */
    if (ms > 500) {
      settle.current = SETTLE_FRAMES;
      return;
    }
    if (settle.current > 0) {
      settle.current -= 1;
      return;
    }
    ema.current += (ms - ema.current) * EMA_GAIN;

    /* The second lever, and over the streamed venue it is the bigger one.
     *
     * Pixel ratio buys fill rate; the tileset's cost is draw calls, 430 to 510
     * a frame at error target 12 against 182 at 30. So in streamed mode the
     * governor walks the tileset's error ceiling as well, and walks it FIRST:
     * a coarser tileset is a cheaper frame at the same resolution, and the
     * shore is scenery behind the boats rather than the subject.
     *
     * It walks back down as well, which the pixel ratio deliberately never
     * does. Resolution that oscillates reads worse than resolution that settles
     * low; a tileset that sharpens again when the camera stops moving is the
     * behaviour a viewer wants, and `VenueTiles` treats this as a ceiling with
     * its own settle-sharpening working below it. */
    if (tilesQuality.active && tilesQuality.governor) {
      if (ema.current > tilesQuality.missMs && errorRung.current + 1 < ERROR_LADDER.length) {
        errorRung.current += 1;
        tilesQuality.ceiling = ERROR_LADDER[errorRung.current];
        ema.current = 1000 / 60;
        settle.current = SETTLE_FRAMES;
        return;
      }
      if (ema.current < Math.min(HEADROOM_MS, tilesQuality.missMs * 0.52) && errorRung.current >= 0) {
        errorRung.current -= 1;
        tilesQuality.ceiling = errorRung.current < 0 ? 0 : ERROR_LADDER[errorRung.current];
        ema.current = 1000 / 60;
        settle.current = SETTLE_FRAMES;
        return;
      }
    }

    if (rungs.current.length === 0) return;
    if (ema.current > MISS_MS) {
      tier.current = rungs.current.shift() as number;
      setDpr(tier.current);
      ema.current = 1000 / 60;
      settle.current = SETTLE_FRAMES;
    }
  }, -99);
  return null;
}

/* A held canvas draws only when it is told to, and only a change that moves
 * the picture may tell it. Playing, rate, the ready flags and the freeze itself
 * all travel through this store too, and a frame drawn for one of those is a
 * frame nobody wanted.
 *
 * The hold runs the loop at "never" rather than "demand": there is no request
 * queue to race, so a stray store write cannot slip a frame past the freeze,
 * and each drawn frame carries a stated delta instead of however long the
 * shutter took. The timestamp restarts at every freeze because the renderer
 * zeroes its own clock on the way in. */
const FROZEN_STEP = 1 / 60;

function DemandBridge() {
  const advance = useThree((state) => state.advance);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const frozen = useReplay((state) => state.frozen);
  const stamp = useRef(0);
  const holding = useRef(false);

  /* Entering the hold draws its first frame on the spot: nothing else is
   * going to, and the renderer zeroes its own clock on the way in, so the stamp
   * starts again with it and only with it. */
  useEffect(() => {
    if (!frozen) {
      holding.current = false;
      return;
    }
    if (!holding.current) stamp.current = 0;
    holding.current = true;
    stamp.current += FROZEN_STEP;
    advance(stamp.current);
  }, [frozen, advance]);

  /* A resized canvas is the one thing that moves the picture without going
   * through the store: it rewrites the camera aspect and the dock measurements
   * the rigs frame against, and the loop at "never" ignores the renderer's own
   * invalidation. It goes through the same door as the observers watching the
   * same layout change, so the one frame it costs is drawn after all of them
   * have measured. The first pass only records the box it opened at. */
  const box = useRef<string | null>(null);
  useEffect(() => {
    const seen = `${width}x${height}`;
    if (box.current === seen) return;
    const first = box.current === null;
    box.current = seen;
    if (first) return;
    requestSceneFrame();
  }, [frozen, width, height]);

  /* The only way into a renderer that is holding still, handed to the gate so
   * a font landing, a dock resize, a restored tab or a recovered context can
   * still reach the screen while the clock is held. R3F ignores invalidate()
   * at "never", so a flag on its own would never be read. */
  useEffect(() => {
    if (!frozen) {
      setFrozenFrameRequest(null);
      return;
    }
    setFrozenFrameRequest(() => {
      stamp.current += FROZEN_STEP;
      advance(stamp.current);
    });
    return () => setFrozenFrameRequest(null);
  }, [frozen, advance]);

  useEffect(
    () =>
      useReplay.subscribe((state, previous) => {
        if (!state.frozen) return;
        if (
          state.raceId !== previous.raceId ||
          state.t !== previous.t ||
          state.rig !== previous.rig ||
          state.mode !== previous.mode ||
          state.followId !== previous.followId ||
          state.truthMode !== previous.truthMode
        ) {
          stamp.current += FROZEN_STEP;
          advance(stamp.current);
        }
      }),
    [advance],
  );
  return null;
}

/* Wakes the canvas before it reaches the viewport rather than as it arrives:
 * an observer reports after the compositor has already been handed a frame, so
 * a fast scroll would otherwise show one stale picture. */
const PREWARM = "200px";

/**
 * The render, taken out of the loop's hands.
 *
 * A positive priority switches R3F's own rendering off for this canvas and
 * makes this the last subscriber to run, so every pass above has posed the
 * scene by the time the verdict taken at the top of the frame is spent here.
 * Only the drawing is skipped: the clock, the poses and the plates all keep
 * running, so a held frame is one nobody could see rather than one nobody
 * built.
 */
function RenderGate() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries[0]?.isIntersecting === true;
        if (seen && !sceneGate.onScreen) requestSceneFrame();
        sceneGate.onScreen = seen;
      },
      { rootMargin: PREWARM },
    );
    observer.observe(canvas);
    /* The same question without the margin, for the one caller that has to know
     * whether the replay is really on screen rather than nearly on it. */
    const inView = new IntersectionObserver((entries) => {
      sceneGate.inView = entries[0]?.isIntersecting === true;
    });
    inView.observe(canvas);
    return () => {
      observer.disconnect();
      inView.disconnect();
      sceneGate.onScreen = true;
      sceneGate.inView = true;
    };
  }, [gl]);

  /* Everything that moves the picture without going through the store or the
   * canvas box. A restored tab can come back to a discarded buffer and a
   * recovered context comes back to nothing at all; three.js owns the recovery
   * itself, so the page only has to stop drawing into a dead context and ask
   * for one frame once it is alive again. */
  useEffect(() => {
    const canvas = gl.domElement;
    const onVisibility = () => {
      sceneGate.pageVisible = !document.hidden;
      if (sceneGate.pageVisible) requestSceneFrame();
    };
    const onShow = () => requestSceneFrame();
    const onLost = () => {
      sceneGate.contextLost = true;
      useReplay.getState().setWebglOk(false);
    };
    const onRestored = () => {
      sceneGate.contextLost = false;
      requestSceneFrame();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onShow);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    /* Plate metrics move when the display face lands. */
    void document.fonts?.ready.then(requestSceneFrame).catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onShow);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl]);

  /* Only the fields that move the picture. The ready flags travel through this
   * store too, and one of them is written by the render below: dirtying the
   * frame that has just been drawn would cost a second frame for nothing. */
  useEffect(
    () =>
      useReplay.subscribe((state, previous) => {
        if (
          /* The race the picture is of. The viewer is not remounted when it
           * changes, so nothing else here would say the boats had all moved. */
          state.raceId !== previous.raceId ||
          state.t !== previous.t ||
          state.rig !== previous.rig ||
          state.mode !== previous.mode ||
          state.followId !== previous.followId ||
          state.truthMode !== previous.truthMode ||
          state.chart2d !== previous.chart2d ||
          state.playing !== previous.playing ||
          state.frozen !== previous.frozen ||
          state.reducedMotion !== previous.reducedMotion
        ) {
          sceneGate.dirty = true;
        }
      }),
    [],
  );

  useFrame((state) => {
    if (!sceneGate.willRender) return;
    /* three.js returns from render() without drawing while the context is
     * lost, so the picture would be marked laid down when it was not. */
    const context = state.gl.getContext();
    if (context !== null && context.isContextLost()) return;

    state.gl.render(state.scene, state.camera);

    const canvas = state.gl.domElement;
    sceneGate.bufferWidth = canvas.width;
    sceneGate.bufferHeight = canvas.height;

    /* A change owes one more frame, because the passes above are a frame
     * behind the camera and the picture that stays on screen has to be the one
     * playback would have settled on. The capture hold is exempt: it draws
     * exactly the frame it asked for, which is the contract every reference
     * shot on this page was taken under. */
    const replay = useReplay.getState();
    if (sceneGate.dirty) {
      sceneGate.dirty = false;
      sceneGate.chase = replay.frozen ? 0 : 1;
    } else if (sceneGate.chase > 0) {
      sceneGate.chase -= 1;
    }

    /* Stamped with the instant this frame was drawn at, because the clock
     * runs whether or not the picture does: reading a live t next to the cost
     * of a frame drawn seconds ago would describe a picture nobody has seen. */
    const drawn = state.gl.info.render;
    renderStats.drawCalls = drawn.calls;
    renderStats.triangles = drawn.triangles;
    renderStats.frames += 1;
    renderStats.drawnAt = replay.t;

    /* Raised here and nowhere else: the flag says a frame is on screen, and
     * this is the only line that knows one is. The intro drops its cover on
     * it. */
    if (!replay.webglOk) replay.setWebglOk(true);
  }, 1);

  return null;
}

/* Hands the scene graph to the inspection mask, so `__layline.show` can write
 * visibility onto the named groups without a React render. Mounted outside
 * production only; with no root installed the mask is inert and applying it
 * does nothing. */
function InspectBridge() {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    setMaskRoot(scene);
    return () => setMaskRoot(null);
  }, [scene]);
  return null;
}

export function LaylineScene({
  race,
  layers,
}: {
  race: RaceData;
  layers: LayerVisibility;
}) {
  const frozen = useReplay((state) => state.frozen);
  /* Which venue this race sails in, by the seed the data itself carries: the
   * viewer is not remounted on a race switch, so the shore has to follow the
   * race prop rather than anything read once at mount. */
  const scenery = RACES.find((meta) => meta.seed === race.seed)?.scenery;
  const venue = useRef<VenueMode | null>(null);
  const tier = useRef<TilesTier | null>(null);
  if (venue.current === null) {
    venue.current = readVenueMode(typeof window === "undefined" ? "" : window.location.search);
  }
  if (tier.current === null) {
    /* What this machine and this connection can afford, read once at mount.
     * Independent of the pixel-ratio governor below: that walks the render
     * resolution against measured frame time and is a closed loop, this decides
     * how much geometry to ask Google for and never changes after mount. */
    const measured = readTilesTier();
    const forced = venue.current.tier;
    tier.current =
      forced === "lean" || forced === "base" || forced === "fast"
        ? { ...measured, ...TIER_TABLE[forced], name: forced }
        : measured;
    tilesQuality.governor = venue.current.governor;
    tilesQuality.missMs = venue.current.missMs ?? MISS_MS;
  }
  /* Streamed mode needs a key and a venue race to be georeferenced against;
   * without either it falls back to the baked coast rather than drawing an
   * empty harbour. */
  const streamed = venue.current.tiles && TILES_KEY !== "" && scenery !== undefined;
  if (venue.current.tiles && !streamed && typeof window !== "undefined") {
    /* Said out loud, because the alternative is a capture of the baked coast
     * filed as a photoreal one. */
    console.warn(
      TILES_KEY === ""
        ? "?venue=tiles asked for streamed tiles but NEXT_PUBLIC_MAP_TILES_KEY is empty; drawing the baked venue"
        : "?venue=tiles asked for streamed tiles but this race has no georeferenced venue; drawing the procedural shore",
    );
  }
  /* The machine-generated venue is placed against the race's own anchor and
   * refuses a manifest that carries a different one, so a race with no
   * georeferenced venue has nothing to check against and keeps the coast it
   * already had. */
  const autogenOrigin =
    venue.current.autogen && scenery !== undefined ? scenery.origin : null;
  if (venue.current.autogen && autogenOrigin === null && typeof window !== "undefined") {
    console.warn(
      "?venue=autogen asked for the machine-generated venue but this race has no georeferenced venue; drawing the procedural shore",
    );
  }

  /* The lazy venue chunk resolves only after this component's first commit,
   * and the store boots at "absent", which `captureReady` counts as ready
   * because a race with no venue is legitimately ready with none. A capture
   * started in that window would file an empty harbour as a finished frame,
   * so the mode marks the venue loading before its chunk exists; the mounted
   * module's own effect takes the state over from there (round-3 codex P1,
   * which also applied to the streamed mode). */
  useEffect(() => {
    if ((streamed || autogenOrigin !== null) && useReplay.getState().venueAsset === "absent") {
      useReplay.getState().setVenueAsset("loading");
    }
  }, [streamed, autogenOrigin]);

  /* The gate is one per document and outlives every canvas mounted into it,
   * same as the ready flag below. A lost context or a scrolled-away observer
   * left behind by the last visit would keep this one dark, so the record goes
   * back to its opening state before the first frame is asked for. */
  const opened = useRef(false);
  if (!opened.current) {
    opened.current = true;
    resetSceneGate();
    resetRenderStats();
  }

  /* The store is one per document and outlives every canvas mounted into it,
   * so leaving the flag set would let the next visit to this route pull the
   * chart down before its renderer had drawn anything, and leave a blank
   * console behind if the context never came back. The flag belongs to the
   * canvas that raised it and dies with it. */
  useEffect(
    () => () => {
      useReplay.getState().setWebglOk(false);
      resetSceneGate();
      resetRenderStats();
    },
    [],
  );

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={frozen ? "never" : "always"}
      /* far 16,000, not the 12,000 this shipped with, because the freeform pan
       * is now bounded at 2,500 m from the followed boat rather than unbounded:
       * inside that bound the eye can stand 3,700 m from the course origin and
       * the venue's terrain reaches 10,500 m the other way, so 12,000 would clip
       * real coast. Depth resolution is `z^2 (f - n) / (f n 2^24)` and near is
       * 1, so moving far from 12,000 to 16,000 costs 0.002 per cent of it. */
      camera={{ position: [44, 34, 76], fov: 40, near: 1, far: 16000 }}
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
      <SkyDome proceduralShore={scenery === undefined && !streamed} />
      {/* One venue or the other, never both: they draw the same harbour and
          the baked coast would z-fight the photogrammetry. */}
      {streamed ? (
        /* `fallback={null}`: while the lazy chunk loads, the venue tri-state
         * already reports `loading`, so readiness stays honest with no mesh. */
        <Suspense fallback={null}>
          <VenueTiles
            apiKey={TILES_KEY}
            errorTarget={venue.current.errorTarget ?? tier.current.errorTarget}
            seaLevel={venue.current.seaLevel}
            seaClip={venue.current.seaClip}
            seaMask={venue.current.seaMask}
            seaHaze={venue.current.seaHaze}
            fadeMs={venue.current.fadeMs}
            downloadJobs={venue.current.downloadJobs ?? tier.current.downloadJobs}
            parseJobs={venue.current.parseJobs ?? tier.current.parseJobs}
            nearFirst={venue.current.nearFirst}
            lruMax={tier.current.lruMax}
            movingTarget={venue.current.movingTarget}
            reuseSession={venue.current.reuseSession}
            tierName={tier.current.name}
            lit={venue.current.lit}
          />
        </Suspense>
      ) : autogenOrigin !== null ? (
        /* Same `fallback={null}` reasoning as the streamed venue: while the
           lazy chunk loads the venue tri-state already reports `loading`, so
           readiness stays honest with no mesh on screen. */
        <Suspense fallback={null}>
          <VenueAutogen origin={autogenOrigin} />
        </Suspense>
      ) : (
        scenery !== undefined && <VenueShore asset={scenery.asset} />
      )}
      {/* Three named groups, so a capture can take the race out of the picture
          and leave the venue in it (`__layline.show`, dev only). They are plain
          identity transforms: nothing under them moves, renderOrder is stated
          per mesh and unaffected by depth, and `getObjectByName` is recursive,
          so the label and picker lookups still find their anchors. */}
      <group name={GROUP_WATER}>
        {/* `?water=0` (streamed mode only) leaves the sea to the
            photogrammetry, which is one of the two things the spike is
            comparing.

            `curved` only over the streamed venue: the baked course frame is a
            plane by construction and its coast was baked into it, so a curved
            sea there would sink away from its own shoreline. The streamed
            tileset is ECEF laid on a tangent plane, where a flat sea stands
            metres above the real one at range and drowns every low shore
            (Water.tsx, SEA_GLSL). */}
        {(venue.current.water || !streamed) && (
          <Water race={race} curved={streamed && !venue.current.flatSea} />
        )}
      </group>
      <group name={GROUP_HUD}>
        <CurrentField race={race} visible={layers.current} />
        <CourseGraphics race={race} showLaylines={layers.laylines} />
        <BoatTracks
          race={race}
          showTracks={layers.tracks}
          showRawFixes={layers["raw-fixes"]}
        />
      </group>
      <group name={GROUP_BOATS}>
        <Fleet race={race} />
        <WakeTrails race={race} />
      </group>
      <CameraRigs race={race} />
      <BoatLabels race={race} />
      <BoatPicker race={race} />
      <Clock />
      <QualityGovernor />
      <DemandBridge />
      <RenderGate />
      {process.env.NODE_ENV !== "production" && <InspectBridge />}
    </Canvas>
  );
}
