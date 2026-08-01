'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import styles from '@/app/prototype/deadlow/deadlow.module.css';
import {
  DATUM_Y,
  FRAME_TOP_M,
  STATIONS,
  SURGE_M,
  VIEW_H,
  VIEW_W,
  formatMetres,
  isFlooding,
  observedMetres,
  pctForMetres,
  predictedMetres,
  routeX,
  stationAt,
  stationIndexAt,
  yForMetres,
} from './tide';

/** SSR and the client must serialise the same string, so the drawing carries
 * three decimals of a unit: well inside the one-pixel tolerance the metre
 * check allows, and byte-identical on both sides of hydration. */
const u = (n: number) => n.toFixed(3);

export type SceneHandle = {
  /**
   * Draw the sea for a page-clock value in minutes past midnight, and the
   * reader's position on the route for a scroll fraction from the ramp (0) to
   * the Sker Holm shore (1).
   */
  paint: (now: number, progress: number) => void;
};

/** Gauge levels, in metres above chart datum, inside the 3.25 m frame. */
const GAUGE = [3, 2, 1, 0];

/**
 * Amendment A39. The surge, hatched. The gap between the almanac and the sea
 * is the whole business of the page and it was drawn as the absence between
 * two hairlines, so it read as chart furniture. These are ink hairlines every
 * 40 units across the frame, spanning exactly the 30 units the 0.30 m surge
 * occupies, which turns the absence into a marked band without inventing an
 * eighth colour or exaggerating the geometry.
 */
const HATCH = Array.from({ length: 18 }, (_, i) => i * 40 - 2);

/**
 * The land, closed below the frame. The strokes on the sides and the underside
 * fall outside the viewBox so the only hairline you see is the bed itself.
 */
const LAND_PATH = [
  `M-2 ${yForMetres(STATIONS[0].bed)}`,
  ...STATIONS.map((s) => `L${s.x} ${yForMetres(s.bed)}`),
  `L${VIEW_W + 2} ${yForMetres(STATIONS[STATIONS.length - 1].bed)}`,
  `L${VIEW_W + 2} ${VIEW_H + 2}`,
  `L-2 ${VIEW_H + 2}`,
  'Z',
].join(' ');

/**
 * The page's ground. Not a photograph and not a figure on a page: a metric
 * cross-section of the walk, drawn in hairlines, that the rest of the screen
 * stands on. The filled band is the water as it stands, the dashed line is
 * what the almanac predicted, and the hatched band between them is the
 * southwest wind, named and measured where it sits. Closing that gap is the
 * thing the guides are paid for.
 */
export const CrossSection = forwardRef<SceneHandle, { minutes: number; progress: number }>(
  function CrossSection({ minutes, progress }, ref) {
    const waterRef = useRef<SVGGElement>(null);
    const surfaceRef = useRef<SVGGElement>(null);
    const ghostRef = useRef<SVGLineElement>(null);
    const seaRailRef = useRef<HTMLDivElement>(null);
    const ghostRailRef = useRef<HTMLDivElement>(null);
    const seaLineRef = useRef<HTMLSpanElement>(null);
    const almanacLineRef = useRef<HTMLSpanElement>(null);
    const gapAlmanacRef = useRef<HTMLSpanElement>(null);
    const walkerRef = useRef<SVGGElement>(null);
    const routeNumRef = useRef<HTMLSpanElement>(null);
    const routeNameRef = useRef<HTMLSpanElement>(null);
    const routeMetaRef = useRef<HTMLSpanElement>(null);
    const routeBedRef = useRef<HTMLSpanElement>(null);
    // Every timed write is change-detected against the last string (2.4): a node
    // is touched only when its string actually changes.
    const lastWrite = useRef<Record<string, string>>({});

    useImperativeHandle(ref, () => ({
      paint(now: number, walked: number) {
        const observed = observedMetres(now);
        const predicted = predictedMetres(now);
        const observedY = yForMetres(observed);
        const predictedY = yForMetres(predicted);
        const station = stationAt(walked);
        const last = lastWrite.current;
        const write = (key: string, value: string, apply: (v: string) => void) => {
          if (last[key] === value) return;
          last[key] = value;
          apply(value);
        };
        if (waterRef.current) {
          const node = waterRef.current;
          write('waterT', `translateY(${u(observedY)}px)`, (v) => {
            node.style.transform = v;
          });
          write('waterM', formatMetres(observed), (v) => {
            node.dataset.levelM = v;
          });
        }
        if (surfaceRef.current) {
          const node = surfaceRef.current;
          write('surfaceT', `translateY(${u(observedY)}px)`, (v) => {
            node.style.transform = v;
          });
        }
        if (ghostRef.current) {
          const node = ghostRef.current;
          write('ghostT', `translateY(${u(predictedY)}px)`, (v) => {
            node.style.transform = v;
          });
          write('ghostM', formatMetres(predicted), (v) => {
            node.dataset.levelM = v;
          });
        }
        // A58. Two regimes the labels have to survive, both reachable from the
        // clock control's own 10:30 to 16:30 range. Off frame: either level is
        // over the 3.25 m the drawing holds, so its horizon is not in the
        // picture and naming it would print a number on a line the reader
        // cannot see; the chips and the dimension go. Near the top: the sea is
        // inside the frame but within a chip's height of its ceiling, so the
        // sea's chip stops hanging above its line and sits below it instead,
        // which keeps it inside the drawing and out of the station ruler.
        const offFrame = observed >= FRAME_TOP_M || predicted >= FRAME_TOP_M;
        const nearTop = pctForMetres(observed) < 15;
        if (seaRailRef.current) {
          const node = seaRailRef.current;
          write('seaOff', offFrame ? '1' : '0', (v) => {
            node.dataset.offFrame = v;
          });
          write('seaNear', nearTop ? '1' : '0', (v) => {
            node.dataset.nearTop = v;
          });
        }
        if (ghostRailRef.current) {
          const node = ghostRailRef.current;
          write('ghostOff', offFrame ? '1' : '0', (v) => {
            node.dataset.offFrame = v;
          });
        }
        // A38: the horizon rails. Each is the full height of the frame and is
        // carried down by the percentage its own level plots at, so the named
        // chip and the dimension callout land exactly on their horizons at
        // every clock value and at every viewport.
        if (seaRailRef.current) {
          const node = seaRailRef.current;
          write('seaRailT', `translateY(${u(pctForMetres(observed))}%)`, (v) => {
            node.style.transform = v;
          });
        }
        if (ghostRailRef.current) {
          const node = ghostRailRef.current;
          write('ghostRailT', `translateY(${u(pctForMetres(predicted))}%)`, (v) => {
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
          write('almanacText', `Almanac ${formatMetres(predicted)} m`, (v) => {
            node.textContent = v;
          });
        }
        if (gapAlmanacRef.current) {
          const node = gapAlmanacRef.current;
          write('gapAlmanacText', `${formatMetres(predicted)} m`, (v) => {
            node.textContent = v;
          });
        }
        // P2: the reader's own position, carried horizontally along the route.
        if (walkerRef.current) {
          const node = walkerRef.current;
          write('walkerT', `translateX(${u(routeX(walked))}px)`, (v) => {
            node.style.transform = v;
          });
        }
        if (routeNumRef.current) {
          const node = routeNumRef.current;
          write('routeNum', String(stationIndexAt(walked) + 1), (v) => {
            node.textContent = v;
          });
        }
        if (routeNameRef.current) {
          const node = routeNameRef.current;
          write('routeName', station.name, (v) => {
            node.textContent = v;
          });
        }
        if (routeMetaRef.current) {
          const node = routeMetaRef.current;
          write('routeMeta', `${station.distance}, ${station.note}`, (v) => {
            node.textContent = v;
          });
        }
        if (routeBedRef.current) {
          const node = routeBedRef.current;
          write('routeBed', `${formatMetres(station.bed)} m`, (v) => {
            node.textContent = v;
          });
        }
      },
    }));

    const observed = observedMetres(minutes);
    const predicted = predictedMetres(minutes);
    const observedY = yForMetres(observed);
    const predictedY = yForMetres(predicted);
    const here = stationAt(progress);

    return (
      <div className={styles.field} data-metric>
        <figure className={styles.figure}>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Cross-section of the four mile crossing from the Cross Farm ramp to the Sker Holm shore, the sea as it stands now, and the level the almanac gives for the same minute"
          >
            {/* The sea, drawn first so the ground can rise out of it. */}
            <g
              ref={waterRef}
              data-observed
              data-level-m={formatMetres(observed)}
              style={{ transform: `translateY(${u(observedY)}px)` }}
            >
              <rect
                x={-2}
                y={0}
                width={VIEW_W + 4}
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
                y2={12}
                stroke="#0E1214"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Chart datum, the line every height on this page is measured from. */}
            <line
              x1={-2}
              y1={DATUM_Y}
              x2={VIEW_W + 2}
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
              x1={-2}
              y1={0}
              x2={VIEW_W + 2}
              y2={0}
              stroke="#0E1214"
              strokeWidth={1}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              style={{ transform: `translateY(${u(predictedY)}px)` }}
            />

            {/* The sea's real surface, and under it the hatched 0.30 m the wind
                is holding over the almanac. A39: the gap is drawn as a band so
                it reads as a measured quantity rather than as the space
                between two rules. */}
            <g
              ref={surfaceRef}
              data-surge
              style={{ transform: `translateY(${u(observedY)}px)` }}
            >
              <line
                x1={-2}
                y1={0}
                x2={VIEW_W + 2}
                y2={0}
                stroke="#0E1214"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {HATCH.map((x) => (
                <line
                  key={x}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={SURGE_M * 100}
                  stroke="#0E1214"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {/* P2: where the reader is on the four miles. */}
            <g
              ref={walkerRef}
              data-walker
              style={{ transform: `translateX(${u(routeX(progress))}px)` }}
            >
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={VIEW_H}
                stroke="#0E1214"
                strokeWidth={1}
                strokeDasharray="12 8"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>

          <div className={styles.stipple} aria-hidden="true" />
        </figure>

        {/* A38 and A39. The sea's rail carries the level's own name and the
            dimension hanging under it, so the reader can read the gap in metres
            at the place the gap is drawn. */}
        <div
          ref={seaRailRef}
          className={styles.rail}
          style={{ transform: `translateY(${u(pctForMetres(observed))}%)` }}
        >
          <span
            ref={seaLineRef}
            className={`${styles.l2} ${styles.horizon} ${styles.horizonSea}`}
          >
            Sea {formatMetres(observed)} m, {isFlooding(minutes) ? 'flooding' : 'ebbing'}
          </span>
          {/* A55. The measurement, at the size the argument deserves. The
              bracket is exactly 0.30 m of the frame, so it IS the quantity;
              the value beside it states that quantity at display scale, which
              is what both reviews said was missing when the whole product
              argument was 37 unlabelled pixels and a 13px caption. */}
          <div className={styles.gap} data-gap>
            <span className={styles.gapLabel}>
              <span className={`${styles.b2mono} ${styles.gapValue}`}>
                {formatMetres(SURGE_M)} m
              </span>
              {/* A57. Below 641 the almanac's own chip is hidden and its level
                  is stated here instead, so the phone carries one object at the
                  gap rather than three level-tracking labels in a 100px lane. */}
              <span className={`${styles.l1} ${styles.gapUnit}`}>
                over the almanac
                <span ref={gapAlmanacRef} className={styles.gapAlmanac}>
                  {formatMetres(predicted)} m
                </span>
              </span>
            </span>
          </div>
        </div>

        <div
          ref={ghostRailRef}
          className={styles.rail}
          style={{ transform: `translateY(${u(pctForMetres(predicted))}%)` }}
        >
          <span
            ref={almanacLineRef}
            className={`${styles.l2} ${styles.horizon} ${styles.horizonAlmanac}`}
          >
            Almanac {formatMetres(predicted)} m
          </span>
        </div>

        <div className={styles.gauge} aria-hidden="true">
          {GAUGE.map((m) => (
            <span
              key={m}
              className={`${styles.l2} ${styles.gaugeLabel}`}
              style={{ top: `${pctForMetres(m)}%` }}
            >
              {m} m
            </span>
          ))}
          <span className={`${styles.l2} ${styles.gaugeCaption}`}>Metres above chart datum</span>
        </div>

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
          <span className={`${styles.l2} ${styles.axisCaption}`}>
            Stations by name, distance not to scale
          </span>
        </div>

        {/* The section's readout strip: where the reader is on the four miles
            (P2, arriving as they reach it). It sits on --paper at 14.67:1 and
            it is numbered, so it reads as row one of the same list the legs
            below carry on with rather than as a separate instrument. */}
        <div className={styles.routeRead} data-route-read>
          <span className={`${styles.l1} ${styles.routeLabel}`}>On the route</span>
          <span ref={routeNumRef} className={`${styles.b3mono} ${styles.routeNum}`}>
            1
          </span>
          <span ref={routeNameRef} className={`${styles.b3mono} ${styles.routeName}`}>
            {here.name}
          </span>
          <span ref={routeMetaRef} className={`${styles.l2} ${styles.routeMeta}`}>
            {here.distance}, {here.note}
          </span>
          <span ref={routeBedRef} className={`${styles.b3mono} ${styles.routeBed}`}>
            {formatMetres(here.bed)} m
          </span>
        </div>
      </div>
    );
  },
);
