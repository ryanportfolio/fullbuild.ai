"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/prototype/showcase/showcase.module.css";
import { activeProjectIndex, SHOWCASE_PROJECTS, TRACK_SCREENS } from "./data";
import { hashSeed, seededRandom } from "./prng";
import { ShowcaseEntryScene, ShowcaseScene } from "./ShowcaseScene";
import { LoaderPlate } from "./ShowcaseLoader";

declare global {
  interface Window {
    __showcaseLoader?: {
      hold: (percent: number) => void;
      release: () => void;
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
 * The opening is the drawing act, and a drawing is watched, not flashed. Below the opening
 * point count the sweep runs at the opening ratio and eases up to full speed, so the
 * setting out and the first object lines take about a third of a second more than they
 * would flat out, on every machine, without touching the film's percent keying.
 */
const LOAD_OPEN_POINTS = 22;
const LOAD_OPEN_RATIO = 0.38;

function bleachControl(node: EventTarget | null) {
  if (!(node instanceof Element)) return null;
  const control = node.closest(BLEACH_CONTROL);
  // The entry gate's own call to action opens the journey; it never drains it.
  return control && !control.closest(`.${styles.entryGate}`) ? control : null;
}

/*
 * The manifesto is justified word by word, not span by span. `space-between` can only
 * push apart the children it is given, so every word becomes its own child and the
 * copy stays one readable string in this file.
 */
function HeroWords({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <>
      {text.split(" ").map((word, index) => (
        accent
          ? <b key={`${word}-${index}`}>{word}</b>
          : <span key={`${word}-${index}`}>{word}</span>
      ))}
    </>
  );
}

export function ShowcaseApp() {
  const shellRef = useRef<HTMLElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });
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
          const openness = Math.min(1, displayRef.current / LOAD_OPEN_POINTS);
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
    const updateCursor = (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
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
          />
        </div>
      ) : null}

      <header className={styles.header} aria-label="Showcase navigation">
        <Link className={styles.wordmark} href="/" aria-label="fullbuild.ai home">
          <span>FULLBUILD</span>
          <span>SHOWCASE</span>
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
          <LoaderPlate variant="sheet" />
          <div className={styles.starterBottom}>
            <p className={styles.loadNumber}>{loadReadout}<span>%</span></p>
            <p className={styles.starterMark}><span>FULL</span><span>BUILD</span></p>
          </div>
        </div>

        <div className={styles.loadWorld} aria-hidden="true">
          <LoaderPlate variant="world" />
          <div className={styles.starterBottom}>
            <p className={styles.loadNumber}>{loadReadout}<span>%</span></p>
            {/* No aria-label here: the whole layer is aria-hidden and a bare paragraph has no
                role for a label to name. The region carries the name instead. */}
            <p className={styles.starterMark}><span>FULL</span><span>BUILD</span></p>
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
          <h1 className={styles.heroSignal} id="showcase-entry-title">
            <span className={styles.heroLine}>
              <HeroWords text="STEP INTO" />
              <small className={styles.heroMeta} aria-hidden="true">
                <span>IMMERSIVE WEB</span>
                <span>DIGITAL STORYTELLING</span>
                <span>WEBGL · MOTION · SYSTEMS</span>
              </small>
              <HeroWords text="FULLBUILD 2026" accent />
            </span>
            <span className={styles.heroLine}>
              <HeroWords text="NINE PROTOTYPES BECAME REAL" />
            </span>
            <span className={styles.heroLine}>
              <HeroWords text="EVERY SCREEN A" />
              <HeroWords text="STORY" accent />
            </span>
            <span className={styles.heroLine}>
              <HeroWords text="THROUGH WEBGL, 3D, MOTION &" />
            </span>
            <span className={styles.heroLine}>
              <HeroWords text="INTERACTIVE" accent />
              <HeroWords text="SYSTEMS AT SCALE" />
            </span>
          </h1>
          {/* Two blue blocks, one click target: the pill and the arrow tile are siblings
              inside the control rather than a badge nested in a lozenge. */}
          <button className={styles.enterButton} type="button" onClick={enterShowcase}>
            <span className={styles.enterLabel}>Get started</span>
            <span className={styles.enterArrow} aria-hidden="true">→</span>
          </button>
        </section>
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
              aria-disabled, never the disabled attribute. A natively disabled control is
              inert to pointer events in some browsers, and this CTA is one of the anchors
              the bleach listens to: dwelling on it has to drain the world while the button
              itself keeps its radiation blue. The attribute swap changes nothing visually
              because every colour on this control is set here rather than inherited from a
              user agent :disabled rule.
            */}
            <button
              type="button"
              aria-disabled="true"
              tabIndex={-1}
              onClick={(event) => event.preventDefault()}
              aria-label={`${activeProject.title} detail page not included`}
            >
              View case study
            </button>
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
        The last screen is a typographic wall standing inside the live field, not a card on
        a black page: the canvas keeps rendering behind it and only the pointer on a control
        is ever allowed to take the colour out.
      */}
      <section className={styles.finale} data-visible={finaleVisible} aria-label="Contact">
        <div className={styles.finaleLockup}>
          <p>WITH US IT HAPPENS</p>
          <a className={styles.finaleHandle} href="mailto:hi@fullbuild.ai">HI@FULLBUILD.AI</a>
        </div>
        <div className={styles.socials}>
          <a href="https://www.linkedin.com" rel="noreferrer">LinkedIn</a>
          <a href="https://www.instagram.com" rel="noreferrer">Instagram</a>
          <a href="https://www.behance.net" rel="noreferrer">Behance</a>
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
