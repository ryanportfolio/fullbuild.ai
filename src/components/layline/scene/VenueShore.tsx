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
 * R_CURTAIN is where the band is drawn: the terrain is clipped at 10,500 m and
 * the camera never leaves a 900 m circle, so nothing real is ever more than
 * 11,400 m from the eye and the curtain sits behind all of it while staying
 * inside the 12,000 m far plane. The 120 m ramp with true range is what keeps
 * the two bands off each other: they cover the same azimuths over the San
 * Gabriels, and at one shared radius they are coplanar and z-fight. Ramping the
 * radius orders them by real distance instead, and because the whole vertex
 * scales about the camera, it moves depth without moving a single pixel.
 *
 * R_EFF is the 7/6 Earth radius under standard refraction: the same constant
 * the bake took the curvature drop out with, so the two cannot disagree. */
const R_CURTAIN = 11780;
const R_CURTAIN_RAMP = 120;
const R_CURTAIN_SPAN = 90000; // the march's 90 km cut-off
const R_EFF = 7432833;

/* Extinction toward the zenith. Distant land does not go grey, it goes the
 * colour of the air between it and the eye, which in this palette is
 * SKY_ZENITH: 0.35 at the mid band's 10.5 km inner edge, 0.14 at Mount Wilson
 * 54 km out, 0.086 at Baldy at 77 km. That ordering, near ridge darker than far
 * ridge, is the whole of what makes the distance legible. The 0.36 ceiling is a
 * guard against a later retune running away, not an active limit. */
const CURTAIN_K = 0.44;
const CURTAIN_FALLOFF = 47000;
const CURTAIN_K_MIN = 0.05;
const CURTAIN_K_MAX = 0.36;

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

/* The far horizon curtain: Palos Verdes at 16.7 km, Catalina at 47, the San
 * Gabriels and the Santa Anas at 54 to 77, all of them outside the 12,000 m far
 * plane and none of them able to be mesh at its real range.
 *
 * The bake ray marched them out of the DEM and shipped a profile whose vertices
 * carry a unit direction, a true summit height and a true range. This shader
 * puts each vertex back at a fixed radius around the camera and recomputes its
 * elevation angle from those true numbers, so the band swings by exactly what
 * the real ridge would as the camera climbs. A curtain nailed to a fixed height
 * would swing 3.8 degrees between the water-level and the 779 m cameras where
 * Palos Verdes swings 2.7, and that 1.1 degree error is 21 px on a 28 px ridge.
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
  },
  /* glsl */ `
attribute float aDist;
attribute float aBase;

varying vec3 vDir;
varying float vK;

void main() {
  /* pos.xz is the unit horizontal direction times 1000; pos.y is the true
     summit height above sea level, already dequantised to metres. */
  vec3 dir = vec3(position.x, 0.0, position.z) * 0.001;
  float D = aDist * 4.0;  // aDist ships as an unnormalised Int16 in 4 m units
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
  float sea = (position.y - cameraPosition.y - fall) / max(D, 1.0);
  float horizon = -sqrt(2.0 * max(cameraPosition.y, 0.5) / ${R_EFF.toFixed(1)}) - 0.0015;
  float elev = aBase > 0.5 ? min(sea, horizon) : sea;
  float radius = ${R_CURTAIN.toFixed(1)} +
    clamp(D / ${R_CURTAIN_SPAN.toFixed(1)}, 0.0, 1.0) * ${R_CURTAIN_RAMP.toFixed(1)};
  vec3 world = cameraPosition + dir * radius + vec3(0.0, radius * elev, 0.0);
  vDir = world - cameraPosition;
  vK = clamp(
    ${CURTAIN_K.toFixed(2)} * exp(-D / ${CURTAIN_FALLOFF.toFixed(1)}),
    ${CURTAIN_K_MIN.toFixed(2)},
    ${CURTAIN_K_MAX.toFixed(2)}
  );
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`,
  /* glsl */ `
varying vec3 vDir;
varying float vK;

${SKY_GLSL}

void main() {
  gl_FragColor = vec4(mix(laylineSky(normalize(vDir), 0.0), uSkyZenith, vK), 1.0);
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
            <laylineVenueShoreMaterial
              side={DoubleSide}
              uGrain={layer.classId === CLASS_TERRAIN ? GRAIN : 0}
            />
          )}
        </mesh>
      ))}
    </>
  );
}
