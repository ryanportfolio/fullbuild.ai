import styles from "@/app/prototype/tawkify/tawkify.module.css";
import {
  pipelineStages,
  plates,
  type ApprovalRecord,
  type ConstraintCheck,
} from "@/lib/tawkify/data";

// Shared component inventory: these ship byte-identical across the marketing,
// client, and desk routes. ConstraintRows and ApprovalStamp are load-bearing:
// the matchmaker writes on /desk what the client reads on /match.

export function Plate({ id, style }: { id: keyof typeof plates; style?: React.CSSProperties }) {
  const spec = plates[id];
  return (
    <figure
      className={styles.plate}
      data-tone={spec.tone}
      style={{ aspectRatio: spec.ratio, ...style }}
      role="img"
      aria-label={spec.slug}
    >
      <figcaption className={styles.plateSlug}>{spec.slug}</figcaption>
    </figure>
  );
}

// A claim cannot render without its methodology footnote: honesty enforced by
// the component API, not by a layout convention.
export function ProofNumber({ value, label, footnote }: { value: string; label: string; footnote: string }) {
  return (
    <div className={styles.proof} data-reveal="settle">
      <span className={styles.proofValue}>{value}</span>
      <span className={styles.proofLabel}>{label}</span>
      <span className={styles.proofFootnote}>{footnote}</span>
    </div>
  );
}

export function ConstraintRows({ rows }: { rows: ConstraintCheck[] }) {
  return (
    <div className={styles.constraintList}>
      {rows.map((row) => (
        <div key={row.label} className={styles.constraintRow} data-verdict={row.verdict} data-constraint-id={row.label}>
          <span className={styles.constraintLabel}>{row.label}</span>
          <span className={styles.constraintCell}>SET {row.required}</span>
          <span className={styles.constraintCell}>ACTUAL {row.actual}</span>
          <span className={styles.constraintVerdict}>
            {row.verdict === "pass" ? "PASS" : row.verdict === "override" ? "OVERRIDE" : "FAIL"}
          </span>
          {row.overrideReason ? (
            <p className={styles.overrideReason}>{row.overrideReason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ApprovalStamp({ record }: { record: ApprovalRecord }) {
  return (
    <div className={styles.approvalStamp}>
      <span className={styles.stampPortrait} aria-hidden="true" />
      <span className={styles.stampText}>
        {record.assist ? "ASSIST DRAFT · " : ""}EDITED AND APPROVED BY{" "}
        {record.approver.toUpperCase()} · {record.role.toUpperCase()} ·{" "}
        {record.timestamp.toUpperCase()}
      </span>
    </div>
  );
}

export function StageTimeline({ current, note }: { current: number; note?: string }) {
  return (
    <div className={styles.timeline}>
      <div className={styles.timelineTrack} aria-hidden="true">
        {pipelineStages.map((stage, index) => (
          <span key={stage} className={styles.timelineSeg} data-done={index <= current || undefined} />
        ))}
      </div>
      <div className={styles.timelineLabels}>
        {pipelineStages.map((stage, index) => (
          <span key={stage} className={styles.timelineLabel} data-current={index === current || undefined}>
            {stage}
          </span>
        ))}
      </div>
      {note ? <span className={styles.factSmall}>{note}</span> : null}
    </div>
  );
}
