'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/app/prototype/deadlow/deadlow.module.css';
import { CrossSection, type SceneHandle } from './CrossSection';
import {
  MUSTER,
  NEAPS_RANGE_M,
  PAGE_NOW,
  PLACES,
  SPRINGS_RANGE_M,
  STATIONS,
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
 * One screen, one question. The clock is a value this component owns: it starts
 * at the scene's own now and moves only when the reader moves it or when real
 * seconds pass, so the sea is the only thing on the page that animates.
 */
export function DeadLowApp() {
  const sceneRef = useRef<SceneHandle>(null);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const countdownLabelRef = useRef<HTMLSpanElement>(null);
  const clockReadRef = useRef<HTMLSpanElement>(null);
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
    let frame = 0;
    let minuteTimer = 0;

    /** Minutes past midnight, scene time. */
    const clockNow = () =>
      PAGE_NOW + offsetRef.current + (performance.now() - started) / 60000;

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
    };

    const paint = () => {
      const minutes = clockNow();
      sceneRef.current?.paint(minutes);
      writeReadouts(minutes);
    };

    paint();

    // 2.4: the single rAF loop. It exists for the water, and the countdown
    // rides it because a register wheel and a tide are the same clock.
    const step = () => {
      paint();
      frame = window.requestAnimationFrame(step);
    };

    if (reduce) {
      // The sea is drawn once at the right level and stays. The countdown steps
      // once a minute, because a reader who asked for stillness still needs it.
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

  const resetClock = () => {
    const hook = (window as unknown as { __deadlow?: { reset: () => void } }).__deadlow;
    hook?.reset();
  };

  const opening = countdownFor(PAGE_NOW);

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
        <section className={`${styles.container} ${styles.hero}`}>
          <span className={`${styles.l1} ${styles.kicker}`} data-kicker>
            Today, Sker Holm on foot
          </span>
          <h1 className={`${styles.d1} ${styles.display}`} data-display>
            One hundred and ten minutes
          </h1>

          <div className={styles.cardWrap}>
            <div className={styles.card}>
              <div className={styles.cardRow}>
                <span className={`${styles.l1} ${styles.cardLabel}`}>Standing at the ramp</span>
                <span className={`${styles.d2} ${styles.cardValue}`}>{formatClock(MUSTER)}</span>
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
                <span className={`${styles.l2} ${styles.cardNote}`}>
                  Window 12:47 to 14:37
                </span>
              </div>

              <p className={styles.turnBack}>If we turn back, we turn back together</p>
              <p className={`${styles.d3} ${styles.noWait}`}>
                If you are late we do not wait, because the tide does not
              </p>
            </div>
          </div>

          <div className={styles.factGroup}>
            <span className={`${styles.b3mono} ${styles.fact}`} data-fact>
              DEAD LOW 13:42 · 0.4 M · SPRINGS · WINDOW 12:47 TO 14:37
            </span>
            <span className={`${styles.b3mono} ${styles.fact}`} data-fact>
              PREDICTED LOW 0.4 M · OBSERVED LOW 0.7 M · +0.3 M ON A SOUTHWEST WIND
            </span>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section}`} id="crossing">
          <h2 className={styles.l1}>The crossing, four miles of seabed</h2>
          <p className={`${styles.b1} ${styles.lead}`}>
            There is <Num>0.35</Num> m of water in Sker Channel at dead low today, so you will get
            wet to the knee.
          </p>

          <CrossSection ref={sceneRef} minutes={PAGE_NOW} />

          <span className={`${styles.l2} ${styles.footnote}`}>
            Heights above chart datum, Sker Holm secondary port
          </span>
          <p className={`${styles.b3} ${styles.gloss}`} data-gloss>
            Dead low is the bottom of the tide, the moment before it turns and starts to flood.
          </p>

          <p className={`${styles.b2} ${styles.para}`}>
            We leave from the ramp at Cross Farm and walk out along the poles. The sand is hard for
            the first mile, then soft where the channel wanders.
          </p>
          <p className={`${styles.b2} ${styles.para}`}>
            We do not call this safe, we call it timed. The almanac says one thing and a southwest
            wind says another. Today the water is standing <Num>0.3</Num> m over the prediction all
            day, so we walk the water and not the almanac.
          </p>
        </section>

        <section className={`${styles.band} ${styles.bandDrying} ${styles.section}`}>
          <div className={styles.container}>
            <h2 className={styles.l1}>The route, station by station</h2>
            <div className={styles.stationHead}>
              <span className={styles.l2}>Station</span>
              <span className={styles.l2}>Bed above datum</span>
            </div>
            <ol className={styles.stationList}>
              {STATIONS.map((station, index) => (
                <li key={station.x} className={styles.stationRow}>
                  <span>
                    <span className={`${styles.b3mono} ${styles.stationName}`}>
                      <Num>{String(index + 1)}</Num> {station.name}
                    </span>
                    <span className={`${styles.l2} ${styles.stationMeta}`}>
                      {station.distance}, {station.note}
                    </span>
                  </span>
                  <span className={`${styles.b3mono} ${styles.stationHeight}`}>
                    {formatMetres(station.bed)} m
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section}`}>
          <h2 className={styles.l1}>Springs and neaps</h2>
          <div className={styles.scaleWrap} data-metric>
            <div className={styles.scaleBar} data-metres={SPRINGS_RANGE_M}>
              <div className={styles.scaleSprings} />
              <div className={styles.scaleNeap} data-metres={NEAPS_RANGE_M} />
            </div>
            <div className={styles.scaleKeys}>
              <span className={`${styles.l2} ${styles.scaleKey}`}>
                Springs today, {SPRINGS_RANGE_M} m of range
              </span>
              <span className={`${styles.l2} ${styles.scaleKey}`}>
                Neaps, {NEAPS_RANGE_M} m of range
              </span>
              <span className={`${styles.l2} ${styles.scaleKey}`}>
                Pink marks the state of the tide this week
              </span>
            </div>
          </div>
          <p className={`${styles.b3} ${styles.scaleCause}`}>
            Springs this week, so the window is long. On neaps it closes to about ninety minutes and
            some days it does not open.
          </p>

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
        </section>

        <section className={`${styles.container} ${styles.section}`} id="places">
          <h2 className={styles.l1}>Taking a place</h2>
          <span className={`${styles.d3} ${styles.places}`}>{PLACES} places today</span>
          <button type="button" className={`${styles.l1} ${styles.book}`}>
            Take a place, {PLACES} walking
          </button>
          <p className={`${styles.b3} ${styles.bookNote}`}>
            We meet at the ramp at <Num>12:30</Num>, boots on, and we leave at <Num>12:47</Num>. Pay
            at the ramp or by bank transfer, whichever suits you.
          </p>
        </section>
      </main>

      <div className={styles.clock}>
        <div className={`${styles.container} ${styles.clockInner}`}>
          <span className={`${styles.l1} ${styles.clockLabel}`}>
            Move the clock{' '}
            <span ref={clockReadRef} className={styles.l1}>
              {formatClock(PAGE_NOW)}
            </span>
          </span>
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
        </div>
      </div>

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
