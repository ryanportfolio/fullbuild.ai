import { FIX_HZ } from "@/lib/layline/types";
import type { RaceData } from "@/lib/layline/types";
import { FixRateDiagram, HermiteDiagram, ShortArcDiagram } from "./svg/diagrams";
import styles from "@/app/prototype/layline/layline.module.css";

/* The excerpt is the feed in the units it is stored in, so the numbers can be
 * checked against the drawings above without a conversion in the way. */
const EXCERPT_BOAT = "nzl";
const EXCERPT_FROM = 18;
const EXCERPT_ROWS = 6;

export function NotesSection({ race }: { race: RaceData }) {
  const fixes = race.fixes[EXCERPT_BOAT];
  const start = fixes.findIndex((fix) => fix.t >= EXCERPT_FROM);
  const excerpt = fixes.slice(start, start + EXCERPT_ROWS);
  const boat = race.boats.find((entry) => entry.id === EXCERPT_BOAT);
  const sail = boat === undefined ? EXCERPT_BOAT.toUpperCase() : boat.sail;

  return (
    <section className={styles.notes} aria-labelledby="notes-heading">
      <h2 id="notes-heading" className={styles.notesHeading}>
        How the replay works
      </h2>
      <div className={styles.note}>
        <div>
          <h3 className={styles.noteHeading}>Four fixes a second</h3>
          <p className={styles.noteBody}>
            Each boat reports {FIX_HZ} times a second: where it is, how fast it is going over the
            ground, which way it is pointing, how far it is heeled, what angle it is holding to the
            wind. That is one reading every {(1000 / FIX_HZ).toFixed(0)} milliseconds, which sounds
            like a lot until you draw it.
          </p>
          <p className={styles.noteBody}>
            At a screen refreshing sixty times a second, a replay that only drew the fixes would
            hold each one for fifteen frames and then jump. The boat would arrive at the mark in
            the right place at the right time and look wrong the whole way there.
          </p>
        </div>
        <FixRateDiagram race={race} />
      </div>

      <div className={styles.note}>
        <div>
          <h3 className={styles.noteHeading}>Between the fixes</h3>
          <p className={styles.noteBody}>
            The gaps get filled with a cubic curve, one segment per pair of fixes. The part that
            matters is where the curve gets its direction. A tangent taken from the fix before and
            the fix after is a guess about the middle of a turn, and it cuts the corner off every
            tack.
          </p>
          <p className={styles.noteBody}>
            Every fix already carries a speed and a course, measured at that instant. Using those
            as the tangents means the curve leaves each fix on the heading the boat reported and
            arrives at the next one on the heading that one reported, so the turn keeps its shape
            and the speed through it stays honest.
          </p>
        </div>
        <HermiteDiagram race={race} />
      </div>

      <div className={styles.note}>
        <div>
          <h3 className={styles.noteHeading}>Heading is a circle</h3>
          <p className={styles.noteBody}>
            Position, speed and heel are plain numbers and interpolate like plain numbers. Heading
            is not. It lives on a circle, where the value after 359 is 0, and a boat crossing the
            top of that circle produces two readings that look far apart and are not.
          </p>
          <p className={styles.noteBody}>
            Every angle in the engine, heading, course over ground, wind direction and wind angle,
            is interpolated the short way round with its rate of turn capped at a figure no hull
            can beat. One bad reading bends the curve; it never spins the boat.
          </p>
        </div>
        <ShortArcDiagram race={race} />
      </div>

      <div className={styles.excerpt}>
        <table className={styles.excerptTable}>
          <caption>
            {EXCERPT_ROWS} consecutive fixes from {sail}, a second and a quarter of the feed, in
            the units the engine stores. Everything on this page is read from rows like these
          </caption>
          <thead>
            <tr>
              <th scope="col">T s</th>
              <th scope="col">X m</th>
              <th scope="col">Y m</th>
              <th scope="col">SOG m/s</th>
              <th scope="col">HDG deg</th>
            </tr>
          </thead>
          <tbody>
            {excerpt.map((fix) => (
              <tr key={fix.t}>
                <td>{fix.t.toFixed(2)}</td>
                <td>{fix.x.toFixed(2)}</td>
                <td>{fix.y.toFixed(2)}</td>
                <td>{fix.sog.toFixed(2)}</td>
                <td>{fix.hdg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
