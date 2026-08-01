'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import styles from '@/app/prototype/deadlow/deadlow.module.css';
import {
  DATUM_Y,
  STATIONS,
  SURGE_M,
  VIEW_H,
  VIEW_W,
  formatMetres,
  isFlooding,
  observedMetres,
  predictedMetres,
  yForMetres,
} from './tide';

/** SSR and the client must serialise the same string, so the drawing carries
 * three decimals of a pixel: well inside the one-pixel tolerance the metre
 * check allows, and byte-identical on both sides of hydration. */
const px = (n: number) => `${n.toFixed(3)}px`;

export type SceneHandle = {
  /** Draw the sea for a page-clock value in minutes past midnight. */
  paint: (minutes: number) => void;
};

/** Gauge levels, in metres above chart datum. 2 m of tide is 48px of drawing. */
const GAUGE = [8, 6, 4, 2, 0];

/**
 * The land, closed below the frame. The strokes on the sides and the underside
 * fall outside the viewBox so the only hairline you see is the bed itself.
 */
const LAND_PATH = [
  `M-1 ${yForMetres(STATIONS[0].bed)}`,
  ...STATIONS.map((s) => `L${s.x} ${yForMetres(s.bed)}`),
  `L${VIEW_W + 1} ${yForMetres(STATIONS[STATIONS.length - 1].bed)}`,
  `L${VIEW_W + 1} ${VIEW_H + 1}`,
  `L-1 ${VIEW_H + 1}`,
  'Z',
].join(' ');

/**
 * The hero. Not a photograph: a cross-section of the walk, drawn in hairlines,
 * with the sea where the sea is. The filled band is the water as it stands, the
 * dashed line is what the almanac predicted, and the gap between them is the
 * southwest wind. Closing that gap is the thing the guides are paid for.
 */
export const CrossSection = forwardRef<SceneHandle, { minutes: number }>(
  function CrossSection({ minutes }, ref) {
    const waterRef = useRef<SVGGElement>(null);
    const surfaceRef = useRef<SVGLineElement>(null);
    const ghostRef = useRef<SVGLineElement>(null);
    const tagRef = useRef<HTMLDivElement>(null);
    const seaLineRef = useRef<HTMLSpanElement>(null);
    const almanacLineRef = useRef<HTMLSpanElement>(null);
    // Every timed write is change-detected against the last string (2.4): a node
    // is touched only when its string actually changes.
    const lastWrite = useRef<Record<string, string>>({});

    useImperativeHandle(ref, () => ({
      paint(now: number) {
        const observed = observedMetres(now);
        const predicted = predictedMetres(now);
        const observedY = yForMetres(observed);
        const predictedY = yForMetres(predicted);
        const last = lastWrite.current;
        const write = (key: string, value: string, apply: (v: string) => void) => {
          if (last[key] === value) return;
          last[key] = value;
          apply(value);
        };
        if (waterRef.current) {
          const node = waterRef.current;
          write('waterT', `translateY(${px(observedY)})`, (v) => {
            node.style.transform = v;
          });
          write('waterM', formatMetres(observed), (v) => {
            node.dataset.levelM = v;
          });
        }
        if (surfaceRef.current) {
          const node = surfaceRef.current;
          write('surfaceT', `translateY(${px(observedY)})`, (v) => {
            node.style.transform = v;
          });
        }
        if (ghostRef.current) {
          const node = ghostRef.current;
          write('ghostT', `translateY(${px(predictedY)})`, (v) => {
            node.style.transform = v;
          });
          write('ghostM', formatMetres(predicted), (v) => {
            node.dataset.levelM = v;
          });
        }
        if (tagRef.current) {
          const node = tagRef.current;
          write('tagT', `translate(-50%, ${px(observedY - 36)})`, (v) => {
            node.style.transform = v;
          });
        }
        if (seaLineRef.current) {
          const node = seaLineRef.current;
          write(
            'seaText',
            `Sea ${formatMetres(observed)} m, ${isFlooding(now) ? 'flooding' : 'ebbing'}`,
            (v) => {
              node.textContent = v;
            },
          );
        }
        if (almanacLineRef.current) {
          const node = almanacLineRef.current;
          write(
            'almanacText',
            `Almanac ${formatMetres(predicted)} m, +${formatMetres(SURGE_M)} m`,
            (v) => {
              node.textContent = v;
            },
          );
        }
      },
    }));

    const observed = observedMetres(minutes);
    const predicted = predictedMetres(minutes);
    const observedY = yForMetres(observed);
    const predictedY = yForMetres(predicted);

    return (
      <div className={styles.figureRow} data-metric>
        <div className={styles.gauge} aria-hidden="true">
          {GAUGE.map((m) => (
            <span
              key={m}
              className={`${styles.l2} ${styles.gaugeLabel}`}
              style={{ top: `${yForMetres(m) + 1}px` }}
            >
              {m} m
            </span>
          ))}
        </div>

        <div className={styles.figureCol}>
          <figure className={styles.figure}>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Cross-section of the four mile crossing from the Cross Farm ramp to the Sker Holm shore, with the sea as it stands now and the level the almanac predicts for the same minute"
            >
              {/* The sea, drawn first so the ground can rise out of it. */}
              <g ref={waterRef} data-observed data-level-m={formatMetres(observed)} style={{ transform: `translateY(${px(observedY)})` }}>
                <rect
                  x={-1}
                  y={0}
                  width={VIEW_W + 2}
                  height={VIEW_H}
                  fill="#0B2E33"
                  stroke="#0E1214"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>

              {/* The ground, over the water, so the flat dries as the tide drops. */}
              <path
                d={LAND_PATH}
                fill="#9FAF8C"
                stroke="#0E1214"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />

              {/* Station marks, keyed to the numbered route below. */}
              {STATIONS.map((s) => (
                <line
                  key={s.x}
                  x1={s.x}
                  y1={0}
                  x2={s.x}
                  y2={8}
                  stroke="#0E1214"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Chart datum, the line every height on this page is measured from. */}
              <line
                x1={-1}
                y1={DATUM_Y}
                x2={VIEW_W + 1}
                y2={DATUM_Y}
                stroke="#0E1214"
                strokeWidth={1}
                strokeDasharray="1 5"
                vectorEffect="non-scaling-stroke"
              />

              {/* The almanac. */}
              <line
                ref={ghostRef}
                data-predicted
                data-level-m={formatMetres(predicted)}
                x1={-1}
                y1={0}
                x2={VIEW_W + 1}
                y2={0}
                stroke="#0E1214"
                strokeWidth={1}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                style={{ transform: `translateY(${px(predictedY)})` }}
              />

              {/* The sea's real surface, carried across the dry ground so the
                  gap between prediction and water can be read anywhere. */}
              <line
                ref={surfaceRef}
                x1={-1}
                y1={0}
                x2={VIEW_W + 1}
                y2={0}
                stroke="#0E1214"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ transform: `translateY(${px(observedY)})` }}
              />
            </svg>

            <div className={styles.stipple} aria-hidden="true" />

            <div className={styles.annotations}>
              <div
                ref={tagRef}
                className={styles.seaTag}
                style={{ transform: `translate(-50%, ${px(observedY - 36)})` }}
              >
                <span ref={seaLineRef} className={`${styles.l2} ${styles.seaTagLine}`}>
                  Sea {formatMetres(observed)} m, {isFlooding(minutes) ? 'flooding' : 'ebbing'}
                </span>
                <span ref={almanacLineRef} className={`${styles.l2} ${styles.seaTagLine}`}>
                  Almanac {formatMetres(predicted)} m, +{formatMetres(SURGE_M)} m
                </span>
              </div>
            </div>
          </figure>

          <div className={styles.axis} aria-hidden="true">
            {STATIONS.map((s, i) => (
              <span
                key={s.x}
                className={`${styles.l2} ${styles.axisMark}`}
                style={
                  i === 0
                    ? { left: 0 }
                    : i === STATIONS.length - 1
                      ? { right: 0 }
                      : { left: `${(s.x / VIEW_W) * 100}%`, transform: 'translateX(-50%)' }
                }
              >
                {i + 1}
              </span>
            ))}
          </div>

          <div className={styles.stationStrip}>
            <span className={styles.l2}>Cross Farm ramp</span>
            <span className={styles.l2}>Sker Holm</span>
          </div>
        </div>
      </div>
    );
  },
);
