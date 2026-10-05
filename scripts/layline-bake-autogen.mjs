/**
 * Bake the autogen venue asset for a Layline venue: US open data in, one .glb
 * out, dropped into the scene at the venue's own anchor.
 *
 *   node scripts/layline-bake-autogen.mjs long-beach
 *
 * Sources, all keyless and all fetched at bake time only:
 *   - 3DEP lidar, USGS, through the Entwine EPT octree on AWS Open Data.
 *     Only the nodes whose horizontal footprint meets the coverage box are
 *     fetched, and only down to `maxDepth`, which is the density knob: EPT
 *     stores a subsample per level, so stopping a level short quarters both the
 *     bytes and the point density. Nothing raw is kept beyond the node cache.
 *   - NAIP 2022 orthoimagery, USGS/USDA, through The National Map's keyless
 *     ImageServer. The AWS NAIP buckets are requester-pays and answer an
 *     unsigned request with 403, so the ImageServer is the only anonymous path.
 *     Every crop is pinned with `esriMosaicLockRaster` to one catalogue item so
 *     the URL stays a permanent address as the national mosaic gains years.
 *   - OpenStreetMap through Overpass: building footprints with geometry, water
 *     areas, coastline, breakwaters and piers.
 *
 * Stages: fetch -> classify land/water -> ground raster and hole fill ->
 * ground mesh with the water cut -> footprints extruded to lidar-measured roof
 * heights -> NAIP drape on ground and roofs -> procedural facades on walls ->
 * canopy billboards -> Draco + texture compression -> .glb + manifest.
 *
 * Walls are procedural and that is not a shortcut. A nadir orthophoto holds no
 * facade pixels at all, so draping one on a wall gives every column of that
 * wall the single ground texel under its footprint line: the spike measured the
 * stretch at 92x to 171x over downtown Long Beach and 12.7x to 23.7x less
 * vertical detail in the rendered frame than the procedural arm. There is
 * nothing to salvage there, so the walls are synthesised from what is actually
 * known (height from lidar, use from OSM tags, colour from the building's own
 * roof pixels) and only horizontals take the photograph.
 *
 * Frames. The output is in the venue's own course frame, identical to the one
 * `scripts/layline-bake-venue.mjs` bakes `<venue>.bin` in: ENU metres about the
 * venue origin, rotated so +y runs up the course axis, then mapped to glTF as
 * world (x, y up, -courseY). Heights are metres above the venue's sea datum, so
 * the scene's own water plane at y = 0 is the same water plane. The runtime
 * therefore adds the asset at the identity transform.
 *
 * Determinism. Two bakes from the same cache produce a byte-identical .glb and
 * a character-identical stdout. No clock and no unseeded randomness reaches any
 * output: retrieval dates come from the cache's own fetch log, the procedural
 * textures run a seeded integer PRNG, and every iteration order is either a
 * sorted array or a fixed literal. Progress and wall-clock timings go to
 * stderr, which is not part of the determinism claim.
 *
 * Scratch. Everything the bake downloads lives under `.tmp/autogen-prod/cache/`
 * behind a hard byte cap enforced in code. No decoded intermediate is written
 * to disk at all: points are binned into the rasters as each node decodes and
 * then dropped, so what survives a bake is exactly what a re-bake needs.
 */

import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { courseFrame, toMercator, R_MERCATOR } from "./lib/geo.mjs";
import { venueScenery } from "./lib/venue-scenery.mjs";

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ venues */

const VENUES = {
  "long-beach": {
    /* The anchor. Copied from `scripts/layline-bake-venue.mjs` VENUES
     * ["long-beach"] and asserted below against `scripts/lib/venue-scenery.mjs`,
     * because an autogen asset that lands in a different frame from the shipped
     * one is worse than no asset: it would look plausible and sit in the wrong
     * place. Do not invent a new anchor here. */
    origin: { lat: 33.742, lon: -118.155 },
    bearing: 215,

    /* Coverage. The venue's own clip disc is 10.5 km, 346 km2, and the spike
     * measured that at this pipeline's fidelity: 6.8 GB, about 270x the whole
     * 25 MB budget even before a LOD ladder. So the autogen patch is a square
     * about the waterfront the replay camera actually looks at, centred on the
     * app's own `downtown` lens target (scripts/venue-lens-targets.json, course
     * frame 4342, 309). Everything outside it is still the shipped baked
     * asset's job. `sideM` is the single coverage knob and the report states
     * what it cost. */
    coverage: { lon: -118.191496, lat: 33.766813, sideM: 2400 },

    /* Lidar z is NAVD88 orthometric metres on GEOID18 and the scene's water is
     * y = 0, so this constant is subtracted from every height. It is the
     * research round's class-9 median over the four THUMS islands. A per-bake
     * median would be tide at one flight line on one night: measured, the same
     * collection reads 1.33 m over the harbour and 2.47 m over downtown, so a
     * local median would step patches against each other and against the water.
     * The honest error bar on absolute elevation is about 1 m either way. */
    seaDatumNavd88M: 0.65,

    attribution: [
      "Map data (c) OpenStreetMap contributors, ODbL",
      "Elevation and imagery: map services and data available from U.S. Geological Survey, National Geospatial Program",
      "Orthoimagery: NAIP, USGS/USDA, public domain, via The National Map",
    ],
  },
};

/* Bake parameters. Every one of these moves an output byte, so they are config
 * with a stated reason rather than literals buried in the algorithm. */
const BAKE = {
  /* Master seed. Every procedural texture derives its PRNG stream from this
   * XORed with a per-palette constant, so the seed is the only knob that can
   * change a texture without changing the code, and a bake at another seed
   * shows up in the manifest instead of looking like drift. */
  seed: 0x6175746f, // "auto"

  /* Analysis raster. 1 m is the cell the building bases, roof heights and the
   * canopy model are all read off; only the emitted mesh is decimated. */
  rasterCellM: 1,

  /* The land/water rule is a nearest-segment query against the coastline plus
   * polygon tests, and it dominated the spike's runtime (5.4 s for 640k cells).
   * Probing on a 2 m grid and expanding to the 1 m raster cuts it 4x, and 2 m
   * is still half the emitted mesh cell, so the cut edge cannot see it. */
  waterProbeCellM: 2,

  /* Emitted ground mesh cell. 4 m over a 2.4 km square is 601x601 nodes before
   * the water cut. At 1 m the same patch is 5.76 M quads and no amount of
   * geometry compression brings that inside 25 MB. */
  meshCellM: 4,

  /* EPT octree depth. Depth 13 is full resolution for this collection, about
   * 13 pts/m2 and roughly 170 MB of LAZ per km2 of land. Each level up quarters
   * both. Depth 12 gives about 3.3 pts/m2, which is still 3 returns in every
   * 1 m cell and 300+ samples in a 100 m2 roof, for a quarter of the download.
   * The measured density is reported, not assumed. */
  maxDepth: 12,

  /* Ground and roof texture. 4096 px over 2400 m is 0.586 m a texel against
   * NAIP's 0.6 m native ground sample, so nothing here is upsampled imagery
   * pretending to be resolution. The ImageServer caps an export at 4000 px and
   * a crop must be locked to one catalogue quad that covers it, so the atlas is
   * fetched as a grid of tiles and composited. */
  atlasPx: 4096,
  naipGrid: 4,

  /* Texture codec. KTX2/Basis is what the contract asks for and what this
   * machine cannot produce: `three` vendors the Basis *transcoder* only, no
   * encoder, and there is no `toktx`, `basisu` or `@gltf-transform` on the box.
   * JPEG is the honest fallback and is competitive on disk; the cost is GPU
   * memory, and that is what actually bounds this asset.
   *
   * The arithmetic that sets every size knob below. On disk the whole asset is
   * a small fraction of the 25 MB cap. In GPU memory the 4096 x 4096 atlas
   * decodes to RGBA whatever it cost on disk: 67 MB, about 89 MB with mipmaps,
   * because JPEG is a file format and not a GPU format. ETC1S would be about
   * 11 MB for the same texels, so the missing encoder, not the byte budget, is
   * what caps coverage here: at equal GPU cost ETC1S would buy roughly 4x the
   * ground area at this texel size.
   *
   * So the headroom is spent only where it costs nothing at runtime. Quality 92
   * sharpens the drape for about 2 MB more on disk and not one byte more on the
   * GPU, since the decoded surface is the same size either way. Coverage and
   * mesh density are deliberately NOT raised to consume the budget: both would
   * buy disk usage with frame time. */
  jpegQuality: 92,

  /* Draco quantization. 15 bits over a 2.4 km extent is 7.3 cm, below the
   * 1 m raster the geometry is derived from, so quantization is not the
   * limiting error anywhere in this asset. */
  dracoPositionBits: 15,
  dracoNormalBits: 8,
  dracoUvBits: 12,
  dracoColorBits: 8,

  /* Buildings. A footprint with neither 2 m of lidar relief nor an OSM height
   * tag is dropped rather than guessed at. */
  buildingMinHeightM: 2.5,
  buildingMaxHeightM: 250,
  buildingCollarM: 6,
  groundFillPasses: 60,

  /* Canopy. No vegetation class exists in this collection, so crowns come from
   * a normalised height model: surface minus filled ground, buildings and water
   * removed. The count carries a stated tolerance of roughly a factor of three
   * (the smoothing radius moves it); the height distribution is stable. */
  crownMinHeightM: 3,
  crownMaxHeightM: 30,
  crownMaxRadiusM: 7,
  crownWindowCells: 3,

  /* Hard scratch cap, bytes. Enforced by a running counter, not by hope. */
  scratchCapBytes: 3 * 1024 * 1024 * 1024,
};

/* Facade palettes. One wall recipe each, chosen from OSM tags and the measured
 * height. Kept mid-tone rather than dark: the per-building COLOR_0 tint has to
 * be able to move a wall both lighter and darker, and a near-black source can
 * only go darker. */
const PALETTES = {
  glassTower: {
    seed: 0x51a55, floors: 4, wall: [132, 142, 150], glass: [104, 126, 140],
    glassHot: [176, 196, 208], mullion: [96, 104, 112], spandrel: [116, 126, 134],
    ribbon: true, baseWall: [112, 118, 124], baseGlass: [58, 74, 86],
  },
  midriseCommercial: {
    seed: 0x3d1f00, floors: 4, wall: [176, 170, 156], glass: [56, 66, 72],
    glassHot: [128, 140, 146], mullion: [120, 114, 104], spandrel: [158, 152, 140],
    ribbon: false, baseWall: [150, 144, 132], baseGlass: [48, 58, 66],
  },
  residential: {
    seed: 0x9c3311, floors: 5, wall: [198, 186, 168], glass: [64, 70, 74],
    glassHot: [140, 142, 140], mullion: [166, 154, 138], spandrel: [186, 174, 156],
    ribbon: false, balcony: true, baseWall: [174, 162, 146], baseGlass: [72, 76, 78],
  },
  parking: {
    seed: 0x70a2c1, floors: 4, wall: [150, 148, 144], glass: [30, 32, 34],
    glassHot: [52, 54, 56], mullion: [130, 128, 124], spandrel: [140, 138, 134],
    openDeck: true, baseWall: [136, 134, 130], baseGlass: [34, 36, 38],
  },
  industrial: {
    seed: 0x2288aa, floors: 2, wall: [162, 164, 160], glass: [78, 88, 92],
    glassHot: [120, 128, 130], mullion: [140, 142, 138], spandrel: [152, 154, 150],
    ribbed: true, baseWall: [146, 148, 144], baseGlass: [70, 78, 82],
  },
};
/** Fixed palette order, so texture indices and material order never depend on
 * object key enumeration accidents. */
const PALETTE_ORDER = ["glassTower", "midriseCommercial", "residential", "parking", "industrial"];

const TILE_W_M = 16;
const TILE_H_M = 16;
const BASE_H_M = 4;
const FACADE_PX_PER_M = 32;

const GROUND_CLASSES = new Set([2, 20]);
const SURFACE_SKIP = new Set([7, 9, 18]); // low noise, water, high noise
const WATER_CLASS = 9;
const NODATA = -9999;
const DEG = Math.PI / 180;

/* -------------------------------------------------------------------- cli */

const VENUE_ID = process.argv[2] ?? "long-beach";
const venue = VENUES[VENUE_ID];
if (!venue) {
  throw new Error(`unknown venue "${VENUE_ID}"; known: ${Object.keys(VENUES).join(", ")}`);
}
const scenery = venueScenery(VENUE_ID);
if (scenery.origin.lat !== venue.origin.lat || scenery.origin.lon !== venue.origin.lon) {
  throw new Error(
    `anchor drift: this script has ${venue.origin.lat}/${venue.origin.lon}, ` +
      `scripts/lib/venue-scenery.mjs has ${scenery.origin.lat}/${scenery.origin.lon}`,
  );
}
if (scenery.bearing !== venue.bearing) {
  throw new Error(`bearing drift: ${venue.bearing} here, ${scenery.bearing} in venue-scenery.mjs`);
}

const ROOT = ".tmp/autogen-prod";
const CACHE_DIR = `${ROOT}/cache`;
const OUT_DIR = "public/prototype/layline/venues";
const DECODER_DIR = "public/prototype/layline/decoders";
mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

/* The cache root is read once when `venue-cache.mjs` loads, so it has to be set
 * before that module resolves. Static imports hoist; dynamic ones do not. */
process.env.LAYLINE_VENUE_CACHE_ROOT = CACHE_DIR;
const { cachedFetch, provenanceOf, sha256, CACHE_ROOT } = await import("./lib/venue-cache.mjs");
const { openCollection } = await import("./lib/ept.mjs");
const { decodeLaz } = await import("./lib/laz.mjs");
const { decodePng, quadForBbox, exportUrl, verifyCoverage } = await import("./lib/naip.mjs");
if (CACHE_ROOT !== CACHE_DIR) throw new Error(`cache root override failed: ${CACHE_ROOT}`);

/* ------------------------------------------------------------------- log */

/** stdout carries only content derived from the data, so two bakes from one
 * cache print the same characters. Progress and timings go to stderr. */
const out = (line) => process.stdout.write(`${line}\n`);
const note = (line) => process.stderr.write(`${line}\n`);
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const fmtBytes = (n) => `${(n / 1e6).toFixed(2)} MB`;
const round = (v, d = 3) => Number(v.toFixed(d));
/** Installed version of a dependency, read off disk. `require("x/package.json")`
 * fails for any package whose `exports` map omits it, which three's does. */
const pkgVersion = (name) =>
  JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;

/* ------------------------------------------------------------ scratch cap */

/** Running byte counter over the scratch tree, seeded by one walk and kept up
 * to date as files land. A bake that would exceed the cap stops at the fetch
 * that crosses it rather than after filling the disk. */
const scratch = {
  bytes: 0,
  peak: 0,
  files: 0,
  walk() {
    let bytes = 0;
    let files = 0;
    const visit = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) visit(p);
        else {
          bytes += statSync(p).size;
          files++;
        }
      }
    };
    if (existsSync(CACHE_DIR)) visit(CACHE_DIR);
    this.bytes = bytes;
    this.files = files;
    if (bytes > this.peak) this.peak = bytes;
    return bytes;
  },
  add(n) {
    this.bytes += n;
    if (this.bytes > this.peak) this.peak = this.bytes;
    this.check();
  },
  check() {
    if (this.bytes > BAKE.scratchCapBytes) {
      throw new Error(
        `scratch cap exceeded: ${fmtBytes(this.bytes)} under ${CACHE_DIR}, cap ${fmtBytes(BAKE.scratchCapBytes)}. ` +
          `Lower BAKE.maxDepth or venue.coverage.sideM, or clear the cache.`,
      );
    }
  },
};
scratch.walk();
scratch.check();
note(`[${since()}] scratch at start ${fmtBytes(scratch.bytes)} in ${scratch.files} files`);

/** cachedFetch, with the bytes it lands accounted against the cap. */
async function guardedFetch(url, rel, options) {
  const path = join(CACHE_DIR, rel);
  const had = existsSync(path);
  const buf = await cachedFetch(url, rel, options);
  if (!had) scratch.add(buf.length);
  return buf;
}

/* ---------------------------------------------------------------- frames */

const frame = courseFrame({ ...venue.origin, bearing: venue.bearing });
const SEA_Z = venue.seaDatumNavd88M;
const cosB = Math.cos(venue.bearing * DEG);
const sinB = Math.sin(venue.bearing * DEG);

/* The coverage box is defined in EPSG:3857, the CRS both the lidar octree and
 * the ImageServer speak, so the drape UV is an exact linear function of the
 * grid index and the point cloud needs no reprojection to be rasterised. A
 * mercator unit is cos(lat) ground metres, hence the widening. Three decimals
 * is a tenth of a millimetre and makes every derived URL byte-stable. */
const [cmx, cmy] = toMercator(venue.coverage.lon, venue.coverage.lat);
const mercatorHalf = venue.coverage.sideM / 2 / Math.cos(venue.coverage.lat * DEG);
const r3 = (v) => Number(v.toFixed(3));
const BOX = [r3(cmx - mercatorHalf), r3(cmy - mercatorHalf), r3(cmx + mercatorHalf), r3(cmy + mercatorHalf)];

const NX = Math.round(venue.coverage.sideM / BAKE.rasterCellM);
const NY = NX;
const DM = (BOX[2] - BOX[0]) / NX; // mercator units per raster cell
const idx = (ix, iy) => iy * NX + ix;
/** Ground metres a raster cell spans. Mercator scale varies by 0.02 % across a
 * 2.4 km box at this latitude, so one number describes the whole grid. */
const CELL_GROUND_M = DM * Math.cos(venue.coverage.lat * DEG);
const AREA_M2 = (NX * CELL_GROUND_M) * (NY * CELL_GROUND_M);

const lonOfMx = (mx) => (mx * 180) / (Math.PI * R_MERCATOR);
const latOfMy = (my) => ((2 * Math.atan(Math.exp(my / R_MERCATOR)) - Math.PI / 2) * 180) / Math.PI;

/** Course-frame metres for a mercator point. `courseFrame.project` is affine in
 * (lon - lon0, lat - lat0) and mercator x depends only on lon, y only on lat,
 * so a whole grid separates into one array per axis instead of two
 * transcendental calls per cell. */
function courseOf(mx, my) {
  const e = (lonOfMx(mx) - venue.origin.lon) * frame.mPerLon;
  const n = (latOfMy(my) - venue.origin.lat) * frame.mPerLat;
  return { x: e * cosB - n * sinB, y: e * sinB + n * cosB };
}

/** Course-frame bounding box of the coverage square, for the OSM harvest. */
const courseBox = (() => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [mx, my] of [
    [BOX[0], BOX[1]], [BOX[2], BOX[1]], [BOX[2], BOX[3]], [BOX[0], BOX[3]],
  ]) {
    const c = courseOf(mx, my);
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x);
    y0 = Math.min(y0, c.y);
    y1 = Math.max(y1, c.y);
  }
  return { x0, y0, x1, y1 };
})();

out(`venue ${VENUE_ID}`);
out(`anchor ${venue.origin.lat} ${venue.origin.lon} bearing ${venue.bearing} deg true, sea datum ${SEA_Z} m NAVD88`);
out(`coverage centre ${venue.coverage.lon} ${venue.coverage.lat}, side ${venue.coverage.sideM} m, area ${round(AREA_M2 / 1e6, 3)} km2`);
out(`coverage mercator box ${BOX.join(",")}`);
out(`course-frame box x ${round(courseBox.x0, 1)}..${round(courseBox.x1, 1)} y ${round(courseBox.y0, 1)}..${round(courseBox.y1, 1)} m`);
out(`raster ${NX}x${NY} @ ${round(CELL_GROUND_M, 4)} m, mesh cell ${BAKE.meshCellM} m, seed 0x${BAKE.seed.toString(16)}`);

/* --------------------------------------------------------------- overpass */

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

/** lat/lon envelope enclosing the coverage box, padded in ground metres. */
function latLonEnvelope(padM) {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const [x, y] of [
    [courseBox.x0 - padM, courseBox.y0 - padM],
    [courseBox.x1 + padM, courseBox.y0 - padM],
    [courseBox.x1 + padM, courseBox.y1 + padM],
    [courseBox.x0 - padM, courseBox.y1 + padM],
  ]) {
    const p = frame.unproject(x, y);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
  }
  return [s, w, n, e].map((v) => Number(v.toFixed(6)));
}

/**
 * One cached Overpass response. The query text is hashed into the cache name so
 * editing a query cannot silently reuse the old answer, and the mirrors are
 * tried in order because overpass-api.de rate-limits under load. Errors from
 * one mirror are transient by default: a dropped connection says nothing about
 * whether the data exists.
 */
async function overpass(name, query) {
  const rel = `overpass/${VENUE_ID}-${name}-${sha256(Buffer.from(query)).slice(0, 12)}.json`;
  const verify = (buf) => {
    if (buf.length < 2 || buf[0] !== 0x7b) throw new Error("Overpass returned a non-JSON body");
    JSON.parse(buf.toString("utf8"));
  };
  let last = null;
  for (const mirror of OVERPASS_MIRRORS) {
    const url = `${mirror}?data=${encodeURIComponent(query)}`;
    try {
      const buf = await guardedFetch(url, rel, { label: `overpass ${name}`, verify, retries: 4 });
      return { buf, json: JSON.parse(buf.toString("utf8")), rel, url };
    } catch (error) {
      last = error;
      note(`[${since()}] overpass ${name} via ${mirror}: ${error.message}`);
    }
  }
  throw new Error(`overpass ${name}: every mirror failed, last was ${last?.message}`);
}

const envWide = latLonEnvelope(3000).join(",");
const envNear = latLonEnvelope(600).join(",");
const envBuild = latLonEnvelope(60).join(",");

/* Coastline is harvested wider than everything else on purpose: the rule that
 * decides land is the side of the *nearest* coastline segment, and for a cell
 * in the middle of a basin the nearest segment can be a kilometre away. Clip
 * the harvest to the tile and that cell gets the wrong answer silently. */
const qCoast = await overpass(
  "coast",
  `[out:json][timeout:180];(way["natural"="coastline"](${envWide});way["man_made"="breakwater"](${envWide}););out geom;`,
);
const qPier = await overpass(
  "pier",
  `[out:json][timeout:120];(way["man_made"="pier"](${envNear}););out geom;`,
);
/* The coastline layer alone is wrong for a harbour venue and the spike proved
 * it: Long Beach's inner basins (Rainbow Harbour, Queensway Bay, the marina
 * fingers) are mapped as `natural=water` areas, not as coastline, and without
 * this query every probe inside Rainbow Harbour came back +335 m to +780 m of
 * "land" and the whole waterfront classified dry. */
const qWater = await overpass(
  "water",
  `[out:json][timeout:180];(way["natural"="water"](${envNear});relation["natural"="water"](${envNear});way["waterway"="dock"](${envNear});way["landuse"="basin"](${envNear}););out geom;`,
);
/* The baker's own cached building query is `out center`, which is a point.
 * Extrusion needs rings, so this asks for geometry over the coverage only. */
const qBuildings = await overpass(
  "buildings",
  `[out:json][timeout:180];(way["building"](${envBuild}););out geom;`,
);

const osmInputs = [qCoast, qPier, qWater, qBuildings].map((q) => ({
  file: q.rel,
  bytes: q.buf.length,
  sha256: sha256(q.buf),
  retrieved: provenanceOf(q.rel)?.retrieved ?? null,
}));
out(
  `osm coastline+breakwater ${qCoast.buf.length} B, piers ${qPier.buf.length} B, ` +
    `water areas ${qWater.buf.length} B, buildings ${qBuildings.buf.length} B`,
);

/* ----------------------------------------------------------- water classifier */

const BREAKWATER_HALF = 45;
const PIER_HALF = 6;
const PIER_AREA_DILATE = 3;

function segDist2(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  let t = ((px - s.ax) * dx + (py - s.ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = s.ax + t * dx - px;
  const qy = s.ay + t * dy - py;
  return qx * qx + qy * qy;
}

function pointInRing(pts, px, py) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Uniform-grid nearest-segment index over the coastline. */
function segIndex(segs, cellM = 128) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.ax, s.bx);
    maxX = Math.max(maxX, s.ax, s.bx);
    minY = Math.min(minY, s.ay, s.by);
    maxY = Math.max(maxY, s.ay, s.by);
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellM) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / cellM) + 1);
  const buckets = new Map();
  segs.forEach((s, i) => {
    const cx0 = Math.floor((Math.min(s.ax, s.bx) - minX) / cellM);
    const cx1 = Math.floor((Math.max(s.ax, s.bx) - minX) / cellM);
    const cy0 = Math.floor((Math.min(s.ay, s.by) - minY) / cellM);
    const cy1 = Math.floor((Math.max(s.ay, s.by) - minY) / cellM);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * cols + cx;
        let l = buckets.get(key);
        if (!l) buckets.set(key, (l = []));
        l.push(i);
      }
    }
  });
  const maxRing = Math.max(cols, rows);
  return (px, py) => {
    const qx = Math.floor((px - minX) / cellM);
    const qy = Math.floor((py - minY) / cellM);
    let best = Infinity;
    let bestSeg = null;
    for (let r = 0; r <= maxRing; r++) {
      if (bestSeg && (r - 1) * cellM > Math.sqrt(best)) break;
      for (let cy = qy - r; cy <= qy + r; cy++) {
        for (let cx = qx - r; cx <= qx + r; cx++) {
          if (r > 0 && Math.max(Math.abs(cx - qx), Math.abs(cy - qy)) !== r) continue;
          const list = buckets.get(cy * cols + cx);
          if (!list) continue;
          for (const i of list) {
            const d2 = segDist2(px, py, segs[i]);
            if (d2 < best) {
              best = d2;
              bestSeg = segs[i];
            }
          }
        }
      }
    }
    return bestSeg ? { seg: bestSeg, d: Math.sqrt(best) } : null;
  };
}

/**
 * Land/water in the course frame, from the same OSM inputs and the same rule as
 * the shipped water mask, re-run in the baked frame rather than resampled from
 * that mask: the mask is built in a WGS84-local-radii frame (mPerLat 110917.7)
 * so it registers with the ECEF Google tileset, and it disagrees with the
 * baker's frame (mPerLat 110574) by about 15 m at 5 km from the origin.
 *
 * Precedence: a breakwater or pier corridor stamps land; then a mapped water
 * area is water; then the nearest coastline segment decides by its side, land
 * on the left of a to b.
 */
const waterClassifier = (() => {
  const proj = (g) => frame.project(g.lat, g.lon);
  const marginM = 600;
  const nx0 = courseBox.x0 - marginM;
  const nx1 = courseBox.x1 + marginM;
  const ny0 = courseBox.y0 - marginM;
  const ny1 = courseBox.y1 + marginM;
  const near = (p) => p.x >= nx0 && p.x <= nx1 && p.y >= ny0 && p.y <= ny1;

  const coastSegs = [];
  let coastWays = 0;
  for (const way of qCoast.json.elements) {
    if (way.type !== "way" || way.tags?.natural !== "coastline" || !Array.isArray(way.geometry)) continue;
    const pts = way.geometry.map(proj);
    let used = false;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a.x === b.x && a.y === b.y) continue;
      coastSegs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      used = true;
    }
    if (used) coastWays++;
  }
  if (!coastSegs.length) throw new Error("no coastline harvested; the water cut has nothing to decide with");
  const nearestCoast = segIndex(coastSegs);

  const corridors = [];
  const areaRings = [];
  const addCorridor = (way, half, areaDilate) => {
    const pts = way.geometry.map(proj);
    if (pts.length < 2) return;
    const closed =
      pts.length > 3 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y;
    if (closed && areaDilate !== undefined) {
      if (!pts.some(near)) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      areaRings.push({ pts, dilate: areaDilate, minX, maxX, minY, maxY });
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!near(a) && !near(b)) continue;
      if (a.x === b.x && a.y === b.y) continue;
      corridors.push({
        ax: a.x, ay: a.y, bx: b.x, by: b.y, half,
        minX: Math.min(a.x, b.x) - half, maxX: Math.max(a.x, b.x) + half,
        minY: Math.min(a.y, b.y) - half, maxY: Math.max(a.y, b.y) + half,
      });
    }
  };
  let breakwaterWays = 0;
  let pierWays = 0;
  for (const way of qCoast.json.elements) {
    if (way.type !== "way" || way.tags?.man_made !== "breakwater") continue;
    if (way.tags?.natural === "coastline" || !Array.isArray(way.geometry)) continue;
    addCorridor(way, BREAKWATER_HALF);
    breakwaterWays++;
  }
  for (const way of qPier.json.elements) {
    if (way.type !== "way" || way.tags?.man_made !== "pier" || !Array.isArray(way.geometry)) continue;
    addCorridor(way, PIER_HALF, PIER_AREA_DILATE);
    pierWays++;
  }

  const waterOuters = [];
  const waterInners = [];
  let waterAreas = 0;
  let waterRelations = 0;
  const addRing = (geometry, into) => {
    if (!Array.isArray(geometry) || geometry.length < 4) return;
    const pts = geometry.map(proj);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    into.push({ pts, minX, maxX, minY, maxY });
  };
  for (const e of qWater.json.elements) {
    if (e.type === "way" && Array.isArray(e.geometry)) {
      addRing(e.geometry, waterOuters);
      waterAreas++;
    } else if (e.type === "relation" && Array.isArray(e.members)) {
      waterRelations++;
      for (const m of e.members) {
        if (!Array.isArray(m.geometry)) continue;
        addRing(m.geometry, m.role === "inner" ? waterInners : waterOuters);
      }
    }
  }

  const inRings = (rings, px, py) => {
    for (const r of rings) {
      if (px < r.minX || px > r.maxX || py < r.minY || py > r.maxY) continue;
      if (pointInRing(r.pts, px, py)) return true;
    }
    return false;
  };

  const corridorSigned = (px, py) => {
    let best = -Infinity;
    for (const s of corridors) {
      if (px < s.minX || px > s.maxX || py < s.minY || py > s.maxY) continue;
      const v = s.half - Math.sqrt(segDist2(px, py, s));
      if (v > best) best = v;
    }
    for (const ring of areaRings) {
      const d = ring.dilate;
      if (px < ring.minX - d || px > ring.maxX + d || py < ring.minY - d || py > ring.maxY + d) continue;
      let d2 = Infinity;
      const pts = ring.pts;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1].x === pts[i].x && pts[i - 1].y === pts[i].y) continue;
        const r = segDist2(px, py, {
          ax: pts[i - 1].x, ay: pts[i - 1].y, bx: pts[i].x, by: pts[i].y,
        });
        if (r < d2) d2 = r;
      }
      if (d2 === Infinity) continue;
      const dist = Math.sqrt(d2);
      const v = (pointInRing(pts, px, py) ? dist : -dist) + d;
      if (v > best) best = v;
    }
    return best;
  };

  const isLand = (px, py) => {
    if (corridorSigned(px, py) >= 0) return true;
    if (inRings(waterOuters, px, py) && !inRings(waterInners, px, py)) return false;
    const hit = nearestCoast(px, py);
    if (!hit) return false;
    const s = hit.seg;
    return (s.bx - s.ax) * (py - s.ay) - (s.by - s.ay) * (px - s.ax) >= 0;
  };

  return {
    isLand,
    stats: {
      coastWays,
      coastSegments: coastSegs.length,
      breakwaterWays,
      pierWays,
      corridorSegments: corridors.length,
      pierAreas: areaRings.length,
      waterAreaWays: waterAreas,
      waterAreaRelations: waterRelations,
      waterOuterRings: waterOuters.length,
      waterInnerRings: waterInners.length,
      breakwaterHalfM: BREAKWATER_HALF,
      pierHalfM: PIER_HALF,
      pierAreaDilateM: PIER_AREA_DILATE,
    },
  };
})();
out(
  `water rule: ${waterClassifier.stats.coastSegments} coastline segments from ${waterClassifier.stats.coastWays} ways, ` +
    `${waterClassifier.stats.waterOuterRings} water outers / ${waterClassifier.stats.waterInnerRings} inners ` +
    `from ${waterClassifier.stats.waterAreaWays} ways + ${waterClassifier.stats.waterAreaRelations} relations, ` +
    `${waterClassifier.stats.corridorSegments} corridor segments, ${waterClassifier.stats.pierAreas} pier areas`,
);

/* ------------------------------------------------------------- land mask */

/* Probed on a coarser grid than the raster and expanded by nearest neighbour.
 * The probe cell is half the emitted mesh cell, so the cut edge cannot resolve
 * the difference; the spike measured this rule as the pipeline's single
 * slowest stage and it is the only place worth spending a shortcut. */
const PSTEP = Math.round(BAKE.waterProbeCellM / BAKE.rasterCellM);
const PNX = Math.ceil(NX / PSTEP);
const PNY = Math.ceil(NY / PSTEP);
const probeLand = new Uint8Array(PNX * PNY);
{
  const px = new Float64Array(PNX);
  const py = new Float64Array(PNY);
  for (let i = 0; i < PNX; i++) {
    const mx = BOX[0] + (Math.min(NX - 1, i * PSTEP) + 0.5) * DM;
    px[i] = (lonOfMx(mx) - venue.origin.lon) * frame.mPerLon;
  }
  for (let j = 0; j < PNY; j++) {
    const my = BOX[1] + (Math.min(NY - 1, j * PSTEP) + 0.5) * DM;
    py[j] = (latOfMy(my) - venue.origin.lat) * frame.mPerLat;
  }
  for (let j = 0; j < PNY; j++) {
    for (let i = 0; i < PNX; i++) {
      const x = px[i] * cosB - py[j] * sinB;
      const y = px[i] * sinB + py[j] * cosB;
      probeLand[j * PNX + i] = waterClassifier.isLand(x, y) ? 1 : 0;
    }
  }
  note(`[${since()}] land probe ${PNX}x${PNY} done`);
}
const landMask = new Uint8Array(NX * NY);
let landCells = 0;
for (let iy = 0; iy < NY; iy++) {
  const pj = Math.min(PNY - 1, Math.round(iy / PSTEP));
  for (let ix = 0; ix < NX; ix++) {
    const v = probeLand[pj * PNX + Math.min(PNX - 1, Math.round(ix / PSTEP))];
    landMask[idx(ix, iy)] = v;
    landCells += v;
  }
}
out(
  `land/water ${landCells} land, ${NX * NY - landCells} water of ${NX * NY} cells ` +
    `(${round((landCells / (NX * NY)) * 100, 2)}% land, ${round((landCells * CELL_GROUND_M * CELL_GROUND_M) / 1e6, 3)} km2)`,
);

/* ---------------------------------------------------------------- lidar */

const lidar = scenery.lidar;
const reader = await openCollection({ endpoint: lidar.endpoint, collection: lidar.collection });
const nodes = await reader.nodesInBox(BOX, BAKE.maxDepth);
note(`[${since()}] ${nodes.length} EPT nodes intersect the coverage box at depth <= ${BAKE.maxDepth}`);

const ground = new Float32Array(NX * NY).fill(NODATA);
const surface = new Float32Array(NX * NY).fill(NODATA);
const hitCount = new Uint16Array(NX * NY);
const waterHits = new Uint16Array(NX * NY);
let pointsBinned = 0;
let lazBytes = 0;
let waterReturns = 0;
let zMin = Infinity;
let zMax = -Infinity;
const classHist = new Map();
const lidarInputs = [];

for (let n = 0; n < nodes.length; n++) {
  const key = nodes[n].key;
  const rel = `lidar/${lidar.collection}/node-${key}.laz`;
  const buf = await guardedFetch(`${reader.base}/ept-data/${key}.laz`, rel, {
    label: `${lidar.collection} node ${key}`,
  });
  lazBytes += buf.length;
  lidarInputs.push({ file: rel, bytes: buf.length, sha256: sha256(buf) });
  const decoded = await decodeLaz(buf);
  for (let i = 0; i < decoded.count; i++) {
    const ix = Math.floor((decoded.x[i] - BOX[0]) / DM);
    if (ix < 0 || ix >= NX) continue;
    const iy = Math.floor((decoded.y[i] - BOX[1]) / DM);
    if (iy < 0 || iy >= NY) continue;
    const k = idx(ix, iy);
    const cls = decoded.classification[i];
    const z = decoded.z[i];
    pointsBinned++;
    classHist.set(cls, (classHist.get(cls) ?? 0) + 1);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    if (hitCount[k] < 65535) hitCount[k]++;
    if (cls === WATER_CLASS) {
      if (waterHits[k] < 65535) waterHits[k]++;
      waterReturns++;
      continue;
    }
    if (GROUND_CLASSES.has(cls) && (ground[k] === NODATA || z < ground[k])) ground[k] = z;
    if (!SURFACE_SKIP.has(cls) && (surface[k] === NODATA || z > surface[k])) surface[k] = z;
  }
  if ((n + 1) % 100 === 0 || n === nodes.length - 1) {
    note(`[${since()}] lidar ${n + 1}/${nodes.length} nodes, ${fmtBytes(lazBytes)}, ${pointsBinned.toLocaleString()} points in box`);
    scratch.check();
  }
}
if (!pointsBinned) throw new Error("no lidar points landed inside the coverage box");

const landAreaM2 = landCells * CELL_GROUND_M * CELL_GROUND_M;
const densityPtsPerM2 = pointsBinned / AREA_M2;
const densityOverLand = landAreaM2 ? pointsBinned / landAreaM2 : 0;
out(`lidar ${lidar.collection} depth<=${BAKE.maxDepth}: ${nodes.length} nodes, ${lazBytes} B LAZ`);
out(
  `lidar points ${pointsBinned} in box, ${round(densityPtsPerM2, 3)} /m2 over the square, ` +
    `${round(densityOverLand, 3)} /m2 over land, z ${round(zMin, 2)}..${round(zMax, 2)} m NAVD88`,
);
out(
  `lidar classes ${[...classHist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, v]) => `${c}:${round((v / pointsBinned) * 100, 2)}%`)
    .join(" ")}`,
);

/* The lidar's own void is an independent signal about water: 3DEP is
 * terrestrial and water is specular, so a cell with returns that are not mostly
 * class 9 is land whatever OSM says. Reported as a cross-check on the cut, not
 * used to make it. */
const cut = { bothLand: 0, bothWater: 0, osmWaterLidarHit: 0, osmLandLidarVoid: 0 };
for (let k = 0; k < NX * NY; k++) {
  const osmLand = landMask[k] === 1;
  const lidarHit = hitCount[k] > 0 && waterHits[k] * 2 < hitCount[k];
  if (osmLand && lidarHit) cut.bothLand++;
  else if (!osmLand && !lidarHit) cut.bothWater++;
  else if (!osmLand && lidarHit) cut.osmWaterLidarHit++;
  else cut.osmLandLidarVoid++;
}
cut.agreementPct = round(((cut.bothLand + cut.bothWater) / (NX * NY)) * 100, 2);
out(
  `water cut vs lidar void: ${cut.agreementPct}% agree ` +
    `(${cut.bothLand} both land, ${cut.bothWater} both water, ` +
    `${cut.osmWaterLidarHit} osm-water/lidar-hit, ${cut.osmLandLidarVoid} osm-land/lidar-void)`,
);
out(`lidar class-9 returns in box ${waterReturns}`);

/* ------------------------------------------------------------ hole fill */

const filled = Float32Array.from(ground);
const known = new Uint8Array(NX * NY);
for (let k = 0; k < NX * NY; k++) known[k] = filled[k] === NODATA ? 0 : 1;
let holes = 0;
for (let k = 0; k < NX * NY; k++) if (!known[k] && landMask[k]) holes++;
{
  const next = new Float32Array(NX * NY);
  const nextKnown = new Uint8Array(NX * NY);
  for (let pass = 0; pass < BAKE.groundFillPasses; pass++) {
    next.set(filled);
    nextKnown.set(known);
    let changed = 0;
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        const k = idx(ix, iy);
        if (known[k] || !landMask[k]) continue;
        let sum = 0;
        let n = 0;
        if (ix > 0 && known[k - 1]) {
          sum += filled[k - 1];
          n++;
        }
        if (ix < NX - 1 && known[k + 1]) {
          sum += filled[k + 1];
          n++;
        }
        if (iy > 0 && known[k - NX]) {
          sum += filled[k - NX];
          n++;
        }
        if (iy < NY - 1 && known[k + NX]) {
          sum += filled[k + NX];
          n++;
        }
        if (!n) continue;
        next[k] = sum / n;
        nextKnown[k] = 1;
        changed++;
      }
    }
    filled.set(next);
    known.set(nextKnown);
    if (!changed) break;
  }
}
let unresolved = 0;
for (let k = 0; k < NX * NY; k++) if (!known[k] && landMask[k]) unresolved++;
out(
  `ground fill ${holes} land holes, ${unresolved} unresolved ` +
    `(${round((unresolved / Math.max(1, landCells)) * 100, 2)}% of land)`,
);
note(`[${since()}] ground fill done`);

/* ------------------------------------------------------------ NAIP atlas */

/* The atlas is fetched as a grid because an ImageServer export caps at 4000 px
 * and, more importantly, a crop has to be locked to a single catalogue quad
 * that covers it: this coverage straddles the 16095/16096 quad seam, and an
 * unlocked mosaic is not reproducible while a crop locked to a quad that does
 * not cover the box comes back as an all-white PNG under HTTP 200. */
const ortho = scenery.ortho;
const TILE_PX = BAKE.atlasPx / BAKE.naipGrid;
if (!Number.isInteger(TILE_PX)) throw new Error(`atlasPx ${BAKE.atlasPx} is not divisible by naipGrid ${BAKE.naipGrid}`);
if (TILE_PX > 4000) throw new Error(`NAIP tile ${TILE_PX} px exceeds the ImageServer 4000 px export cap`);

const atlas = Buffer.alloc(BAKE.atlasPx * BAKE.atlasPx * 3);
const naipInputs = [];
const naipQuads = new Map();
let naipBytes = 0;
for (let ty = 0; ty < BAKE.naipGrid; ty++) {
  for (let tx = 0; tx < BAKE.naipGrid; tx++) {
    const w = (BOX[2] - BOX[0]) / BAKE.naipGrid;
    const bbox = [
      r3(BOX[0] + tx * w), r3(BOX[1] + ty * w),
      r3(BOX[0] + (tx + 1) * w), r3(BOX[1] + (ty + 1) * w),
    ];
    const lon = lonOfMx((bbox[0] + bbox[2]) / 2);
    const lat = latOfMy((bbox[1] + bbox[3]) / 2);
    const { quad, coverage } = quadForBbox(ortho.quads, bbox, lon, lat);
    const url = exportUrl({ service: ortho.service, bbox, size: TILE_PX, objectId: quad.id, rendering: ortho.rendering });
    const rel = `naip/${quad.name}-lock${quad.id}-${TILE_PX}px-${sha256(Buffer.from(url)).slice(0, 12)}.png`;
    const buf = await guardedFetch(url, rel, { label: `NAIP ${tx},${ty}`, verify: verifyCoverage, retries: 8 });
    naipBytes += buf.length;
    naipInputs.push({ file: rel, bytes: buf.length, sha256: sha256(buf), quad: quad.name, objectId: quad.id, coverage, bbox });
    naipQuads.set(quad.id, quad);
    const img = decodePng(buf);
    if (img.width !== TILE_PX || img.height !== TILE_PX) {
      throw new Error(`NAIP tile ${tx},${ty} came back ${img.width}x${img.height}, expected ${TILE_PX}`);
    }
    /* Tile row 0 is the north edge of its own bbox, and atlas row 0 is the
     * north edge of the whole box, so a tile at grid row ty (counted north from
     * the south edge) lands at atlas rows from the top. */
    const atlasRow0 = (BAKE.naipGrid - 1 - ty) * TILE_PX;
    const atlasCol0 = tx * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      const src = y * TILE_PX * img.channels;
      const dst = ((atlasRow0 + y) * BAKE.atlasPx + atlasCol0) * 3;
      if (img.channels === 3) {
        img.data.copy(atlas, dst, src, src + TILE_PX * 3);
      } else {
        for (let x = 0; x < TILE_PX; x++) {
          atlas[dst + x * 3] = img.data[src + x * 4];
          atlas[dst + x * 3 + 1] = img.data[src + x * 4 + 1];
          atlas[dst + x * 3 + 2] = img.data[src + x * 4 + 2];
        }
      }
    }
  }
}
const texelSizeM = venue.coverage.sideM / BAKE.atlasPx;
out(
  `naip atlas ${BAKE.atlasPx}x${BAKE.atlasPx} from ${naipInputs.length} pinned crops, ` +
    `${naipBytes} B png, ${round(texelSizeM, 4)} m a texel (native ${ortho.groundSampleM} m)`,
);
out(
  `naip quads ${[...naipQuads.values()]
    .sort((a, b) => a.id - b.id)
    .map((q) => `${q.id}:${q.name}`)
    .join(" ")}`,
);
note(`[${since()}] naip atlas composited`);

/** Atlas pixel for a mercator point, or null outside. */
function atlasRgbAt(mx, my) {
  const u = (mx - BOX[0]) / (BOX[2] - BOX[0]);
  const v = 1 - (my - BOX[1]) / (BOX[3] - BOX[1]);
  const px = Math.round(u * BAKE.atlasPx - 0.5);
  const py = Math.round(v * BAKE.atlasPx - 0.5);
  if (px < 0 || py < 0 || px >= BAKE.atlasPx || py >= BAKE.atlasPx) return null;
  const at = (py * BAKE.atlasPx + px) * 3;
  return [atlas[at], atlas[at + 1], atlas[at + 2]];
}

/* ---------------------------------------------------------- ground mesh */

const MSTEP = Math.round(BAKE.meshCellM / BAKE.rasterCellM);
if (NX % MSTEP !== 0) throw new Error(`raster ${NX} is not divisible by mesh step ${MSTEP}`);
const GNX = NX / MSTEP + 1;
const GNY = NY / MSTEP + 1;

const groundMesh = (() => {
  const nodeX = new Float64Array(GNX);
  const nodeY = new Float64Array(GNY);
  for (let jx = 0; jx < GNX; jx++) {
    nodeX[jx] = (lonOfMx(BOX[0] + jx * MSTEP * DM) - venue.origin.lon) * frame.mPerLon;
  }
  for (let jy = 0; jy < GNY; jy++) {
    nodeY[jy] = (latOfMy(BOX[1] + jy * MSTEP * DM) - venue.origin.lat) * frame.mPerLat;
  }

  const nodeZ = new Float32Array(GNX * GNY);
  const nodeLand = new Uint8Array(GNX * GNY);
  const half = MSTEP >> 1;
  for (let jy = 0; jy < GNY; jy++) {
    for (let jx = 0; jx < GNX; jx++) {
      const cx = Math.min(NX - 1, jx * MSTEP);
      const cy = Math.min(NY - 1, jy * MSTEP);
      /* The node height is the mean of the known ground cells in the window it
       * represents, not the single cell under it: at a 4 m mesh a nearest-cell
       * sample throws away fifteen of every sixteen measurements and lets one
       * spurious return move a whole quad. */
      let sum = 0;
      let n = 0;
      for (let dy = -half; dy <= half; dy++) {
        const iy = cy + dy;
        if (iy < 0 || iy >= NY) continue;
        for (let dx = -half; dx <= half; dx++) {
          const ix = cx + dx;
          if (ix < 0 || ix >= NX) continue;
          const k = idx(ix, iy);
          if (!known[k]) continue;
          sum += filled[k];
          n++;
        }
      }
      const v = jy * GNX + jx;
      nodeZ[v] = n ? sum / n - SEA_Z : 0;
      nodeLand[v] = landMask[idx(cx, cy)] && n ? 1 : 0;
    }
  }

  /* Only quads with four land corners survive; the rest is the water cut, and
   * the scene's own water renders through it. */
  const used = new Int32Array(GNX * GNY).fill(-1);
  const tri = [];
  let quadsCut = 0;
  for (let jy = 0; jy < GNY - 1; jy++) {
    for (let jx = 0; jx < GNX - 1; jx++) {
      const a = jy * GNX + jx;
      const b = a + 1;
      const c = a + GNX;
      const d = c + 1;
      if (!(nodeLand[a] && nodeLand[b] && nodeLand[c] && nodeLand[d])) {
        quadsCut++;
        continue;
      }
      /* Wound so the geometric normal points up: glTF z is -courseY, which
       * flips the handedness of the raster's own row order. */
      tri.push(a, b, c, b, d, c);
    }
  }
  /* Compact: Draco encodes what it is given, and an isolated vertex is both
   * wasted bytes and a hazard for edgebreaker. */
  let vertCount = 0;
  for (const v of tri) if (used[v] < 0) used[v] = vertCount++;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  for (let v = 0; v < GNX * GNY; v++) {
    const o = used[v];
    if (o < 0) continue;
    const jx = v % GNX;
    const jy = (v / GNX) | 0;
    const e = nodeX[jx];
    const n = nodeY[jy];
    positions[o * 3] = e * cosB - n * sinB;
    positions[o * 3 + 1] = nodeZ[v];
    positions[o * 3 + 2] = -(e * sinB + n * cosB);
    uvs[o * 2] = (jx * MSTEP) / NX;
    uvs[o * 2 + 1] = 1 - (jy * MSTEP) / NY;
  }
  const indices = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i++) indices[i] = used[tri[i]];
  return { positions, uvs, indices, vertCount, quadsCut, quadsTotal: (GNX - 1) * (GNY - 1) };
})();
out(
  `ground mesh ${GNX}x${GNY} nodes @ ${BAKE.meshCellM} m: ${groundMesh.vertCount} vertices, ` +
    `${groundMesh.indices.length / 3} triangles, ${groundMesh.quadsCut} of ${groundMesh.quadsTotal} quads cut for water`,
);
note(`[${since()}] ground mesh done`);

/* ------------------------------------------------------------ buildings */

const ringArea = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return s / 2;
};
function pointInPoly(r, px, py) {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (
      r[i][1] > py !== r[j][1] > py &&
      px < ((r[j][0] - r[i][0]) * (py - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
    ) {
      hit = !hit;
    }
  }
  return hit;
}
/** Ear clipping for a simple CCW ring. Adequate: OSM building outlines are
 * simple, and a failed clip drops the roof cap rather than corrupting it. */
function earClip(ring) {
  const n = ring.length;
  if (n < 3) return [];
  const v = [...Array(n).keys()];
  if (ringArea(ring) < 0) v.reverse();
  const tris = [];
  let guard = 0;
  while (v.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < v.length; i++) {
      const a = ring[v[(i + v.length - 1) % v.length]];
      const b = ring[v[i]];
      const c = ring[v[(i + 1) % v.length]];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) continue;
      let ok = true;
      for (const j of v) {
        const p = ring[j];
        if (p === a || p === b || p === c) continue;
        const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        const d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
        const d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      tris.push([v[(i + v.length - 1) % v.length], v[i], v[(i + 1) % v.length]]);
      v.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (v.length === 3) tris.push([v[0], v[1], v[2]]);
  return tris;
}

/** Which palette a footprint gets, from its OSM tags and its measured height.
 * OSM is the source of semantics because this lidar collection carries no
 * building class at all: nothing about use can come out of the point cloud. */
function paletteFor(tags, heightM) {
  const b = (tags.building ?? "yes").toLowerCase();
  if (b === "parking" || b === "garage" || b === "garages" || tags.amenity === "parking") return "parking";
  if (["industrial", "warehouse", "manufacture", "hangar", "shed", "service"].includes(b)) return "industrial";
  if (["apartments", "residential", "house", "detached", "dormitory", "terrace", "condominium"].includes(b)) {
    return "residential";
  }
  return heightM >= 30 ? "glassTower" : "midriseCommercial";
}

const pct = (arr, q) => {
  if (!arr.length) return null;
  const a = Float64Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
};

const buildings = (() => {
  const list = [];
  const marginCells = 40 / CELL_GROUND_M;
  const ways = qBuildings.json.elements
    .filter((w) => w.type === "way" && w.tags?.building && Array.isArray(w.geometry))
    .sort((a, b) => a.id - b.id); // OSM id order, so the build never depends on response order
  for (const way of ways) {
    /* Two coordinate copies per ring: grid units index the rasters, course
     * metres measure the walls the facade UVs run along. */
    const gridRing = [];
    const courseRing = [];
    for (const g of way.geometry) {
      const [mx, my] = toMercator(g.lon, g.lat);
      gridRing.push([(mx - BOX[0]) / DM, (my - BOX[1]) / DM]);
      const p = frame.project(g.lat, g.lon);
      courseRing.push([p.x, p.y]);
    }
    if (gridRing.length > 2) {
      const a = gridRing[0];
      const b = gridRing[gridRing.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) {
        gridRing.pop();
        courseRing.pop();
      }
    }
    if (gridRing.length < 3) continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of gridRing) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    if (cx < -marginCells || cx > NX + marginCells || cy < -marginCells || cy > NY + marginCells) continue;

    /* Roof z is the 90th percentile of the surface raster inside the ring and
     * base z the 20th percentile of the filled ground in a collar outside it,
     * so a parapet does not become the roof and a kerb does not become the
     * base. */
    const collar = BAKE.buildingCollarM / CELL_GROUND_M;
    const ia0 = Math.max(0, Math.floor(minX - collar));
    const ia1 = Math.min(NX - 1, Math.ceil(maxX + collar));
    const ib0 = Math.max(0, Math.floor(minY - collar));
    const ib1 = Math.min(NY - 1, Math.ceil(maxY + collar));
    const roofSamples = [];
    const groundSamples = [];
    for (let iy = ib0; iy <= ib1; iy++) {
      for (let ix = ia0; ix <= ia1; ix++) {
        const k = idx(ix, iy);
        const inside = pointInPoly(gridRing, ix + 0.5, iy + 0.5);
        if (inside && surface[k] !== NODATA) roofSamples.push(surface[k]);
        if (!inside && known[k]) groundSamples.push(filled[k]);
      }
    }
    const tagH = way.tags.height ? Number.parseFloat(way.tags.height) : null;
    let base = pct(groundSamples, 0.2);
    let roof = pct(roofSamples, 0.9);
    let source = "lidar";
    if (base === null || roof === null || roof - base < 2) {
      if (tagH !== null && Number.isFinite(tagH)) {
        base = base ?? SEA_Z;
        roof = base + tagH;
        source = "osm-height-tag";
      } else {
        continue; // no evidence for a height at all: leave it out rather than guess
      }
    }
    const heightM = roof - base;
    if (heightM < BAKE.buildingMinHeightM || heightM > BAKE.buildingMaxHeightM) continue;
    list.push({
      id: way.id,
      tags: way.tags,
      gridRing,
      courseRing,
      baseZ: base,
      roofZ: roof,
      heightM,
      source,
      tagHeightM: tagH !== null && Number.isFinite(tagH) ? tagH : null,
      areaM2: Math.abs(ringArea(courseRing)),
      palette: paletteFor(way.tags, heightM),
      bbox: [minX, minY, maxX, maxY],
    });
  }
  return list;
})();
const bySource = {};
const byPalette = {};
for (const b of buildings) {
  bySource[b.source] = (bySource[b.source] ?? 0) + 1;
  byPalette[b.palette] = (byPalette[b.palette] ?? 0) + 1;
}
{
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of buildings) {
    if (b.heightM > hi) hi = b.heightM;
    if (b.heightM < lo) lo = b.heightM;
  }
  out(
    `buildings ${buildings.length} kept of ${qBuildings.json.elements.filter((e) => e.type === "way" && e.tags?.building).length} footprints, ` +
      `heights ${round(lo, 1)}..${round(hi, 1)} m`,
  );
}
out(
  `buildings by height source ${Object.keys(bySource).sort().map((k) => `${k}:${bySource[k]}`).join(" ")}`,
);
out(
  `buildings by palette ${PALETTE_ORDER.filter((p) => byPalette[p]).map((p) => `${p}:${byPalette[p]}`).join(" ")}`,
);

/* Height validation against the OSM tag, on the buildings that carry one. The
 * tag is not truth (it often includes a spire, or is the architect's number),
 * so this is an agreement measure, not an error measure. */
const heightCheck = (() => {
  const pairs = buildings.filter((b) => b.source === "lidar" && b.tagHeightM !== null);
  if (!pairs.length) return null;
  const errs = pairs.map((b) => b.heightM - b.tagHeightM);
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  return {
    n: pairs.length,
    meanErrorM: round(errs.reduce((a, b) => a + b, 0) / errs.length, 2),
    meanAbsErrorM: round(abs.reduce((a, b) => a + b, 0) / abs.length, 2),
    medianAbsErrorM: round(abs[abs.length >> 1], 2),
    p90AbsErrorM: round(abs[Math.floor(abs.length * 0.9)], 2),
    maxAbsErrorM: round(abs[abs.length - 1], 2),
  };
})();
if (heightCheck) {
  out(
    `building height vs osm tag: n=${heightCheck.n} mean ${heightCheck.meanErrorM} m, ` +
      `mean abs ${heightCheck.meanAbsErrorM} m, median abs ${heightCheck.medianAbsErrorM} m, ` +
      `p90 ${heightCheck.p90AbsErrorM} m, max ${heightCheck.maxAbsErrorM} m`,
  );
}

/* The one thing nadir imagery does say about a wall: the colour of the building
 * it belongs to. A synthetic facade with no link to the photograph reads as one
 * stamped material, so every wall is tinted by the median NAIP colour over its
 * own roof, hue at 55 % strength and brightness tracked. Roof colour is a proxy
 * for wall colour, not a measurement of it. */
let tinted = 0;
for (const b of buildings) {
  const rs = [];
  const gs = [];
  const bs = [];
  const [minX, minY, maxX, maxY] = b.bbox;
  const stepCells = Math.max(1, Math.round(Math.max(maxX - minX, maxY - minY) / 24));
  for (let py = minY; py <= maxY; py += stepCells) {
    for (let px = minX; px <= maxX; px += stepCells) {
      if (!pointInPoly(b.gridRing, px, py)) continue;
      const rgb = atlasRgbAt(BOX[0] + px * DM, BOX[1] + py * DM);
      if (!rgb) continue;
      rs.push(rgb[0]);
      gs.push(rgb[1]);
      bs.push(rgb[2]);
    }
  }
  if (rs.length < 4) {
    b.tint = [1, 1, 1];
    b.roofRgb = null;
    continue;
  }
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const rgb = [med(rs), med(gs), med(bs)];
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3 || 1;
  const bright = Math.max(0.55, Math.min(1.45, 0.5 + (mean / 255) * 1.05));
  b.roofRgb = rgb;
  b.tint = rgb.map((c) => Math.max(0.35, Math.min(1.8, (1 + (c / mean - 1) * 0.55) * bright)));
  tinted++;
}
out(`building wall tints from roof naip ${tinted} of ${buildings.length}`);

/* -------------------------------------------------- building geometry */

const roofPos = [];
const roofUv = [];
const roofIdx = [];
/** Walls grouped per palette and per band, so each group is one repeating
 * material and one draw call. Fixed key order, built from PALETTE_ORDER. */
const wallKeys = [];
for (const p of PALETTE_ORDER) for (const kind of ["base", "upper"]) wallKeys.push(`${p}:${kind}`);
const wallGroups = new Map(wallKeys.map((k) => [k, { pos: [], uv: [], col: [], idx: [] }]));
let facadeAreaM2 = 0;

for (const b of buildings) {
  const yTop = b.roofZ - SEA_Z;
  const yBase = b.baseZ - SEA_Z;

  const base = roofPos.length / 3;
  for (let i = 0; i < b.courseRing.length; i++) {
    const c = b.courseRing[i];
    const g = b.gridRing[i];
    roofPos.push(c[0], yTop, -c[1]);
    roofUv.push(g[0] / NX, 1 - g[1] / NY);
  }
  for (const t of earClip(b.courseRing)) roofIdx.push(base + t[0], base + t[1], base + t[2]);

  const ring = b.courseRing;
  const ccw = ringArea(ring) > 0;
  let along = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % ring.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 0.05) continue;
    facadeAreaM2 += len * b.heightM;

    /* Each wall splits at 4 m into a ground band (storefront, plinth, soffit)
     * and a repeating 16 m tile, so the ground floor does not repeat up the
     * building the way a single tiled texture would put shopfronts on floor
     * twelve. */
    const bandTop = Math.min(yTop, yBase + BASE_H_M);
    const spans = [];
    if (bandTop > yBase + 0.05) spans.push({ y0: yBase, y1: bandTop, kind: "base" });
    if (yTop > bandTop + 0.05) spans.push({ y0: bandTop, y1: yTop, kind: "upper" });
    for (const s of spans) {
      const g = wallGroups.get(`${b.palette}:${s.kind}`);
      const v = g.pos.length / 3;
      const u0 = along / TILE_W_M;
      const u1 = (along + len) / TILE_W_M;
      const vv = (y) => (s.kind === "base" ? 1 - (y - yBase) / BASE_H_M : -(y - bandTop) / TILE_H_M);
      g.pos.push(a[0], s.y0, -a[1], c[0], s.y0, -c[1], c[0], s.y1, -c[1], a[0], s.y1, -a[1]);
      g.uv.push(u0, vv(s.y0), u1, vv(s.y0), u1, vv(s.y1), u0, vv(s.y1));
      for (let n = 0; n < 4; n++) g.col.push(b.tint[0], b.tint[1], b.tint[2]);
      if (ccw) g.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      else g.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    }
    along += len;
  }
}
let wallTris = 0;
for (const g of wallGroups.values()) wallTris += g.idx.length / 3;
out(
  `building geometry roofs ${roofIdx.length / 3} tris, walls ${wallTris} tris in ` +
    `${[...wallGroups.values()].filter((g) => g.idx.length).length} groups, facade area ${Math.round(facadeAreaM2)} m2`,
);
note(`[${since()}] building geometry done`);

/* ----------------------------------------------------------------- trees */

const trees = (() => {
  const inBuilding = new Uint8Array(NX * NY);
  const pad = 3 / CELL_GROUND_M;
  for (const b of buildings) {
    const ia0 = Math.max(0, Math.floor(b.bbox[0] - pad));
    const ia1 = Math.min(NX - 1, Math.ceil(b.bbox[2] + pad));
    const ib0 = Math.max(0, Math.floor(b.bbox[1] - pad));
    const ib1 = Math.min(NY - 1, Math.ceil(b.bbox[3] + pad));
    for (let iy = ib0; iy <= ib1; iy++) for (let ix = ia0; ix <= ia1; ix++) inBuilding[idx(ix, iy)] = 1;
  }
  const chm = new Float32Array(NX * NY);
  for (let k = 0; k < NX * NY; k++) {
    if (!landMask[k] || inBuilding[k] || surface[k] === NODATA || !known[k]) continue;
    chm[k] = surface[k] - filled[k];
  }
  /* One 3x3 smoothing pass: raw 1 m maxima fire several times per crown. */
  const sm = new Float32Array(NX * NY);
  for (let iy = 1; iy < NY - 1; iy++) {
    for (let ix = 1; ix < NX - 1; ix++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += chm[idx(ix + dx, iy + dy)];
      sm[idx(ix, iy)] = s / 9;
    }
  }
  const R = BAKE.crownWindowCells;
  const maxR = Math.round(BAKE.crownMaxRadiusM / CELL_GROUND_M);
  const found = [];
  for (let iy = R; iy < NY - R; iy++) {
    for (let ix = R; ix < NX - R; ix++) {
      const k = idx(ix, iy);
      const h = sm[k];
      if (h < BAKE.crownMinHeightM || h > BAKE.crownMaxHeightM) continue;
      let isMax = true;
      for (let dy = -R; dy <= R && isMax; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (!dx && !dy) continue;
          if (sm[idx(ix + dx, iy + dy)] > h) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;
      /* Crown radius grown to the 40 %-of-peak contour and capped. */
      let r = 1;
      for (; r < maxR; r++) {
        let below = 0;
        for (let a = 0; a < 8; a++) {
          const dx = Math.round(r * Math.cos((a * Math.PI) / 4));
          const dy = Math.round(r * Math.sin((a * Math.PI) / 4));
          const kk = idx(Math.min(NX - 1, Math.max(0, ix + dx)), Math.min(NY - 1, Math.max(0, iy + dy)));
          if (sm[kk] < h * 0.4) below++;
        }
        if (below > 4) break;
      }
      const c = courseOf(BOX[0] + (ix + 0.5) * DM, BOX[1] + (iy + 0.5) * DM);
      found.push({
        x: c.x,
        y: c.y,
        z: filled[k] - SEA_Z,
        h,
        r: Math.max(1.2, r * 0.85 * CELL_GROUND_M),
        key: k,
      });
    }
  }
  /* Thin so no two crowns sit closer than half the sum of their radii. Ties on
   * height break on the raster index, so the survivor set never depends on
   * the sort's stability. */
  found.sort((a, b) => b.h - a.h || a.key - b.key);
  const kept = [];
  for (const t of found) {
    let ok = true;
    for (const u of kept) {
      if (Math.hypot(t.x - u.x, t.y - u.y) < (t.r + u.r) * 0.5) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(t);
  }
  return kept;
})();
{
  const hs = trees.map((t) => t.h).sort((a, b) => a - b);
  out(
    `trees ${trees.length} crowns, height p10/median/p90 ` +
      `${hs.length ? `${round(hs[Math.floor(hs.length * 0.1)], 1)}/${round(hs[hs.length >> 1], 1)}/${round(hs[Math.floor(hs.length * 0.9)], 1)}` : "-"} m`,
  );
}
note(`[${since()}] trees done`);

/* ------------------------------------------------------------- textures */

/** mulberry32: 32-bit, seedable, no state outside the closure, no clock. */
function rng(seed) {
  let a = (seed ^ BAKE.seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  constructor(w, h, channels = 3) {
    this.w = w;
    this.h = h;
    this.c = channels;
    this.data = Buffer.alloc(w * h * channels);
  }
  fill(r, g, b) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.data[i * this.c] = r;
      this.data[i * this.c + 1] = g;
      this.data[i * this.c + 2] = b;
      if (this.c === 4) this.data[i * this.c + 3] = 255;
    }
  }
  rect(x0, y0, x1, y1, r, g, b) {
    const xa = Math.max(0, Math.round(x0));
    const xb = Math.min(this.w, Math.round(x1));
    const ya = Math.max(0, Math.round(y0));
    const yb = Math.min(this.h, Math.round(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const at = (y * this.w + x) * this.c;
        this.data[at] = r;
        this.data[at + 1] = g;
        this.data[at + 2] = b;
        if (this.c === 4) this.data[at + 3] = 255;
      }
    }
  }
  /** Per-pixel multiplicative noise: the grain that stops flat panels reading
   * as untextured plastic at 200 m. */
  grain(rand, amount) {
    for (let i = 0; i < this.w * this.h; i++) {
      const k = 1 + (rand() - 0.5) * amount;
      for (let c = 0; c < 3; c++) {
        const at = i * this.c + c;
        this.data[at] = Math.max(0, Math.min(255, Math.round(this.data[at] * k)));
      }
    }
  }
}

const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const FACADE_TILE_PX = TILE_W_M * FACADE_PX_PER_M;
const FACADE_BASE_PX = BASE_H_M * FACADE_PX_PER_M;

function upperTile(p) {
  const rand = rng(p.seed);
  const c = new Canvas(FACADE_TILE_PX, FACADE_TILE_PX);
  c.fill(...p.wall);
  const floorPx = FACADE_TILE_PX / p.floors;
  if (p.ribbed) {
    for (let x = 0; x < FACADE_TILE_PX; x += 8) {
      c.rect(x, 0, x + 3, FACADE_TILE_PX, ...shade(p.wall, 0.92));
      c.rect(x + 3, 0, x + 5, FACADE_TILE_PX, ...shade(p.wall, 1.06));
    }
  }
  for (let f = 0; f < p.floors; f++) {
    const y0 = f * floorPx;
    // Spandrel: the opaque band between one storey's glass and the next.
    c.rect(0, y0, FACADE_TILE_PX, y0 + floorPx * 0.34, ...p.spandrel);
    const winTop = y0 + floorPx * 0.42;
    const winBot = y0 + floorPx * 0.86;
    if (p.ribbon) {
      c.rect(0, winTop, FACADE_TILE_PX, winBot, ...p.glass);
      const bays = 8;
      for (let b = 0; b <= bays; b++) {
        const x = (b * FACADE_TILE_PX) / bays;
        c.rect(x - 1.5, winTop, x + 1.5, winBot, ...p.mullion);
      }
      for (let b = 0; b < bays; b++) {
        const x0 = (b * FACADE_TILE_PX) / bays + 2;
        const x1 = ((b + 1) * FACADE_TILE_PX) / bays - 2;
        c.rect(x0, winTop, x1, winBot, ...shade(p.glass, 0.78 + rand() * 0.5));
        if (rand() < 0.28) {
          c.rect(x0, winTop, x1, winTop + (winBot - winTop) * 0.34, ...shade(p.glassHot, 0.9 + rand() * 0.3));
        }
      }
    } else if (p.openDeck) {
      c.rect(0, winTop, FACADE_TILE_PX, winBot, ...p.glass);
      for (let b = 0; b <= 4; b++) {
        const x = (b * FACADE_TILE_PX) / 4;
        c.rect(x - 8, winTop, x + 8, winBot, ...p.wall);
      }
      c.rect(0, winBot - 6, FACADE_TILE_PX, winBot, ...shade(p.wall, 0.9));
    } else {
      const bays = 4;
      for (let b = 0; b < bays; b++) {
        const cx = ((b + 0.5) * FACADE_TILE_PX) / bays;
        const halfW = (FACADE_TILE_PX / bays) * (p.balcony ? 0.32 : 0.28);
        c.rect(cx - halfW - 2, winTop - 2, cx + halfW + 2, winBot + 2, ...p.mullion);
        c.rect(cx - halfW, winTop, cx + halfW, winBot, ...shade(p.glass, 0.8 + rand() * 0.45));
        if (rand() < 0.22) {
          c.rect(cx - halfW, winTop, cx + halfW, winTop + (winBot - winTop) * 0.4, ...shade(p.glassHot, 0.85 + rand() * 0.35));
        }
        if (p.balcony && b % 2 === 1) {
          c.rect(cx - halfW - 6, winBot + 1, cx + halfW + 6, winBot + 5, ...shade(p.wall, 0.72));
        }
      }
    }
    c.rect(0, y0, FACADE_TILE_PX, y0 + 3, ...shade(p.wall, 0.82));
  }
  c.grain(rand, 0.09);
  return c;
}

function baseBand(p) {
  const rand = rng(p.seed ^ 0x5bf03);
  const c = new Canvas(FACADE_TILE_PX, FACADE_BASE_PX);
  c.fill(...p.baseWall);
  c.rect(0, FACADE_BASE_PX - 10, FACADE_TILE_PX, FACADE_BASE_PX, ...shade(p.baseWall, 0.7));
  c.rect(0, 0, FACADE_TILE_PX, 14, ...shade(p.baseWall, 0.78));
  const bays = p.openDeck ? 4 : 6;
  for (let b = 0; b < bays; b++) {
    const x0 = (b * FACADE_TILE_PX) / bays + 6;
    const x1 = ((b + 1) * FACADE_TILE_PX) / bays - 6;
    const k = 0.8 + rand() * 0.5;
    c.rect(x0, 20, x1, FACADE_BASE_PX - 14, ...shade(p.baseGlass, k));
    c.rect(x0, FACADE_BASE_PX - 44, x1, FACADE_BASE_PX - 14, ...shade(p.baseGlass, k * 1.35));
  }
  c.grain(rand, 0.08);
  return c;
}

/** A crossed-billboard canopy: seeded blob foliage with an alpha cut. */
function canopyCanvas(size = 256) {
  const rand = rng(0x0f1e2d);
  const c = new Canvas(size, size, 4);
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    blobs.push({
      x: 0.5 + (rand() - 0.5) * 0.66,
      y: 0.42 + (rand() - 0.5) * 0.62,
      r: 0.09 + rand() * 0.13,
      k: 0.7 + rand() * 0.6,
    });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let cover = 0;
      let lit = 0;
      for (const b of blobs) {
        const d = Math.hypot(u - b.x, (v - b.y) * 1.15) / b.r;
        if (d < 1) {
          const w = 1 - d * d;
          cover += w;
          lit += w * b.k;
        }
      }
      const at = (y * size + x) * 4;
      const trunk = Math.abs(u - 0.5) < 0.022 && v > 0.55 && v < 0.99;
      if (cover > 0.22 || trunk) {
        const k = trunk && cover <= 0.22 ? 0.55 : Math.min(1.35, lit / Math.max(cover, 0.001));
        const rgb = trunk && cover <= 0.22 ? [96, 78, 60] : [74, 96, 56];
        const n = 0.88 + rand() * 0.24;
        c.data[at] = Math.min(255, Math.round(rgb[0] * k * n));
        c.data[at + 1] = Math.min(255, Math.round(rgb[1] * k * n));
        c.data[at + 2] = Math.min(255, Math.round(rgb[2] * k * n));
        c.data[at + 3] = 255;
      } else {
        c.data[at + 3] = 0;
      }
    }
  }
  return c;
}

const sharp = require("sharp");
sharp.cache(false);
sharp.concurrency(1); // one worker, so the encoder cannot interleave differently between runs

/** Deterministic JPEG. mozjpeg with fixed options over fixed pixels is a pure
 * function; `chromaSubsampling` and `trellisQuantisation` are pinned rather
 * than left to the library's defaults so a sharp upgrade shows up as a hash
 * change instead of a silent quality change. */
async function toJpeg(canvas, quality) {
  return sharp(canvas.data, { raw: { width: canvas.w, height: canvas.h, channels: 3 } })
    .jpeg({ quality, chromaSubsampling: "4:4:4", trellisQuantisation: false, optimiseScans: false, mozjpeg: true })
    .toBuffer();
}

/** PNG for anything carrying alpha; JPEG has none and the canopy is a cutout. */
async function toPng(canvas) {
  return sharp(canvas.data, { raw: { width: canvas.w, height: canvas.h, channels: canvas.c } })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toBuffer();
}

const atlasJpeg = await sharp(atlas, { raw: { width: BAKE.atlasPx, height: BAKE.atlasPx, channels: 3 } })
  .jpeg({ quality: BAKE.jpegQuality, chromaSubsampling: "4:2:0", trellisQuantisation: false, optimiseScans: false, mozjpeg: true })
  .toBuffer();
out(`texture ground atlas ${BAKE.atlasPx}x${BAKE.atlasPx} jpeg q${BAKE.jpegQuality} ${atlasJpeg.length} B`);

const facadeTextures = [];
for (const name of PALETTE_ORDER) {
  const p = PALETTES[name];
  const upper = await toJpeg(upperTile(p), 90);
  const bandBuf = await toJpeg(baseBand(p), 90);
  facadeTextures.push({ name, kind: "upper", buf: upper, w: FACADE_TILE_PX, h: FACADE_TILE_PX });
  facadeTextures.push({ name, kind: "base", buf: bandBuf, w: FACADE_TILE_PX, h: FACADE_BASE_PX });
}
const canopyPng = await toPng(canopyCanvas());
out(
  `texture facades ${facadeTextures.map((t) => `${t.name}:${t.kind}=${t.buf.length}`).join(" ")}`,
);
out(`texture canopy 256x256 png ${canopyPng.length} B`);
note(`[${since()}] textures encoded`);

/* ------------------------------------------------------------ glb writer */

const dracoModule = await require("draco3d").createEncoderModule({});

/**
 * Draco-encode one indexed triangle mesh. Attributes are added in a fixed order
 * so their unique ids are stable across bakes, and the encoded point and face
 * counts are read back rather than assumed: quantization deduplicates vertices,
 * so the glTF accessor counts have to come from the encoder, not from the input
 * arrays. Getting that wrong produces a file that loads and renders wrong.
 */
function dracoEncode({ positions, normals, uvs, colors, indices }) {
  const m = dracoModule;
  const builder = new m.MeshBuilder();
  const mesh = new m.Mesh();
  builder.AddFacesToMesh(mesh, indices.length / 3, indices);
  const numPoints = positions.length / 3;
  const attributes = {};
  attributes.POSITION = builder.AddFloatAttributeToMesh(mesh, m.POSITION, numPoints, 3, positions);
  if (normals) attributes.NORMAL = builder.AddFloatAttributeToMesh(mesh, m.NORMAL, numPoints, 3, normals);
  if (uvs) attributes.TEXCOORD_0 = builder.AddFloatAttributeToMesh(mesh, m.TEX_COORD, numPoints, 2, uvs);
  if (colors) attributes.COLOR_0 = builder.AddFloatAttributeToMesh(mesh, m.COLOR, numPoints, 3, colors);

  const encoder = new m.Encoder();
  encoder.SetSpeedOptions(0, 0); // slowest, smallest
  encoder.SetAttributeQuantization(m.POSITION, BAKE.dracoPositionBits);
  encoder.SetAttributeQuantization(m.NORMAL, BAKE.dracoNormalBits);
  encoder.SetAttributeQuantization(m.TEX_COORD, BAKE.dracoUvBits);
  encoder.SetAttributeQuantization(m.COLOR, BAKE.dracoColorBits);
  /* Edgebreaker is smaller but wants a manifold; the wall and billboard groups
   * are quad soups with no shared edges, so a fallback is a real path rather
   * than defensive noise. Which method ran is logged, because it moves bytes. */
  encoder.SetEncodingMethod(m.MESH_EDGEBREAKER_ENCODING);
  encoder.SetTrackEncodedProperties(true);
  let method = "edgebreaker";
  let buffer = new m.DracoInt8Array();
  let length = encoder.EncodeMeshToDracoBuffer(mesh, buffer);
  if (length <= 0) {
    m.destroy(buffer);
    encoder.SetEncodingMethod(m.MESH_SEQUENTIAL_ENCODING);
    method = "sequential";
    buffer = new m.DracoInt8Array();
    length = encoder.EncodeMeshToDracoBuffer(mesh, buffer);
  }
  if (length <= 0) throw new Error("draco encode failed under both encoding methods");
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) bytes[i] = buffer.GetValue(i);
  const encodedPoints = encoder.GetNumberOfEncodedPoints();
  const encodedFaces = encoder.GetNumberOfEncodedFaces();
  m.destroy(buffer);
  m.destroy(encoder);
  m.destroy(mesh);
  m.destroy(builder);
  return { bytes, attributes, encodedPoints, encodedFaces, method };
}

/** Flat-shaded normals for an indexed triangle soup. */
function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      normals[o] += nx;
      normals[o + 1] += ny;
      normals[o + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  return normals;
}

class Glb {
  constructor() {
    this.bin = [];
    this.binLength = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.images = [];
    /* Two samplers only. Facades repeat by construction (a 90 m wall tiles the
     * 16 m pattern 5.6 times); the atlas and the canopy are addressed once and
     * must clamp, or a UV rounding at the border wraps a roof to the far edge
     * of the photograph. */
    this.samplers = [
      { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
      { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 },
    ];
    this.textures = [];
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.textureBytes = 0;
    this.geometryBytes = 0;
  }
  pushView(buf) {
    const pad = (4 - (this.binLength % 4)) % 4;
    if (pad) {
      this.bin.push(Buffer.alloc(pad));
      this.binLength += pad;
    }
    this.bufferViews.push({ buffer: 0, byteOffset: this.binLength, byteLength: buf.length });
    this.bin.push(buf);
    this.binLength += buf.length;
    return this.bufferViews.length - 1;
  }
  addTexture(buf, mimeType, name, sampler) {
    this.textureBytes += buf.length;
    this.images.push({ bufferView: this.pushView(buf), mimeType, name });
    this.textures.push({ sampler, source: this.images.length - 1 });
    return this.textures.length - 1;
  }
  addMaterial(material) {
    this.materials.push(material);
    return this.materials.length - 1;
  }
  /** An accessor with no bufferView: the data lives in the Draco stream, and
   * the glTF spec allows the fallback view to be omitted when the primitive
   * carries KHR_draco_mesh_compression. */
  addDracoAccessor({ componentType, count, type, min, max }) {
    const a = { componentType, count, type };
    if (min) a.min = min;
    if (max) a.max = max;
    this.accessors.push(a);
    return this.accessors.length - 1;
  }
  addDracoPrimitive({ positions, normals, uvs, colors, indices, material }) {
    const enc = dracoEncode({ positions, normals, uvs, colors, indices });
    this.geometryBytes += enc.bytes.length;
    const view = this.pushView(enc.bytes);
    const count = enc.encodedPoints;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = positions[i + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const attributes = {
      POSITION: this.addDracoAccessor({ componentType: 5126, count, type: "VEC3", min, max }),
    };
    if (normals) attributes.NORMAL = this.addDracoAccessor({ componentType: 5126, count, type: "VEC3" });
    if (uvs) attributes.TEXCOORD_0 = this.addDracoAccessor({ componentType: 5126, count, type: "VEC2" });
    if (colors) attributes.COLOR_0 = this.addDracoAccessor({ componentType: 5126, count, type: "VEC3" });
    const indicesAccessor = this.addDracoAccessor({
      componentType: 5125,
      count: enc.encodedFaces * 3,
      type: "SCALAR",
    });
    return {
      primitive: {
        attributes,
        indices: indicesAccessor,
        material,
        extensions: {
          KHR_draco_mesh_compression: { bufferView: view, attributes: enc.attributes },
        },
      },
      triangles: enc.encodedFaces,
      vertices: enc.encodedPoints,
      dracoBytes: enc.bytes.length,
      dracoMethod: enc.method,
    };
  }
  addMesh(name, primitives) {
    this.meshes.push({ name, primitives });
    this.nodes.push({ mesh: this.meshes.length - 1, name });
  }
  build() {
    const json = {
      asset: { version: "2.0", generator: `layline-bake-autogen ${VENUE_ID}` },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
      scene: 0,
      scenes: [{ nodes: this.nodes.map((_, i) => i) }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      textures: this.textures,
      images: this.images,
      samplers: this.samplers,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: this.binLength }],
    };
    const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
    const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
    const binBuf = Buffer.concat(this.bin);
    const binChunk = Buffer.concat([binBuf, Buffer.alloc((4 - (binBuf.length % 4)) % 4)]);
    const header = Buffer.alloc(12);
    header.write("glTF", 0, "ascii");
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
    const jsonHead = Buffer.alloc(8);
    jsonHead.writeUInt32LE(jsonChunk.length, 0);
    jsonHead.write("JSON", 4, "ascii");
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(binChunk.length, 0);
    binHead.write("BIN\0", 4, "ascii");
    return Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]);
  }
}

const glb = new Glb();
const atlasTex = glb.addTexture(atlasJpeg, "image/jpeg", "naip-atlas", 1);
const groundMat = glb.addMaterial({
  name: "ground-naip",
  pbrMetallicRoughness: { baseColorTexture: { index: atlasTex, texCoord: 0 }, metallicFactor: 0, roughnessFactor: 1 },
  doubleSided: false,
});
const roofMat = glb.addMaterial({
  name: "roof-naip",
  pbrMetallicRoughness: { baseColorTexture: { index: atlasTex, texCoord: 0 }, metallicFactor: 0, roughnessFactor: 1 },
  doubleSided: false,
});

const nodeReport = [];

{
  const normals = computeNormals(groundMesh.positions, groundMesh.indices);
  const p = glb.addDracoPrimitive({
    positions: groundMesh.positions,
    normals,
    uvs: groundMesh.uvs,
    indices: groundMesh.indices,
    material: groundMat,
  });
  glb.addMesh("ground", [p.primitive]);
  nodeReport.push({
    name: "ground",
    role: "hole-filled lidar ground with the OSM water cut, NAIP drape",
    primitives: 1,
    triangles: p.triangles,
    vertices: p.vertices,
    materials: ["ground-naip"],
    dracoBytes: p.dracoBytes,
    dracoMethod: p.dracoMethod,
  });
}

if (roofIdx.length) {
  const positions = Float32Array.from(roofPos);
  const indices = Uint32Array.from(roofIdx);
  const p = glb.addDracoPrimitive({
    positions,
    normals: computeNormals(positions, indices),
    uvs: Float32Array.from(roofUv),
    indices,
    material: roofMat,
  });
  glb.addMesh("roofs", [p.primitive]);
  nodeReport.push({
    name: "roofs",
    role: "flat caps at the 90th-percentile lidar surface height, NAIP drape",
    primitives: 1,
    triangles: p.triangles,
    vertices: p.vertices,
    materials: ["roof-naip"],
    dracoBytes: p.dracoBytes,
    dracoMethod: p.dracoMethod,
  });
}

{
  const prims = [];
  const mats = [];
  const methods = new Set();
  let tris = 0;
  let verts = 0;
  let dracoBytes = 0;
  for (const tex of facadeTextures) {
    const key = `${tex.name}:${tex.kind}`;
    const g = wallGroups.get(key);
    if (!g.idx.length) continue;
    const texture = glb.addTexture(tex.buf, "image/jpeg", `facade-${tex.name}-${tex.kind}`, 0);
    const name = `wall-${tex.name}-${tex.kind}`;
    const material = glb.addMaterial({
      name,
      pbrMetallicRoughness: { baseColorTexture: { index: texture, texCoord: 0 }, metallicFactor: 0, roughnessFactor: 0.85 },
      doubleSided: false,
    });
    const positions = Float32Array.from(g.pos);
    const indices = Uint32Array.from(g.idx);
    const p = glb.addDracoPrimitive({
      positions,
      normals: computeNormals(positions, indices),
      uvs: Float32Array.from(g.uv),
      colors: Float32Array.from(g.col),
      indices,
      material,
    });
    prims.push(p.primitive);
    mats.push(name);
    methods.add(p.dracoMethod);
    tris += p.triangles;
    verts += p.vertices;
    dracoBytes += p.dracoBytes;
  }
  if (prims.length) {
    glb.addMesh("walls", prims);
    nodeReport.push({
      name: "walls",
      role: "procedural facades, one primitive per palette and band, COLOR_0 tinted from each building's roof NAIP median",
      primitives: prims.length,
      triangles: tris,
      vertices: verts,
      materials: mats,
      dracoBytes,
      dracoMethod: [...methods].sort().join("+"),
    });
  }
}

if (trees.length) {
  const canopyTex = glb.addTexture(canopyPng, "image/png", "canopy", 1);
  const material = glb.addMaterial({
    name: "canopy",
    pbrMetallicRoughness: { baseColorTexture: { index: canopyTex, texCoord: 0 }, metallicFactor: 0, roughnessFactor: 1 },
    alphaMode: "MASK",
    alphaCutoff: 0.5,
    doubleSided: true,
  });
  const pos = [];
  const uv = [];
  const ind = [];
  for (const t of trees) {
    const w = Math.max(2, t.r * 2);
    for (const [dx, dz] of [
      [w / 2, 0],
      [0, w / 2],
    ]) {
      const v = pos.length / 3;
      pos.push(
        t.x - dx, t.z, -(t.y - dz),
        t.x + dx, t.z, -(t.y + dz),
        t.x + dx, t.z + t.h, -(t.y + dz),
        t.x - dx, t.z + t.h, -(t.y - dz),
      );
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      ind.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  }
  const positions = Float32Array.from(pos);
  const indices = Uint32Array.from(ind);
  const p = glb.addDracoPrimitive({
    positions,
    normals: computeNormals(positions, indices),
    uvs: Float32Array.from(uv),
    indices,
    material,
  });
  glb.addMesh("trees", [p.primitive]);
  nodeReport.push({
    name: "trees",
    role: "crossed alpha-masked billboards at lidar-derived crown positions and heights",
    primitives: 1,
    triangles: p.triangles,
    vertices: p.vertices,
    materials: ["canopy"],
    dracoBytes: p.dracoBytes,
    dracoMethod: p.dracoMethod,
  });
}

const glbBuf = glb.build();
const glbPath = join(OUT_DIR, `${VENUE_ID}-autogen.glb`);
writeFileSync(glbPath, glbBuf);
const glbSha = sha256(glbBuf);
const glbGzip = gzipSync(glbBuf, { level: 9 }).length;

let totalTris = 0;
let drawCalls = 0;
for (const n of nodeReport) {
  totalTris += n.triangles;
  drawCalls += n.primitives;
}
for (const n of nodeReport) {
  out(`node ${n.name} prims ${n.primitives} tris ${n.triangles} verts ${n.vertices} draco ${n.dracoBytes} B ${n.dracoMethod}`);
}
out(`glb ${glbBuf.length} B raw, ${glbGzip} B gzip -9`);
out(`glb geometry ${glb.geometryBytes} B, textures ${glb.textureBytes} B, json+overhead ${glbBuf.length - glb.geometryBytes - glb.textureBytes} B`);
out(`glb sha256 ${glbSha}`);
note(`[${since()}] glb written`);

/* ------------------------------------------------------------- manifest */

const manifestPath = join(OUT_DIR, `${VENUE_ID}-autogen.json`);
const bytesOf = (rows) => rows.reduce((a, r) => a + r.bytes, 0);

const manifest = {
  id: `${VENUE_ID}-autogen`,
  /* The anchor and the axis convention, resolved rather than described.
   *
   * `yDatum` is 0 and that is not a placeholder. The runtime reader
   * (`venue-autogen-config.ts`) defines it as an offset it APPLIES, lifting the
   * asset by `-yDatum`, so it is the residual a bake still owes, not the datum
   * the bake used. This bake already subtracts the venue's NAVD88 sea datum
   * from every vertex, so the vertices are course-frame and the residual is
   * zero. The datum actually subtracted is `seaDatumNavd88M` below; writing it
   * here instead would sink the whole asset by that many metres. */
  origin: {
    lat: venue.origin.lat,
    lon: venue.origin.lon,
    yDatum: 0,
  },
  /* NAVD88 orthometric metres already subtracted from every height in the file,
   * i.e. what this asset's y = 0 was measured against. */
  seaDatumNavd88M: SEA_Z,
  bearing: venue.bearing,
  axes: "glTF/three: x = course-frame x metres, y = metres above the venue sea datum, z = -course-frame y. 1 unit = 1 m, Y up. Identical to the LVN3 asset's world frame, so the runtime adds this at the identity transform.",
  extentM: venue.coverage.sideM,
  coverage: {
    centreLon: venue.coverage.lon,
    centreLat: venue.coverage.lat,
    sideM: venue.coverage.sideM,
    mercatorBox: BOX,
    courseBoxM: {
      x0: round(courseBox.x0, 2),
      y0: round(courseBox.y0, 2),
      x1: round(courseBox.x1, 2),
      y1: round(courseBox.y1, 2),
    },
    areaKm2: round(AREA_M2 / 1e6, 4),
    landKm2: round(landAreaM2 / 1e6, 4),
    landPct: round((landCells / (NX * NY)) * 100, 2),
    note: "The venue clip disc is 10500 m; this asset covers a square about the downtown waterfront lens target only. Everything outside it stays the LVN3 baked asset's job.",
  },
  /* Two shapes on purpose. `nodes` is the flat name list the runtime lane's own
   * placeholder manifest already consumes; `nodeDetail` carries the per-node
   * counts the contract asks to see listed. Changing `nodes` to the rich shape
   * would have broken a consumer that exists. */
  /* Two shapes on purpose. `nodes` is the flat name list the runtime reader
   * requires, and its ORDER is load-bearing: `layerClassOf` numbers the
   * inspection mask's venue layers from it, first listed node = class 1. The
   * order below is draw order, ground outward, and must not be reshuffled
   * without telling the runtime lane. `nodeDetail` carries the per-node counts
   * the contract asks to see listed. */
  nodes: nodeReport.map((n) => n.name),
  nodeDetail: nodeReport,
  stats: {
    bytes: glbBuf.length,
    gzipBytes: glbGzip,
    triangles: totalTris,
    textureBytes: glb.textureBytes,
    geometryBytes: glb.geometryBytes,
    drawCalls,
  },
  sha256: glbSha,
  /* Flat strings, because the runtime reader types `sources` as
   * Record<string, string> and carries it straight through to its info() door.
   * Everything machine-readable about the same four sources is in
   * `sourceDetail`, which that reader treats as opaque. */
  sources: {
    lidar: `USGS 3DEP ${lidar.collection} via Entwine EPT on AWS Open Data, depth <= ${BAKE.maxDepth}, ${nodes.length} nodes, ${round(densityOverLand, 2)} pts/m2 over land`,
    imagery: `NAIP ${ortho.acquired} at ${ortho.groundSampleM} m via The National Map ImageServer, ${naipInputs.length} crops pinned by esriMosaicLockRaster`,
    footprints: `OpenStreetMap building=* with geometry via Overpass, ${buildings.length} extruded`,
    water: "OpenStreetMap natural=water areas, waterway=dock, landuse=basin, natural=coastline and man_made=breakwater/pier via Overpass",
  },
  sourceDetail: {
    lidar: {
      collection: lidar.collection,
      provider: "USGS 3DEP via the Entwine EPT octree on AWS Open Data (usgs-lidar-public)",
      endpoint: lidar.endpoint,
      verticalDatum: lidar.verticalDatum,
      acquired: lidar.acquired,
      maxDepth: BAKE.maxDepth,
      nodes: nodes.length,
      lazBytes: lazBytes,
      pointsInBox: pointsBinned,
      licence: "US Government public domain; USGS asks that products carry the National Geospatial Program acknowledgment.",
    },
    imagery: {
      provider: "NAIP 2022 via The National Map USGSNAIPImagery ImageServer (keyless; the AWS NAIP buckets are requester-pays and 403 an unsigned request)",
      service: ortho.service,
      pin: "esriMosaicLockRaster, one OBJECTID per crop",
      quads: [...naipQuads.values()].sort((a, b) => a.id - b.id).map((q) => ({ id: q.id, name: q.name, acquired: q.acquired })),
      crops: naipInputs.length,
      pngBytes: naipBytes,
      nativeGroundSampleM: ortho.groundSampleM,
      licence: "Public domain with attribution (USGS/USDA).",
    },
    footprints: {
      provider: "OpenStreetMap via Overpass",
      file: qBuildings.rel,
      sha256: sha256(qBuildings.buf),
      bytes: qBuildings.buf.length,
      licence: "ODbL 1.0, (c) OpenStreetMap contributors",
    },
    water: {
      provider: "OpenStreetMap via Overpass: natural=water areas, waterway=dock, landuse=basin, natural=coastline, man_made=breakwater/pier",
      files: [qCoast, qPier, qWater].map((q) => ({ file: q.rel, sha256: sha256(q.buf), bytes: q.buf.length })),
      rule: "breakwater (45 m half-width) and pier (6 m, closed areas dilated 3 m) corridors stamp land; then any mapped water area is water; then the nearest coastline segment decides by its side, land on the left of a to b. Coastline alone misclassifies Rainbow Harbour as land.",
      licence: "ODbL 1.0, (c) OpenStreetMap contributors",
    },
  },
  bake: {
    seed: BAKE.seed,
    densityPtsPerM2: round(densityPtsPerM2, 4),
    densityPtsPerM2OverLand: round(densityOverLand, 4),
    texelSizeM: round(texelSizeM, 4),
    rasterCellM: BAKE.rasterCellM,
    waterProbeCellM: BAKE.waterProbeCellM,
    meshCellM: BAKE.meshCellM,
    atlasPx: BAKE.atlasPx,
    naipGrid: BAKE.naipGrid,
    jpegQuality: BAKE.jpegQuality,
    textureCodec: "JPEG (mozjpeg) for colour, PNG for the alpha-cut canopy. KTX2/Basis is NOT used: three vendors the Basis transcoder only, there is no encoder in node_modules and no toktx/basisu on this machine.",
    dracoBits: {
      position: BAKE.dracoPositionBits,
      normal: BAKE.dracoNormalBits,
      texcoord: BAKE.dracoUvBits,
      color: BAKE.dracoColorBits,
    },
    /* Read off disk rather than through `require`: three's `exports` map does
     * not expose ./package.json, so requiring it throws
     * ERR_PACKAGE_PATH_NOT_EXPORTED. The version matters because it pins the
     * vendored decoder bytes the runtime serves. */
    toolVersions: {
      node: process.version,
      draco3d: pkgVersion("draco3d"),
      sharp: pkgVersion("sharp"),
      three: pkgVersion("three"),
    },
  },
  runtime: {
    loader: "GLTFLoader + DRACOLoader. No KTX2Loader is needed: the textures are JPEG/PNG.",
    decoderPath: "/prototype/layline/decoders/draco/",
    transform: "identity; the file is already in the venue's world frame",
    vertexColours: "the walls carry a float COLOR_0 tint whose components run up to 1.8, so it brightens as well as darkens. Materials must enable vertex colours.",
  },
  quality: {
    waterCutVsLidarVoid: cut,
    groundFill: { landHoles: holes, unresolved, unresolvedPctOfLand: round((unresolved / Math.max(1, landCells)) * 100, 2) },
    buildingHeightVsOsmTag: heightCheck,
    buildingsBySource: bySource,
    buildingsByPalette: byPalette,
    facadeAreaM2: Math.round(facadeAreaM2),
    wallTintsFromNaip: tinted,
    treeCount: trees.length,
    lidarClassHistogramPct: Object.fromEntries(
      [...classHist.entries()].sort((a, b) => a[0] - b[0]).map(([c, v]) => [c, round((v / pointsBinned) * 100, 3)]),
    ),
    notes: [
      "Facade texture is procedural, not photographic. A nadir orthophoto contains no wall pixels; the spike measured a 92x to 171x texel stretch over these buildings on the drape arm and 12.7x to 23.7x less vertical detail in the rendered frame.",
      "The NAIP drape bakes the 2022-05-11 midday light, its shadows and its parked vehicles into the ground and roofs. They will not respond to the scene's sun.",
      "Roofs are flat caps at the 90th-percentile surface height. Pitched roofs, parapets and plant rooms are in the point cloud and not in this mesh.",
      "Absolute elevation carries about 1 m of datum uncertainty: the sea datum is one venue constant, and this collection's own class-9 median swings 1.14 m between flight lines.",
    ],
  },
  attribution: venue.attribution,
  inputs: {
    osm: osmInputs,
    naip: naipInputs,
    lidarNodes: lidarInputs.length,
    lidarBytes: bytesOf(lidarInputs),
    provenanceLog: `${CACHE_DIR}/provenance/lidar-naip.tsv`,
  },
};

/* The manifest deliberately does not carry its own byte count: a self-counting
 * file needs a fixed-width field and a two-pass write, which is machinery for
 * a number the budget check can log instead. LF, because .gitattributes pins
 * this directory's manifests to LF and a CRLF round trip would move the bytes
 * a reader hashes. */
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
writeFileSync(manifestPath, manifestText);

const totalBytes = Buffer.byteLength(manifestText) + glbBuf.length;
out(`manifest ${Buffer.byteLength(manifestText)} B`);
out(`asset total ${totalBytes} B of the 25000000 B budget (${round((totalBytes / 25e6) * 100, 2)}%)`);
if (totalBytes > 25e6) {
  /* The oversized files stay on disk for diagnosis, but the run must not look
   * like a success: an automated rebake that cannot tell a contract-violating
   * output from a valid one would ship it (round-3 codex P2). */
  out(`BUDGET EXCEEDED by ${totalBytes - 25e6} B`);
  throw new Error(`asset total ${totalBytes} B exceeds the 25000000 B budget`);
}

/* ------------------------------------------------------------- verify */

/* Read the file back the way a consumer would and check it against what the
 * manifest claims. A bake that cannot decode its own output has not produced an
 * asset, it has produced a file. */
{
  const decoderModule = await require("draco3d").createDecoderModule({});
  const buf = readFileSync(glbPath);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb");
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binOffset = 20 + jsonLen + 8;
  const viewBytes = (i) => {
    const v = gltf.bufferViews[i];
    return buf.subarray(binOffset + v.byteOffset, binOffset + v.byteOffset + v.byteLength);
  };
  const names = gltf.nodes.map((n) => n.name);
  const expected = nodeReport.map((n) => n.name);
  if (names.join(",") !== expected.join(",")) {
    throw new Error(`node names ${names.join(",")} do not match the manifest ${expected.join(",")}`);
  }
  let tris = 0;
  let prims = 0;
  for (let mi = 0; mi < gltf.meshes.length; mi++) {
    const mesh = gltf.meshes[mi];
    let meshTris = 0;
    for (const prim of mesh.primitives) {
      prims++;
      const ext = prim.extensions?.KHR_draco_mesh_compression;
      if (!ext) throw new Error(`${mesh.name}: primitive is not Draco compressed`);
      const bytes = viewBytes(ext.bufferView);
      const dracoBuf = new decoderModule.DecoderBuffer();
      dracoBuf.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), bytes.length);
      const decoder = new decoderModule.Decoder();
      const dmesh = new decoderModule.Mesh();
      const status = decoder.DecodeBufferToMesh(dracoBuf, dmesh);
      if (!status.ok()) throw new Error(`${mesh.name}: draco decode failed, ${status.error_msg()}`);
      const faces = dmesh.num_faces();
      const points = dmesh.num_points();
      if (faces * 3 !== gltf.accessors[prim.indices].count) {
        throw new Error(`${mesh.name}: decoded ${faces * 3} indices, accessor claims ${gltf.accessors[prim.indices].count}`);
      }
      /* `GetAttributeByUniqueId` is the call three's DRACOLoader makes, and the
       * only one this decoder build exposes: `GetAttributeIdByUniqueId` is not
       * in the draco3d 1.5.7 nodejs module. Checking the unique id survives the
       * round trip is the point, because the glTF extension addresses draco
       * attributes by that id and nothing else validates the mapping. */
      const comps = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2, COLOR_0: 3 };
      for (const [attr, uniqueId] of Object.entries(ext.attributes)) {
        const a = decoder.GetAttributeByUniqueId(dmesh, uniqueId);
        if (!a || a.unique_id() !== uniqueId) {
          throw new Error(`${mesh.name}: ${attr} unique id ${uniqueId} is not in the draco stream`);
        }
        if (a.num_components() !== comps[attr]) {
          throw new Error(`${mesh.name}: ${attr} decoded ${a.num_components()} components, expected ${comps[attr]}`);
        }
        if (gltf.accessors[prim.attributes[attr]].count !== points) {
          throw new Error(`${mesh.name}: ${attr} accessor count ${gltf.accessors[prim.attributes[attr]].count} != decoded ${points}`);
        }
      }
      meshTris += faces;
      decoderModule.destroy(dmesh);
      decoderModule.destroy(decoder);
      decoderModule.destroy(dracoBuf);
    }
    const claimed = nodeReport.find((n) => n.name === mesh.name);
    if (!claimed || claimed.triangles !== meshTris) {
      throw new Error(`${mesh.name}: decoded ${meshTris} triangles, manifest claims ${claimed?.triangles}`);
    }
    tris += meshTris;
  }
  if (tris !== manifest.stats.triangles) throw new Error(`decoded ${tris} triangles, manifest claims ${manifest.stats.triangles}`);
  if (prims !== manifest.stats.drawCalls) throw new Error(`decoded ${prims} primitives, manifest claims ${manifest.stats.drawCalls}`);

  /* Image sizes read out of the embedded bytes, not out of the encoder's
   * return value: the point of this check is that what landed on disk is what
   * the manifest describes. */
  const sizes = [];
  let imageBytes = 0;
  for (const image of gltf.images) {
    const bytes = viewBytes(image.bufferView);
    imageBytes += bytes.length;
    const meta = await sharp(bytes).metadata();
    sizes.push(`${image.name}=${meta.width}x${meta.height}:${meta.format}:${bytes.length}`);
  }
  if (imageBytes !== manifest.stats.textureBytes) {
    throw new Error(`embedded images total ${imageBytes} B, manifest claims ${manifest.stats.textureBytes} B`);
  }
  const atlasMeta = sizes.find((s) => s.startsWith("naip-atlas="));
  if (atlasMeta !== `naip-atlas=${BAKE.atlasPx}x${BAKE.atlasPx}:jpeg:${atlasJpeg.length}`) {
    throw new Error(`ground atlas readback ${atlasMeta} does not match the encoded texture`);
  }
  if (sha256(buf) !== manifest.sha256) throw new Error("glb on disk does not hash to the manifest sha256");
  out(`verify nodes ${names.join(",")}`);
  out(`verify triangles ${tris}, primitives ${prims}, images ${gltf.images.length}, image bytes ${imageBytes}`);
  out(`verify textures ${sizes.join(" ")}`);
  out(`verify sha256 matches manifest, draco decodes every primitive`);
}

/* --------------------------------------------------------------- decoders */

/* Vendored, never a CDN: the runtime must work offline and must not hand a
 * third party a request log of who is viewing the replay. */
{
  const from = "node_modules/three/examples/jsm/libs/draco/gltf";
  const to = join(DECODER_DIR, "draco");
  mkdirSync(to, { recursive: true });
  const copied = [];
  for (const name of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
    const bytes = readFileSync(join(from, name));
    const dest = join(to, name);
    if (!existsSync(dest) || sha256(readFileSync(dest)) !== sha256(bytes)) writeFileSync(dest, bytes);
    copied.push(`${name}=${bytes.length}:${sha256(bytes).slice(0, 12)}`);
  }
  out(`decoders ${to} ${copied.join(" ")}`);
}

/* --------------------------------------------------------------- scratch */

/* Nothing bulky is written outside the cache: points are binned as each node
 * decodes and never land on disk, so there is no intermediate to delete. The
 * `work/` sweep is a guard against a future stage that forgets that rule. */
{
  const work = join(CACHE_DIR, "work");
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  scratch.walk();
  out(`scratch ${scratch.bytes} B in ${scratch.files} files under ${CACHE_DIR}, cap ${BAKE.scratchCapBytes} B`);
  out(`scratch peak ${scratch.peak} B`);
  scratch.check();
}

out(`wrote ${glbPath}`);
out(`wrote ${manifestPath}`);
note(`[${since()}] done`);
