import { RACE_SEED } from "@/lib/layline/types";
import type { RaceData } from "@/lib/layline/types";
import { finishGap45, finishGaps } from "./engine/benchData";
import { EngineRoom, FinishStrip } from "./engine/EngineRoom";
import engine from "./engine/engine.module.css";
import styles from "@/app/prototype/layline/layline.module.css";

/* The engine room builds its own copy of the race from the same seed on the
 * client, the way the console and the Debrief panel already do, rather than
 * putting ~260 KB of telemetry in the page payload for a section that reads
 * one boat's tack.
 *
 * The finish strip is the exception and the reason the race prop is read here:
 * a finish time is a sub-tick crossing at the far end of the sim, and Node and
 * the browser land up to fifteen milliseconds apart on it. Six numbers built
 * on the server travel down as props, so the page prints the times the test
 * pins instead of whichever engine drew them last. */
export function NotesSection({ race }: { race: RaceData }) {
  const order = finishGaps(race);
  return (
    <section className={styles.notes} aria-labelledby="notes-heading">
      <EngineRoom />

      <div className={engine.stands}>
        <p className={engine.kicker}>Build status</p>
        <h2 className={engine.standsHeading}>Where this build stands</h2>
      </div>
      <div className={`${engine.panel} ${engine.standsPanel}`}>
        <p className={engine.standsText}>
          Both halves are on the page. Running now: the replay engine, a seeded six boat race at
          four fixes a second, the boat models with wake and spray, three broadcast camera rigs,
          the raw fixes lens, the instrument and standings docks, water, sky, and the chart the
          page falls back to without WebGL. The laylines and marks draw on a damped display wind,
          so one gusty reading cannot swing them. The replay steps fix by fix, one reading at a
          time. Debrief answers questions about the race through tools that read this same feed:
          the start boat by boat, every tack and gybe with the speed it cost, two boats compared
          over any window. The wide shot now opens on the fleet before the
          gun, camera hand-overs and the pull-in run on the race clock so a scrubbed replay
          reproduces them exactly, and the chase lens holds its distance from every hull in the
          fleet. The console reads the race now as well as replaying it: a start line readout
          counts the followed boat down to the gun, and says so if it would reach the line
          before the gun fires. Every tack and gybe that boat made is marked on its own rail
          under the scrub track so a turn is one click away, and a strip of speed made good to
          the next mark fills in against the best anyone in the fleet was making at the same
          instant. The chart is a mode of its own rather than only the no-WebGL stand-in:
          one button swaps the rendered scene for the course from above on the same clock, with
          each track drawing itself as its boat sails it. Still in work: heel and trim on the
          instrument dock.
        </p>
        <div className={engine.ident} aria-hidden="true">
          <p className={engine.identLine}>One seed · every number</p>
          <p className={engine.standsIdentValue}>{RACE_SEED}</p>
          <p className={engine.identSub}>Race seed</p>
        </div>
      </div>

      <FinishStrip order={order} gap={finishGap45(order)} />
    </section>
  );
}
