"use client";

import { useState } from "react";
import {
  compensation,
  formatTime,
  stocks,
  type EiMode,
} from "@/components/halation/recipes";
import styles from "@/app/prototype/halation/halation.module.css";

/* Spec 2.3 digit rule: every rendered text node containing a digit is set in
   Martian Mono. Mono is the inline mechanism inside Archivo prose. */
function Mono({ children }: { children: React.ReactNode }) {
  return <span className={styles.mono}>{children}</span>;
}

export function HalationApp() {
  const [stockId, setStockId] = useState(stocks[0].id);
  const [eiMode, setEiMode] = useState<EiMode>("box");

  const stock = stocks.find((entry) => entry.id === stockId) ?? stocks[0];
  const recipe = stock[eiMode];
  const recipeKey = `${stock.id}-${eiMode}`;

  return (
    <div className={styles.shell}>
      <div className={styles.prototypeBar}>
        <strong>Consumer prototype</strong>
        <span>Fictional brand // simulated product data</span>
        <a href="/">fullbuild.ai ↗</a>
      </div>

      <div className={styles.frame}>
        <header className={styles.masthead}>
          <span className={styles.wordmark}>Halation</span>
          <span className={styles.batchChip}>Batch 047 // mixed 2026-06-12</span>
        </header>
      </div>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.frame}>
            <p className={styles.kicker}>
              Black and white developer // one shot
            </p>
            <h1 id="hero-heading" className={styles.display}>
              Develops what you saw, not what you hoped
            </h1>
            <p className={styles.heroBody}>
              Halation <Mono>No. 2</Mono> is a one-shot black and white
              developer mixed for kitchen-sink darkrooms. Fine grain, honest
              shadows, and numbers you can set a timer by.
            </p>
            <button type="button" className={styles.cta}>
              <span className={styles.ctaLabel}>Start a batch</span>
              <span className={styles.ctaSub}>
                18 EUR // 500 ML // MAKES 16 L WORKING
              </span>
            </button>
          </div>
        </section>

        <section className={styles.frame} aria-labelledby="recipe-heading">
          <div className={styles.panel}>
            <h2 id="recipe-heading" className={styles.panelHeading}>
              Pick your stock, read your numbers
            </h2>

            <div
              className={styles.chipRow}
              role="group"
              aria-label="Film stock"
            >
              {stocks.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={entry.id === stock.id}
                  className={
                    entry.id === stock.id
                      ? `${styles.chip} ${styles.chipSelected}`
                      : styles.chip
                  }
                  onClick={() => setStockId(entry.id)}
                >
                  <span className={styles.chipName}>{entry.name}</span>
                  <span className={styles.chipIso}>{entry.iso}</span>
                </button>
              ))}
            </div>

            <div
              className={styles.eiRow}
              role="group"
              aria-label="Exposure index"
            >
              <button
                type="button"
                aria-pressed={eiMode === "box"}
                className={
                  eiMode === "box"
                    ? `${styles.eiButton} ${styles.eiSelected}`
                    : styles.eiButton
                }
                onClick={() => setEiMode("box")}
              >
                Box
              </button>
              <button
                type="button"
                aria-pressed={eiMode === "push"}
                className={
                  eiMode === "push"
                    ? `${styles.eiButton} ${styles.eiSelected}`
                    : styles.eiButton
                }
                onClick={() => setEiMode("push")}
              >
                Push +1
              </button>
            </div>

            <div className={styles.readoutRow}>
              <div>
                <p className={styles.readoutLabel}>Dilution</p>
                <p className={styles.readoutValue} key={`${recipeKey}-dilution`}>
                  {recipe.dilution}
                </p>
              </div>
              <div>
                <p className={styles.readoutLabel}>Temp</p>
                <p className={styles.readoutValue} key={`${recipeKey}-temp`}>
                  {recipe.tempC} C
                </p>
              </div>
              <div>
                <p className={styles.readoutLabel}>Time</p>
                <p className={styles.readoutValue} key={`${recipeKey}-time`}>
                  {formatTime(recipe.timeSec)}
                </p>
              </div>
              <div>
                <p className={styles.readoutLabel}>EI</p>
                <p className={styles.readoutValue} key={`${recipeKey}-ei`}>
                  {recipe.ei}
                </p>
              </div>
            </div>

            <ol className={styles.steps}>
              <li>
                Warm the bath to <Mono>{recipe.tempC} C</Mono> and hold it
                there.
              </li>
              <li>Pour in one motion, start the clock as the tank fills.</li>
              <li>
                Agitate continuously for the first <Mono>30 s</Mono>.
              </li>
              <li>
                Then invert four times at each minute mark, tap the tank twice.
              </li>
              <li>Stop, fix, and rinse as your stock demands.</li>
            </ol>
          </div>
        </section>

        <section className={styles.frame} aria-labelledby="rhythm-heading">
          <div className={styles.panel}>
            <h2 id="rhythm-heading" className={styles.panelHeading}>
              Agitation rhythm
            </h2>
            <div className={styles.timelineMeta}>
              <span>First 60 s of development</span>
              <span>Demo runs 5x</span>
            </div>
            <div
              className={styles.track}
              role="img"
              aria-label="Agitation rhythm demo covering the first sixty seconds of development at five times speed"
            >
              <div className={styles.zone} key={recipeKey} />
              {[1, 2, 3, 4, 5, 6].map((mark) => (
                <div
                  key={mark}
                  className={styles.tick}
                  style={{
                    left: `calc(${(mark / 6) * 100}% - ${mark === 6 ? 2 : 1}px)`,
                    animationDelay: `${mark * 2000 - 12000}ms`,
                  }}
                />
              ))}
              <div className={styles.playhead} />
            </div>
            {stock.pinned ? (
              <p className={styles.compStrip}>
                <span>HOLD {recipe.tempC} C</span>
              </p>
            ) : (
              <p className={styles.compStrip}>
                {compensation.map((step) => (
                  <span key={step.tempC} className={styles.compCell}>
                    <span className={styles.compTemp}>{step.tempC} C</span>
                    <span>{formatTime(recipe.timeSec * step.factor)}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>

        <section className={styles.frame} aria-labelledby="notes-heading">
          <h2 id="notes-heading" className={styles.notesHeading}>
            What it is
          </h2>
          <p className={styles.noteBody}>
            A metol and ascorbate developer that keeps midtones long and grain
            tight. It is mixed for one-shot use, so every roll meets fresh
            chemistry and your times stay honest from the first tank to the
            last.
          </p>

          <div className={styles.meniscus} aria-hidden="true" />

          <h2 className={styles.notesHeading}>What it is not</h2>
          <p className={styles.noteBody}>
            It will not rescue a roll you metered wrong, and it does not
            pretend to. Push past EI <Mono>1600</Mono> and you are on your own,
            but here is where we would start: add forty percent to the push
            time and expect the shadows to thin.
          </p>

          <div className={styles.meniscus} aria-hidden="true" />

          <h2 className={styles.notesHeading}>Storage</h2>
          <p className={styles.noteBody}>
            Keep the concentrate cool, dark, and squeezed of air. An opened
            bottle holds six months and a sealed one holds twelve. If it pours
            the color of strong tea, mix a fresh batch and pour the old one
            out with respect.
          </p>

          <p className={styles.footerReadout}>
            Shelf life 6 mo opened // 12 mo sealed
          </p>
        </section>
      </main>
    </div>
  );
}
