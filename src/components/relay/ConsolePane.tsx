"use client";

import type { createScenario } from "@/lib/relay/scenario.mjs";
import type { createSession } from "@/lib/relay/engine.mjs";
import { FlowGraph } from "@/components/relay/FlowGraph";
import styles from "@/app/prototype/relay/relay.module.css";

type Scenario = ReturnType<typeof createScenario>;
type Session = ReturnType<typeof createSession>;
type Read = Session["reads"][number];

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatElapsed = (seconds: number) => {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export function ConsolePane({
  scenario,
  eventFired,
  activeNode,
  visited,
  lastRead,
  channel,
  mode,
  handover,
  wrapup,
  usedSuggestions,
  onSendAgent,
  inboundCount,
  outboundCount,
  meanConfidence,
  elapsed,
}: {
  scenario: Scenario;
  eventFired: boolean;
  activeNode: string;
  visited: string[];
  lastRead: Read | null;
  channel: "chat" | "sms";
  mode: string;
  handover: Session["handover"];
  wrapup: Session["wrapup"];
  usedSuggestions: string[];
  onSendAgent: (text: string) => void;
  inboundCount: number;
  outboundCount: number;
  meanConfidence: number | null;
  elapsed: number;
}) {
  return (
    <section className={styles.console} aria-label="Supervisor console">
      <div className={styles.consoleBlock}>
        <h2 className={styles.consoleHeading}>Event ledger</h2>
        <ul className={styles.ledger}>
          {scenario.ledger.map((entry) => {
            const fired = entry.state === "armed" && eventFired;
            return (
              <li
                key={entry.id}
                className={fired ? `${styles.ledgerRow} ${styles.ledgerFired}` : styles.ledgerRow}
              >
                <span>{entry.id}</span>
                <span className={styles.ledgerKind}>{entry.kind}</span>
                <span className={styles.ledgerState}>
                  {fired ? "FIRED" : entry.state.toUpperCase()}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.consoleBlock}>
        <h2 className={styles.consoleHeading}>Flow</h2>
        <FlowGraph activeNode={activeNode} visited={visited} />
      </div>

      <div className={styles.consoleBlock}>
        <h2 className={styles.consoleHeading}>Last inbound read</h2>
        {lastRead ? (
          <div className={styles.nluRead}>
            <p className={styles.nluUtterance}>&ldquo;{lastRead.text}&rdquo;</p>
            {lastRead.resolved &&
            lastRead.resolved !== lastRead.top.id &&
            lastRead.resolved !== "fallback" ? (
              // A context slot answered the open question; a confidence bar
              // over the keyword ranking would be the wrong number to show.
              <div className={styles.confRow}>
                <span className={styles.confIntent}>{lastRead.resolved}</span>
                <span className={styles.contextNote}>
                  context slot · expected answer
                </span>
              </div>
            ) : (
              <div className={styles.confRow}>
                <span className={styles.confIntent}>
                  {lastRead.resolved === "fallback"
                    ? `fallback · best ${lastRead.top.id}`
                    : lastRead.top.id}
                </span>
                <span className={styles.confBarTrack}>
                  <span
                    className={styles.confBarFill}
                    style={{ width: percent(lastRead.top.confidence) }}
                  />
                </span>
                <span className={styles.confValue}>
                  {percent(lastRead.top.confidence)}
                </span>
              </div>
            )}
            {lastRead.ranked[1] && lastRead.ranked[1].confidence > 0 ? (
              <p className={styles.runnerUp}>
                runner-up {lastRead.ranked[1].id}{" "}
                {percent(lastRead.ranked[1].confidence)}
              </p>
            ) : null}
            {lastRead.top.matched.length > 0 ? (
              <p className={styles.matchRow}>
                matched {lastRead.top.matched.join(" · ")}
              </p>
            ) : null}
            {lastRead.entities.length > 0 ? (
              <div className={styles.entityRow}>
                {lastRead.entities.map((entity) => (
                  <span
                    key={`${entity.type}-${entity.value}`}
                    className={styles.entityChip}
                  >
                    {entity.type}: {entity.value}
                  </span>
                ))}
              </div>
            ) : null}
            <div className={styles.sentimentRow}>
              <span>sentiment</span>
              <span className={styles.sentimentTrack}>
                <span
                  className={styles.sentimentNeedle}
                  style={{ left: `${((lastRead.sentiment + 1) / 2) * 100}%` }}
                />
              </span>
              <span>{lastRead.sentiment.toFixed(1)}</span>
            </div>
          </div>
        ) : (
          <p className={styles.emptyLine}>No inbound yet · assistant holds the line</p>
        )}
      </div>

      {handover ? (
        <div className={`${styles.consoleBlock} ${styles.desk}`}>
          <h2 className={styles.consoleHeading}>
            Handover desk · {handover.agentName}
          </h2>
          <p
            className={
              /policy|threshold/i.test(handover.reason)
                ? `${styles.deskReason} ${styles.deskReasonTrip}`
                : styles.deskReason
            }
          >
            {handover.reason}
          </p>
          <ul className={styles.deskSummary}>
            {handover.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {mode === "human" && !wrapup ? (
            <>
              <p className={styles.deskHint}>
                You hold the copper line now. Send a suggested reply
              </p>
              <div className={styles.suggestions}>
                {handover.suggestedReplies
                  .filter((reply) => !usedSuggestions.includes(reply))
                  .map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      className={styles.suggestion}
                      onClick={() => onSendAgent(reply)}
                    >
                      {reply}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {wrapup ? (
        <div className={`${styles.consoleBlock} ${styles.wrapCard}`}>
          <h2 className={styles.consoleHeading}>Wrap up</h2>
          <ul className={styles.dispositionList}>
            {wrapup.disposition.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.wrapMeta}>
            handled by {wrapup.handledBy} · {wrapup.inboundCount} inbound ·
            mean confidence {percent(wrapup.meanConfidence)} · sentiment{" "}
            {wrapup.sentiment.toFixed(1)}
          </p>
        </div>
      ) : null}

      <footer className={styles.wallboard}>
        <span>IN {inboundCount}</span>
        <span>OUT {outboundCount}</span>
        <span>CONF {meanConfidence === null ? "··" : percent(meanConfidence)}</span>
        <span>CH {channel.toUpperCase()}</span>
        <span>MODE {mode.toUpperCase()}</span>
        <span>T {formatElapsed(elapsed)}</span>
      </footer>
    </section>
  );
}
