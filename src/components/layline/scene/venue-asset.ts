/**
 * The venue container, read back.
 *
 * `scripts/layline-bake-venue.mjs` writes LVN3 and its header comment is the
 * spec; this is the only code that reads it. It lives apart from VenueShore
 * because it is a pure function of bytes: no React, no fiber, no material, no
 * document. That is what lets the container's promises (channel order, 4-byte
 * alignment, body-relative offsets, the u16 index limit, the LVN2 fallback) be
 * held to a test rather than to a screenshot.
 */
import { BufferAttribute, BufferGeometry } from "three";

export const MAGIC_LVN2 = 0x324e564c; // "LVN2", the single-layer asset round 2 shipped
export const MAGIC_LVN3 = 0x334e564c; // "LVN3", the layered container

/* Layer class ids, from the baker's layer table. */
export const CLASS_TERRAIN = 1;
export const CLASS_MASSING = 2;
export const CLASS_PORT = 3;
export const CLASS_HEROES = 4;
export const CLASS_CURTAIN = 5;

/* Which shader a layer's `material` byte asks for. */
export const MATERIAL_SHORE = 0;
export const MATERIAL_CURTAIN = 1;

/* Channel bits in a layer's attrMask, in the order the body lays them out. */
export const ATTR_FADE = 1;
export const ATTR_SHADE = 2;
export const ATTR_DIST = 4;
export const ATTR_BASE = 8;
export const ATTR_MAT = 16;

export type VenueLayer = {
  classId: number;
  material: number;
  drawOrder: number;
  geometry: BufferGeometry;
};

/** One layer's body, in the byte order the LVN2 asset already shipped:
 * quantised world-frame positions, then whichever of the five channels the
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
  /* The shore shader declares `aMat` and every shore layer therefore has to
   * supply it, whether or not its block carries the channel. An unbound
   * attribute reads back whatever the driver left in the default vertex
   * attribute, which is not a value this code gets to define, so the layers
   * without the channel get an explicit run of zeros: "no named substance,
   * use the height ramp". One byte per vertex on the client, none on the
   * wire. */
  if (attrMask & ATTR_MAT) {
    geometry.setAttribute("aMat", new BufferAttribute(new Uint8Array(buffer, at, vertCount).slice(), 1));
    at += vertCount;
  } else if (attrMask & ATTR_SHADE) {
    geometry.setAttribute("aMat", new BufferAttribute(new Uint8Array(vertCount), 1));
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
export function parseVenueMesh(buffer: ArrayBuffer): VenueLayer[] {
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
