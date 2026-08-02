import styles from "@/app/prototype/relay/relay.module.css";

import { SessionExhibit } from "./SessionExhibit";

/* The block closes the page on two exhibits of the same tenant: the session
   running, then the suite that holds it to its answers. Both open on the same
   mono strip, what ran, when, and what came of it, so they read as a pair.

   The proof block is the run itself, not a paragraph about it.
   ROWS transcribes playbookRunResults.json from ryanportfolio/cx-lab, the
   2026-08-02 execution of `cognigy run playbooks`. Every number printed
   below is derived from ROWS: nothing here is a typed total, so the ledger
   cannot report a verdict its own rows do not carry. That is the console's
   no-invented-metrics rule turned on the author's own evidence. */

const REPO = "https://github.com/ryanportfolio/cx-lab";
const DEFS = `${REPO}/blob/main/playbooks/defs`;

type LedgerRow = {
  id: string;
  file: string;
  utterance: string;
  resolved: string;
  /* Character span the slot filler claimed, straight from the run report.
     It slices the utterance below, so the offsets have to be right or the
     marked words come out wrong. */
  span?: [number, number];
  slot?: string;
  asserts: string[];
  passed: number;
  trip?: boolean;
  /* The fallback resolved to nothing, so it does not spend signal. Amber on
     this page means the machine decided something. */
  quiet?: boolean;
};

/* Every playbook opens on the same line and asserts two things about the
   announce before it probes a branch. Those 16 are why the total is 32. */
const OPENER = { utterance: "Hi, who is this", asserts: 2 };

const ROWS: LedgerRow[] = [
  {
    id: "relay-01",
    file: "relay-01-duration.json",
    utterance: "How long will the power be out",
    resolved: "ask_duration",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-02",
    file: "relay-02-reason.json",
    utterance: "Why is this happening",
    resolved: "ask_reason",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-03",
    file: "relay-03-compensation.json",
    utterance: "Will I get a credit on my bill",
    resolved: "ask_compensation",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-04",
    file: "relay-04-sms-optin.json",
    utterance: "Can you text me a reminder",
    resolved: "sms_optin",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-05",
    file: "relay-05-medical-escalation.json",
    utterance: "There's an oxygen concentrator at home",
    resolved: "medical_equipment",
    span: [11, 30],
    slot: "equipment",
    asserts: ["intent", "slot", "text"],
    passed: 3,
    trip: true,
  },
  {
    id: "relay-06",
    file: "relay-06-agent-request.json",
    utterance: "Get me a real person",
    resolved: "agent_request",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-07",
    file: "relay-07-close.json",
    utterance: "Thanks, that's all I needed",
    resolved: "thanks_done",
    asserts: ["intent", "text"],
    passed: 2,
  },
  {
    id: "relay-08",
    file: "relay-08-fallback.json",
    utterance: "purple monkey dishwasher",
    resolved: "no intent, default branch",
    asserts: ["text"],
    passed: 1,
    quiet: true,
  },
];

const PLAYBOOKS = ROWS.length;
const STEPS = ROWS.length * 2;
const ASSERTS =
  ROWS.reduce((total, row) => total + row.asserts.length, 0) +
  PLAYBOOKS * OPENER.asserts;
const FAILED =
  ROWS.reduce((total, row) => total + (row.asserts.length - row.passed), 0);

/* The span is the fact, so it does the work: it cuts the utterance and the
   slot's own words come back marked. Printing "[11:30]" instead would read
   as a clock and hide the phrase the filler actually caught. */
function Said({ row }: { row: LedgerRow }) {
  if (!row.span) return <p className={styles.runSaid}>{row.utterance}</p>;
  const [start, end] = row.span;
  return (
    <p className={styles.runSaid}>
      {row.utterance.slice(0, start)}
      <mark className={styles.runSpan}>{row.utterance.slice(start, end)}</mark>
      {row.utterance.slice(end)}
    </p>
  );
}

export function ProofLedger() {
  return (
    <section className={styles.proof} aria-labelledby="proof-heading">
      <div className={styles.proofTop}>
        <h3 id="proof-heading" className={styles.proofHeading}>
          Relay on Cognigy
        </h3>
        <a className={styles.proofLink} href={REPO} target="_blank" rel="noreferrer">
          Read the build on GitHub
        </a>
      </div>

      <div className={styles.runHeader}>
        <span className={styles.runCommand}>webchat endpoint</span>
        <span className={styles.runStamp}>2026-08-02</span>
        <span className={styles.sessionBadge}>one unbroken session</span>
      </div>

      <SessionExhibit />

      <div className={styles.runHeader}>
        <span className={styles.runCommand}>cognigy run playbooks</span>
        <span className={styles.runStamp}>2026-08-02</span>
        <span className={FAILED ? styles.runVerdictBad : styles.runVerdict}>
          {FAILED} failed
        </span>
      </div>

      <p className={styles.runOpener}>
        Each playbook opens on{" "}
        <span className={styles.runOpenerSaid}>{OPENER.utterance}</span>, asserts
        the greeting and the announce, then probes one branch
      </p>

      <ol className={styles.runLedger}>
        {ROWS.map((row) => (
          <li
            key={row.id}
            className={row.trip ? styles.runRowTrip : styles.runRow}
          >
            <a className={styles.runIndex} href={`${DEFS}/${row.file}`} target="_blank" rel="noreferrer">
              {row.id}
            </a>
            <div className={styles.runBody}>
              <Said row={row} />
              <p className={styles.runResult}>
                <span className={row.quiet ? styles.runQuiet : styles.runResolved}>
                  {row.resolved}
                </span>
                {row.slot ? (
                  <span className={styles.runCapture}>{row.slot}</span>
                ) : null}
                <span className={styles.runTypes}>{row.asserts.join(" ")}</span>
                <span className={row.quiet ? styles.runScoreQuiet : styles.runScore}>
                  {row.passed}/{row.asserts.length}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ol>

      <dl className={styles.runTotals}>
        <div>
          <dt>playbooks</dt>
          <dd>{PLAYBOOKS}</dd>
        </div>
        <div>
          <dt>steps</dt>
          <dd>{STEPS}</dd>
        </div>
        <div>
          <dt>asserts</dt>
          <dd>{ASSERTS}</dd>
        </div>
      </dl>
    </section>
  );
}
