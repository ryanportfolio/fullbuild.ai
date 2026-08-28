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
  sunDirection,
} from "./sky";

/* Real-coastline venues carry more sky between the camera and the far hills
 * than the 1.8 km procedural arc ever did, and at the water's own haze density
 * a ridge 8 km out keeps 9 percent of its colour, which is not land. This rho
 * hands the 2.5 km breakwater 69 percent and the 8 km ridge 30, so near coast
 * reads dark and far coast reads air, in that order. */
const VENUE_HAZE = 0.00015;

const MAGIC = 0x324e564c; // "LVN2"

/* The procedural arc's shore material plus one thing: baked hillshade. The
 * arc is only ever seen edge-on from the water, where a silhouette needs no
 * form; the venue mesh is real terrain under a freeform camera that can climb,
 * and unlit flat colour reads as floating cardboard from up there. The shade
 * channel is a bake-time lambert against the scene's one sun, so the lit and
 * shaded sides of a ridge agree with the glint on the water. 128 encodes the
 * flat colour; the 255/128 factor turns the normalised byte back into that
 * scale. */
const VenueShoreMaterial = shaderMaterial(
  {
    uSunDir: sunDirection(),
    uSkyZenith: new Color(SKY_ZENITH),
    uSkyHorizon: new Color(SKY_HORIZON),
    uSunTint: new Color(SUN_TINT),
    uSunDisc: new Color(SUN_DISC),
    uShore: new Color(SHORE),
    uHaze: VENUE_HAZE,
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
uniform float uHaze;

${SKY_GLSL}

void main() {
  vec3 toEye = vWorld - cameraPosition;
  vec3 haze = laylineSky(normalize(toEye), 0.0);
  gl_FragColor = vec4(mix(haze, uShore * vShade, exp(-length(toEye) * uHaze) * vFade), 1.0);
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
