import type { Metadata } from "next";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { RevealChoice } from "@/components/tawkify/RevealChoice";
import {
  ApprovalStamp,
  ConstraintRows,
  Plate,
  StageTimeline,
} from "@/components/tawkify/Shared";
import { clientMatch, constraints, matchApproval, matchmakers } from "@/lib/tawkify/data";
import styles from "../tawkify.module.css";

export const metadata: Metadata = {
  title: "Your introduction · Tawkify modernization concept",
  description:
    "Client surface of the unofficial Tawkify concept: one prepared introduction, its constraint check, its screening record, and the matchmaker who signed it.",
};

const dana = matchmakers[0];

export default function TawkifyMatchPage() {
  return (
    <ConceptShell>
      <div className={styles.appMain}>
        <div className={styles.bandInner}>
          <header className={styles.matchHead}>
            <span className={styles.rule} />
            <p className={styles.eyebrow}>Your introduction · one at a time, never a queue</p>
            <div className={styles.matchIdentity}>
              <h1 className={styles.matchName}>
                {clientMatch.firstName}, {clientMatch.age}
              </h1>
              <div className={styles.factRow}>
                <span className={styles.fact}>{clientMatch.city.toUpperCase()}</span>
                <span className={styles.fact}>{clientMatch.distance}</span>
                <span className={styles.fact}>FILE {clientMatch.fileId} · PREPARED {clientMatch.preparedOn.toUpperCase()}</span>
              </div>
            </div>
          </header>
        </div>

        <div className={styles.appLayout}>
          {/* Matchmaker rail: continuity shown, not asserted */}
          <aside className={styles.rail} aria-label="Your matchmaker">
            <section className={styles.panel}>
              <div className={styles.panelBody}>
                <Plate id="p10" />
                <div className={styles.makerMeta}>
                  <h2 className={styles.h3} style={{ fontSize: "1.15rem" }}>
                    {dana.name}
                  </h2>
                  <span className={styles.factSmall}>
                    YOUR MATCHMAKER · {dana.years} YRS · REPLIES WITHIN A DAY
                  </span>
                </div>
                <p className={styles.factSmall}>
                  MATCHES {clientMatch.matchesUsed.toUpperCase()} · NEXT CHECK-IN {clientMatch.nextCheckIn.toUpperCase()} · UPDATED {clientMatch.lastUpdated.toUpperCase()}
                </p>
                <a href="#message" className={styles.pillGhost}>
                  Message Dana
                </a>
              </div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelBody}>
                <span className={styles.factSmall}>WHERE THIS INTRODUCTION IS</span>
                <StageTimeline
                  current={clientMatch.currentStage}
                  note={`UPDATED ${clientMatch.lastUpdated.toUpperCase()} · NEVER MORE THAN 14 DAYS QUIET`}
                />
              </div>
            </section>
          </aside>

          <div className={styles.deskContent}>
            {/* The withheld portrait is the product, not a placeholder */}
            <section className={styles.panel} aria-label="What you know and what you do not">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>What you know, and what you don&rsquo;t yet</h2>
                <span className={styles.factSmall}>BLIND BY DESIGN</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.withheldGrid}>
                  <Plate id="p11" />
                  <div className={styles.withheldCopy}>
                    <p>{clientMatch.blindRationale}</p>
                    <RevealChoice />
                  </div>
                </div>
              </div>
            </section>

            {/* Constraint check: the same component the matchmaker writes */}
            <section className={styles.panel} aria-label="Constraint check">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Your file, checked</h2>
                <span className={styles.factSmall}>SAME COMPONENT YOUR MATCHMAKER EDITS</span>
              </div>
              <div className={styles.panelBody}>
                <ConstraintRows rows={constraints} />
              </div>
            </section>

            {/* The narrative, signed */}
            <section className={styles.panel} aria-label="Why we think this works">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Why we think this works</h2>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.narrativeBlock}>
                  <p>{clientMatch.narrative[0]}</p>
                  <p className={styles.narrativePull}>&ldquo;{clientMatch.pullLine}&rdquo;</p>
                  <p>{clientMatch.narrative[1]}</p>
                  <p>{clientMatch.narrative[2]}</p>
                </div>
                <ApprovalStamp record={matchApproval} />
              </div>
            </section>

            {/* Screening record for this match */}
            <section className={styles.panel} aria-label="This match's screening">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>This match&rsquo;s screening</h2>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.factRow}>
                  {clientMatch.screeningRecord.map((item) => (
                    <span key={item.label} className={styles.fact}>
                      {item.label.toUpperCase()} · {item.value.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* The date */}
            <section className={styles.panel} aria-label="The date">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>The date, handled</h2>
              </div>
              <div className={styles.panelBody}>
                <dl className={styles.dateGrid}>
                  <div className={styles.dateCell}>
                    <dt>When</dt>
                    <dd>{clientMatch.date.when}</dd>
                  </div>
                  <div className={styles.dateCell}>
                    <dt>Where</dt>
                    <dd>{clientMatch.date.where}</dd>
                  </div>
                  <div className={styles.dateCell}>
                    <dt>Booked</dt>
                    <dd className={styles.muted} style={{ fontWeight: 400, fontSize: "0.95rem" }}>
                      {clientMatch.date.booked}
                    </dd>
                  </div>
                  <div className={styles.dateCell}>
                    <dt>Not shared</dt>
                    <dd className={styles.muted} style={{ fontWeight: 400, fontSize: "0.95rem" }}>
                      {clientMatch.date.notShared}
                    </dd>
                  </div>
                </dl>
                <div className={styles.decisionRow}>
                  <button type="button" className={styles.pillPrimary}>
                    Accept Thursday
                  </button>
                  <button type="button" className={styles.pillGhost} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
                    Decline, with a reason that updates your file
                  </button>
                </div>
                <p className={styles.factSmall}>
                  AFTER THE DATE · DANA COLLECTS BOTH DEBRIEFS · YOUR FILE GETS SHARPER
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ConceptShell>
  );
}
