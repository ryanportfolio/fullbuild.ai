/**
 * The lidar and orthophoto ingestion stage, and the products it commits.
 *
 * Three things are worth a test here and nothing else is. First, the vendored
 * laz-perf bytes: they are pinned by sha256 in a markdown table nobody re-reads,
 * so the table is parsed and the files re-hashed on every run. Second, the point
 * record layout switch, because a wrong classification mask or a wrong return
 * nibble produces plausible numbers rather than an error; synthetic LAS files
 * go through the real WASM for both layouts. Third, the committed products,
 * because they are generated files that a later edit could quietly desync from
 * their own hashes.
 *
 * Nothing here touches the network: the derivation fetches, the products are
 * bytes on disk, and a unit test does neither.
 *
 * Run: npx --yes tsx --test tests/layline-scenery-ingest.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { deflateSync, gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

import {
  CLASS_NAMES,
  decodeLaz,
  gpsToDate,
  lasHeader,
  layout,
  pointColumns,
  readPointInto,
} from "../scripts/lib/laz.mjs";
import {
  courseFrame,
  mercatorEnvelopeOfCourseBox,
  mercatorScale,
  toLonLat,
  toMercator,
} from "../scripts/lib/geo.mjs";
import {
  exportUrl,
  patchBbox,
  quadForBbox,
  verifyCoverage,
} from "../scripts/lib/naip.mjs";
import {
  NODATA_CM,
  canopyHeightModel,
  clampToNeighbours,
  encodeHeightField,
  encodeMask,
  excludeCrownsInMasses,
  fillHoles,
  findCrowns,
  findMasses,
  makeGrid,
  observedMask,
  percentile,
  rasterize,
  signedDistanceToRing,
} from "../scripts/lib/scenery-derive.mjs";
import { VENUE_SCENERY, venueScenery } from "../scripts/lib/venue-scenery.mjs";

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);
const bytes = (path: string): Buffer => readFileSync(repoFile(path));
const text = (path: string): string => readFileSync(repoFile(path), "utf8");
const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

/* ------------------------------------------------------- vendored decoder */

test("the vendored laz-perf files are the bytes PROVENANCE.md pins", () => {
  const table = text("scripts/lib/laz-perf/PROVENANCE.md");
  const rows = [...table.matchAll(/^\| `([^`]+)` \| ([\d,]+) \| `([0-9a-f]{64})` \|$/gm)].map((m) => ({
    file: m[1],
    bytes: Number(m[2].replace(/,/g, "")),
    sha256: m[3],
  }));
  assert.deepEqual(
    rows.map((r) => r.file).sort(),
    ["COPYING", "laz-perf.js", "laz-perf.wasm"],
    "PROVENANCE.md must pin exactly the three vendored files",
  );
  for (const row of rows) {
    const buffer = bytes(`scripts/lib/laz-perf/${row.file}`);
    assert.equal(buffer.length, row.bytes, `${row.file} byte count`);
    assert.equal(sha256(buffer), row.sha256, `${row.file} sha256`);
  }
});

test("the vendored directory is scoped CommonJS", () => {
  /* The repo root is "type": "module". Without this scope Node reads the
   * emscripten glue as ESM and hands back an empty namespace instead of the
   * createLazPerf factory, which fails as "createLazPerf is not a function"
   * far from its cause. */
  const scope = JSON.parse(text("scripts/lib/laz-perf/package.json"));
  assert.equal(scope.type, "commonjs");
  assert.equal(scope.private, true);
});

/* ------------------------------------------------------------- LAS decode */

type SynthPoint = {
  xi: number;
  yi: number;
  zi: number;
  intensity: number;
  returnByte: number;
  classByte: number;
  gps?: number;
};

/** A minimal uncompressed LAS 1.2 or 1.4 file. Uncompressed because nothing in
 * the toolchain writes LAZ; the point of the fixture is the record layout, and
 * laz-perf's reader walks an uncompressed file through the same path. */
function buildLas(pdrf: number, recordLength: number, points: SynthPoint[]): Buffer {
  const headerSize = 227;
  const header = Buffer.alloc(headerSize);
  header.write("LASF", 0, "ascii");
  header.writeUInt8(1, 24);
  header.writeUInt8(2, 25);
  header.write("layline-test-system", 26, "ascii");
  header.write("layline-test-writer", 58, "ascii");
  header.writeUInt16LE(275, 90);
  header.writeUInt16LE(2026, 92);
  header.writeUInt16LE(headerSize, 94);
  header.writeUInt32LE(headerSize, 96);
  header.writeUInt32LE(0, 100);
  header.writeUInt8(pdrf, 104);
  header.writeUInt16LE(recordLength, 105);
  header.writeUInt32LE(points.length, 107);
  header.writeDoubleLE(0.01, 131);
  header.writeDoubleLE(0.01, 139);
  header.writeDoubleLE(0.01, 147);
  header.writeDoubleLE(1000, 155);
  header.writeDoubleLE(2000, 163);
  header.writeDoubleLE(10, 171);

  const lay = layout(pdrf);
  const body = Buffer.alloc(recordLength * points.length);
  points.forEach((p, i) => {
    const at = i * recordLength;
    body.writeInt32LE(p.xi, at);
    body.writeInt32LE(p.yi, at + 4);
    body.writeInt32LE(p.zi, at + 8);
    body.writeUInt16LE(p.intensity, at + lay.intensity);
    body.writeUInt8(p.returnByte, at + lay.returnByte);
    body.writeUInt8(p.classByte, at + lay.classification);
    if (lay.gpsTime !== null) body.writeDoubleLE(p.gps ?? 0, at + lay.gpsTime);
  });
  return Buffer.concat([header, body]);
}

test("lasHeader reads the public header block and the compression flag", () => {
  const file = buildLas(1, 28, [
    { xi: 1, yi: 2, zi: 3, intensity: 0, returnByte: 0, classByte: 2, gps: 0 },
  ]);
  const header = lasHeader(file);
  assert.equal(header.versionMajor, 1);
  assert.equal(header.versionMinor, 2);
  assert.equal(header.pointDataRecordFormat, 1);
  assert.equal(header.compressed, false);
  assert.equal(header.pointDataRecordLength, 28);
  assert.equal(header.pointCount, 1);
  assert.equal(header.generatingSoftware, "layline-test-writer");
  assert.deepEqual(header.offset, [1000, 2000, 10]);

  /* The high bit of the format byte is laszip's compression flag and is not
   * part of the format number: reading it as one gives PDRF 129. */
  const compressed = Buffer.from(file);
  compressed.writeUInt8(1 | 0x80, 104);
  const zipped = lasHeader(compressed);
  assert.equal(zipped.pointDataRecordFormat, 1);
  assert.equal(zipped.compressed, true);

  assert.throws(() => lasHeader(Buffer.alloc(300)), /LASF/);
});

test("the layout switch moves classification and the return nibbles on PDRF 6", () => {
  const legacy = layout(1);
  assert.equal(legacy.classification, 15);
  assert.equal(legacy.classificationMask, 0x1f);
  assert.equal(legacy.returnMask, 0x07);
  assert.equal(legacy.returnShift, 3);
  assert.equal(legacy.gpsTime, 20);
  assert.equal(legacy.wide, false);

  const wide = layout(6);
  assert.equal(wide.classification, 16);
  assert.equal(wide.classificationMask, 0xff);
  assert.equal(wide.returnMask, 0x0f);
  assert.equal(wide.returnShift, 4);
  assert.equal(wide.gpsTime, 22);
  assert.equal(wide.wide, true);

  assert.equal(layout(0).gpsTime, null, "PDRF 0 carries no GPS time field");
  assert.throws(() => layout(11), /unsupported point data record format/);
});

test("readPointInto masks the legacy class byte and keeps the full byte on PDRF 6", () => {
  const header = { scale: [0.01, 0.01, 0.01], offset: [1000, 2000, 10] };
  const record = Buffer.alloc(40);
  record.writeInt32LE(250, 0);
  record.writeInt32LE(-250, 4);
  record.writeUInt16LE(5000, 12);

  /* 0x82 is class 2 with the withheld flag set. Reading the whole byte gives
   * 130, a class number that does not exist, and every ground filter misses. */
  const legacy = layout(1);
  record.writeUInt8(0b010_01_010, 14);
  record.writeUInt8(0x82, 15);
  const legacyOut = pointColumns(1, legacy);
  readPointInto(new DataView(record.buffer, record.byteOffset), 0, legacy, header, legacyOut, 0);
  assert.equal(legacyOut.classification[0], 2, "legacy class survives the flag bits");
  assert.equal(legacyOut.returnNumber[0], 2, "3-bit return number");
  assert.equal(legacyOut.numberOfReturns[0], 1, "3-bit return count");
  assert.equal(legacyOut.x[0], 1002.5);
  assert.equal(legacyOut.y[0], 1997.5);

  const wide = layout(6);
  record.writeUInt8(0b0011_0010, 14);
  record.writeUInt8(64, 16);
  const wideOut = pointColumns(1, wide);
  readPointInto(new DataView(record.buffer, record.byteOffset), 0, wide, header, wideOut, 0);
  assert.equal(wideOut.classification[0], 64, "LAS 1.4 keeps the full class byte");
  assert.equal(wideOut.returnNumber[0], 2, "4-bit return number");
  assert.equal(wideOut.numberOfReturns[0], 3, "4-bit return count");
});

test("decodeLaz reads a PDRF 1 file through the vendored WASM", async () => {
  const file = buildLas(1, 28, [
    { xi: 100, yi: 200, zi: 300, intensity: 4242, returnByte: 0b000_010_001, classByte: 0x82, gps: 1.5 },
    { xi: -100, yi: 0, zi: 1234, intensity: 7, returnByte: 0b000_001_001, classByte: 9, gps: 2.5 },
  ]);
  const decoded = await decodeLaz(file);
  assert.equal(decoded.count, 2);
  assert.equal(decoded.header.pointDataRecordFormat, 1);
  assert.deepEqual([...decoded.x], [1001, 999]);
  assert.deepEqual([...decoded.y], [2002, 2000]);
  assert.deepEqual([...decoded.z], [13, 22.34]);
  assert.deepEqual([...decoded.classification], [2, 9]);
  assert.deepEqual([...decoded.intensity], [4242, 7]);
  assert.deepEqual([...decoded.returnNumber], [1, 1]);
  assert.deepEqual([...decoded.numberOfReturns], [2, 1]);
  assert.deepEqual([...(decoded.gpsTime ?? [])], [1.5, 2.5]);
});

test("decodeLaz reads a PDRF 6 file through the vendored WASM", async () => {
  const file = buildLas(6, 30, [
    { xi: 500, yi: 500, zi: 500, intensity: 11, returnByte: 0b0100_0011, classByte: 17, gps: 9 },
  ]);
  const decoded = await decodeLaz(file);
  assert.equal(decoded.header.pointDataRecordFormat, 6);
  assert.equal(decoded.classification[0], 17);
  assert.equal(decoded.returnNumber[0], 3);
  assert.equal(decoded.numberOfReturns[0], 4);
  assert.equal(decoded.z[0], 15);
  assert.equal(decoded.gpsTime?.[0], 9);
});

test("adjusted GPS time lands on the survey's own night flight", () => {
  /* The first GPS time in EPT node 12-3174-1376-2020, which the research round
   * decoded and reported as 2023-10-03T04:29:22.895Z. */
  assert.equal(gpsToDate(380342580.895).toISOString(), "2023-10-03T04:29:22.895Z");
  assert.equal(CLASS_NAMES[2], "ground");
  assert.equal(CLASS_NAMES[9], "water");
  assert.equal(CLASS_NAMES[17], "bridge deck");
});

/* ------------------------------------------------------------------ frames */

test("the course frame uses the baker's own constants, not a better series", () => {
  const config = venueScenery("long-beach");
  const frame = courseFrame({ ...config.origin, bearing: config.bearing });
  assert.equal(frame.mPerLat, 110574);
  /* The baker writes Math.cos(lat0 * DEG) with DEG = Math.PI / 180. Writing it
   * as (lat * Math.PI) / 180 instead rounds one unit in the last place
   * differently, which is a metre across the disc after enough arithmetic. */
  assert.equal(frame.mPerLon, 111320 * Math.cos(config.origin.lat * (Math.PI / 180)));
  const origin = frame.project(config.origin.lat, config.origin.lon);
  assert.ok(Math.abs(origin.x) < 1e-12 && Math.abs(origin.y) < 1e-12);

  /* 1 km up the course axis is 1 km back again. */
  const there = frame.unproject(0, 1000);
  const back = frame.project(there.lat, there.lon);
  assert.ok(Math.abs(back.y - 1000) < 1e-6 && Math.abs(back.x) < 1e-6);
});

test("mercator round-trips and its horizontal unit is cos(lat) metres", () => {
  const [x, y] = toMercator(-118.155, 33.742);
  const [lon, lat] = toLonLat(x, y);
  assert.ok(Math.abs(lon + 118.155) < 1e-9 && Math.abs(lat - 33.742) < 1e-9);
  assert.equal(mercatorScale(33.742), Math.cos(33.742 * (Math.PI / 180)));
  assert.ok(Math.abs(mercatorScale(33.742) - 0.8315) < 1e-3, "one mercator unit is 0.83 m here");
});

test("projectMercator agrees with project, and the envelope encloses the rotated box", () => {
  const config = venueScenery("long-beach");
  const frame = courseFrame({ ...config.origin, bearing: config.bearing });
  const [mx, my] = toMercator(-118.16, 33.75249);
  const viaMercator = frame.projectMercator(mx, my);
  const direct = frame.project(33.75249, -118.16);
  assert.ok(Math.abs(viaMercator.x - direct.x) < 1e-6);
  assert.ok(Math.abs(viaMercator.y - direct.y) < 1e-6);

  const box = { x0: -100, y0: -100, x1: 100, y1: 100 };
  const envelope = mercatorEnvelopeOfCourseBox(frame, box, 0);
  for (const [cx, cy] of [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x1, box.y1],
    [box.x0, box.y1],
    [0, 0],
  ]) {
    const { lat, lon } = frame.unproject(cx, cy);
    const [px, py] = toMercator(lon, lat);
    assert.ok(px >= envelope[0] && px <= envelope[2] && py >= envelope[1] && py <= envelope[3]);
  }
  /* A 215 degree rotation means the envelope is strictly larger than the box. */
  const widthM = (envelope[2] - envelope[0]) * mercatorScale(33.742);
  assert.ok(widthM > 200 && widthM < 300, `envelope width ${widthM.toFixed(1)} m`);
});

/* -------------------------------------------------------------------- NAIP */

const QUADS = [
  { id: 16095, name: "a", year: 2022, acquired: "2022-05-11", lon: [-118.1906, -118.122], lat: [33.7476, 33.8149] },
  { id: 16104, name: "b", year: 2022, acquired: "2022-05-11", lon: [-118.1906, -118.122], lat: [33.6851, 33.7524] },
  { id: 16999, name: "c", year: 2022, acquired: "2022-05-11", lon: [-118.3, -118.0], lat: [33.6, 33.9] },
];

test("a patch box is fixed to three decimals and widened by 1/cos(lat)", () => {
  const bbox = patchBbox(-118.155, 33.742, 300);
  for (const v of bbox) assert.equal(v, Number(v.toFixed(3)), "bbox must be byte-stable in a URL");
  const widthMercator = bbox[2] - bbox[0];
  assert.ok(Math.abs(widthMercator * mercatorScale(33.742) - 300) < 0.01, "300 ground metres");
});

test("the covering quad is chosen deterministically and prefers whole-box cover", () => {
  const bbox = patchBbox(-118.155, 33.742, 300);
  const whole = quadForBbox(QUADS, bbox, -118.155, 33.742);
  assert.equal(whole.coverage, "box");
  assert.equal(whole.quad.id, 16104, "lowest OBJECTID that covers the whole box wins");

  /* A box straddling the 33.7524/33.7476 seam is covered whole by neither
   * quarter-quad, so the fallback is the one covering the centre. */
  const straddle = patchBbox(-118.155, 33.7502, 800);
  const centre = quadForBbox(QUADS.slice(0, 2), straddle, -118.155, 33.7502);
  assert.equal(centre.coverage, "centre");
  assert.equal(centre.quad.id, 16095, "both quads hold the centre; the lowest OBJECTID breaks the tie");

  assert.throws(() => quadForBbox(QUADS, patchBbox(0, 0, 100), 0, 0), /no NAIP quad covers/);
});

test("the export URL pins one raster id, the interpolation and the rendering rule", () => {
  const config = venueScenery("long-beach");
  const bbox = patchBbox(-118.155, 33.742, 300);
  const url = new URL(
    exportUrl({ service: config.ortho.service, bbox, size: 512, objectId: 16104, rendering: config.ortho.rendering }),
  );
  const q = url.searchParams;
  assert.equal(url.origin + url.pathname, `${config.ortho.service}/exportImage`);
  assert.equal(q.get("bbox"), bbox.join(","));
  assert.equal(q.get("bboxSR"), "3857");
  assert.equal(q.get("imageSR"), "3857");
  assert.equal(q.get("size"), "512,512");
  assert.equal(q.get("format"), "png24");
  assert.equal(q.get("interpolation"), "RSP_BilinearInterpolation");
  assert.equal(q.get("f"), "image");
  const mosaic = JSON.parse(q.get("mosaicRule") as string);
  assert.equal(mosaic.mosaicMethod, "esriMosaicLockRaster");
  /* One id per request. Sixteen ids in this array 502s repeatably. */
  assert.deepEqual(mosaic.lockRasterIds, [16104]);
  assert.deepEqual(JSON.parse(q.get("renderingRule") as string), { rasterFunction: "NaturalColor" });
});

/** A tiny 8-bit RGB PNG of one flat colour, for the coverage check. */
function flatPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("the coverage check rejects the all-white HTTP 200", () => {
  /* Locking to a quad that does not cover the box returns a small all-white
   * PNG with a 200, not an error, so the test has to be on the pixels. */
  assert.throws(() => verifyCoverage(flatPng(16, 16, [255, 255, 255])), /pure white/);
  const real = verifyCoverage(flatPng(16, 16, [44, 69, 61]));
  assert.equal(real.whiteFraction, 0);
  assert.equal(real.img.width, 16);
});

/* ----------------------------------------------------------- derivation */

const points = (rows: [number, number, number, number][]) => ({
  n: rows.length,
  x: Float32Array.from(rows.map((r) => r[0])),
  y: Float32Array.from(rows.map((r) => r[1])),
  z: Float32Array.from(rows.map((r) => r[2])),
  c: Uint8Array.from(rows.map((r) => r[3])),
});

test("a grid origin comes from the config, never from the data's extent", () => {
  const grid = makeGrid({ centreX: 1234.7, centreY: -20.2, halfM: 10, cell: 1 });
  assert.deepEqual(
    { x0: grid.x0, y0: grid.y0, w: grid.w, h: grid.h },
    { x0: 1225, y0: -30, w: 20, h: 20 },
  );
  /* Same config, wildly different points: same origin. That is what keeps a
   * product identical after a cached node is deleted and refetched. */
  const again = makeGrid({ centreX: 1234.7, centreY: -20.2, halfM: 10, cell: 1 });
  assert.deepEqual(again, grid);
});

test("rasterize keeps min or max per cell and drops points outside the grid", () => {
  const grid = makeGrid({ centreX: 5, centreY: 5, halfM: 5, cell: 1 });
  const p = points([
    [0.5, 0.5, 4, 2],
    [0.9, 0.9, 7, 2],
    [0.5, 0.5, 9, 9],
    [-50, 0.5, 1, 2],
  ]);
  const ground = rasterize(p, grid, "min", (c: number) => c === 2);
  const surface = rasterize(p, grid, "max", () => true);
  assert.equal(ground[0], 4);
  assert.equal(surface[0], 9);
  assert.equal(observedMask(ground).reduce((s: number, v: number) => s + v, 0), 1, "one cell observed");
});

test("hole filling is bounded by its pass count and does not depend on scan order", () => {
  const grid = makeGrid({ centreX: 5, centreY: 5, halfM: 5, cell: 1 });
  const values = new Float32Array(grid.w * grid.h).fill(NaN);
  values[0] = 10;
  const twoPasses = fillHoles(values, grid, 2);
  assert.equal(twoPasses[1], 10, "one cell away after pass 1");
  assert.equal(twoPasses[2], 10, "two cells away after pass 2");
  assert.ok(Number.isNaN(twoPasses[3]), "a third cell needs a third pass");
  assert.deepEqual([...fillHoles(values, grid, 2)], [...twoPasses]);
});

test("crown detection finds one top per cone and clamps the radius at its neighbour", () => {
  const grid = makeGrid({ centreX: 20, centreY: 20, halfM: 20, cell: 1 });
  const chm = new Float32Array(grid.w * grid.h).fill(NaN);
  const cone = (cx: number, cy: number, top: number) => {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > 5) continue;
        const v = top * (1 - d / 6);
        const k = y * grid.w + x;
        if (Number.isNaN(chm[k]) || v > chm[k]) chm[k] = v;
      }
    }
  };
  cone(10, 10, 12);
  cone(26, 26, 8);
  const crowns = findCrowns(chm, grid, { minHeight: 3, maxHeight: 35 });
  assert.equal(crowns.length, 2, "one local maximum per cone");
  const tops = crowns.map((c) => c.height).sort((a, b) => b - a);
  assert.deepEqual(tops, [12, 8]);
  /* Course-frame coordinates, from the grid origin the config fixed. */
  assert.equal(crowns[0].x, grid.x0 + 10.5);

  const clamped = clampToNeighbours([
    { x: 0, y: 0, height: 10, crownRadius: 9 },
    { x: 6, y: 0, height: 10, crownRadius: 9 },
  ]);
  assert.deepEqual(clamped.map((c: { crownRadius: number }) => c.crownRadius), [3, 3]);
});

test("masses are eight-connected, ordered tallest first and carry their bounds", () => {
  const grid = makeGrid({ centreX: 10, centreY: 10, halfM: 10, cell: 1 });
  const chm = new Float32Array(grid.w * grid.h).fill(0);
  const block = (x0: number, y0: number, size: number, height: number) => {
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) chm[y * grid.w + x] = height;
  };
  block(2, 2, 4, 25);
  block(12, 12, 4, 40);
  const masses = findMasses(chm, grid, 20, 8);
  assert.equal(masses.length, 2);
  assert.deepEqual(masses.map((m) => m.top), [40, 25]);
  assert.equal(masses[0].footprintM2, 16);
  assert.equal(masses[0].widthM, 4);
  assert.deepEqual(masses[0].boundsX, [grid.x0 + 12, grid.x0 + 16]);
  assert.deepEqual(findMasses(chm, grid, 20, 8), masses, "same input, same order");

  const kept = excludeCrownsInMasses(
    [
      { x: grid.x0 + 13, y: grid.y0 + 13, height: 5, crownRadius: 2 },
      { x: grid.x0 + 19, y: grid.y0 + 19, height: 5, crownRadius: 2 },
    ],
    masses,
    2,
  );
  assert.equal(kept.length, 1, "a crown standing inside a mass is rig structure, not a tree");
  assert.equal(kept[0].x, grid.x0 + 19);
});

test("percentile keeps the research round's rank convention", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(values, 0.5), 6);
  assert.equal(percentile(values, 0.1), 2);
  assert.equal(percentile(values, 0.9), 10);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test("signed distance to a ring is positive inside", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.ok(signedDistanceToRing(square, 5, 5) > 4.9);
  assert.ok(signedDistanceToRing(square, -3, 5) < -2.9);
  assert.ok(Math.abs(signedDistanceToRing(square, 5, 0)) < 1e-9);
});

test("a height field round-trips through centimetres, gzip and base64", () => {
  const values = Float32Array.from([4.87, -1.5, NaN, 327.67]);
  const encoded = encodeHeightField(values);
  const raw = gunzipSync(Buffer.from(encoded.base64, "base64"));
  assert.equal(raw.length, encoded.rawBytes);
  assert.equal(sha256(raw), encoded.dataSha256);
  assert.deepEqual(
    [raw.readInt16LE(0), raw.readInt16LE(2), raw.readInt16LE(4), raw.readInt16LE(6)],
    [487, -150, NODATA_CM, 32767],
  );

  const mask = encodeMask(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1]));
  const maskRaw = gunzipSync(Buffer.from(mask.base64, "base64"));
  assert.equal(maskRaw.length, 2);
  assert.equal(maskRaw[0], 0b0000_0001, "LSB first within each byte");
  assert.equal(maskRaw[1], 0b0000_0001);
});

test("the canopy height model is empty wherever either surface is", () => {
  const chm = canopyHeightModel(Float32Array.from([10, NaN, 5]), Float32Array.from([4, 4, NaN]));
  assert.equal(chm[0], 6);
  assert.ok(Number.isNaN(chm[1]));
  assert.ok(Number.isNaN(chm[2]));
});

/* ------------------------------------------------------- config vs baker */

test("the scenery config copies the baker's venue definition exactly", () => {
  const baker = text("scripts/layline-bake-venue.mjs");
  const config = venueScenery("long-beach");

  const origin = baker.match(/origin:\s*\{\s*lat:\s*([-\d.]+),\s*lon:\s*([-\d.]+)\s*\}/);
  assert.ok(origin, "baker origin not found");
  assert.equal(Number(origin[1]), config.origin.lat);
  assert.equal(Number(origin[2]), config.origin.lon);

  const bearing = baker.match(/bearing:\s*(\d+),/);
  assert.ok(bearing, "baker bearing not found");
  assert.equal(Number(bearing[1]), config.bearing);

  /* The baker pins island rings by OSM way id; the derivation must measure the
   * same four rings or its shoreline numbers describe other islands. */
  /* round 1 dropped the per-island `segments` count: the rim is resampled at a
     fixed metre pitch now, so an island's ring vertex budget is not a config */
  const ways = [...baker.matchAll(/\{ way: (\d+), name: "(\w+)" \}/g)].map((m) => ({
    way: Number(m[1]),
    name: m[2],
  }));
  assert.equal(ways.length, 4);
  assert.deepEqual(
    config.islands.map((i: { way: number }) => i.way).sort((a: number, b: number) => a - b),
    ways.map((w) => w.way).sort((a, b) => a - b),
  );
  for (const island of config.islands) {
    assert.equal(island.label, ways.find((w) => w.way === island.way)?.name);
  }

  /* The frame constants are the baker's, copied not improved. */
  assert.ok(baker.includes("const mPerLat = 110574;"));
  assert.ok(baker.includes("const mPerLon = 111320 * Math.cos(lat0 * DEG);"));
});

test("the venue scenery config is internally consistent", () => {
  const config = venueScenery("long-beach");
  assert.equal(Object.keys(VENUE_SCENERY).length, 1);
  assert.equal(config.lidar.hasVegetationClass, false);
  assert.equal(config.lidar.hasBuildingClass, false);

  const ids = config.ortho.quads.map((q: { id: number }) => q.id);
  assert.equal(new Set(ids).size, 16, "16 distinct NAIP quarter-quads");
  assert.deepEqual([...ids].sort((a, b) => a - b), ids, "quads listed in OBJECTID order");
  for (const quad of config.ortho.quads) {
    assert.match(quad.name, /^m_\d{7}_(ne|nw|se|sw)_11_060_2022051[12]$/);
    assert.equal(quad.acquired, `2022-05-${quad.name.slice(-2)}`);
    assert.ok(quad.lon[0] < quad.lon[1] && quad.lat[0] < quad.lat[1]);
  }

  const patchNames = config.patches.map((p: { name: string }) => p.name);
  assert.equal(new Set(patchNames).size, patchNames.length);
  for (const island of config.islands) assert.ok(patchNames.includes(island.patch));
  const cropNames = config.orthoCrops.map((c: { name: string }) => c.name);
  for (const swatch of config.swatchPoints) assert.ok(cropNames.includes(swatch.crop));
  for (const island of config.islands) assert.ok(cropNames.includes(island.patch));
});

/* --------------------------------------------------- committed products */

const PRODUCTS = ["trees", "masses", "height-fields", "shoreline", "swatches", "sea-level"] as const;
const product = (name: string) => JSON.parse(text(`scripts/venue-data/long-beach/${name}.json`));

test("every committed product is LF, self-hashing and pinned by provenance.json", () => {
  const provenance = product("provenance");
  const pinned = new Map<string, string>(
    provenance.products.map((p: { product: string; valuesSha256: string }) => [p.product, p.valuesSha256]),
  );
  assert.deepEqual([...pinned.keys()].sort(), [...PRODUCTS].sort());

  for (const name of PRODUCTS) {
    const raw = text(`scripts/venue-data/long-beach/${name}.json`);
    assert.ok(!raw.includes("\r"), `${name}.json must be LF: a CRLF round trip breaks these hashes`);
    assert.ok(raw.endsWith("}\n"), `${name}.json must end with one newline`);

    const doc = JSON.parse(raw);
    assert.equal(doc.product, name);
    assert.equal(doc.venue, "long-beach");
    assert.equal(doc.generator, "scripts/layline-derive-scenery.mjs");

    /* valuesSha256 is over the payload without its provenance, so a refetch
     * that moves a retrieval date cannot move it. */
    const body: Record<string, unknown> = { ...doc };
    delete body.product;
    delete body.venue;
    delete body.schema;
    delete body.generator;
    delete body.valuesSha256;
    delete body.inputs;
    const recomputed = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    assert.equal(recomputed, doc.valuesSha256, `${name}.json valuesSha256 is stale`);
    assert.equal(pinned.get(name), doc.valuesSha256, `${name}.json disagrees with provenance.json`);

    assert.equal(doc.inputs.manifest, "provenance.json");
  }
});

test("provenance.json names every raw input with a hash, a URL and a date", () => {
  const provenance = product("provenance");
  assert.ok(provenance.inputs.length > 900, "the lidar node set is the bulk of it");
  const files = new Set<string>();
  for (const row of provenance.inputs) {
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.ok(row.bytes > 0);
    assert.ok(row.query && row.query.length > 0, `${row.file} has no query text`);
    assert.match(row.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!files.has(row.file), `${row.file} listed twice`);
    files.add(row.file);
  }
  const sorted = [...files].sort();
  assert.deepEqual(
    provenance.inputs.map((r: { file: string }) => r.file),
    sorted,
    "inputs must be in a stable order",
  );
  assert.equal(provenance.sources.lidar.collection, "CA_LosAngeles_1_B23");
  assert.match(provenance.sources.lidar.decoder, /laz-perf 0\.0\.7/);
  assert.equal(provenance.sources.ortho.pin, "lockRaster");
});

test("a product's lidar digest is the hash of the input set provenance.json lists", () => {
  const provenance = product("provenance");
  const lidarFiles = provenance.inputs.filter((r: { file: string }) => r.file.startsWith("lidar/"));
  const lines = lidarFiles
    .map((r: { sha256: string; file: string }) => `${r.sha256}\t${r.file}`)
    .sort()
    .join("\n");
  const digest = createHash("sha256").update(lines).digest("hex");
  for (const name of ["trees", "masses", "height-fields", "shoreline", "sea-level"]) {
    assert.equal(product(name).inputs.lidar.listSha256, digest, `${name}.json lidar digest`);
    assert.equal(product(name).inputs.lidar.count, lidarFiles.length);
  }
});

test("height fields decode to the grid their own metadata describes", () => {
  const doc = product("height-fields");
  assert.equal(doc.encoding.nodata, NODATA_CM);
  for (const patch of doc.patches) {
    const raw = gunzipSync(Buffer.from(patch.ground.gzipBase64, "base64"));
    assert.equal(raw.length, patch.grid.width * patch.grid.height * 2, `${patch.name} cell count`);
    assert.equal(raw.length, patch.ground.rawBytes);
    assert.equal(sha256(raw), patch.ground.dataSha256, `${patch.name} ground hash`);

    const mask = gunzipSync(Buffer.from(patch.observed.gzipBase64, "base64"));
    assert.equal(mask.length, Math.ceil((patch.grid.width * patch.grid.height) / 8));
    assert.equal(sha256(mask), patch.observed.dataSha256, `${patch.name} mask hash`);

    let observed = 0;
    for (const byte of mask) for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) observed++;
    assert.equal(observed, patch.cells.observed, `${patch.name} observed cell count`);
    assert.ok(patch.cells.observed <= patch.cells.afterFill);
    assert.ok(patch.cells.afterFill <= patch.cells.total);

    /* Every observed cell must hold a real elevation; nodata after fill is
     * water the lidar never saw. */
    for (let i = 0; i < patch.grid.width * patch.grid.height; i++) {
      if (!(mask[i >> 3] & (1 << (i & 7)))) continue;
      assert.notEqual(raw.readInt16LE(i * 2), NODATA_CM, `${patch.name} cell ${i} observed but empty`);
    }
  }
});

test("the derived numbers still agree with the research round's measurements", () => {
  /* Ranges, not equalities: this is an independent reimplementation of the
   * research scripts in a rotated frame, so the question is whether it reads
   * the same world, not whether it reproduces the same arithmetic. */
  const masses = product("masses");
  const byPatch = new Map<string, { top: number } | null>(
    masses.patches.map((p: { name: string; tallest: { top: number } | null }) => [p.name, p.tallest]),
  );
  const near = (actual: number, expected: number, tolerance: number, what: string) =>
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${what}: ${actual} is more than ${tolerance} from the measured ${expected}`,
    );

  /* THUMS camouflage towers. Published heights are 175 and 180 ft, 53.3 and
   * 54.9 m; the three real towers are within 3 m of each other and Island
   * Freeman has none, which is why OSM carries three tower ids and not four. */
  near(byPatch.get("islandWhite")!.top, 54.77, 1, "Island White tower top");
  near(byPatch.get("islandGrissom")!.top, 54.63, 1, "Island Grissom tower top");
  near(byPatch.get("islandChaffee")!.top, 51.69, 1, "Island Chaffee tower top");
  assert.ok(byPatch.get("islandFreeman")!.top < 30, "Island Freeman has no tower");
  /* Long Beach International Gateway, published 157 m; Pier J gantries boom-up. */
  near(byPatch.get("gatewayTowers")!.top, 159.74, 2, "Gateway pylon");
  near(byPatch.get("cranesPierJ")!.top, 98.91, 2, "Pier J crane");

  const chain = masses.validation.chainCheck;
  assert.ok(chain.matched >= 10, `only ${chain.matched} downtown masses matched an OSM height`);
  assert.ok(chain.meanAbsoluteErrorM < 5, `downtown MAE ${chain.meanAbsoluteErrorM} m`);

  const shoreline = product("shoreline");
  for (const island of shoreline.islands) {
    if (island.label === "Grissom") {
      /* Grissom's OSM ring has 158 vertices against 24-43 for the others and
       * already traces the rock rather than the waterline, so its zero sits on
       * the crown and its lip reads near zero. */
      assert.ok(island.ringVertices > 100);
      assert.ok(island.lipM < 0.3, `Grissom lip ${island.lipM}`);
    } else {
      assert.ok(island.lipM >= 1.0 && island.lipM <= 1.4, `${island.label} rim lip ${island.lipM} m`);
      assert.ok(island.crownAtM >= 5 && island.crownAtM <= 15, `${island.label} crown at ${island.crownAtM} m`);
    }
    assert.ok(island.deckZ > 4.4 && island.deckZ < 5.1, `${island.label} deck ${island.deckZ} m`);
  }

  const sea = product("sea-level");
  for (const patch of sea.perPatch) {
    assert.ok(patch.z50 > 0.4 && patch.z50 < 0.9, `${patch.patch} sea plane ${patch.z50} m`);
  }

  const trees = product("trees");
  for (const island of trees.islands) {
    assert.ok(island.crownCount >= 150 && island.crownCount <= 600, `${island.label} ${island.crownCount} crowns`);
    assert.ok(island.heightM.p50 >= 4.5 && island.heightM.p50 <= 8, `${island.label} median crown ${island.heightM.p50} m`);
    for (const crown of island.crowns) assert.equal(crown.length, 4);
  }

  /* The five colour readings the research round reported, to the byte. */
  const swatches = product("swatches");
  const points = new Map<string, string>(
    swatches.points.map((p: { name: string; hex: string }) => [p.name, p.hex]),
  );
  assert.deepEqual(
    [...points.entries()].sort(),
    [
      ["islandDeck", "#b1b0a3"],
      ["islandPlanting", "#8d8b7e"],
      ["openWater", "#2c453d"],
      ["portApron", "#9fa5a4"],
      ["tankFarm", "#233f48"],
    ],
  );
});

test("the shipped venue asset is not an output of this stage", () => {
  /* The ingestion round changes no rendered pixel. If the derivation ever
   * learns to write into public/, this is where it gets caught. */
  const cli = text("scripts/layline-derive-scenery.mjs");
  assert.ok(!/public\/prototype/.test(cli.replace(/^ \*.*$/gm, "")), "the CLI must not write into public/");
  assert.ok(!text("scripts/lib/venue-scenery.mjs").includes("public/prototype"));
});
