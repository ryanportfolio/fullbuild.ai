"use client";

import { useEffect, useState } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { requestSceneFrame } from "./gate";

/* Real-coastline venues carry more sky between the camera and the far hills
 * than the 1.8 km procedural arc ever did, and at the water's own haze density
 * a ridge 8 km out keeps 9 percent of its colour, which is not land. This rho
 * hands the 2.5 km breakwater 69 percent and the 8 km ridge 30, so near coast
 * reads dark and far coast reads air, in that order. */
const VENUE_HAZE = 0.00015;

const MAGIC = 0x314e564c; // "LVN1"

/** Parse the LVN1 buffer `scripts/layline-bake-venue.mjs` writes: quantised
 * world-frame positions, the aFade channel the shore shader already takes,
 * and an index. Positions are Int16 metres (y in 0.1 m) so the wire stays
 * small; dequantised here once, at load. */
function parseVenueMesh(buffer: ArrayBuffer): BufferGeometry {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("not a LVN1 mesh");
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
  at += (4 - (at % 4)) % 4;
  const indices = wideIndex
    ? new Uint32Array(buffer, at, indexCount)
    : new Uint16Array(buffer, at, indexCount);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aFade", new BufferAttribute(fades.slice(), 1, true));
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
    })().catch((error) => {
      /* No coast is a working scene: the sky and the water hold the horizon,
       * which is exactly what the venues without baked assets already show. */
      console.warn("venue shore failed to load", error);
    });
    return () => {
      live = false;
      loaded?.dispose();
      setGeometry(null);
    };
  }, [asset]);

  if (geometry === null) return null;
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <laylineShoreMaterial side={DoubleSide} uHaze={VENUE_HAZE} />
    </mesh>
  );
}
