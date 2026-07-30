"use client";

import { useState } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";

// The withheld portrait's opt-in control. No-JS renders the same control as
// a plain button in its unrequested state, and the rationale beside it is
// ordinary server-rendered content either way.
export function RevealChoice() {
  const [requested, setRequested] = useState(false);
  return (
    <div className={styles.revealControl}>
      <button
        type="button"
        className={styles.buttonQuiet}
        onClick={() => setRequested(true)}
        disabled={requested}
      >
        {requested ? "Request sent to both sides" : "Request photo reveal"}
      </button>
      {requested ? (
        <p className={styles.factSmall} style={{ marginTop: "0.6rem" }}>
          CLAIRE DECIDES TOO · NOTHING IS SHARED UNTIL YOU BOTH OPT IN
        </p>
      ) : null}
    </div>
  );
}
