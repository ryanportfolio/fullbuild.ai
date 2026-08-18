/* ============================================================================
   Drafting marks — the shared vocabulary every sheet is lettered in, so the
   whole set reads as one drafter's hand. Pure SVG, server-renderable.

   Drawable strokes carry className "ws-draw" and pathLength={1}; the motion
   controller reveals them in order via stroke-dashoffset. WITHOUT JS they are
   fully drawn (offset 0) — motion is enhancement, never a prerequisite to see
   the drawing.
   ========================================================================= */

import type { CSSProperties } from 'react';

type Ink = 'graphite' | 'cyanotype' | 'concrete' | 'live' | 'ground';

/**
 * Resolve an ink to its CSS var. When `ink` is omitted, marks inherit
 * `currentColor` from their container — this is how the cyanotype-negative sheet
 * flips every line to pale ink without touching the markup.
 */
export function inkVar(ink?: Ink): string {
  switch (ink) {
    case 'graphite':
      return 'var(--ink-graphite)';
    case 'cyanotype':
      return 'var(--ink-cyanotype)';
    case 'concrete':
      return 'var(--ink-concrete)';
    case 'live':
      return 'var(--accent-live)';
    case 'ground':
      return 'var(--ground)';
    default:
      return 'currentColor';
  }
}

/*
 * NO vector-effect by default, deliberately.
 *
 * `non-scaling-stroke` is the natural choice for a drawing that scales, and it
 * is wrong on anything revealed by a `pathLength=1` dash: the UA measures the
 * dash pattern in the svg's own host coordinate space, so at render scale S a
 * "full length" dash paints only 1/S of the path, and above S≈1.5 the pattern
 * is short enough to REPEAT inside the path. The cover Elevation renders 707px
 * against its 380-unit viewBox at a 1920 viewport (S = 1.86): its ground line
 * held at dashoffset 0.5 painted 96 units, a gap, then 72 units of a 360-unit
 * path, against the 180 it owed. DrawingSet strips the dash attributes when a
 * stroke completes, so the settled drawing was always right and the damage was
 * confined to the reveal, which ran short and then snapped to full length.
 *
 * Without it, dashes are user units and pathLength=1 is exact at any size. The
 * cost is that stroke WIDTHS now scale with the drawing, which for a drawing
 * that scales as a whole is the honest behaviour. Keep authored widths at or
 * above ~0.5 user units so a hairline cannot drop below half a device pixel at
 * the narrow end of the range.
 *
 * The one place that looks like it needs the opt-out does not: T-01's form
 * rules stretch a `0 0 100 2` viewBox with preserveAspectRatio="none", but
 * their CSS box is `height: 2px` against a 2-unit viewBox, so their Y scale is
 * exactly 1 and a horizontal rule's width is untouched either way. They were
 * the worst-hit strokes on the site (stretched to S = 6.76 at a 1920 viewport,
 * so 15% of each rule painted) and they are fixed by the same removal.
 */
const drawProps = (order: number) => ({
  className: 'ws-draw',
  pathLength: 1,
  'data-o': order,
});

/** A single drawable line. */
export function Line({
  x1,
  y1,
  x2,
  y2,
  ink,
  w = 1.2,
  o = 0,
  dash,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ink?: Ink;
  w?: number;
  o?: number;
  dash?: string;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={inkVar(ink)}
      strokeWidth={w}
      strokeDasharray={dash}
      strokeLinecap="butt"
      {...drawProps(o)}
    />
  );
}

/** A drawable path. */
export function Path({
  d,
  ink,
  w = 1.2,
  o = 0,
  fill = 'none',
  dash,
}: {
  d: string;
  ink?: Ink;
  w?: number;
  o?: number;
  fill?: string;
  dash?: string;
}) {
  return (
    <path
      d={d}
      fill={fill}
      stroke={inkVar(ink)}
      strokeWidth={w}
      strokeDasharray={dash}
      strokeLinejoin="round"
      {...drawProps(o)}
    />
  );
}

/** Dimension line with end ticks + a mono value (or an empty witness gap). */
export function Dim({
  x1,
  y1,
  x2,
  y2,
  value,
  ink,
  o = 0,
  flip = false,
  reveal,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: string | null;
  ink?: Ink;
  o?: number;
  flip?: boolean;
  /** Act lettering: the point in an act sheet's travel (0-1) after which this
      value letters in (--reveal, read by Sheet.module.css). Meaningless off an
      act sheet — the rule is scoped to [data-act]. */
  reveal?: number;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const tick = 4.5;
  const c = inkVar(ink);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={0.9} {...drawProps(o)} />
      {/* end ticks (architect's slash) */}
      <line x1={x1 - tick} y1={y1 - tick} x2={x1 + tick} y2={y1 + tick} stroke={c} strokeWidth={0.9} {...drawProps(o)} />
      <line x1={x2 - tick} y1={y2 - tick} x2={x2 + tick} y2={y2 + tick} stroke={c} strokeWidth={0.9} {...drawProps(o)} />
      {value ? (
        <text
          x={horizontal ? mx : mx + (flip ? -8 : 8)}
          y={horizontal ? my - 5 : my}
          fill={c}
          fontFamily="var(--font-mono)"
          fontSize={10}
          textAnchor="middle"
          dominantBaseline={horizontal ? 'auto' : 'middle'}
          style={
            {
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              ...(reveal !== undefined ? { '--reveal': reveal } : null),
            } as CSSProperties
          }
        >
          {value}
        </text>
      ) : (
        // honest empty witness line: a gap where a real number will go
        <line
          x1={mx - 9}
          y1={horizontal ? my - 4 : my}
          x2={mx + 9}
          y2={horizontal ? my - 4 : my}
          stroke={c}
          strokeWidth={0.9}
          strokeDasharray="1 3"
          {...drawProps(o)}
        />
      )}
    </g>
  );
}

/** Registration cross-hair mark. */
export function Registration({ x, y, o = 0, ink = 'graphite' }: { x: number; y: number; o?: number; ink?: Ink }) {
  const r = 6;
  return (
    <g>
      <line x1={x - r} y1={y} x2={x + r} y2={y} stroke={inkVar(ink)} strokeWidth={0.8} {...drawProps(o)} />
      <line x1={x} y1={y - r} x2={x} y2={y + r} stroke={inkVar(ink)} strokeWidth={0.8} {...drawProps(o)} />
      <circle cx={x} cy={y} r={r - 2} fill="none" stroke={inkVar(ink)} strokeWidth={0.8} {...drawProps(o)} />
    </g>
  );
}

/** A revision cloud — the honest "this was redrawn" convention. */
export function RevisionCloud({
  d,
  ink,
  o = 0,
}: {
  d: string;
  ink?: Ink;
  o?: number;
}) {
  return <path d={d} fill="none" stroke={inkVar(ink)} strokeWidth={1.4} {...drawProps(o)} />;
}
