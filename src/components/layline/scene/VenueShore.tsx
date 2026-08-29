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

const MAGIC_LVN2 = 0x324e564c; // "LVN2", the single-layer asset round 2 shipped
const MAGIC_LVN3 = 0x334e564c; // "LVN3", the layered container

/* Layer class ids, from the baker's layer table. Only the terrain layer wants
 * the ground grain: the two-octave world noise is a terrain texture, and on a
 * 120 m tower or a crane leg it draws horizontal bands that read as an
 * artifact (design doc 2.3). One uniform per layer turns it off, which is
 * cheaper than the spare attribute bit the doc offered as the alternative and
 * costs nothing per frame. */
const CLASS_TERRAIN = 1;

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

type VenueLayer = { classId: number; drawOrder: number; geometry: BufferGeometry };

/** One layer's body, in the byte order the LVN2 asset already shipped:
 * quantised world-frame positions, the aFade channel the shore shader takes,
 * a hillshade byte per vertex, then an index. Positions are Int16 metres
 * (y in `yUnit` steps) so the wire stays small; dequantised here once, at
 * load. */
function parseLayer(
  buffer: ArrayBuffer,
  vertAt: number,
  indexAt: number,
  vertCount: number,
  indexCount: number,
  yUnit: number,
  wideIndex: boolean,
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
  const fades = new Uint8Array(buffer, at, vertCount);
  at += vertCount;
  const shadesChannel = new Uint8Array(buffer, at, vertCount);
  const indices = wideIndex
    ? new Uint32Array(buffer, indexAt, indexCount)
    : new Uint16Array(buffer, indexAt, indexCount);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aFade", new BufferAttribute(fades.slice(), 1, true));
  geometry.setAttribute("aShade", new BufferAttribute(shadesChannel.slice(), 1, true));
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
        drawOrder: 10,
        geometry: parseLayer(
          buffer,
          16,
          channels + ((4 - (channels % 4)) % 4),
          vertCount,
          view.getUint32(8, true),
          10,
          (view.getUint32(12, true) & 1) === 1,
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
      drawOrder: view.getUint8(record + 3),
      geometry: parseLayer(
        buffer,
        bodyOffset + view.getUint32(record + 16, true),
        bodyOffset + view.getUint32(record + 20, true),
        view.getUint32(record + 8, true),
        view.getUint32(record + 12, true),
        view.getUint8(record + 5),
        view.getUint8(record + 6) === 1,
      ),
    });
  }
  return layers.sort((a, b) => a.drawOrder - b.drawOrder);
}

/**
 * The venue's real coast: static meshes baked offline from OpenStreetMap and
 * Terrarium elevation, drawn with the same flat-colour-into-haze material as
 * the procedural shore they replace. One draw call per semantic layer, three
 * today (terrain, urban massing, port infrastructure), nothing per frame: the
 * geometry is immutable and every uniform is set once at mount.
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
        <mesh key={layer.classId} geometry={layer.geometry} frustumCulled={false}>
          <laylineVenueShoreMaterial
            side={DoubleSide}
            uGrain={layer.classId === CLASS_TERRAIN ? GRAIN : 0}
          />
        </mesh>
      ))}
    </>
  );
}
