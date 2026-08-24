"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import styles from "@/app/prototype/layline/layline.module.css";
import { analysisEvidenceTarget, analysisFocusWindow } from "@/lib/layline/analysis-state";
import type { RangeComparison } from "@/lib/layline/comparison";
import { clock, signedMeters } from "@/lib/layline/format";
import {
  clipTimelineInterval,
  deriveEvidenceTimeline,
  packTimelinePoints,
  placeTimelinePoint,
  recenterTimelineWindow,
  TIMELINE_POINT_ROW_LIMIT,
  type TimelineIntervalEvidence,
  type TimelinePointEvidence,
  type TimelineWindow,
} from "@/lib/layline/timeline";
import { FIX_HZ, type RaceData } from "@/lib/layline/types";
import { useReplay } from "../store";
import { onLive, sampleLive, setText } from "./live";

const TACK_GLYPH = "M1.5 6.9 L5 2.7 L8.5 6.9";
const GYBE_GLYPH = "M1.5 3.1 L5 7.3 L8.5 3.1";

/* Raw fixes either side of the playhead. 4 Hz across ten seconds stays
 * legible while the whole-race view is open and becomes the axis at 10 s. */
const RAW_WINDOW = 10;
const FIX_STEP = 1 / FIX_HZ;
const RAW_TICKS = Math.round(RAW_WINDOW / FIX_STEP) + 1;
const RANGE_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "Whole", seconds: null },
  { label: "30 s", seconds: 30 },
  { label: "10 s", seconds: 10 },
];

type TimelineStyle = CSSProperties & {
  "--point-position"?: string;
  "--point-row"?: number;
  "--point-rows"?: number;
  "--point-reserved-rows"?: number;
};

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`;
}

function intervalItems(items: readonly (TimelineIntervalEvidence | TimelinePointEvidence)[]) {
  return items.filter((item): item is TimelineIntervalEvidence => item.shape === "interval");
}

function pointItems(items: readonly (TimelineIntervalEvidence | TimelinePointEvidence)[]) {
  return items.filter((item): item is TimelinePointEvidence => item.shape === "point");
}

function timelineValueText(
  at: number,
  window: { from: number; to: number },
): string {
  const atText =
    at < 0
      ? `${Math.abs(at).toFixed(2)} seconds before the gun`
      : at === 0
        ? "At the gun"
        : `${at.toFixed(2)} seconds after the gun`;
  return `${atText}. Visible range ${clock(window.from)} to ${clock(window.to)}`;
}

function PackedPointRail<TItem extends TimelinePointEvidence>({
  ariaLabel,
  className,
  items,
  timelineWindow,
  renderPoint,
}: {
  ariaLabel: string;
  className: string;
  items: readonly TItem[];
  timelineWindow: TimelineWindow;
  renderPoint: (item: TItem, style: TimelineStyle) => ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ laneWidth: 0, clearance: 0 });
  const packed = useMemo(
    () => packTimelinePoints(items, timelineWindow, geometry.laneWidth, geometry.clearance),
    [geometry, items, timelineWindow],
  );

  /* Target width and focus clearance change only at responsive breakpoints.
   * Each lane measures its own real content box. Stable row ownership is already
   * resolved by the pure helper; measurement only updates horizontal clearance. */
  useEffect(() => {
    const rail = railRef.current;
    if (rail === null) return;

    const measure = () => {
      const clearance = Number.parseFloat(
        getComputedStyle(rail).getPropertyValue("--point-clearance"),
      );
      const next = {
        laneWidth: Number.isFinite(clearance) && clearance > 0 ? rail.clientWidth : 0,
        clearance: Number.isFinite(clearance) && clearance > 0 ? clearance : 0,
      };
      setGeometry((current) =>
        current.laneWidth === next.laneWidth && current.clearance === next.clearance
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`${styles.pointRail} ${className}`}
      ref={railRef}
      role="group"
      aria-label={ariaLabel}
      style={{
        "--point-rows": packed.rowCount,
        "--point-reserved-rows": TIMELINE_POINT_ROW_LIMIT,
      } satisfies TimelineStyle}
    >
      {packed.items.map(({ item, fraction, row }) =>
        renderPoint(item, {
          "--point-row": row,
          "--point-position": pct(fraction),
        }),
      )}
    </div>
  );
}

export function Timeline({ race, comparison }: { race: RaceData; comparison?: RangeComparison }) {
  const followId = useReplay((state) => state.followId);
  const raw = useReplay((state) => state.mode === "raw");
  const analysis = useReplay((state) => state.analysis);
  const focusSpan = analysis.focusSpanSeconds;

  const evidence = useMemo(() => deriveEvidenceTimeline(race, followId), [race, followId]);
  const phaseLane = evidence.lanes.find((lane) => lane.id === "phases");
  const eventLane = evidence.lanes.find((lane) => lane.id === "race-events");
  const maneuverLane = evidence.lanes.find((lane) => lane.id === "maneuvers");
  const phases = intervalItems(phaseLane?.items ?? []);
  const raceEvents = pointItems(eventLane?.items ?? []);
  const maneuvers = pointItems(maneuverLane?.items ?? []);
  const timelineWindow = useMemo(
    () => analysisFocusWindow(race, analysis),
    [race, analysis],
  );
  const selectedRangePlacement = useMemo(
    () => clipTimelineInterval(
      analysis.selectedRange.from,
      analysis.selectedRange.to,
      timelineWindow,
    ),
    [analysis.selectedRange, timelineWindow],
  );
  const hues = useMemo(
    () => new Map(race.boats.map((boat) => [boat.id, boat.hue])),
    [race],
  );
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const rawWindowRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<(HTMLDivElement | null)[]>([]);
  const dragging = useRef(false);
  const timelineHelpId = useId();

  /* React may render when the range or followed boat changes. Keep the latest
   * listener-owned clock here so that render cannot restore mount-time ARIA. */
  const seed = useRef(sampleLive(race).t);
  const liveTimeRef = useRef(seed.current);

  /* The shared replay clock is the only moving state. A focused view follows
   * only when playback leaves its bounds; scrubbing inside it never moves the
   * window underneath the pointer. */
  useEffect(() => {
    let stamp = "";
    return onLive(race, (live) => {
      liveTimeRef.current = live.t;
      const resolvedWindow = recenterTimelineWindow(race, timelineWindow, live.t, focusSpan);
      const liveWindow = resolvedWindow.window;
      if (resolvedWindow.recentered) {
        useReplay.getState().setAnalysis({ type: "recenter-focus", centerSeconds: live.t });
      }

      const head = headRef.current;
      if (head !== null) {
        head.style.left = pct(placeTimelinePoint(live.t, liveWindow).fraction);
      }

      const reading = clock(live.t);
      const track = trackRef.current;
      if (track !== null) {
        track.setAttribute("aria-valuemin", liveWindow.from.toFixed(2));
        track.setAttribute("aria-valuemax", liveWindow.to.toFixed(2));
        track.setAttribute("aria-valuenow", live.t.toFixed(2));
        track.setAttribute("aria-valuetext", timelineValueText(live.t, liveWindow));
      }
      if (reading !== stamp) {
        stamp = reading;
        setText(elapsedRef.current, reading);
      }

      if (live.mode !== "raw") return;
      const visibleRaw = clipTimelineInterval(
        live.t - RAW_WINDOW / 2,
        live.t + RAW_WINDOW / 2,
        liveWindow,
      );
      const frame = rawWindowRef.current;
      if (frame !== null) {
        frame.style.display = visibleRaw === null ? "none" : "block";
        if (visibleRaw !== null) {
          frame.style.left = pct(visibleRaw.left);
          frame.style.width = pct(visibleRaw.width);
        }
      }

      const first = Math.ceil((live.t - RAW_WINDOW / 2 - race.tMin) / FIX_STEP);
      for (let i = 0; i < RAW_TICKS; i++) {
        const node = ticksRef.current[i];
        if (node === null || node === undefined) continue;
        const at = race.tMin + (first + i) * FIX_STEP;
        const placed = placeTimelinePoint(at, liveWindow);
        if (at < race.tMin || at > race.tMax || at > live.t + RAW_WINDOW / 2 || !placed.visible) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "block";
        node.style.left = pct(placed.fraction);
      }
    });
  }, [focusSpan, race, raw, timelineWindow]);

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track === null || timelineWindow.span <= 0) return;
    const box = track.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    useReplay.getState().seek(timelineWindow.from + fraction * timelineWindow.span);
  };

  const seekEvidence = (at: number) => {
    const replay = useReplay.getState();
    replay.seek(at);
  };

  const seekSelectedRange = (edge: "in" | "out") => {
    const replay = useReplay.getState();
    const evidence = analysisEvidenceTarget(replay.analysis, edge);
    replay.seek(evidence.seekTo);
  };

  const phaseWeight = (id: string): string => {
    if (id === "phase-prestart") return styles.bandQuiet;
    if (id === "phase-beat") return styles.bandStrong;
    return styles.bandMid;
  };

  const rangeText =
    focusSpan === null
      ? `Whole race ${clock(race.tMin)} to ${clock(race.tMax)}`
      : `${clock(timelineWindow.from)} to ${clock(timelineWindow.to)}`;

  return (
    <div className={`${styles.timelineRow} ${comparison === undefined ? styles.timelineRowBasic : ""}`}>
      <div className={styles.timelineTools}>
        <span className={styles.timelineTitle}>Evidence timeline</span>
        <div className={styles.rangeGroup} role="group" aria-label="Timeline focus window">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={`${styles.rangeButton} ${focusSpan === option.seconds ? styles.rangeButtonOn : ""}`}
              aria-pressed={focusSpan === option.seconds}
              onClick={() => {
                useReplay.getState().setAnalysis({
                  type: "set-focus",
                  spanSeconds: option.seconds,
                  centerSeconds: useReplay.getState().t,
                });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className={styles.rangeReadout}>{rangeText}</span>
      </div>

      <span className={`${styles.evidenceLaneLabel} ${styles.phaseLaneLabel}`}>
        {phaseLane?.label ?? "Phases"}
      </span>
      <div
        className={styles.phaseRail}
        role="group"
        aria-label={phaseLane?.label ?? "Race phases"}
      >
        {phases.map((phase) => {
          const placed = clipTimelineInterval(phase.from, phase.to, timelineWindow);
          if (placed === null) return null;
          return (
            <button
              key={phase.id}
              type="button"
              className={`${styles.phaseBand} ${phaseWeight(phase.id)}`}
              style={{ left: pct(placed.left), width: pct(placed.width) }}
              title={`${phase.label} ${clock(phase.from)} to ${clock(phase.to)} · Source ${phase.provenance.source}`}
              aria-label={`Go to ${phase.label} start at ${clock(phase.from)}`}
              onClick={() => seekEvidence(phase.from)}
            >
              <span className={styles.bandLabel}>{phase.label}</span>
            </button>
          );
        })}
      </div>

      <span className={`${styles.evidenceLaneLabel} ${styles.eventLaneLabel}`}>
        {eventLane?.label ?? "Race events"}
      </span>
      <PackedPointRail
        className={styles.eventRail}
        ariaLabel="Race events"
        items={raceEvents}
        timelineWindow={timelineWindow}
        renderPoint={(item, pointStyle) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.pointMark} ${styles.eventMark}`}
            style={{
              ...pointStyle,
              color: item.boatId === undefined ? undefined : hues.get(item.boatId),
            }}
            data-event={item.eventKind}
            title={`${item.label} at ${clock(item.at)} · Source ${item.provenance.source}`}
            aria-label={`Go to ${item.label} at ${clock(item.at)}`}
            onClick={() => seekEvidence(item.at)}
          >
            <span>{item.shortLabel}</span>
          </button>
        )}
      />

      <span className={`${styles.evidenceLaneLabel} ${styles.maneuverLaneLabel}`}>
        {maneuverLane?.label ?? "Turns"}
      </span>
      <PackedPointRail
        className={styles.manRail}
        ariaLabel={maneuverLane?.label ?? "Tacks and gybes"}
        items={maneuvers}
        timelineWindow={timelineWindow}
        renderPoint={(maneuver, pointStyle) => (
          <button
            key={maneuver.id}
            type="button"
            className={`${styles.pointMark} ${styles.manMark}`}
            style={pointStyle}
            data-maneuver={maneuver.maneuverKind}
            data-at={maneuver.at}
            title={`${maneuver.label} at ${clock(maneuver.at)}, ${maneuver.detail} · Source ${maneuver.provenance.source}`}
            aria-label={`Go to the ${maneuver.label.toLowerCase()} at ${clock(maneuver.at)}`}
            onClick={() => seekEvidence(maneuver.at)}
          >
            <svg className={styles.manGlyph} viewBox="0 0 10 10" aria-hidden="true">
              <path d={maneuver.maneuverKind === "tack" ? TACK_GLYPH : GYBE_GLYPH} />
            </svg>
          </button>
        )}
      />

      {comparison === undefined ? null : (
        <>
          <span className={`${styles.evidenceLaneLabel} ${styles.comparisonLaneLabel}`}>
            Ground gain
          </span>
          <div className={styles.comparisonRail} role="group" aria-label="Selected ground-reference comparison range">
            {selectedRangePlacement === null ? null : (
          <button
            type="button"
            className={styles.comparisonRangeBand}
            style={{
              left: pct(selectedRangePlacement.left),
              width: pct(selectedRangePlacement.width),
            }}
            data-gain={
              comparison.progressGainedMeters === null
                ? "unavailable"
                : comparison.progressGainedMeters > 0
                  ? "gained"
                  : comparison.progressGainedMeters < 0
                    ? "lost"
                    : "even"
            }
            aria-label={`Seek selected comparison range start ${clock(analysis.selectedRange.from)}. Ground-reference progress ${comparison.progressGainedMeters === null ? "unavailable" : `${signedMeters(comparison.progressGainedMeters)} metres`}.`}
            onClick={() => seekSelectedRange("in")}
          >
            {comparison.progressGainedMeters === null
              ? "Unavailable"
              : `${signedMeters(comparison.progressGainedMeters)} m`}
          </button>
            )}
          </div>
        </>
      )}

      <span className={`${styles.evidenceLaneLabel} ${styles.replayLaneLabel}`}>Replay</span>
      <div
        className={styles.track}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Race time"
        aria-describedby={timelineHelpId}
        aria-valuemin={timelineWindow.from}
        aria-valuemax={timelineWindow.to}
        aria-valuenow={liveTimeRef.current}
        aria-valuetext={timelineValueText(liveTimeRef.current, timelineWindow)}
        onPointerDown={(event) => {
          dragging.current = true;
          useReplay.getState().pause();
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          seekFromPointer(event);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          const store = useReplay.getState();
          if (event.key === "ArrowRight" || event.key === "ArrowUp") store.step(1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") store.step(-1);
          else if (event.key === "Home") store.seek(timelineWindow.from);
          else if (event.key === "End") store.seek(timelineWindow.to);
          else return;
          event.preventDefault();
        }}
      >
        {comparison === undefined || selectedRangePlacement === null ? null : (
          <div
            className={styles.selectedRangeHighlight}
            style={{
              left: pct(selectedRangePlacement.left),
              width: pct(selectedRangePlacement.width),
            }}
            data-analysis-range={`${analysis.selectedRange.fromMicros}:${analysis.selectedRange.toMicros}`}
            aria-hidden="true"
          />
        )}
        {raw ? (
          <div className={styles.rawStrip} aria-hidden="true">
            <div className={styles.rawWindow} ref={rawWindowRef} />
            {Array.from({ length: RAW_TICKS }, (item, index) => (
              <div
                key={index}
                className={styles.rawTick}
                data-raw-tick=""
                ref={(node) => {
                  ticksRef.current[index] = node;
                }}
              />
            ))}
          </div>
        ) : null}

        <div
          className={styles.playhead}
          ref={headRef}
          data-live="playhead"
          style={{ left: pct(placeTimelinePoint(liveTimeRef.current, timelineWindow).fraction) }}
        >
          <span className={styles.playheadGrip} />
        </div>
      </div>

      <span id={timelineHelpId} className={styles.timelineHelp}>
        Arrow keys move one 0.25 second telemetry sample. Home and End move to the visible range
        limits.
      </span>
      <span className={styles.timeClockNow} ref={elapsedRef} data-live="elapsed">
        {clock(liveTimeRef.current)}
      </span>
      <span className={styles.timeClockTotal}>{clock(race.tMax)}</span>
    </div>
  );
}
