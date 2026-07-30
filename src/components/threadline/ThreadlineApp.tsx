"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Garment } from "@/components/threadline/Garment";
import {
  cloneDemoEvents,
  cloneDemoStyles,
  milestoneLabels,
  milestoneOrder,
  readinessFor,
  statusFor,
  type Blocker,
  type IntegrationEvent,
  type StyleSummary,
} from "@/lib/threadline/domain";
import styles from "@/app/prototype/threadline/threadline.module.css";

const severityRank = { critical: 0, warning: 1 };
const navigation = [
  { id: "launch-control", number: "01", label: "Control" },
  { id: "collection", number: "02", label: "Styles" },
  { id: "integration-pulse", number: "03", label: "Pulse" },
  { id: "system-map", number: "04", label: "System" },
] as const;

function statusCopy(status: ReturnType<typeof statusFor>) {
  return status === "in-progress" ? "In progress" : status === "at-risk" ? "At risk" : status[0].toUpperCase() + status.slice(1);
}

function AppMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 7h30M5 20h30M5 33h30M11 3v34M29 3v34" />
      <path d="m11 13 18 14M29 13 11 27" />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className={styles.summaryCard} data-tone={tone}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function StatusPill({ style }: { style: StyleSummary }) {
  const status = statusFor(style);
  return (
    <span className={styles.statusPill} data-status={status}>
      <i aria-hidden="true" />
      {statusCopy(status)}
    </span>
  );
}

export function ThreadlineApp() {
  const [styleRows, setStyleRows] = useState<StyleSummary[]>(cloneDemoStyles);
  const [events, setEvents] = useState<IntegrationEvent[]>(cloneDemoEvents);
  const [selectedId, setSelectedId] = useState("style-transit-shell");
  const [activeSection, setActiveSection] = useState<(typeof navigation)[number]["id"]>("launch-control");
  const [announcement, setAnnouncement] = useState("Threadline demo loaded.");
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.find((entry) => entry.isIntersecting);
        if (active) setActiveSection(active.target.id as (typeof navigation)[number]["id"]);
      },
      { rootMargin: "-18% 0px -68% 0px" },
    );
    navigation.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const selected = styleRows.find((style) => style.id === selectedId) ?? styleRows[0];
  const blockers = useMemo(
    () =>
      styleRows
        .flatMap((style) => style.blockers)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.ageHours - a.ageHours),
    [styleRows],
  );
  const readyCount = styleRows.filter((style) => statusFor(style) === "ready").length;
  const blockedCount = styleRows.filter((style) => statusFor(style) === "blocked").length;
  const collectionReadiness = Math.round(
    styleRows.reduce((total, style) => total + readinessFor(style), 0) / styleRows.length,
  );
  const failedCount = events.filter((event) => event.state === "failed").length;

  function selectStyle(styleId: string) {
    setSelectedId(styleId);
    const target = styleRows.find((style) => style.id === styleId);
    if (target) setAnnouncement(`${target.styleNumber} ${target.name} selected.`);
  }

  function resolveBlocker(blocker: Blocker) {
    if (!blocker.resolvableInDemo) return;
    setStyleRows((current) =>
      current.map((style) =>
        style.id !== blocker.styleId
          ? style
          : {
              ...style,
              blockers: style.blockers.filter((candidate) => candidate.id !== blocker.id),
              milestones: { ...style.milestones, [blocker.milestone]: "complete" },
              updatedAt: "now",
            },
      ),
    );
    setEvents((current) => [
      {
        id: `evt-resolved-${blocker.id}`,
        styleId: blocker.styleId,
        source: "Threadline",
        type: "BLOCKER_RESOLVED",
        state: "healthy",
        occurredAt: "now",
        correlationId: "cor_DEMO1",
        attempt: 1,
        detail: `${blocker.code} resolved in demo`,
      },
      ...current,
    ]);
    setSelectedId(blocker.styleId);
    setAnnouncement(`${blocker.code} resolved. Collection readiness recalculated.`);
  }

  function retryEvent(eventId: string) {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId ? { ...event, state: "processing", attempt: event.attempt + 1 } : event,
      ),
    );
    setAnnouncement("Centric PLM event retry queued with the original idempotency key.");
    retryTimer.current = setTimeout(() => {
      setEvents((current) =>
        current.map((event) =>
          event.id === eventId
            ? { ...event, state: "healthy", detail: "Retry accepted · version 19 applied" }
            : event,
        ),
      );
      setStyleRows((current) =>
        current.map((style) =>
          style.id !== "style-fold-messenger"
            ? style
            : {
                ...style,
                blockers: style.blockers.filter((blocker) => blocker.code !== "INT-503"),
                milestones: { ...style.milestones, plm: "complete" },
                sourceFreshness: { ...style.sourceFreshness, "Centric PLM": "now" },
              },
        ),
      );
      setAnnouncement("Centric PLM event recovered. Style record is current.");
      retryTimer.current = null;
    }, 900);
  }

  function resetDemo() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setStyleRows(cloneDemoStyles());
    setEvents(cloneDemoEvents());
    setSelectedId("style-transit-shell");
    setAnnouncement("Demo reset to its initial FW26 state.");
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Threadline navigation">
        <a className={styles.brand} href="#top" aria-label="Threadline home">
          <AppMark />
          <span>THREADLINE</span>
        </a>
        <nav aria-label="Workspace">
          {navigation.map(({ id, number, label }) => (
            <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
              <span>{number}</span>{label}
            </a>
          ))}
        </nav>
        <div className={styles.railMeta}>
          <span><i /> DEMO ONLINE</span>
          <p>PT<br />08:30–17:00</p>
        </div>
      </aside>

      <main id="top" className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.surfaceLabel}>INTERNAL DPC OPERATIONS PROTOTYPE</p>
            <p className={styles.eyebrow}>DPC / Launch control</p>
            <h1>FW26 / North America</h1>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.demoBadge}>SIMULATED DATA</span>
            <a className={styles.storefrontLink} href="/prototype/morrow">
              Customer storefront ↗
            </a>
            <button type="button" className={styles.resetButton} onClick={resetDemo}>
              Reset demo
            </button>
          </div>
        </header>

        <section className={styles.launchStrip} id="launch-control" aria-labelledby="launch-heading">
          <div className={styles.launchIntro}>
            <p className={styles.sectionIndex}>01 / Launch control</p>
            <div>
              <h2 id="launch-heading">48 days to line release</h2>
              <p>For product development, sourcing, compliance, and launch teams: one prioritized view across product, 3D, compliance, and commerce data.</p>
            </div>
          </div>
          <div className={styles.summaryGrid}>
            <SummaryCard label="Collection readiness" value={`${collectionReadiness}%`} note="6 launch styles" tone="blue" />
            <SummaryCard label="Ready" value={`${readyCount}`} note={`${styleRows.length - readyCount} need work`} tone="green" />
            <SummaryCard label="Blocked" value={`${blockedCount}`} note={blockers.length ? `${blockers.length} active exceptions` : "queue clear"} tone="orange" />
            <SummaryCard label="Integration pulse" value={failedCount ? "3 / 4" : "4 / 4"} note={failedCount ? "1 retry available" : "all sources healthy"} />
          </div>
        </section>

        <div className={styles.workspace}>
          <div className={styles.primary}>
            <section className={styles.panel} aria-labelledby="exception-heading">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.sectionIndex}>Priority / Exceptions</p>
                  <h2 id="exception-heading">Exception queue</h2>
                </div>
                <span className={styles.count}>{String(blockers.length).padStart(2, "0")}</span>
              </div>
              {blockers.length ? (
                <div className={styles.exceptionList}>
                  {blockers.map((blocker, index) => {
                    const style = styleRows.find((candidate) => candidate.id === blocker.styleId);
                    return (
                      <article className={styles.exception} data-severity={blocker.severity} key={blocker.id}>
                        <button type="button" className={styles.exceptionSelect} onClick={() => selectStyle(blocker.styleId)}>
                          <span className={styles.exceptionRank}>{String(index + 1).padStart(2, "0")}</span>
                          <span className={styles.exceptionCopy}>
                            <span className={styles.exceptionMeta}>{blocker.severity} · {blocker.code} · {style?.styleNumber}</span>
                            <strong>{blocker.title}</strong>
                            <span>{blocker.owner} · {blocker.ageHours}h open</span>
                          </span>
                          <span aria-hidden="true" className={styles.arrow}>↗</span>
                        </button>
                        {blocker.resolvableInDemo ? (
                          <button type="button" className={styles.resolveButton} onClick={() => resolveBlocker(blocker)}>
                            Simulate: {blocker.resolutionAction}
                          </button>
                        ) : (
                          <span className={styles.retryHint}>Retry in pulse ↓</span>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span>✓</span>
                  <div><strong>Exception queue clear</strong><p>All required milestones now pass launch rules.</p></div>
                </div>
              )}
            </section>

            <section className={styles.panel} id="collection" aria-labelledby="collection-heading">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.sectionIndex}>FW26 / Assortment</p>
                  <h2 id="collection-heading">Collection readiness</h2>
                </div>
                <span className={styles.microcopy}>sorted by risk</span>
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.styleTable}>
                  <thead>
                    <tr><th>Style</th><th>Ready</th><th>Status</th><th>Launch</th></tr>
                  </thead>
                  <tbody>
                    {[...styleRows]
                      .sort((a, b) => {
                        const aSeverity = a.blockers[0] ? severityRank[a.blockers[0].severity] : 2;
                        const bSeverity = b.blockers[0] ? severityRank[b.blockers[0].severity] : 2;
                        return aSeverity - bSeverity || readinessFor(a) - readinessFor(b);
                      })
                      .map((style) => (
                        <tr key={style.id} data-selected={style.id === selectedId}>
                          <td>
                            <button type="button" onClick={() => selectStyle(style.id)} aria-pressed={style.id === selectedId}>
                              <span>{style.styleNumber}</span>
                              <strong>{style.name}</strong>
                            </button>
                          </td>
                          <td>
                            <span className={styles.readinessCell}>
                              <i style={{ "--progress": `${readinessFor(style)}%` } as React.CSSProperties} />
                              {readinessFor(style)}%
                            </span>
                          </td>
                          <td><StatusPill style={style} /></td>
                          <td>{style.launchDate}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className={styles.inspector} aria-labelledby="inspector-heading">
            <div className={styles.inspectorTopline}>
              <p>Selected style</p>
              <span>updated {selected.updatedAt}</span>
            </div>
            <div className={styles.garmentStage}>
              <Garment variant={selected.variant} status={statusFor(selected)} name={selected.name} />
              <div className={styles.swatches} role="img" aria-label={`${selected.colorways} colorways`}>
                {selected.swatches.map((swatch, index) => (
                  <i key={swatch} style={{ background: swatch }} title={`Colorway ${index + 1}`} />
                ))}
              </div>
              <span className={styles.garmentCode}>{selected.styleNumber}</span>
            </div>
            <div className={styles.inspectorTitle}>
              <div>
                <p>{selected.category}</p>
                <h2 id="inspector-heading">{selected.name}</h2>
              </div>
              <strong>{readinessFor(selected)}<span>%</span></strong>
            </div>
            <dl className={styles.styleFacts}>
              <div><dt>Owner</dt><dd>{selected.owner}</dd></div>
              <div><dt>Target margin</dt><dd>{selected.targetMargin}%</dd></div>
              <div><dt>Launch</dt><dd>{selected.launchDate}</dd></div>
            </dl>
            <ol className={styles.milestones} aria-label="Style milestones">
              {milestoneOrder.map((milestone, index) => (
                <li key={milestone} data-state={selected.milestones[milestone]}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{milestoneLabels[milestone]}</strong>
                  <i role="img" aria-label={selected.milestones[milestone]} />
                </li>
              ))}
            </ol>
            {selected.blockers.length > 0 && (
              <div className={styles.blockerDetail}>
                <p>{selected.blockers[0].code} / {selected.blockers[0].source}</p>
                <strong>{selected.blockers[0].title}</strong>
                <span>{selected.blockers[0].detail}</span>
              </div>
            )}
            <div className={styles.freshness}>
              <p>Source freshness</p>
              {Object.entries(selected.sourceFreshness).map(([source, value]) => (
                <span key={source}><i />{source}<b>{value}</b></span>
              ))}
            </div>
          </aside>
        </div>

        <section className={styles.pulse} id="integration-pulse" aria-labelledby="pulse-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.sectionIndex}>02 / Data flow automation</p>
              <h2 id="pulse-heading">Integration pulse</h2>
            </div>
            <span className={styles.liveState}><i /> ingesting</span>
          </div>
          <div className={styles.eventHeader} aria-hidden="true">
            <span>Time / Source</span><span>Event</span><span>Correlation</span><span>State</span>
          </div>
          <ol className={styles.eventList}>
            {events.map((event) => (
              <li key={event.id}>
                <div><time>{event.occurredAt}</time><strong>{event.source}</strong></div>
                <div><strong>{event.type}</strong><span>{event.detail}</span></div>
                <code>{event.correlationId}<span> · try {event.attempt}</span></code>
                <div className={styles.eventAction}>
                  <span className={styles.eventState} data-state={event.state}><i />{event.state}</span>
                  {event.state === "failed" && (
                    <button type="button" onClick={() => retryEvent(event.id)}>Retry safely</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.systemMap} id="system-map" aria-labelledby="system-heading">
          <div className={styles.systemIntro}>
            <p className={styles.sectionIndex}>03 / Production reference</p>
            <h2 id="system-heading">System map</h2>
            <p>Inspectable architecture for the production version. This portfolio route uses deterministic fixtures; no enterprise connection is claimed.</p>
            <div className={styles.stackTags}>
              <span>React 19</span><span>Spring Boot 4.1</span><span>PostgreSQL</span><span>AKS</span><span>ArgoCD</span>
            </div>
          </div>
          <div className={styles.flowMap} role="img" aria-label="Production data flow">
            <div className={styles.sources}>
              <div><span>01</span><strong>Centric PLM</strong><small>style + BOM events</small></div>
              <div><span>02</span><strong>CLO 3D</strong><small>assets + manifests</small></div>
              <div><span>03</span><strong>Compliance</strong><small>certificates + rules</small></div>
            </div>
            <span className={styles.flowArrow} aria-hidden="true">→</span>
            <div className={styles.serviceNode}>
              <p>Java 21 / AKS</p>
              <strong>Spring Boot API</strong>
              <span>verify signature</span><span>deduplicate event</span><span>calculate readiness</span>
            </div>
            <span className={styles.flowArrow} aria-hidden="true">→</span>
            <div className={styles.destination}>
              <div><strong>PostgreSQL</strong><small>system state</small></div>
              <div><strong>Commerce API</strong><small>ready styles only</small></div>
            </div>
            <div className={styles.deliveryRail}>
              <span>GitHub Actions</span><i>→</i><span>Azure Container Registry</span><i>→</i><span>ArgoCD pull</span><i>→</i><span>AKS</span>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>THREADLINE / DPC PROTOTYPE / 2026</span>
          <a href="/">fullbuild.ai ↗</a>
        </footer>
        <p className={styles.srOnly} aria-live="polite">{announcement}</p>
      </main>
    </div>
  );
}
