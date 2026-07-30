"use client";

import { useState } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";
import { assistDraft, matchApproval } from "@/lib/tawkify/data";
import { ApprovalStamp } from "@/components/tawkify/Shared";

// Assist drafts, the matchmaker owns. Two-step by design: the draft must be
// opened for editing before approval unlocks. Approving writes the same
// ApprovalStamp object the client sees on /match. Mocked model output,
// deterministic; in the real build this is an LLM call over both case files.
export function AssistDesk() {
  const [text, setText] = useState(assistDraft.intro);
  const [reviewed, setReviewed] = useState(false);
  const [approved, setApproved] = useState(false);

  return (
    <section className={styles.panel} aria-label="Assist">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Assist</h2>
        <span className={styles.assistLabel}>
          {approved ? "APPROVED · SENT" : "ASSIST DRAFT · NOT SENT"}
        </span>
      </div>
      <div className={styles.panelBody}>
        <label className={styles.factSmall} htmlFor="assist-draft">
          DRAFT INTRODUCTION · GENERATED FROM FILES C-3311 + N-114
        </label>
        <textarea
          id="assist-draft"
          className={styles.assistField}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setReviewed(true)}
          readOnly={approved}
        />
        <div>
          <p className={styles.factSmall}>WHY ASSIST PICKED THIS PAIRING</p>
          <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.4rem" }}>
            {assistDraft.rationale.map((reason) => (
              <li key={reason} className={styles.rosterObligation}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.assistActions}>
          <button
            type="button"
            className={styles.buttonInk}
            data-state={approved ? "done" : undefined}
            disabled={!reviewed || approved}
            onClick={() => setApproved(true)}
            title={reviewed ? undefined : "Open the draft for editing first"}
          >
            {approved ? "Approved and sent" : reviewed ? "Approve and send" : "Edit before approving"}
          </button>
          <span className={styles.factSmall}>
            NOTHING REACHES A CLIENT WITHOUT A NAME AND TIMESTAMP
          </span>
        </div>
        {approved ? <ApprovalStamp record={matchApproval} /> : null}
      </div>
    </section>
  );
}
