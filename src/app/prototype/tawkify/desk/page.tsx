import type { Metadata } from "next";
import { AssistDesk } from "@/components/tawkify/AssistDesk";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { DossierConnectors } from "@/components/tawkify/DossierConnectors";
import { ConstraintRows, StageTimeline } from "@/components/tawkify/Shared";
import {
  auditStrip,
  candidateQueue,
  constraints,
  continuityLedger,
  deskCounters,
  dossierPairs,
  roster,
} from "@/lib/tawkify/data";
import styles from "../tawkify.module.css";

export const metadata: Metadata = {
  title: "Matchmaker desk · Tawkify modernization concept",
  description:
    "Internal surface of the unofficial Tawkify concept: a caseload sorted by silence, a dossier spread, a blocking constraint gate, and an assist that drafts but never sends.",
};

export default function TawkifyDeskPage() {
  return (
    <ConceptShell>
      <div className={styles.appMain}>
        <div className={`${styles.deskBar} ${styles.onInk}`}>
          <div className={styles.deskBarInner}>
            <span className={styles.deskBarName}>Dana Reyes</span>
            <span className={styles.deskCounter}>WED 30 JUL 2026</span>
            {deskCounters.map((counter) => (
              <span key={counter.label} className={styles.deskCounter}>
                <strong>{counter.value}</strong> {counter.label.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.appLayout}>
          {/* Roster rail, sorted by silence */}
          <aside className={styles.rail} aria-label="Roster">
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Roster</h2>
                <span className={styles.factSmall}>BY DAYS SINCE CONTACT</span>
              </div>
              <ul className={styles.rosterList}>
                {roster.map((row) => (
                  <li key={row.id} className={styles.rosterRow}>
                    <div className={styles.rosterTop}>
                      <span className={styles.rosterName}>{row.client}</span>
                      <span className={styles.slaClock} data-late={row.daysSinceContact > 14 || undefined}>
                        {row.daysSinceContact}D QUIET
                      </span>
                    </div>
                    <span className={styles.rosterMeta}>
                      {row.id} · {row.monthsWithMe} MO WITH ME
                    </span>
                    <span className={styles.rosterObligation}>{row.nextObligation}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <div className={styles.deskContent}>
            {/* The dossier spread: client left, candidate right, keylines
                between matched non-negotiables at >=1200px */}
            <section className={styles.panel} aria-label="Dossier spread">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Alex R. × Claire M.</h2>
                <span className={styles.factSmall}>C-3311 × N-114 · DOSSIER SPREAD</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.dossierGrid} id="dossier-spread">
                  <DossierConnectors containerId="dossier-spread" pairIds={dossierPairs.map((p) => p.id)} />
                  <div className={styles.dossierCol}>
                    <span className={styles.dossierColHead}>Client · Alex R.</span>
                    {dossierPairs.map((pair) => (
                      <p key={pair.id} className={styles.dossierRow} data-pair-left={pair.id}>
                        {pair.client}
                      </p>
                    ))}
                  </div>
                  <div className={styles.dossierCol}>
                    <span className={styles.dossierColHead}>Candidate · Claire M.</span>
                    {dossierPairs.map((pair) => (
                      <p key={pair.id} className={styles.dossierRow} data-pair-right={pair.id}>
                        {pair.candidate}
                      </p>
                    ))}
                  </div>
                </div>
                <StageTimeline current={4} note="INT-0847 · ADVANCED TO INTRODUCED 12 MAR 09:14" />
              </div>
            </section>

            {/* Constraint gate, editable here, blocking */}
            <section className={styles.panel} aria-label="Constraint gate">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Constraint gate</h2>
                <span className={styles.factSmall}>
                  A FAILING HARD CONSTRAINT BLOCKS RELEASE · OVERRIDES ARE SHOWN TO THE CLIENT
                </span>
              </div>
              <div className={styles.panelBody}>
                <ConstraintRows rows={constraints} />
              </div>
            </section>

            {/* Candidate queue */}
            <section className={styles.panel} aria-label="Candidate queue">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Candidate queue for Alex R.</h2>
                <span className={styles.factSmall}>SOURCE LABELED · SCREENING DATED</span>
              </div>
              <div className={styles.queueScroll}>
                <table className={styles.queueTable}>
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Distance</th>
                      <th scope="col">Age</th>
                      <th scope="col">Active</th>
                      <th scope="col">Source</th>
                      <th scope="col">Screening</th>
                      <th scope="col">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateQueue.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className={styles.queueName}>{row.name}</span>
                          {row.flagNote ? <span className={styles.queueFlagNote}>{row.flagNote}</span> : null}
                        </td>
                        <td className={styles.queueFact}>{row.distance}</td>
                        <td className={styles.queueFact}>{row.age}</td>
                        <td className={styles.queueFact}>{row.lastActive}</td>
                        <td className={styles.queueFact}>{row.source.toUpperCase()}</td>
                        <td className={styles.queueFact}>{row.screening.toUpperCase()}</td>
                        <td>
                          <span className={styles.statusPill} data-state={row.verdict === "clear" ? "done" : "flag"}>
                            {row.verdict === "clear" ? "CLEAR" : "FLAG"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Assist */}
            <AssistDesk />

            {/* Continuity ledger + audit strip */}
            <section className={styles.panel} aria-label="Continuity and audit">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Continuity ledger, C-3311</h2>
                <span className={styles.factSmall}>TURNOVER IS VISIBLE TO THE PERSON CAUSING IT</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.ledgerList}>
                  {continuityLedger.map((entry) => (
                    <div key={entry.matchmaker} className={styles.ledgerRow}>
                      <span className={styles.rosterName}>{entry.matchmaker}</span>
                      <span className={styles.factSmall}>
                        {entry.held.toUpperCase()}
                        {entry.handoff ? ` · ${entry.handoff.toUpperCase()}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.auditStrip}>
                  {auditStrip.map((line) => (
                    <span key={line} className={styles.auditLine}>
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ConceptShell>
  );
}
