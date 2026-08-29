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
 * invisible by construction. That is what lets a layer stay one draw call.
 *
 * The output carries semantic layers (design doc 2.1), one merged mesh and one
 * draw call each: L1 near terrain, L2 urban massing, L3 port infrastructure.
 * Layers exist so the runtime can vary the material per class (L2 and L3 run
 * with the ground grain off) and so a later round can skip a class per rig.
 *
 * LVN3 layout, little endian, after gunzip:
 *   u32 magic 0x334e564c  ("LVN3")
 *   u32 layerCount, u32 flags (reserved, 0), u32 bodyOffset
 *   layerCount x 24-byte records:
 *     u16 classId    1 terrain, 2 massing, 3 infrastructure, 4 heroes,
 *                    5 curtain, 6 reserved for vegetation
 *     u8  material   0 shore, 1 curtain
 *     u8  drawOrder  ascending
 *     u8  attrMask   bit0 aFade, bit1 aShade, bit2 aDist (i16), bit3 aBase (u8)
 *     u8  yUnit      y quantisation denominator; 10 means 0.1 m
 *     u8  idx32      1 if this layer's indices are u32
 *     u8  pad
 *     u32 vertCount, u32 indexCount, u32 vertOffset, u32 indexOffset
 *                    both offsets relative to bodyOffset
 *   body, per layer, in the LVN2 order already shipped:
 *     i16 pos[vertCount*3]   world x (m), y (0.1 m units), z (m)
 *     u8  fade[vertCount]    0..255, the aFade the shore shader already takes
 *     u8  shade[vertCount]   hillshade, 128 = flat colour, /128 multiplies it
 *     pad to 4 bytes
 *     u16|u32 idx[indexCount]
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
/* z11 Terrarium is 64 m per sample and reads the whole working harbour as sea
 * level: the profile out to the oil islands on bearing 30 is 0.0 m at every
 * 100 m step. Wharf decks and island revetments here stand 4 to 7 m over MLLW,
 * so the floor is the deck, not the water; at 2.5 m the near islands rendered
 * as oil slicks lying on the surface. */
const MIN_SHORE_H = 6;
const SIMPLIFY_NEAR = 10; // m tolerance inside 3 km
const SIMPLIFY_FAR = 45; // m tolerance beyond 6 km
/* Fine lattice pitch, matched to the DEM's own 64 m sampling: at 120 m the
 * bake threw away half of what the source knows, which is where the isolated
 * cones came from. Flat blocks fall back to 2x pitch, see buildRelief. */
const RELIEF_CELL = 60;
const RELIEF_DETAIL = 3; // m of height range in a 2x2 block that earns fine cells
const RELIEF_NEAR = 3200; // m, blocks nearer than this stay fine regardless
const SPIKE_TOL = 40; // m a corner may stand over its neighbours' median
const MIN_FEATURE_W = 34; // m; fingers thinner than this are pinched off
const MIN_RING_AREA = 6000; // m^2
const MIN_RING_ANGLE = 0.0035; // rad of mean width from the origin, about 6 px
const MIN_RING_W = 14; // m, the floor that angle test relaxes to up close
const BATTER_MIN = 8; // m of horizontal run on the shore face
const BATTER_MAX = 18;
const DEM_ZOOM = 11;
const ARC_STEP = (2 * Math.PI) / 180;

/* L2, urban massing (design doc 2.1). A prism is only worth its 22 triangles
 * when it clears about 3 px: 25 m at 7.5 km is 3.5 px under the 1056.2 px/rad
 * focal length in doc 0.3, and 45 m holds that line out to the clip radius. */
const MASS_MIN_H = 25;
const MASS_NEAR = 7500;
const MASS_FAR_MIN_H = 45;
const MASS_FOOT = 8; // footprint vertices after simplification

/* L3, port infrastructure. Crane dimensions are the round-3 doc's 9.1 figures,
 * every one of them at or under a published dimension for these wharves:
 * apex 72 to 80 m over the deck (against 89.6 m published crane height at
 * Pier 400), 69 m front outreach (ZPMC 68.9 m at LBCT), 27 m back reach
 * (ZPMC 27.4 m), 30 m rail gauge (30.48 m published at Pier 300/400). */
const CRANE_MIN_SPACING = 55; // m, from the measured 54 m median crane spacing
const CRANE_MAX = 40;
const CRANE_LOD_NEAR = 5000; // m; beyond this a crane is under 11 px
const CRANE_APEX_MIN = 72;
const CRANE_APEX_SPAN = 8;
const CRANE_OUTREACH = 69;
const CRANE_BACKREACH = 27;
const CRANE_GAUGE = 30;
const CRANE_WIDTH = 18; // m along the wharf, between the two leg pairs
const TANK_MAX = 60;
const TANK_MIN_R = 7; // m; smaller tanks are under 2 px of width at 4 km
const TANK_MIN_H = 6; // m; below this a tank is a disc lying on the ground
const BLOCK_MAX = 40; // container blocks
const BLOCK_H = 12; // m, a five-high stack
const DECK_H = 6; // m, wharf and pier deck over MLLW (measured: 5.1 to 5.2 m)
const DECK_MAX_SEG = 66; // 12 triangles each, the doc's 800-triangle deck line
const DECK_W = 12; // m, a pier deck's drawn width
/* z11 Terrarium carries bathymetry and harbour spikes: the tiles read -361 m at
 * the Queen Mary berth and +85 m on the Pier G wharf (design doc 4.1), and an
 * unclamped read floated one Pier E crane 37 m over the water. A wharf is not a
 * hill. The LA County import measures these decks at 5.1 m on Pier J and 5.2 m
 * on Pier G, so anything standing on the apron takes a deck datum in this band
 * instead of the DEM's word for it. */
const DECK_MAX_H = 12;
const TANK_MAX_H = 25; // tank farms may sit inland, but not on a spike
const MASS_GROUND_MAX = 40; // DEM fallback for the 8 buildings with no OSM ele

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

const OVERPASS = "https://overpass-api.de/api/interpreter";

const bboxOf = (margin) =>
  `${lat0 - margin / mPerLat},${lon0 - margin / mPerLon},${lat0 + margin / mPerLat},${
    lon0 + margin / mPerLon
  }`;

/** Q2 and Q3 are longer than a URL wants, so they go over POST. Same endpoint,
 * same query text, same cache convention as Q1. */
async function cachedPost(query, cacheName) {
  const path = join(CACHE, cacheName);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "User-Agent": "layline-venue-bake/1",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${cacheName}`);
  const text = await res.text();
  writeFileSync(path, text);
  return JSON.parse(text);
}

/* Q1, the coast: unchanged since round 2 and pinned by the design doc 6.2. */
async function fetchOverpass() {
  const bbox = bboxOf(CLIP_R + 1500);
  const query = `[out:json][timeout:180];(
    way["natural"="coastline"](${bbox});
    way["man_made"="breakwater"](${bbox});
    node["man_made"="crane"](${bbox});
    way["man_made"="crane"](${bbox});
  );out geom;`;
  const text = await cachedFetch(
    OVERPASS + "?data=" + encodeURIComponent(query),
    `overpass-${venueId}.json`,
    false,
  );
  return JSON.parse(text);
}

/* Q2, urban massing: every building the LA County LiDAR import puts over 25 m
 * inside the bake box. 90.8 per cent of buildings here carry `height`. */
const fetchMassing = () =>
  cachedPost(
    `[out:json][timeout:180];
way["building"]["height"](if:number(t["height"])>=${MASS_MIN_H})(${bboxOf(CLIP_R + 1500)});
out geom;`,
    `overpass-q2-${venueId}.json`,
  );

/* Q3, port infrastructure: tank farms, silos, pier decks, and the terminal
 * polygons the container blocks are allowed to stand inside. */
const fetchInfrastructure = () =>
  cachedPost(
    `[out:json][timeout:180];(
  way["man_made"="storage_tank"](${bboxOf(CLIP_R + 1500)});
  way["man_made"="silo"](${bboxOf(CLIP_R + 1500)});
  way["man_made"="pier"](${bboxOf(CLIP_R + 1500)});
  way["landuse"="industrial"](${bboxOf(CLIP_R + 1500)});
);out geom;`,
    `overpass-q3-${venueId}.json`,
  );

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

function perimeter(ring) {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/** Distance from p to segment a->b. */
function pointSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** True when segments a->b and c->d cross at a point interior to both. Touching
 * endpoints and collinear overlap read as no crossing, which is what shared ring
 * vertices are. */
function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  return s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0 && s1 !== s2 && s3 !== s4;
}

/** Indices of every vertex bounding a self-crossing edge of a closed ring.
 * O(n^2) with a bounding-box reject; bake-time only, on rings of a few hundred
 * points. */
function selfCrossingVerts(ring) {
  const n = ring.length;
  const hit = new Set();
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const loX = Math.min(a.x, b.x);
    const hiX = Math.max(a.x, b.x);
    const loY = Math.min(a.y, b.y);
    const hiY = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the two edges meeting at ring[0]
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (Math.min(c.x, d.x) > hiX || Math.max(c.x, d.x) < loX) continue;
      if (Math.min(c.y, d.y) > hiY || Math.max(c.y, d.y) < loY) continue;
      if (!segmentsCross(a, b, c, d)) continue;
      hit.add(i).add((i + 1) % n).add(j).add((j + 1) % n);
    }
  }
  return hit;
}

/** The narrowest feature worth keeping at this range, on the same distance
 * schedule the simplify tolerance already uses: what is a readable spit at
 * 700 m is a torn hairline at 5 km. */
function featureWidth(x, y) {
  const t = Math.min(Math.max((Math.hypot(x, y) - 700) / 4300, 0), 1);
  return MIN_FEATURE_W * (0.55 + 0.95 * t);
}

/** Cut a ring at every pinch narrower than the local feature width. Both halves
 * keep the pinch pair, so a split where both halves survive is invisible; the
 * point is that a finger hanging off a body by a hair becomes its own ring and
 * can then be measured and dropped on its own merits. */
function splitPinches(ring, depth = 0) {
  const n = ring.length;
  if (n < 5 || depth > 16) return [ring];
  let best = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (n - (j - i) < 3) continue;
      const a = ring[i];
      const b = ring[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const limit = featureWidth((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (d < limit && (best === null || d / limit < best.score)) {
        best = { i, j, score: d / limit };
      }
    }
  }
  if (best === null) return [ring];
  const head = ring.slice(best.i, best.j + 1);
  const tail = ring.slice(best.j).concat(ring.slice(0, best.i + 1));
  return splitPinches(head, depth + 1).concat(splitPinches(tail, depth + 1));
}

/**
 * Undo a pinch split whose two halves both survived.
 *
 * splitPinches leaves the chord in both halves, and buildLand reads every ring
 * edge as coastline: a surviving pair therefore ran opposing sea-level batter
 * faces, skirts and the shader's surf band straight through the interior of a
 * land neck. The split only exists so a doomed finger can be measured and
 * dropped on its own, so once both halves are through the filter the pair is
 * put back: the two rings carry the chord in opposite directions, so walking A
 * from the chord's far end all the way round to its near end and then walking B
 * the same way, skipping the two shared vertices the second time, gives the
 * union's boundary and dissolves the chord. Repeats to a fixpoint, for a ring
 * that split into three or more surviving pieces.
 */
function mergeSplitChords(rings) {
  const out = rings.map((ring) => ring.slice());
  const key = (a, b) => `${a.x.toFixed(3)},${a.y.toFixed(3)}|${b.x.toFixed(3)},${b.y.toFixed(3)}`;
  let merges = 0;
  for (;;) {
    const seen = new Map();
    let pair = null;
    search: for (let ri = 0; ri < out.length; ri++) {
      const ring = out[ri];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const rev = seen.get(key(b, a));
        if (rev && rev.ri !== ri) {
          pair = { a: rev, b: { ri, i } };
          break search;
        }
        seen.set(key(a, b), { ri, i });
      }
    }
    if (!pair) break;
    const A = out[pair.a.ri];
    const B = out[pair.b.ri];
    const merged = [];
    for (let k = 0; k < A.length; k++) merged.push(A[(pair.a.i + 1 + k) % A.length]);
    for (let k = 0; k < B.length - 2; k++) merged.push(B[(pair.b.i + 2 + k) % B.length]);
    out[pair.a.ri] = merged;
    out.splice(pair.b.ri, 1);
    merges += 1;
  }
  return { rings: out, merges };
}

/** A ring worth drawing: real area, and a mean width (2A/P) that still spans
 * pixels at its own range.
 *
 * The width test is angular rather than metric on purpose. A metric floor
 * cannot tell a 20 m wide, 1.9 km long training wall at 4.4 km, which is a
 * structure and reads as one, from a 14 m wide flake at 7.1 km, which is three
 * pixels; measured earlier, a metric filter threw away the first and with it
 * the only land on the up-course bearing. */
function substantial(ring) {
  if (ring.length < 3) return false;
  /* Splitting at a pinch also cuts the mouth off an inlet narrower than the
   * feature width. That lobe comes back wound clockwise, because it is water,
   * and the land ring keeps the chord across the mouth. */
  const area = signedArea(ring);
  if (area < MIN_RING_AREA) return false;
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x / ring.length;
    cy += p.y / ring.length;
  }
  const width = (2 * area) / (perimeter(ring) || 1);
  return width >= Math.max(MIN_RING_W, MIN_RING_ANGLE * Math.hypot(cx, cy));
}

/** Even-odd point in polygon over a set of rings, each carrying a bounding box
 * so the relief lattice's hundred thousand corner tests skip most rings. */
function ringBoxes(rings) {
  return rings.map((ring) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { ring, minX, maxX, minY, maxY };
  });
}

function insideLand(boxes, x, y) {
  let hit = false;
  for (const box of boxes) {
    if (y < box.minY || y > box.maxY || x > box.maxX) continue;
    const ring = box.ring;
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

/* One buffer set per semantic layer (design doc 2.1). Builders write into
 * `current`; `into` switches it for the length of one builder. Vertex dedup is
 * per layer, so a layer is always a self-contained mesh. */
function newLayer(classId, name, drawOrder) {
  return {
    classId,
    name,
    drawOrder,
    material: 0, // 0 shore; the curtain's material 1 arrives with L5
    positions: [],
    fades: [],
    shades: [],
    indices: [],
    vertexIndex: new Map(),
  };
}

const LAYERS = [newLayer(1, "terrain", 10), newLayer(2, "massing", 20), newLayer(3, "port", 21)];
const [L_TERRAIN, L_MASSING, L_PORT] = LAYERS;
let current = L_TERRAIN;

function into(layer, build) {
  const previous = current;
  current = layer;
  try {
    return build();
  } finally {
    current = previous;
  }
}

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
  let index = current.vertexIndex.get(key);
  if (index === undefined) {
    index = current.positions.length / 3;
    current.positions.push(qx, qh, qz);
    current.fades.push(Math.round(fadeAt(x, y) * 255));
    current.shades.push(shade);
    current.vertexIndex.set(key, index);
  }
  return index;
}

function triangle(a, b, c) {
  if (a === b || b === c || a === c) return;
  /* positions are already quantised integers here, so this is an exact test:
   * three collinear corners cover no pixels and only cost bytes. Ear clipping
   * on a simplified footprint produces a few of them. */
  const p = current.positions;
  const ux = p[b * 3] - p[a * 3];
  const uh = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vh = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uh * vz - uz * vh;
  const nh = uz * vx - ux * vz;
  const nz = ux * vh - uh * vx;
  if (nx === 0 && nh === 0 && nz === 0) return;
  current.indices.push(a, b, c);
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
 * Pull a ring inward along its own angle bisectors, by `want` metres or by as
 * much as the local feature width allows, whichever is less. The offset ring is
 * where the land surface starts; the original ring stays put as the waterline,
 * so the batter between them is a slope carved out of the land rather than any
 * new ground pushed into the sea.
 */
function insetRing(ring, wants) {
  const n = ring.length;
  const out = [];
  const runs = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const a = ring[(i - 1 + n) % n];
    const b = ring[(i + 1) % n];
    const l0 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    const l1 = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    /* land is on the left of the boundary direction, so inward is the left
     * normal; the bisector is the two incident edge normals summed */
    let nx = -(p.y - a.y) / l0 - (b.y - p.y) / l1;
    let ny = (p.x - a.x) / l0 + (b.x - p.x) / l1;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) {
      out.push({ x: p.x, y: p.y });
      runs.push(0);
      continue;
    }
    nx /= nl;
    ny /= nl;
    let clearance = Infinity;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (j === i || k === i) continue; // the two edges that meet at p
      clearance = Math.min(clearance, pointSegDist(p, ring[j], ring[k]));
    }
    const run = Math.min(wants[i], 0.3 * clearance, 0.4 * Math.min(l0, l1));
    out.push({ x: p.x + nx * run, y: p.y + ny * run });
    runs.push(run);
  }
  return { ring: out, runs };
}

/**
 * The land, as one surface in three parts that never fight:
 *
 * - the waterline: the OSM ring itself, held at y = 0, with a skirt dropped to
 *   BASE_Y so the sea never sees under the coast;
 * - the batter: a sloped face from that waterline up and inward to the crest,
 *   carrying its own lambert, which is what puts an edge and a value break
 *   where land meets water instead of a cut-out sitting on a plate;
 * - a cap over the inset crest ring, heights from the shoreline only and
 *   clamped to 25 m, sealing every polygon so land is never hollow from above.
 *
 * The relief lattice (buildRelief) rises out of the cap. All of it carries
 * baked hillshade. The old build gave every relief cell a skirt to below the
 * waterline and dropped low neighbours, which is where the hollow pyramid tents
 * in the first review pass came from; this one has no skirts below the crest.
 */
function buildLand(rings) {
  let capTris = 0;
  let wallTris = 0;
  let flat = 0;
  let pulled = 0;
  for (const ring of rings) {
    const n = ring.length;
    const heights = ring.map((_, i) => Math.min(shoreHeight(ring, i), 25));
    /* a low shore gets a wide gentle run, a bluff a short steep one */
    const wants = heights.map((h) => Math.min(Math.max(1.5 * h, BATTER_MIN), BATTER_MAX));
    /* The bisector offset folds wherever the inward runs of two stretches of
     * shore meet, and a fold that stays local leaves the ring's area almost
     * intact, so the area guard below never sees it while earcut turns it into
     * overlapping cap and batter. Pull the runs back only where the crest
     * actually crosses itself: halve every run bounding a crossing edge, snap
     * anything under 5 cm to zero, and re-offset. Runs that reach zero put that
     * span of crest back on the waterline, which is simple by construction, so
     * the loop terminates; the count of rings that needed it is reported. */
    const limits = wants.slice();
    let crest = insetRing(ring, limits);
    let pulls = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      const folded = selfCrossingVerts(crest.ring);
      if (folded.size === 0) break;
      for (const i of folded) limits[i] = limits[i] * 0.5 < 0.05 ? 0 : limits[i] * 0.5;
      crest = insetRing(ring, limits);
      pulls += 1;
    }
    if (pulls > 0) pulled += 1;
    const area = signedArea(ring);
    if (selfCrossingVerts(crest.ring).size > 0 || signedArea(crest.ring) < 0.25 * area) {
      /* the offset folded through itself; this ring keeps a vertical face */
      crest = { ring: ring.map((p) => ({ x: p.x, y: p.y })), runs: new Array(n).fill(0) };
      flat += 1;
    }
    /* cap over the crest ring */
    const tris = earcut(crest.ring);
    for (let t = 0; t < tris.length; t += 3) {
      triangle(
        vertex(crest.ring[tris[t]].x, heights[tris[t]], crest.ring[tris[t]].y),
        vertex(crest.ring[tris[t + 1]].x, heights[tris[t + 1]], crest.ring[tris[t + 1]].y),
        vertex(crest.ring[tris[t + 2]].x, heights[tris[t + 2]], crest.ring[tris[t + 2]].y),
      );
    }
    capTris += tris.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ring[i];
      const b = ring[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* outward horizontal is the right normal of the boundary direction */
      const ox = dy / len;
      const oy = -dx / len;
      /* batter: the face spans the along-shore edge and the up-and-inward run,
       * so its normal leans out by the run and up by the rise */
      const rise = (heights[i] + heights[j]) / 2;
      const run = (crest.runs[i] + crest.runs[j]) / 2;
      const faceShade = shadeOf(ox * rise, run, oy * rise);
      const wetShade = shadeOf(ox, 0, oy);
      const capA = vertex(crest.ring[i].x, heights[i], crest.ring[i].y, faceShade);
      const capB = vertex(crest.ring[j].x, heights[j], crest.ring[j].y, faceShade);
      const seaA = vertex(a.x, 0, a.y, faceShade);
      const seaB = vertex(b.x, 0, b.y, faceShade);
      triangle(seaA, seaB, capB);
      triangle(seaA, capB, capA);
      /* skirt, only ever seen through a wave trough */
      const botA = vertex(a.x, BASE_Y, a.y, wetShade);
      const botB = vertex(b.x, BASE_Y, b.y, wetShade);
      triangle(botA, botB, vertex(b.x, 0, b.y, wetShade));
      triangle(botA, vertex(b.x, 0, b.y, wetShade), vertex(a.x, 0, a.y, wetShade));
      wallTris += 4;
    }
  }
  console.log(
    `land: ${rings.length} rings, ${capTris} cap tris, ${wallTris} shore tris, ${pulled} crests unfolded, ${flat} rings kept vertical`,
  );
}

/**
 * The terrain surface, as a restricted quadtree over two pitches.
 *
 * The lattice is built at RELIEF_CELL, the DEM's own resolution, then 2x2
 * blocks of it collapse back to one quad wherever the block is entirely on
 * land and its nine corners span less than RELIEF_DETAIL of height. A coarse
 * block that borders a fine one is emitted as a fan through its centre that
 * picks up the shared edge midpoints, so the two pitches meet without a
 * T-junction and no cell ever shows sky through a crack.
 *
 * Heights are filtered in lattice space rather than by sampling the DEM five
 * times per corner. z11 Terrarium carries buildings and bridge decks as single
 * -sample spikes; unfiltered, one of those becomes a 140 m cone standing alone
 * on flat ground, which is what the round0 skyline was made of. Each corner is
 * first clamped to its neighbours' median plus SPIKE_TOL, then two binomial
 * passes run over land corners only, so a coastal height is never dragged down
 * by the sea on the other side of the shoreline.
 */
function buildRelief(boxes) {
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
      if (!insideLand(boxes, x, y)) continue;
      land[at(i, j)] = 1;
      height[at(i, j)] = Math.min(Math.max(groundAt(x, y), 0), 500);
    }
  }

  const OFF = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const neighbours = (src, i, j, into) => {
    into.length = 0;
    for (const [di, dj] of OFF) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const c = at(ii, jj);
      if (land[c]) into.push(src[c]);
    }
    return into;
  };

  /* Both the corner under test and its neighbours are read from the unclamped
   * snapshot, and clamps land in `height`. Reading neighbours from the array
   * the loop is writing made every corner's median depend on which of its
   * neighbours the scan had already reached, so clamps cascaded down a row and
   * the result changed with traversal order. */
  let spikes = 0;
  const bag = [];
  const raw = height.slice();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = at(i, j);
      if (!land[c]) continue;
      const ns = neighbours(raw, i, j, bag);
      if (ns.length < 5) continue;
      ns.sort((a, b) => a - b);
      const med = ns[ns.length >> 1];
      if (raw[c] - med > SPIKE_TOL) {
        height[c] = med + SPIKE_TOL;
        spikes += 1;
      } else if (med - raw[c] > SPIKE_TOL) {
        height[c] = med - SPIKE_TOL;
        spikes += 1;
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = height.slice();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = at(i, j);
        if (!land[c]) continue;
        let sum = 4 * src[c];
        let weight = 4;
        for (const [di, dj, w] of [
          [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2],
          [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
        ]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const n = at(ii, jj);
          if (!land[n]) continue;
          sum += w * src[n];
          weight += w;
        }
        height[c] = sum / weight;
      }
    }
  }
  for (let c = 0; c < height.length; c++) {
    if (land[c] && height[c] < MIN_SHORE_H) height[c] = MIN_SHORE_H;
  }

  /* per-corner shade from the filtered lattice gradient; a water neighbour
   * reads as height 0, which steepens the coastal slope a little, in the right
   * direction */
  const shadeCache = new Int16Array(N * N).fill(-1);
  const cornerShade = (i, j) => {
    const c = at(i, j);
    if (shadeCache[c] >= 0) return shadeCache[c];
    const sample = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N ? 0 : height[at(ii, jj)]);
    const sx = (sample(i - 1, j) - sample(i + 1, j)) / (2 * RELIEF_CELL);
    const sy = (sample(i, j - 1) - sample(i, j + 1)) / (2 * RELIEF_CELL);
    const s = shadeOf(-sx, 1, -sy);
    shadeCache[c] = s;
    return s;
  };

  const corner = (i, j) => vertex(cornerX(i), height[at(i, j)], cornerY(j), cornerShade(i, j));

  /* Blocks are 2x2 fine cells. A block only exists where all nine of its
   * corners are land, which is also the only place a coarse quad could be
   * legal; everything else is left to the fine cells, whose own four-corner
   * test resolves the coastline at RELIEF_CELL. */
  const B = (N - 1) >> 1;
  const blockAt = (bi, bj) => bj * B + bi;
  const blockFine = new Uint8Array(B * B);
  const blockDraw = new Uint8Array(B * B);
  for (let bj = 0; bj < B; bj++) {
    for (let bi = 0; bi < B; bi++) {
      const i0 = bi * 2;
      const j0 = bj * 2;
      let all = true;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dj = 0; dj <= 2 && all; dj++) {
        for (let di = 0; di <= 2; di++) {
          const c = at(i0 + di, j0 + dj);
          if (!land[c]) {
            all = false;
            break;
          }
          if (height[c] < lo) lo = height[c];
          if (height[c] > hi) hi = height[c];
        }
      }
      const b = blockAt(bi, bj);
      const cx = cornerX(i0 + 1);
      const cy = cornerY(j0 + 1);
      const r = Math.hypot(cx, cy);
      if (r > FADE_END) continue;
      blockDraw[b] = 1;
      /* the cap already seals everything at or under the crest band, so a
       * block that never rises above it draws nothing at all */
      if (all && hi <= MIN_SHORE_H + 1.5) {
        blockDraw[b] = 0;
        continue;
      }
      blockFine[b] = !all || hi - lo > RELIEF_DETAIL || r < RELIEF_NEAR ? 1 : 0;
    }
  }
  const fineNeighbour = (bi, bj) => {
    if (bi < 0 || bj < 0 || bi >= B || bj >= B) return false;
    const b = blockAt(bi, bj);
    return blockDraw[b] === 1 && blockFine[b] === 1;
  };

  let coarse = 0;
  let fine = 0;
  let fans = 0;
  for (let bj = 0; bj < B; bj++) {
    for (let bi = 0; bi < B; bi++) {
      const b = blockAt(bi, bj);
      if (!blockDraw[b]) continue;
      const i0 = bi * 2;
      const j0 = bj * 2;
      if (blockFine[b]) {
        for (let dj = 0; dj < 2; dj++) {
          for (let di = 0; di < 2; di++) {
            const i = i0 + di;
            const j = j0 + dj;
            const c00 = at(i, j);
            const c10 = at(i + 1, j);
            const c01 = at(i, j + 1);
            const c11 = at(i + 1, j + 1);
            if (!land[c00] || !land[c10] || !land[c01] || !land[c11]) continue;
            const hi = Math.max(height[c00], height[c10], height[c01], height[c11]);
            if (hi <= MIN_SHORE_H + 1.5) continue;
            const v00 = corner(i, j);
            const v10 = corner(i + 1, j);
            const v01 = corner(i, j + 1);
            const v11 = corner(i + 1, j + 1);
            triangle(v00, v10, v11);
            triangle(v00, v11, v01);
            fine += 1;
          }
        }
        continue;
      }
      /* coarse: one quad, unless a finer neighbour has put a vertex on a
       * shared edge, in which case fan through the centre and pick it up */
      const edges = [
        fineNeighbour(bi, bj - 1),
        fineNeighbour(bi + 1, bj),
        fineNeighbour(bi, bj + 1),
        fineNeighbour(bi - 1, bj),
      ];
      if (!edges[0] && !edges[1] && !edges[2] && !edges[3]) {
        const v00 = corner(i0, j0);
        const v20 = corner(i0 + 2, j0);
        const v02 = corner(i0, j0 + 2);
        const v22 = corner(i0 + 2, j0 + 2);
        triangle(v00, v20, v22);
        triangle(v00, v22, v02);
        coarse += 1;
        continue;
      }
      const loop = [];
      loop.push(corner(i0, j0));
      if (edges[0]) loop.push(corner(i0 + 1, j0));
      loop.push(corner(i0 + 2, j0));
      if (edges[1]) loop.push(corner(i0 + 2, j0 + 1));
      loop.push(corner(i0 + 2, j0 + 2));
      if (edges[2]) loop.push(corner(i0 + 1, j0 + 2));
      loop.push(corner(i0, j0 + 2));
      if (edges[3]) loop.push(corner(i0, j0 + 1));
      const mid = corner(i0 + 1, j0 + 1);
      for (let k = 0; k < loop.length; k++) {
        triangle(mid, loop[k], loop[(k + 1) % loop.length]);
      }
      fans += 1;
    }
  }
  console.log(
    `relief: ${fine} fine cells (${RELIEF_CELL} m), ${coarse} coarse + ${fans} stitched blocks (${
      2 * RELIEF_CELL
    } m), ${spikes} DEM spikes clamped`,
  );
}

/**
 * Breakwater ways that are not part of the coastline, as rubble mounds rather
 * than flat ribbons.
 *
 * The old build extruded a box 36 m wide and 4 m tall with two vertical sides
 * and a flat lid. Seen from a kilometre up-course that is a paper strip lying
 * on the water beside the land it belongs to, which is most of what the round0
 * pass read as detached slivers. A mound has two battered flanks that take
 * their own lambert, so the sunward flank, the crest and the shaded flank are
 * three values, and its foot sits in the shader's waterline band the way a
 * structure the sea breaks over should.
 */
function buildBreakwaters(ways, coastlineIds) {
  const HEIGHT = 5;
  const BASE_HALF = 30;
  const CREST_HALF = 9;
  let built = 0;
  for (const way of ways) {
    if (coastlineIds.has(way.id)) continue;
    const line = way.geometry.map((g) => project(g.lat, g.lon)).filter(inside);
    if (line.length < 2) continue;
    /* per-vertex normal, averaged over the incident segments, so a bend in the
     * mole does not open a notch in the flank */
    const normals = line.map((_, i) => {
      let nx = 0;
      let ny = 0;
      for (const [p, q] of [
        [line[i - 1], line[i]],
        [line[i], line[i + 1]],
      ]) {
        if (!p || !q) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        nx += -dy / len;
        ny += dx / len;
      }
      const len = Math.hypot(nx, ny) || 1;
      return { x: nx / len, y: ny / len };
    });
    const strip = (halfA, hA, halfB, hB, side, shade) => {
      for (let i = 0; i < line.length - 1; i++) {
        const p = line[i];
        const q = line[i + 1];
        const np = normals[i];
        const nq = normals[i + 1];
        const a0 = vertex(p.x + np.x * halfA * side, hA, p.y + np.y * halfA * side, shade(i));
        const b0 = vertex(q.x + nq.x * halfA * side, hA, q.y + nq.y * halfA * side, shade(i));
        const a1 = vertex(p.x + np.x * halfB * side, hB, p.y + np.y * halfB * side, shade(i));
        const b1 = vertex(q.x + nq.x * halfB * side, hB, q.y + nq.y * halfB * side, shade(i));
        triangle(a0, b0, b1);
        triangle(a0, b1, a1);
      }
    };
    /* a flank normal leans out by the rise and up by the run */
    const flankShade = (i, side) => {
      const p = line[Math.min(i, line.length - 2)];
      const q = line[Math.min(i, line.length - 2) + 1];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = ((-dy / len) * side) / 1;
      const oy = ((dx / len) * side) / 1;
      return shadeOf(ox * HEIGHT, BASE_HALF - CREST_HALF, oy * HEIGHT);
    };
    for (const side of [1, -1]) {
      /* skirt below the waterline, then the flank up to the crest */
      strip(BASE_HALF, BASE_Y, BASE_HALF, 0, side, (i) => flankShade(i, side));
      strip(BASE_HALF, 0, CREST_HALF, HEIGHT, side, (i) => flankShade(i, side));
    }
    strip(CREST_HALF, HEIGHT, -CREST_HALF, HEIGHT, 1, () => SHADE_FLAT);
    /* close both ends so the mound is never seen through */
    for (const at of [0, line.length - 1]) {
      const p = line[at];
      const n = normals[at];
      const cap = (half, h) => vertex(p.x + n.x * half, h, p.y + n.y * half, SHADE_FLAT);
      const b0 = cap(BASE_HALF, 0);
      const b1 = cap(-BASE_HALF, 0);
      const c0 = cap(CREST_HALF, HEIGHT);
      const c1 = cap(-CREST_HALF, HEIGHT);
      triangle(b0, b1, c1);
      triangle(b0, c1, c0);
    }
    built += 1;
    if (process.env.BAKE_DEBUG) {
      const mid = line[line.length >> 1];
      console.log(
        `  breakwater ${line.length} pts, mid r=${Math.round(Math.hypot(mid.x, mid.y))} (${Math.round(
          mid.x,
        )},${Math.round(mid.y)})`,
      );
    }
  }
  console.log(`breakwaters: ${built} ways`);
}

/* ------------------------------------------------- L2 and L3 solid geometry */

/* Vector helpers in bake space (x across, h up, y up the course axis). */
const v3 = (x, h, y) => ({ x, h, y });
const sub3 = (a, b) => v3(a.x - b.x, a.h - b.h, a.y - b.y);
const add3 = (a, b) => v3(a.x + b.x, a.h + b.h, a.y + b.y);
const mul3 = (a, s) => v3(a.x * s, a.h * s, a.y * s);
const dot3 = (a, b) => a.x * b.x + a.h * b.h + a.y * b.y;
const cross3 = (a, b) =>
  v3(a.h * b.y - a.y * b.h, a.y * b.x - a.x * b.y, a.x * b.h - a.h * b.x);
const norm3 = (a) => {
  const len = Math.hypot(a.x, a.h, a.y) || 1;
  return v3(a.x / len, a.h / len, a.y / len);
};

/** One flat face, wound so its normal points outward, with its own shade byte
 * on all four corners and no vertex shared with the next face. Faceting is what
 * makes a box read as a box under a colour this flat (design doc 2.3). */
function face(p0, p1, p2, p3, normal) {
  const wind = dot3(cross3(sub3(p1, p0), sub3(p2, p0)), normal) >= 0;
  const [q0, q1, q2, q3] = wind ? [p0, p1, p2, p3] : [p3, p2, p1, p0];
  const shade = shadeOf(normal.x, normal.h, normal.y);
  const a = vertex(q0.x, q0.h, q0.y, shade);
  const b = vertex(q1.x, q1.h, q1.y, shade);
  const c = vertex(q2.x, q2.h, q2.y, shade);
  const d = vertex(q3.x, q3.h, q3.y, shade);
  triangle(a, b, c);
  triangle(a, c, d);
}

/**
 * A structural member: a rectangular prism from `a` to `b`, `wide` metres
 * across `across` and `thick` metres across the remaining axis, optionally
 * tapering to `wideB` x `thickB` at the far end. 8 corners, 6 faces, 12
 * triangles, per-face normals. This is what replaces the flat silhouette quads
 * the round-2 cranes were drawn with: a quad seen edge on is one pixel (D9).
 */
function member(a, b, across, wide, thick, wideB = wide, thickB = thick) {
  const axis = norm3(sub3(b, a));
  let l1 = sub3(across, mul3(axis, dot3(across, axis)));
  if (Math.hypot(l1.x, l1.h, l1.y) < 1e-6) {
    l1 = sub3(v3(0, 1, 0), mul3(axis, dot3(v3(0, 1, 0), axis)));
  }
  l1 = norm3(l1);
  const l2 = norm3(cross3(axis, l1));
  const at = (end, w, t, su, sv) =>
    add3(add3(end, mul3(l1, (su * w) / 2)), mul3(l2, (sv * t) / 2));
  const a00 = at(a, wide, thick, -1, -1);
  const a10 = at(a, wide, thick, 1, -1);
  const a11 = at(a, wide, thick, 1, 1);
  const a01 = at(a, wide, thick, -1, 1);
  const b00 = at(b, wideB, thickB, -1, -1);
  const b10 = at(b, wideB, thickB, 1, -1);
  const b11 = at(b, wideB, thickB, 1, 1);
  const b01 = at(b, wideB, thickB, -1, 1);
  face(a10, a11, b11, b10, l1);
  face(a00, a01, b01, b00, mul3(l1, -1));
  face(a01, a11, b11, b01, l2);
  face(a00, a10, b10, b00, mul3(l2, -1));
  face(a00, a10, a11, a01, mul3(axis, -1));
  face(b00, b10, b11, b01, axis);
}

/** Deterministic per-site jitter: a hash of the quantised position, so a
 * rebake reproduces every crane byte for byte whatever order they arrive in.
 * The round-2 build used a shared LCG, which was reproducible but only as long
 * as nothing upstream reordered the placements. */
function hash01(x, y) {
  let h = Math.imul(Math.round(x) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Ground under a structure, clamped into a band the DEM's harbour spikes
 * cannot reach. */
const clampGround = (x, y, low, high) => Math.min(Math.max(groundAt(x, y), low), high);

const centroidOf = (ring) => {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x / ring.length;
    cy += p.y / ring.length;
  }
  return { x: cx, y: cy };
};

/** Way geometry -> course-frame ring, closing duplicate dropped. */
function ringOf(way) {
  const ring = way.geometry.map((g) => project(g.lat, g.lon));
  if (ring.length > 1 && keyOf(ring[0]) === keyOf(ring[ring.length - 1])) ring.pop();
  return ring;
}

/** Visvalingam: drop the vertex whose ear has the least area until `want`
 * remain. Douglas-Peucker cannot hit an exact vertex budget, and the budget is
 * what L2's 22 triangles per prism are bought with. */
function reduceRing(ring, want) {
  const out = ring.slice();
  while (out.length > want) {
    let worst = 0;
    let worstArea = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const p = out[i];
      const b = out[(i + 1) % out.length];
      const area = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / 2;
      if (area < worstArea) {
        worstArea = area;
        worst = i;
      }
    }
    out.splice(worst, 1);
  }
  return out;
}

/** Nearest coastline segment: its direction, and the seaward normal. Land is
 * on the left of the boundary direction, so the right normal points at water,
 * which is the side a container crane's boom hangs over. */
function quayFrame(rings, p) {
  let dir = { x: 1, y: 0 };
  let bestDist = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
      if (d < bestDist) {
        bestDist = d;
        const len = Math.hypot(dx, dy) || 1;
        dir = { x: dx / len, y: dy / len };
      }
    }
  }
  return { quay: dir, sea: { x: dir.y, y: -dir.x }, dist: bestDist };
}

/**
 * L2, urban massing: one faceted prism per OSM building that clears the
 * screen-space cut in design doc 2.1, extruded from its own footprint to its
 * own `height` tag. Ground under it comes from the LA County import's
 * `ele - height` where the building carries `ele` (measured median 5.1 m on the
 * Pier J wharf and 5.2 m on Pier G against a published 4 to 7 m MLLW deck, so
 * the datum needs no offset), and from the DEM where it does not.
 */
function buildMassing(ways) {
  let prisms = 0;
  let fromEle = 0;
  let footVerts = 0;
  const picked = [];
  for (const way of ways) {
    const height = Number.parseFloat(way.tags?.height);
    if (!Number.isFinite(height) || height < MASS_MIN_H) continue;
    let ring = ringOf(way);
    if (ring.length < 3) continue;
    const centre = centroidOf(ring);
    const d = Math.hypot(centre.x, centre.y);
    if (d > CLIP_R) continue;
    if (d > MASS_NEAR && height < MASS_FAR_MIN_H) continue;
    if (signedArea(ring) < 0) ring.reverse();
    if (ring.length > MASS_FOOT) ring = reduceRing(ring, MASS_FOOT);
    /* positions ship as Int16 metres, so an edge shorter than the quantiser
     * lands as a zero-area wall: drop those corners rather than emit them */
    const kept = [];
    for (const p of ring) {
      if (kept.length === 0 || Math.hypot(p.x - kept[kept.length - 1].x, p.y - kept[kept.length - 1].y) >= 2) {
        kept.push(p);
      }
    }
    while (kept.length > 2 && Math.hypot(kept[0].x - kept[kept.length - 1].x, kept[0].y - kept[kept.length - 1].y) < 2) {
      kept.pop();
    }
    ring = kept;
    if (ring.length < 3) continue;
    if (Math.abs(signedArea(ring)) < 40) continue;
    const ele = Number.parseFloat(way.tags?.ele);
    const base = Number.isFinite(ele)
      ? Math.max(ele - height, 0)
      : clampGround(centre.x, centre.y, 0, MASS_GROUND_MAX);
    if (Number.isFinite(ele)) fromEle += 1;
    /* The walls run from below the terrain surface, not from the building's own
     * ground datum: the relief lattice under it is a 60 m DEM sample and the
     * two disagree by metres. A prism whose foot stops at its own base is the
     * floating slab defect (D3) waiting to come back at a grazing angle. */
    const foot = Math.max(Math.min(base, clampGround(centre.x, centre.y, 0, MASS_GROUND_MAX), MIN_SHORE_H) - 3, BASE_Y);
    picked.push({ ring, foot, base, top: base + height, height, d });
  }
  for (const b of picked) {
    const n = b.ring.length;
    for (let i = 0; i < n; i++) {
      const a = b.ring[i];
      const c = b.ring[(i + 1) % n];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* CCW ring: the outward normal is the right normal of the edge */
      const normal = v3(dy / len, 0, -dx / len);
      face(
        v3(a.x, b.foot, a.y),
        v3(c.x, b.foot, c.y),
        v3(c.x, b.top, c.y),
        v3(a.x, b.top, a.y),
        normal,
      );
    }
    const roof = earcut(b.ring);
    const top = b.ring.map((p) => vertex(p.x, b.top, p.y, SHADE_FLAT));
    for (let i = 0; i < roof.length; i += 3) {
      triangle(top[roof[i]], top[roof[i + 1]], top[roof[i + 2]]);
    }
    prisms += 1;
    footVerts += n;
  }
  console.log(
    `massing: ${prisms} prisms of ${ways.length} candidates, ${fromEle} on OSM ele ground, ` +
      `${(footVerts / Math.max(prisms, 1)).toFixed(1)} footprint verts each`,
  );
}

/**
 * L3, port infrastructure: container gantries as real volumes at real scale,
 * the tank farms, the wharf and pier decks, and stylised container blocks
 * inside terminal polygons that hold a crane.
 *
 * The crane frame is the real one: rails run along the quay, the gauge and the
 * boom both lie in the plane perpendicular to it, and the boom hangs seaward.
 * The round-2 build drew the boom along the quay instead, which is why the
 * cranes never read as a comb of gantries over the water (D9).
 */
function buildPort(cranePoints, infra, rings, boxes) {
  const placed = [];
  /* the whole disc, not round 2's 7.5 km: the Pier T, Pier 400 and Pier 300
   * banks sit at 7.4 to 9.1 km and the doc's inventory keeps all three */
  const candidates = cranePoints
    .filter((p) => inside(p))
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  for (const p of candidates) {
    if (placed.length >= CRANE_MAX) break;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < CRANE_MIN_SPACING)) continue;
    placed.push(p);
  }
  let near = 0;
  let far = 0;
  for (const p of placed) {
    const { quay, sea } = quayFrame(rings, p);
    const at = (u, v, h) =>
      v3(p.x + sea.x * u + quay.x * v, h, p.y + sea.y * u + quay.y * v);
    const across = v3(quay.x, 0, quay.y);
    const seaV = v3(sea.x, 0, sea.y);
    const sill = clampGround(p.x, p.y, MIN_SHORE_H, DECK_MAX_H);
    const rail = sill - 2; // legs start inside the apron, never on top of it
    const apex = sill + CRANE_APEX_MIN + hash01(p.x, p.y) * CRANE_APEX_SPAN;
    const portal = sill + (apex - sill) * 0.42;
    const hinge = sill + (apex - sill) * 0.62;
    const g = CRANE_GAUGE / 2;
    const w = CRANE_WIDTH / 2;
    const d = Math.hypot(p.x, p.y);
    if (d <= CRANE_LOD_NEAR) {
      /* 12 members, 144 triangles: the full archetype of design doc 9.1 */
      for (const u of [g, -g]) {
        for (const v of [w, -w]) member(at(u, v, rail), at(u, v, portal), across, 1.8, 1.8);
      }
      for (const u of [g, -g]) member(at(u, -w, portal), at(u, w, portal), seaV, 1.6, 1.6);
      member(at(g, 0, portal), at(-g, 0, portal), across, 1.6, 1.6);
      for (const v of [w, -w]) member(at(g, v, portal), at(-g * 0.1, 0, apex), across, 1.6, 1.6);
      member(at(g, 0, hinge), at(g + CRANE_OUTREACH, 0, hinge + 2), across, 3.0, 2.6, 1.8, 1.8);
      member(at(-g, 0, hinge), at(-g - CRANE_BACKREACH, 0, hinge + 4), across, 2.6, 2.4);
      member(at(-g * 0.55, -w * 0.9, portal + 4), at(-g * 0.55, w * 0.9, portal + 4), seaV, 8, 7);
      near += 1;
    } else {
      /* 5 members, 60 triangles: four legs and the gantry beam. Under 11 px
       * that silhouette is all a crane has left (design doc 9.1). */
      for (const u of [g, -g]) {
        for (const v of [w, -w]) member(at(u, v, rail), at(u, v, hinge), across, 2.0, 2.0);
      }
      member(
        at(-g - CRANE_BACKREACH, 0, hinge),
        at(g + CRANE_OUTREACH, 0, hinge + 2),
        across,
        2.8,
        2.4,
      );
      far += 1;
    }
  }
  console.log(
    `cranes: ${placed.length} of ${cranePoints.length} candidates, ${near} near (144 tris) + ${far} far (60)`,
  );

  /* tanks: the widest silhouettes first, since a tank is a 14 m wall read
   * across its diameter rather than up its height */
  const tanks = [];
  for (const way of infra) {
    const kind = way.tags?.man_made;
    if (kind !== "storage_tank" && kind !== "silo") continue;
    const ring = ringOf(way);
    if (ring.length < 3) continue;
    const centre = centroidOf(ring);
    const d = Math.hypot(centre.x, centre.y);
    if (d > MASS_NEAR || !inside(centre)) continue;
    let radius = 0;
    for (const p of ring) radius = Math.max(radius, Math.hypot(p.x - centre.x, p.y - centre.y));
    if (radius < TANK_MIN_R) continue;
    const tagged = Number.parseFloat(way.tags?.height);
    const height = Number.isFinite(tagged) ? tagged : 12;
    /* a 46 m disc standing 2.7 m tall is 0.5 px of height and 18 px of width:
     * that is a pancake on the ground, the shape round 2 spent its whole
     * budget removing. Tanks below the deck freeboard are not drawn. */
    if (height < TANK_MIN_H) continue;
    /* most of these carry `building` too, from the same LiDAR import. Only the
     * ones over the L2 cut have already been extruded there from their real
     * footprint; drawing those twice is worse than not drawing them here. */
    if (way.tags?.building && height >= MASS_MIN_H) continue;
    tanks.push({ centre, radius, height, d });
  }
  /* rank by the silhouette each one actually presents, not by footprint alone */
  tanks.sort((a, b) => (b.radius * b.height) / b.d ** 2 - (a.radius * a.height) / a.d ** 2);
  const drawnTanks = tanks.slice(0, TANK_MAX);
  for (const tank of drawnTanks) {
    const ground = clampGround(tank.centre.x, tank.centre.y, MIN_SHORE_H, TANK_MAX_H);
    const base = ground - 2; // into the lattice, never floating over it
    const top = ground + tank.height;
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ring.push({
        x: tank.centre.x + Math.cos(a) * tank.radius,
        y: tank.centre.y + Math.sin(a) * tank.radius,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % 8];
      const mx = (a.x + b.x) / 2 - tank.centre.x;
      const my = (a.y + b.y) / 2 - tank.centre.y;
      const len = Math.hypot(mx, my) || 1;
      face(
        v3(a.x, base, a.y),
        v3(b.x, base, b.y),
        v3(b.x, top, b.y),
        v3(a.x, top, a.y),
        v3(mx / len, 0, my / len),
      );
    }
    const lid = earcut(ring);
    const rim = ring.map((p) => vertex(p.x, top, p.y, SHADE_FLAT));
    for (let i = 0; i < lid.length; i += 3) triangle(rim[lid[i]], rim[lid[i + 1]], rim[lid[i + 2]]);
  }
  console.log(`tanks: ${drawnTanks.length} of ${tanks.length} inside ${MASS_NEAR} m`);

  /* decks: the longest pier lines first, simplified in the same pass the coast
   * uses, drawn as a slab so the pier reads as a structure standing over the
   * water rather than as a line drawn on it */
  const piers = [];
  for (const way of infra) {
    if (way.tags?.man_made !== "pier") continue;
    const line = simplify(way.geometry.map((g) => project(g.lat, g.lon))).filter(inside);
    if (line.length < 2) continue;
    let length = 0;
    for (let i = 0; i < line.length - 1; i++) {
      length += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    }
    const centre = centroidOf(line);
    if (length < 150 || Math.hypot(centre.x, centre.y) > FADE_START) continue;
    piers.push({ line, length });
  }
  piers.sort((a, b) => b.length - a.length);
  let segments = 0;
  let decks = 0;
  for (const pier of piers) {
    if (segments >= DECK_MAX_SEG) break;
    for (let i = 0; i < pier.line.length - 1 && segments < DECK_MAX_SEG; i++) {
      const a = pier.line[i];
      const b = pier.line[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* the slab runs from the waterline up to the deck rather than hovering at
       * deck height: round 2 measured that a face with no contact with the sea
       * reads as a plate laid on top of it (D3). Round 5 puts Belmont Pier back
       * on piles as a hero; every other pier here is a solid wharf anyway. */
      member(
        v3(a.x, DECK_H / 2, a.y),
        v3(b.x, DECK_H / 2, b.y),
        v3(dy / len, 0, -dx / len),
        DECK_W,
        DECK_H,
      );
      segments += 1;
    }
    decks += 1;
  }
  console.log(`decks: ${decks} piers, ${segments} segments of ${piers.length} candidates`);

  /* container blocks: the one invented geometry in the plan, so it is fenced.
   *
   * The doc fences them inside `landuse=industrial` polygons. Measured here,
   * that fence does not exist: of the 158 industrial polygons in the box, one
   * holds a crane and it is the Port of Los Angeles polygon 11 km out; the
   * nearest industrial boundary to the nearest Pier J crane is 1,932 m away.
   * The apron the cranes stand on is simply untagged. So the fence is the real
   * geometry that does exist: a block stands on the landward side of a placed
   * crane, within 450 m of it, clear of the gantry itself, with all four
   * corners on land, on a fixed world grid rather than on a random number. */
  const blocks = [];
  const STEP = 130;
  const APRON = 450;
  for (const crane of placed) {
    if (Math.hypot(crane.x, crane.y) > FADE_START) continue;
    const frame = quayFrame(rings, crane);
    for (let gx = Math.ceil((crane.x - APRON) / STEP) * STEP; gx <= crane.x + APRON; gx += STEP) {
      for (let gy = Math.ceil((crane.y - APRON) / STEP) * STEP; gy <= crane.y + APRON; gy += STEP) {
        const inland = (gx - crane.x) * frame.sea.x + (gy - crane.y) * frame.sea.y;
        const along = Math.hypot(gx - crane.x, gy - crane.y);
        if (inland > -60 || along > APRON) continue;
        if (blocks.some((b) => Math.hypot(b.x - gx, b.y - gy) < STEP * 0.9)) continue;
        const { quay } = quayFrame(rings, { x: gx, y: gy });
        const nx = -quay.y;
        const ny = quay.x;
        let ok = true;
        for (const su of [-1, 1]) {
          for (const sv of [-1, 1]) {
            const cx = gx + quay.x * su * 35 + nx * sv * 16;
            const cy = gy + quay.y * su * 35 + ny * sv * 16;
            if (!insideLand(boxes, cx, cy)) ok = false;
          }
        }
        if (!ok) continue;
        blocks.push({ x: gx, y: gy, quay, d: Math.hypot(gx, gy) });
      }
    }
  }
  blocks.sort((a, b) => a.d - b.d);
  const drawnBlocks = blocks.slice(0, BLOCK_MAX);
  for (const block of drawnBlocks) {
    const base = clampGround(block.x, block.y, MIN_SHORE_H, DECK_MAX_H) - 1;
    member(
      v3(block.x - block.quay.x * 35, base + BLOCK_H / 2, block.y - block.quay.y * 35),
      v3(block.x + block.quay.x * 35, base + BLOCK_H / 2, block.y + block.quay.y * 35),
      v3(-block.quay.y, 0, block.quay.x),
      32,
      BLOCK_H,
    );
  }
  console.log(`container blocks: ${drawnBlocks.length} of ${blocks.length} apron sites`);
}

/* ------------------------------------------------------------------ output */

const ATTR_FADE = 1;
const ATTR_SHADE = 2;
const Y_UNIT = 10; // y quantised in 0.1 m

/** LVN3: the LVN2 body, once per layer, behind a layer table. Nothing about
 * how a layer's bytes are laid out changed, so the decoder is one loop around
 * the parser that already shipped. */
function writeAsset() {
  const layers = LAYERS.filter((layer) => layer.indices.length > 0);
  const blocks = layers.map((layer) => {
    const vertCount = layer.positions.length / 3;
    const use32 = vertCount > 65535;
    const head = vertCount * 6 + vertCount * 2; // pos + fade + shade
    const pad = (4 - (head % 4)) % 4;
    const body = head + pad + layer.indices.length * (use32 ? 4 : 2);
    /* every layer block starts 4-byte aligned, so a typed-array view over any
     * layer's indices is legal however the layer before it ended */
    return { layer, vertCount, use32, head, pad, bytes: body + ((4 - (body % 4)) % 4) };
  });
  const bodyOffset = 16 + layers.length * 24;
  const buffer = Buffer.alloc(bodyOffset + blocks.reduce((sum, b) => sum + b.bytes, 0));
  buffer.writeUInt32LE(0x334e564c, 0); // "LVN3"
  buffer.writeUInt32LE(layers.length, 4);
  buffer.writeUInt32LE(0, 8); // flags, reserved
  buffer.writeUInt32LE(bodyOffset, 12);

  let bodyAt = 0;
  blocks.forEach((block, i) => {
    const { layer, vertCount, use32, head, pad } = block;
    const record = 16 + i * 24;
    buffer.writeUInt16LE(layer.classId, record);
    buffer.writeUInt8(layer.material, record + 2);
    buffer.writeUInt8(layer.drawOrder, record + 3);
    buffer.writeUInt8(ATTR_FADE | ATTR_SHADE, record + 4);
    buffer.writeUInt8(Y_UNIT, record + 5);
    buffer.writeUInt8(use32 ? 1 : 0, record + 6);
    buffer.writeUInt8(0, record + 7); // pad
    buffer.writeUInt32LE(vertCount, record + 8);
    buffer.writeUInt32LE(layer.indices.length, record + 12);
    buffer.writeUInt32LE(bodyAt, record + 16);
    buffer.writeUInt32LE(bodyAt + head + pad, record + 20);

    let at = bodyOffset + bodyAt;
    for (let k = 0; k < layer.positions.length; k++) {
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, layer.positions[k])), at);
      at += 2;
    }
    for (let k = 0; k < layer.fades.length; k++) buffer.writeUInt8(layer.fades[k], at++);
    for (let k = 0; k < layer.shades.length; k++) buffer.writeUInt8(layer.shades[k], at++);
    at += pad;
    for (let k = 0; k < layer.indices.length; k++) {
      if (use32) buffer.writeUInt32LE(layer.indices[k], at);
      else buffer.writeUInt16LE(layer.indices[k], at);
      at += use32 ? 4 : 2;
    }
    bodyAt += block.bytes;
  });

  const gz = gzipSync(buffer, { level: 9 });
  const outDir = "public/prototype/layline/venues";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${venueId}.bin`), gz);
  const vertCount = blocks.reduce((sum, b) => sum + b.vertCount, 0);
  const triCount = layers.reduce((sum, layer) => sum + layer.indices.length / 3, 0);
  const manifest = {
    id: venueId,
    origin: venue.origin,
    bearing: venue.bearing,
    clipRadius: CLIP_R,
    dataVersion: new Date().toISOString().slice(0, 10),
    sources: {
      coastline: "OpenStreetMap via Overpass API",
      buildings: "OpenStreetMap via Overpass API (LA County LiDAR heights)",
      elevation: `Mapzen Terrarium z${DEM_ZOOM} (AWS Open Data)`,
    },
    attribution: venue.attribution,
    stats: {
      vertices: vertCount,
      triangles: triCount,
      bytes: gz.length,
      layers: layers.map((layer, i) => ({
        classId: layer.classId,
        name: layer.name,
        vertices: blocks[i].vertCount,
        triangles: layer.indices.length / 3,
      })),
    },
  };
  writeFileSync(join(outDir, `${venueId}.json`), JSON.stringify(manifest, null, 2) + "\n");
  for (const block of blocks) {
    console.log(
      `  layer ${block.layer.classId} ${block.layer.name}: ${block.vertCount} verts, ` +
        `${block.layer.indices.length / 3} tris, ${block.bytes} raw bytes`,
    );
  }
  console.log(
    `asset: ${layers.length} layers, ${vertCount} verts, ${triCount} tris, ${buffer.length} raw, ${gz.length} gzipped`,
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
const massingWays = (await fetchMassing()).elements.filter(
  (e) => e.type === "way" && e.geometry && e.tags?.height,
);
const infraWays = (await fetchInfrastructure()).elements.filter(
  (e) => e.type === "way" && e.geometry,
);
console.log(`overpass Q2/Q3: ${massingWays.length} tall buildings, ${infraWays.length} infra ways`);
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
const beforeSlivers = rings.length;
/* Douglas-Peucker on a spit pulls its two sides together, so the sliver filter
 * has to run after simplification, not before it. */
rings = rings.flatMap((ring) => splitPinches(ring));
if (process.env.BAKE_DEBUG) {
  for (const ring of rings) {
    if (substantial(ring)) continue;
    const area = signedArea(ring);
    let cx = 0;
    let cy = 0;
    for (const p of ring) {
      cx += p.x / ring.length;
      cy += p.y / ring.length;
    }
    console.log(
      `  dropped n=${ring.length} area=${Math.round(area)} width=${(
        (2 * area) / perimeter(ring)
      ).toFixed(1)} at r=${Math.round(Math.hypot(cx, cy))} (${Math.round(cx)},${Math.round(cy)})`,
    );
  }
}
rings = rings.filter(substantial);
const rejoined = mergeSplitChords(rings);
rings = rejoined.rings;
const totalVerts = rings.reduce((s, r) => s + r.length, 0);
console.log(
  `rings: ${rings.length} land rings, ${totalVerts} verts after simplify and sliver filter (${beforeSlivers} before), ${rejoined.merges} pinch splits rejoined`,
);

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
const boxes = ringBoxes(rings);
into(L_TERRAIN, () => {
  buildLand(rings);
  buildRelief(boxes);
  buildBreakwaters(breakwaterWays, coastlineIds);
});
into(L_MASSING, () => buildMassing(massingWays));
into(L_PORT, () => buildPort(craneNodes.concat(craneWays), infraWays, rings, boxes));
writeAsset();
