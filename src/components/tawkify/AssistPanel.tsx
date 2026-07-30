"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";
import { assistDraft } from "@/lib/tawkify/data";

const words = assistDraft.intro.split(" ");
const STREAM_INTERVAL_MS = 26;

// Mocked model output. Server render shows the full draft (the no-JS and
// reduced-motion truth); with JS and motion allowed, the first open replays
// the draft word by word on a fixed interval, deterministic by design.
export function AssistPanel() {
  const [visibleCount, setVisibleCount] = useState(words.length);
  const [approved, setApproved] = useState(false);
  const streamed = useRef(false);

  useEffect(() => {
    if (visibleCount >= words.length) return;
    const timer = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count + 1 >= words.length) window.clearInterval(timer);
        return count + 1;
      });
    }, STREAM_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [visibleCount >= words.length]);

  function handleToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || streamed.current) return;
    streamed.current = true;
    const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (motionOk) setVisibleCount(0);
  }

  return (
    <section className={`${styles.deskPanel} ${styles.assistPanel}`} aria-label="Assist">
      <details className={styles.assistDetails} onToggle={handleToggle}>
        <summary className={styles.assistSummary}>
          <span className={styles.dossierPrompt}>
            <span className={styles.mono}>case C-3311 · draft ready</span>
            <span className={styles.deskPanelTitle}>Assist wrote a first pass of the introduction</span>
          </span>
        </summary>
        <div className={styles.assistBody}>
          <p className={styles.assistDraft} aria-label="Draft introduction">
            {words.map((word, index) => (
              <span
                key={`${index}-${word}`}
                data-word
                data-hidden={index >= visibleCount || undefined}
              >
                {word}{" "}
              </span>
            ))}
          </p>
          <div>
            <p className={styles.assistTag}>why assist picked this pairing</p>
            <ul className={styles.assistRationale}>
              {assistDraft.rationale.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div className={styles.assistFoot}>
            <button
              type="button"
              className={styles.assistApprove}
              data-approved={approved || undefined}
              onClick={() => setApproved(true)}
              disabled={approved}
            >
              {approved ? "Approved and sent to both clients" : "Approve and send"}
            </button>
            <span className={styles.mono}>
              nothing reaches a client without matchmaker approval
            </span>
          </div>
        </div>
      </details>
    </section>
  );
}
