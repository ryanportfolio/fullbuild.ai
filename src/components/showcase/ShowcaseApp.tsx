"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/prototype/showcase/showcase.module.css";
import { activeProjectIndex, clamp01, PROTOTYPE_INDEX, SHOWCASE_PROJECTS, TRACK_SCREENS } from "./data";
import { hashSeed, seededRandom } from "./prng";
import { ShowcaseEntryScene, ShowcaseScene } from "./ShowcaseScene";
import { LoaderPlate } from "./ShowcaseLoader";
import type { WarpBeat, WarpFrame } from "./warpTiming";
import { WARP_BEATS, WARP_FOV_REST, warpFrameAt, warpScheduleAt } from "./warpTiming";

declare global {
  interface Window {
    __showcaseLoader?: {
      hold: (percent: number) => void;
      release: () => void;
    };
    /*
     * The warp's own capture surface, and it is a separate global for the same reason the
     * loader's is: FrameAuthority reassigns __showcaseCapture wholesale on every dep change
     * and would blow away anything merged into it. This one is owned by the component that
     * owns the clock and the scrollbar.
     */
    __showcaseWarp?: {
      beats: readonly string[];
      /** Pin the run at a named beat, armed from `from`. Nothing advances until release. */
      hold: (beat: string, from?: number) => void;
      /** Run it for real, from wherever the film is pinned or from the current position. */
      play: () => void;
      /** Abandon the run and hand the page back to the scrollbar. */
      release: () => void;
      state: () => {
        beat: string | null;
        t: number;
        progress: number;
        cameraZ: number;
        fov: number;
        roll: number;
        stretch: number;
        opacity: number;
        feed: number;
        flare: number;
      };
    };
  }
}

/*
 * THE ANALOG FLOOR, measured off the reference instead of guessed at. Zooming its empty
 * frame to the pixel shows single dots of rgb(0 0 96) over a true black: no clumps, no
 * runs, about a third of the even/even sublattice lit and a tenth of that again on the
 * odd/odd one. That structure is why the reference grain survives a two pixel step, and
 * it is the one thing a repeating CSS gradient cannot draw. Three co-prime gradient
 * tiles produced a regular weave instead, which measured as grain that decorrelated
 * inside a single pixel and read as a screen door up close.
 *
 * The tile is drawn once, from the same seeded generator the scene uses, so the field is
 * identical on every load and every capture.
 */
const GRAIN_TILE = 512;
const GRAIN_DOT_DENSITY = 0.44;
// A dot on the opposite sublattice every eleventh draw. The reference carries the same
// minority, and without it the lattice starts to read as a printed screen.
const GRAIN_ODD_SHARE = 0.09;
const GRAIN_DOT_BLUE = 155;

function makeGrainTile() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(GRAIN_TILE, GRAIN_TILE);
  const pixels = image.data;
  const random = seededRandom(hashSeed("showcase-analog-floor"));
  const light = (index: number, blue: number) => {
    pixels[index + 2] = blue;
    pixels[index + 3] = 255;
  };

  for (let y = 0; y < GRAIN_TILE; y += 2) {
    for (let x = 0; x < GRAIN_TILE; x += 2) {
      if (random() < GRAIN_DOT_DENSITY) {
        // Nearly every dot sits at one level and a handful run hot, which is how the
        // reference scatters a few brighter specks through an otherwise even floor.
        const roll = random();
        const blue = roll > 0.985
          ? GRAIN_DOT_BLUE * 1.62
          : roll > 0.955
            ? GRAIN_DOT_BLUE * 1.34
            : GRAIN_DOT_BLUE;
        light((y * GRAIN_TILE + x) * 4, Math.min(255, Math.round(blue)));
      }
      if (random() < GRAIN_DOT_DENSITY * GRAIN_ODD_SHARE) {
        light(((y + 1) * GRAIN_TILE + x + 1) * 4, GRAIN_DOT_BLUE);
      }
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/*
 * BLEACH. One trigger, never a scroll position: dwelling on any interactive control
 * pulls the colour out of the entire world, DOM and canvas alike, and the control
 * under the cursor is the only thing left holding radiation blue. It fires on the
 * starter and all the way through the journey, so the second act stays saturated
 * until a pointer asks for something. A finger cannot hover, so touch never drains:
 * a tap would leave the world grey with nothing to release it.
 */
const BLEACH_DWELL_MS = 150;
/*
 * A control can leave without saying goodbye. The ledger swaps its keyed row at every
 * chapter and hides itself entirely at the finale, so the button under a resting cursor
 * gets torn out of the document with no pointerout behind it and the drain has nothing
 * left to release it. This is the beat after a scroll stops where the world re-checks
 * that something is still under the pointer asking for it.
 */
const BLEACH_VERIFY_MS = 140;
const BLEACH_CONTROL = "a[href], button";

/*
 * THE LOAD FOLLOWER. The loading clock emits every integer on its way to 100, so nothing
 * needs smoothing on the normal path. What needs protecting against is a jump: the WebGL
 * compile blocks the main thread through the first real frames, so a follower that banks
 * that stalled time paints its first live frame already nineteen points in, and a hidden
 * tab freezes the frameloop the same way at any scale. Capping the step at two frames of
 * credit means a stall never fast-forwards the film, it only pauses it.
 *
 * A rate limit rather than an exponential, because an exponential lags the clock's 84 per
 * cent a second by around nine points for free and the drawing would hand over late. The
 * landing window is the one eased stretch: inside it the sweep tapers toward a stalled
 * clock instead of slamming into it, and the floor keeps a crawl alive so the counter
 * decelerates to rest rather than stopping mid-stride.
 */
const LOAD_SWEEP_MS = 620;
const LOAD_STEP_MS = 34;
const LOAD_LAND_POINTS = 9;
const LOAD_LAND_FLOOR = 0.12;
/*
 * The opening is the drawing act, and its speed is a constraint rather than a taste: the
 * drawn furniture lives entirely under load 0.11 and its narrowest bands (readout, each
 * lockup letter) are 2.2 load points wide, so no element may cross a whole band between
 * frames sampled 150ms apart. The follower therefore runs flat at LOAD_OPEN_RATIO through
 * the first LOAD_DRAW_POINTS: 1000 * 100 * 0.06 / 620 = 9.7 points per second, 1.45
 * points per 150ms frame, under the 2.2 point band width. Only past the draw zone does the
 * quadratic ramp to full pace begin. The previous ratio of 0.38 swept a letter band in
 * about 35ms of wall time, which read as letters popping in whole.
 */
const LOAD_DRAW_POINTS = 11;
const LOAD_OPEN_POINTS = 22;
const LOAD_OPEN_RATIO = 0.06;

function bleachControl(node: EventTarget | null) {
  if (!(node instanceof Element)) return null;
  const control = node.closest(BLEACH_CONTROL);
  /*
   * The entry's own call to action opens the journey; it never drains it. The control
   * stands outside the gate in the DOM, so it is named here as well as by its ancestor.
   *
   * VIEW ALL is carved out for a harder reason than taste. It is a button, so it matches
   * BLEACH_CONTROL, and a hundred and fifty milliseconds of dwell on it would set
   * --showcase-bleach to 1 on the frame before it starts a two and a half second move. The
   * control then leaves under the finale with no pointerout behind it and nothing left to
   * verify against, so the entire warp and the arrival would play in greyscale with nothing
   * able to release them.
   */
  return control
    && !control.closest(`.${styles.entryGate}`)
    && !control.classList.contains(styles.enterButton)
    && !control.classList.contains(styles.warpButton)
    ? control
    : null;
}

/*
 * The title is justified letter by letter, not word by word. `space-between` can only push
 * apart the children it is given, so every letter becomes its own child and a single word
 * spans the whole measure however many letters it carries. The letters are spoken as one
 * word by the hidden name on the heading, never read out one at a time.
 */
function HeroLetters({ text }: { text: string }) {
  return (
    <>
      {text.split("").map((letter, index) => (
        <span key={`${letter}-${index}`}>{letter}</span>
      ))}
    </>
  );
}

export function ShowcaseApp() {
  const shellRef = useRef<HTMLElement>(null);
  const finaleRef = useRef<HTMLElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });
  /*
   * THE RUN's fast lane. React carries the slow world, the ref carries the fast one. A
   * setState issued from a rAF callback is auto-batched and flushed through the scheduler's
   * MessageChannel task, which runs after every rAF callback and after paint, so useFrame is
   * guaranteed one commit behind and two under load. At this run's terminal 132 world units
   * a second, one dropped commit is a 2.2 unit hold followed by a 4.4 unit jump, which is
   * plainly visible. Everything that cannot tolerate that reads the ref instead: camera z,
   * roll, field of view, the streak uniforms and the film grade.
   *
   * Both come out of one pure function of wall-clock milliseconds, so they cannot disagree
   * by more than a frame, and the scrollbar carries the truth underneath them both.
   */
  const warpRef = useRef<WarpFrame | null>(null);
  const warpFromRef = useRef(0);
  const warpStartRef = useRef(0);
  const warpHoldRef = useRef<number | null>(null);
  const warpBeatRef = useRef<WarpBeat | null>(null);
  const warpControlsRef = useRef<{
    arm: (from: number) => void;
    hold: (beat: WarpBeat, from: number) => void;
    play: () => void;
    release: () => void;
  } | null>(null);
  const progressRef = useRef(0);
  const [entered, setEntered] = useState(false);
  const [entrySettled, setEntrySettled] = useState(false);
  const [heroLanded, setHeroLanded] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [held, setHeld] = useState(false);
  const holdRef = useRef<number | null>(null);
  const targetRef = useRef(0);
  const displayRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [controlDwell, setControlDwell] = useState(false);
  const [warping, setWarping] = useState(false);
  const [grainTile, setGrainTile] = useState<string | null>(null);

  const ready = displayPercent >= 100;
  const loadReadout = String(Math.round(displayPercent)).padStart(2, "0");
  /*
   * The announced number moves in tens. The clock emits every integer on its way to a
   * hundred, so a live region following it queues about a hundred announcements inside 1.2
   * seconds and a screen reader spends the whole load reading a counter. Eleven steps say
   * the same thing. The two drawn readouts still count every number.
   */
  const announcedPercent = String(Math.min(100, Math.floor(displayPercent / 10) * 10)).padStart(2, "0");
  const activeProject = SHOWCASE_PROJECTS[activeIndex];
  const finaleVisible = entered && progress >= 0.978;
  /*
   * The block stays up for the whole journey and swaps its contents in place. Hiding it
   * around every handover left a gap where a crystal owned the screen with nothing
   * naming it, which is the one thing the source never does.
   */
  const ledgerVisible = entered && entrySettled && heroLanded && progress < 0.965;
  const bleach = controlDwell ? 1 : 0;
  const bleaching = bleach > 0.001;
  const bleached = bleach >= 0.5;

  // Drawn on the client, once. Until it lands the stylesheet falls back to its own
  // gradient speckle, so the field is never bare.
  useEffect(() => setGrainTile(makeGrainTile()), []);

  const onLoadProgress = useCallback((value: number) => {
    targetRef.current = value;
  }, []);

  /*
   * The follower, and the capture hook that rides it. `__showcaseLoader` is deliberately a
   * separate global from `__showcaseCapture`: FrameAuthority reassigns that one wholesale on
   * every dep change and would blow away anything merged into it.
   *
   * Because the loader carries no wall clock animation of its own, holding the percent
   * reproduces any frame byte for byte. That constraint is load bearing: nothing here or in
   * the stylesheet may grow an idle breath, or two clocks start beating against each other
   * through the handover.
   */
  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const step = () => {
      frame = 0;
      const now = performance.now();
      const delta = Math.min(LOAD_STEP_MS, now - last);
      last = now;

      if (holdRef.current === null) {
        const gap = targetRef.current - displayRef.current;
        let next = displayRef.current;
        if (reducedMotion) {
          next = targetRef.current;
        } else if (gap > 0) {
          /*
           * The draw zone runs flat at the open ratio so no entrance band can be crossed
           * whole between frames 150ms apart; the ramp to full pace starts above it.
           */
          const drawn = Math.max(0, displayRef.current - LOAD_DRAW_POINTS);
          const openness = Math.min(1, drawn / (LOAD_OPEN_POINTS - LOAD_DRAW_POINTS));
          const pace = LOAD_OPEN_RATIO + (1 - LOAD_OPEN_RATIO) * openness * openness;
          const swept = (delta * 100 * pace) / LOAD_SWEEP_MS;
          const taper = Math.max(Math.min(1, gap / LOAD_LAND_POINTS), LOAD_LAND_FLOOR);
          next = gap <= 0.3 ? targetRef.current : displayRef.current + Math.min(gap, swept * taper);
        }
        if (next > displayRef.current) {
          displayRef.current = next;
          setDisplayPercent(next);
        }
        if (displayRef.current < 100) frame = window.requestAnimationFrame(step);
      }
    };

    const pump = () => {
      if (frame) return;
      last = performance.now();
      frame = window.requestAnimationFrame(step);
    };

    pump();

    /*
     * Holding puts the loader back on screen at the held frame even from the far side of the
     * handover. Without that the fade owns the starter for 900ms in both directions and a
     * capture pass photographs a blank frame, which makes every later verification a guess.
     */
    window.__showcaseLoader = {
      hold: (percent: number) => {
        const value = Math.min(100, Math.max(0, percent));
        holdRef.current = value;
        displayRef.current = value;
        setDisplayPercent(value);
        setHeld(true);
        pump();
      },
      release: () => {
        holdRef.current = null;
        setHeld(false);
        pump();
      },
    };

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      delete window.__showcaseLoader;
    };
  }, [reducedMotion]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);

    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setCompactViewport(query.matches);
    updateViewport();
    query.addEventListener("change", updateViewport);

    return () => query.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const updateCursor = (event: PointerEvent) => {
      const shell = shellRef.current;
      // The pointer stops being an input the moment the run commits. A mouse twitch
      // otherwise rides straight through it into the camera, the stars, the debris and all
      // nine crystals, and the sheath is only axis aligned because the lens is looking
      // straight down its own z.
      if (!shell || warpRef.current) return;
      pointerRef.current.x = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerRef.current.y = -(event.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      pointerRef.current.clientX = event.clientX;
      pointerRef.current.clientY = event.clientY;
      shell.style.setProperty("--showcase-cursor-x", `${event.clientX}px`);
      shell.style.setProperty("--showcase-cursor-y", `${event.clientY}px`);
    };

    window.addEventListener("pointermove", updateCursor, { passive: true });
    return () => window.removeEventListener("pointermove", updateCursor);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let dwell = 0;
    let verify = 0;

    const clearDwell = () => {
      if (!dwell) return;
      window.clearTimeout(dwell);
      dwell = 0;
    };

    const openDwell = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !bleachControl(event.target)) return;
      clearDwell();
      dwell = window.setTimeout(() => setControlDwell(true), BLEACH_DWELL_MS);
    };

    const closeDwell = (event: PointerEvent) => {
      if (!bleachControl(event.target) || bleachControl(event.relatedTarget)) return;
      clearDwell();
      setControlDwell(false);
    };

    const releaseDwell = () => {
      clearDwell();
      setControlDwell(false);
    };

    /*
     * Hit-test where the cursor actually is instead of trusting either the last control
     * that announced itself or the :hover chain, which Chrome leaves a step behind a scroll
     * nothing pushed. A chapter that hands the cursor a fresh button at the same spot keeps
     * the world drained, and a finale that takes the whole ledger away gives the colour
     * back without waiting for a pointerout that is never coming.
     */
    const verifyDwell = () => {
      verify = 0;
      const { clientX, clientY } = pointerRef.current;
      if (bleachControl(document.elementFromPoint(clientX, clientY))) return;
      releaseDwell();
    };

    // Wait for the scroll to settle: Chrome updates hover a frame behind the scroll, and
    // checking mid-flight would flicker the colour back in between two chapters.
    const scheduleVerify = () => {
      if (verify) window.clearTimeout(verify);
      verify = window.setTimeout(verifyDwell, BLEACH_VERIFY_MS);
    };

    shell.addEventListener("pointerover", openDwell);
    shell.addEventListener("pointerout", closeDwell);
    window.addEventListener("scroll", scheduleVerify, { passive: true });
    window.addEventListener("resize", scheduleVerify);
    window.addEventListener("blur", releaseDwell);

    return () => {
      clearDwell();
      if (verify) window.clearTimeout(verify);
      shell.removeEventListener("pointerover", openDwell);
      shell.removeEventListener("pointerout", closeDwell);
      window.removeEventListener("scroll", scheduleVerify);
      window.removeEventListener("resize", scheduleVerify);
      window.removeEventListener("blur", releaseDwell);
    };
  }, []);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    if (!entered) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      window.scrollTo(0, 0);
    } else {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    }

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [entered]);

  useEffect(() => {
    if (!entered) return;

    if (reducedMotion) {
      setEntrySettled(true);
      return;
    }

    const settle = window.setTimeout(() => setEntrySettled(true), 3000);
    return () => window.clearTimeout(settle);
  }, [entered, reducedMotion]);

  /*
   * The ledger waits for the hero. The first crystal travels in out of the debris field
   * over roughly 0.8s once the entry settles, and naming a project while it is still a
   * seed read as the two arriving by accident rather than one introducing the other.
   */
  useEffect(() => {
    if (!entrySettled) {
      setHeroLanded(false);
      return;
    }

    if (reducedMotion) {
      setHeroLanded(true);
      return;
    }

    const land = window.setTimeout(() => setHeroLanded(true), 660);
    return () => window.clearTimeout(land);
  }, [entrySettled, reducedMotion]);

  useEffect(() => {
    if (!entered) return;

    const updateScroll = () => {
      /*
       * The run owns the scrollbar for its whole flight and moves it for real, so every
       * frame of it arrives back here as a scroll event describing a position the run has
       * already left. Disarmed by a guard rather than by unhooking the listener, so a
       * resize or a browser scroll restoration mid-flight is covered by the same line, and
       * one reconciling call at the end puts the page back on the real scrollY.
       */
      if (warpRef.current) return;

      const shell = shellRef.current;
      if (!shell) return;

      const distance = Math.max(1, shell.offsetHeight - window.innerHeight);
      const nextProgress = Math.min(1, Math.max(0, window.scrollY / distance));
      setProgress(nextProgress);
      setActiveIndex(activeProjectIndex(nextProgress));
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);

    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, [entered]);

  /*
   * THE RUN. One rAF loop publishing three things a frame, all of them derived from
   * warpFrameAt, so nothing downstream can drift from anything else: the scrollbar, so the
   * browser's own idea of the page stays true and the back button, a refresh and the thumb
   * all describe the page the piece thinks it is on; React's progress, which carries the
   * fog, the radiation, crystal visibility and the ledger and finale gates; and the ref,
   * which carries the lens.
   *
   * setActiveIndex is deliberately not called. The ledger's row is keyed on the active
   * project inside an aria-live region with a 500ms entrance animation, so nine flips in a
   * second and a half would restart that animation nine times and queue nine
   * announcements. The one reconciling pass at the end sets it once, by which time the
   * ledger has already faded.
   */
  useEffect(() => {
    let frame = 0;

    const publish = (t: number) => {
      const value = warpFrameAt(t, warpFromRef.current);
      // The ref goes first. The scrollTo below arrives back at updateScroll as an event,
      // and this is what that guard reads to stand down.
      warpRef.current = value;
      const shell = shellRef.current;
      if (shell) {
        // Recomputed every frame rather than latched, so a resize mid-flight lands the run
        // on the destination it now has rather than the one it was armed against.
        const distance = Math.max(1, shell.offsetHeight - window.innerHeight);
        window.scrollTo(0, Math.round(value.progress * distance));
      }
      setProgress(value.progress);
      return value;
    };

    // Hand the page back. The reconcile reads the real scrollY rather than trusting the
    // last published frame, so whatever the browser actually did is what the page believes.
    const stand = (arrived: boolean) => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      warpRef.current = null;
      warpHoldRef.current = null;
      setWarping(false);

      const shell = shellRef.current;
      if (shell) {
        const distance = Math.max(1, shell.offsetHeight - window.innerHeight);
        const settled = Math.min(1, Math.max(0, window.scrollY / distance));
        setProgress(settled);
        setActiveIndex(activeProjectIndex(settled));
      }

      /*
       * preventScroll is not optional: focusing an element inside an eighteen thousand
       * pixel document would otherwise scroll it into view and undo the landing. Precedent
       * is enterShowcase. The finale is a named region, so a screen reader announces an
       * honest arrival with no new live region anywhere.
       */
      if (arrived) finaleRef.current?.focus({ preventScroll: true });
    };

    const step = () => {
      frame = 0;
      const held = warpHoldRef.current;
      const t = held === null ? performance.now() - warpStartRef.current : held;
      publish(t);
      // The run's own end, not the table's: a click near the wall has a shorter corridor to
      // cross and a correspondingly shorter clock to cross it on.
      if (t >= warpScheduleAt(warpFromRef.current).end) {
        stand(true);
        return;
      }
      // A pinned beat publishes once and stops. Nothing advances until it is released.
      if (held !== null) return;
      frame = window.requestAnimationFrame(step);
    };

    const arm = (from: number) => {
      warpFromRef.current = clamp01(from);
      warpStartRef.current = performance.now();
      warpHoldRef.current = null;
      warpBeatRef.current = null;
      /*
       * THE ARRIVAL HAS TO BE STILL, and the pointer is what was stopping it. The camera's x
       * and y are pinned to 0 for the flight and then handed straight back to the 0.08
       * damping, so a mouse resting on the control it was just clicked with sent the whole
       * frame drifting 0.3 units sideways over the second and a half after the motion was
       * supposed to have stopped, and every field reading cursorRef went with it. Parking the
       * stored pointer at arm means the target is already 0 when the ref lets go and stays
       * there until the reader genuinely moves, which is the same thing a pinned beat does.
       */
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
      setWarping(true);
      // Belt and braces alongside the carve-out in bleachControl: a keyboard activation can
      // happen while the pointer is resting on something else entirely.
      setControlDwell(false);
      publish(0);
      if (!frame) frame = window.requestAnimationFrame(step);
    };

    const hold = (beat: WarpBeat, from: number) => {
      const t = WARP_BEATS[beat];
      if (t === undefined) return;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      warpFromRef.current = clamp01(from);
      warpStartRef.current = performance.now() - t;
      warpHoldRef.current = t;
      warpBeatRef.current = beat;
      // A pinned frame cannot depend on where the mouse happened to be.
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
      setWarping(true);
      setControlDwell(false);
      publish(t);
      // The last beat is the landed page, not a frame of the flight, so it runs the same
      // handback the live run does.
      if (t >= warpScheduleAt(warpFromRef.current).end) stand(true);
    };

    const play = () => {
      const held = warpHoldRef.current;
      if (held === null) {
        arm(progressRef.current);
        return;
      }
      warpHoldRef.current = null;
      warpStartRef.current = performance.now() - held;
      if (!frame) frame = window.requestAnimationFrame(step);
    };

    const release = () => {
      warpBeatRef.current = null;
      stand(false);
    };

    warpControlsRef.current = { arm, hold, play, release };

    window.__showcaseWarp = {
      beats: Object.keys(WARP_BEATS),
      hold: (beat: string, from = 0) => {
        if (beat in WARP_BEATS) hold(beat as WarpBeat, from);
      },
      play,
      release,
      /*
       * warpFrameAt is pure, so a beat that has already handed the page back can still be
       * asked what it looked like: the same t and the same from give the same numbers.
       * That is what lets verification assert values instead of eyeballing pixels.
       */
      state: () => {
        const beat = warpBeatRef.current;
        const live = warpRef.current
          ?? (beat === null ? null : warpFrameAt(WARP_BEATS[beat], warpFromRef.current));
        return {
          beat,
          t: live ? live.t : -1,
          progress: live ? live.progress : progressRef.current,
          cameraZ: live ? live.cameraZ : 0,
          fov: live ? live.fov : WARP_FOV_REST,
          roll: live ? live.roll : 0,
          stretch: live ? live.stretch : 0,
          opacity: live ? live.opacity : 0,
          feed: live ? live.feed : 0,
          flare: live ? live.flare : 0,
        };
      },
    };

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      warpRef.current = null;
      warpControlsRef.current = null;
      delete window.__showcaseWarp;
    };
  }, []);

  /*
   * A two and a half second full-screen move that cannot be stopped is a trap, so Escape
   * ends it where it stands rather than jumping it to the end. The wheel and touch blockers
   * are non-passive on purpose: they exist to stop a flick landing a competing scroll
   * inside the one stretch where the run is writing the scrollbar every frame.
   */
  useEffect(() => {
    if (!warping) return;

    const block = (event: Event) => event.preventDefault();
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") warpControlsRef.current?.release();
    };

    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", cancelOnEscape);

    return () => {
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, [warping]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const enterShowcase = useCallback(() => {
    if (!ready) return;
    setEntrySettled(false);
    setEntered(true);
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => shellRef.current?.focus({ preventScroll: true }));
  }, [ready]);

  const startWarp = useCallback(() => {
    // Re-entrancy: a second activation during the flight is not a second run.
    if (warpRef.current) return;
    setControlDwell(false);

    /*
     * A reader who has asked for less motion does not get a warp at all. The frameloop is
     * "demand" for them and only FrameAuthority ever calls invalidate, so a ref-driven run
     * would render exactly zero frames; and an instant jump to the archive is the right
     * answer for that reader independent of the constraint.
     */
    if (reducedMotion) {
      const shell = shellRef.current;
      const distance = shell ? Math.max(1, shell.offsetHeight - window.innerHeight) : 0;
      window.scrollTo(0, distance);
      finaleRef.current?.focus({ preventScroll: true });
      return;
    }

    // The control is about to fade out from under the focus ring, and a focused invisible
    // button is a trap. Focus parks on the shell for the flight and moves to the finale on
    // arrival.
    shellRef.current?.focus({ preventScroll: true });
    warpControlsRef.current?.arm(progressRef.current);
  }, [reducedMotion]);

  return (
    <main
      ref={shellRef}
      className={styles.shell}
      style={{
        "--track-screens": TRACK_SCREENS,
        "--showcase-bleach": bleach.toFixed(3),
        "--showcase-load": (displayPercent / 100).toFixed(3),
        ...(grainTile ? { "--showcase-grain": `url("${grainTile}")` } : null),
      } as React.CSSProperties}
      tabIndex={-1}
      data-ready={ready}
      data-entered={entered}
      data-entry-settled={entrySettled}
      data-menu-open={menuOpen}
      data-finale={finaleVisible}
      data-bleaching={bleaching}
      data-bleached={bleached}
      data-warping={warping}
    >
      <div className={styles.scene} aria-hidden="true">
        <ShowcaseScene
          progress={progress}
          ready={ready}
          entered={entered}
          entrySettled={entrySettled}
          compactViewport={compactViewport}
          reducedMotion={reducedMotion}
          cursorRef={pointerRef}
          warpRef={warpRef}
          onLoadProgress={onLoadProgress}
        />
        <div className={styles.entryFlood} />
      </div>

      {ready && !entrySettled ? (
        <div className={styles.entryObject} aria-hidden="true">
          <ShowcaseEntryScene
            ready={ready}
            entered={entered}
            entrySettled={entrySettled}
            reducedMotion={reducedMotion}
            cursorRef={pointerRef}
            onEnter={enterShowcase}
          />
        </div>
      ) : null}

      <header className={styles.header} aria-label="Showcase navigation">
        <Link className={styles.wordmark} href="/" aria-label="fullbuild.ai home">
          <span>FULLBUILD</span>
          <span>PROTOTYPES</span>
        </Link>

        <div className={styles.headerActions}>
          <a className={styles.mailLink} href="mailto:hi@fullbuild.ai">
            <span>Send email</span>
            <span className={styles.mailChip} aria-hidden="true">→</span>
          </a>
        </div>

        <div className={styles.mobileControls}>
          <button
            className={styles.menuButton}
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="showcase-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </button>
        </div>
      </header>

      <div
        id="showcase-mobile-menu"
        className={styles.mobileMenu}
        aria-hidden={!menuOpen}
      >
        <nav aria-label="Mobile navigation">
          <a href="mailto:hi@fullbuild.ai">Send email</a>
        </nav>
        <p>Interactive systems, digital products, and stories that hold up under pressure</p>
      </div>

      {/*
        THE SHEET GOES LIVE. One drawing in two materials, stacked: a drafting sheet in
        graphite on vellum under the same geometry in frost on the void. A registration box
        is ruled around the mark, turns revision red, then travels across as a cut and blows
        out to the page. The two plates carry identical geometry at identical size, so the
        mark converts column by column with nothing to misregister. Every band is derived in
        the stylesheet from --showcase-load alone; nothing here owns a clock.
      */}
      <section className={styles.starter} aria-label="fullbuild.ai showcase loading" data-ready={ready} data-held={held}>
        <p className={styles.loadReadout} aria-live="polite">
          {announcedPercent}%
        </p>

        <div className={styles.loadSheet} aria-hidden="true">
          <LoaderPlate variant="sheet" styles={styles} />
          <div className={styles.starterBottom}>
            <p className={styles.loadNumber}>{loadReadout}<span>%</span></p>
            <p className={styles.starterMark}>
              <span><span>F</span><span>U</span><span>L</span><span>L</span></span>
              <span><span>B</span><span>U</span><span>I</span><span>L</span><span>D</span></span>
            </p>
          </div>
        </div>

        <div className={styles.loadWorld} aria-hidden="true">
          <LoaderPlate variant="world" styles={styles} />
          <div className={styles.starterBottom}>
            <p className={styles.loadNumber}>{loadReadout}<span>%</span></p>
            {/* No aria-label here: the whole layer is aria-hidden and a bare paragraph has no
                role for a label to name. The region carries the name instead. */}
            <p className={styles.starterMark}>
              <span><span>F</span><span>U</span><span>L</span><span>L</span></span>
              <span><span>B</span><span>U</span><span>I</span><span>L</span><span>D</span></span>
            </p>
          </div>
        </div>

        <div className={styles.loadBox} aria-hidden="true" />
        <div className={styles.loadEdge} aria-hidden="true" />
      </section>

      {ready && !entrySettled ? (
        <section
          className={styles.entryGate}
          aria-labelledby="showcase-entry-title"
          data-entering={entered}
        >
          {/*
            A title card, not a manifesto: two words at the scale of the page with the year
            and the disciplines on one quiet row under them. The name is carried once, for
            a screen reader, so the spread letters can stay decorative.
          */}
          <h1 className={styles.heroSignal} id="showcase-entry-title">
            <span className={styles.heroName}>FullBuild Prototypes 2026</span>
            <span className={`${styles.heroLine} ${styles.heroSpread}`} aria-hidden="true">
              <HeroLetters text="FULLBUILD" />
            </span>
            <span className={`${styles.heroLine} ${styles.heroSpread}`} aria-hidden="true">
              <HeroLetters text="PROTOTYPES" />
            </span>
            <span className={styles.heroLine} aria-hidden="true">
              <b>2026</b>
              <small className={styles.heroMeta}>
                <span>IMMERSIVE WEB</span>
                <span>DIGITAL STORYTELLING</span>
                <span>WEBGL · MOTION · SYSTEMS</span>
              </small>
            </span>
          </h1>
        </section>
      ) : null}

      {/*
        Two blue blocks, one click target: the pill and the arrow tile are siblings inside
        the control rather than a badge nested in a lozenge. It stands outside the gate
        because a fixed element is its own stacking context whatever its z-index, so a
        control nested in the gate can never rise above the artifact layer, and the
        artifact takes the pointer now that the mark is a control of its own.
      */}
      {ready && !entrySettled ? (
        <button
          className={styles.enterButton}
          type="button"
          data-entering={entered}
          onClick={enterShowcase}
        >
          <span className={styles.enterLabel}>Prototypes</span>
          <span className={styles.enterArrow} aria-hidden="true">→</span>
        </button>
      ) : null}

      {/*
        The pill belongs to the crystal, not to the cursor. ShowcaseScene projects the
        hovered crystal's edge into --showcase-anchor-x/y every frame and this rides it.
      */}
      <p className={styles.sceneLabel} data-visible={ledgerVisible && progress < 0.96}>
        <b>{activeProject.title}</b>
        <span>{activeProject.eyebrow}</span>
      </p>

      <section className={styles.ledger} data-visible={ledgerVisible} aria-live="polite">
        <div className={styles.ledgerProject}>
          <p className={styles.ledgerLabel}>Project</p>
          <div className={styles.projectRow} key={`project-${activeProject.id}`}>
            <h1>{activeProject.title}</h1>
            {/*
              A plain anchor with a full page navigation: several targets are static
              exports rather than app routes, so a router transition cannot reach them.
              It stays matched by BLEACH_CONTROL, so dwelling here still drains the world
              while the link keeps its radiation blue.
            */}
            <a href={activeProject.href} aria-label={`View ${activeProject.title}`}>View</a>
          </div>
        </div>
        <div className={styles.ledgerInfo} key={`info-${activeProject.id}`}>
          <p className={styles.ledgerLabel}>Info</p>
          <p className={styles.summary}>{activeProject.summary}</p>
          <ul aria-label="Project disciplines">
            {activeProject.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        </div>
      </section>

      {/*
        VIEW opens one thing. VIEW ALL opens everything. This is not a new control, it is the
        ledger's own VIEW block set down a second time at the other end of the same floor, so
        the bottom of the frame reads Project, Info, then a long gap, then Index. It sits
        between the ledger and the finale in the DOM so the tab walk runs header, VIEW, VIEW
        ALL, arrival.

        It rides the ledger's own visibility, which already contains entrySettled, so it
        cannot be reached while the entry choreography is still running and a second WebGL
        context is still mounted.
      */}
      <button
        className={styles.warpButton}
        type="button"
        data-visible={ledgerVisible}
        aria-label="View all prototypes"
        onClick={startWarp}
      >
        <span className={styles.warpBlock}>View all</span>
      </button>

      {/*
        The last screen is a typographic wall standing inside the live field, not a card on
        a black page: the canvas keeps rendering behind it and only the pointer on a control
        is ever allowed to take the colour out.

        tabIndex -1 so the run has somewhere honest to land: it is a named region already, so
        moving focus here on arrival announces the destination with no live region added.
      */}
      <section className={styles.finale} ref={finaleRef} data-visible={finaleVisible} aria-label="Contact" tabIndex={-1}>
        {/*
          The last screen is also the site's prototype index: ten cards over the lockup,
          five under it. Plain anchors, so the bleach hover rules already cover them, and
          the handset regroups them around the mailto with grid order alone, never JS.
        */}
        <nav className={styles.indexGrid} data-band="top" aria-label="Prototype index">
          {PROTOTYPE_INDEX.slice(0, 10).map((entry) => (
            <a key={entry.id} className={styles.indexCard} href={entry.href} aria-label={`Open ${entry.title}`}>
              <img src={entry.image} alt="" loading="lazy" decoding="async" />
              <span className={styles.indexCaption}>{entry.title}</span>
            </a>
          ))}
        </nav>
        <div className={styles.finaleLockup}>
          <a className={styles.finaleHandle} href="mailto:hi@fullbuild.ai">HI@FULLBUILD.AI</a>
        </div>
        <nav className={styles.indexGrid} data-band="bottom" aria-label="Prototype index continued">
          {PROTOTYPE_INDEX.slice(10).map((entry) => (
            <a key={entry.id} className={styles.indexCard} href={entry.href} aria-label={`Open ${entry.title}`}>
              <img src={entry.image} alt="" loading="lazy" decoding="async" />
              <span className={styles.indexCaption}>{entry.title}</span>
            </a>
          ))}
        </nav>
        <div className={styles.socials}>
          <a href="https://www.linkedin.com/in/ryan-allen-d/" rel="noreferrer">LinkedIn</a>
        </div>
      </section>

      <section className={styles.accessibleProjects} aria-label="Showcase projects">
        <h2>Showcase projects</h2>
        <ol>
          {SHOWCASE_PROJECTS.map((project) => (
            <li key={project.id}>
              <h3>{project.title}</h3>
              <p>{project.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <noscript>
        <section className={styles.noScript}>
          <h1>fullbuild.ai Showcase</h1>
          <p>Nine interactive prototypes spanning product, identity, motion, and WebGL</p>
          <ol>
            {SHOWCASE_PROJECTS.map((project) => <li key={project.id}>{project.title}</li>)}
          </ol>
          <a href="mailto:hi@fullbuild.ai">HI@FULLBUILD.AI</a>
        </section>
      </noscript>
    </main>
  );
}
