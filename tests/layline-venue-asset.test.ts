/**
 * The venue container, the asset baked into it, and the readiness the two owe
 * the capture contract.
 *
 * `scripts/layline-bake-venue.mjs` and `src/components/layline/scene/
 * venue-asset.ts` are a writer and a reader of one binary format that no third
 * party validates, so everything the format promises is asserted here against
 * bodies built by hand and against the committed asset itself. Nothing in this
 * file touches the network: the baker fetches, the runtime reads bytes, and a
 * unit test does neither.
 *
 * Run: npx --yes tsx --test tests/layline-venue-asset.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

import {
  ATTR_BASE,
  ATTR_DIST,
  ATTR_FADE,
  ATTR_MAT,
  ATTR_SHADE,
  CLASS_CURTAIN,
  CLASS_HEROES,
  CLASS_MASSING,
  CLASS_PORT,
  CLASS_TERRAIN,
  MAGIC_LVN2,
  MAGIC_LVN3,
  MATERIAL_CURTAIN,
  MATERIAL_SHORE,
  parseVenueMesh,
} from "../src/components/layline/scene/venue-asset";

const ASSET = "public/prototype/layline/venues/long-beach.bin";
const BAKER = "scripts/layline-bake-venue.mjs";

function bytes(path: string): Buffer {
  return readFileSync(new URL(`../${path}`, import.meta.url));
}
function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
function asset(): ArrayBuffer {
  const raw = gunzipSync(bytes(ASSET));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

/* ------------------------------------------------------- synthetic bodies */

type SynthLayer = {
  classId: number;
  material: number;
  drawOrder: number;
  attrMask: number;
  yUnit: number;
  idx32: boolean;
  positions: number[]; // x, quantised y, z per vertex
  channels: Partial<Record<number, number[]>>;
  indices: number[];
};

const ATTR_BYTES: Record<number, number> = {
  [ATTR_FADE]: 1,
  [ATTR_SHADE]: 1,
  [ATTR_DIST]: 2,
  [ATTR_BASE]: 1,
  [ATTR_MAT]: 1,
};
const CHANNEL_ORDER = [ATTR_FADE, ATTR_SHADE, ATTR_DIST, ATTR_BASE, ATTR_MAT];

/** An LVN3 body written the way the baker's header comment says to write one,
 * from scratch: this is the second implementation the format has, so a reader
 * that silently agreed with the writer's bug would disagree with this. */
function writeLVN3(layers: SynthLayer[]): ArrayBuffer {
  const blocks = layers.map((layer) => {
    const vertCount = layer.positions.length / 3;
    let perVertex = 6;
    for (const bit of CHANNEL_ORDER) if (layer.attrMask & bit) perVertex += ATTR_BYTES[bit];
    const head = vertCount * perVertex;
    const pad = (4 - (head % 4)) % 4;
    const body = head + pad + layer.indices.length * (layer.idx32 ? 4 : 2);
    return { layer, vertCount, head, pad, size: body + ((4 - (body % 4)) % 4) };
  });
  const bodyOffset = 16 + layers.length * 24;
  const total = bodyOffset + blocks.reduce((sum, b) => sum + b.size, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC_LVN3, true);
  view.setUint32(4, layers.length, true);
  view.setUint32(8, 0, true);
  view.setUint32(12, bodyOffset, true);
  let bodyAt = 0;
  blocks.forEach((block, i) => {
    const { layer, vertCount, head, pad } = block;
    const record = 16 + i * 24;
    view.setUint16(record, layer.classId, true);
    view.setUint8(record + 2, layer.material);
    view.setUint8(record + 3, layer.drawOrder);
    view.setUint8(record + 4, layer.attrMask);
    view.setUint8(record + 5, layer.yUnit);
    view.setUint8(record + 6, layer.idx32 ? 1 : 0);
    view.setUint8(record + 7, 0);
    view.setUint32(record + 8, vertCount, true);
    view.setUint32(record + 12, layer.indices.length, true);
    view.setUint32(record + 16, bodyAt, true);
    view.setUint32(record + 20, bodyAt + head + pad, true);
    let at = bodyOffset + bodyAt;
    for (const value of layer.positions) {
      view.setInt16(at, value, true);
      at += 2;
    }
    for (const bit of CHANNEL_ORDER) {
      if (!(layer.attrMask & bit)) continue;
      const values = layer.channels[bit] ?? [];
      for (const value of values) {
        if (ATTR_BYTES[bit] === 2) {
          view.setInt16(at, value, true);
          at += 2;
        } else {
          view.setUint8(at, value);
          at += 1;
        }
      }
    }
    at += pad;
    for (const index of layer.indices) {
      if (layer.idx32) view.setUint32(at, index, true);
      else view.setUint16(at, index, true);
      at += layer.idx32 ? 4 : 2;
    }
    bodyAt += block.size;
  });
  return buffer;
}

/** A minimal LVN2 body: the single-layer asset round 2 shipped. */
function writeLVN2(vertCount: number, indices: number[], idx32: boolean): ArrayBuffer {
  const channels = 16 + vertCount * 8;
  const indexAt = channels + ((4 - (channels % 4)) % 4);
  const buffer = new ArrayBuffer(indexAt + indices.length * (idx32 ? 4 : 2));
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC_LVN2, true);
  view.setUint32(4, vertCount, true);
  view.setUint32(8, indices.length, true);
  view.setUint32(12, idx32 ? 1 : 0, true);
  let at = 16;
  for (let i = 0; i < vertCount; i++) {
    view.setInt16(at, i * 10, true);
    view.setInt16(at + 2, i * 20, true); // yUnit 10, so 2 m per step
    view.setInt16(at + 4, -7 - i * 7, true);
    at += 6;
  }
  for (let i = 0; i < vertCount; i++) view.setUint8(at + i, 200 + i);
  at += vertCount;
  for (let i = 0; i < vertCount; i++) view.setUint8(at + i, 100 + i);
  at = indexAt;
  for (const index of indices) {
    if (idx32) view.setUint32(at, index, true);
    else view.setUint16(at, index, true);
    at += idx32 ? 4 : 2;
  }
  return buffer;
}

const array = (geometry: { getAttribute: (name: string) => { array: ArrayLike<number> } | undefined }, name: string) =>
  Array.from(geometry.getAttribute(name)?.array ?? []);

/* ----------------------------------------------------------- the container */

test("LVN3 decodes the layer table and hands every layer its own channels", () => {
  const buffer = writeLVN3([
    {
      classId: CLASS_HEROES,
      material: MATERIAL_SHORE,
      drawOrder: 22,
      attrMask: ATTR_FADE | ATTR_SHADE | ATTR_MAT,
      yUnit: 10,
      idx32: false,
      positions: [1, 20, -3, 4, 50, -6, 7, 80, -9],
      channels: { [ATTR_FADE]: [255, 128, 0], [ATTR_SHADE]: [80, 128, 200], [ATTR_MAT]: [1, 4, 6] },
      indices: [0, 1, 2],
    },
    {
      classId: CLASS_CURTAIN,
      material: MATERIAL_CURTAIN,
      drawOrder: 0,
      attrMask: ATTR_DIST | ATTR_BASE,
      yUnit: 10,
      idx32: false,
      positions: [1000, 4500, 0, 0, 0, 1000],
      channels: { [ATTR_DIST]: [4200, -13], [ATTR_BASE]: [1, 2] },
      indices: [0, 1, 0],
    },
  ]);
  const layers = parseVenueMesh(buffer);

  /* drawOrder ascending, whatever order the table was written in */
  assert.deepEqual(
    layers.map((l) => l.classId),
    [CLASS_CURTAIN, CLASS_HEROES],
  );
  assert.deepEqual(
    layers.map((l) => l.drawOrder),
    [0, 22],
  );
  assert.deepEqual(
    layers.map((l) => l.material),
    [MATERIAL_CURTAIN, MATERIAL_SHORE],
  );

  const hero = layers[1].geometry;
  /* y comes back in metres through yUnit; x and z are metres already */
  assert.deepEqual(array(hero, "position"), [1, 2, -3, 4, 5, -6, 7, 8, -9]);
  assert.deepEqual(array(hero, "aFade"), [255, 128, 0]);
  assert.deepEqual(array(hero, "aShade"), [80, 128, 200]);
  assert.deepEqual(array(hero, "aMat"), [1, 4, 6]);
  assert.equal(hero.getAttribute("aFade")?.normalized, true);
  assert.equal(hero.getAttribute("aShade")?.normalized, true);
  /* the substance index is an integer the shader compares against, never a
     0..1 fraction: a normalised aMat would decode 6 as 0.0235 */
  assert.equal(hero.getAttribute("aMat")?.normalized, false);
  assert.deepEqual(Array.from(hero.getIndex()?.array ?? []), [0, 1, 2]);

  const curtain = layers[0].geometry;
  assert.deepEqual(array(curtain, "aDist"), [4200, -13]);
  assert.deepEqual(array(curtain, "aBase"), [1, 2]);
  /* the curtain pays for range and a column code INSTEAD of fade and shade */
  assert.equal(curtain.getAttribute("aFade"), undefined);
  assert.equal(curtain.getAttribute("aShade"), undefined);
  assert.equal(curtain.getAttribute("aMat"), undefined);
});

test("a shore layer with no aMat channel still binds an explicit run of zeros", () => {
  const buffer = writeLVN3([
    {
      classId: CLASS_TERRAIN,
      material: MATERIAL_SHORE,
      drawOrder: 10,
      attrMask: ATTR_FADE | ATTR_SHADE,
      yUnit: 10,
      idx32: false,
      positions: [0, 60, 0, 10, 60, 0, 0, 60, 10],
      channels: { [ATTR_FADE]: [255, 255, 255], [ATTR_SHADE]: [128, 128, 128] },
      indices: [0, 1, 2],
    },
  ]);
  const geometry = parseVenueMesh(buffer)[0].geometry;
  /* An unbound attribute reads back whatever the driver left behind, which
     would select a hero substance at random on the terrain. */
  assert.deepEqual(array(geometry, "aMat"), [0, 0, 0]);
});

test("aDist is signed and read at two bytes a vertex", () => {
  const buffer = writeLVN3([
    {
      classId: CLASS_CURTAIN,
      material: MATERIAL_CURTAIN,
      drawOrder: 0,
      attrMask: ATTR_DIST | ATTR_BASE,
      yUnit: 10,
      idx32: false,
      positions: [1000, 30170, 0, 0, 0, -1000],
      channels: { [ATTR_DIST]: [-32768, 32767], [ATTR_BASE]: [0, 3] },
      indices: [0, 1, 0],
    },
  ]);
  assert.deepEqual(array(parseVenueMesh(buffer)[0].geometry, "aDist"), [-32768, 32767]);
});

test("the index width follows the layer's own idx32 byte", () => {
  const wide = writeLVN3([
    {
      classId: CLASS_MASSING,
      material: MATERIAL_SHORE,
      drawOrder: 20,
      attrMask: ATTR_FADE | ATTR_SHADE,
      yUnit: 10,
      idx32: true,
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      channels: { [ATTR_FADE]: [1, 2, 3], [ATTR_SHADE]: [4, 5, 6] },
      indices: [0, 1, 2],
    },
  ]);
  const geometry = parseVenueMesh(wide)[0].geometry;
  assert.equal(geometry.getIndex()?.array.constructor.name, "Uint32Array");
  assert.deepEqual(Array.from(geometry.getIndex()?.array ?? []), [0, 1, 2]);
});

test("every layer block starts 4-byte aligned however the one before it ended", () => {
  /* Three vertices of an aMat-carrying shore layer is 27 bytes of head: the
     pad is what keeps the NEXT layer's Int16 positions and Uint32 indices on
     legal boundaries, and a typed-array view over a misaligned offset throws
     rather than reading garbage. */
  const buffer = writeLVN3([
    {
      classId: CLASS_PORT,
      material: MATERIAL_SHORE,
      drawOrder: 21,
      attrMask: ATTR_FADE | ATTR_SHADE | ATTR_MAT,
      yUnit: 10,
      idx32: false,
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      channels: { [ATTR_FADE]: [1, 2, 3], [ATTR_SHADE]: [4, 5, 6], [ATTR_MAT]: [6, 6, 0] },
      indices: [0, 1, 2],
    },
    {
      classId: CLASS_HEROES,
      material: MATERIAL_SHORE,
      drawOrder: 22,
      attrMask: ATTR_FADE | ATTR_SHADE | ATTR_MAT,
      yUnit: 10,
      idx32: true,
      positions: [5, 0, 5, 6, 0, 5, 5, 0, 6],
      channels: { [ATTR_FADE]: [7, 8, 9], [ATTR_SHADE]: [10, 11, 12], [ATTR_MAT]: [1, 2, 3] },
      indices: [2, 1, 0],
    },
  ]);
  const layers = parseVenueMesh(buffer);
  assert.deepEqual(array(layers[0].geometry, "aMat"), [6, 6, 0]);
  assert.deepEqual(array(layers[1].geometry, "aMat"), [1, 2, 3]);
  assert.deepEqual(Array.from(layers[1].geometry.getIndex()?.array ?? []), [2, 1, 0]);
});

test("offsets in the layer table are relative to bodyOffset, not to the file", () => {
  const one = writeLVN3([
    {
      classId: CLASS_TERRAIN,
      material: MATERIAL_SHORE,
      drawOrder: 10,
      attrMask: ATTR_FADE | ATTR_SHADE,
      yUnit: 10,
      idx32: false,
      positions: [11, 0, 22, 33, 0, 44, 55, 0, 66],
      channels: { [ATTR_FADE]: [1, 1, 1], [ATTR_SHADE]: [2, 2, 2] },
      indices: [0, 1, 2],
    },
  ]);
  /* Adding a second table row moves bodyOffset by 24 and leaves every recorded
     offset alone. A reader that treated them as absolute would read the first
     layer's positions 24 bytes early and get the table back as geometry. */
  const two = writeLVN3([
    {
      classId: CLASS_TERRAIN,
      material: MATERIAL_SHORE,
      drawOrder: 10,
      attrMask: ATTR_FADE | ATTR_SHADE,
      yUnit: 10,
      idx32: false,
      positions: [11, 0, 22, 33, 0, 44, 55, 0, 66],
      channels: { [ATTR_FADE]: [1, 1, 1], [ATTR_SHADE]: [2, 2, 2] },
      indices: [0, 1, 2],
    },
    {
      classId: CLASS_MASSING,
      material: MATERIAL_SHORE,
      drawOrder: 20,
      attrMask: ATTR_FADE | ATTR_SHADE,
      yUnit: 10,
      idx32: false,
      positions: [1, 0, 1, 2, 0, 2, 3, 0, 3],
      channels: { [ATTR_FADE]: [3, 3, 3], [ATTR_SHADE]: [4, 4, 4] },
      indices: [0, 1, 2],
    },
  ]);
  assert.deepEqual(
    array(parseVenueMesh(two)[0].geometry, "position"),
    array(parseVenueMesh(one)[0].geometry, "position"),
  );
  assert.deepEqual(array(parseVenueMesh(two)[0].geometry, "position"), [11, 0, 22, 33, 0, 44, 55, 0, 66]);
});

test("the LVN2 branch still parses the single-layer asset round 2 shipped", () => {
  const layers = parseVenueMesh(writeLVN2(4, [0, 1, 2, 0, 2, 3], false));
  assert.equal(layers.length, 1);
  assert.equal(layers[0].classId, CLASS_TERRAIN);
  assert.equal(layers[0].material, MATERIAL_SHORE);
  assert.equal(layers[0].drawOrder, 10);
  const geometry = layers[0].geometry;
  assert.deepEqual(
    array(geometry, "position"),
    [0, 0, -7, 10, 2, -14, 20, 4, -21, 30, 6, -28],
  );
  assert.deepEqual(array(geometry, "aFade"), [200, 201, 202, 203]);
  assert.deepEqual(array(geometry, "aShade"), [100, 101, 102, 103]);
  /* LVN2 predates the substance byte, so the fallback run has to be there or
     the shore shader reads an unbound attribute on the fallback asset. */
  assert.deepEqual(array(geometry, "aMat"), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(geometry.getIndex()?.array ?? []), [0, 1, 2, 0, 2, 3]);
});

test("an LVN2 body with a vertex count that pushes the index block off four bytes still aligns", () => {
  /* 5 vertices is 40 channel bytes over a 16-byte header: 56, already aligned.
     3 vertices is 24 over 16: 40. Both legal; the pad expression has to cope
     with either without moving the index block. */
  for (const vertCount of [3, 5, 6]) {
    const layers = parseVenueMesh(writeLVN2(vertCount, [0, 1, 2], false));
    assert.deepEqual(Array.from(layers[0].geometry.getIndex()?.array ?? []), [0, 1, 2]);
  }
});

test("a body that is neither LVN2 nor LVN3 is refused rather than read as one", () => {
  const buffer = new ArrayBuffer(64);
  new DataView(buffer).setUint32(0, 0x314e564c, true); // "LVN1"
  assert.throws(() => parseVenueMesh(buffer), /not a LVN2 or LVN3 mesh/);
});

/* ------------------------------------------------------- the shipped asset */

test("the committed asset carries the five layers the runtime draws", () => {
  const layers = parseVenueMesh(asset());
  assert.deepEqual(
    layers.map((l) => l.classId),
    [CLASS_CURTAIN, CLASS_TERRAIN, CLASS_MASSING, CLASS_PORT, CLASS_HEROES],
  );
  assert.deepEqual(
    layers.map((l) => l.drawOrder),
    [0, 10, 20, 21, 22],
  );
  /* five draws, and the budget is eight */
  assert.ok(layers.length <= 8, `${layers.length} venue draws over the 8-draw budget`);
  for (const layer of layers) {
    const index = layer.geometry.getIndex();
    assert.ok(index !== null, `layer ${layer.classId} has no index`);
    const count = layer.geometry.getAttribute("position").count;
    for (const i of index!.array) {
      assert.ok(i < count, `layer ${layer.classId} indexes vertex ${i} of ${count}`);
    }
    /* u16 indices cannot address more than 65,536 vertices, and the baker
       promises to widen the layer rather than wrap */
    if (index!.array.constructor.name === "Uint16Array") {
      assert.ok(count <= 65536, `layer ${layer.classId} has ${count} verts under u16 indices`);
    }
  }
});

test("the substance byte ships on the port and hero layers and nowhere else", () => {
  const layers = parseVenueMesh(asset());
  const substances = new Map<number, Map<number, number>>();
  for (const layer of layers) {
    const attribute = layer.geometry.getAttribute("aMat");
    if (attribute === undefined) continue;
    const histogram = new Map<number, number>();
    for (const value of attribute.array) histogram.set(value, (histogram.get(value) ?? 0) + 1);
    substances.set(layer.classId, histogram);
  }
  /* the curtain has no aMat at all; every shore layer has one, real or zeroed */
  assert.equal(substances.has(CLASS_CURTAIN), false);
  for (const classId of [CLASS_TERRAIN, CLASS_MASSING]) {
    assert.deepEqual([...substances.get(classId)!.keys()], [0], `class ${classId} carries a substance`);
  }
  /* L3: the tank farm, and only the tank farm */
  const port = substances.get(CLASS_PORT)!;
  assert.deepEqual([...port.keys()].sort((a, b) => a - b), [0, 6]);
  assert.equal(port.get(6), 1938);
  /* L4: rock, planting, pale, hull, funnel and white, no ramp vertices at all.
     Round 0 added 7, white: the Spruce Goose dome and the Long Beach Harbor
     Light are both documented white and were drawing in the pale substance,
     which round 5 derived from the THUMS screen towers and which the grey
     concrete bridge towers also take.

     Round 1 added three more with the island rebuild. 8 is the sculpted screen
     concrete and 9 the blue panels on it: the pale substance cannot be either,
     because it is a MIX of the two plus a shaded reveal, and the blue is drawn
     as geometry now. 10 is the island deck, which is new surface: with the
     planting drawn as 1,026 measured crowns there is nothing else capping the
     island. Every count below is read off the shipped asset, not asserted from
     a constant, and each one is exact by construction:
       2 veg    1,085 crowns x 10 vertices (1,026 from trees.json plus the 59
                masses.json components under 20 m2 that the crown extraction
                had removed from trees.json in the first place)
       9 panel  3 towers x 2 crossed slabs x 19 vertices
       3 pale   drops 1,168 -> 339 because the islands stopped using it
       4 dark   back to 181, the Queen Mary and the derricks, as it was */
  const heroes = substances.get(CLASS_HEROES)!;
  assert.deepEqual([...heroes.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 7, 8, 9, 10]);
  assert.equal(heroes.get(7), 150);
  assert.equal(heroes.get(1), 13298);
  assert.equal(heroes.get(2), 10850);
  assert.equal(heroes.get(3), 339);
  assert.equal(heroes.get(4), 181);
  assert.equal(heroes.get(8), 2230);
  assert.equal(heroes.get(9), 114);
  assert.equal(heroes.get(10), 653);
  assert.equal(heroes.get(0), undefined);
});

/* ------------------------------------------------- the coast's own topology */

/**
 * The waterline rings, recovered from the terrain layer's skirt.
 *
 * buildLand drops a vertical skirt from every ring edge to BASE_Y, so a
 * triangle with exactly one vertex at -4 m and two at 0 m carries one ring edge
 * and nothing else does. Walking those edges gives back the rings the baker
 * triangulated, which is where the round-2b defects lived: a self-crossing ring
 * folds its earcut cap over itself, and a chord left behind by a merge appears
 * as the same edge walked in both directions.
 *
 * The breakwaters drop the same kind of skirt, so they come back too; they are
 * open polylines rather than rings and separate themselves by not closing.
 */
type Point = { x: number; z: number };

function waterlineEdges(): [string, string][] {
  const terrain = parseVenueMesh(asset()).find((l) => l.classId === CLASS_TERRAIN)!.geometry;
  const position = terrain.getAttribute("position").array;
  const index = terrain.getIndex()!.array;
  const at = (i: number) => ({
    x: position[i * 3],
    y: position[i * 3 + 1],
    z: position[i * 3 + 2],
  });
  const edges: [string, string][] = [];
  for (let t = 0; t < index.length; t += 3) {
    const corners = [at(index[t]), at(index[t + 1]), at(index[t + 2])];
    const sea = corners.filter((c) => c.y === 0);
    const foot = corners.filter((c) => c.y === -4);
    if (sea.length !== 2 || foot.length !== 1) continue;
    edges.push([`${sea[0].x},${sea[0].z}`, `${sea[1].x},${sea[1].z}`]);
  }
  return edges;
}

const point = (key: string): Point => {
  const [x, z] = key.split(",").map(Number);
  return { x, z };
};

/** The closed rings among those edges. A breakwater's flanks are open
 * polylines rather than rings and drop out here, which is what separates the
 * coast from the moles without asking either of them to be labelled. */
function waterlineRings(): Point[][] {
  const edges = waterlineEdges();
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) {
    const list = out.get(a);
    if (list === undefined) out.set(a, [b]);
    else list.push(b);
  }
  const spent = new Set<string>();
  const rings: Point[][] = [];
  for (const [start] of edges) {
    const ring: Point[] = [];
    let here = start;
    for (;;) {
      const step = (out.get(here) ?? []).find((b) => !spent.has(`${here}|${b}`));
      if (step === undefined) break;
      spent.add(`${here}|${step}`);
      ring.push(point(step));
      here = step;
      if (step === start) {
        rings.push(ring);
        break;
      }
    }
  }
  return rings;
}

function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: typeof a, q: typeof a, r: typeof a) =>
    Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  return s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0 && s1 !== s2 && s3 !== s4;
}

test("every land ring in the committed asset is closed, simple and consistently wound", () => {
  const rings = waterlineRings();
  /* The bake logs "19 land rings, 664 verts"; both numbers come back out of
     the asset, so the coast the runtime draws is the coast the baker filtered
     rather than whatever earcut and the vertex dedup left of it. */
  assert.equal(rings.length, 19, "the bake reports 19 land rings");
  assert.equal(
    rings.reduce((sum, ring) => sum + ring.length, 0),
    664,
    "the bake reports 664 ring vertices",
  );
  for (const [r, ring] of rings.entries()) {
    assert.ok(ring.length >= 3, `ring ${r} has ${ring.length} vertices`);
    /* one direction for all of them: a ring wound the other way is a hole, and
       earcut is documented as taking counter-clockwise rings with no holes */
    assert.ok(signedArea(ring) !== 0, `ring ${r} has zero area`);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        const c = ring[j];
        const d = ring[(j + 1) % ring.length];
        assert.ok(
          !crosses(a, b, c, d),
          `ring ${r} crosses itself between edges ${i} and ${j}: earcut folds its cap`,
        );
      }
    }
  }
  /* The baker keeps every land ring counter-clockwise in the course frame,
     because earcut takes CCW rings with no holes and a clockwise one is water.
     The world maps course y onto -z, which mirrors the plane, so all 19 come
     back positive here. One sign for all of them is the property; which sign is
     the frame. */
  const winding = new Set(rings.map((ring) => Math.sign(signedArea(ring))));
  assert.deepEqual([...winding], [1], "all 19 rings wind the same way in world xz");
});

test("no land ring carries the same edge in both directions", () => {
  /* The round-2b latent, seen from the asset: mergeSplitChords rejoins two ring
     halves across the chord that split them and assumes there is only ever one
     such chord. A second one survives as a reversed duplicate inside the merged
     ring, and buildLand would draw a batter face and a surf line through the
     middle of a land neck. The baker asserts this too, at the ring level. */
  const edges = waterlineEdges();
  const seen = new Set(edges.map(([a, b]) => `${a}|${b}`));
  assert.equal(seen.size, edges.length, "the same waterline edge is emitted twice");
  for (const [a, b] of edges) {
    assert.ok(!seen.has(`${b}|${a}`), `the waterline edge ${a} to ${b} is walked both ways`);
  }
});

test("no terrain vertex stands over the harbour entrance where the Long Beach Light is", () => {
  /* Round 5 left a 25 m crest 21 m from a light whose own top is 19 m, so the
     light stood 6 m below the terrain beside it: a z11 DEM sample is 64 m wide
     and the Queens Gate training wall it was read over is 19.7 m. The crest now
     reads the same filtered lattice the relief is drawn from, and a feature the
     lattice cannot resolve takes the 6 m shore floor. */
  const terrain = parseVenueMesh(asset()).find((l) => l.classId === CLASS_TERRAIN)!.geometry;
  const position = terrain.getAttribute("position").array;
  const light = { x: 1227, z: -3389 };
  let tallest = 0;
  for (let i = 0; i < position.length; i += 3) {
    if (Math.hypot(position[i] - light.x, position[i + 2] - light.z) > 400) continue;
    tallest = Math.max(tallest, position[i + 1]);
  }
  assert.ok(tallest <= 6.05, `terrain reaches ${tallest} m within 400 m of the Long Beach Light`);
});

/* ---------------------------------------------------------- rebake identity */

test("the committed asset and the baker that made it are both pinned", () => {
  /* The baker fetches OpenStreetMap and elevation tiles, so it cannot be run
     from a unit test and a rebake cannot be compared here. What a test can do
     is refuse to let either side of the pair move without the other being
     looked at: change the baker and this fails until the asset is rebaked and
     both hashes are restated, which is the step round 5 did by hand every time.
     `node scripts/layline-bake-venue.mjs long-beach` writes the asset; two runs
     from the same cache are byte-identical. */
  assert.equal(
    sha256(bytes(ASSET)),
    "2e56807325668e0b5b904d03a1c75534f346dcb785da019b42c070821c81b3a7",
    "the committed venue asset changed; rebake it and restate both hashes",
  );
  assert.equal(
    sha256(bytes(BAKER)),
    "126686a8e3c65e6d69c37f3df42770854ba2271903c803babb7817275933169f",
    "the baker changed; rebake the venue and restate both hashes",
  );
  const manifest = JSON.parse(
    readFileSync(new URL("../public/prototype/layline/venues/long-beach.json", import.meta.url), "utf8"),
  );
  /* the manifest is written by the same run, so it has to agree with the file
     beside it rather than with a number typed in later */
  assert.equal(manifest.stats.bytes, bytes(ASSET).length);
  /* This number is a TRIPWIRE now, not a budget, and the change is disclosed
     rather than quiet. Contract amendment 7 (owner, 2026-08-29, verbatim: "for
     now lets just focus on the realism and not performance") suspends the A4
     ceilings as acceptance criteria for the close-range realism rounds and says
     not to thin realism work to fit one. Round 1 draws 1,026 individually
     measured tree crowns, 674 rim facets swept from the measured shoreline
     profile and 95 measured island structures where round 5 drew 4 vegetation
     objects, 16 towers and 16 slabs, and that costs 210.7 KiB gzipped. The
     ceiling is restated at the measured size plus 5 per cent so unnoticed
     growth still fails; it is not a claim that 552.4 KiB is acceptable, and the
     owner has said perf gets re-opened when the look is right. */
  assert.ok(
    manifest.stats.bytes <= 580 * 1024,
    `${manifest.stats.bytes} B over the 580 KiB asset tripwire`,
  );
  assert.equal(
    manifest.stats.triangles,
    manifest.stats.layers.reduce((sum: number, l: { triangles: number }) => sum + l.triangles, 0),
  );
});
