"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import styles from "@/app/prototype/layline/layline.module.css";
import { MISSING, deg, fixStamp, heading, knots } from "@/lib/layline/format";
import { createPose, telemetryTruthAt } from "@/lib/layline/interpolate";
import type { LaylineInspectionSurface } from "@/lib/layline/surfaces";
import type { Pose, RaceData, TelemetryTruth } from "@/lib/layline/types";
import { useReplay } from "../store";
import { onLive, sampleLive, setText } from "./live";
import { VectorTriangle } from "./VectorTriangle";

function pose(): Pose {
  return createPose();
}

function truthBuffer(): TelemetryTruth {
  return {
    t: 0,
    beforeIndex: -1,
    afterIndex: -1,
    before: null,
    after: null,
    u: 0,
    raw: pose(),
    reconstructed: pose(),
  };
}

function sampleId(index: number): string {
  return index < 0 ? "NO FIX" : `FIX ${String(index + 1).padStart(4, "0")}`;
}

function meters(value: number): string {
  return value.toFixed(2);
}

function posePosition(value: Pose | null): string {
  return value === null ? "X / Y" : `${meters(value.x)} / ${meters(value.y)} m`;
}

function poseHeading(value: Pose | null): string {
  return value === null ? "NO SAMPLE" : heading(value.hdg);
}

function phaseLabel(truth: TelemetryTruth): string {
  if (truth.before === null || truth.after === null) return "NO SAMPLE";
  return truth.beforeIndex === truth.afterIndex
    ? "AT MEASURED FIX"
    : `${(truth.u * 100).toFixed(1)}% BETWEEN FIXES`;
}

function currentCaption(value: Pose | null): string {
  if (value === null) return "Current components unavailable";
  return value.telemetryProvenance === "recorded-fix"
    ? "Recorded current sample"
    : "Reconstructed current from recorded fixes";
}

function velocitySummary(value: Pose | null): string {
  if (value === null) return "WATER / CURRENT / GROUND UNAVAILABLE";
  const ctw = value.ctw === null ? MISSING : deg(value.ctw);
  const set = value.currentSet === null ? MISSING : deg(value.currentSet);
  const cog = value.cog === null ? MISSING : deg(value.cog);
  return [
    `WATER ${value.waterX.toFixed(3)} / ${value.waterY.toFixed(3)} m/s · STW ${knots(value.stw)} kn · CTW ${ctw}° toward`,
    `CURRENT ${value.currentX.toFixed(3)} / ${value.currentY.toFixed(3)} m/s · DRIFT ${knots(value.currentDrift)} kn · SET ${set}° toward`,
    `GROUND ${value.groundX.toFixed(3)} / ${value.groundY.toFixed(3)} m/s · SOG ${knots(value.sog)} kn · COG ${cog}° toward`,
  ].join(" | ");
}

export function TruthInspector({
  race,
  inspection,
}: {
  race: RaceData;
  inspection?: LaylineInspectionSurface | null;
}) {
  const followId = useReplay((state) => state.followId);
  const chart2d = useReplay((state) => state.chart2d);
  const sceneUp = useReplay((state) => state.webglOk);
  const rawMode = useReplay((state) => state.mode === "raw");
  const boat = race.boats.find((entry) => entry.id === followId) ?? race.boats[0];
  const buffer = useRef(truthBuffer());
  const initial = telemetryTruthAt(race, boat.id, sampleLive(race).t, buffer.current);
  const initialVelocityPose = rawMode ? initial.raw : initial.reconstructed;

  const replayTime = useRef<HTMLSpanElement>(null);
  const beforeId = useRef<HTMLSpanElement>(null);
  const beforeTime = useRef<HTMLSpanElement>(null);
  const beforePosition = useRef<HTMLSpanElement>(null);
  const afterId = useRef<HTMLSpanElement>(null);
  const afterTime = useRef<HTMLSpanElement>(null);
  const afterPosition = useRef<HTMLSpanElement>(null);
  const phase = useRef<HTMLSpanElement>(null);
  const rawPosition = useRef<HTMLSpanElement>(null);
  const rawHeading = useRef<HTMLSpanElement>(null);
  const reconstructedPosition = useRef<HTMLSpanElement>(null);
  const reconstructedHeading = useRef<HTMLSpanElement>(null);
  const velocityBlock = useRef<HTMLDivElement>(null);
  const velocityCaption = useRef<HTMLElement>(null);
  const velocityValues = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return onLive(race, (live) => {
      const truth = telemetryTruthAt(race, live.followId, live.t, buffer.current);
      setText(replayTime.current, fixStamp(truth.t));
      setText(beforeId.current, sampleId(truth.beforeIndex));
      setText(beforeTime.current, truth.before === null ? "NO SAMPLE" : fixStamp(truth.before.t));
      setText(
        beforePosition.current,
        truth.before === null ? "X / Y" : `${meters(truth.before.x)} / ${meters(truth.before.y)} m`,
      );
      setText(afterId.current, sampleId(truth.afterIndex));
      setText(afterTime.current, truth.after === null ? "NO SAMPLE" : fixStamp(truth.after.t));
      setText(
        afterPosition.current,
        truth.after === null ? "X / Y" : `${meters(truth.after.x)} / ${meters(truth.after.y)} m`,
      );
      setText(phase.current, phaseLabel(truth));
      setText(rawPosition.current, posePosition(truth.raw));
      setText(rawHeading.current, poseHeading(truth.raw));
      setText(reconstructedPosition.current, posePosition(truth.reconstructed));
      setText(reconstructedHeading.current, poseHeading(truth.reconstructed));
      /* One velocity block, following the active lens. The recorded and the
       * reconstructed readouts repeated the same three component lines, so the
       * pair collapsed into the pose the viewer is actually watching, with its
       * provenance stated on the block. */
      const velocityPose = live.mode === "raw" ? truth.raw : truth.reconstructed;
      setText(velocityCaption.current, currentCaption(velocityPose));
      setText(velocityValues.current, velocitySummary(velocityPose));
      velocityBlock.current?.setAttribute(
        "data-provenance",
        velocityPose?.telemetryProvenance === "recorded-fix" ? "measured" : "reconstructed",
      );
    });
  }, [race]);

  const view = sceneUp ? (chart2d ? "2D TRACK" : "3D SCENE") : "2D TRACK · RENDERER UNAVAILABLE";

  return (
    <section
      id="truth-inspector"
      className={clsx(styles.panel, styles.truthInspector)}
      aria-label="Telemetry truth inspector"
    >
      <h2 className={styles.dockLabel}>Telemetry truth</h2>

      <div className={styles.truthHeader}>
        <span
          className={clsx(styles.standingChip, boat.dark === true && styles.chipOutlined)}
          style={{ background: boat.hue }}
          aria-hidden="true"
        />
        <strong>{boat.sail}</strong>
        <span className={styles.truthView}>{view}</span>
      </div>

      <div className={styles.truthClock}>
        <span className={styles.truthSource}>SHARED REPLAY TIME</span>
        <span ref={replayTime}>{fixStamp(initial.t)}</span>
      </div>

      <div className={styles.truthFixes}>
        <div className={styles.truthFix} data-provenance="measured">
          <span className={styles.truthSource}>MEASURED · BEFORE / CURRENT</span>
          <strong ref={beforeId}>{sampleId(initial.beforeIndex)}</strong>
          <span ref={beforeTime}>{initial.before === null ? "NO SAMPLE" : fixStamp(initial.before.t)}</span>
          <span ref={beforePosition}>
            {initial.before === null ? "X / Y" : `${meters(initial.before.x)} / ${meters(initial.before.y)} m`}
          </span>
        </div>
        <div className={styles.truthFix} data-provenance="measured">
          <span className={styles.truthSource}>MEASURED · AFTER / CURRENT</span>
          <strong ref={afterId}>{sampleId(initial.afterIndex)}</strong>
          <span ref={afterTime}>{initial.after === null ? "NO SAMPLE" : fixStamp(initial.after.t)}</span>
          <span ref={afterPosition}>
            {initial.after === null ? "X / Y" : `${meters(initial.after.x)} / ${meters(initial.after.y)} m`}
          </span>
        </div>
      </div>

      <div className={styles.truthPhase} data-provenance="derived">
        <span className={styles.truthSource}>DERIVED · CLOCK POSITION</span>
        <strong ref={phase}>{phaseLabel(initial)}</strong>
      </div>

      <div className={styles.truthCompare} role="table" aria-label="Raw and reconstructed selected boat state">
        <div className={styles.truthCompareHead} role="row">
          <span role="columnheader">STATE / SOURCE</span>
          <span role="columnheader">X / Y</span>
          <span role="columnheader">HDG</span>
        </div>
        <div className={styles.truthCompareRow} role="row" data-provenance="measured">
          <span role="cell">RAW HOLD · MEASURED</span>
          <span role="cell" ref={rawPosition}>{posePosition(initial.raw)}</span>
          <span role="cell" ref={rawHeading}>{poseHeading(initial.raw)}</span>
        </div>
        <div className={styles.truthCompareRow} role="row" data-provenance="reconstructed">
          <span role="cell">SMOOTH · RECONSTRUCTED</span>
          <span role="cell" ref={reconstructedPosition}>{posePosition(initial.reconstructed)}</span>
          <span role="cell" ref={reconstructedHeading}>{poseHeading(initial.reconstructed)}</span>
        </div>
      </div>

      <div className={styles.truthVectors} aria-label="Velocity components with provenance">
        <div
          ref={velocityBlock}
          data-provenance={
            initialVelocityPose?.telemetryProvenance === "recorded-fix"
              ? "measured"
              : "reconstructed"
          }
        >
          <strong ref={velocityCaption}>{currentCaption(initialVelocityPose)}</strong>
          <span ref={velocityValues}>{velocitySummary(initialVelocityPose)}</span>
        </div>
      </div>

      <VectorTriangle race={race} inspection={inspection} />
    </section>
  );
}
