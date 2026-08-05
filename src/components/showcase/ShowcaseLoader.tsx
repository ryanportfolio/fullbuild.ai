"use client";

import type { CSSProperties } from "react";

/*
 * THE PLATE. One flat drawing of the fullbuild mark, rendered twice: once in drafting ink
 * on vellum, once in frost on the void. Every coordinate below is src/app/icon.svg's own
 * viewBox verbatim, so there is no second mapping to keep in step and the plate can be read
 * straight against the icon file.
 *
 *   baseline     M8 82 H92
 *   drawn half   M18 82 V48 L35 32 L52 48 V82, plus M25 76 l12 -12 and M25 66 l9 -9
 *   poured half  M52 48 H82 V82 and M52 48 L68 32 L82 46, filled solid
 *
 * The two copies carry identical geometry at identical size. That is what lets the
 * travelling cut in showcase.module.css convert the mark column by column with nothing to
 * misregister: the sheet and the world are the same drawing in two materials, and the only
 * thing that crosses the sheet is which material is being read.
 *
 * A single layer with one lerped ink is the thing this replaces. It goes dead grey exactly
 * where the ground goes dead grey and contrast collapses in the middle of the film. Two
 * composites and a hard edge are the fix, and they will stop working the moment somebody
 * folds them back into one.
 *
 * Nothing here owns a clock. Every path takes its progress from a CSS band keyed only to
 * the driving load variable, so holding the percent holds the frame exactly.
 *
 * THE STYLESHEET ARRIVES BY PROP. Two films render this plate now, the showcase loader and
 * the homepage intro, and each brings its own CSS module. Importing one module here would
 * ship the whole showcase stylesheet to the homepage for the sake of eleven class names,
 * so the caller passes the module it wants the plate drawn in.
 *
 * THE BAND NAMES ARE THIS FILE'S CONTRACT, NOT THE MODULE'S PRIVATE NAMESPACE. Every
 * progress source below is a hardcoded `var(--b-*)` string, so any module driving this
 * plate must declare and ramp those exact names. Rename them behind a module prefix and
 * the dash offset resolves to nothing: the plate paints fully drawn from the first frame,
 * silently, with no error anywhere.
 *
 * The class keys a module must define: plate, rise, guide, tick, hatch, overdraw, seam,
 * extrusion, fillPath, pourFill, drawnFill.
 */

type PlateVariant = "sheet" | "world";

type PlateStyles = Readonly<Record<string, string>>;

type PlateStroke = {
  d: string;
  /* Stroke weight in viewBox units before the build band thins it to the built line. */
  w: number;
  /* The band this stroke inks in on. Anything already standing takes 1. */
  s?: string;
  cls?: string;
  transform?: string;
};

/*
 * SETTING OUT. The full bleed ground line runs past the plate on both sides, the way a
 * drafter rules the datum before deciding where the building sits on it. The eave guides and
 * the apex centreline are the layout the object line is then hung on, and all four erase
 * once the registration marks land.
 *
 * The datum's overrun is bounded rather than enormous. pathLength normalises the dash to the
 * whole path, so a datum running from -900 to 1000 spent nine tenths of its band drawing off
 * plate and crossed the frame in about seven milliseconds: the sheet's widest gesture was the
 * one nobody ever saw drawn. At -120 to 220 it sweeps the frame over roughly seven tenths of
 * the band on a desktop viewport and still bleeds past both edges up to about a 2.2:1 aspect.
 * The trade is inherent: the path is fixed in viewBox units and the plate is sized off svh,
 * so a narrow viewport sees a smaller window onto the same sweep and reads it faster.
 */
/*
 * In the order a hand rules them, one line at a time: the datum's long gesture, the apex
 * centreline it will hang the peak on, then each eave guide. They used to share one band
 * and arrive together, which read as a glitch rather than a drawing being started.
 */
const SETTING_OUT: PlateStroke[] = [
  { d: "M-120 82 H220", w: 0.5, cls: "guide" },
  { d: "M35 27 V44", w: 0.5, cls: "guide" },
  { d: "M14 48 H56", w: 0.5, cls: "guide" },
  { d: "M48 48 H88", w: 0.5, cls: "guide" },
].map((stroke, index) => ({ ...stroke, s: `var(--b-setout${index})` }));

const DRAWN_HALF = "M18 82 V48 L35 32 L52 48 V82";

/* The object line, in the order a hand would lay it down: ground, walls, hatching, pour. */
const OBJECT_LINE: PlateStroke[] = [
  { d: "M8 82 H92", w: 1.5, s: "var(--b-base)" },
  { d: DRAWN_HALF, w: 1.7, s: "var(--b-draw)" },
  { d: "M25 76 L37 64", w: 1, s: "var(--b-hatch1)", cls: "hatch" },
  { d: "M25 66 L34 57", w: 1, s: "var(--b-hatch2)", cls: "hatch" },
  { d: "M52 48 H82 V82", w: 1.7, s: "var(--b-pour1)" },
  { d: "M52 48 L68 32 L82 46", w: 1.7, s: "var(--b-pour2)" },
];

/*
 * The second pass an architect makes over a line that matters, offset by less than a pen
 * width and half inked. Sheet only: an overdraw is a property of a drawing, and the built
 * object on the other side of the cut has no such thing.
 */
const OVERDRAW: PlateStroke = {
  d: DRAWN_HALF,
  w: 1.7,
  s: "var(--b-over)",
  cls: "overdraw",
  transform: "translate(0.8,-0.8)",
};

/*
 * REGISTRATION. Short overshoots wherever a wall meets the ground line, where the eave
 * crosses the party wall, and where the drawn peak lands. They stagger in rather than
 * arriving together, because a hand puts them down one at a time.
 */
const TICKS: PlateStroke[] = [
  "M8 78.5 V85.5",
  "M18 78.5 V85.5",
  "M52 78.5 V85.5",
  "M82 78.5 V85.5",
  "M92 78.5 V85.5",
  "M47 48 H57",
  "M35 28.5 V35.5",
].map((d, index) => ({ d, w: 0.6, s: `var(--b-tick${index})`, cls: "tick" }));

/*
 * Panel seams on the same cut the 3D artifact takes: a nine panel wall under three gable
 * pieces per half, both halves starting and stopping on the party wall at x52 so the shed
 * reads as one construction cut down the middle. World only, and only once the object is
 * standing up.
 */
const SEAMS: PlateStroke[] = [
  "M29 48 V82",
  "M40 48 V82",
  "M18 59.5 H52",
  "M18 71 H52",
  "M26.5 40 H43.5",
  "M35 40 V48",
  "M63 48 V82",
  "M73 48 V82",
  "M52 60 H82",
  "M52 71 H82",
  "M60 40 H76",
  "M68 40 V48",
].map((d) => ({ d, w: 0.35, cls: "seam" }));

/* An oblique of the same silhouette, plus the rails that tie it back to the front face. */
const EXTRUSION: PlateStroke[] = [
  { d: "M12.6 79.2 H96.6", w: 0.9, cls: "extrusion" },
  { d: "M22.6 79.2 V45.2 L39.6 29.2 L56.6 45.2 V79.2", w: 0.9, cls: "extrusion" },
  { d: "M56.6 45.2 L72.6 29.2 L86.6 43.2 V79.2", w: 0.9, cls: "extrusion" },
  ...[
    "M8 82 L12.6 79.2",
    "M18 82 L22.6 79.2",
    "M18 48 L22.6 45.2",
    "M35 32 L39.6 29.2",
    "M52 48 L56.6 45.2",
    "M52 82 L56.6 79.2",
    "M68 32 L72.6 29.2",
    "M82 46 L86.6 43.2",
    "M82 82 L86.6 79.2",
    "M92 82 L96.6 79.2",
  ].map((d) => ({ d, w: 0.6, cls: "extrusion" })),
];

/*
 * pathLength normalises every path to 100 units, which is what takes the dash out of px
 * space. Without it Chrome divides CSS dash lengths by the render scale and the building
 * comes out truncated, which is the trap globals.css documents. For the same reason nothing
 * here may ever carry the vector effect that holds a stroke at constant screen width: it
 * puts the dash straight back into screen pixels and reproduces the truncation exactly.
 *
 * The gap runs twice the dash rather than matching it. A dash and gap of equal length puts
 * the pattern boundary exactly on the path's own end at zero progress, and a round cap on
 * that zero length dash paints a visible dot at the tip of a line that has not been drawn
 * yet. Doubling the gap moves the whole path inside it and the dot is gone.
 */
function Stroke({ stroke, styles }: { stroke: PlateStroke; styles: PlateStyles }) {
  return (
    <path
      d={stroke.d}
      className={stroke.cls ? styles[stroke.cls] : undefined}
      transform={stroke.transform}
      pathLength="100"
      strokeDasharray="100 200"
      style={{ "--w": `${stroke.w}`, "--s": stroke.s ?? "1" } as CSSProperties}
    />
  );
}

export function LoaderPlate({ variant, styles }: { variant: PlateVariant; styles: PlateStyles }) {
  const world = variant === "world";
  const riseId = `fb-rise-${variant}`;

  return (
    <svg className={styles.plate} viewBox="0 0 100 100" role="presentation" focusable="false">
      <defs>
        {/*
          The pour rises out of the baseline instead of fading in, so the material reads as
          poured rather than painted. The rect is driven by CSS geometry properties off the
          same band table as everything else, and the attributes below are the fully risen
          pour: CSS geometry beats a presentation attribute, so they change nothing here, and
          anywhere the properties do not resolve the pour arrives whole rather than the clip
          collapsing to nothing and taking the mark's poured half with it.
        */}
        <clipPath id={riseId} clipPathUnits="userSpaceOnUse">
          <rect className={styles.rise} x="52" y="48" width="30" height="34" />
        </clipPath>
      </defs>

      {world ? (
        <path className={`${styles.drawnFill} ${styles.fillPath}`} d={`${DRAWN_HALF} Z`} />
      ) : null}
      <path
        className={`${styles.pourFill} ${styles.fillPath}`}
        d="M52 48 H82 V82 H52 Z"
        clipPath={`url(#${riseId})`}
      />

      {SETTING_OUT.map((stroke) => <Stroke key={stroke.d} stroke={stroke} styles={styles} />)}
      {OBJECT_LINE.map((stroke) => <Stroke key={stroke.d} stroke={stroke} styles={styles} />)}
      {world ? null : <Stroke stroke={OVERDRAW} styles={styles} />}
      {world ? SEAMS.map((stroke) => <Stroke key={stroke.d} stroke={stroke} styles={styles} />) : null}
      {world ? EXTRUSION.map((stroke) => <Stroke key={stroke.d} stroke={stroke} styles={styles} />) : null}
      {TICKS.map((stroke) => <Stroke key={stroke.d} stroke={stroke} styles={styles} />)}
    </svg>
  );
}
