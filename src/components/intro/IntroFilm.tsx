"use client";

import styles from "./intro.module.css";
import { LoaderPlate } from "@/components/showcase/ShowcaseLoader";

/*
 * ACT ONE, AS A PICTURE. Five layers and nothing else: the drafting sheet, the built world
 * under a travelling cut, the registration box, the cut's own hairline, and the two lockups
 * that ride either side of it.
 *
 * This component owns no clock, no state and no randomness. It is handed a percent and it
 * renders the frame that percent means. Every ramp in the film is derived in the stylesheet
 * from --intro-load alone, which is what makes holding a percent reproduce a frame byte for
 * byte, and what stops a second animation clock beating against the cinematic's.
 *
 * The plate arrives from ShowcaseLoader with this module passed in. One drawing, two films,
 * one set of coordinates: see that file for why the class names and the --b-* band names
 * are a contract rather than a convenience.
 */
export default function IntroFilm({
  percent,
  ready,
  held,
}: {
  percent: number;
  ready: boolean;
  held: boolean;
}) {
  const readout = String(Math.round(percent)).padStart(2, "0");

  return (
    <div className={styles.film} data-ready={ready} data-held={held} aria-hidden="true">
      <div className={styles.loadSheet}>
        <LoaderPlate variant="sheet" styles={styles} />
        <div className={styles.starterBottom}>
          <p className={styles.loadNumber}>{readout}<span>%</span></p>
          <p className={styles.starterMark}><span>FULL</span><span>BUILD</span></p>
        </div>
      </div>

      <div className={styles.loadWorld}>
        <LoaderPlate variant="world" styles={styles} />
        <div className={styles.starterBottom}>
          <p className={styles.loadNumber}>{readout}<span>%</span></p>
          <p className={styles.starterMark}><span>FULL</span><span>BUILD</span></p>
        </div>
      </div>

      <div className={styles.loadBox} />
      <div className={styles.loadEdge} />
    </div>
  );
}
