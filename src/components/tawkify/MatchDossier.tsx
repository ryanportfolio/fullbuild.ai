"use client";

import { useState } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";
import { preparedMatch } from "@/lib/tawkify/data";

// The signature REVEAL. A native <details> so the introduction is reachable
// without JS; the open animation is layered on in CSS behind [data-js].
export function MatchDossier() {
  const [confirmed, setConfirmed] = useState(false);
  const match = preparedMatch;

  return (
    <details className={styles.dossier}>
      <summary className={styles.dossierSummary}>
        <span className={styles.dossierPrompt}>
          <span className={styles.mono}>file {match.fileId} · sealed until you open it</span>
          <span className={styles.dossierPromptTitle}>Open your introduction</span>
        </span>
        <span className={styles.dossierSeal} aria-hidden="true">
          {match.fileId.slice(-4)}
        </span>
      </summary>

      <div className={styles.dossierBody}>
        <div className={styles.matchIdentity}>
          <h2 className={styles.matchName}>{match.firstName}</h2>
          <div className={styles.matchFacts}>
            <span className={styles.mono}>{match.age}</span>
            <span className={styles.mono}>{match.distance}</span>
            <span className={styles.mono}>{match.vocation}</span>
          </div>
        </div>

        <div>
          <p className={styles.assistTag}>
            signals surfaced by assist · every one verified by {match.matchmaker.split(",")[0]}
          </p>
          <div className={styles.signalGrid} style={{ marginTop: "0.9rem" }}>
            {match.signals.map((signal) => (
              <div key={signal.label} className={styles.signalCard}>
                <p className={styles.signalLabel}>{signal.label}</p>
                <p className={styles.signalEvidence}>{signal.evidence}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.narrative}>
          {match.narrative.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
          <p className={styles.narrativeByline}>
            written by {match.matchmaker} · drafted with assist, edited and approved by her
          </p>
        </div>

        <div className={styles.datePlan}>
          <div className={styles.datePlanCell}>
            <span className={styles.datePlanLabel}>When</span>
            <span className={styles.datePlanValue}>{match.datePlan.when}</span>
          </div>
          <div className={styles.datePlanCell}>
            <span className={styles.datePlanLabel}>Where</span>
            <span className={styles.datePlanValue}>{match.datePlan.where}</span>
          </div>
          <div className={styles.datePlanCell}>
            <span className={styles.datePlanLabel}>Handled</span>
            <span className={styles.datePlanDetail}>{match.datePlan.detail}</span>
          </div>
        </div>

        <div className={styles.matchActions}>
          <button
            type="button"
            className={styles.assistApprove}
            data-approved={confirmed || undefined}
            onClick={() => setConfirmed(true)}
            disabled={confirmed}
          >
            {confirmed ? "Confirmed, invite on your calendar" : "Confirm Thursday"}
          </button>
          <span className={styles.mono}>
            {confirmed
              ? "your matchmaker was notified"
              : "or reply to Renee with a better time"}
          </span>
        </div>
      </div>
    </details>
  );
}
