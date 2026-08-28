"use client";

import { useEffect, useState } from "react";
import { shaderMaterial } from "@react-three/drei";
import { extend, type ThreeElement } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from "three";
import { useReplay } from "../store";
import { requestSceneFrame } from "./gate";
import {
  SHORE,
  SKY_GLSL,
  SKY_HORIZON,
  SKY_ZENITH,
  SUN_DISC,
  SUN_TINT,
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
const HAZE_NEAR_WEIGHT = 0.15;
const HAZE_NEAR = 1 / 600;
const HAZE_FAR = 1 / 9000;

/* How far a fully sunlit face is carried toward the horizon colour.
 *
 * SHORE is 2 per cent of the sky's luminance, so once haze owns half a fragment
 * the land term is a few per cent of what reaches the eye, and multiplying it
 * by a hillshade changes nothing that survives quantisation: that is why
 * round0's baked shade channel was invisible on screen and every landform read
 * as one facet, 96 to 100 across a whole island. Shading has to move the same
 * axis haze moves. */
const LIT_GAIN = 0.3;

/* Where the shaded end of that ramp sits, as a fraction of SHORE. Lifting the
 * sunlit end alone would wash the whole coast out; dropping the shaded end at
 * the same time spends the gain on range instead of brightness. */
const SHORE_FLOOR = 0.3;

/* Peak-to-peak of the ground grain, in the same 0..1 units as the hillshade.
 * Measured on the mole in ff-mid-2, 5th to 95th percentile of luminance across
 * its deck: round0 96..100, this 115..132. */
const GRAIN = 1.2;

/* Waterline, in metres of world y. The bake puts the shore crest at 6 m and
 * every land surface at or above it, so a band keyed on height alone can only
 * ever touch the batter face between the crest and the sea. */
const SURF_TOP = 1.7;
const WET_TOP = 4.2;

const MAGIC = 0x324e564c; // "LVN2"

/* The procedural arc is only ever seen edge-on from the water, where a
 * silhouette needs no form. The venue mesh is real terrain under a freeform
 * camera that can climb, so this material carries three things the arc's did
 * not: a hillshade ramp that survives haze, a ground grain, and a waterline.
 *
 * aShade is a bake-time lambert against the scene's one sun, so the lit and
 * shaded sides of a ridge agree with the glint on the water. 128 encodes a
 * face pointing straight up; the 255/128 factor turns the normalised byte back
 * into that scale, where 0.62 is fully shadowed and 1.17 fully sunlit. */
const VenueShoreMaterial = shaderMaterial(
  {
    uSunDir: sunDirection(),
    uSkyZenith: new Color(SKY_ZENITH),
    uSkyHorizon: new Color(SKY_HORIZON),
    uSunTint: new Color(SUN_TINT),
    uSunDisc: new Color(SUN_DISC),
    uShore: new Color(SHORE),
    uWhitecap: new Color(WHITECAP),
    uHaze: HAZE_NEAR,
    uHazeFar: HAZE_FAR,
    uHazeMix: HAZE_NEAR_WEIGHT,
    uLitGain: LIT_GAIN,
    uShoreFloor: SHORE_FLOOR,
    uGrain: GRAIN,
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
uniform vec3 uShore;
uniform vec3 uWhitecap;
uniform float uHaze;
uniform float uHazeFar;
uniform float uHazeMix;
uniform float uLitGain;
uniform float uShoreFloor;
uniform float uGrain;

${SKY_GLSL}

/* Ground value texture, two octaves of value noise on world xz at 111 m and
 * 37 m. The mesh cannot carry this: flat land is sealed by one earcut cap whose
 * only vertices are on the shoreline, so a per-vertex channel would interpolate
 * a 250 m island as a single value however finely the hills behind it are
 * tessellated. This rides the baked hillshade instead, and stays inside the
 * palette for the same reason the hillshade does: it only moves a fragment
 * along the SHORE-to-horizon ramp. Faded out between 3 and 9 km, where the
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

  /* The bake writes 0.62 for a face turned fully away from the sun and 1.17
   * for one square on; remap that to 0..1 and let the grain ride on it. */
  float grain =
    shoreNoise(vWorld.xz * 0.009) * 0.62 + shoreNoise(vWorld.xz * 0.027) * 0.38;
  float grainFall = 1.0 - smoothstep(3000.0, 9000.0, dist);
  float lit = clamp((vShade - 0.62) * 1.818 + (grain - 0.5) * uGrain * grainFall, 0.0, 1.0);
  /* Gamma, not gain, decides where the ramp's midpoint sits. A flat cap faces
   * straight up and lands at 0.38 of the ramp; left linear, the gain needed to
   * separate a sunlit slope from a shaded one also drags every horizontal
   * surface in the venue halfway to the sky and the near coast loses the weight
   * that made it read against the water. Bending the ramp keeps the full range
   * for the slopes and puts the flats back down near SHORE. */
  vec3 land = mix(uShore * uShoreFloor, uSkyHorizon, pow(lit, 1.8) * uLitGain);

  /* The shore face runs from the sea at y = 0 up to the crest: darken the foot
   * of it the way a wet revetment darkens, and lay one bright line where the
   * water actually breaks against it. Without these the land had no contact
   * with the sea at all and every island read as a plate laid on top of it. */
  land = mix(
    land,
    uShore * uShoreFloor * 0.8,
    0.55 * (1.0 - smoothstep(0.0, ${WET_TOP.toFixed(1)}, vWorld.y))
  );
  float surf =
    smoothstep(-0.6, 0.35, vWorld.y) * (1.0 - smoothstep(0.35, ${SURF_TOP.toFixed(1)}, vWorld.y));
  land = mix(land, uWhitecap, surf * 0.55);

  float air = uHazeMix * exp(-dist * uHaze) + (1.0 - uHazeMix) * exp(-dist * uHazeFar);
  gl_FragColor = vec4(mix(haze, land, air * vFade), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
);

extend({ LaylineVenueShoreMaterial: VenueShoreMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    laylineVenueShoreMaterial: ThreeElement<typeof VenueShoreMaterial>;
  }
}

/** Parse the LVN2 buffer `scripts/layline-bake-venue.mjs` writes: quantised
 * world-frame positions, the aFade channel the shore shader already takes,
 * a hillshade byte per vertex, and an index. Positions are Int16 metres
 * (y in 0.1 m) so the wire stays small; dequantised here once, at load. */
function parseVenueMesh(buffer: ArrayBuffer): BufferGeometry {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("not a LVN2 mesh");
  const vertCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const wideIndex = (view.getUint32(12, true) & 1) === 1;
  let at = 16;
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3] = view.getInt16(at, true);
    positions[i * 3 + 1] = view.getInt16(at + 2, true) * 0.1;
    positions[i * 3 + 2] = view.getInt16(at + 4, true);
    at += 6;
  }
  const fades = new Uint8Array(buffer, at, vertCount);
  at += vertCount;
  const shadesChannel = new Uint8Array(buffer, at, vertCount);
  at += vertCount;
  at += (4 - (at % 4)) % 4;
  const indices = wideIndex
    ? new Uint32Array(buffer, at, indexCount)
    : new Uint16Array(buffer, at, indexCount);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aFade", new BufferAttribute(fades.slice(), 1, true));
  geometry.setAttribute("aShade", new BufferAttribute(shadesChannel.slice(), 1, true));
  geometry.setIndex(new BufferAttribute(indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The venue's real coast: one static mesh baked offline from OpenStreetMap
 * and Terrarium elevation, drawn with the same flat-colour-into-haze material
 * as the procedural shore it replaces. One draw call, nothing per frame.
 *
 * The fetch is the one asynchronous thing in the scene, so its arrival has to
 * go through the gate: a paused replay draws nothing on its own, and a coast
 * that landed without requestSceneFrame would wait for the next interaction
 * to appear.
 */
export function VenueShore({ asset }: { asset: string }) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    let live = true;
    let loaded: BufferGeometry | null = null;
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
      loaded = parseVenueMesh(buffer);
      setGeometry(loaded);
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
      loaded?.dispose();
      setGeometry(null);
      useReplay.getState().setSceneryOk(true);
    };
  }, [asset]);

  if (geometry === null) return null;
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <laylineVenueShoreMaterial side={DoubleSide} />
    </mesh>
  );
}
