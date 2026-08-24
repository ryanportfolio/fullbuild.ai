"use client";

import styles from "@/app/prototype/layline/layline.module.css";
import { analysisEvidenceTarget } from "@/lib/layline/analysis-state";
import type { RangeComparison } from "@/lib/layline/comparison";
import { comparisonViewModel } from "@/lib/layline/comparison-view";
import { fixStamp } from "@/lib/layline/format";
import type { RaceData } from "@/lib/layline/types";
import { useReplay } from "../store";

export function ComparisonPanel({
  race,
  comparison,
}: {
  race: RaceData;
  comparison: RangeComparison;
}) {
  const analysis = useReplay((state) => state.analysis);
  const view = comparisonViewModel(race, comparison);
  const primary = race.boats.find((boat) => boat.id === comparison.primaryBoatId);
  const referenceValue =
    analysis.reference.kind === "boat" ? analysis.reference.boatId : "fleet-median";

  const seekRangeEdge = (edge: "in" | "out") => {
    const replay = useReplay.getState();
    const evidence = analysisEvidenceTarget(replay.analysis, edge);
    replay.seek(evidence.seekTo);
  };

  return (
    <section
      className={styles.comparisonPanel}
      aria-labelledby="range-comparison-heading"
      data-comparison-status={view.status}
    >
      <div className={styles.comparisonHeader}>
        <div>
          <h2 id="range-comparison-heading" className={styles.comparisonTitle}>
            Ground-reference comparison
          </h2>
          <p className={styles.comparisonPrimary}>
            Primary {primary?.sail ?? comparison.primaryBoatId}. Select another primary in
            standings or on the water.
          </p>
          <p className={styles.comparisonPrimary}>{view.referenceLabel}</p>
          <p className={styles.comparisonPrimary}>{view.referenceMembershipLabel}</p>
          <p className={styles.comparisonPrimary}>{view.signConvention}</p>
        </div>
        <label className={styles.referenceField}>
          <span>Rival / ground reference</span>
          <select
            value={referenceValue}
            onChange={(event) => {
              const value = event.currentTarget.value;
              useReplay.getState().setAnalysis({
                type: "set-reference",
                reference:
                  value === "fleet-median"
                    ? { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) }
                    : { kind: "boat", boatId: value },
              });
            }}
          >
            <option value="fleet-median">Fleet median, fixed full fleet</option>
            {race.boats
              .filter((boat) => boat.id !== comparison.primaryBoatId)
              .map((boat) => (
                <option key={boat.id} value={boat.id}>
                  {boat.sail}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className={styles.comparisonRangeRow}>
        <span className={styles.comparisonRangeLabel}>Exact replay range</span>
        <output className={styles.comparisonRangeValue}>
          {fixStamp(analysis.selectedRange.from)} to {fixStamp(analysis.selectedRange.to)}
        </output>
        <div className={styles.comparisonRangeActions} aria-label="Comparison range selection">
          <button
            type="button"
            className={styles.rangeButton}
            onClick={() =>
              useReplay.getState().setAnalysis({
                type: "set-range-in",
                at: useReplay.getState().t,
              })
            }
          >
            Set IN
          </button>
          <button
            type="button"
            className={styles.rangeButton}
            onClick={() =>
              useReplay.getState().setAnalysis({
                type: "set-range-out",
                at: useReplay.getState().t,
              })
            }
          >
            Set OUT
          </button>
          <button
            type="button"
            className={styles.rangeButton}
            onClick={() => useReplay.getState().setAnalysis({ type: "use-focus" })}
          >
            Use focus
          </button>
          <button
            type="button"
            className={styles.rangeButton}
            onClick={() => useReplay.getState().setAnalysis({ type: "reset-range" })}
          >
            Whole range
          </button>
        </div>
        <div className={styles.comparisonEvidenceActions} aria-label="Range-linked evidence">
          <button type="button" onClick={() => seekRangeEdge("in")}>
            Seek IN {fixStamp(analysis.selectedRange.from)}
          </button>
          <button type="button" onClick={() => seekRangeEdge("out")}>
            Seek OUT {fixStamp(analysis.selectedRange.to)}
          </button>
        </div>
      </div>

      <dl className={styles.comparisonMetrics}>
        {view.metrics.map((metric) => (
          <div key={metric.id} className={styles.comparisonMetric} data-metric={metric.id}>
            <dt>{metric.label}</dt>
            <dd>
              {metric.value} <span>{metric.unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.comparisonProof}>
        <p className={styles.comparisonWitness} role="status">
          {view.witness}
        </p>
        <p className={styles.comparisonEquation}>{view.equation}</p>
        <p className={styles.comparisonCost}>{view.maneuverCostWitness}</p>
        {view.maneuverObservations.length === 0 ? (
          <p className={styles.comparisonObservation}>No selected-boat maneuver observed in this exact range.</p>
        ) : (
          <details className={styles.comparisonObservations}>
            <summary>{view.maneuverObservations.length} telemetry-supported maneuver observations</summary>
            <ul>
              {view.maneuverObservations.map((observation) => (
                <li key={observation}>{observation}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
