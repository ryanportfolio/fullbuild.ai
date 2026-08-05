"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { releaseIntroHold } from "@/lib/introHold";
import styles from "./intro.module.css";
import IntroFilm from "./IntroFilm";
import { makeIntroGrainTile } from "./introGeometry";
import {
  BURST_START,
  ENTRANCE_LEAD_MS,
  HANDOVER_MS,
  INTRO_BEATS,
  INTRO_DRAW_POINTS,
  INTRO_END,
  INTRO_LAND_FLOOR,
  INTRO_LAND_POINTS,
  INTRO_MAX_MS,
  INTRO_MIN_MS,
  INTRO_OPEN_POINTS,
  INTRO_OPEN_RATIO,
  INTRO_STEP_MS,
  INTRO_SWEEP_MS,
  INTRO_WEIGHTS,
  SETTLE_MS,
  SETTLE_START,
  SKIP_FADE_MS,
  clamp01,
  phaseAt,
  progressBetween,
  smoothstep,
  type IntroBeat,
  type IntroSignal,
} from "./introTiming";

declare global {
  interface Window {
    __introFilm?: {
      hold: (percent: number) => void;
      release: () => void;
      beat: (name: IntroBeat) => void;
      play: () => void;
      state: () => { percent: number; phase: string; tPost: number; held: boolean };
    };
    __introGuard?: number;
  }
}

/*
 * CHUNK THREE. three.js, the sculpture, the space and the geometry, split off behind a
 * dynamic import so the homepage's JS baseline is unchanged for anyone who never sees the
 * intro. Resolving this promise is also a real load signal, which is why the module is
 * latched here rather than left to next/dynamic's own bookkeeping: the film should not
 * reach a hundred while the artifact it is about to hand over to is still downloading.
 */
let sceneChunkReady = false;

const IntroScene = dynamic(
  () => import("./IntroScene").then((mod) => {
    sceneChunkReady = true;
    return mod;
  }),
  { ssr: false },
);

const SCROLL_KEYS = new Set([
  " ",
  "Spacebar",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

type LenisLike = { stop: () => void; start: () => void };

function lenis(): LenisLike | undefined {
  return (window as unknown as { __lenis?: LenisLike }).__lenis;
}

/*
 * THE OVERLAY. It owns three things and delegates everything else: the progress model that
 * drives act one, the wall clock that drives acts two to four, and every way out.
 *
 * TWO CLOCKS, DELIBERATELY DIFFERENT IN KIND. The film is a pure function of load percent
 * and never sees a wall clock, so a fast machine plays it fast and a stall parks it on a
 * legitimate half inked sheet. The cinematic is a camera move, so it runs on a wall clock
 * and is made capturable by named beats instead. Both advance off the same capped delta, so
 * a backgrounded tab pauses the whole intro rather than fast-forwarding through it.
 */
export default function HomepageIntro({ onDone }: { onDone: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const uncoverRef = useRef<(() => void) | null>(null);

  const [displayPercent, setDisplayPercent] = useState(0);
  /*
   * Two kinds of freeze, and they are not interchangeable. Holding a percent photographs
   * the FILM, so the film has to be forced back on screen with nothing in flight. Pinning a
   * beat photographs the CINEMATIC, so the film has to be gone instantly rather than caught
   * mid-handover, or every captured beat is a picture of a fade.
   */
  const [held, setHeld] = useState(false);
  const [beatPinned, setBeatPinned] = useState(false);
  const [phase, setPhase] = useState<string>("film");
  const [skipping, setSkipping] = useState(false);
  const [grainTile, setGrainTile] = useState<string | null>(null);

  const displayRef = useRef(0);
  const targetRef = useRef(0);
  const holdRef = useRef<number | null>(null);
  const beatRef = useRef<number | null>(null);
  /*
   * PINNED MEANS SETTLED, IMMEDIATELY. Pinning tPost and the pointer was not enough to make a
   * beat reproducible: every pose in the scene is damped, damping converges asymptotically
   * from wherever the previous frame left it, and beat() renders straight away. Measured, the
   * same beat re-pinned differed by 0.79% of the frame and the mark sat one to two pixels off,
   * so the hook's byte for byte promise held only after several seconds of waiting that
   * nothing documented. This ref tells every damped term to take its target outright, so the
   * first frame after a pin is the settled frame.
   */
  const pinnedRef = useRef(false);
  const tPostRef = useRef(-1);
  const skipRef = useRef(false);
  const skipAtRef = useRef<number | null>(null);
  const releasedRef = useRef(false);
  /*
   * The frame loop's own restart, reachable from outside the effect that owns it. A capture
   * freeze parks the loop deliberately, and the way out has to be able to start it again.
   */
  const pumpRef = useRef<(() => void) | null>(null);

  const signalsRef = useRef<Set<IntroSignal>>(new Set());
  const firstFrameRef = useRef(false);
  const timeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });

  const ready = displayPercent >= 100;
  /*
   * The announced number moves in tens. A live region following every integer queues about
   * a hundred announcements inside a second and a half, and a screen reader spends the whole
   * load reading a counter. Eleven steps say the same thing.
   */
  const announcedPercent = String(Math.min(100, Math.floor(displayPercent / 10) * 10)).padStart(2, "0");

  const [released, setReleased] = useState(false);

  // Drawn on the client, once, from the repo's one seeded generator.
  useEffect(() => setGrainTile(makeIntroGrainTile()), []);

  const resolveSignal = useCallback((signal: IntroSignal) => {
    signalsRef.current.add(signal);
  }, []);

  const onFirstFrame = useCallback(() => {
    firstFrameRef.current = true;
    resolveSignal("FIRST_FRAME");
  }, [resolveSignal]);

  /*
   * THE WAY OUT, and there is exactly one of it. Every input lands here: click, Escape,
   * Enter, wheel, touch, and any key that would have scrolled. It is idempotent, and it does
   * not matter which act was running, because it does the same thing in all of them. It
   * freezes the clock where it stands and fades what is on screen to the page.
   *
   * Freezing rather than jumping to the settle is deliberate. Jumping there mid-film would
   * put the flood at full opacity for a frame, which paints the page's own ground over the
   * drawing before the fade starts: a flash, on the way out of an intro whose whole job was
   * to avoid one.
   */
  const skip = useCallback(() => {
    if (skipRef.current || releasedRef.current) return;
    skipRef.current = true;
    skipAtRef.current = performance.now();
    /*
     * A CAPTURE FREEZE IS NOT A LOCKED DOOR, and it was one. hold() and beat() park the frame
     * loop on purpose, since a held frame that kept re-arming rAF would not be held. But a
     * skip arriving while one of them held was recorded and then never acted on: nothing restarted
     * the loop, so the fade ran on the compositor, release() never fired, and the reader was
     * left on a normal looking homepage that was inert, unfocusable and unscrollable behind an
     * overlay at zero opacity. Not reachable from the page (the hook is capture-only), but it
     * is exactly the state the verification procedure leaves a page in, and it falsified the
     * claim that skipping works from wherever you are.
     *
     * The way out outranks the freeze, so the freeze is dropped here and the loop restarted.
     * Dropping it in the same call also lets the film fade: .film[data-held="true"] pins
     * opacity and kills transitions, so a skip that left the held flag up would have nothing
     * to fade.
     */
    holdRef.current = null;
    beatRef.current = null;
    pinnedRef.current = false;
    setHeld(false);
    setBeatPinned(false);
    setSkipping(true);
    pumpRef.current?.();
  }, []);

  const release = useCallback(() => {
    if (releasedRef.current) return;
    releasedRef.current = true;
    setReleased(true);
  }, []);

  /* ── the clock ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    let last = start;

    const signalTotal = () => {
      let sum = 0;
      for (const signal of signalsRef.current) sum += INTRO_WEIGHTS[signal];
      return sum;
    };

    const paint = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      overlay.style.setProperty("--intro-load", (displayRef.current / 100).toFixed(3));

      const tPost = tPostRef.current;
      /*
       * THE LAST TWO ACTS ARE ONE EXCHANGE, and it has to be an exchange rather than two
       * fades in sequence. The flood rises to full across the burst while the canvas goes
       * out underneath it, so by the settle there is no warp left to see: the frame is the
       * page's own ground and nothing else. Then the flood itself fades and the homepage
       * comes through from behind a layer that was already its exact colour.
       *
       * Getting this wrong is not subtle. Fading the flood off while the canvas is still
       * running reveals a full-brightness streak field on the last frame before the overlay
       * unmounts, and the intro ends on a hard cut from deep space to a paper drawing.
       */
      const burst = progressBetween(tPost, BURST_START, SETTLE_START);
      const settle = progressBetween(tPost, SETTLE_START, SETTLE_START + SETTLE_MS);
      const rise = tPost < BURST_START ? 0 : smoothstep(burst);
      const fall = tPost < SETTLE_START ? 0 : smoothstep(settle);
      const flood = rise * (1 - fall);
      /*
       * THE OVERLAY IS NEVER SEE-THROUGH, and the naive pairing made it exactly that. Taking
       * the canvas out on 1 - rise while the flood came up on rise put both layers near a
       * half at the middle of the burst, and two half opaque layers do not add to one: a
       * quarter of the homepage came through, so the burst read as a three way cross dissolve
       * over a page the reader was not supposed to have arrived at yet, on precisely the
       * frames Risk R7 says the flood exists to cover.
       *
       * So the canvas holds at full until the flood is opaque, and only then leaves, behind a
       * layer that is already covering it. The step is invisible by construction: it happens
       * under a flood at 0.985 or better, where the most that can show through is two parts in
       * ten thousand.
       */
      const stage = 1 - clamp01((rise - 0.985) / 0.015);
      /*
       * The lift rides a ramp rather than a boolean. Toggling the flood's colour on an
       * attribute changes it by a fifth in a single frame while the layer is at full
       * opacity, which is a visible step in the one place the piece is meant to read as
       * light rather than as a layer. It peaks exactly where the flood becomes opaque, so
       * the brightest frame is the one that covers, and it resolves to the page's own
       * ground on the way out.
       */
      const lift = rise * (1 - fall);
      overlay.style.setProperty("--flood", flood.toFixed(3));
      overlay.style.setProperty("--flood-lift", lift.toFixed(3));
      overlay.style.setProperty("--stage-fade", stage.toFixed(3));
    };

    const step = () => {
      frame = 0;
      const now = performance.now();
      const delta = Math.min(INTRO_STEP_MS, now - last);
      last = now;

      /*
       * THE WAY OUT IS CHECKED FIRST, above both freezes. skip() drops the freeze itself, so
       * on the normal path neither branch below is reachable while skipping; the order is
       * what makes that structural rather than a matter of two writes landing in the right
       * sequence.
       */
      if (skipRef.current) {
        const since = now - (skipAtRef.current ?? now);
        /*
         * The page's own opening starts inside this fade rather than after it, for the same
         * reason it does on the natural path: a reader who cuts the intro short should land
         * on a page in motion, not on one waiting to begin. Measured back from the end of the
         * short skip fade, and floored at zero so a lead longer than the fade simply releases
         * at once.
         */
        if (since >= Math.max(0, SKIP_FADE_MS - ENTRANCE_LEAD_MS)) releaseIntroHold();
        paint();
        if (since >= SKIP_FADE_MS) {
          release();
          return;
        }
        frame = window.requestAnimationFrame(step);
        return;
      }

      // A pinned beat photographs one frame and holds it. Nothing advances, and the owner's
      // clock is pinned to the beat so every idle sine in the scene lands where it landed
      // last time.
      if (beatRef.current !== null) {
        tPostRef.current = beatRef.current;
        timeRef.current = beatRef.current / 1000;
        pointerRef.current.x = 0;
        pointerRef.current.y = 0;
        paint();
        return;
      }

      if (holdRef.current !== null) {
        paint();
        return;
      }

      timeRef.current = (now - start) / 1000;

      if (displayRef.current < 100) {
        const elapsed = now - start;
        /*
         * REAL SIGNALS, SHAPED BY TWO BOUNDS. The ceiling stops a warm cache from finishing
         * the drawing before it has been watched; the floor stops one stalled signal from
         * parking the film forever. Between them the counter is reporting work that actually
         * happened.
         */
        const ceiling = clamp01(elapsed / INTRO_MIN_MS) * 100;
        const floor = clamp01(elapsed / INTRO_MAX_MS) * 100;
        if (sceneChunkReady) resolveSignal("CHUNK");
        const signals = signalTotal();
        let target = Math.max(floor, Math.min(signals, ceiling));
        target = Math.min(100, Math.max(0, target));
        /*
         * THE BLACK FLASH GATE. The film may not hand over to an artifact that has never
         * painted a frame. Resting on 99 while WebGL compiles reads as a real load, which is
         * exactly what it is; the max bound is the escape hatch, where one flashed frame
         * beats a loader that never leaves.
         */
        if (!firstFrameRef.current && elapsed < INTRO_MAX_MS) target = Math.min(target, 99);
        targetRef.current = target;

        const gap = targetRef.current - displayRef.current;
        let next = displayRef.current;
        if (gap > 0) {
          /*
           * The draw zone runs flat at the open ratio so no entrance band can be crossed
           * whole between frames 150ms apart; the ramp to full pace starts above it.
           */
          const drawn = Math.max(0, displayRef.current - INTRO_DRAW_POINTS);
          const openness = Math.min(1, drawn / (INTRO_OPEN_POINTS - INTRO_DRAW_POINTS));
          const pace = INTRO_OPEN_RATIO + (1 - INTRO_OPEN_RATIO) * openness * openness;
          const swept = (delta * 100 * pace) / INTRO_SWEEP_MS;
          const taper = Math.max(Math.min(1, gap / INTRO_LAND_POINTS), INTRO_LAND_FLOOR);
          next = gap <= 0.3 ? targetRef.current : displayRef.current + Math.min(gap, swept * taper);
        }
        if (next > displayRef.current) {
          displayRef.current = next;
          setDisplayPercent(next);
        }
        if (displayRef.current >= 100) tPostRef.current = 0;
      } else {
        if (tPostRef.current < 0) tPostRef.current = 0;
        tPostRef.current += delta;
      }

      paint();

      const nextPhase = phaseAt(tPostRef.current);
      setPhase((current) => (current === nextPhase ? current : nextPhase));

      /*
       * THE HEAD START. The page's opening act has been held since before first paint; it is
       * let go here, inside the settle, so the wordmark is already plotting under a flood that
       * is still dissolving. Handing over at INTRO_END instead would put a beat of finished
       * stillness between the two films and then start the page from zero, which is the seam
       * this whole mechanism exists to remove. Idempotent, so calling it every frame from here
       * to the end costs one boolean read.
       */
      if (tPostRef.current >= INTRO_END - ENTRANCE_LEAD_MS) releaseIntroHold();

      if (tPostRef.current >= INTRO_END) {
        release();
        return;
      }

      frame = window.requestAnimationFrame(step);
    };

    const pump = () => {
      if (frame) return;
      last = performance.now();
      frame = window.requestAnimationFrame(step);
    };
    pumpRef.current = pump;

    pump();

    /*
     * THE CAPTURE HOOK, deliberately its own global. window.__capture belongs to DrawingSet
     * and is reassigned wholesale on every dep change, so anything merged into it would be
     * blown away. Holding a percent reproduces a film frame exactly, because the film has no
     * clock; pinning a beat reproduces a cinematic frame, because pinning also pins the
     * owner's clock and zeroes the pointer that every damped chase reads.
     */
    window.__introFilm = {
      hold: (percent: number) => {
        const value = Math.min(100, Math.max(0, percent));
        beatRef.current = null;
        pinnedRef.current = false;
        holdRef.current = value;
        displayRef.current = value;
        tPostRef.current = -1;
        setDisplayPercent(value);
        setHeld(true);
        setBeatPinned(false);
        pump();
      },
      release: () => {
        holdRef.current = null;
        beatRef.current = null;
        pinnedRef.current = false;
        setHeld(false);
        setBeatPinned(false);
        pump();
      },
      beat: (name: IntroBeat) => {
        const value = INTRO_BEATS[name];
        if (value === undefined) return;
        holdRef.current = null;
        beatRef.current = value;
        pinnedRef.current = true;
        displayRef.current = 100;
        tPostRef.current = value;
        setDisplayPercent(100);
        setHeld(false);
        setBeatPinned(true);
        setPhase(phaseAt(value));
        pump();
      },
      play: () => {
        holdRef.current = null;
        beatRef.current = null;
        pinnedRef.current = false;
        setHeld(false);
        setBeatPinned(false);
        pump();
      },
      state: () => ({
        percent: displayRef.current,
        phase: phaseAt(tPostRef.current),
        tPost: tPostRef.current,
        held: holdRef.current !== null || beatRef.current !== null,
      }),
    };

    /*
     * DELIBERATELY NOT RELEASING THE HOLD HERE. An effect cleanup looks like the obvious place
     * to guarantee the page gets let go, and it is the wrong one: React runs cleanups for
     * reasons that are not teardowns. Under StrictMode this effect is invoked, cleaned up and
     * re-invoked on mount, and measured on 3031 that fired ws:intro-entrance at t=1219ms,
     * nine hundred milliseconds before the overlay itself existed. The whole entrance then ran
     * behind the curtain again, with the fix in place and the tests green.
     *
     * So the release is anchored to a fact about the intro rather than to a React lifecycle:
     * the scheduled releases in the loop above, the single one-way `released` effect below,
     * and a hard deadline in the pre-paint script that nothing here clears.
     */
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      pumpRef.current = null;
      delete window.__introFilm;
    };
  }, [release, resolveSignal]);

  /* ── the load signals ────────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;

    if (document.readyState === "complete") {
      resolveSignal("PAGE");
    } else {
      const onLoad = () => resolveSignal("PAGE");
      window.addEventListener("load", onLoad, { once: true });
    }

    /*
     * Fonts carry the largest single share for a structural reason. The FULLBUILD lockup
     * interpolates font-weight and font-stretch on the loaded Archivo face, so a film that
     * finished before the fonts landed would show the lockup snapping its metrics at the
     * exact moment the drawing is meant to become the object.
     */
    document.fonts?.ready.then(() => {
      if (alive) resolveSignal("FONTS");
    });

    return () => {
      alive = false;
    };
  }, [resolveSignal]);

  /* ── first paint: take the pre-paint cover off ───────────────────────────── */

  useEffect(() => {
    const root = document.documentElement;
    if (window.__introGuard) {
      window.clearTimeout(window.__introGuard);
      delete window.__introGuard;
    }
    // The cover and the film's opening ground are the same colour, so the swap is invisible
    // in either direction and a one frame overlap costs nothing.
    root.removeAttribute("data-intro-pending");
  }, []);

  /* ── every way out ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const onPointerDown = () => skip();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        /*
         * PREVENTING THE DEFAULT IS THE WHOLE FIX, not tidiness. Enter is the documented way
         * out, and without this it skipped the intro AND fired its own default activation on
         * whatever happened to be focused under the opaque overlay. One Tab and one Enter,
         * both of them keystrokes this design tells the reader to use, opened an external
         * link the reader had never seen in a new tab.
         */
        event.preventDefault();
        skip();
        return;
      }
      /*
       * AND THE OVERLAY KEEPS ITS FOCUS. Containment below makes the page unreachable, but
       * inert is a young attribute and this costs one branch: there is nothing focusable
       * inside the overlay, so tabbing has one honest answer, which is to stay put.
       */
      if (event.key === "Tab") {
        event.preventDefault();
        overlayRef.current?.focus({ preventScroll: true });
        return;
      }
      if (SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
        skip();
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      skip();
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      skip();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    /*
     * NO OVERFLOW HIDDEN, ANYWHERE. Hiding overflow removes the scrollbar and shifts the
     * whole page sideways by its width, which is visible the instant the overlay clears.
     * Preventing the scroll inputs and stopping Lenis holds the page still without touching
     * layout at all.
     */
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [skip]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      // A pinned beat owns the pointer. Letting a stray mouse move nudge the chase during a
      // capture is exactly the kind of drift the freeze exists to remove.
      if (beatRef.current !== null) return;
      pointerRef.current.x = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerRef.current.y = -(event.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  /*
   * A reader who turns the preference on mid-intro is asking for it to stop now, not at the
   * end of the warp.
   */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      if (query.matches) skip();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [skip]);

  /* ── holding the page still, and handing it back ─────────────────────────── */

  useEffect(() => {
    // DrawingSet may mount after this overlay, so the stop is attempted twice: once now and
    // once on the first tick, by which point the instance exists.
    lenis()?.stop();
    const settle = window.setTimeout(() => lenis()?.stop(), 0);
    overlayRef.current?.focus({ preventScroll: true });

    /*
     * THE PAGE IS BEHIND A CURTAIN, SO IT IS BEHIND ONE FOR EVERYONE. Sighted readers get an
     * opaque overlay; screen reader users were getting the whole finished homepage, six
     * reachable headings, every link, and the title block's own aria-live region announcing
     * updates underneath a film they could not see, while the intro's percent announced over
     * the top of it. Two live regions competing is not a second opinion, it is noise.
     *
     * Marked on the overlay's siblings rather than on a wrapper, because the overlay is a
     * body child in its own right: DrawingSet's <main> carries perspective, so nesting a
     * fixed overlay inside it would size to the document instead of the viewport. Prior
     * values are remembered and put back, so a page that was already hidden for its own
     * reasons stays that way.
     */
    const covered: Array<{ node: HTMLElement; hidden: string | null; inert: boolean }> = [];
    for (const node of Array.from(document.body.children)) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === overlayRef.current || node.contains(overlayRef.current)) continue;
      covered.push({
        node,
        hidden: node.getAttribute("aria-hidden"),
        inert: node.hasAttribute("inert"),
      });
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    }

    /*
     * Held as a ref rather than left to this effect's cleanup, because the curtain has to
     * come up BEFORE focus is handed to the page. Focusing an inert element does nothing, so
     * a release that lifted the curtain on unmount would leave the reader's focus on a
     * disappearing overlay and drop them back at the top of the tab order.
     */
    uncoverRef.current = () => {
      uncoverRef.current = null;
      for (const { node, hidden, inert } of covered) {
        if (hidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", hidden);
        if (!inert) node.removeAttribute("inert");
      }
    };

    return () => {
      window.clearTimeout(settle);
      uncoverRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!released) return;

    /*
     * THE LAST WORD ON THE HOLD, and it is here rather than in a cleanup because `released` is
     * a fact about the intro instead of a fact about React: it is one way, it is set by the
     * only two things that end this overlay, and it cannot be triggered by a remount. By this
     * point the scheduled release has almost always already run a fifth of a second earlier,
     * which is the point of it; this is what makes the page reachable if it did not.
     */
    releaseIntroHold();

    // The curtain first, then the page. In the other order focus is handed to an inert
    // element and simply does not land.
    uncoverRef.current?.();
    window.scrollTo(0, 0);
    lenis()?.start();

    /*
     * Focus lands on page content rather than back on <body>, and the page's own tab order
     * is put back the way it was as soon as focus moves on.
     */
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
    }

    /*
     * The masthead plot runs from its own layout effect on mount and finishes behind the
     * overlay, so the reader lands on an already-drawn wordmark. That is the correct read:
     * the intro is the opening drawing act, and a second one two seconds later would restate
     * it. This event exists so that decision stays reversible in one file rather than
     * needing this one reopened.
     */
    window.dispatchEvent(new CustomEvent("ws:intro-cleared"));

    /*
     * AND THEN GO AWAY PROPERLY. Rendering null is not unmounting: this component's own
     * effects keep running, which would leave the wheel and touchmove listeners attached
     * calling preventDefault on every scroll for the rest of the session, the keydown
     * listener swallowing Space and the arrows, and window.__introFilm pointing at a film
     * that no longer exists. The gate above owns whether this component exists, so it is
     * told, and every cleanup runs on the way out.
     */
    onDone();
  }, [released, onDone]);

  if (released) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      /*
       * A MODAL, BECAUSE THAT IS WHAT IT IS. It covers everything, it takes every input, and
       * nothing behind it can be reached until it leaves. Saying so is what tells assistive
       * technology to stay inside it rather than wander the page underneath.
       */
      role="dialog"
      aria-modal="true"
      aria-label="Site intro"
      data-phase={phase}
      data-skipping={skipping}
      style={{
        // A pinned beat takes the handover to zero, so the film is already gone on the
        // frame the beat is captured instead of being caught part way through its fade.
        ["--handover-ms" as string]: beatPinned ? "0ms" : `${HANDOVER_MS}ms`,
        ["--skip-fade-ms" as string]: `${SKIP_FADE_MS}ms`,
      }}
    >
      {/*
        * ACT TWO ONWARD, painted under the film from the moment the chunk lands. The film
        * fades off an object that is already standing at the identical size and place, so
        * the handover reads as the drawing becoming the object rather than as a crossfade
        * between two pictures.
        */}
      <div className={styles.stage}>
        <IntroScene
          timeRef={timeRef}
          pointerRef={pointerRef}
          tPostRef={tPostRef}
          pinnedRef={pinnedRef}
          onFirstFrame={onFirstFrame}
        />
        {grainTile ? (
          <div
            className={styles.grain}
            style={{ backgroundImage: `url(${grainTile})` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <IntroFilm percent={displayPercent} ready={ready} held={held} />

      <div ref={floodRef} className={styles.flood} aria-hidden="true" />

      {/*
        * The only spoken lines in the whole intro. Both drawn readouts sit inside
        * aria-hidden layers, so this is what a screen reader follows, and it is present from
        * percent zero.
        */}
      <p className={styles.readout} aria-live="polite">{announcedPercent}%</p>
      <p className={styles.readout}>Press Escape to skip the intro</p>
    </div>
  );
}
