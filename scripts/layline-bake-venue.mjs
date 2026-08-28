/**
 * Bake real-world shore geometry for a Layline venue.
 *
 * Input: a venue id from VENUES below (origin lat/lon, course bearing).
 * Sources, both keyless and fetched at bake time only:
 *   - OpenStreetMap via Overpass: coastline ways, breakwaters, cranes.
 *   - AWS/Mapzen Terrarium elevation tiles (z11), decoded here without deps.
 * Output, committed to the repo so the runtime never touches the network:
 *   - public/prototype/layline/venues/<id>.bin  (gzipped LVN1 mesh)
 *   - public/prototype/layline/venues/<id>.json (manifest + attribution)
 *   - .tmp/venue-<id>.svg (top-down debug plot, not committed)
 *
 * Frames. ENU metres at the origin; course frame is ENU rotated so +y points
 * up the course axis (bearing degrees true). The scene maps course (x, y) to
 * world (x, -z), y up, 1 unit = 1 m; positions in the binary are world frame,
 * so the runtime does no math beyond dequantisation.
 *
 * The mesh is drawn unlit in one flat colour mixed toward the sky by haze,
 * exactly like the procedural shore it replaces, so only the silhouette
 * matters: interior seams between the cap, the relief grid and the walls are
 * invisible by construction. That is what lets this stay one draw call.
 *
 * LVN2 layout, little endian, after gunzip:
 *   u32 magic 0x324e564c  ("LVN2")
 *   u32 vertCount, u32 indexCount, u32 flags (bit 0: 32-bit indices)
 *   i16 pos[vertCount*3]   world x (m), y (0.1 m units), z (m)
 *   u8  fade[vertCount]    0..255, the aFade the shore shader already takes
 *   u8  shade[vertCount]   hillshade, 128 = flat colour, /128 multiplies it
 *   pad to 4 bytes
 *   u16|u32 idx[indexCount]
 *
 * Run: node scripts/layline-bake-venue.mjs long-beach
 */

import { gzipSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VENUES = {
  "long-beach": {
    /* Long Beach outer harbour, inside the breakwater: flat water with the
     * working port wrapped around it, open toward Queens Gate up the course. */
    origin: { lat: 33.742, lon: -118.155 },
    bearing: 215, // deg true, direction of the course axis (+y, toward windward)
    attribution: [
      "Map data (c) OpenStreetMap contributors, ODbL",
      "Elevation: Mapzen Terrarium tiles via AWS Open Data",
    ],
  },
};

/* Geometry budget. CLIP_R is the disc the shore is cut to; FADE_* dissolve the
 * far coast into the haze the way the procedural arc's taper did, so nothing
 * ends at a visible clip edge. Camera far plane is 12000. */
const CLIP_R = 10500;
const FADE_START = 6000;
const FADE_END = 10000;
const BASE_Y = -4; // wall foot, below every Gerstner trough
const MIN_SHORE_H = 2.5; // a coast that reaches 0 anywhere cuts into islands
const SIMPLIFY_NEAR = 10; // m tolerance inside 3 km
const SIMPLIFY_FAR = 45; // m tolerance beyond 6 km
const RELIEF_CELL = 120; // m, terrain lattice pitch
const DEM_ZOOM = 11;
const ARC_STEP = (2 * Math.PI) / 180;

const DEG = Math.PI / 180;
const CACHE = ".tmp/venue-cache";
mkdirSync(CACHE, { recursive: true });
mkdirSync(".tmp", { recursive: true });

const venueId = process.argv[2];
const venue = VENUES[venueId];
if (!venue) {
  console.error(`unknown venue "${venueId}"; known: ${Object.keys(VENUES).join(", ")}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ frames */

const lat0 = venue.origin.lat;
const lon0 = venue.origin.lon;
const mPerLat = 110574;
const mPerLon = 111320 * Math.cos(lat0 * DEG);
const bearingRad = venue.bearing * DEG;
const cosB = Math.cos(bearingRad);
const sinB = Math.sin(bearingRad);

/** lat/lon -> course-frame metres { x: across, y: up the course axis }. */
function project(lat, lon) {
  const e = (lon - lon0) * mPerLon;
  const n = (lat - lat0) * mPerLat;
  return { x: e * cosB - n * sinB, y: e * sinB + n * cosB };
}

/** course-frame -> lat/lon, for DEM sampling of derived points. */
function unproject(x, y) {
  const e = x * cosB + y * sinB;
  const n = -x * sinB + y * cosB;
  return { lat: lat0 + n / mPerLat, lon: lon0 + e / mPerLon };
}

/* ------------------------------------------------------------------- fetch */

async function cachedFetch(url, cacheName, binary) {
  const path = join(CACHE, cacheName);
  if (existsSync(path)) {
    return binary ? readFileSync(path) : readFileSync(path, "utf8");
  }
  const res = await fetch(url, { headers: { "User-Agent": "layline-venue-bake/1" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
  writeFileSync(path, body);
  return body;
}

async function fetchOverpass() {
  const margin = CLIP_R + 1500;
  const dLat = margin / mPerLat;
  const dLon = margin / mPerLon;
  const bbox = `${lat0 - dLat},${lon0 - dLon},${lat0 + dLat},${lon0 + dLon}`;
  const query = `[out:json][timeout:180];(
    way["natural"="coastline"](${bbox});
    way["man_made"="breakwater"](${bbox});
    node["man_made"="crane"](${bbox});
    way["man_made"="crane"](${bbox});
  );out geom;`;
  const text = await cachedFetch(
    "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query),
    `overpass-${venueId}.json`,
    false,
  );
  return JSON.parse(text);
}

/* ------------------------------------------------- terrarium PNG elevation */

/** Minimal PNG decode: 8-bit RGB/RGBA, non-interlaced, which is what the
 * Terrarium tiles are. Returns { width, height, channels, data }. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
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
        throw new Error(`unsupported PNG: depth ${bitDepth} color ${colorType} interlace ${interlace}`);
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

const demTiles = new Map();

async function demTile(tx, ty) {
  const key = `${tx}/${ty}`;
  let tile = demTiles.get(key);
  if (!tile) {
    const buffer = await cachedFetch(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${tx}/${ty}.png`,
      `terrarium-${DEM_ZOOM}-${tx}-${ty}.png`,
      true,
    );
    tile = decodePng(buffer);
    demTiles.set(key, tile);
  }
  return tile;
}

/** Elevation in metres at lat/lon, bilinear across the tile mosaic.
 * Terrarium encodes bathymetry too, so open water reads negative. */
function demAt(lat, lon) {
  const scale = 2 ** DEM_ZOOM;
  const fx = ((lon + 180) / 360) * scale;
  const latRad = lat * DEG;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  const px = fx * 256 - 0.5;
  const py = fy * 256 - 0.5;
  const sample = (ix, iy) => {
    const tx = Math.floor(ix / 256);
    const ty = Math.floor(iy / 256);
    const tile = demTiles.get(`${tx}/${ty}`);
    if (!tile) return 0;
    const cx = ix - tx * 256;
    const cy = iy - ty * 256;
    const at = (cy * tile.width + cx) * tile.channels;
    return tile.data[at] * 256 + tile.data[at + 1] + tile.data[at + 2] / 256 - 32768;
  };
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const u = px - x0;
  const v = py - y0;
  return (
    sample(x0, y0) * (1 - u) * (1 - v) +
    sample(x0 + 1, y0) * u * (1 - v) +
    sample(x0, y0 + 1) * (1 - u) * v +
    sample(x0 + 1, y0 + 1) * u * v
  );
}

async function prefetchDem() {
  const scale = 2 ** DEM_ZOOM;
  const margin = CLIP_R + 1000;
  const corners = [
    [lat0 + margin / mPerLat, lon0 - margin / mPerLon],
    [lat0 - margin / mPerLat, lon0 + margin / mPerLon],
  ];
  const tiles = corners.map(([lat, lon]) => {
    const latRad = lat * DEG;
    return [
      Math.floor(((lon + 180) / 360) * scale),
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
    ];
  });
  const [x0, y0] = tiles[0];
  const [x1, y1] = tiles[1];
  const jobs = [];
  for (let tx = Math.min(x0, x1); tx <= Math.max(x0, x1); tx++) {
    for (let ty = Math.min(y0, y1); ty <= Math.max(y0, y1); ty++) {
      jobs.push(demTile(tx, ty));
    }
  }
  await Promise.all(jobs);
  console.log(`DEM: ${jobs.length} terrarium tiles at z${DEM_ZOOM}`);
}

/** Ground height in course-frame metres. */
function groundAt(x, y) {
  const { lat, lon } = unproject(x, y);
  return demAt(lat, lon);
}

/* -------------------------------------------------- coastline ring assembly */

const keyOf = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** Join ways that share endpoints into maximal chains. */
function assembleChains(ways) {
  const chains = ways.map((way) => way.geometry.map((g) => project(g.lat, g.lon)));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const a = chains[i];
        const b = chains[j];
        if (keyOf(a[a.length - 1]) === keyOf(b[0])) {
          chains[i] = a.concat(b.slice(1));
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

const inside = (p) => p.x * p.x + p.y * p.y <= CLIP_R * CLIP_R;

/** Intersection of segment a->b with the clip circle, the one crossing t in (0,1]. */
function circleHit(a, b, wantExit) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (a.x * dx + a.y * dy);
  const C = a.x * a.x + a.y * a.y - CLIP_R * CLIP_R;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-B - root) / (2 * A);
  const t2 = (-B + root) / (2 * A);
  const t = wantExit ? t2 : t1;
  if (t < 0 || t > 1) {
    const other = wantExit ? t1 : t2;
    if (other < 0 || other > 1) return null;
    return { x: a.x + dx * other, y: a.y + dy * other };
  }
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Clip one chain to the disc. Returns { closed, open } pieces. A chain whose
 * ends meet is a ring; clipping can split any chain into several pieces. */
function clipChain(points) {
  const isRing = keyOf(points[0]) === keyOf(points[points.length - 1]);
  if (isRing && points.every(inside)) {
    return { closed: [points.slice(0, -1)], open: [] };
  }
  if (isRing && !points.some(inside)) {
    return { closed: [], open: [] };
  }
  const open = [];
  let piece = null;
  const finish = () => {
    if (piece && piece.length >= 2) open.push(piece);
    piece = null;
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn && bIn) {
      if (!piece) piece = [a];
      piece.push(b);
    } else if (aIn && !bIn) {
      if (!piece) piece = [a];
      const hit = circleHit(a, b, true);
      if (hit) piece.push(hit);
      finish();
    } else if (!aIn && bIn) {
      const hit = circleHit(a, b, false);
      piece = hit ? [hit, b] : [b];
    } else {
      /* both outside; the segment can still cross the disc */
      const hitIn = circleHit(a, b, false);
      const hitOut = circleHit(a, b, true);
      if (hitIn && hitOut && (hitIn.x !== hitOut.x || hitIn.y !== hitOut.y)) {
        open.push([hitIn, hitOut]);
      }
    }
  }
  finish();
  if (isRing && open.length === 0 && inside(points[0])) {
    return { closed: [points.slice(0, -1)], open: [] };
  }
  /* A clipped ring's first and last pieces are one boundary run when the ring
   * starts inside: stitch them. */
  if (isRing && open.length >= 2 && inside(points[0])) {
    const first = open[0];
    const last = open.pop();
    if (keyOf(last[last.length - 1]) === keyOf(first[0])) {
      open[0] = last.concat(first.slice(1));
    } else {
      open.push(last);
    }
  }
  return { closed: [], open };
}

/** Close clipped open chains against the circle. Coastline is drawn with land
 * on the left, and disc-interior is on the left walking the circle CCW, so
 * from each chain exit the boundary continues CCW to the nearest chain entry. */
function closeAgainstCircle(openChains) {
  const rings = [];
  /* The stitch below assumes every endpoint sits on the circle. A dangling
   * end inside the disc is a break in the source data; extend it radially and
   * say so, which costs a chord out to the rim instead of a chord across the
   * whole disc. */
  const snapped = openChains.map((chain) => {
    const out = chain.slice();
    for (const end of [0, out.length - 1]) {
      const p = out[end];
      const r = Math.hypot(p.x, p.y);
      if (r < CLIP_R - 1) {
        console.warn(
          `  warning: dangling chain end at r=${Math.round(r)} (${Math.round(p.x)},${Math.round(p.y)}), extending to rim`,
        );
        const rim = { x: (p.x / r) * CLIP_R, y: (p.y / r) * CLIP_R };
        if (end === 0) out.unshift(rim);
        else out.push(rim);
      }
    }
    return out;
  });
  const unused = snapped.slice();
  const angleOf = (p) => Math.atan2(p.y, p.x);
  while (unused.length > 0) {
    let ring = unused.shift().slice();
    let guard = 0;
    for (;;) {
      if (guard++ > 500) throw new Error("ring closing did not converge");
      const exit = ring[ring.length - 1];
      const exitAngle = angleOf(exit);
      /* nearest entry CCW from the exit, the start of some unused chain or of
       * this ring itself */
      let best = -1;
      let bestDelta = Infinity;
      const candidates = unused.map((chain) => angleOf(chain[0]));
      candidates.push(angleOf(ring[0]));
      for (let i = 0; i < candidates.length; i++) {
        let delta = candidates[i] - exitAngle;
        while (delta <= 1e-9) delta += 2 * Math.PI;
        if (delta < bestDelta) {
          bestDelta = delta;
          best = i;
        }
      }
      /* walk the arc */
      for (let a = ARC_STEP; a < bestDelta; a += ARC_STEP) {
        ring.push({
          x: Math.cos(exitAngle + a) * CLIP_R,
          y: Math.sin(exitAngle + a) * CLIP_R,
        });
      }
      if (best === candidates.length - 1) {
        rings.push(ring);
        break;
      }
      const next = unused.splice(best, 1)[0];
      ring = ring.concat(next);
    }
  }
  return rings;
}

function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Douglas-Peucker with distance-scaled tolerance. */
function simplify(ring) {
  const tolAt = (p) => {
    const d = Math.hypot(p.x, p.y);
    const t = Math.min(Math.max((d - 3000) / 3000, 0), 1);
    return SIMPLIFY_NEAR + (SIMPLIFY_FAR - SIMPLIFY_NEAR) * t;
  };
  const keep = new Array(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    if (to - from < 2) continue;
    const a = ring[from];
    const b = ring[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstDist = 0;
    for (let i = from + 1; i < to; i++) {
      const p = ring[i];
      const dist = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
      if (dist > worstDist) {
        worstDist = dist;
        worst = i;
      }
    }
    if (worst >= 0 && worstDist > tolAt(ring[worst])) {
      keep[worst] = true;
      stack.push([from, worst], [worst, to]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  /* ring: drop the duplicate closing point if present */
  if (out.length > 1 && keyOf(out[0]) === keyOf(out[out.length - 1])) out.pop();
  return out;
}

/** Even-odd point in polygon over a set of rings. */
function insideLand(rings, x, y) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        hit = !hit;
      }
    }
  }
  return hit;
}

/* ------------------------------------------------------------ triangulation */

/** Ear clipping, O(n^2), bake-time only. Ring must be CCW, no holes. Returns
 * index triples into the ring. */
function earcut(ring) {
  const n = ring.length;
  if (n < 3) return [];
  const next = new Array(n);
  const prev = new Array(n);
  for (let i = 0; i < n; i++) {
    next[i] = (i + 1) % n;
    prev[i] = (i + n - 1) % n;
  }
  const cross = (o, a, b) =>
    (ring[a].x - ring[o].x) * (ring[b].y - ring[o].y) -
    (ring[a].y - ring[o].y) * (ring[b].x - ring[o].x);
  const inTriangle = (a, b, c, p) => {
    const s1 = cross(a, b, p);
    const s2 = cross(b, c, p);
    const s3 = cross(c, a, p);
    return s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9;
  };
  const triangles = [];
  let remaining = n;
  let ear = 0;
  let missCount = 0;
  while (remaining > 3) {
    const a = prev[ear];
    const b = ear;
    const c = next[ear];
    let isEar = cross(a, b, c) > 1e-9;
    if (isEar) {
      for (let p = next[c]; p !== a; p = next[p]) {
        if (inTriangle(a, b, c, p)) {
          isEar = false;
          break;
        }
      }
    }
    if (isEar) {
      triangles.push(a, b, c);
      next[a] = c;
      prev[c] = a;
      remaining -= 1;
      ear = a;
      missCount = 0;
    } else {
      ear = next[ear];
      missCount += 1;
      if (missCount > remaining) {
        /* degenerate remainder (collinear slivers); clip whatever is left */
        triangles.push(a, b, c);
        next[a] = c;
        prev[c] = a;
        remaining -= 1;
        ear = a;
        missCount = 0;
      }
    }
  }
  triangles.push(prev[ear], ear, next[ear]);
  return triangles;
}

/* ------------------------------------------------------------- mesh builder */

const positions = [];
const fades = [];
const shades = [];
const indices = [];
const vertexIndex = new Map();

/* The scene's one sun (sky.ts: elevation 22, azimuth 305 in the course frame),
 * expressed in bake space (x, up, courseY). Form is baked as a per-vertex
 * lambert against it: unlit flat colour reads as cardboard from any camera
 * above the horizon, and the freeform rig goes there. */
const SUN_EL = 22 * DEG;
const SUN_AZ = 305 * DEG;
const SUN = {
  x: Math.cos(SUN_EL) * Math.sin(SUN_AZ),
  h: Math.sin(SUN_EL),
  y: Math.cos(SUN_EL) * Math.cos(SUN_AZ),
};

/** Shade byte for a surface normal: 128 = the flat colour, below is shadow
 * side, above is sun side. The runtime multiplies the shore colour by
 * shade/128. */
function shadeOf(nx, nh, ny) {
  const len = Math.hypot(nx, nh, ny) || 1;
  const lambert = Math.max((nx * SUN.x + nh * SUN.h + ny * SUN.y) / len, 0);
  return Math.max(0, Math.min(255, Math.round((0.62 + 0.55 * lambert) * 128)));
}

const SHADE_FLAT = shadeOf(0, 1, 0);

function fadeAt(x, y) {
  const d = Math.hypot(x, y);
  const t = Math.min(Math.max((d - FADE_START) / (FADE_END - FADE_START), 0), 1);
  const s = 1 - t * t * (3 - 2 * t);
  return s;
}

function vertex(x, h, y, shade = SHADE_FLAT) {
  /* quantise here so dedup sees the shipped coordinates */
  const qx = Math.round(x);
  const qh = Math.round(h * 10);
  const qz = Math.round(-y);
  const key = `${qx},${qh},${qz},${shade}`;
  let index = vertexIndex.get(key);
  if (index === undefined) {
    index = positions.length / 3;
    positions.push(qx, qh, qz);
    fades.push(Math.round(fadeAt(x, y) * 255));
    shades.push(shade);
    vertexIndex.set(key, index);
  }
  return index;
}

function triangle(a, b, c) {
  if (a !== b && b !== c && a !== c) indices.push(a, b, c);
}

/** DEM with a little lateral smoothing, so one noisy sample cannot put a spike
 * or a pit into the surface. */
function smoothGround(x, y) {
  const r = 75;
  return (
    (2 * groundAt(x, y) +
      groundAt(x + r, y) +
      groundAt(x - r, y) +
      groundAt(x, y + r) +
      groundAt(x, y - r)) /
    6
  );
}

/** Shore height at a ring vertex: the higher of the ground right there and a
 * short distance inland, so a bluff behind a beach still shapes the coast
 * wall. Clamped well below the hills: the wall is the waterline face, the
 * relief surface behind it owns the skyline. Inland is the left side of the
 * boundary direction. */
function shoreHeight(ring, i) {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let h = groundAt(a.x, a.y);
  for (const off of [40, 100]) {
    h = Math.max(h, groundAt(a.x + nx * off, a.y + ny * off));
  }
  return Math.min(Math.max(h, MIN_SHORE_H), 90);
}

/**
 * The land, as one surface in two parts that never fight:
 *
 * - a low cap per ring, its heights taken from the shoreline only and clamped
 *   to 25 m, sealing every polygon so land is never hollow from above;
 * - a continuous relief lattice over the interior, smoothed DEM heights, one
 *   quad per cell whose four corners all sit on land, no skirts. Hills rise
 *   out of the cap; where the terrain is lower than the coast bluff the cap
 *   simply stays on top. A cell is emitted only above the seal band, so the
 *   flats do not pay for a second surface.
 *
 * Both carry baked hillshade. The old build gave every relief cell a skirt to
 * below the waterline and dropped low neighbours, which is where the hollow
 * pyramid tents in the first review pass came from.
 */
function buildLand(rings) {
  let capTris = 0;
  let wallTris = 0;
  for (const ring of rings) {
    const heights = ring.map((_, i) => Math.min(shoreHeight(ring, i), 25));
    /* cap */
    const tris = earcut(ring);
    for (let t = 0; t < tris.length; t += 3) {
      triangle(
        vertex(ring[tris[t]].x, heights[tris[t]], ring[tris[t]].y),
        vertex(ring[tris[t + 1]].x, heights[tris[t + 1]], ring[tris[t + 1]].y),
        vertex(ring[tris[t + 2]].x, heights[tris[t + 2]], ring[tris[t + 2]].y),
      );
    }
    capTris += tris.length / 3;
    /* wall down to below the waterline, shaded by its outward face; land is on
     * the left of the boundary direction, so outward is on the right */
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const a = ring[i];
      const b = ring[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const shade = shadeOf(dy / len, 0, -dx / len);
      const topA = vertex(a.x, heights[i], a.y, shade);
      const topB = vertex(b.x, heights[j], b.y, shade);
      const botA = vertex(a.x, BASE_Y, a.y, shade);
      const botB = vertex(b.x, BASE_Y, b.y, shade);
      triangle(botA, botB, topB);
      triangle(botA, topB, topA);
      wallTris += 2;
    }
  }
  console.log(`land: ${rings.length} rings, ${capTris} cap tris, ${wallTris} wall tris`);
}

function buildRelief(rings) {
  /* corner lattice over the whole fade disc */
  const half = Math.ceil(FADE_END / RELIEF_CELL);
  const N = 2 * half + 1;
  const at = (i, j) => j * N + i;
  const cornerX = (i) => (i - half) * RELIEF_CELL;
  const cornerY = (j) => (j - half) * RELIEF_CELL;

  const land = new Uint8Array(N * N);
  const height = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cornerX(i);
      const y = cornerY(j);
      if (Math.hypot(x, y) > FADE_END + RELIEF_CELL) continue;
      if (!insideLand(rings, x, y)) continue;
      land[at(i, j)] = 1;
      height[at(i, j)] = Math.min(Math.max(smoothGround(x, y), MIN_SHORE_H), 500);
    }
  }

  /* per-corner shade from the lattice gradient; a water neighbour reads as
   * height 0, which steepens the coastal slope a little, in the right
   * direction */
  const cornerShade = (i, j) => {
    const sample = (ii, jj) =>
      ii < 0 || jj < 0 || ii >= N || jj >= N ? 0 : height[at(ii, jj)];
    const sx = (sample(i - 1, j) - sample(i + 1, j)) / (2 * RELIEF_CELL);
    const sy = (sample(i, j - 1) - sample(i, j + 1)) / (2 * RELIEF_CELL);
    return shadeOf(-sx, 1, -sy);
  };

  let cells = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const c00 = at(i, j);
      const c10 = at(i + 1, j);
      const c01 = at(i, j + 1);
      const c11 = at(i + 1, j + 1);
      if (!land[c00] || !land[c10] || !land[c01] || !land[c11]) continue;
      const top = Math.max(height[c00], height[c10], height[c01], height[c11]);
      /* under the cap's seal band everywhere: the cap already draws it */
      if (top <= 4) continue;
      const cx = cornerX(i) + RELIEF_CELL / 2;
      const cy = cornerY(j) + RELIEF_CELL / 2;
      if (Math.hypot(cx, cy) > FADE_END) continue;
      const v00 = vertex(cornerX(i), height[c00], cornerY(j), cornerShade(i, j));
      const v10 = vertex(cornerX(i + 1), height[c10], cornerY(j), cornerShade(i + 1, j));
      const v01 = vertex(cornerX(i), height[c01], cornerY(j + 1), cornerShade(i, j + 1));
      const v11 = vertex(cornerX(i + 1), height[c11], cornerY(j + 1), cornerShade(i + 1, j + 1));
      triangle(v00, v10, v11);
      triangle(v00, v11, v01);
      cells += 1;
    }
  }
  console.log(`relief: ${cells} cells`);
}

/** Breakwater ways that are not part of the coastline: a low prism per way. */
function buildBreakwaters(ways, coastlineIds) {
  const HEIGHT = 4;
  const HALF_W = 18;
  let built = 0;
  for (const way of ways) {
    if (coastlineIds.has(way.id)) continue;
    const line = way.geometry.map((g) => project(g.lat, g.lon)).filter(inside);
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * HALF_W;
      const ny = (dx / len) * HALF_W;
      const quad = (p, q, hp, hq, shade) => {
        const p0 = vertex(p.x, hp, p.y, shade);
        const q0 = vertex(q.x, hq, q.y, shade);
        triangle(p0, q0, vertex(q.x, BASE_Y, q.y, shade));
        triangle(p0, vertex(q.x, BASE_Y, q.y, shade), vertex(p.x, BASE_Y, p.y, shade));
      };
      /* two side walls, each shaded by its own outward face, and a crest */
      const sidePlus = shadeOf(-dy / len, 0, dx / len);
      const sideMinus = shadeOf(dy / len, 0, -dx / len);
      quad({ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, HEIGHT, HEIGHT, sidePlus);
      quad({ x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }, HEIGHT, HEIGHT, sideMinus);
      const c0 = vertex(a.x + nx, HEIGHT, a.y + ny);
      const c1 = vertex(b.x + nx, HEIGHT, b.y + ny);
      const c2 = vertex(b.x - nx, HEIGHT, b.y - ny);
      const c3 = vertex(a.x - nx, HEIGHT, a.y - ny);
      triangle(c0, c1, c2);
      triangle(c0, c2, c3);
    }
    built += 1;
  }
  console.log(`breakwaters: ${built} ways`);
}

/** Container gantries as flat silhouette quads at real crane positions,
 * oriented along the nearest coastline segment so the boom hangs over water.
 * Same visual language as the procedural cranes this replaces. */
function buildCranes(cranePoints, rings) {
  const MIN_SPACING = 110;
  const MAX_CRANES = 26;
  const placed = [];
  const sorted = cranePoints
    .filter((p) => inside(p) && Math.hypot(p.x, p.y) < FADE_START + 1500)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  for (const p of sorted) {
    if (placed.length >= MAX_CRANES) break;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_SPACING)) continue;
    placed.push(p);
  }
  /* wharf direction: nearest ring segment */
  const wharfDir = (p) => {
    let best = null;
    let bestDist = Infinity;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestDist) {
          bestDist = d;
          best = { x: dx, y: dy };
        }
      }
    }
    const len = best ? Math.hypot(best.x, best.y) || 1 : 1;
    return best ? { x: best.x / len, y: best.y / len } : { x: 1, y: 0 };
  };
  let seed = 1234567;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const p of placed) {
    const dir = wharfDir(p);
    /* the crane's own vertical plane runs along the wharf; u is metres along
     * it, so a member drawn in (u, h) lands in world via p + dir*u */
    const bar = (u0, h0, u1, h1, thick) => {
      const du = u1 - u0;
      const dh = h1 - h0;
      const len = Math.hypot(du, dh) || 1;
      const au = ((-dh / len) * thick) / 2;
      const ah = ((du / len) * thick) / 2;
      const at = (u, h) => vertex(p.x + dir.x * u, h, p.y + dir.y * u);
      const v0 = at(u0 - au, h0 - ah);
      const v1 = at(u0 + au, h0 + ah);
      const v2 = at(u1 + au, h1 + ah);
      const v3 = at(u1 - au, h1 - ah);
      triangle(v0, v1, v2);
      triangle(v0, v2, v3);
    };
    const sill = Math.max(groundAt(p.x, p.y), MIN_SHORE_H);
    const apex = sill + 42 + random() * 14;
    const gauge = 24 + random() * 8;
    const portal = sill + (apex - sill) * 0.42;
    const side = random() < 0.5 ? -1 : 1;
    const boom = (34 + random() * 22) * side;
    const back = boom * -0.35;
    const hinge = sill + (apex - sill) * 0.56;
    bar(-gauge / 2, sill, -gauge * 0.29, portal, 3.2);
    bar(gauge / 2, sill, gauge * 0.29, portal, 3.2);
    bar(-gauge * 0.34, portal + 1.8, gauge * 0.34, portal + 1.8, 3.6);
    bar(-gauge * 0.3, portal + 3.6, 0, apex, 2.6);
    bar(gauge * 0.3, portal + 3.6, 0, apex, 2.6);
    bar(0, hinge, boom, hinge + (apex - hinge) * 0.2, 3.4);
    bar(0, hinge, back, hinge + (apex - hinge) * 0.35, 2.8);
    bar(0, apex, boom * 0.9, hinge + (apex - hinge) * 0.24, 2.2);
  }
  console.log(`cranes: ${placed.length} of ${cranePoints.length} candidates`);
}

/* ------------------------------------------------------------------ output */

function writeAsset() {
  const vertCount = positions.length / 3;
  const use32 = vertCount > 65535;
  const posBytes = vertCount * 6;
  const channelBytes = vertCount * 2; // fade + shade
  const head = 16 + posBytes + channelBytes;
  const pad = head % 4 === 0 ? 0 : 4 - (head % 4);
  const idxBytes = indices.length * (use32 ? 4 : 2);
  const buffer = Buffer.alloc(head + pad + idxBytes);
  buffer.writeUInt32LE(0x324e564c, 0); // "LVN2"
  buffer.writeUInt32LE(vertCount, 4);
  buffer.writeUInt32LE(indices.length, 8);
  buffer.writeUInt32LE(use32 ? 1 : 0, 12);
  let at = 16;
  for (let i = 0; i < positions.length; i++) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, positions[i])), at);
    at += 2;
  }
  for (let i = 0; i < fades.length; i++) {
    buffer.writeUInt8(fades[i], at);
    at += 1;
  }
  for (let i = 0; i < shades.length; i++) {
    buffer.writeUInt8(shades[i], at);
    at += 1;
  }
  at += pad;
  for (let i = 0; i < indices.length; i++) {
    if (use32) buffer.writeUInt32LE(indices[i], at);
    else buffer.writeUInt16LE(indices[i], at);
    at += use32 ? 4 : 2;
  }
  const gz = gzipSync(buffer, { level: 9 });
  const outDir = "public/prototype/layline/venues";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${venueId}.bin`), gz);
  const manifest = {
    id: venueId,
    origin: venue.origin,
    bearing: venue.bearing,
    clipRadius: CLIP_R,
    dataVersion: new Date().toISOString().slice(0, 10),
    sources: {
      coastline: "OpenStreetMap via Overpass API",
      elevation: `Mapzen Terrarium z${DEM_ZOOM} (AWS Open Data)`,
    },
    attribution: venue.attribution,
    stats: { vertices: vertCount, triangles: indices.length / 3, bytes: gz.length },
  };
  writeFileSync(join(outDir, `${venueId}.json`), JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `asset: ${vertCount} verts, ${indices.length / 3} tris, ${buffer.length} raw, ${gz.length} gzipped`,
  );
}

function writeDebugSvg(rings) {
  const S = 0.05;
  const path = rings
    .map(
      (ring) =>
        "M" +
        ring.map((p) => `${(p.x * S).toFixed(1)},${(-p.y * S).toFixed(1)}`).join("L") +
        "Z",
    )
    .join(" ");
  const r = CLIP_R * S;
  writeFileSync(
    `.tmp/venue-${venueId}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${2 * r} ${2 * r}">
<rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" fill="#123"/>
<circle cx="0" cy="0" r="${r}" fill="#124a6b"/>
<path d="${path}" fill="#3a4a3a" stroke="#fff" stroke-width="0.5" fill-rule="evenodd"/>
<rect x="${-35 * S}" y="${-100 * S}" width="${70 * S}" height="${100 * S}" fill="none" stroke="#ff0" stroke-width="1"/>
</svg>
`,
  );
}

/* -------------------------------------------------------------------- main */

const overpass = await fetchOverpass();
await prefetchDem();

const coastWays = overpass.elements.filter(
  (e) => e.type === "way" && e.tags?.natural === "coastline",
);
const breakwaterWays = overpass.elements.filter(
  (e) => e.type === "way" && e.tags?.man_made === "breakwater" && e.geometry,
);
const craneNodes = overpass.elements
  .filter((e) => e.type === "node" && e.tags?.man_made === "crane")
  .map((e) => project(e.lat, e.lon));
const craneWays = overpass.elements
  .filter((e) => e.type === "way" && e.tags?.man_made === "crane" && e.geometry)
  .map((e) => {
    const pts = e.geometry.map((g) => project(g.lat, g.lon));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: cx, y: cy };
  });
const coastlineIds = new Set(coastWays.map((w) => w.id));
console.log(
  `overpass: ${coastWays.length} coastline ways, ${breakwaterWays.length} breakwaters, ${
    craneNodes.length + craneWays.length
  } cranes`,
);

const chains = assembleChains(coastWays);
console.log(`chains: ${chains.length} after endpoint joining`);

const closed = [];
const open = [];
for (const chain of chains) {
  const clipped = clipChain(chain);
  closed.push(...clipped.closed);
  open.push(...clipped.open);
}
console.log(`clip: ${closed.length} closed rings, ${open.length} open chains`);
for (const chain of open) {
  const r0 = Math.hypot(chain[0].x, chain[0].y);
  const r1 = Math.hypot(chain[chain.length - 1].x, chain[chain.length - 1].y);
  console.log(
    `  chain ${chain.length} pts, start r=${Math.round(r0)} (${Math.round(chain[0].x)},${Math.round(
      chain[0].y,
    )}), end r=${Math.round(r1)} (${Math.round(chain[chain.length - 1].x)},${Math.round(
      chain[chain.length - 1].y,
    )})`,
  );
}

let rings = closed.concat(closeAgainstCircle(open));
rings = rings
  .map((ring) => {
    const area = signedArea(ring);
    if (area < 0) return null; // water ring (a lake); the sea handles itself
    return ring;
  })
  .filter(Boolean)
  .map(simplify)
  .filter((ring) => ring.length >= 3 && Math.abs(signedArea(ring)) > 400);
const totalVerts = rings.reduce((s, r) => s + r.length, 0);
console.log(`rings: ${rings.length} land rings, ${totalVerts} verts after simplify`);

/* coast distance by bearing, to sanity-check the course window */
const report = [];
for (let deg = 0; deg < 360; deg += 30) {
  const dx = Math.sin(deg * DEG);
  const dy = Math.cos(deg * DEG);
  let d = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      /* ray from origin against segment */
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const t = (a.x * ey - a.y * ex) / denom;
      const s = (a.x * dy - a.y * dx) / -denom;
      if (t > 0 && s >= 0 && s <= 1) d = Math.min(d, t);
    }
  }
  report.push(`${deg}:${d === Infinity ? "open" : Math.round(d)}`);
}
console.log(`coast distance by course bearing (m): ${report.join(" ")}`);

writeDebugSvg(rings);
buildLand(rings);
buildRelief(rings);
buildBreakwaters(breakwaterWays, coastlineIds);
buildCranes(craneNodes.concat(craneWays), rings);
writeAsset();
