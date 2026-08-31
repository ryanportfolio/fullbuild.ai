/**
 * NAIP colour oracle: pinned crops from The National Map's USGSNAIPImagery
 * ImageServer, and the readback the derived swatches are medians of.
 *
 * Keyless, no token, USGS/USDA public domain. Four traps decide the shape of
 * this module, all of them measured during the research round and all of them
 * silent failures rather than errors:
 *
 *  1. The national mosaic keeps gaining newer years, so an unpinned
 *     `exportImage` is not reproducible. `esriMosaicLockRaster` pins the export
 *     to one catalogue item, which is what makes a URL a permanent address.
 *  2. A `lockRasterIds` array holding all sixteen venue quads 502s repeatably.
 *     One id per request does not, so the covering quad is chosen per patch and
 *     ties break on the lowest OBJECTID.
 *  3. Locking to a quad that does not cover the requested box returns a
 *     1,897-byte all-white PNG under HTTP 200. `verifyCoverage` rejects that
 *     before it can reach the cache and become a permanent wrong answer.
 *  4. `interpolation` changes the returned bytes, and so does an unrounded
 *     bbox, so both are pinned: bboxes are fixed to three decimals and every
 *     other query parameter is a constant.
 *
 * The service also returns transient 502s under load on URLs that are otherwise
 * known good, which is why the archived crop, not the network, is what a
 * derivation reads; `cachedFetch` retries with backoff to fill the cache.
 */
import { inflateSync } from "node:zlib";
import { cachedFetch, provenanceOf, sha256 } from "./venue-cache.mjs";
import { toMercator } from "./geo.mjs";

const DEG = Math.PI / 180;

/**
 * Minimal PNG decode: 8-bit RGB or RGBA, non-interlaced, which is what png24
 * exports are. The same path the baker uses for Terrarium tiles, kept here so
 * the ingestion modules have no dependency on the baker's internals.
 */
export function decodePng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(
          `unsupported PNG: depth ${bitDepth} color ${colorType} interlace ${interlace}`,
        );
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const line = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
      line[i] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** Square patch of `metres` ground metres about lon/lat, as an EPSG:3857 box.
 * Mercator units are cos(lat) ground metres, so the box widens by 1/cos(lat);
 * three decimals is a tenth of a millimetre and makes the URL byte-stable. */
export function patchBbox(lon, lat, metres) {
  const [cx, cy] = toMercator(lon, lat);
  const half = metres / 2 / Math.cos(lat * DEG);
  const r3 = (v) => Number(v.toFixed(3));
  return [r3(cx - half), r3(cy - half), r3(cx + half), r3(cy + half)];
}

/** The catalogue quad to lock a crop to: one that covers the whole box, else
 * one that covers its centre. Lowest OBJECTID wins in the seam overlaps, so a
 * given box always resolves to the same scene. */
export function quadForBbox(quads, bbox, lon, lat) {
  const [x0, y0, x1, y1] = bbox;
  const corners = [
    [x0, y0],
    [x1, y1],
  ].map(([x, y]) => {
    const lonDeg = (x * 180) / (Math.PI * 6378137);
    const latDeg = ((2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180) / Math.PI;
    return [lonDeg, latDeg];
  });
  const covers = (q, [qlon, qlat]) =>
    qlon >= q.lon[0] && qlon <= q.lon[1] && qlat >= q.lat[0] && qlat <= q.lat[1];
  const byId = [...quads].sort((a, b) => a.id - b.id);
  const whole = byId.filter((q) => corners.every((c) => covers(q, c)));
  if (whole.length) return { quad: whole[0], coverage: "box" };
  const centre = byId.filter((q) => covers(q, [lon, lat]));
  if (centre.length) return { quad: centre[0], coverage: "centre" };
  throw new Error(`no NAIP quad covers ${lat}, ${lon}`);
}

/** Fixed-shape exportImage URL. Every varying part is an argument and the
 * parameter order is fixed, so one (bbox, size, objectId) is one address. */
export function exportUrl({ service, bbox, size, objectId, rendering }) {
  const q = new URLSearchParams({
    bbox: bbox.join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${size},${size}`,
    format: "png24",
    interpolation: rendering.interpolation,
    mosaicRule: JSON.stringify({
      mosaicMethod: "esriMosaicLockRaster",
      lockRasterIds: [objectId],
      ascending: true,
      mosaicOperation: "MT_FIRST",
    }),
    renderingRule: JSON.stringify({ rasterFunction: rendering.rasterFunction }),
    f: "image",
  });
  return `${service}/exportImage?${q}`;
}

/**
 * Reject the all-white HTTP 200. A crop locked to a quad that does not cover
 * the box comes back as a two-kilobyte image of nothing, so the test is on the
 * pixels rather than on the status line or the byte count.
 */
export function verifyCoverage(buffer, { maxWhiteFraction = 0.98 } = {}) {
  const img = decodePng(buffer);
  const pixels = img.width * img.height;
  let white = 0;
  for (let i = 0; i < pixels; i++) {
    const at = i * img.channels;
    if (img.data[at] === 255 && img.data[at + 1] === 255 && img.data[at + 2] === 255) white++;
  }
  const fraction = white / pixels;
  if (fraction > maxWhiteFraction) {
    throw new Error(
      `NAIP crop is ${(fraction * 100).toFixed(1)}% pure white: the locked quad does not cover this box`,
    );
  }
  return { img, whiteFraction: fraction };
}

/** Fetch (or read) one pinned crop and decode it. */
export async function fetchCrop(ortho, { name, lon, lat, metres, size = 512 }) {
  const bbox = patchBbox(lon, lat, metres);
  const { quad, coverage } = quadForBbox(ortho.quads, bbox, lon, lat);
  const url = exportUrl({
    service: ortho.service,
    bbox,
    size,
    objectId: quad.id,
    rendering: ortho.rendering,
  });
  const rel = `naip/${quad.name}-lock${quad.id}-${size}px-${metres}m-${sha256(Buffer.from(url)).slice(0, 12)}.png`;
  /* Eight tries. A cold run over seven crops hit one 502 that outlasted five
   * attempts and cleared on the next request a minute later, so the retry
   * budget is sized for the service's mood rather than for a single blip. */
  const buf = await cachedFetch(url, rel, {
    label: `NAIP ${name}`,
    verify: verifyCoverage,
    retries: 8,
  });
  const { img, whiteFraction } = verifyCoverage(buf);
  return {
    name,
    lon,
    lat,
    metres,
    size,
    bbox,
    quad,
    coverage,
    whiteFraction,
    img,
    bytes: buf.length,
    provenance: {
      file: rel,
      sha256: sha256(buf),
      bytes: buf.length,
      query: url,
      retrieved: provenanceOf(rel)?.retrieved ?? null,
    },
  };
}

/** Pixel column/row of a lon/lat inside a crop, or null if outside it. */
export function pixelAt(crop, lon, lat) {
  const [x, y] = toMercator(lon, lat);
  const u = (x - crop.bbox[0]) / (crop.bbox[2] - crop.bbox[0]);
  const v = 1 - (y - crop.bbox[1]) / (crop.bbox[3] - crop.bbox[1]);
  const px = Math.round(u * crop.img.width - 0.5);
  const py = Math.round(v * crop.img.height - 0.5);
  if (px < 0 || py < 0 || px >= crop.img.width || py >= crop.img.height) return null;
  return { px, py };
}

/** Component-wise median RGB of a list of [px, py] pixels. Each channel is
 * taken independently, which is the usual swatch convention: the result is a
 * representative colour, not a pixel that exists in the image. */
export function medianRgb(crop, pixels) {
  if (!pixels.length) return null;
  const r = new Uint8Array(pixels.length);
  const g = new Uint8Array(pixels.length);
  const b = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const at = (pixels[i][1] * crop.img.width + pixels[i][0]) * crop.img.channels;
    r[i] = crop.img.data[at];
    g[i] = crop.img.data[at + 1];
    b[i] = crop.img.data[at + 2];
  }
  const mid = pixels.length >> 1;
  const med = (a) => a.sort()[mid];
  return [med(r), med(g), med(b)];
}

/** Median RGB over a square window of pixels centred on a lon/lat. */
export function swatchAt(crop, lon, lat, windowPx = 15) {
  const centre = pixelAt(crop, lon, lat);
  if (!centre) return null;
  const half = windowPx >> 1;
  const pixels = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const px = centre.px + dx;
      const py = centre.py + dy;
      if (px < 0 || py < 0 || px >= crop.img.width || py >= crop.img.height) continue;
      pixels.push([px, py]);
    }
  }
  return { rgb: medianRgb(crop, pixels), pixels: pixels.length };
}

export const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
