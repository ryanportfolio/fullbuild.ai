'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/app/prototype/deadlow/deadlow.module.css';
import { CrossSection, type SceneHandle } from './CrossSection';
import {
  LEGS,
  MUSTER,
  NEAPS_RANGE_M,
  PAGE_NOW,
  PLACES,
  SCRUB_END,
  SCRUB_SPAN,
  SCRUB_START,
  SPRINGS_RANGE_M,
  WINDOW_END,
  WINDOW_START,
  bedFraction,
  countdownFor,
  formatClock,
  formatMetres,
} from './tide';

/**
 * Every digit run in running prose is a mono span at the surrounding step's
 * size. The tabular voice is the loud one on this page, including mid-sentence.
 */
function Num({ children }: { children: string }) {
  return (
    <span className={styles.num} data-num>
      {children}
    </span>
  );
}

/**
 * DEAD LOW: guided crossings to Sker Holm, timed to the minute.
 *
 * One screen, one question. The cross-section is the ground the screen stands
 * on, not a figure printed on it, and scrolling walks the reader across it from
 * the Cross Farm ramp to the Sker Holm shore. The clock is a value this
 * component owns: it starts at the scene's own now and moves only when the
 * reader moves it or when real seconds pass, so the sea is the only thing on
 * the page that animates.
 */
export function DeadLowApp() {
  const sceneRef = useRef<SceneHandle>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const countdownLabelRef = useRef<HTMLSpanElement>(null);
  const clockReadRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  /** Minutes added to the scene clock by the step control. */
  const offsetRef = useRef(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const started = performance.now();
    let lastCountdown = '';
    let lastLabel = '';
    let lastClock = '';
    let lastSlider = '';
    let frame = 0;
    let minuteTimer = 0;

    /** Minutes past midnight, scene time. */
    const clockNow = () =>
      PAGE_NOW + offsetRef.current + (performance.now() - started) / 60000;

    /**
     * P2: how far along the four miles the reader is, from the ramp (0) to the
     * shore (1). Read inside the one rAF loop rather than from a scroll
     * listener, so the page still has exactly one timed mechanism. This is a
     * world coordinate, not a trigger: it has a unit, and nothing outside the
     * [data-metric] subtree is written from it.
     */
    const walked = () => {
      const track = trackRef.current;
      if (!track) return 0;
      const box = track.getBoundingClientRect();
      const span = box.height - window.innerHeight;
      if (span <= 0) return 0;
      return Math.min(1, Math.max(0, -box.top / span));
    };

    const writeReadouts = (minutes: number) => {
      const counted = countdownFor(minutes);
      if (countdownRef.current && counted.value !== lastCountdown) {
        lastCountdown = counted.value;
        countdownRef.current.textContent = counted.value;
      }
      if (countdownLabelRef.current && counted.label !== lastLabel) {
        lastLabel = counted.label;
        countdownLabelRef.current.textContent = counted.label;
      }
      const stamped = formatClock(minutes);
      if (clockReadRef.current && stamped !== lastClock) {
        lastClock = stamped;
        clockReadRef.current.textContent = stamped;
      }
      // A53: the track is a picture of the day and the thumb is the reader's
      // place in it, so the buttons and the drag have to agree about where the
      // clock stands. Not a text write, and change-detected all the same.
      if (sliderRef.current && stamped !== lastSlider) {
        lastSlider = stamped;
        sliderRef.current.value = String(Math.round(minutes));
      }
    };

    const paint = () => {
      const minutes = clockNow();
      sceneRef.current?.paint(minutes, walked());
      writeReadouts(minutes);
    };

    paint();

    // 2.4: the single rAF loop. It exists for the water, and the countdown and
    // the reader's place on the route ride it, because a register wheel, a tide
    // and a walk are all the same clock.
    const step = () => {
      paint();
      frame = window.requestAnimationFrame(step);
    };

    if (reduce) {
      // The sea is drawn once at the right level and stays, and the route stops
      // being scroll-linked: the seven station rows are ordinary blocks and the
      // reader passes them by scrolling. The countdown steps once a minute,
      // because a reader who asked for stillness still needs it.
      minuteTimer = window.setInterval(() => writeReadouts(clockNow()), 60000);
    } else {
      frame = window.requestAnimationFrame(step);
    }

    const moveClock = (delta: number) => {
      offsetRef.current += delta;
      paint();
    };

    const hook = {
      /** Step the scene clock, in minutes. */
      step: moveClock,
      /** Put the scene clock on an exact minute past midnight. */
      setClock(minutes: number) {
        offsetRef.current = minutes - (PAGE_NOW + (performance.now() - started) / 60000);
        paint();
      },
      /** Back to the scene's own now. */
      reset() {
        offsetRef.current = -(performance.now() - started) / 60000;
        paint();
      },
      now: clockNow,
      walked,
    };
    (window as unknown as { __deadlow?: typeof hook }).__deadlow = hook;

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (minuteTimer) window.clearInterval(minuteTimer);
      delete (window as unknown as { __deadlow?: typeof hook }).__deadlow;
    };
  }, []);

  const stepClock = (delta: number) => {
    const hook = (window as unknown as { __deadlow?: { step: (d: number) => void } }).__deadlow;
    hook?.step(delta);
  };

  const setClock = (minutes: number) => {
    const hook = (window as unknown as { __deadlow?: { setClock: (m: number) => void } }).__deadlow;
    hook?.setClock(minutes);
  };

  const resetClock = () => {
    const hook = (window as unknown as { __deadlow?: { reset: () => void } }).__deadlow;
    hook?.reset();
  };

  const opening = countdownFor(PAGE_NOW);
  const windowLeft = ((WINDOW_START - SCRUB_START) / SCRUB_SPAN) * 100;
  const windowWidth = ((WINDOW_END - WINDOW_START) / SCRUB_SPAN) * 100;

  return (
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <div className={`${styles.container} ${styles.mastheadInner}`}>
          <span className={styles.l1}>Dead Low</span>
          <nav className={styles.nav} aria-label="This page">
            <a className={`${styles.l1} ${styles.navLink}`} href="#crossing">
              The crossing
            </a>
            <a className={`${styles.l1} ${styles.navLink}`} href="#places">
              Places
            </a>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        {/* P1 and P2: the section is the ground, and the walk is the spine. */}
        <div ref={trackRef} className={styles.route}>
          <div className={styles.stage}>
            <CrossSection ref={sceneRef} minutes={PAGE_NOW} progress={0} />

            <div className={`${styles.container} ${styles.stageGrid}`}>
              <div className={styles.answer}>
                <div className={styles.cardWrap}>
                  <div className={styles.card}>
                    {/* A56: the plain answer, first, at the largest non-numeric
                        step on the page. The repealed card made the reader
                        infer it from a running countdown. */}
                    <div className={styles.cardRow}>
                      <span className={`${styles.l1} ${styles.cardLabel}`} data-kicker>
                        Today, Sker Holm on foot
                      </span>
                      <span className={`${styles.d3} ${styles.verdict}`}>Crossing is on</span>
                    </div>

                    <div className={styles.cardRow}>
                      <span ref={countdownLabelRef} className={`${styles.l1} ${styles.cardLabel}`}>
                        {opening.label}
                      </span>
                      <span
                        ref={countdownRef}
                        className={`${styles.d2} ${styles.countdown}`}
                        data-countdown
                      >
                        {opening.value}
                      </span>
                    </div>

                    <button type="button" className={`${styles.l1} ${styles.book}`}>
                      Take a place, {PLACES} walking
                    </button>

                    {/* A53: the clock is a track across the day with the window
                        lit on it, not three debug buttons. Drag it and the sea
                        moves through the type, the horizons separate from the
                        ground and the flat comes out. */}
                    <div className={styles.scrub}>
                      <label className={`${styles.l1} ${styles.scrubLabel}`} htmlFor="deadlow-clock">
                        Move the water{' '}
                        <span ref={clockReadRef} className={styles.l1}>
                          {formatClock(PAGE_NOW)}
                        </span>
                      </label>
                      <button
                        type="button"
                        className={`${styles.l1} ${styles.clockButton}`}
                        onClick={() => stepClock(-10)}
                      >
                        - 10 min
                      </button>
                      <button
                        type="button"
                        className={`${styles.l1} ${styles.clockButton}`}
                        onClick={() => stepClock(10)}
                      >
                        + 10 min
                      </button>
                      <button
                        type="button"
                        className={`${styles.l1} ${styles.clockButton}`}
                        onClick={resetClock}
                      >
                        Now
                      </button>
                      <div className={styles.trackBox}>
                        <span
                          className={styles.trackWindow}
                          style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }}
                          aria-hidden="true"
                        />
                        <input
                          id="deadlow-clock"
                          ref={sliderRef}
                          className={`${styles.l1} ${styles.slider}`}
                          type="range"
                          min={SCRUB_START}
                          max={SCRUB_END}
                          step={1}
                          defaultValue={PAGE_NOW}
                          onChange={(event) => setClock(Number(event.target.value))}
                        />
                      </div>
                      <span className={`${styles.l2} ${styles.trackKey}`}>
                        {formatClock(SCRUB_START)} to {formatClock(SCRUB_END)}, the window lit
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.headline}>
                {/* P4: set into the water field, so the falling level crosses it.
                    A43: and it states the muster, which is the one thing the
                    reader in the car park is trying to find out. */}
                <h1 className={`${styles.d1} ${styles.display}`} data-display>
                  {formatClock(MUSTER)}
                </h1>
                <span className={`${styles.d3} ${styles.standAt}`} data-stand-at>
                  At the ramp, boots on
                </span>
                <span className={`${styles.l2} ${styles.windowLine}`} data-window>
                  One hundred and ten minutes, 12:47 to 14:37
                </span>
              </div>
            </div>
          </div>

          {/* P2: one block per leg of the walk, its scroll height that leg's
              share of the four miles, carrying the station it arrives at.
              A54: the bed profile column moves inside the row, so every leg is
              the same shape whatever its scroll length and the six columns read
              against one frame. */}
          <ol className={styles.legs}>
            {LEGS.map((leg, index) => (
              <li
                key={leg.to.x}
                className={`${styles.leg}${leg.to.name === 'Sker Channel' ? ` ${styles.legWade}` : ''}`}
                style={{ height: `${leg.vh}vh` }}
              >
                <div className={`${styles.container} ${styles.legInner}`}>
                  <span className={styles.legPlot} aria-hidden="true">
                    <span
                      className={styles.legColumn}
                      style={{ height: `${bedFraction(leg.to.bed) * 100}%` }}
                    />
                  </span>
                  <span className={`${styles.b3mono} ${styles.legName}`}>
                    <Num>{String(index + 2)}</Num> {leg.to.name}
                  </span>
                  <span className={`${styles.l2} ${styles.legMeta}`}>
                    {leg.to.distance}, {leg.to.note}
                  </span>
                  <span
                    className={`${styles.b3mono} ${styles.legBed}${
                      leg.to.name === 'Sker Channel' ? ` ${styles.legBedWade}` : ''
                    }`}
                  >
                    {formatMetres(leg.to.bed)} m
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* A57: the refusal leaves the muster card and takes a field of its own,
            standing on the seabed the walk crosses. In the card it competed with
            the countdown for first fixation and stacked a third --bill object
            inside 200px; here it is the first thing the reader meets once the
            answer is read, and it is the structural break between the drawing
            and the document. */}
        <section className={`${styles.band} ${styles.bandDrying} ${styles.ruleBand}`}>
          <div className={`${styles.container} ${styles.ledger}`}>
            <span className={`${styles.l1} ${styles.ledgerLabel}`}>The rule</span>
            <div className={styles.card}>
              <p className={styles.turnBack}>If we turn back, we turn back together</p>
            </div>
            <div className={styles.ledgerMargin}>
              <p className={`${styles.d3} ${styles.noWait}`}>
                If you are late we do not wait, the tide has already turned
              </p>
            </div>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section} ${styles.ledger}`} id="crossing">
          <h2 className={`${styles.l1} ${styles.ledgerLabel}`}>The crossing, four miles of seabed</h2>
          <div className={styles.ledgerBody}>
            {/* A50: the day's figures open the section rather than crowding the
                card field, now that the drawing states both levels and the
                0.30 m between them at the place they are drawn. */}
            <div className={styles.factGroup}>
              <span className={`${styles.b3mono} ${styles.fact}`} data-fact>
                DEAD LOW 13:42 · SPRINGS · RANGE 7.60 M · WIND SOUTHWEST
              </span>
              <span className={`${styles.b3mono} ${styles.fact}`} data-fact>
                ALMANAC LOW 0.40 M · SEA LOW 0.70 M · +0.30 M ON A SOUTHWEST WIND
              </span>
            </div>
            <p className={`${styles.b1} ${styles.lead}`}>
              There is <Num>0.35</Num> m of water in Sker Channel at dead low today, so you will get
              wet to the knee.
            </p>
            <p className={`${styles.b2} ${styles.para}`}>
              We leave from the ramp at Cross Farm and walk out along the poles. The sand is hard for
              the first mile, then soft where the channel wanders.
            </p>
            <p className={`${styles.b2} ${styles.para}`}>
              We do not call this safe, we call it timed. The almanac says one thing and a southwest
              wind says another. Today the water is standing <Num>0.30</Num> m over the prediction
              all day, so we walk the water and not the almanac.
            </p>
          </div>
          <div className={styles.ledgerMargin}>
            <span className={`${styles.l2} ${styles.footnote}`}>
              Heights above chart datum, Sker Holm secondary port
            </span>
            <p className={`${styles.b3} ${styles.gloss}`} data-gloss>
              Dead low is the bottom of the tide, the moment before it turns and starts to flood.
            </p>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section} ${styles.ledger}`}>
          <h2 className={`${styles.l1} ${styles.ledgerLabel}`}>Springs and neaps</h2>
          <div className={styles.ledgerBody}>
            {/* A58: the range bar is drawn at a size that can carry the
                comparison its caption makes. It was 96px wide beside 900px of
                unused sheet, which is a chart at the size of a favicon. */}
            <div className={styles.scaleWrap} data-metric>
              <div className={styles.scaleBar} data-metres={SPRINGS_RANGE_M}>
                <div className={styles.scaleSprings} />
                <div className={styles.scaleNeap} data-metres={NEAPS_RANGE_M} />
                <span className={`${styles.l2} ${styles.scaleMark} ${styles.scaleMarkSprings}`}>
                  Springs today, {formatMetres(SPRINGS_RANGE_M)} m of range
                </span>
                <span className={`${styles.l2} ${styles.scaleMark} ${styles.scaleMarkNeap}`}>
                  Neaps, {formatMetres(NEAPS_RANGE_M)} m of range
                </span>
              </div>
              <span className={`${styles.l2} ${styles.scaleKey}`}>
                Pink marks the state of the tide this week
              </span>
            </div>
            <p className={`${styles.b3} ${styles.scaleCause}`}>
              Springs this week, so the window is long. On neaps it closes to about ninety minutes
              and some days it does not open.
            </p>
          </div>
          {/* A59: the third track carries what to bring, so the lower sheet
              spends its width instead of stranding the right 60 percent of it. */}
          <div className={styles.ledgerMargin}>
            <div className={styles.disclosure}>
              <button
                type="button"
                className={`${styles.l1} ${styles.disclosureButton}`}
                aria-expanded={open}
                aria-controls="deadlow-kit"
                onClick={() => setOpen((was) => !was)}
              >
                <span>What to bring</span>
                <span aria-hidden="true">{open ? '-' : '+'}</span>
              </button>
              <div className={styles.disclosurePanel} data-open={open ? 'true' : 'false'}>
                <div className={styles.disclosureInner}>
                  <div id="deadlow-kit" className={styles.disclosureBody}>
                    <p className={`${styles.b2} ${styles.disclosureLine}`}>
                      Boots you can walk four miles in, and trousers you can roll to the knee.
                    </p>
                    <p className={`${styles.b2} ${styles.disclosureLine}`}>
                      Water, a hat if the wind is off the sea, and a bag you do not mind wetting.
                    </p>
                    <p className={`${styles.b2} ${styles.disclosureLine}`}>
                      We carry the poles and the radio. Two guides walk it, one at the front and one
                      at the back.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.container} ${styles.section} ${styles.ledger}`}
          id="places"
        >
          <h2 className={`${styles.l1} ${styles.ledgerLabel}`}>Taking a place</h2>
          <div className={styles.ledgerBody}>
            <span className={`${styles.d3} ${styles.places}`}>{PLACES} places today</span>
            <button type="button" className={`${styles.l1} ${styles.book}`}>
              Take a place, {PLACES} walking
            </button>
          </div>
          <div className={styles.ledgerMargin}>
            <p className={`${styles.b3} ${styles.bookNote}`}>
              We meet at the ramp at <Num>12:30</Num>, boots on, and we leave at <Num>12:47</Num>.
              Pay at the ramp or by bank transfer, whichever suits you.
            </p>
          </div>
        </section>
      </main>

      <footer className={`${styles.band} ${styles.bandWater} ${styles.footer}`}>
        <div className={styles.container}>
          <span className={`${styles.l1} ${styles.footerName}`}>
            Dead Low Crossings, Cross Farm ramp
          </span>
          <p className={`${styles.b3} ${styles.footerLine}`}>
            Two guides, fourteen walking, poles set on the day. We walk when the tide lets us and
            not otherwise.
          </p>
          <span className={`${styles.l2} ${styles.footerLine}`}>
            Times checked against the water at the ramp every morning
          </span>
        </div>
      </footer>
    </div>
  );
}
