import { clamp01, projectFloat } from "./data";

/*
 * THE RUN. Everything the "View all" warp is, as one pure function of wall-clock
 * milliseconds, and every number it uses declared here once.
 *
 * The rule is introTiming.ts's rule: nothing downstream holds a second copy of a number.
 * The camera rig, the streak sheath and the film grade all read a WarpFrame rather than
 * re-deriving anything, so a beat cannot mean one thing to the lens and another to the
 * sheath. And because warpFrameAt reads no clock and no random source, pinning t and from
 * pins the picture, which is what makes the capture contract possible at all.
 */

/* Anticipation. Same value and same reason as introTiming.ts:99: the camera pulls back a
 * hair before it commits, so the commit reads as a decision rather than a cut. */
export const WARP_CHARGE_MS = 180;
/*
 * The run itself. The page's own longest single move is entryFloodDrain at 2400ms
 * (showcase.module.css:257-293) and the entrySettled handover is 3000ms
 * (ShowcaseApp.tsx:414); the intro's warp is 980ms for five world units
 * (introTiming.ts:101) and this covers a hundred and one. 980ms for a hundred units is a
 * cut, not a journey. 2440ms to rest from a standing start sits between the two tempos this
 * page already believes about itself.
 */
export const WARP_RUN_MS = 1800;
/*
 * And the run is only that long when there is a whole corridor left to cross. Duration, and
 * the anticipation that pays for it, scale with the distance still to go: measured, a click at
 * 0.95 spent the same 2720ms and the same 0.9 units of pull-back on 1.8 per cent of the
 * journey, which is two and a half seconds of near static dark for a reader who asked to be
 * taken somewhere. The square root rather than a straight proportion because a short trip
 * still has to read as a move: at 0.95 a linear law would be a 33ms cut.
 */
export const WARP_REACH_EXPONENT = 0.5;
/* Under this it stops being a move and becomes a jump, whatever the arithmetic says. */
export const WARP_RUN_MIN_MS = 200;
export const WARP_LAND_MS = 460;
/* Long enough for the released ref to hand the camera back to its damping on a frame where
 * the damping has nothing left to do, and no longer. */
export const WARP_SETTLE_MS = 120;

/*
 * The four landmarks of a run from a standing start. Every other start position derives its
 * own from warpScheduleAt, and these stay the table the named beats are quoted from.
 */
export const WARP_RUN_START = WARP_CHARGE_MS;
export const WARP_LAND_START = WARP_RUN_START + WARP_RUN_MS;
export const WARP_REST = WARP_LAND_START + WARP_LAND_MS;
export const WARP_END = WARP_REST + WARP_SETTLE_MS;

/*
 * Taken intact from IntroScene.tsx:61 with its stated reason: the curve accelerates the
 * whole way with no ease out, so the wall is coming at the lens for most of the beat rather
 * than arriving all at once. From a standing start the nine chapter centres are crossed at
 * 180, 718, 980, 1188, 1368, 1530, 1678, 1816 and 1946ms: monotone acceleration, the last
 * four about 140ms apart. That cadence is what travelling through to the very end has to
 * feel like.
 */
export const WARP_EXPONENT = 1.75;
/*
 * The curve the deceleration eases on. It was a cube over 620ms, and measured that spent its
 * last 300ms covering 0.6 of a world unit at two units a second, one and a half per cent of
 * peak, with two frames 200ms apart indistinguishable. A gentler exponent over a shorter
 * landing keeps the wall coming until it arrives instead of creeping onto it.
 */
export const WARP_LAND_EXPONENT = 2.2;
/*
 * Where the run hands over to the landing, and the load-bearing choice in the whole table.
 * The three DOM cuts near the end sit at 0.96 (the scene label), 0.965 (the ledger) and
 * 0.978 (the finale), inside eighteen thousandths of progress. Handing over at 0.968 puts
 * the first two inside the run at near peak speed under a flare already at 0.87, so both
 * fades burn off in the flash, and leaves the deceleration owning only two events: the
 * finale coming on and the crystals cutting out. The dead band between the ledger leaving
 * and the finale arriving is crossed in 76ms at the flare peak, so nobody sees an empty
 * frame, they see a white one.
 */
export const WARP_CROSS_P = 0.968;
/*
 * The progress per second that reads as fully open streaks. The sheath is driven from the
 * analytic dp/dt rather than from the run's normalised time on purpose: a click at half way
 * peaks at 0.455 progress a second, so its streaks stay visibly shorter than a click from
 * the top. Driving them from the clock would show full hyperspace for a three per cent
 * journey, which is a lie the eye catches immediately.
 */
export const WARP_REF_RATE = 0.8;

/*
 * IntroScene.tsx:37 uses 0.28 on a five unit run. Scaled to a hundred and one units and
 * rounded down, so it stays anticipation rather than becoming a dolly of its own. This is the
 * full-corridor value; warpPullbackAt scales it with the distance actually left to go.
 */
export const WARP_PULLBACK = 0.9;
/* CHARGE_ROLL 0.0105 (IntroScene.tsx:38), signed opposite so the wind-up reads against the
 * roll that follows it. */
export const WARP_ROLL_CHARGE = -0.009;
/* WARP_ROLL 0.055 (IntroScene.tsx:39), a hair under because this run is four times longer
 * and the shear it puts across the sheath is held that much longer with it. */
export const WARP_ROLL_PEAK = 0.052;
/* ShowcaseScene.tsx:4015, the only place the showcase ever sets a field of view. */
export const WARP_FOV_REST = 50;
/* The charge closes the lens down before the run opens it up. */
export const WARP_FOV_DIP = -1.4;
/* FOV_GAIN (IntroScene.tsx:41) intact. */
export const WARP_FOV_GAIN = 7;

/* The camera's own rest position and the chapter spacing it travels on, mirroring
 * ShowcaseScene.tsx:4015 and :86. They live here so the frame can publish an absolute z and
 * the rig never has to derive one. */
export const WARP_CAMERA_REST_Z = 5;
export const WARP_PROJECT_SPACING = 11.5;

/*
 * THE FLARE. It opens 320ms before the crossing so the FinaleDebris pop at progress 0.9
 * lands at 0.87 rather than in a clean frame, holds through the crossing and the crystal
 * cut-off, and is back to nothing by 2380ms, sixty milliseconds before the camera comes to
 * rest. The film is always settled before the frame is.
 */
export const WARP_FLARE_LEAD_MS = 320;
export const WARP_FLARE_HOLD_MS = 150;
export const WARP_FLARE_FALL_MS = 400;

/*
 * THE CROSSING IS A DOORWAY, NOT A BLACKOUT. Measured over a live run before this existed,
 * frame luma fell from 40.84 to 19.18 in one 17ms step at the crossing and the crossing was
 * the darkest centre frame of the whole piece. The flare drove chromatic aberration and grain,
 * and neither of those adds a single count of light, so the beat the whole arrival hangs on
 * was a hole in the film.
 *
 * The light comes from RadiationGlow, which is already a camera-anchored gaussian in the one
 * colour this piece is allowed to be bright in: #0512ff, blue leading, green second, red last.
 * Bloom at nine levels and a 0.34 threshold takes it into a halo for nothing. The wash opens
 * as the threshold comes up, holds wide and full through the crossing, then collapses to a
 * core as it dies, which is what passing a light source looks like from inside it.
 */
export const WARP_GLOW_OPACITY = 0.62;
export const WARP_GLOW_RADIUS_OPEN = 1.3;
export const WARP_GLOW_RADIUS_CROSS = 0.18;

/* World units of tail at full stretch. */
export const WARP_STREAK_STRETCH = 4.2;
export const WARP_STREAK_OPACITY = 0.9;
/* Under one, so the sheath is already visible while it is still short. */
export const WARP_STREAK_OPACITY_EXPONENT = 0.7;
/*
 * At the crossing the stretch collapses in a single frame and this term is what covers it:
 * the sheath stays bright while its length dies, so the beat reads as the streaks blowing
 * out into sparks rather than switching off. That is what passing a threshold looks like,
 * and it is the beat the flare exists to cover. Do not smooth the collapse.
 */
export const WARP_STREAK_FLARE_OPACITY = 0.85;

/*
 * The two film terms, and both are safe only because of where they land. Eight times the
 * base aberration would be a rainbow across the subject on any other page; here
 * radialModulation with modulationOffset 0.86 (ShowcaseScene.tsx:3880) scales the shift as
 * (2 * distance - 0.86), which is negative at frame centre, so the middle of the frame does
 * not split at all and only the outer sixth opens, where the vignette is already taking the
 * corner down. And thirty-three times the base grain is about seven counts of lift against
 * the fifty that ShowcaseScene.tsx:3844-3847 measures for 0.07, held a hundred and fifty
 * milliseconds and gone well before the arrival.
 */
export const WARP_ABERRATION_STRETCH_GAIN = 2.6;
export const WARP_ABERRATION_STRETCH_EXPONENT = 1.4;
export const WARP_ABERRATION_FLARE_GAIN = 5.2;
export const WARP_GRAIN_STRETCH_GAIN = 6;
export const WARP_GRAIN_FLARE_GAIN = 26;

/*
 * The lerp RadiationGlow runs at while the warp owns the frame. Its own 0.08 is a two
 * hundred millisecond time constant against chapter pulses arriving every hundred and
 * forty, so the nine smear into one plateau and the archive is skipped rather than counted.
 * At 0.40 a pulse is ninety per cent resolved inside half its own period at 60Hz.
 */
export const WARP_RADIATION_LERP = 0.4;

/*
 * And the lerp Atmosphere runs at for the same reason. Its own 0.045 a frame needs about 1.7
 * seconds to converge, which was fine on a scrollbar and is not fine against a run that lands
 * in two and a half. Measured at the real arrival: fog #242915 against a natural scroll to the
 * same place settling at #142806, sixteen and fifteen counts of 255 apart, still #1a280c two
 * seconds later. Not 1.0, which would strobe nine ambience levels past the reader inside a
 * second and a half; 0.22 is about twenty frames to converge, so the room is the right room
 * when the motion stops and the journey still smears.
 */
export const WARP_ATMOSPHERE_LERP = 0.22;

/*
 * THE BEAT TABLE. Named frames the capture hook can pin, so verification photographs the
 * same moment every time instead of whatever the wall clock happened to be showing.
 *
 * `pulse-gap` and `pulse-peak` are a pair and only mean anything together: the gap sits
 * midway between the seventh and eighth chapter crossings and the peak sits on the eighth.
 * Measured, that pair does resolve, at 1.5 times the gap's centre luma. What the pair also
 * proved is that the archive is NOT nine countable events: the sixth crossing is a 1.2x
 * ripple and the ninth is swallowed by the flare. See the note in RadiationGlow.
 */
export const WARP_BEATS = {
  arm: 0,
  charge: 120,
  launch: 300,
  run: 1080,
  "pulse-gap": 1747,
  "pulse-peak": 1816,
  cross: WARP_LAND_START,
  flare: 2130,
  arrive: WARP_REST,
  settle: WARP_END,
} as const;

export type WarpBeat = keyof typeof WARP_BEATS;

export type WarpFrame = {
  /** Milliseconds since the run was armed. */
  t: number;
  /** The progress the run was armed at. Pinning this and t pins the picture. */
  from: number;
  progress: number;
  cameraZ: number;
  pullback: number;
  roll: number;
  fov: number;
  /** 0 to 1, how open the streaks are, from the true rate of travel. */
  stretch: number;
  /** The sheath's own alpha, which the flare holds up through the collapse. */
  opacity: number;
  /** World units travelled since arm. Analytic, never an integral, so a pinned beat
   *  reproduces the exact sheath. */
  feed: number;
  flare: number;
  /** The radiation wash's radius through the crossing, in the shader's own units. */
  glowRadius: number;
};

/** Everything about a run that depends on where it was armed. */
export type WarpSchedule = {
  runMs: number;
  landStart: number;
  rest: number;
  end: number;
  pullback: number;
};

function smoothstep(value: number, edge0: number, edge1: number) {
  const x = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return x * x * (3 - 2 * x);
}

/* Where the lens sits for a given progress, before the anticipation is added back on. */
function travelZ(progress: number) {
  return WARP_CAMERA_REST_Z - projectFloat(progress) * WARP_PROJECT_SPACING;
}

/*
 * How much of the corridor is still ahead, as a fraction of the whole of it. One at a standing
 * start, zero at the crossing, and the one number every distance-scaled term below is built
 * out of.
 */
export function warpReachAt(from: number) {
  return clamp01((WARP_CROSS_P - clamp01(from)) / WARP_CROSS_P);
}

/*
 * The run's own length. Two bounds and a floor:
 *
 *  - the square root law, so a half-way click takes 1252ms rather than the full 1800 and the
 *    streaks it earns stay honest about how far it is actually going;
 *  - a cap that keeps the crossing a collapse. The landing enters at a fixed rate, because it
 *    always covers the same last 3.2 per cent of the journey, so a run that is too slow would
 *    have the speed rise through the crossing instead of falling off a cliff at it. The cap is
 *    exactly the run length whose peak rate equals the landing's entry rate;
 *  - and a floor, because the arithmetic keeps going long after the eye stops reading a move.
 */
export function warpRunMsAt(from: number) {
  const remaining = Math.max(0, WARP_CROSS_P - clamp01(from));
  const eased = WARP_RUN_MS * Math.pow(warpReachAt(from), WARP_REACH_EXPONENT);
  const collapse = (remaining * WARP_EXPONENT * WARP_LAND_MS)
    / Math.max(0.000001, (1 - WARP_CROSS_P) * WARP_LAND_EXPONENT);
  return Math.max(WARP_RUN_MIN_MS, Math.min(eased, collapse));
}

/* Anticipation is paid for out of the same budget: a 0.9 unit wind-up in front of a two unit
 * trip is not a wind-up, it is most of the journey. */
export function warpPullbackAt(from: number) {
  return WARP_PULLBACK * Math.pow(warpReachAt(from), WARP_REACH_EXPONENT);
}

export function warpScheduleAt(from: number): WarpSchedule {
  const runMs = warpRunMsAt(from);
  const landStart = WARP_RUN_START + runMs;
  const rest = landStart + WARP_LAND_MS;
  return {
    runMs,
    landStart,
    rest,
    end: rest + WARP_SETTLE_MS,
    pullback: warpPullbackAt(from),
  };
}

export function warpFlareAt(t: number, from = 0) {
  const landStart = warpScheduleAt(from).landStart;
  return smoothstep(t, landStart - WARP_FLARE_LEAD_MS, landStart)
    * (1 - smoothstep(t, landStart + WARP_FLARE_HOLD_MS, landStart + WARP_FLARE_FALL_MS));
}

/*
 * The whole run, as arithmetic. Three segments and a rest, each one continuous with the
 * next in position, roll and field of view; the only discontinuity anywhere is the rate of
 * travel at the crossing, and that one is the point of the piece.
 */
export function warpFrameAt(t: number, from: number): WarpFrame {
  const armedFrom = clamp01(from);
  const schedule = warpScheduleAt(armedFrom);
  const c = smoothstep(t, 0, WARP_CHARGE_MS);
  const u = clamp01((t - WARP_RUN_START) / schedule.runMs);
  const e = Math.pow(u, WARP_EXPONENT);
  const l = clamp01((t - schedule.landStart) / WARP_LAND_MS);
  const d = 1 - Math.pow(1 - l, WARP_LAND_EXPONENT);
  const fovDip = WARP_FOV_REST + WARP_FOV_DIP;
  const fovPeak = WARP_FOV_REST + WARP_FOV_GAIN;

  let progress = 1;
  let pullback = 0;
  let roll = 0;
  let fov = WARP_FOV_REST;
  /* Progress per second. Deliberately measured on progress rather than on world z:
   * projectFloat (data.ts:169-182) has a slope discontinuity at 0.936 where the run-out
   * band's 1/0.082 replaces the chapters' 1/0.117, a 43 per cent jump, and driving the
   * sheath through world speed would jump every streak fifteen per cent in one frame. */
  let rate = 0;

  if (t < WARP_RUN_START) {
    progress = armedFrom;
    pullback = schedule.pullback * c;
    roll = WARP_ROLL_CHARGE * c;
    fov = WARP_FOV_REST + WARP_FOV_DIP * c;
  } else if (t < schedule.landStart) {
    progress = armedFrom + (WARP_CROSS_P - armedFrom) * e;
    pullback = schedule.pullback * (1 - e);
    roll = WARP_ROLL_CHARGE * (1 - e) + WARP_ROLL_PEAK * e;
    fov = fovDip + (fovPeak - fovDip) * e;
    rate = (WARP_CROSS_P - armedFrom) * WARP_EXPONENT
      * Math.pow(u, WARP_EXPONENT - 1) * 1000 / schedule.runMs;
  } else if (t < schedule.rest) {
    progress = WARP_CROSS_P + (1 - WARP_CROSS_P) * d;
    roll = WARP_ROLL_PEAK * (1 - d);
    fov = fovPeak + (WARP_FOV_REST - fovPeak) * d;
    rate = (1 - WARP_CROSS_P) * WARP_LAND_EXPONENT
      * Math.pow(1 - l, WARP_LAND_EXPONENT - 1) * 1000 / WARP_LAND_MS;
  }

  const flare = warpFlareAt(t, armedFrom);
  const stretch = clamp01(rate / WARP_REF_RATE);
  const cameraZ = travelZ(progress) + pullback;
  /* Wide and full at the crossing, then down to a core on the way out. The collapse rides the
   * flare's own fall so the two cannot come apart, and at flare zero the wash is handed back
   * to whatever the chapter wanted. */
  const glowCollapse = smoothstep(
    t,
    schedule.landStart + WARP_FLARE_HOLD_MS,
    schedule.landStart + WARP_FLARE_FALL_MS,
  );

  return {
    t,
    from: armedFrom,
    progress,
    cameraZ,
    pullback,
    roll,
    fov,
    stretch,
    opacity: Math.max(
      WARP_STREAK_OPACITY * Math.pow(stretch, WARP_STREAK_OPACITY_EXPONENT),
      WARP_STREAK_FLARE_OPACITY * flare,
    ),
    feed: travelZ(armedFrom) - cameraZ,
    flare,
    glowRadius: WARP_GLOW_RADIUS_OPEN
      + (WARP_GLOW_RADIUS_CROSS - WARP_GLOW_RADIUS_OPEN) * glowCollapse,
  };
}
