import type { Metadata } from "next";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { MatchDossier } from "@/components/tawkify/MatchDossier";
import { preparedMatch } from "@/lib/tawkify/data";
import styles from "../tawkify.module.css";

export const metadata: Metadata = {
  title: "Your introduction · Tawkify modernization concept",
  description:
    "Client surface of the unofficial Tawkify concept: one prepared introduction with the matchmaker's reasoning attached.",
};

export default function TawkifyMatchPage() {
  return (
    <ConceptShell>
      <div className={styles.sheet}>
        <header className={styles.appHead}>
          <p className={styles.kicker}>Client surface · one introduction at a time</p>
          <h1 className={styles.appTitle}>Renee prepared an introduction for you</h1>
          <p className={styles.appDeck}>
            No queue, no browsing. When your matchmaker is sure, a file like
            this arrives. Everything in it was screened by a person, and the
            parts a model helped with say so.
          </p>
          <div className={styles.fileLine}>
            <span className={styles.mono}>matchmaker · {preparedMatch.matchmaker}</span>
            <span className={styles.mono}>prepared · Tue, 10:41 am</span>
            <span className={styles.mono}>candidates screened for this file · 3</span>
          </div>
        </header>

        <MatchDossier />
      </div>
    </ConceptShell>
  );
}
