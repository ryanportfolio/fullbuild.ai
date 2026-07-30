import type { Metadata } from "next";
import { AssistPanel } from "@/components/tawkify/AssistPanel";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { caseload, shortlist } from "@/lib/tawkify/data";
import styles from "../tawkify.module.css";

export const metadata: Metadata = {
  title: "Matchmaker desk · Tawkify modernization concept",
  description:
    "Internal surface of the unofficial Tawkify concept: the matchmaker's caseload, a screened shortlist, and an assist that drafts but never sends.",
};

export default function TawkifyDeskPage() {
  return (
    <ConceptShell>
      <div className={styles.sheet}>
        <header className={styles.appHead}>
          <p className={styles.kicker}>Internal surface · the other side of the ledger</p>
          <h1 className={styles.appTitle}>Renee&apos;s desk, Wednesday morning</h1>
          <p className={styles.appDeck}>
            Matchmakers live in a caseload, not a CRM tab. One screen holds
            the open files, the shortlist under review, and an assist that
            drafts introductions the matchmaker still owns.
          </p>
          <div className={styles.fileLine}>
            <span className={styles.mono}>open files · {caseload.length}</span>
            <span className={styles.mono}>
              due today · {caseload.filter((c) => c.due === "today").length}
            </span>
            <span className={styles.mono}>
              overdue · {caseload.filter((c) => c.due === "overdue").length}
            </span>
          </div>
        </header>

        <div className={styles.deskLayout}>
          <section className={styles.deskPanel} aria-label="Caseload">
            <div className={styles.deskPanelHead}>
              <h2 className={styles.deskPanelTitle}>Caseload</h2>
              <span className={styles.mono}>sorted by urgency</span>
            </div>
            <div className={styles.caseScroll}>
              <table className={styles.caseTable}>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Client</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Next action</th>
                  <th scope="col">Due</th>
                </tr>
              </thead>
              <tbody>
                {caseload.map((caseFile) => (
                  <tr key={caseFile.id}>
                    <td className={styles.caseId}>{caseFile.id}</td>
                    <td className={styles.caseClient}>{caseFile.client}</td>
                    <td className={styles.caseStage}>{caseFile.stage}</td>
                    <td className={styles.caseAction}>{caseFile.nextAction}</td>
                    <td>
                      <span className={styles.caseDue} data-heat={caseFile.heat}>
                        {caseFile.due}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: "grid", gap: "2rem" }}>
            <section className={styles.deskPanel} aria-label="Shortlist under review">
              <div className={styles.deskPanelHead}>
                <h2 className={styles.deskPanelTitle}>Shortlist for Alex R.</h2>
                <span className={styles.mono}>7 screens per candidate</span>
              </div>
              <ul className={styles.shortlistList}>
                {shortlist.map((candidate) => (
                  <li key={candidate.id} className={styles.shortlistItem}>
                    <div className={styles.shortlistTop}>
                      <span className={styles.shortlistName}>{candidate.name}</span>
                      <span
                        className={styles.screenCount}
                        data-clear={candidate.screensPassed === candidate.screensTotal || undefined}
                      >
                        {candidate.screensPassed}/{candidate.screensTotal} screens
                      </span>
                    </div>
                    <p className={styles.shortlistStandout}>{candidate.standout}</p>
                    {candidate.flags.map((flag) => (
                      <span key={flag} className={styles.shortlistFlag}>
                        flag · {flag}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>

            <AssistPanel />
          </div>
        </div>
      </div>
    </ConceptShell>
  );
}
