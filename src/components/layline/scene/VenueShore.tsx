"use client";

import { useEffect, useState } from "react";
import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Vector2 } from "three";
import { useReplay } from "../store";
import { requestSceneFrame } from "./gate";
import {
  SKY_GLSL,
  SKY_HORIZON,
  SKY_ZENITH,
  SUN_DISC,
  SUN_TINT,
  VENUE_APRON,
  VENUE_BLOCK,
  VENUE_HAZE_LOW,
  VENUE_RIDGE_FAR,
  VENUE_RIDGE_NEAR,
  VENUE_SCRUB,
  VENUE_SKY_FILL,
  VENUE_STEEL,
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
 * The far constant is measured rather than tuned. The clear-day transmittance
 * table in .tmp/venue-audit/round4d/research.md reads 0.36 at 13 km and 0.015
 * at 54 km over this basin, and both solve to the same extinction, 1/12,700 to
 * 1/12,900. Koschmieder puts that at a 50 km meteorological visual range, which
 * is the day the far band's own inventory assumes: Mount Wilson at 54 km and
 * Baldy at 76 km are in it, and neither is visible on the 35 km day 1/9,000
 * describes.
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

const MAGIC_LVN2 = 0x324e564c; // "LVN2", the single-layer asset round 2 shipped
const MAGIC_LVN3 = 0x334e564c; // "LVN3", the layered container

/* Layer class ids, from the baker's layer table. */
const CLASS_TERRAIN = 1;
const CLASS_MASSING = 2;
const CLASS_PORT = 3;

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
 * The one substance this cannot separate is the tank farm: storage tanks are
 * 6 to 25 m and share that band with the container blocks, so they take the
 * yard's colour instead of white. Separating them needs a per-vertex material
 * byte and a rebake; round 4d chose not to spend that. */
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
};
const MATERIAL_FALLBACK = MATERIALS[CLASS_TERRAIN];

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

/* Which shader a layer's `material` byte asks for. */
const MATERIAL_SHORE = 0;
const MATERIAL_CURTAIN = 1;

/* Channel bits in a layer's attrMask, in the order the body lays them out. */
const ATTR_FADE = 1;
const ATTR_SHADE = 2;
const ATTR_DIST = 4;
const ATTR_BASE = 8;

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
 * geometry says so. */
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
    uHaze: HAZE_NEAR,
    uHazeFar: HAZE_FAR,
    uHazeMix: HAZE_NEAR_WEIGHT,
  },
  /* glsl */ `
attribute float aFade;
attribute float aShade;

varying vec3 vWorld;
varying float vFade;
varying float vShade;

void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vFade = aFade;
  vShade = aShade * 1.9921875;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`,
  /* glsl */ `
varying vec3 vWorld;
varying float vFade;
varying float vShade;
uniform vec3 uWhitecap;
uniform vec3 uSunLight;
uniform vec3 uSkyFill;
uniform vec3 uAlbedoLo;
uniform vec3 uAlbedoHi;
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

  /* Which substance this fragment is, inside a layer that is one draw call:
     the terrain runs harbour fill to hillside, the port runs container yard to
     gantry steel, and world height is the only separator the asset carries. */
  float band = smoothstep(uRamp.x, uRamp.y, vWorld.y);
  vec3 albedo = mix(uAlbedoLo, uAlbedoHi, band);

  /* The bake writes 0.62 for a face turned fully away from the sun and 1.17
   * for one square on, so this recovers N.L and the grain rides on it. */
  float grain =
    shoreNoise(vWorld.xz * 0.009) * 0.62 + shoreNoise(vWorld.xz * 0.027) * 0.38;
  float grainFall = 1.0 - smoothstep(3000.0, 9000.0, dist);
  float grainWeight = mix(uGrain.x, uGrain.y, band) * grainFall;
  float lit = clamp((vShade - 0.62) * 1.818 + (grain - 0.5) * grainWeight, 0.0, 1.0);

  /* Two lights on a reflectance, which is the whole of the round-4d grade. The
     shipped shader ran one ramp from a near-black SHORE to the horizon sky, so
     every substance in the venue was the same substance at a different
     brightness and a sunlit wharf landed on rgb(25,36,42): grey, and dark. Here
     the sun is warm and the fill is the sky's own hemispherical average, so a
     lit face and a shaded face differ in temperature as well as in value, which
     is what a box needs to read as a box before any texture exists. Because
     both terms are positive multiples of the same albedo, no face can invert
     against the sun direction: illumination is monotonic in lit per channel. */
  vec3 land = albedo * (uSunLight * lit + uSkyFill);

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

type VenueLayer = {
  classId: number;
  material: number;
  drawOrder: number;
  geometry: BufferGeometry;
};

/** One layer's body, in the byte order the LVN2 asset already shipped:
 * quantised world-frame positions, then whichever of the four channels the
 * layer's `attrMask` claims, then an index. Positions are Int16 metres
 * (y in `yUnit` steps) so the wire stays small; dequantised here once, at
 * load. The curtain reads its position slots as a direction and a summit
 * height instead, which is what its `material` byte tells the runtime. */
function parseLayer(
  buffer: ArrayBuffer,
  vertAt: number,
  indexAt: number,
  vertCount: number,
  indexCount: number,
  yUnit: number,
  wideIndex: boolean,
  attrMask: number,
): BufferGeometry {
  const view = new DataView(buffer);
  const positions = new Float32Array(vertCount * 3);
  let at = vertAt;
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3] = view.getInt16(at, true);
    positions[i * 3 + 1] = view.getInt16(at + 2, true) / yUnit;
    positions[i * 3 + 2] = view.getInt16(at + 4, true);
    at += 6;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  if (attrMask & ATTR_FADE) {
    geometry.setAttribute("aFade", new BufferAttribute(new Uint8Array(buffer, at, vertCount).slice(), 1, true));
    at += vertCount;
  }
  if (attrMask & ATTR_SHADE) {
    geometry.setAttribute("aShade", new BufferAttribute(new Uint8Array(buffer, at, vertCount).slice(), 1, true));
    at += vertCount;
  }
  if (attrMask & ATTR_DIST) {
    /* unnormalised: the shader wants the count of 4 m steps, not a fraction */
    const dists = new Int16Array(vertCount);
    for (let i = 0; i < vertCount; i++) dists[i] = view.getInt16(at + i * 2, true);
    geometry.setAttribute("aDist", new BufferAttribute(dists, 1));
    at += vertCount * 2;
  }
  if (attrMask & ATTR_BASE) {
    geometry.setAttribute("aBase", new BufferAttribute(new Uint8Array(buffer, at, vertCount).slice(), 1));
    at += vertCount;
  }
  const indices = wideIndex
    ? new Uint32Array(buffer, indexAt, indexCount)
    : new Uint16Array(buffer, indexAt, indexCount);
  geometry.setIndex(new BufferAttribute(indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Parse what `scripts/layline-bake-venue.mjs` writes. LVN3 carries a layer
 * table, one semantic class per entry, so each class can take its own material
 * and its own draw. LVN2, the single-layer asset round 2 shipped, is read as
 * one terrain layer; keeping that branch is what lets a fallback asset stay
 * usable. */
function parseVenueMesh(buffer: ArrayBuffer): VenueLayer[] {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic === MAGIC_LVN2) {
    const vertCount = view.getUint32(4, true);
    const channels = 16 + vertCount * 8; // header + pos + fade + shade
    return [
      {
        classId: CLASS_TERRAIN,
        material: MATERIAL_SHORE,
        drawOrder: 10,
        geometry: parseLayer(
          buffer,
          16,
          channels + ((4 - (channels % 4)) % 4),
          vertCount,
          view.getUint32(8, true),
          10,
          (view.getUint32(12, true) & 1) === 1,
          ATTR_FADE | ATTR_SHADE,
        ),
      },
    ];
  }
  if (magic !== MAGIC_LVN3) throw new Error("not a LVN2 or LVN3 mesh");
  const layerCount = view.getUint32(4, true);
  const bodyOffset = view.getUint32(12, true);
  const layers: VenueLayer[] = [];
  for (let i = 0; i < layerCount; i++) {
    const record = 16 + i * 24;
    layers.push({
      classId: view.getUint16(record, true),
      material: view.getUint8(record + 2),
      drawOrder: view.getUint8(record + 3),
      geometry: parseLayer(
        buffer,
        bodyOffset + view.getUint32(record + 16, true),
        bodyOffset + view.getUint32(record + 20, true),
        view.getUint32(record + 8, true),
        view.getUint32(record + 12, true),
        view.getUint8(record + 5),
        view.getUint8(record + 6) === 1,
        view.getUint8(record + 4),
      ),
    });
  }
  return layers.sort((a, b) => a.drawOrder - b.drawOrder);
}

/**
 * The venue's real coast: static meshes baked offline from OpenStreetMap and
 * Terrarium elevation, drawn with the same flat-colour-into-haze material as
 * the procedural shore they replace. One draw call per semantic layer, four
 * today (horizon curtain, terrain, urban massing, port infrastructure), nothing
 * per frame: the geometry is immutable and every uniform is set once at mount.
 * The curtain reads `cameraPosition`, which three.js already maintains.
 *
 * The fetch is the one asynchronous thing in the scene, so its arrival has to
 * go through the gate: a paused replay draws nothing on its own, and a coast
 * that landed without requestSceneFrame would wait for the next interaction
 * to appear.
 */
export function VenueShore({ asset }: { asset: string }) {
  const [layers, setLayers] = useState<VenueLayer[] | null>(null);

  useEffect(() => {
    let live = true;
    let loaded: VenueLayer[] | null = null;
    /* The capture contract: ready excludes loading states, and this fetch is
     * the scene's one load. Down before the first frame can be drawn, up when
     * the coast is in or the fetch has failed, and up again on unmount so the
     * next race never inherits a lowered flag. */
    useReplay.getState().setSceneryOk(false);
    (async () => {
      const response = await fetch(asset);
      if (!response.ok) return;
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
      if (!live) return;
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
      setLayers(loaded);
      requestSceneFrame();
    })()
      .catch((error) => {
        /* No coast is a working scene: the sky and the water hold the horizon,
         * which is exactly what the venues without baked assets already show. */
        console.warn("venue shore failed to load", error);
      })
      .finally(() => {
        if (live) useReplay.getState().setSceneryOk(true);
      });
    return () => {
      live = false;
      for (const layer of loaded ?? []) layer.geometry.dispose();
      setLayers(null);
      useReplay.getState().setSceneryOk(true);
    };
  }, [asset]);

  if (layers === null) return null;
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
        >
          {layer.material === MATERIAL_CURTAIN ? (
            <laylineVenueCurtainMaterial side={DoubleSide} />
          ) : (
            /* One material per semantic class, from the table above. Every
               value is a module-level object, so a re-render hands three.js the
               same references it already holds and nothing is allocated. */
            <laylineVenueShoreMaterial
              side={DoubleSide}
              uAlbedoLo={(MATERIALS[layer.classId] ?? MATERIAL_FALLBACK).lo}
              uAlbedoHi={(MATERIALS[layer.classId] ?? MATERIAL_FALLBACK).hi}
              uRamp={(MATERIALS[layer.classId] ?? MATERIAL_FALLBACK).ramp}
              uGrain={(MATERIALS[layer.classId] ?? MATERIAL_FALLBACK).grain}
            />
          )}
        </mesh>
      ))}
    </>
  );
}
