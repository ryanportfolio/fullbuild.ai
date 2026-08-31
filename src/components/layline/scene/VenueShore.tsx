"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { Color, DoubleSide, Vector2 } from "three";
import { useReplay } from "../store";
import { requestSceneFrame } from "./gate";
import { shorelineGeometry } from "./SkyDome";
import { VENUE_LAYER_PREFIX, setVenueDrawnForMask } from "./inspect";

/* The inspection mask defers venue-layer hiding until readiness has latched
 * (an invisible mesh never fires `onAfterRender`, so a mask applied before the
 * venue's first drawn frame could strand `ready` at `loading` forever). These
 * notifications close that window; in production the mask does not exist and
 * the calls compile to nothing. */
function tellMaskVenueDrawn(drawnNow: boolean): void {
  if (
    process.env.NODE_ENV !== "production" &&
    setVenueDrawnForMask(drawnNow) &&
    drawnNow
  ) {
    /* The deferred mask was just written onto the scene; a frozen page needs
     * one more frame to show it. One request at the moment the latch closes,
     * never per-frame (setVenueDrawnForMask returns false when unchanged). */
    requestSceneFrame();
  }
}
import {
  CLASS_HEROES,
  CLASS_MASSING,
  CLASS_PORT,
  CLASS_TERRAIN,
  MATERIAL_CURTAIN,
  parseVenueMesh,
  type VenueLayer,
} from "./venue-asset";
import {
  SKY_GLSL,
  SKY_HORIZON,
  SKY_ZENITH,
  SUN_DISC,
  SUN_TINT,
  VENUE_APRON,
  VENUE_BLOCK,
  VENUE_HAZE_LOW,
  VENUE_HERO_FUNNEL,
  VENUE_HERO_HULL,
  VENUE_HERO_PALE,
  VENUE_HERO_WHITE,
  VENUE_ISLE_DECK,
  VENUE_ISLE_PANEL,
  VENUE_ISLE_ROCK,
  VENUE_ISLE_SCREEN,
  VENUE_ISLE_VEG,
  VENUE_RIDGE_FAR,
  VENUE_RIDGE_NEAR,
  VENUE_SCRUB,
  VENUE_SKY_FILL,
  VENUE_STEEL,
  VENUE_TANK,
  VENUE_TOWER,
  VENUE_YARD,
  WHITECAP,
  sunDirection,
} from "./sky";

/* Aerial perspective as two terms rather than one.
 *
 * The long term carries the disc and is thinner than round0's single rho, so
 * the 9 km ridge keeps 31 per cent of its colour instead of 26 and stops
 * dissolving into the sky before the fade is meant to take it. The short one
 * is a 600 m bite with only 15 per cent of the weight: it takes the edge off
 * the oil island 715 m off the bow, which round0 rendered at 90 per cent and
 * therefore as a black cut-out, without touching anything past 2 km.
 *
 * Measured against round0 at the same points: 0.83 / 0.70 / 0.60 / 0.44 / 0.31
 * at 715 m, 1.8 km, 3.2 km, 6 km, 9 km, where round0 ran 0.90 / 0.76 / 0.62 /
 * 0.41 / 0.26. Most of the near-to-far ordering D4 was missing comes from the
 * land colour below, not from here. */
/* Round 4d lengthens the far term from 1/9,000 to 1/12,800 and thins the near
 * one from 0.15 to 0.07.
 *
 * The far constant comes from a stated visual range, not from a fitted curve
 * and not from an instrument. The input is the clear-day meteorological visual
 * range for this basin, 40 to 60 km; the midpoint 50 km is the chosen day, and
 * Koschmieder (V = 3.912 / beta) turns it into 1/12,780, rounded to 1/12,800.
 * The transmittance table in .tmp/venue-audit/round4d/research.md (0.36 at
 * 13 km, 0.015 at 54 km) was computed from that same assumed range, so it
 * checks the arithmetic and corroborates nothing. What 50 km buys is the day
 * the far band's own inventory assumes: Mount Wilson at 54 km and Baldy at
 * 76 km are in it, and neither is visible on the 35 km day 1/9,000 describes.
 *
 * The near term's weight was a fixed 15 per cent bite that never decayed, so
 * every fragment past about 2 km lost a sixth of its colour to a term meant for
 * an oil island 715 m off the bow. At 0.07 that island still keeps only 0.90
 * and everything beyond 2 km gets its sixth back.
 *
 * Measured against the shipped pair at the same points: 0.90 / 0.81 / 0.72 /
 * 0.58 / 0.44 at 715 m, 1.8 km, 3.2 km, 6 km, 9.5 km, where the shipped pair
 * ran 0.83 / 0.70 / 0.60 / 0.44 / 0.30. The clip edge is unaffected either way:
 * `aFade` reaches 0 at 10,000 m and the terrain is clipped at 10,500. */
const HAZE_NEAR_WEIGHT = 0.07;
const HAZE_NEAR = 1 / 600;
const HAZE_FAR = 1 / 12800;

/* The two lights, in irradiance ratio rather than in taste.
 *
 * Both colours enter the shader normalised to luminance 1 (see `light` below),
 * so these gains ARE the direct-to-diffuse ratio. A horizontal surface takes
 * SUN_GAIN * sin(22 deg) = 0.975 of direct against 0.44 of sky, 2.2 to 1; a
 * clear sky at 22 degrees of solar elevation runs about 800 W/m2 direct normal,
 * so 300 W/m2 on the horizontal against roughly 90 to 110 W/m2 diffuse, near
 * 3 to 1. The render sits under the physical ratio on purpose, and for two
 * reasons that are not taste. The ambient constant also stands in for the
 * interreflection between a container stack and the apron under it, which
 * nothing here models; and NeutralToneMapping subtracts a black offset rather
 * than lifting shadows the way a camera does, so a physically exact ambient
 * renders shade darker than the photographs it was derived from.
 *
 * The pair is fixed against the measurements, not against an opinion. It puts a
 * sunlit horizontal scrub slope at rgb(154,136,102) where research.md's
 * measured Palos Verdes slope is rgb(168,144,101) (same hue and ratio, a step
 * darker), and it holds the sunlit to shaded ratio at 3.2 to 1 in linear
 * luminance where the measured pairs run 2.6 to 3.4. Sunlit surfaces sit
 * between 0.41 (apron concrete) and 0.58 (massing block) of the horizon sky's
 * linear luminance, the darker half of where a light surface sits in a marine
 * frame exposed for the sun. */
const SUN_GAIN = 2.6;
const AMB_GAIN = 0.44;

/* Peak-to-peak of the ground grain, in the 0..1 units of the Lambert term, per
 * layer and per end of that layer's height ramp. It survived round 4d because
 * real ground is patchy, but at 1.2 it swung a flat cap across the entire ramp
 * and read as noise rather than as terrain; 0.22 puts a horizontal scrub cap
 * between 0.27 and 0.48 of Lambert, a 1.4 to 1 luminance spread.
 *
 * The port layer runs it on the container yard and switches it off on the crane
 * steel above, which is the artifact design doc 2.3 warned about: painted steel
 * is uniform and a two-octave world noise on a boom draws bands across it. */
const GRAIN_TERRAIN = new Vector2(0.26, 0.28);
const GRAIN_MASSING = new Vector2(0.12, 0.1);
const GRAIN_PORT = new Vector2(0.24, 0);
/* The hero layer runs the grain flat, because its own substances decide where
 * it applies: the island rim and the planting take it, the painted verticals
 * above them switch it off in the shader. */
const GRAIN_HERO = new Vector2(0.2, 0.2);

/* Waterline, in metres of world y. The bake puts the shore crest at 6 m and
 * every land surface at or above it, so a band keyed on height alone can only
 * ever touch the batter face between the crest and the sea.
 *
 * WET_DARKEN is a multiplier now rather than a mix toward near-black: wetting a
 * revetment cuts its diffuse reflectance by about half and leaves its hue where
 * it was, and mixing toward black instead threw away the material colour this
 * round exists to put there. */
const SURF_TOP = 1.7;
const WET_TOP = 4.2;
const WET_DARKEN = 0.5;
const SURF_MIX = 0.5;

/* What each layer is made of, and where inside itself it changes material.
 *
 * A layer is one draw call and one material, so a class that holds two
 * substances has to separate them from data the asset already carries. World
 * height does it, and it does it without a rebake: the terrain layer runs from
 * the harbour fill at the waterline to dry hillside above it, the massing layer
 * from tilt-up industrial sheds to the downtown towers, and the port layer from
 * the container yard to the gantry steel over it. `ramp` is the metre band each
 * blend crosses, taken from the geometry the baker actually emits: wharf decks
 * at 6 m and container blocks 12 m over them, MASS_MIN_H 25 m on a shed against
 * 80 m plus downtown, crane rails on the apron with the portal beam at 0.42 of
 * a 72 to 80 m apex.
 *
 * Height cannot separate everything, and where it cannot the asset carries a
 * substance byte per vertex instead. Two layers pay for it. On a THUMS island a
 * rock rim, a planted mass and a screen tower all sit inside twenty metres. In
 * the port a storage tank is 6 to 25 m, exactly the band the container blocks
 * 12 m over the apron occupy, so the ramp painted all 57 of them as stacks of
 * boxes when the real thing is painted chalky off-white for solar reflectance:
 * 0.235 reflectance against the yard's 0.182, and a different hue. */
const MATERIALS: Record<number, { lo: Color; hi: Color; ramp: Vector2; grain: Vector2 }> = {
  [CLASS_TERRAIN]: {
    lo: new Color(VENUE_APRON),
    hi: new Color(VENUE_SCRUB),
    ramp: new Vector2(14, 85),
    grain: GRAIN_TERRAIN,
  },
  [CLASS_MASSING]: {
    lo: new Color(VENUE_BLOCK),
    hi: new Color(VENUE_TOWER),
    ramp: new Vector2(30, 80),
    grain: GRAIN_MASSING,
  },
  [CLASS_PORT]: {
    lo: new Color(VENUE_YARD),
    hi: new Color(VENUE_STEEL),
    ramp: new Vector2(22, 48),
    grain: GRAIN_PORT,
  },
  /* The hero layer never reaches the ramp: every one of its vertices carries a
   * substance index of 1 or more. The pair is here so the uniform is defined
   * and so a hero emitted without an index would land on the island rock rather
   * than on a terrain colour. */
  [CLASS_HEROES]: {
    lo: new Color(VENUE_ISLE_ROCK),
    hi: new Color(VENUE_ISLE_ROCK),
    ramp: new Vector2(14, 85),
    grain: GRAIN_HERO,
  },
};
const MATERIAL_FALLBACK = MATERIALS[CLASS_TERRAIN];

/* The named substances, indexed by the `aMat` byte the baker writes. Index 0 is
 * "no named substance, use the layer's height ramp", which is what every vertex
 * outside L3 and L4 carries, so the seven below are 1 to 7 and the shader
 * selects between them without an array lookup or a branch.
 *
 * Every one is a reflectance derived the round-4d way, measured appearance
 * inverted through the render chain: .tmp/venue-audit/round5/mix-heroes.mjs,
 * .tmp/venue-audit/round6/mix-tank.mjs and .tmp/round0-constants/mix-round0.mjs
 * print the derivations and each round's provenance holds the sources. */
const HERO_ROCK = new Color(VENUE_ISLE_ROCK);
const HERO_VEG = new Color(VENUE_ISLE_VEG);
const HERO_PALE = new Color(VENUE_HERO_PALE);
const HERO_HULL = new Color(VENUE_HERO_HULL);
const HERO_FUNNEL = new Color(VENUE_HERO_FUNNEL);
const SUBSTANCE_TANK = new Color(VENUE_TANK);
const HERO_WHITE = new Color(VENUE_HERO_WHITE);
const ISLE_SCREEN = new Color(VENUE_ISLE_SCREEN);
const ISLE_PANEL = new Color(VENUE_ISLE_PANEL);
const ISLE_DECK = new Color(VENUE_ISLE_DECK);

/* Both lights reach the shader normalised to luminance 1, so the two gains
 * above read as an irradiance ratio and can be checked against a clear sky
 * rather than argued about. `new Color(hex)` is an sRGB hex in, linear working
 * space out, which is the space the shader mixes in; the luminance weights are
 * the Rec. 709 ones three.js itself uses. Once, at module load. */
function light(hex: string, gain: number): Color {
  const colour = new Color(hex);
  const luminance = 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
  return colour.multiplyScalar(gain / luminance);
}
const SUN_LIGHT = light(SUN_TINT, SUN_GAIN);
const SKY_FILL = light(VENUE_SKY_FILL, AMB_GAIN);

/* The curtain's own constants, and every one of them is load-bearing.
 *
 * R_CURTAIN is where the mid band is drawn, and its floor is set by how far the
 * camera can get from the course origin. The orbit centre is panned within
 * PAN_MAX 2,500 m of the boat it follows, the boat sails a 100 m leg so it is
 * never more than about 300 m out, and the eye stands off the centre by
 * DIST_MAX 900 m: 3,700 m of eye excursion, against terrain clipped at
 * 10,500 m. Nothing real is ever more than 14,200 m from the eye, so 14,400 m
 * puts the curtain behind all of it at every legal camera. That is why the
 * scene's far plane is 16,000 and not the 12,000 it was when the curtain sat at
 * 11,780 and pan was unbounded: with n = 1 the depth resolution is
 * `z^2 (f - n) / (f n 2^24)`, which the far plane moves by 0.002 per cent
 * between 12,000 and 16,000 and the range moves by the square.
 *
 * R_CURTAIN_BAND is what keeps the two bands off each other. They cover the
 * same azimuths over the San Gabriels, and at one shared radius they are
 * coplanar and z-fight. Round 4b ordered them by true range, which fixed 756 of
 * the 775 shared azimuths and left 41 inside a single depth quantum: the two
 * marches meet at 35 km, so a mid column that peaks at its far limit and a far
 * column that peaks at its near limit land on the same radius however the ramp
 * is shaped. The separation is keyed on the band instead. At 14.5 km with a
 * 24-bit buffer and near 1 / far 16,000 the quantum is
 * `z^2 (f - n) / (f n 2^24)` = 12.5 m, so 80 m is six quanta and does not
 * depend on where either march happened to find its summit.
 *
 * Moving a band's radius moves no pixel: the vertex is
 * `cameraPosition + radius * (dir + vec3(0, elev, 0))`, so radius scales the
 * whole offset from the eye and leaves the ray, and therefore the fragment,
 * exactly where it was. Only the depth changes.
 *
 * R_EFF is the 7/6 Earth radius under standard refraction: the same constant
 * the bake took the curvature drop out with, so the two cannot disagree. */
const R_CURTAIN = 14400;
const R_CURTAIN_BAND = 80;
const R_EFF = 7432833;

/* How much of a distant ridge survives the air between it and the eye.
 *
 * The shipped curve ran 0.35 at the mid band's inner edge and 0.086 at Baldy,
 * so the entire distance ordering lived inside 26 per cent of one mix and the
 * audit read the band as correct but barely there. This curve and the two tints
 * it carries are solved together against measurement rather than chosen:
 * research.md sampled three ridges with the sky in the same frame, and the
 * ridge-to-sky ratio that survives the exposure is the quantity that transfers.
 * The result holds Palos Verdes at 0.63 of the horizon sky's linear luminance
 * against a measured 0.65 to 0.70, and Mount Wilson and Baldy at 0.94 and 0.96
 * against a measured 0.91 to 0.95. That gap between a 17 km ridge and a 54 km
 * one is the depth cue, and the shipped curve had almost none of it.
 *
 * The falloff is 70 km rather than the 40 km an amplitude-only retune wanted,
 * because a shorter one drives k so low at 54 to 76 km that the tint the fit
 * demands leaves the gamut: at 40 km the far tint solves to a cyan with a
 * negative red channel. 70 km keeps every solved tint inside the cube with room
 * to spare, and it keeps the 0.62 ceiling a guard rather than a limit: the
 * shortest range a band can be seen at is about 6.8 km, where the curve gives
 * 0.60.
 *
 * CURTAIN_FOOT is aerial perspective inside a single column. Marine aerosol
 * sits in the lowest kilometre, so a sightline to a ridge's foot runs through
 * more of it than one to the summit: the foot takes 35 per cent of the veil
 * colour and loses a quarter of its contrast. That also softens the band's own
 * foot without an alpha channel or a second pass. */
const CURTAIN_K = 0.66;
const CURTAIN_FALLOFF = 70000;
const CURTAIN_K_MIN = 0.04;
const CURTAIN_K_MAX = 0.62;
const CURTAIN_BLEND_NEAR = 14000;
const CURTAIN_BLEND_FAR = 45000;
const CURTAIN_FOOT = 0.35;
const CURTAIN_FOOT_K = 0.25;

/* The procedural arc is only ever seen edge-on from the water, where a
 * silhouette needs no form. The venue mesh is real terrain under a freeform
 * camera that can climb, so this material lights it rather than tinting it:
 * a reflectance per material class, a sun, a sky fill, a ground grain and a
 * waterline.
 *
 * aShade is a bake-time lambert against the scene's one sun, so the lit and
 * shaded sides of a ridge agree with the glint on the water. The baker writes
 * `(0.62 + 0.55 * N.L) * 128`, so `(vShade - 0.62) * 1.818` recovers N.L
 * exactly and `lit` below is the Lambert term itself, not a stylistic ramp.
 * That is what lets the shading be a light rather than a lift toward the sky:
 * a horizontal face under a 22 degree sun sits at sin(22) = 0.375 because the
 * geometry says so.
 *
 * Round 2 adds the half a Lambert term cannot hold: what stands BETWEEN a face
 * and its light. aSun is the fraction of the solar disc the baker's ray cast
 * found unblocked by the venue's own triangles, aAo how much of the vertex's
 * own hemisphere nearby geometry closes off, and the two multiply the two
 * lights the line below adds. Both are baked, so the cost per frame is one
 * more attribute fetch each and nothing else: no light, no pass, no shadow
 * map. `scripts/layline-bake-venue.mjs` (bakeOcclusion) holds the derivation
 * and both sampling constants. */
const VenueShoreMaterial = shaderMaterial(
  {
    uSunDir: sunDirection(),
    uSkyZenith: new Color(SKY_ZENITH),
    uSkyHorizon: new Color(SKY_HORIZON),
    uSunTint: new Color(SUN_TINT),
    uSunDisc: new Color(SUN_DISC),
    uWhitecap: new Color(WHITECAP),
    uSunLight: SUN_LIGHT,
    uSkyFill: SKY_FILL,
    uAlbedoLo: MATERIAL_FALLBACK.lo,
    uAlbedoHi: MATERIAL_FALLBACK.hi,
    uRamp: MATERIAL_FALLBACK.ramp,
    uGrain: MATERIAL_FALLBACK.grain,
    uHeroRock: HERO_ROCK,
    uHeroVeg: HERO_VEG,
    uHeroPale: HERO_PALE,
    uHeroHull: HERO_HULL,
    uHeroFunnel: HERO_FUNNEL,
    uTank: SUBSTANCE_TANK,
    uHeroWhite: HERO_WHITE,
    uIsleScreen: ISLE_SCREEN,
    uIslePanel: ISLE_PANEL,
    uIsleDeck: ISLE_DECK,
    uHaze: HAZE_NEAR,
    uHazeFar: HAZE_FAR,
    uHazeMix: HAZE_NEAR_WEIGHT,
  },
  /* glsl */ `
attribute float aFade;
attribute float aShade;
attribute float aMat;
attribute float aSun;
attribute float aAo;

varying vec3 vWorld;
varying float vFade;
varying float vShade;
varying float vMat;
/* x sun visibility, y ambient openness: one varying rather than two, because
   they are read together and never apart. */
varying vec2 vOccl;

void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vFade = aFade;
  vShade = aShade * 1.9921875;
  vMat = aMat;
  vOccl = vec2(aSun, aAo);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`,
  /* glsl */ `
varying vec3 vWorld;
varying float vFade;
varying float vShade;
varying float vMat;
varying vec2 vOccl;
uniform vec3 uWhitecap;
uniform vec3 uSunLight;
uniform vec3 uSkyFill;
uniform vec3 uAlbedoLo;
uniform vec3 uAlbedoHi;
uniform vec3 uHeroRock;
uniform vec3 uHeroVeg;
uniform vec3 uHeroPale;
uniform vec3 uHeroHull;
uniform vec3 uHeroFunnel;
uniform vec3 uTank;
uniform vec3 uHeroWhite;
uniform vec3 uIsleScreen;
uniform vec3 uIslePanel;
uniform vec3 uIsleDeck;
uniform vec2 uRamp;
uniform vec2 uGrain;
uniform float uHaze;
uniform float uHazeFar;
uniform float uHazeMix;

${SKY_GLSL}

/* Ground value texture, two octaves of value noise on world xz at 111 m and
 * 37 m. The mesh cannot carry this: flat land is sealed by one earcut cap whose
 * only vertices are on the shoreline, so a per-vertex channel would interpolate
 * a 250 m island as a single value however finely the hills behind it are
 * tessellated. This rides the baked Lambert term instead, so it varies how much
 * light a patch of ground takes rather than what colour it is, which is what
 * ground patchiness physically is. Faded out between 3 and 9 km, where the
 * finer octave stops covering pixels. */
float shoreHash(vec2 p) {
  p = fract(p * vec2(127.31, 311.7));
  p += dot(p, p + 47.13);
  return fract(p.x * p.y);
}

float shoreNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(shoreHash(i), shoreHash(i + vec2(1.0, 0.0)), f.x),
    mix(shoreHash(i + vec2(0.0, 1.0)), shoreHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 toEye = vWorld - cameraPosition;
  float dist = length(toEye);
  vec3 haze = laylineSky(normalize(toEye), 0.0);

  /* Which substance this fragment is, inside a layer that is one draw call.
     Two mechanisms, and the layer picks which one it uses.

     World height is the separator for the classes the baker cannot label: the
     terrain runs harbour fill to hillside, the port runs container yard to
     gantry steel. It works there because those pairs really do sit at
     different heights.

     It fails on anything that does not. A THUMS island puts a boulder rim, a
     dark green planted mass and a pale screen tower inside the same twenty
     metres, which is why the round-4d grade painted the islands harbour-fill
     tan and they read as slabs; a storage tank stands 6 to 25 m, inside the
     container yard's own band, so the port ramp painted 57 tanks as stacks of
     boxes. Both layers carry one byte per vertex saying what the surface is
     made of, and 0 means "no named substance here, use the ramp", which is
     what every vertex in every other layer carries. The select is five mixes
     rather than a branch or an array lookup: both of those are portability
     traps in GLSL ES 1.00 and this costs four cycles. */
  float band = smoothstep(uRamp.x, uRamp.y, vWorld.y);
  vec3 heroLow = mix(uHeroRock, uHeroVeg, step(1.5, vMat));
  vec3 heroMid = mix(uHeroPale, uHeroHull, step(3.5, vMat));
  vec3 named = mix(mix(heroLow, heroMid, step(2.5, vMat)), uHeroFunnel, step(4.5, vMat));
  named = mix(named, uTank, step(5.5, vMat));
  named = mix(named, uHeroWhite, step(6.5, vMat));
  named = mix(named, uIsleScreen, step(7.5, vMat));
  named = mix(named, uIslePanel, step(8.5, vMat));
  named = mix(named, uIsleDeck, step(9.5, vMat));
  vec3 albedo = mix(mix(uAlbedoLo, uAlbedoHi, band), named, step(0.5, vMat));

  /* The bake writes 0.62 for a face turned fully away from the sun and 1.17
   * for one square on, so this recovers N.L and the grain rides on it. */
  float grain =
    shoreNoise(vWorld.xz * 0.009) * 0.62 + shoreNoise(vWorld.xz * 0.027) * 0.38;
  float grainFall = 1.0 - smoothstep(3000.0, 9000.0, dist);
  /* Ground grain is a terrain texture. Rock and planting are ground and take
     it; painted concrete, hull plate, a funnel and a tank shell are not, and a
     two-octave world noise across them draws the horizontal banding design doc
     2.3 warned about. Substances 3 to 9 switch it off. Round 1's island deck,
     substance 10, is ground again: roads and well pads under the planting, and
     catalogue 6.6's whole complaint about it was that it read as one field.
     The gate is open-ended upward: 10 AND any future index above it keep the
     grain; a painted substance 11+ must extend the second step. */
  float painted = step(2.5, vMat) * (1.0 - step(9.5, vMat));
  float grainWeight = mix(uGrain.x, uGrain.y, band) * grainFall * (1.0 - painted);
  /* The sun term, and then what the bake found standing in front of it. The
     grain rides inside the multiply rather than outside it, because it varies
     how much light a patch of ground takes and a patch in shadow takes none of
     it: a face the tower beside it has cut off is not a patchy face, it is a
     dark one. */
  float lit =
    clamp((vShade - 0.62) * 1.818 + (grain - 0.5) * grainWeight, 0.0, 1.0) * vOccl.x;

  /* Two lights on a reflectance, which is the whole of the round-4d grade. The
     shipped shader ran one ramp from a near-black SHORE to the horizon sky, so
     every substance in the venue was the same substance at a different
     brightness and a sunlit wharf landed on rgb(25,36,42): grey, and dark. Here
     the sun is warm and the fill is the sky's own hemispherical average, so a
     lit face and a shaded face differ in temperature as well as in value, which
     is what a box needs to read as a box before any texture exists. Because
     both terms are positive multiples of the same albedo, no face can invert
     against the sun direction: illumination is monotonic in lit per channel. */
  /* The ambient is one isotropic fill and its gain was fixed against measured
     sunlit-to-shaded pairs, so the occlusion that scales it is a CONTACT term
     and not a sky view factor: the baker fades a blocker out over 18 m, which
     leaves a wall standing in the open at 1.0 and only darkens what is
     genuinely tucked under something. Measured over the shipped asset the
     means are 0.884 terrain, 0.904 massing, 0.781 port, 0.721 heroes
     (audit-corrected). The median terrain vertex sits at 1.0, so its
     sunlit-to-shaded ratio is exactly round 4d's 3.21, and 76% of terrain,
     52% of massing, 35% of port and 34% of heroes stay inside the measured
     2.6-3.4 band; what falls outside is genuinely occluded structure, which
     the band's open-pair photographs never measured. */
  vec3 land = albedo * (uSunLight * lit + uSkyFill * vOccl.y);

  /* The shore face runs from the sea at y = 0 up to the crest: darken the foot
   * of it the way a wet revetment darkens, and lay one bright line where the
   * water actually breaks against it. Without these the land had no contact
   * with the sea at all and every island read as a plate laid on top of it.
   * Wetting scales reflectance and leaves hue alone, so this multiplies rather
   * than mixing toward black the way the shipped version did. */
  land *= mix(
    1.0,
    ${WET_DARKEN.toFixed(2)},
    1.0 - smoothstep(0.0, ${WET_TOP.toFixed(1)}, vWorld.y)
  );
  float surf =
    smoothstep(-0.6, 0.35, vWorld.y) * (1.0 - smoothstep(0.35, ${SURF_TOP.toFixed(1)}, vWorld.y));
  land = mix(land, uWhitecap, surf * ${SURF_MIX.toFixed(2)});

  float air = uHazeMix * exp(-dist * uHaze) + (1.0 - uHazeMix) * exp(-dist * uHazeFar);
  gl_FragColor = vec4(mix(haze, land, air * vFade), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
);

/* The far horizon curtain: Palos Verdes at 16.7 km, Catalina at 47, the San
 * Gabriels and the Santa Anas at 54 to 77, all of them outside the far plane
 * and none of them able to be mesh at its real range.
 *
 * The bake ray marched them out of the DEM and shipped a profile whose vertices
 * carry a direction from the course origin, a true summit height and a true
 * range from that origin. Those three reconstruct the summit's real world
 * point, so this shader can measure the bearing, the range and the elevation
 * angle from wherever the eye actually is and then draw the result on a shell
 * at a convenient radius. Both of the errors a naive band has come out in the
 * wash: a curtain nailed to a fixed height swings 3.8 degrees between the
 * water-level and the 779 m cameras where Palos Verdes swings 2.7, and a
 * curtain nailed to the camera's own bearing slides the whole skyline along
 * with a 900 m pan where the real ridge swings 3.1 degrees, 57 px.
 *
 * cameraPosition is a uniform three.js already maintains, so this costs nothing
 * per frame on the JavaScript side. What it does cost is the mesh's bounding
 * sphere: the baked positions are unit directions times 1000, so three.js would
 * compute a 1 km sphere at the world origin and cull the whole horizon the
 * moment the camera walked away from it. Hence frustumCulled on the mesh. */
const VenueCurtainMaterial = shaderMaterial(
  {
    uSunDir: sunDirection(),
    uSkyZenith: new Color(SKY_ZENITH),
    uSkyHorizon: new Color(SKY_HORIZON),
    uSunTint: new Color(SUN_TINT),
    uSunDisc: new Color(SUN_DISC),
    uRidgeNear: new Color(VENUE_RIDGE_NEAR),
    uRidgeFar: new Color(VENUE_RIDGE_FAR),
    uHazeLow: new Color(VENUE_HAZE_LOW),
  },
  /* glsl */ `
attribute float aDist;
attribute float aBase;

varying vec3 vDir;
varying float vK;
varying float vRange;
varying float vUp;

void main() {
  /* pos.xz is the unit horizontal direction FROM THE COURSE ORIGIN times 1000,
     aDist the true horizontal range from the origin in 4 m units, and pos.y the
     true summit height above sea level. Together they put the summit back at a
     real world point, and everything below is measured from the eye to that
     point rather than from the eye along the baked direction.

     That is the whole of the parallax fix. Anchoring on the baked direction
     nails the skyline to the camera: pan 900 m across the bearing of the Palos
     Verdes ridge at 16.5 km and the real ridge swings 3.1 degrees, 57 px, while
     a camera-locked band swings none of it and slides with the eye. Recomputing
     the bearing costs one normalize per vertex on 4,252 vertices and nothing
     per frame on the JavaScript side, because cameraPosition is a uniform
     three.js already maintains. */
  vec2 anchor = vec2(position.x, position.z) * (aDist * 4.0 * 0.001);
  vec2 eyeVec = anchor - cameraPosition.xz;
  float D = max(length(eyeVec), 1.0);
  vec3 dir = vec3(eyeVec.x, 0.0, eyeVec.y) / D;
  float fall = D * D / ${(2 * R_EFF).toFixed(1)};
  /* One formula for both ends of the column: the ridge carries the summit
     height, the base carries zero, so the base lands on the sea surface at the
     ridge's own range. The base is then pulled up to just under the computed
     horizon whenever the sea at that range would sit above it, which is every
     camera near the water, and that is what keeps the band from showing a
     skirt below the sea line.

     The clamp has to be a minimum and not a fixed horizon. Once the eye climbs
     over a ridge, a fixed horizon base sits ABOVE the ridge and the band turns
     inside out, painting land across the strip of sea beyond it: at the 779 m
     freeform camera the whole mid band inverts, Palos Verdes included. Taking
     the sea at range instead gives 28 px of ridge at 779 m and 27 px at the
     waterline, which is the pair of figures design doc 1.4 predicts. */
  float sea = (position.y - cameraPosition.y - fall) / D;
  float horizon = -sqrt(2.0 * max(cameraPosition.y, 0.5) / ${R_EFF.toFixed(1)}) - 0.0015;
  /* aBase is a column code, not a flag: bit 0 marks the base vertex, bit 1 the
     far band. Both arrive as exact small integers in a float. */
  float isBase = mod(aBase, 2.0);
  float isFar = step(2.0, aBase);
  float elev = isBase > 0.5 ? min(sea, horizon) : sea;
  float radius = ${R_CURTAIN.toFixed(1)} + isFar * ${R_CURTAIN_BAND.toFixed(1)};
  vec3 world = cameraPosition + dir * radius + vec3(0.0, radius * elev, 0.0);
  vDir = world - cameraPosition;
  vK = clamp(
    ${CURTAIN_K.toFixed(2)} * exp(-D / ${CURTAIN_FALLOFF.toFixed(1)}),
    ${CURTAIN_K_MIN.toFixed(2)},
    ${CURTAIN_K_MAX.toFixed(2)}
  );
  /* Two things the fragment needs and cannot recompute: how far this column
     really is, which decides whether it is still dry hillside or already pure
     distance, and how high up the column this vertex sits, which decides how
     much of the low haze layer the sightline crossed. */
  vRange = smoothstep(
    ${CURTAIN_BLEND_NEAR.toFixed(1)},
    ${CURTAIN_BLEND_FAR.toFixed(1)},
    D
  );
  vUp = 1.0 - isBase;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`,
  /* glsl */ `
varying vec3 vDir;
varying float vK;
varying float vRange;
varying float vUp;
uniform vec3 uRidgeNear;
uniform vec3 uRidgeFar;
uniform vec3 uHazeLow;

${SKY_GLSL}

void main() {
  /* Palos Verdes at 17 km and the San Gabriels at 54 to 90 km are two different
     colours, and painting both of them SKY_ZENITH threw away the strongest
     depth cue the frame has. Both tints are blue with a cyan lean and neither
     is violet: over this basin most of the extinction is aerosol, not Rayleigh,
     so the veil is near-neutral and what separates the two ranges is how much
     of the ridge survives it, not a hue rotation into purple. */
  vec3 tint = mix(uRidgeNear, uRidgeFar, vRange);
  float low = 1.0 - vUp;
  tint = mix(tint, uHazeLow, low * ${CURTAIN_FOOT.toFixed(2)});
  float k = vK * (1.0 - low * ${CURTAIN_FOOT_K.toFixed(2)});
  gl_FragColor = vec4(mix(laylineSky(normalize(vDir), 0.0), tint, k), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
);

extend({
  LaylineVenueShoreMaterial: VenueShoreMaterial,
  LaylineVenueCurtainMaterial: VenueCurtainMaterial,
});

declare module "@react-three/fiber" {
  interface ThreeElements {
    laylineVenueShoreMaterial: ThreeElement<typeof VenueShoreMaterial>;
    laylineVenueCurtainMaterial: ThreeElement<typeof VenueCurtainMaterial>;
  }
}

/**
 * Whether this runtime knows what a layer is made of.
 *
 * The container reserves class ids this build has never seen (6 is vegetation,
 * which the design doc considered and did not build), and an asset newer than
 * the code that reads it will carry one. Falling back to the terrain ramp is
 * the wrong answer twice over: it paints an unknown substance harbour-fill tan,
 * which is precisely the round-4d defect the substance byte exists to fix, and
 * it does so silently, so nobody finds out until a capture looks wrong. Skip
 * the layer and say so instead. The curtain is exempt: it carries its own
 * shader and reads no material table.
 */
function drawable(layer: VenueLayer): boolean {
  if (layer.material === MATERIAL_CURTAIN) return true;
  if (MATERIALS[layer.classId] !== undefined) return true;
  console.warn(
    `venue asset carries layer class ${layer.classId}, which this build has no material for; skipping it`,
  );
  return false;
}

/**
 * The coast a venue race falls back to when its baked asset does not arrive.
 *
 * The procedural arc predates the venue and is still what every race without a
 * baked coast draws, so this is the scene's own fallback rather than a new one:
 * a silhouette of bluffs, terminals and cranes at a fixed seed, one draw, no
 * fetch. It is a scale reference and not San Pedro Bay, which is the honest
 * thing to show when the real coast could not be loaded. Open water would read
 * as a deliberate choice; this reads as a coast.
 */
export function FallbackShore() {
  const geometry = useMemo(shorelineGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  /* The frame request runs AFTER this mesh is committed, so the drawn frame it
   * schedules is guaranteed to contain the arc; the one in the fetch's catch
   * can race the React commit and draw a frame without it. */
  useEffect(() => {
    requestSceneFrame();
  }, []);
  const markFallbackDrawn = useCallback(() => {
    const state = useReplay.getState();
    if (state.venueAsset === "failed") state.setVenueAsset("fallback");
    tellMaskVenueDrawn(true);
  }, []);
  return (
    <mesh geometry={geometry} frustumCulled={false} onAfterRender={markFallbackDrawn}>
      <laylineShoreMaterial side={DoubleSide} />
    </mesh>
  );
}

/**
 * The venue's real coast: static meshes baked offline from OpenStreetMap and
 * Terrarium elevation, drawn with the same flat-colour-into-haze material as
 * the procedural shore they replace. One draw call per semantic layer, five
 * today (horizon curtain, terrain, urban massing, port infrastructure, hero
 * landmarks), nothing per frame: the geometry is immutable and every uniform is
 * set once at mount.
 * The curtain reads `cameraPosition`, which three.js already maintains.
 *
 * The fetch is the one asynchronous thing in the scene, so its arrival has to
 * go through the gate: a paused replay draws nothing on its own, and a coast
 * that landed without requestSceneFrame would wait for the next interaction
 * to appear.
 */
export function VenueShore({ asset }: { asset: string }) {
  const [layers, setLayers] = useState<VenueLayer[] | null>(null);
  const status = useReplay((state) => state.venueAsset);
  const inFrame = useReplay((state) => state.venueInFrame);
  /* One transition per load, and it belongs to the load that asked for it: a
   * ref rather than a read of `status`, so a race switch back to the same asset
   * cannot inherit the previous mesh's answer. */
  const drawn = useRef(false);

  useEffect(() => {
    /* The abort is what keeps a slow fetch from installing over a newer venue.
     * The store is one per document and both loads write to it, so a Long Beach
     * request still in flight when the viewer switches races would otherwise
     * report ITS outcome for whatever venue is on screen by then, and hand its
     * mesh to a scene that has moved on. Aborting on cleanup ends that fetch and
     * every store write below is gated on the same signal. */
    const controller = new AbortController();
    let loaded: VenueLayer[] | null = null;
    drawn.current = false;
    tellMaskVenueDrawn(false);
    /* The capture contract: ready excludes loading states, and this fetch is
     * the scene's one load. `rendered` is raised by the mesh itself, on its
     * first drawn frame; nothing here can raise it, because a parsed asset is
     * not yet a picture. */
    useReplay.getState().setVenueAsset("loading");
    (async () => {
      const response = await fetch(asset, { signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      /* The asset is stored gzipped so the repo and the wire both stay small.
       * If a CDN layer ever transparently decodes it, the magic is already
       * plain in the first word and the stream step is skipped. */
      let buffer = await response.arrayBuffer();
      const head = new Uint8Array(buffer, 0, 2);
      if (head[0] === 0x1f && head[1] === 0x8b) {
        buffer = await new Response(
          new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer();
      }
      if (controller.signal.aborted) return;
      /* one mark pair per load, read back by the audit battery; the parse is a
       * once-per-race cost and this is the only way to see it from outside */
      performance.mark("layline-venue-parse-start");
      loaded = parseVenueMesh(buffer);
      performance.mark("layline-venue-parse-end");
      performance.measure(
        "layline-venue-parse",
        "layline-venue-parse-start",
        "layline-venue-parse-end",
      );
      if (controller.signal.aborted) return;
      setLayers(loaded.filter(drawable));
      requestSceneFrame();
    })().catch((error) => {
      /* An abort is this component's own cleanup, not a failure: the venue it
       * was fetching is not the venue on screen any more. */
      if (controller.signal.aborted) return;
      /* A failed coast is not a broken scene, but it is not a finished one
       * either: the procedural arc below goes up in its place, which is what
       * every venue without a baked asset already draws. */
      console.warn("venue shore failed to load", error);
      useReplay.getState().setVenueAsset("failed");
      /* A paused replay draws nothing on its own; without this the fallback
       * arc would wait for the next interaction while ready stayed down. */
      requestSceneFrame();
    });
    return () => {
      controller.abort();
      for (const layer of loaded ?? []) layer.geometry.dispose();
      setLayers(null);
      useReplay.getState().setVenueAsset("absent");
      tellMaskVenueDrawn(false);
    };
  }, [asset]);

  /* The layer meshes can (re)mount on a frozen page: the capture lens forces
   * `venueInFrame` true DURING a drawn frame (a settled tactical rig had set it
   * false), React commits the remount after that frame, and a `never` frameloop
   * schedules nothing on its own. Without this post-commit request the first
   * frame reported after `lens()` is coastless even though the readback is
   * correct. Also covers the initial mount, where it is a harmless duplicate of
   * the fetch's own request. */
  useEffect(() => {
    if (layers === null || !inFrame) return;
    requestSceneFrame();
  }, [layers, inFrame]);

  /* Nothing left to wait for in the one case where no venue frame will ever be
   * drawn: the rig is holding the coast out of the scene on purpose. Without
   * this, `ready` would sit at `loading` forever on a page that opened tactical.
   */
  useEffect(() => {
    if (layers === null || inFrame || drawn.current) return;
    drawn.current = true;
    useReplay.getState().setVenueAsset("rendered");
    tellMaskVenueDrawn(true);
  }, [layers, inFrame]);

  const markDrawn = useCallback(() => {
    if (drawn.current) return;
    drawn.current = true;
    useReplay.getState().setVenueAsset("rendered");
    tellMaskVenueDrawn(true);
  }, []);

  if (status === "failed" || status === "fallback") return <FallbackShore />;
  /* The settled tactical rig sees 250 m of water from 160 m up and the nearest
   * real land is 715 m away, so its five venue draws are pure cost (design doc
   * 2.1). Unmounting rather than hiding: a hidden mesh still costs the render
   * list a visit, and this only ever changes when a rig hand-over lands. */
  if (layers === null || !inFrame) return null;
  const last = layers[layers.length - 1];
  return (
    <>
      {layers.map((layer) => (
        /* renderOrder, not sort order: the layer table's drawOrder is what puts
         * the curtain behind everything real, and three.js otherwise sorts
         * opaque meshes by a bounding sphere the curtain's shader ignores.
         * frustumCulled is off for the same reason it is off on the sky dome:
         * the vertex shader, not the object transform, decides where these
         * vertices land. */
        <mesh
          key={layer.classId}
          geometry={layer.geometry}
          renderOrder={layer.drawOrder}
          frustumCulled={false}
          /* The one handle a capture has on a single semantic class: the
             inspection mask (`__layline.show({venueLayers})`, dev only)
             matches this name and writes visibility onto the mesh. */
          name={`${VENUE_LAYER_PREFIX}${layer.classId}`}
          /* The last layer in draw order, so `rendered` means every venue layer
             has been through the pipe, not just the first one. A fetched asset
             that never draws is exactly the state `ready` must not promise. */
          onAfterRender={layer === last ? markDrawn : undefined}
        >
          {layer.material === MATERIAL_CURTAIN ? (
            <laylineVenueCurtainMaterial side={DoubleSide} />
          ) : (
            /* One material per semantic class, from the table above. Every
               value is a module-level object, so a re-render hands three.js the
               same references it already holds and nothing is allocated. */
            <laylineVenueShoreMaterial
              side={DoubleSide}
              uAlbedoLo={MATERIALS[layer.classId].lo}
              uAlbedoHi={MATERIALS[layer.classId].hi}
              uRamp={MATERIALS[layer.classId].ramp}
              uGrain={MATERIALS[layer.classId].grain}
            />
          )}
        </mesh>
      ))}
    </>
  );
}
