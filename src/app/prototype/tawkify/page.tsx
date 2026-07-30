import type { Metadata } from "next";
import Link from "next/link";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { PairMark } from "@/components/tawkify/PairMark";
import { debriefs, ledgerSteps, publicStats } from "@/lib/tawkify/data";
import styles from "./tawkify.module.css";

export const metadata: Metadata = {
  title: "Tawkify modernization concept",
  description:
    "An unofficial redesign concept for tawkify.com: the matchmaking service as an introduction ledger, across marketing, client, and matchmaker surfaces.",
};

export default function TawkifyStoryPage() {
  return (
    <ConceptShell>
      <div className={styles.sheet}>
        <section className={styles.hero}>
          <p className={`${styles.kicker} ${styles.heroKicker}`}>
            Matchmaking as a practice, not an app
          </p>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle} data-reveal="rise">
                Your person is out there
                <br />
                <span className={styles.inkUnderline} data-reveal="ink">
                  we make the introduction
                </span>
              </h1>
              <p className={styles.heroDeck} data-reveal="rise" style={{ "--stagger": 1 } as React.CSSProperties}>
                A real matchmaker learns your file, screens every candidate,
                plans the date, and collects the debrief. You never swipe.
              </p>
              <div className={styles.heroActions} data-reveal="rise" style={{ "--stagger": 2 } as React.CSSProperties}>
                <Link href="/prototype/tawkify/match" className={styles.ctaPrimary}>
                  See a prepared introduction
                </Link>
                <Link href="/prototype/tawkify/desk" className={styles.ctaGhost}>
                  Or sit at the matchmaker desk
                </Link>
              </div>
            </div>
            <PairMark />
          </div>
        </section>

        <section className={`${styles.section} ${styles.manifesto}`}>
          <h2 className={styles.manifestoLede} data-reveal="rise">
            Apps hand you a queue of strangers. We hand you one person, with
            the reasons written down
          </h2>
          <div className={styles.manifestoBody} data-reveal="rise" style={{ "--stagger": 1 } as React.CSSProperties}>
            <p>
              Every Tawkify client has a file, kept by a human matchmaker who
              has actually talked to them. <strong>Curation replaces
              browsing:</strong> candidates are screened against your file one
              at a time, and the ones who reach you come with evidence.
            </p>
            <p>
              The date itself is handled end to end, reservation included. And
              after it, both sides debrief, so the file sharpens with every
              introduction instead of resetting to zero.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>How an introduction gets made</h2>
            <span className={styles.mono}>the ledger, four entries</span>
          </div>
          <div className={styles.ledger}>
            {ledgerSteps.map((step, index) => (
              <article
                key={step.id}
                className={styles.ledgerRow}
                data-reveal="rise"
                style={{ "--stagger": index } as React.CSSProperties}
              >
                <span className={styles.ledgerIndex}>{step.id}</span>
                <div className={styles.ledgerTitleWrap}>
                  <span className={styles.ledgerKicker}>{step.kicker}</span>
                  <h3 className={styles.ledgerTitle}>{step.title}</h3>
                </div>
                <p className={styles.ledgerBody}>{step.body}</p>
                <span className={styles.ledgerNote}>{step.note}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className={`${styles.section} ${styles.statsBand}`}>
        <div className={styles.sheet}>
          <div className={styles.statsGrid}>
            {publicStats.map((stat) => (
              <div key={stat.label} className={styles.stat}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
                <span className={styles.statSource}>{stat.source}</span>
              </div>
            ))}
          </div>
          <p className={styles.statsFootnote}>
            Figures are Tawkify&apos;s own published numbers, read in July 2026
            and sourced beside each value. This concept invents nothing about
            the business, only the presentation.
          </p>
        </div>
      </section>

      <div className={styles.sheet}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>From the debrief files</h2>
            <span className={styles.mono}>invented composites, in clients&apos; voice</span>
          </div>
          <div className={styles.debriefGrid}>
            {debriefs.map((debrief, index) => (
              <figure
                key={debrief.id}
                className={styles.debriefCard}
                data-reveal="rise"
                style={{ "--stagger": index } as React.CSSProperties}
              >
                <blockquote className={styles.debriefQuote}>
                  {debrief.quote}
                </blockquote>
                <figcaption className={styles.debriefMeta}>
                  <span className={styles.debriefNames}>{debrief.names}</span>
                  <span className={styles.debriefOutcome}>
                    {debrief.outcome} · {debrief.dates} dates · file {debrief.id}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.closing}`}>
          <h2 className={styles.closingTitle} data-reveal="rise">
            Stop swiping,{" "}
            <span className={styles.inkUnderline} data-reveal="ink">
              get introduced
            </span>
          </h2>
          <p className={styles.closingDeck} data-reveal="rise" style={{ "--stagger": 1 } as React.CSSProperties}>
            The next surface shows what a client actually receives: one
            prepared introduction, with the matchmaker&apos;s reasoning attached.
          </p>
          <div className={styles.heroActions} data-reveal="rise" style={{ "--stagger": 2 } as React.CSSProperties}>
            <Link href="/prototype/tawkify/match" className={styles.ctaPrimary}>
              Open the client surface
            </Link>
          </div>
        </section>
      </div>
    </ConceptShell>
  );
}
