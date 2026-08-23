"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  briefFacts,
  prestartFrame,
  prestartTracks,
  prestartTwdSeries,
  scaleStep,
  twdBand,
  twdSwing,
  windReading,
  windReadingAt,
  type BriefFacts,
  type PrestartFrame,
  type PrestartTrack,
  type WindReading,
} from "@/lib/layline/brief";
import { clock, knots, meters } from "@/lib/layline/format";
import { poseAt } from "@/lib/layline/interpolate";
import type { Pose, RaceData } from "@/lib/layline/types";
import styles from "./bootSea.module.css";
import { lengthAt, toPath } from "./svg/chartFrame";
import { AUTOPLAY_FROM, OPEN_AT, useReplay } from "./store";

/**
 * The race brief: what the boot cover shows while the renderer warms.
 *
 * It is one chart. The last ten seconds before the gun, drawn once from above
 * at true scale in metres: the line, the six approach tracks the fleet sails
 * onto it, and the breeze lying across the course deciding which end pays. The
 * readings sit around that drawing rather than beside it in boxes of their own,
 * because the bias figure is computed from the wind, which is computed against
 * the line, and a panel boundary would have claimed the three were separate
 * subjects.
 *
 * Every figure comes out of the same RaceData the replay is about to play,
 * through the same evaluators the instrument dock and the course chart read, so
 * nothing here can disagree with the race behind it. See lib/layline/brief.ts
 * for where each one is read from. Nothing is drawn that the feed does not
 * hold: no flags, no gun sequence, no hull drawn to a length the feed has no
 * opinion about, and no finish order, which would spoil the race this layer is
 * gating.
 *
 * The brief is a gate as well as a picture. Continue, or Enter, releases it,
 * and the replay's autoplay waits on that release rather than running the
 * prestart off behind a cover.
 *
 * It writes its live readings straight into the DOM off one loop, the way the
 * instrument dock does: a countdown that re-rendered a fleet list sixty times
 * a second would cost more than it reports.
 */

/* One turn of the prestart, in wall-clock ms. The prestart itself is ten race
 * seconds; nine wall seconds is slow enough that the fleet reads as boats
 * rather than as a sweep. */
const PRESTART_LOOP_MS = 9000;

/* Seconds between samples along an approach track. Four a second is the rate
 * the feed publishes fixes at, so the drawn curve is the fixes and not a
 * smoothing of them. */
const TRACK_STEP = 0.25;

/* Points in the direction strip. Twelve a second across the prestart, which
 * draws the curve between the 1 Hz wind samples rather than the samples. */
const TWD_STEPS = 120;

/* Metres of gain to windward between ladder rungs. A drawing constant: the
 * spacing is a grid the reader counts, not a reading, which is why it is never
 * labelled with a number. The pool is how many rungs the drawing is willing to
 * hold, comfortably past the ten or so its own diagonal can show. */
const RUNG_SPACING = 10;
const RUNG_SLOTS = 16;

/* The drawing box's aspect on the wide branch, used for the frame the server
 * renders. The layout effect measures the box before the first paint and
 * refits, so a narrower window never shows the wide frame. */
const PLOT_ASPECT = 3.44;

/* Every symbol on the chart is drawn at a size in pixels and scaled back into
 * metres by the measured metres per pixel, because a symbol sized in metres is
 * a claim about how big the thing is. RaceData holds no hull length, so no
 * hull may be drawn to one. */
const HULL = "M 0 -3.6 L 2.3 3 L 0 1.6 L -2.3 3 Z";
const WIND_SHAFT = { x1: 0, y1: -13, x2: 0, y2: 5 };
const WIND_HEAD = "0,10 -3,3.4 3,3.4";
const PIN_R = 3.4;
const BOAT_MARK = "M 0 -3.2 L 5 -3.2 L 5 3.2 L 0 3.2 Z";
const FAV_MARK = "0,-3 -3.2,-9 3.2,-9";
const LABEL_PX = 9;

/* The strip's own drawing height, user units. Its width is the measured pixel
 * width of the band, so the trace is plotted one unit to the pixel and the
 * moving dot stays a circle instead of stretching into an ellipse. */
const STRIP_H = 20;
const STRIP_W = 600;

function signed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return value >= 0 && !text.startsWith("-") ? `+${text}` : text;
}

function setText(node: { textContent: string | null } | null, text: string): void {
  if (node !== null && node.textContent !== text) node.textContent = text;
}

function setAttr(node: Element | null, name: string, value: string): void {
  if (node !== null && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

function endLabel(favored: WindReading["favored"]): string {
  return favored === "pin" ? "pin" : favored === "boat" ? "committee boat" : "square";
}

function newPose(): Pose {
  return { x: 0, y: 0, hdg: 0, heel: 0, twa: 0, sog: 0, cog: 0, kite: 0 };
}

interface Rung {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The ladder the fleet is climbing: contours of equal gain to windward, ten
 * metres apart, turned by the breeze and trimmed to the drawing's own edges.
 *
 * Trimmed here rather than left to the SVG viewport, which would clip them on
 * screen but not in the DOM: a line drawn off the chart still reports its full
 * width to getBoundingClientRect, and check 4 of .tmp/verify.mjs reads exactly
 * that to prove nothing on the layer overflows the cover. Twelve rungs running
 * two hundred metres each failed it while being invisible.
 *
 * The gain of a screen point is `x sin twd - y cos twd`, which is zero along
 * the line's own middle and rises up the beat. The rung of gain g is the line
 * through `g (sin twd, -cos twd)` along `(cos twd, sin twd)`, and Liang-Barsky
 * cuts it to the frame.
 */
function rungSegments(frame: PrestartFrame, twdDeg: number): Rung[] {
  const a = (twdDeg * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const left = frame.x;
  const right = frame.x + frame.w;
  const top = frame.y;
  const bottom = frame.y + frame.h;

  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]) {
    const gain = x * sin - y * cos;
    if (gain < lo) lo = gain;
    if (gain > hi) hi = gain;
  }

  const out: Rung[] = [];
  const first = Math.ceil(lo / RUNG_SPACING) * RUNG_SPACING;
  for (let gain = first; gain <= hi && out.length < RUNG_SLOTS; gain += RUNG_SPACING) {
    const px = gain * sin;
    const py = -gain * cos;
    let enter = -Infinity;
    let leave = Infinity;
    let crosses = true;
    for (const [slope, room] of [
      [-cos, px - left],
      [cos, right - px],
      [-sin, py - top],
      [sin, bottom - py],
    ]) {
      if (Math.abs(slope) < 1e-9) {
        if (room < 0) crosses = false;
        continue;
      }
      const at = room / slope;
      if (slope < 0) {
        if (at > enter) enter = at;
      } else if (at < leave) leave = at;
    }
    if (!crosses || enter >= leave) continue;
    out.push({
      x1: px + enter * cos,
      y1: py + enter * sin,
      x2: px + leave * cos,
      y2: py + leave * sin,
    });
  }
  return out;
}

/**
 * The sliver of water the favored end has already won: the triangle between
 * the line's favored half and the rung through the line's middle.
 *
 * The third corner is the favored end dropped onto that rung. With the end at
 * (e, 0) and the wind at twd, its gain is `e * sin twd` and the foot of the
 * perpendicular is `(e cos^2 twd, -e cos twd sin twd)` in course metres, which
 * is the screen's `(e cos^2 twd, e cos twd sin twd)` once y is negated. The
 * depth of the wedge is the bias in metres, drawn at the scale the bar states.
 */
function wedgePoints(endX: number, twdDeg: number): string {
  const a = (twdDeg * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const fx = endX * cos * cos;
  const fy = endX * sin * cos;
  return `0,0 ${endX.toFixed(2)},0 ${fx.toFixed(2)},${fy.toFixed(2)}`;
}

export function RaceBrief({
  race,
  name,
  venue,
  dateLabel,
  live,
  reduced,
}: {
  race: RaceData;
  name: string;
  venue: string;
  dateLabel: string;
  /** True once the renderer has a frame up. Only the status line reads it. */
  live: boolean;
  reduced: boolean;
}) {
  const facts: BriefFacts = useMemo(() => briefFacts(race), [race]);
  const tracks: PrestartTrack[] = useMemo(() => prestartTracks(race, TRACK_STEP), [race]);
  const series = useMemo(() => prestartTwdSeries(race, TWD_STEPS), [race]);
  const reading = useRef<WindReading>(windReading());
  const pose = useRef<Pose>(newPose());

  /* The box the chart is drawn into, in pixels. The server has none to read,
     so it renders the wide branch and the layout effect below refits before the
     browser paints. */
  const [plotBox, setPlotBox] = useState({ w: 750, h: 750 / PLOT_ASPECT });
  const [stripW, setStripW] = useState(STRIP_W);

  const frame = useMemo(
    () => prestartFrame(race, tracks, plotBox.h > 0 ? plotBox.w / plotBox.h : PLOT_ASPECT),
    [race, tracks, plotBox],
  );
  /* Metres per pixel, the one number every symbol on the chart is scaled by. */
  const mpx = frame.w / Math.max(1, plotBox.w);
  const bar = useMemo(() => scaleStep(frame.w), [frame]);

  /* The instant the server renders, and the instant a viewer who asked for
     less motion keeps: the first fix in the feed, the top of the prestart. */
  const seed = useMemo(
    () => windReadingAt(race, facts, race.tMin, windReading()),
    [race, facts],
  );

  /* Pin end to boat end, which is left to right on the drawing above it. The
     rail and the docks keep race.boats order and facts.boats does too; this is
     the view's own reading order and it lives here. */
  const ledger = useMemo(
    () => [...facts.boats].sort((a, b) => a.gunX - b.gunX),
    [facts],
  );

  /* Where the wind arrow stands: up the beat of the line, out at the boat end,
     which is the one corner of the drawing no track reaches. */
  const windAnchor = useMemo(
    () => ({ x: frame.x + frame.w - 11, y: frame.y * 0.5 }),
    [frame],
  );

  /* What the server draws, and what the first client paint replaces a frame
     later: the ladder at the top of the prestart. */
  const seedRungs = useMemo(() => rungSegments(frame, seed.twd), [frame, seed]);

  /* Degrees to the strip's own y, off the band the series fills. */
  const stripY = useCallback(
    (twd: number): number => {
      const band = twdBand(series);
      return 2 + ((band.hi - twd) / (band.hi - band.lo)) * (STRIP_H - 4);
    },
    [series],
  );

  const stripPoints = useMemo(
    () =>
      series
        .map((point, index) => {
          const x = (index / TWD_STEPS) * stripW;
          return `${x.toFixed(1)},${stripY(point.twd).toFixed(2)}`;
        })
        .join(" "),
    [series, stripW, stripY],
  );

  const stripAt = useCallback(
    (t: number): { x: number; y: number } => {
      const u = Math.min(1, Math.max(0, (t - facts.tMin) / (0 - facts.tMin)));
      return { x: u * stripW, y: stripY(series[Math.round(u * TWD_STEPS)].twd) };
    },
    [series, facts, stripW, stripY],
  );

  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const plotNode = useRef<HTMLDivElement>(null);
  const stripNode = useRef<SVGSVGElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const rungs = useRef<(SVGLineElement | null)[]>([]);
  const wedge = useRef<SVGPolygonElement>(null);
  const windArrow = useRef<SVGGElement>(null);
  const windTag = useRef<SVGTSpanElement>(null);
  const favPin = useRef<SVGPolygonElement>(null);
  const favBoat = useRef<SVGPolygonElement>(null);
  const hulls = useRef<(SVGGElement | null)[]>([]);
  const trails = useRef<(SVGGElement | null)[]>([]);
  const stripDot = useRef<SVGCircleElement>(null);
  const toGun = useRef<HTMLDivElement>(null);
  const twsValue = useRef<HTMLDivElement>(null);
  const biasValue = useRef<HTMLDivElement>(null);
  const favEnd = useRef<HTMLElement>(null);
  const favBy = useRef<HTMLSpanElement>(null);
  const favSec = useRef<HTMLSpanElement>(null);
  const statusFill = useRef<HTMLElement>(null);
  const statusBar = useRef<HTMLSpanElement>(null);
  const statusWarming = useRef<HTMLSpanElement>(null);
  const statusUp = useRef<HTMLSpanElement>(null);

  /* What the loop needs from the last render and must not re-enter React to
     read. Written in a layout effect so a resize is picked up before the
     browser paints and never through a changed paint identity, which would
     restart the loop and re-seek the clock under the reader. */
  const view = useRef({ mpx, anchor: windAnchor, tracks, stripAt, frame });
  useLayoutEffect(() => {
    view.current = { mpx, anchor: windAnchor, tracks, stripAt, frame };
  }, [mpx, windAnchor, tracks, stripAt, frame]);

  const paint = useCallback(
    (t: number) => {
      const read = windReadingAt(race, facts, t, reading.current);
      const { mpx: scale, anchor, tracks: drawn, stripAt: at } = view.current;
      const twd = read.twd.toFixed(2);

      /* The ladder and the wedge under it are turned by the same reading, so
         they cannot state two directions. */
      const ladder = rungSegments(view.current.frame, read.twd);
      for (let i = 0; i < RUNG_SLOTS; i += 1) {
        const rung = ladder[i];
        const node = rungs.current[i];
        if (node === null || node === undefined) continue;
        setAttr(node, "x1", rung === undefined ? "0" : rung.x1.toFixed(2));
        setAttr(node, "y1", rung === undefined ? "0" : rung.y1.toFixed(2));
        setAttr(node, "x2", rung === undefined ? "0" : rung.x2.toFixed(2));
        setAttr(node, "y2", rung === undefined ? "0" : rung.y2.toFixed(2));
      }
      const end = read.favored === "boat" ? facts.lineHalf : -facts.lineHalf;
      setAttr(wedge.current, "points", wedgePoints(end, read.twd));
      if (wedge.current !== null) {
        wedge.current.style.display = read.favored === "square" ? "none" : "";
      }

      setAttr(
        windArrow.current,
        "transform",
        `translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)}) rotate(${twd}) scale(${scale.toFixed(4)})`,
      );
      setText(windTag.current, `${signed(read.twd, 0)}°`);

      if (favPin.current !== null) favPin.current.style.opacity = read.favored === "pin" ? "1" : "0";
      if (favBoat.current !== null) {
        favBoat.current.style.opacity = read.favored === "boat" ? "1" : "0";
      }

      for (let i = 0; i < drawn.length; i += 1) {
        const track = drawn[i];
        poseAt(race, track.boat.id, t, "smooth", pose.current);
        setAttr(
          hulls.current[i],
          "transform",
          `translate(${pose.current.x.toFixed(2)} ${(-pose.current.y).toFixed(2)}) rotate(${pose.current.hdg.toFixed(1)}) scale(${scale.toFixed(4)})`,
        );
        /* The dash is inherited by both paths in the group, so a dark hue's
           light underlay is revealed by exactly the same stretch of water. */
        setAttr(
          trails.current[i],
          "stroke-dasharray",
          `${lengthAt(track, t).toFixed(2)} ${track.total.toFixed(2)}`,
        );
      }

      const dot = at(t);
      setAttr(stripDot.current, "cx", dot.x.toFixed(1));
      setAttr(stripDot.current, "cy", dot.y.toFixed(2));

      setText(toGun.current, clock(t));
      setText(twsValue.current, knots(read.tws));
      setText(biasValue.current, meters(read.biasMeters));

      setText(favEnd.current, endLabel(read.favored));
      setText(favSec.current, `${read.biasSeconds.toFixed(1)} s`);
      if (favBy.current !== null) {
        const by = read.favored === "square" ? "none" : "";
        if (favBy.current.style.display !== by) favBy.current.style.display = by;
      }
    },
    [race, facts],
  );

  /* The race name is capped at two lines: measured, then stepped down a pixel
   * at a time until it fits. Container units alone cannot do it, because what
   * overflows is the number of words, not the width of one. */
  const fitTitle = useCallback(() => {
    const node = title.current;
    if (node === null) return;
    node.style.fontSize = "";
    let size = Number.parseFloat(getComputedStyle(node).fontSize);
    if (!Number.isFinite(size)) return;
    node.style.fontSize = `${size}px`;
    let guard = 80;
    const fits = (): boolean => node.scrollHeight <= Math.ceil(2 * size * 1.02) + 2;
    while (!fits() && size > 9 && guard > 0) {
      size -= 1;
      guard -= 1;
      node.style.fontSize = `${size}px`;
    }
  }, []);

  /* The chart is fitted to the box it is actually given rather than to a stated
   * aspect, so the drawing fills it at every width with no letterbox and the
   * scale stays isotropic. Measured in a layout effect, which runs before the
   * browser paints, so the server's wide frame is never the one a narrow reader
   * sees. */
  const measure = useCallback(() => {
    const plot = plotNode.current;
    if (plot !== null) {
      const box = plot.getBoundingClientRect();
      if (box.width > 1 && box.height > 1) {
        setPlotBox((prev) =>
          Math.abs(prev.w - box.width) < 0.5 && Math.abs(prev.h - box.height) < 0.5
            ? prev
            : { w: box.width, h: box.height },
        );
      }
    }
    const strip = stripNode.current;
    if (strip !== null) {
      const width = strip.getBoundingClientRect().width;
      if (width > 1) setStripW((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
    }
  }, []);

  useLayoutEffect(() => {
    fitTitle();
    measure();
    const node = root.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      fitTitle();
      measure();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fitTitle, measure]);

  /* The Continue button takes focus when the cover mounts: it is the only
   * control on the layer, and a viewer arriving by keyboard should not have to
   * find it. preventScroll keeps the workspace's own scroll position. */
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, []);

  /**
   * A repaint whenever the drawing's own frame moves.
   *
   * A resize changes the metres per pixel every symbol is scaled by, and the
   * viewBox the tracks are plotted in. The loop below would pick that up on its
   * next frame, but a viewer who asked for less motion has no loop, so the
   * static state is painted here and nowhere else.
   */
  useEffect(() => {
    if (reduced) {
      paint(race.tMin);
      return;
    }
    paint(useReplay.getState().t);
  }, [paint, reduced, race, plotBox, stripW]);

  /* The two strings crossfade rather than swap, so the renderer arriving is one
     settle instead of a text cut and a bar jump in the same frame. */
  useEffect(() => {
    const words = (): void => {
      if (statusWarming.current !== null) statusWarming.current.style.opacity = live ? "0" : "1";
      if (statusUp.current !== null) statusUp.current.style.opacity = live ? "1" : "0";
    };
    if (reduced) {
      words();
      return;
    }
    const frame = requestAnimationFrame(words);
    return () => window.cancelAnimationFrame(frame);
  }, [live, reduced]);

  /**
   * The hairline only exists if there is a wait to describe.
   *
   * On a machine that puts a frame up in a few hundred milliseconds, a bar that
   * appears, ramps and completes inside a second is the whole of what a viewer
   * sees of it, and what they see is a sweep with no information in it. So it
   * stays off the layer until the renderer has been slow for long enough that
   * saying so is worth a hairline, and a fast boot never draws one at all.
   *
   * When it does earn its place it is transitioned rather than keyframed. The
   * first version killed a running animation to complete it, which drops the
   * element to its base width before the new one applies, so the bar snapped to
   * full from wherever the ramp had reached. A transition interpolates from the
   * current computed width instead, so the renderer arriving is one settle.
   *
   * The ramp itself is a wait and not a measurement: nothing here knows how long
   * a renderer will take, so it eases toward a value short of full and only
   * completes when there is a frame on screen to complete it.
   */
  const SLOW_ENOUGH_TO_SAY_SO = 600;
  const COMPLETE_MS = 900;
  useEffect(() => {
    if (live) return;
    const timer = window.setTimeout(() => {
      const bar = statusBar.current;
      const fill = statusFill.current;
      if (bar === null || fill === null) return;
      bar.style.opacity = "1";
      if (reduced) {
        fill.style.width = "88%";
        return;
      }
      window.requestAnimationFrame(() => {
        fill.style.setProperty("--status-ease", "5400ms");
        fill.style.width = "88%";
      });
    }, SLOW_ENOUGH_TO_SAY_SO);
    return () => window.clearTimeout(timer);
  }, [live, reduced]);

  useEffect(() => {
    const bar = statusBar.current;
    const fill = statusFill.current;
    if (!live || bar === null || fill === null) return;
    /* Never shown, so there is nothing to complete: a bar that appeared only to
     * announce that it was finished would be the sweep this avoids. */
    if (bar.style.opacity !== "1") return;
    if (reduced) {
      fill.style.width = "100%";
      return;
    }
    fill.style.setProperty("--status-ease", `${COMPLETE_MS}ms`);
    fill.style.width = "100%";
  }, [live, reduced]);

  /**
   * The prestart, run on the replay's own clock.
   *
   * The loop seeks the store rather than keeping a clock of its own, so the
   * fleet on the chart and the scene warming underneath it are reading the same
   * instant and the brief's wind is the replay's wind by construction rather
   * than by two formulas agreeing. It stops writing while the capture hold is
   * on, which is what lets a screenshot state its own time.
   *
   * Reduced motion never runs it at all. The brief holds the first fix in the
   * feed, and the store's clock stays where it opened, at the mid-beat moment
   * the store picks for a viewer who asked for less motion.
   */
  useEffect(() => {
    if (reduced) return;
    const store = useReplay;
    const span = 0 - race.tMin;
    let frameId = 0;
    let origin = 0;
    const step = (stamp: number): void => {
      const state = store.getState();
      /* Released. The replay owns the clock from here, and the cover has a fade
       * left to live through: another second of this loop seeking behind it
       * would fight the autoplay for the same clock. */
      if (state.briefDone) return;
      frameId = requestAnimationFrame(step);
      if (state.frozen) {
        paint(state.t);
        return;
      }
      if (origin === 0) origin = stamp;
      const phase = ((stamp - origin) % PRESTART_LOOP_MS) / PRESTART_LOOP_MS;
      state.seek(race.tMin + phase * span);
    };
    /* Open the replay on the prestart before the first painted frame, so the
     * scene coming up behind the brief is at the moment the brief describes. */
    store.getState().seek(race.tMin);
    /* Painting stops at the release, not at the unmount. The cover has a 900ms
     * fade left and the replay is already running the gun off behind it, so a
     * brief that kept reading the clock would spend its last second running its
     * fleet through the start of the race. What dissolves is the brief the
     * reader was reading. */
    const stop = store.subscribe((state) => {
      if (state.briefDone) return;
      paint(state.t);
    });
    paint(store.getState().t);
    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      stop();
    };
  }, [race, paint, reduced]);

  const release = useCallback(() => {
    const state = useReplay.getState();
    if (state.briefDone) return;
    /* Hand the clock back where the replay wants it: inside the prestart for
     * an autoplay, so the gun is something the viewer watches happen; at the
     * mid-beat moment for a viewer who asked for less motion, who gets no
     * autoplay and should not be left on an empty start line. The reduced
     * branch also undoes the one prestart seek the loop can land before the
     * media query has been read into the store. */
    state.seek(state.reducedMotion ? OPEN_AT : AUTOPLAY_FROM);
    state.releaseBrief();
  }, []);

  /* Enter releases the brief from anywhere on the page, except while a viewer
   * is typing: the analyst's composer is one Tab away. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" || event.defaultPrevented) return;
      const active = document.activeElement;
      const tag = active === null ? "" : active.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (active instanceof HTMLElement && active.isContentEditable) return;
      release();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [release]);

  const { startPin, startBoat } = race.course;
  const lineMeters = Math.round(facts.lineLength);
  const prestartSeconds = Math.round(-race.tMin);
  const swing = twdSwing(series);
  const glyph = LABEL_PX * mpx;
  /* Every stroke width in the stylesheet is stated in pixels and multiplied
     back into metres by this, which is why the drawing has one scale factor and
     not a hardcoded width per element. */
  const plotStyle = { "--plot-px": mpx.toFixed(5) } as CSSProperties;
  const barY = frame.y + frame.h - 10 * mpx;
  const barX = frame.x + 10 * mpx;

  return (
    <section className={styles.brief} ref={root} aria-label={`Race brief, ${name}`}>
      <header className={styles.briefHead}>
        <div className={styles.raceName} ref={title}>
          {name}
        </div>
        <div className={styles.raceMeta}>
          {venue} · {dateLabel} · {facts.boats.length} boats · one windward-leeward lap
        </div>
      </header>

      <div className={styles.briefMain}>
        <div className={`${styles.panel} ${styles.plotPlate}`}>
          <div className={styles.panelLabel}>
            <span>{`The last ${prestartSeconds} seconds`}</span>
            <span className={styles.panelCount}>{facts.boats.length}</span>
          </div>

          <div className={styles.plotBox} ref={plotNode}>
            <svg
              className={styles.plot}
              viewBox={frame.viewBox}
              preserveAspectRatio="xMidYMid meet"
              style={plotStyle}
              role="img"
              aria-label={`The last ${prestartSeconds} seconds before the gun, seen from above at true scale: the ${lineMeters} metre start line, the ${facts.boats.length} approach tracks the fleet sails onto it, and the breeze lying across the course`}
            >
              {/* The wind's own field: contours of equal gain to windward, one
                  group turned about the line's middle so every rung states the
                  same direction, and the sliver the favored end has won drawn
                  between the line and the rung through it. */}
              <g>
                {Array.from({ length: RUNG_SLOTS }, (_, index) => {
                  const rung = seedRungs[index];
                  return (
                    <line
                      key={index}
                      ref={(node) => {
                        rungs.current[index] = node;
                      }}
                      className={styles.rung}
                      x1={rung === undefined ? 0 : rung.x1.toFixed(2)}
                      y1={rung === undefined ? 0 : rung.y1.toFixed(2)}
                      x2={rung === undefined ? 0 : rung.x2.toFixed(2)}
                      y2={rung === undefined ? 0 : rung.y2.toFixed(2)}
                    />
                  );
                })}
              </g>
              <polygon
                className={styles.wedge}
                ref={wedge}
                points={wedgePoints(seed.favored === "boat" ? facts.lineHalf : -facts.lineHalf, seed.twd)}
                style={{ display: seed.favored === "square" ? "none" : undefined }}
              />

              {/* Every approach in dim, then the water each hull has already
                  crossed drawn over it in the boat's own colour at twice the
                  weight. Weight carries "already sailed", not a second hue. */}
              {tracks.map((track) => (
                <path
                  key={track.boat.id}
                  className={styles.trackAhead}
                  d={toPath(track.points)}
                />
              ))}
              {tracks.map((track, index) => (
                <g
                  key={track.boat.id}
                  ref={(node) => {
                    trails.current[index] = node;
                  }}
                  strokeDasharray={`0 ${track.total.toFixed(2)}`}
                >
                  {track.boat.dark ? (
                    <path className={styles.trackDark} d={toPath(track.points)} />
                  ) : null}
                  <path
                    className={styles.trackSailed}
                    d={toPath(track.points)}
                    stroke={track.boat.hue}
                  />
                </g>
              ))}

              {/* The line, in the wind's colour: the console's contract names
                  "the start line before the gun" as one of the things amber
                  means, and everything on this layer is before the gun. Its two
                  ends stay in ink, because a pin and a committee boat are marks
                  on the water rather than weather, and they are told apart by
                  shape rather than by a colour each. */}
              <line
                className={styles.plotLine}
                x1={startPin.x}
                y1={-startPin.y}
                x2={startBoat.x}
                y2={-startBoat.y}
              />
              <g transform={`translate(${startPin.x} ${-startPin.y}) scale(${mpx.toFixed(4)})`}>
                <circle className={styles.plotMark} r={PIN_R} />
              </g>
              <path
                className={styles.plotMarkFill}
                d={BOAT_MARK}
                transform={`translate(${startBoat.x} ${-startBoat.y}) scale(${mpx.toFixed(4)})`}
              />
              <polygon
                className={styles.favMark}
                ref={favPin}
                points={FAV_MARK}
                transform={`translate(${startPin.x} ${-startPin.y}) scale(${mpx.toFixed(4)})`}
                style={{ opacity: seed.favored === "pin" ? 1 : 0 }}
              />
              <polygon
                className={styles.favMark}
                ref={favBoat}
                points={FAV_MARK}
                transform={`translate(${startBoat.x} ${-startBoat.y}) scale(${mpx.toFixed(4)})`}
                style={{ opacity: seed.favored === "boat" ? 1 : 0 }}
              />
              <text
                className={styles.plotLabel}
                x={startPin.x}
                y={-startPin.y - 15 * mpx}
                fontSize={glyph}
                textAnchor="middle"
              >
                Pin
              </text>
              <text
                className={styles.plotLabel}
                x={startBoat.x}
                y={-startBoat.y - 15 * mpx}
                fontSize={glyph}
                textAnchor="middle"
              >
                Committee boat
              </text>

              {/* Where each hull ends up at the gun, outlined rather than
                  filled: fill separates "now" from "then". Both are drawn at a
                  fixed size in pixels, because the feed holds no hull length
                  and a symbol scaled to the chart would invent one. */}
              {tracks.map((track) => {
                const last = track.points.length - 2;
                return (
                  <g key={track.boat.id}>
                    <path
                      className={styles.hullGun}
                      d={HULL}
                      stroke={track.boat.dark ? "var(--brief-dim)" : track.boat.hue}
                      transform={`translate(${track.points[last].toFixed(2)} ${track.points[last + 1].toFixed(2)}) rotate(${track.gunHdg.toFixed(1)}) scale(${mpx.toFixed(4)})`}
                    />
                    {/* The tags share one row off the line rather than each
                        hanging under its own ghost, so six labels a metre or
                        two apart in y cannot stack on each other. */}
                    <text
                      className={styles.plotSail}
                      x={track.points[last]}
                      y={-startPin.y + 11 * mpx}
                      fontSize={glyph}
                      textAnchor="middle"
                    >
                      {track.boat.sail}
                    </text>
                  </g>
                );
              })}

              {tracks.map((track, index) => (
                <g
                  key={track.boat.id}
                  ref={(node) => {
                    hulls.current[index] = node;
                  }}
                  transform={`translate(${track.points[0].toFixed(2)} ${track.points[1].toFixed(2)}) rotate(${track.openHdg.toFixed(1)}) scale(${mpx.toFixed(4)})`}
                >
                  <path
                    className={styles.hullNow}
                    d={HULL}
                    fill={track.boat.hue}
                    stroke={track.boat.dark ? "var(--brief-dim)" : undefined}
                    strokeWidth={track.boat.dark ? 0.7 : undefined}
                  />
                </g>
              ))}

              {/* One instrument for the wind and one only: an arrow lying
                  across the course with the direction it is blowing from. The
                  rungs are the field it makes, not a second reading of it. */}
              <g
                ref={windArrow}
                transform={`translate(${windAnchor.x.toFixed(2)} ${windAnchor.y.toFixed(2)}) rotate(${seed.twd.toFixed(2)}) scale(${mpx.toFixed(4)})`}
              >
                <line
                  className={styles.windStroke}
                  x1={WIND_SHAFT.x1}
                  y1={WIND_SHAFT.y1}
                  x2={WIND_SHAFT.x2}
                  y2={WIND_SHAFT.y2}
                />
                <polygon className={styles.windFill} points={WIND_HEAD} />
              </g>
              <text
                className={styles.plotLabel}
                x={windAnchor.x - 10 * mpx}
                y={windAnchor.y}
                fontSize={glyph}
                textAnchor="end"
              >
                TWD{" "}
                <tspan className={styles.windTag} data-read="twd" ref={windTag}>
                  {`${signed(seed.twd, 0)}°`}
                </tspan>
              </text>

              {/* The mark the fleet is about to beat to, off the top of the
                  drawing at a distance the course states. */}
              <text
                className={styles.plotLabel}
                x={0}
                y={frame.y + 11 * mpx}
                fontSize={glyph}
                textAnchor="middle"
              >
                Windward mark{" "}
                <tspan className={styles.plotFig}>{`${Math.round(race.course.windward.y)} m`}</tspan>
              </text>

              {/* Nothing on this chart is drawn at a size the reader cannot
                  check, which is what the bar is for. */}
              <g className={styles.scaleRule}>
                <line x1={barX} y1={barY} x2={barX + bar} y2={barY} />
                <line x1={barX} y1={barY - 4 * mpx} x2={barX} y2={barY} />
                <line
                  x1={barX + bar}
                  y1={barY - 4 * mpx}
                  x2={barX + bar}
                  y2={barY}
                />
              </g>
              <text
                className={styles.plotFig}
                x={barX}
                y={barY - 5 * mpx}
                fontSize={glyph}
              >
                {`${bar} m`}
              </text>
            </svg>
          </div>

          {/* A square line is favored by nobody, so the "by" goes with the
              seconds rather than dangling off the end of the sentence. Not a
              theoretical state: the breeze crosses the course axis inside the
              prestart on two of the three shipped seeds, 42 of 4001 samples on
              the shipped race and 19 on Kestrel Sound. */}
          <div className={styles.plotCap}>
            <p className={styles.favored}>
              Favored: <b ref={favEnd}>{endLabel(seed.favored)}</b>
              <span
                className={styles.favBy}
                ref={favBy}
                style={{ display: seed.favored === "square" ? "none" : undefined }}
              >
                {" by "}
                <span className={styles.favSec} ref={favSec}>
                  {`${seed.biasSeconds.toFixed(1)} s`}
                </span>
              </span>
            </p>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.stripPlate}`}>
          <span className={styles.stripLabel}>TWD swing</span>
          <svg
            className={styles.stripPlot}
            ref={stripNode}
            viewBox={`0 0 ${stripW.toFixed(1)} ${STRIP_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`True wind direction across the prestart: ${swing.toFixed(1)} degrees of swing, with the course axis as the rule the favored end changes hands across`}
          >
            <line
              className={styles.stripRule}
              x1="0"
              y1={stripY(0).toFixed(2)}
              x2={stripW.toFixed(1)}
              y2={stripY(0).toFixed(2)}
            />
            <polyline className={styles.stripTrace} points={stripPoints} />
            <circle
              className={styles.stripDot}
              ref={stripDot}
              r="2.4"
              cx={stripAt(race.tMin).x.toFixed(1)}
              cy={stripAt(race.tMin).y.toFixed(2)}
            />
          </svg>
          <span className={styles.stripValue}>{`${swing.toFixed(1)}°`}</span>
        </div>

        <div className={`${styles.panel} ${styles.ledger}`}>
          <div className={styles.panelLabel}>
            <span>At the gun, pin end to boat end</span>
            <span className={styles.panelCount}>{facts.boats.length}</span>
          </div>
          {ledger.map((boat) => (
            <div className={styles.fleetRow} key={boat.id}>
              <span
                className={boat.dark ? `${styles.chip} ${styles.chipDark}` : styles.chip}
                style={{ background: boat.hue }}
                aria-hidden="true"
              />
              <span className={styles.sail}>{boat.sail}</span>
              <span className={styles.boatName}>{boat.name}</span>
              <span className={styles.across}>{`${signed(boat.gunX, 0)} m`}</span>
              <span className={styles.slot}>{`${meters(boat.offLine)} m off`}</span>
            </div>
          ))}
          <div className={styles.fleetFoot}>
            <span>
              {facts.first === null
                ? "no boat crossed"
                : `${facts.first.sail} ${signed(facts.first.t, 2)} s first cross`}
            </span>
            <span>{`beat ${Math.round(facts.beatTwa)}° off the breeze`}</span>
          </div>
        </div>

        {/* Four readings, and each one is stated exactly once on the layer. The
            direction is on the arrow out on the water, the seconds the favored
            end is worth are in the sentence under the drawing, and the swing is
            on the strip. A number in two places is a number a reader has to
            reconcile. */}
        <div className={`${styles.panel} ${styles.reads}`}>
          <div className={styles.readCell}>
            <div className={styles.readLabel}>To gun</div>
            <div className={styles.readValue} data-read="gun" ref={toGun}>
              {clock(race.tMin)}
            </div>
          </div>
          <div className={styles.readCell}>
            <div className={styles.readLabel}>TWS kn</div>
            <div className={styles.readValue} data-read="tws" ref={twsValue}>
              {knots(seed.tws)}
            </div>
          </div>
          <div className={styles.readCell}>
            <div className={styles.readLabel}>Line m</div>
            <div className={styles.readValue} data-read="line">{lineMeters}</div>
          </div>
          <div className={styles.readCell}>
            <div className={styles.readLabel}>Bias m</div>
            <div className={styles.readValue} data-read="bias" ref={biasValue}>
              {meters(seed.biasMeters)}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.briefFoot}>
        {/* Both strings are rendered and crossfaded rather than swapped, so the
            renderer arriving is one settle rather than a text cut and a bar jump
            in the same frame. The warming line is the one a screen reader gets:
            it is the state the layer opens in, and a renderer coming up is not
            news worth announcing. */}
        <p className={styles.status}>
          <span className={styles.statusStack}>
            <span ref={statusWarming}>renderer warming, the race is already loaded</span>
            <span ref={statusUp} style={{ opacity: 0 }} aria-hidden="true">
              renderer up, the race is already loaded
            </span>
          </span>
          <span className={styles.statusBar} ref={statusBar} style={{ opacity: 0 }} aria-hidden="true">
            <i ref={statusFill} className={styles.statusFill} />
          </span>
        </p>
        <button className={styles.goBtn} type="button" onClick={release} ref={button}>
          Start the race
          <span className={styles.goArrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </section>
  );
}
