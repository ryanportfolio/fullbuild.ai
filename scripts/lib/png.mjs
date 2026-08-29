/* Enough PNG to compare two screenshots, and no more.
 *
 * `--compare` has to say how far apart two captures are in channel samples, and
 * a canvas readback is not the tool for that: the browser is entitled to colour
 * manage what it hands back, so a difference could belong to the comparison
 * rather than to the picture. Chrome writes 8-bit non-interlaced PNGs, zlib is
 * in node, and unfiltering is thirty lines, so the comparison reads the exact
 * bytes that were written.
 *
 * Supports what Chrome emits: bit depth 8, colour types 0, 2, 4 and 6, no
 * interlace. Anything else throws by name rather than decoding wrongly.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Decode to { width, height, channels, data } with one byte per sample. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let at = 8;
  let header = null;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("ascii", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += length + 12;
  }
  if (header === null) throw new Error("PNG has no IHDR");
  if (header.depth !== 8) throw new Error(`PNG bit depth ${header.depth}, only 8 is supported`);
  if (header.interlace !== 0) throw new Error("interlaced PNG is not supported");
  const channels = CHANNELS[header.colour];
  if (channels === undefined) throw new Error(`PNG colour type ${header.colour} is not supported`);

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = header;
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = src;
    src += stride;
    const out = y * stride;
    const prior = out - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[row + i];
      const a = i >= channels ? data[out + i - channels] : 0;
      const b = y > 0 ? data[prior + i] : 0;
      const c = i >= channels && y > 0 ? data[prior + i - channels] : 0;
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) value = x + paeth(a, b, c);
      else throw new Error(`unknown PNG row filter ${filter}`);
      data[out + i] = value & 0xff;
    }
  }
  return { width, height, channels, data };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Compare two decoded images over their colour channels.
 *
 * Alpha is skipped: these are opaque frames and an alpha byte that differs is
 * an encoder choice, not a picture. `over` counts samples past a threshold,
 * which is what separates "the same frame, rounded differently" from "a
 * different frame": the polar cloud's known rasterisation wobble is 1 LSB.
 */
export function comparePng(a, b, threshold = 1) {
  if (a.width !== b.width || a.height !== b.height) {
    return { comparable: false, reason: `${a.width}x${a.height} against ${b.width}x${b.height}` };
  }
  const colours = Math.min(a.channels, b.channels) === 1 ? 1 : 3;
  let differing = 0;
  let over = 0;
  let max = 0;
  let total = 0;
  let samples = 0;
  const pixels = a.width * a.height;
  for (let p = 0; p < pixels; p++) {
    const ai = p * a.channels;
    const bi = p * b.channels;
    for (let c = 0; c < colours; c++) {
      const delta = Math.abs(a.data[ai + c] - b.data[bi + c]);
      samples += 1;
      if (delta === 0) continue;
      differing += 1;
      total += delta;
      if (delta > max) max = delta;
      if (delta > threshold) over += 1;
    }
  }
  return {
    comparable: true,
    samples,
    differing,
    over,
    threshold,
    maxDelta: max,
    meanDelta: differing === 0 ? 0 : Math.round((total / differing) * 1000) / 1000,
    /* share of colour samples that differ at all, in per cent */
    percent: Math.round((differing / samples) * 1e6) / 1e4,
  };
}

export function readPng(path) {
  return decodePng(readFileSync(path));
}
