/**
 * LAS/LAZ point decode for the venue bake, over the vendored laz-perf WASM in
 * ./laz-perf/ (Apache-2.0; bytes and sha256s in ./laz-perf/PROVENANCE.md).
 *
 * Bake-time only. Nothing here runs in the browser and nothing is installed:
 * `laz-perf.js` is loaded by path, so package.json gains no dependency.
 *
 * Three things this wrapper exists to handle, all of them observed on the
 * 3DEP CA_LosAngeles_1_B23 nodes rather than read off a spec:
 *
 *  1. Point record layout switches on PDRF. The 3DEP source is LAS 1.4 PDRF 6,
 *     but Entwine re-encodes every EPT node as LAS 1.2 PDRF 1 at 29 B/record,
 *     which puts classification in the legacy 5-bit field: it needs `& 0x1f`,
 *     and the return counts move from 4-bit to 3-bit nibbles. Other providers
 *     do serve PDRF 6, so both layouts are here rather than the one this
 *     collection happens to use.
 *  2. `getPoint` can grow the emscripten heap, which detaches every DataView
 *     onto `HEAPU8.buffer`. The view is re-derived whenever the buffer object
 *     changes; without that the decode dies at a random point index.
 *  3. The WASM module is expensive to instantiate relative to a single node
 *     (tens of ms against ~40 ms for 25k points), so one instance is created
 *     lazily and reused for the whole run.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "laz-perf");
const require = createRequire(import.meta.url);

let lazPromise = null;

/** The shared laz-perf instance, created on first use. */
export function loadLazPerf() {
  if (!lazPromise) {
    const createLazPerf = require(join(VENDOR, "laz-perf.js"));
    lazPromise = createLazPerf({ locateFile: () => join(VENDOR, "laz-perf.wasm") });
  }
  return lazPromise;
}

/** Public header block fields the point decode needs. A LAZ file carries an
 * ordinary uncompressed LAS header; only the point records are compressed. */
export function lasHeader(buf) {
  if (buf.length < 227 || buf.toString("ascii", 0, 4) !== "LASF") {
    throw new Error("not a LAS/LAZ file: missing LASF signature");
  }
  const versionMajor = buf.readUInt8(24);
  const versionMinor = buf.readUInt8(25);
  const formatByte = buf.readUInt8(104);
  const header = {
    versionMajor,
    versionMinor,
    systemIdentifier: buf.toString("ascii", 26, 58).replace(/\0+$/, ""),
    generatingSoftware: buf.toString("ascii", 58, 90).replace(/\0+$/, ""),
    creationDayOfYear: buf.readUInt16LE(90),
    creationYear: buf.readUInt16LE(92),
    headerSize: buf.readUInt16LE(94),
    offsetToPointData: buf.readUInt32LE(96),
    numberOfVlrs: buf.readUInt32LE(100),
    // The high bit of the format byte is laszip's compression flag, not part
    // of the format number.
    pointDataRecordFormat: formatByte & 0x3f,
    compressed: (formatByte & 0x80) !== 0,
    pointDataRecordLength: buf.readUInt16LE(105),
    legacyPointCount: buf.readUInt32LE(107),
    scale: [buf.readDoubleLE(131), buf.readDoubleLE(139), buf.readDoubleLE(147)],
    offset: [buf.readDoubleLE(155), buf.readDoubleLE(163), buf.readDoubleLE(171)],
    max: [buf.readDoubleLE(179), buf.readDoubleLE(195), buf.readDoubleLE(211)],
    min: [buf.readDoubleLE(187), buf.readDoubleLE(203), buf.readDoubleLE(219)],
    /* LAS 1.4 widens the point count to 64 bits and leaves the legacy 32-bit
     * field zero for counts that do not fit; 1.2 has only the legacy field. */
    pointCount:
      versionMinor >= 4 && buf.length >= 255
        ? Number(buf.readBigUInt64LE(247))
        : buf.readUInt32LE(107),
  };
  return header;
}

/**
 * Field offsets inside one decoded point record, by point data record format.
 *
 * PDRF 0-5 are the LAS 1.2 layouts: classification is one byte whose low five
 * bits are the class and whose top three are synthetic/key-point/withheld
 * flags, and the return byte packs 3-bit return number and 3-bit return count.
 * PDRF 6-10 are the LAS 1.4 layouts: classification widens to a full byte, the
 * flags move to their own byte, the return nibbles widen to 4 bits and the
 * scan angle becomes a signed 16-bit count of 0.006 degree steps.
 */
export function layout(pdrf) {
  if (pdrf < 0 || pdrf > 10) throw new Error(`unsupported point data record format ${pdrf}`);
  if (pdrf >= 6) {
    return {
      pdrf,
      wide: true,
      intensity: 12,
      returnByte: 14,
      returnMask: 0x0f,
      returnShift: 4,
      classification: 16,
      classificationMask: 0xff,
      scanAngle: { at: 18, int16: true },
      gpsTime: 22,
    };
  }
  return {
    pdrf,
    wide: false,
    intensity: 12,
    returnByte: 14,
    returnMask: 0x07,
    returnShift: 3,
    classification: 15,
    // Legacy layout: the class is the low five bits, the rest are flags.
    classificationMask: 0x1f,
    scanAngle: { at: 16, int16: false },
    gpsTime: pdrf === 1 || pdrf === 3 || pdrf === 4 || pdrf === 5 ? 20 : null,
  };
}

/**
 * Scatter one decoded point record into parallel output columns.
 *
 * Split out of the decode loop so the layout switch is testable without a LAZ
 * file: the legacy mask and the return-nibble widths are the two places a
 * wrong answer would be silent rather than loud.
 */
export function readPointInto(view, ptr, lay, header, out, i) {
  const [sx, sy, sz] = header.scale;
  const [ox, oy, oz] = header.offset;
  out.x[i] = view.getInt32(ptr, true) * sx + ox;
  out.y[i] = view.getInt32(ptr + 4, true) * sy + oy;
  out.z[i] = view.getInt32(ptr + 8, true) * sz + oz;
  out.intensity[i] = view.getUint16(ptr + lay.intensity, true);
  const returnByte = view.getUint8(ptr + lay.returnByte);
  out.returnNumber[i] = returnByte & lay.returnMask;
  out.numberOfReturns[i] = (returnByte >> lay.returnShift) & lay.returnMask;
  out.classification[i] = view.getUint8(ptr + lay.classification) & lay.classificationMask;
  if (lay.gpsTime !== null && out.gpsTime) {
    out.gpsTime[i] = view.getFloat64(ptr + lay.gpsTime, true);
  }
}

/** Empty output columns for `count` points in a given layout. */
export function pointColumns(count, lay) {
  return {
    count,
    x: new Float64Array(count),
    y: new Float64Array(count),
    z: new Float64Array(count),
    classification: new Uint8Array(count),
    intensity: new Uint16Array(count),
    returnNumber: new Uint8Array(count),
    numberOfReturns: new Uint8Array(count),
    gpsTime: lay.gpsTime === null ? null : new Float64Array(count),
  };
}

/**
 * Decode every point of a LAS/LAZ buffer into parallel typed arrays.
 *
 * Returns { header, layout, count, x, y, z, classification, intensity,
 * returnNumber, numberOfReturns, gpsTime }, where x/y are in the file's own
 * horizontal CRS and gpsTime is null for formats that carry no time field.
 */
export async function decodeLaz(buffer) {
  const laz = await loadLazPerf();
  const header = lasHeader(buffer);
  const lay = layout(header.pointDataRecordFormat);

  const filePtr = laz._malloc(buffer.byteLength);
  laz.HEAPU8.set(buffer, filePtr);
  const reader = new laz.LASZip();
  let pointPtr = 0;
  try {
    reader.open(filePtr, buffer.byteLength);
    const count = reader.getCount();
    const recordLength = reader.getPointLength();
    pointPtr = laz._malloc(recordLength);

    const out = {
      header,
      layout: lay,
      pointFormat: reader.getPointFormat(),
      recordLength,
      ...pointColumns(count, lay),
    };

    /* getPoint can grow the emscripten heap; a grown heap is a new
     * ArrayBuffer and every view onto the old one is detached. Re-derive the
     * view whenever the buffer identity changes. */
    let heap = laz.HEAPU8.buffer;
    let view = new DataView(heap);
    for (let i = 0; i < count; i++) {
      reader.getPoint(pointPtr);
      if (laz.HEAPU8.buffer !== heap) {
        heap = laz.HEAPU8.buffer;
        view = new DataView(heap);
      }
      readPointInto(view, pointPtr, lay, header, out, i);
    }
    return out;
  } finally {
    reader.delete();
    if (pointPtr) laz._free(pointPtr);
    laz._free(filePtr);
  }
}

/**
 * Adjusted Standard GPS Time to a Date.
 *
 * LAS 1.4's global-encoding default, which 3DEP uses, is seconds since the GPS
 * epoch minus 1e9. GPS time runs without leap seconds and 18 have accumulated
 * since 1980-01-06, so UTC = GPS - 18 s for anything flown from 2017 on.
 */
export function gpsToDate(adjusted) {
  return new Date(Date.UTC(1980, 0, 6) + (adjusted + 1e9 - 18) * 1000);
}

/** ASPRS class numbers this project reads, for logs and reports. */
export const CLASS_NAMES = {
  0: "never classified",
  1: "unassigned",
  2: "ground",
  3: "low vegetation",
  4: "medium vegetation",
  5: "high vegetation",
  6: "building",
  7: "low point (noise)",
  9: "water",
  10: "rail",
  11: "road surface",
  13: "wire guard",
  14: "wire conductor",
  15: "transmission tower",
  17: "bridge deck",
  18: "high noise",
  20: "ignored ground",
  21: "snow",
  22: "temporal exclusion",
};
