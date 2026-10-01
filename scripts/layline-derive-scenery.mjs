/**
 * Derive committed scenery products for a Layline venue from 3DEP lidar and
 * NAIP orthoimagery.
 *
 * Input: a venue id from scripts/lib/venue-scenery.mjs.
 * Sources, both keyless and fetched at derivation time only:
 *   - USGS 3DEP point clouds, Entwine Point Tiles in `usgs-lidar-public`,
 *     decoded through the vendored laz-perf WASM in scripts/lib/laz-perf/.
 *   - NAIP orthoimagery, The National Map's USGSNAIPImagery ImageServer,
 *     pinned scene by scene with esriMosaicLockRaster.
 *   - The baker's own Overpass caches, read but never written.
 * Output, committed so the bake never touches the network:
 *   scripts/venue-data/<venue>/trees.json
 *   scripts/venue-data/<venue>/masses.json
 *   scripts/venue-data/<venue>/height-fields.json
 *   scripts/venue-data/<venue>/shoreline.json
 *   scripts/venue-data/<venue>/swatches.json
 *   scripts/venue-data/<venue>/sea-level.json
 *   scripts/venue-data/<venue>/provenance.json
 *
 * This script does not bake and does not write into public/. The venue asset
 * is untouched by design: the overhaul rounds that follow read these products.
 *
 * Determinism. Every grid origin, box and query parameter comes from the venue
 * config, never from the data's own extent; every ordering is a total order;
 * every number is fixed to a stated number of decimals; no clock is read
 * during derivation, and retrieval dates reach the products through the cache
 * manifest. Two runs from a warm cache produce byte-identical files, and so
 * does a run after a cached input is deleted and refetched.
 *
 * Run: node scripts/layline-derive-scenery.mjs long-beach
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { venueScenery } from "./lib/venue-scenery.mjs";
import { courseFrame } from "./lib/geo.mjs";
import { collectCourseBox, openCollection } from "./lib/ept.mjs";
import { allProvenance, readBakerCache } from "./lib/venue-cache.mjs";
import { fetchCrop, hex, medianRgb, swatchAt } from "./lib/naip.mjs";
import {
  canopyHeightModel,
  classHistogram,
  clampToNeighbours,
  encodeHeightField,
  encodeMask,
  excludeCrownsInMasses,
  fillHoles,
  findCrowns,
  findMasses,
  makeGrid,
  maxOf,
  minOf,
  NODATA_CM,
  observedMask,
  percentile,
  rasterize,
  round2,
  seaLevel,
  shorelineProfile,
  signedDistanceToRing,
  smooth,
} from "./lib/scenery-derive.mjs";

const GENERATOR = "scripts/layline-derive-scenery.mjs";
const SCHEMA = 1;

const venueId = process.argv[2];
if (!venueId) {
  console.error("usage: node scripts/layline-derive-scenery.mjs <venue-id>");
  process.exit(1);
}
const config = venueScenery(venueId);
const outDir = join("scripts", "venue-data", venueId);
mkdirSync(outDir, { recursive: true });
const frame = courseFrame({ ...config.origin, bearing: config.bearing });
const D = config.derive;

/* ------------------------------------------------------------ product I/O */

/** Hash of the substantive payload, excluding provenance. A refetch on a later
 * date legitimately changes a recorded retrieval date; it must not be able to
 * change what the product says about the world, and this is what proves it. */
const valuesHash = (body) => createHash("sha256").update(JSON.stringify(body)).digest("hex");

function writeProduct(name, body, inputs) {
  const doc = {
    product: name,
    venue: venueId,
    schema: SCHEMA,
    generator: GENERATOR,
    ...body,
    valuesSha256: valuesHash(body),
    inputs,
  };
  const path = join(outDir, `${name}.json`);
  /* JSON.stringify emits LF; .gitattributes pins scripts/venue-data/**\/*.json
   * to LF so autocrlf cannot rewrite it back out of sync with these hashes. */
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return { name, path, valuesSha256: doc.valuesSha256 };
}

const FRAME_NOTE = {
  description:
    "Course frame of scripts/layline-bake-venue.mjs: ENU metres about the venue origin, rotated so +y runs up the course axis. 1 unit = 1 m.",
  origin: config.origin,
  bearingDeg: config.bearing,
  mPerLat: frame.mPerLat,
  mPerLon: round2(frame.mPerLon),
  verticalDatum: config.lidar.verticalDatum,
  verticalNote: "z is the source file's own elevation, orthometric metres, unshifted.",
};

/* ------------------------------------------------------------- OSM inputs */

const osmSources = new Map();
const osmInputRows = [];
for (const source of config.osmInputs) {
  const { buf, provenance } = readBakerCache(source.file, source.note);
  osmSources.set(source.file, JSON.parse(buf.toString("utf8")));
  osmInputRows.push(provenance);
}

const osmElements = (file) => osmSources.get(file).elements ?? [];

/** Course-frame ring of an OSM way, with any repeated closing vertex dropped. */
function ringOf(wayId) {
  for (const file of config.osmInputs) {
    const way = osmElements(file.file).find((e) => e.type === "way" && e.id === wayId);
    if (!way?.geometry?.length) continue;
    const points = way.geometry.map((g) => {
      const p = frame.project(g.lat, g.lon);
      return [p.x, p.y];
    });
    const [fx, fy] = points[0];
    const [lx, ly] = points[points.length - 1];
    if (points.length > 1 && fx === lx && fy === ly) points.pop();
    return points;
  }
  throw new Error(`OSM way ${wayId} not in any cached Overpass response`);
}

const centroidOf = (ring) => ({
  x: ring.reduce((s, p) => s + p[0], 0) / ring.length,
  y: ring.reduce((s, p) => s + p[1], 0) / ring.length,
});

/** OSM elements carrying a numeric height tag, with a course-frame centroid. */
function heightTaggedElements() {
  const out = [];
  for (const source of config.osmInputs) {
    for (const e of osmElements(source.file)) {
      const h = Number.parseFloat(e.tags?.height);
      if (!Number.isFinite(h) || !e.geometry?.length) continue;
      const lat = e.geometry.reduce((s, g) => s + g.lat, 0) / e.geometry.length;
      const lon = e.geometry.reduce((s, g) => s + g.lon, 0) / e.geometry.length;
      const p = frame.project(lat, lon);
      out.push({
        id: e.id,
        type: e.type,
        name: e.tags.name ?? e.tags.building ?? e.tags.man_made ?? null,
        heightM: h,
        x: p.x,
        y: p.y,
      });
    }
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

const osmHeights = heightTaggedElements();

/* --------------------------------------------------------- input digests */

/** One hash over a whole input set: the sorted `<sha256>\t<file>` lines.
 *
 * A thousand lidar nodes copied into five products is a thousand chances for
 * two copies to drift. The full table is written once, into provenance.json;
 * every product pins the exact set it read with this hash, which is a stronger
 * claim than a duplicate and survives review by hand.
 */
function inputDigest(allRows) {
  /* One node serves several patches, so the raw list repeats. The digest is
   * over the distinct set: a file counted twice is still one input. */
  const unique = new Map();
  for (const row of allRows) if (!unique.has(row.file)) unique.set(row.file, row);
  const rows = [...unique.values()];
  const lines = rows
    .map((r) => `${r.sha256}\t${r.file}`)
    .sort()
    .join("\n");
  const retrieved = rows.map((r) => r.retrieved).filter(Boolean).sort();
  return {
    count: rows.length,
    bytes: rows.reduce((s, r) => s + r.bytes, 0),
    retrieved: retrieved.length ? { first: retrieved[0], last: retrieved[retrieved.length - 1] } : null,
    listSha256: createHash("sha256").update(lines).digest("hex"),
  };
}

function nearestOsm(mass) {
  let best = null;
  for (const e of osmHeights) {
    const d = Math.hypot(e.x - mass.x, e.y - mass.y);
    if (!best || d < best.distanceM || (d === best.distanceM && e.id < best.id)) {
      best = { id: e.id, type: e.type, name: e.name, heightM: e.heightM, distanceM: d };
    }
  }
  if (!best || best.distanceM > D.osmMatchRadiusM) return null;
  return { ...best, distanceM: round2(best.distanceM) };
}

/* --------------------------------------------------------------- lidar run */

const timings = [];
const time = async (label, fn) => {
  const t0 = performance.now();
  const value = await fn();
  timings.push({ label, ms: Math.round(performance.now() - t0) });
  return value;
};

const reader = await time("open EPT collection", () =>
  openCollection({ endpoint: config.lidar.endpoint, collection: config.lidar.collection }),
);

const groundClasses = config.lidar.classes.ground;
const waterClasses = config.lidar.classes.water;
const noiseClasses = config.lidar.classes.noise;

const islandByPatch = new Map(config.islands.map((i) => [i.patch, i]));
const patchResults = [];
const lidarInputs = [];
let lidarBytes = 0;

for (const patch of config.patches) {
  const centre = frame.project(patch.lat, patch.lon);
  const grid = makeGrid({ centreX: centre.x, centreY: centre.y, halfM: patch.halfM, cell: D.cellM });
  const collected = await time(`collect ${patch.name}`, () =>
    collectCourseBox(reader, frame, { x0: grid.x0, y0: grid.y0, x1: grid.x1, y1: grid.y1 }, config.lidar.maxDepth),
  );
  lidarBytes += collected.bytes;
  for (const row of collected.inputs) lidarInputs.push(row);
  const points = collected.points;

  const groundRaw = rasterize(points, grid, "min", (c) => groundClasses.includes(c));
  const observed = observedMask(groundRaw);
  const ground = fillHoles(groundRaw, grid, D.heightFieldFillPasses);
  const surface = rasterize(
    points,
    grid,
    "max",
    (c) => !noiseClasses.includes(c) && !waterClasses.includes(c),
  );
  const chm = canopyHeightModel(surface, ground);

  const masses = findMasses(chm, grid, D.massThresholdM, D.massMinCells);
  const crownsRaw = clampToNeighbours(
    findCrowns(smooth(chm, grid, D.crownSmoothRadius), grid, {
      minHeight: D.crownMinHeightM,
      maxHeight: D.crownMaxHeightM,
    }),
  );
  const crowns = excludeCrownsInMasses(crownsRaw, masses, D.massExclusionPadM);

  const island = islandByPatch.get(patch.name) ?? null;
  const ring = island ? ringOf(island.way) : null;
  if (island) {
    const c = centroidOf(ring);
    const drift = Math.hypot(c.x - centre.x, c.y - centre.y);
    if (drift > config.centroidToleranceM) {
      throw new Error(
        `${island.name}: OSM way ${island.way} centroid has moved ${drift.toFixed(1)} m from the configured patch centre (tolerance ${config.centroidToleranceM} m)`,
      );
    }
  }

  const observedZ = [];
  for (let i = 0; i < groundRaw.length; i++) if (!Number.isNaN(groundRaw[i])) observedZ.push(groundRaw[i]);

  patchResults.push({
    patch,
    grid,
    island,
    ring,
    points,
    ground,
    observed,
    observedZ,
    chm,
    masses,
    crowns,
    crownsBeforeMassFilter: crownsRaw.length,
    collected,
  });
}

/* ------------------------------------------------------------- NAIP run */

const crops = new Map();
const orthoInputs = [];
for (const spec of config.orthoCrops) {
  const crop = await time(`naip ${spec.name}`, () => fetchCrop(config.ortho, spec));
  crops.set(spec.name, crop);
  orthoInputs.push(crop.provenance);
}

/* ------------------------------------------------------------- products */

const allInputs = [
  reader.eptProvenance,
  ...reader.hierarchyInputs,
  ...lidarInputs,
  ...orthoInputs,
  ...osmInputRows,
];

/** Every product points at provenance.json for the full table and carries the
 * digests of the sets it actually read. Ortho and OSM sets are small enough to
 * inline in full; the lidar set is a thousand nodes and travels as a digest. */
const inputsFor = ({ lidar = false, ortho = false, osm = false }) => ({
  manifest: "provenance.json",
  note: "Every raw file behind these numbers is listed with its sha256, URL and retrieval date in provenance.json. The digests here pin the exact sets this product read: listSha256 is sha256 over the sorted `<sha256>\\t<file>` lines.",
  ...(lidar
    ? {
        lidar: {
          collection: config.lidar.collection,
          ...inputDigest([reader.eptProvenance, ...reader.hierarchyInputs, ...lidarInputs]),
        },
      }
    : {}),
  ...(ortho ? { ortho: orthoInputs } : {}),
  ...(osm ? { osm: osmInputRows } : {}),
});

const islandPatches = patchResults.filter((r) => r.island);

const written = [];

/* 1. Trees. */
written.push(
  writeProduct(
    "trees",
    {
      title: "Individual tree crowns per island, from a 1 m canopy height model",
      frame: FRAME_NOTE,
      units: { x: "m", y: "m", height: "m above local ground", crownRadius: "m" },
      method:
        "Variable-window local maxima on a smoothed 1 m CHM (surface max-z minus hole-filled class 2/20 ground). Crown radius grown to the 40%-of-top contour, then clamped at half the nearest-neighbour distance, so it is a lower bound. Crowns standing inside a detected mass are dropped as screen panels and rig structure.",
      tolerance:
        "Crown count is good to roughly a factor of three (594 raw, 268 at smoothing radius 1, 170 at radius 2 on Island White); the height distribution is not sensitive to the same sweep. Placing crowns at measured positions and heights is supported; an exact census is not.",
      vintage: {
        acquired: config.lidar.acquired,
        caveat:
          "Island planting turns over on a scale of years, so a specific crown may no longer be there; the canopy statistics will be.",
      },
      parameters: {
        cellM: D.cellM,
        smoothRadius: D.crownSmoothRadius,
        minHeightM: D.crownMinHeightM,
        maxHeightM: D.crownMaxHeightM,
        massExclusionPadM: D.massExclusionPadM,
      },
      islands: islandPatches.map((r) => {
        const heights = r.crowns.map((c) => c.height);
        const radii = r.crowns.map((c) => c.crownRadius);
        return {
          name: r.island.name,
          label: r.island.label,
          osmWay: r.island.way,
          patch: r.patch.name,
          crownCount: r.crowns.length,
          crownCountBeforeMassFilter: r.crownsBeforeMassFilter,
          heightM: {
            p10: round2(percentile(heights, 0.1)),
            p50: round2(percentile(heights, 0.5)),
            p90: round2(percentile(heights, 0.9)),
            max: round2(maxOf(heights)),
          },
          crownRadiusM: {
            p50: round2(percentile(radii, 0.5)),
            p90: round2(percentile(radii, 0.9)),
          },
          crowns: r.crowns.map((c) => [c.x, c.y, c.height, c.crownRadius]),
        };
      }),
      crownTuple: ["courseX", "courseY", "heightM", "crownRadiusM"],
    },
    inputsFor({ lidar: true }),
  ),
);

/* 2. Masses. */
written.push(
  writeProduct(
    "masses",
    {
      title: "Connected structures over 20 m, matched to OSM elements",
      frame: FRAME_NOTE,
      units: { x: "m", y: "m", top: "m above local ground", footprintM2: "m2" },
      method:
        "Eight-connected components of CHM cells over 20 m. Dimensions come from the lidar; semantics come from OSM, because neither LA collection emits a building class. A match is the nearest OSM element carrying a numeric height tag within the match radius.",
      parameters: {
        cellM: D.cellM,
        thresholdM: D.massThresholdM,
        minCells: D.massMinCells,
        osmMatchRadiusM: D.osmMatchRadiusM,
      },
      patches: patchResults.map((r) => ({
        name: r.patch.name,
        kind: r.patch.kind,
        island: r.island?.label ?? null,
        massCount: r.masses.length,
        tallest: r.masses.length
          ? { x: r.masses[0].x, y: r.masses[0].y, top: r.masses[0].top, footprintM2: r.masses[0].footprintM2, widthM: r.masses[0].widthM, depthM: r.masses[0].depthM }
          : null,
        masses: r.masses.map((m) => ({
          x: m.x,
          y: m.y,
          top: m.top,
          footprintM2: m.footprintM2,
          widthM: m.widthM,
          depthM: m.depthM,
          osm: nearestOsm(m),
        })),
      })),
      validation: (() => {
        const deltas = [];
        for (const r of patchResults) {
          for (const m of r.masses) {
            if (m.top < 30) continue;
            const match = nearestOsm(m);
            if (!match) continue;
            deltas.push({ patch: r.patch.name, lidarTop: m.top, osmHeightM: match.heightM, deltaM: round2(m.top - match.heightM), osmId: match.id, osmName: match.name, distanceM: match.distanceM });
          }
        }
        deltas.sort((a, b) => a.osmId - b.osmId || a.lidarTop - b.lidarTop);
        const massingKinds = new Set(
          config.patches.filter((p) => p.kind === "massing").map((p) => p.name),
        );
        const chain = deltas.filter((d) => massingKinds.has(d.patch));
        const other = deltas.filter((d) => !massingKinds.has(d.patch));
        const mae = (rows) =>
          rows.length ? round2(rows.reduce((s, d) => s + Math.abs(d.deltaM), 0) / rows.length) : null;
        return {
          note: "Every mass at or over 30 m against the nearest independently sourced OSM height within the match radius.",
          chainCheck: {
            note: "The honesty test for the whole chain: mercator-to-ground scaling, the ground surface, the height model and the component detector. Scoped to the urban-massing patches, where an OSM height tag and a max-z surface describe the same object. Lidar reads high, which is what rooftop plant and parapets do.",
            scope: [...massingKinds].sort(),
            matched: chain.length,
            meanAbsoluteErrorM: mae(chain),
            matches: chain,
          },
          taggedDifferently: {
            note: "The same comparison where the OSM tag and the lidar measure different things, so the delta is information rather than error: a boom-up gantry against a crane's stowed height, a moored liner's hull tag against its funnel tops, a camouflage tower whose OSM height is a decades-old estimate. These are the corrections the overhaul rounds are for, not chain errors.",
            matched: other.length,
            meanAbsoluteErrorM: mae(other),
            matches: other,
          },
        };
      })(),
    },
    inputsFor({ lidar: true, osm: true }),
  ),
);

/* 3. Height fields. */
written.push(
  writeProduct(
    "height-fields",
    {
      title: "1 m ground height fields per patch",
      frame: FRAME_NOTE,
      method:
        "Minimum z of classes 2 and 20 per 1 m cell, then hole-filled by repeated 4-neighbour averaging. `observed` marks the cells that hold a real return; everything else in `ground` is interpolated and can travel at most fillPasses cells from an observation. Replaces the z11 Terrarium guess inside these boxes, which is 64 m per sample and reads Island Grissom's 4.9 m deck at a 23 m mean.",
      encoding: {
        ground: "int16 little-endian centimetres, row-major from (x0, y0) with +x fastest, gzip then base64",
        observed: "one bit per cell, LSB first within each byte, same order, gzip then base64",
        nodata: NODATA_CM,
        note: "dataSha256 is over the uncompressed bytes, so it is independent of the zlib build that packed them.",
      },
      parameters: { cellM: D.cellM, fillPasses: D.heightFieldFillPasses, groundClasses },
      patches: patchResults.map((r) => {
        const encoded = encodeHeightField(r.ground);
        const mask = encodeMask(r.observed);
        let observedCells = 0;
        for (let i = 0; i < r.observed.length; i++) observedCells += r.observed[i];
        let filledCells = 0;
        for (let i = 0; i < r.ground.length; i++) if (!Number.isNaN(r.ground[i])) filledCells++;
        return {
          name: r.patch.name,
          kind: r.patch.kind,
          grid: { x0: r.grid.x0, y0: r.grid.y0, cellM: r.grid.cell, width: r.grid.w, height: r.grid.h },
          centre: { lat: r.patch.lat, lon: r.patch.lon, courseX: round2(frame.project(r.patch.lat, r.patch.lon).x), courseY: round2(frame.project(r.patch.lat, r.patch.lon).y) },
          points: r.points.n,
          pointsPerM2: round2(r.points.n / (2 * r.patch.halfM) ** 2),
          classes: classHistogram(r.points),
          cells: { total: r.grid.w * r.grid.h, observed: observedCells, afterFill: filledCells },
          observedZ: r.observedZ.length
            ? {
                p05: round2(percentile(r.observedZ, 0.05)),
                p50: round2(percentile(r.observedZ, 0.5)),
                p95: round2(percentile(r.observedZ, 0.95)),
                max: round2(maxOf(r.observedZ)),
              }
            : null,
          ground: { dataSha256: encoded.dataSha256, rawBytes: encoded.rawBytes, gzipBase64: encoded.base64 },
          observed: { dataSha256: mask.dataSha256, rawBytes: mask.rawBytes, gzipBase64: mask.base64 },
        };
      }),
    },
    inputsFor({ lidar: true }),
  ),
);

/* 4. Shoreline. */
const shorelines = islandPatches.map((r) => ({
  name: r.island.name,
  label: r.island.label,
  osmWay: r.island.way,
  ringVertices: r.ring.length,
  ...shorelineProfile(r.points, r.ring, { ...D, groundClasses }),
}));

written.push(
  writeProduct(
    "shoreline",
    {
      title: "Riprap profile per island, against the island's own OSM waterline",
      frame: FRAME_NOTE,
      units: { distanceM: "m from the OSM ring, negative outboard", z: "m" },
      method:
        "Class 2 and 20 ground z binned by signed distance to the island's OSM ring. Class 20, ignored ground, is kept: on a riprap rim it is the rock the classifier declined to call ground. Deck is the median of the inboard plateau; the crown is the distance whose median z peaks; the batter is the fall from the crown out to the first usable outboard bin.",
      caveat:
        "An island whose OSM ring already traces the rock rather than the waterline reports a near-zero lip, because its zero sits on the crown. Compare ring vertex counts before averaging these together.",
      parameters: {
        binM: D.shorelineBinM,
        rangeM: D.shorelineRangeM,
        deckWindowM: D.shorelineDeckWindowM,
        crownWindowM: D.shorelineCrownWindowM,
        minBinPoints: D.shorelineMinBinPoints,
        groundClasses,
      },
      islands: shorelines,
    },
    inputsFor({ lidar: true, osm: true }),
  ),
);

/* 5. Swatches. */
const swatchPoints = config.swatchPoints.map((spec) => {
  const crop = crops.get(spec.crop);
  const s = swatchAt(crop, spec.lon, spec.lat, spec.windowPx);
  return {
    name: spec.name,
    material: spec.material,
    crop: spec.crop,
    quad: { id: crop.quad.id, name: crop.quad.name, acquired: crop.quad.acquired },
    lon: spec.lon,
    lat: spec.lat,
    windowPx: spec.windowPx,
    pixels: s.pixels,
    rgb: s.rgb,
    hex: hex(s.rgb),
  };
});

const swatchRegions = [];
const crownByIsland = new Map(shorelines.map((s) => [s.name, s.crownAtM]));
for (const r of islandPatches) {
  const crop = crops.get(r.patch.name);
  if (!crop) continue;
  /* The rock band is centred on the measured rim crown, not on the OSM ring.
   * The ring is the waterline and the crown stands 8 to 12 m inboard of it, so
   * a band about the ring samples wet rock and water and reads as sea. */
  const crownAt = crownByIsland.get(r.island.name) ?? 0;
  const buckets = { deck: [], rim: [], water: [] };
  for (let py = 0; py < crop.img.height; py++) {
    for (let px = 0; px < crop.img.width; px++) {
      const u = (px + 0.5) / crop.img.width;
      const v = (py + 0.5) / crop.img.height;
      const mx = crop.bbox[0] + u * (crop.bbox[2] - crop.bbox[0]);
      const my = crop.bbox[3] - v * (crop.bbox[3] - crop.bbox[1]);
      const p = frame.projectMercator(mx, my);
      const d = signedDistanceToRing(r.ring, p.x, p.y);
      if (d >= crownAt + D.deckSwatchInboardM) buckets.deck.push([px, py]);
      else if (Math.abs(d - crownAt) <= D.rimSwatchHalfWidthM) buckets.rim.push([px, py]);
      else if (d <= -D.waterSwatchOutboardM) buckets.water.push([px, py]);
    }
  }
  for (const [region, pixels] of Object.entries(buckets)) {
    if (!pixels.length) continue;
    const rgb = medianRgb(crop, pixels);
    swatchRegions.push({
      name: `${r.island.name}.${region}`,
      island: r.island.name,
      region,
      material: region === "deck" ? "islandDeck" : region === "rim" ? "rock" : "water",
      crop: r.patch.name,
      band:
        region === "rim"
          ? { centreM: crownAt, halfWidthM: D.rimSwatchHalfWidthM, from: "the measured rim crown" }
          : region === "deck"
            ? { fromM: crownAt + D.deckSwatchInboardM, from: "inboard of the rim crown" }
            : { toM: -D.waterSwatchOutboardM, from: "outboard of the OSM waterline" },
      quad: { id: crop.quad.id, name: crop.quad.name, acquired: crop.quad.acquired },
      pixels: pixels.length,
      rgb,
      hex: hex(rgb),
    });
  }
}

written.push(
  writeProduct(
    "swatches",
    {
      title: "Median NAIP colour per material region",
      method:
        "Component-wise median RGB over a pixel set from one pinned NAIP scene. `points` are a fixed window at a named place; `regions` are masks defined by signed distance to the island's OSM ring, so nothing is a hand-picked pixel. Each channel is taken independently, which makes the result representative rather than a pixel that exists.",
      ortho: {
        service: config.ortho.service,
        pin: config.ortho.pin,
        groundSampleM: config.ortho.groundSampleM,
        acquired: config.ortho.acquired,
        rendering: config.ortho.rendering,
        attribution: config.ortho.attribution,
      },
      vintage: {
        caveat:
          "The orthophoto is 2022-05-11/12 and the scan is 2023-10-02/03. Anything repainted after May 2022 is the wrong colour here.",
      },
      parameters: {
        rimSwatchHalfWidthM: D.rimSwatchHalfWidthM,
        deckSwatchInboardM: D.deckSwatchInboardM,
        waterSwatchOutboardM: D.waterSwatchOutboardM,
      },
      crops: config.orthoCrops.map((spec) => {
        const crop = crops.get(spec.name);
        return {
          name: spec.name,
          metres: spec.metres,
          sizePx: crop.size,
          metresPerPixel: round2(spec.metres / crop.size),
          bbox3857: crop.bbox,
          quad: { id: crop.quad.id, name: crop.quad.name, year: crop.quad.year, acquired: crop.quad.acquired },
          coverage: crop.coverage,
          whiteFraction: round2(crop.whiteFraction),
        };
      }),
      points: swatchPoints,
      regions: swatchRegions,
    },
    inputsFor({ ortho: true, osm: true }),
  ),
);

/* 6. Sea plane. */
const seaPerPatch = patchResults
  .map((r) => ({ patch: r.patch.name, ...(seaLevel(r.points, waterClasses) ?? {}) }))
  .filter((s) => s.points);
const seaMedians = seaPerPatch.map((s) => s.z50);

written.push(
  writeProduct(
    "sea-level",
    {
      title: "Sea plane offset from the water class",
      frame: FRAME_NOTE,
      method:
        "Median z of class 9 water returns per patch. This is the tide at scan time in the survey's own vertical datum, which is the plane every other height in these products is measured above.",
      parameters: { waterClasses },
      acquired: config.lidar.acquired,
      perPatch: seaPerPatch,
      overall: {
        medianOfPatchMediansM: seaMedians.length ? round2(percentile(seaMedians, 0.5)) : null,
        minM: seaMedians.length ? round2(minOf(seaMedians)) : null,
        maxM: seaMedians.length ? round2(maxOf(seaMedians)) : null,
      },
    },
    inputsFor({ lidar: true }),
  ),
);

/* 7. Provenance manifest. */
const byFile = new Map();
for (const row of allInputs) if (!byFile.has(row.file)) byFile.set(row.file, row);
const manifestRows = [...byFile.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

writeFileSync(
  join(outDir, "provenance.json"),
  JSON.stringify(
    {
      product: "provenance",
      venue: venueId,
      schema: SCHEMA,
      generator: GENERATOR,
      title: "Every raw input behind the derived scenery products",
      note: "Cached under .tmp/venue-cache/ with a fetch log at .tmp/venue-cache/provenance/lidar-naip.tsv. A file on disk is never refetched, so a derivation replays with the network unplugged. Retrieval dates come from that log, never from a clock read during derivation.",
      sources: {
        lidar: {
          provider: config.lidar.provider,
          endpoint: config.lidar.endpoint,
          collection: config.lidar.collection,
          fallback: config.lidar.fallback,
          srs: config.lidar.srs,
          verticalDatum: config.lidar.verticalDatum,
          acquired: config.lidar.acquired,
          maxDepth: config.lidar.maxDepth,
          hasVegetationClass: config.lidar.hasVegetationClass,
          hasBuildingClass: config.lidar.hasBuildingClass,
          decoder: "laz-perf 0.0.7 WASM, vendored at scripts/lib/laz-perf/ (Apache-2.0)",
          /* Distinct files: a node overlapping two patches is read twice and
           * archived once. `nodeReads` is the work, `nodes` is the evidence. */
          nodes: new Set(lidarInputs.map((r) => r.file)).size,
          nodeReads: lidarInputs.length,
          hierarchyPages: reader.hierarchyInputs.length,
          bytes: [...new Map(lidarInputs.map((r) => [r.file, r])).values()].reduce((s, r) => s + r.bytes, 0),
          bytesRead: lidarBytes,
        },
        ortho: {
          provider: config.ortho.provider,
          service: config.ortho.service,
          pin: config.ortho.pin,
          groundSampleM: config.ortho.groundSampleM,
          acquired: config.ortho.acquired,
          rendering: config.ortho.rendering,
          quads: config.ortho.quads.length,
          crops: orthoInputs.length,
        },
        osm: {
          note: "Overpass responses fetched by scripts/layline-bake-venue.mjs; the query text lives with the query in that file.",
          files: config.osmInputs,
        },
      },
      products: written.map((w) => ({ product: w.name, file: `${w.name}.json`, valuesSha256: w.valuesSha256 })),
      inputs: manifestRows,
    },
    null,
    2,
  ) + "\n",
);

/* --------------------------------------------------------------- run log */

console.log(`venue          ${venueId}`);
console.log(`collection     ${config.lidar.collection}  srs ${config.lidar.srs}  acquired ${config.lidar.acquired}`);
console.log(`lidar          ${lidarInputs.length} nodes, ${(lidarBytes / 1e6).toFixed(1)} MB laz`);
console.log(`ortho          ${orthoInputs.length} pinned NAIP crops`);
console.log("");
console.log("patch            points     pts/m2  masses  tallest  crowns");
for (const r of patchResults) {
  console.log(
    `${r.patch.name.padEnd(16)} ${r.points.n.toLocaleString().padStart(9)}  ${round2(r.points.n / (2 * r.patch.halfM) ** 2)
      .toFixed(2)
      .padStart(6)}  ${String(r.masses.length).padStart(6)}  ${(r.masses[0]?.top ?? 0).toFixed(2).padStart(7)}  ${String(r.crowns.length).padStart(6)}`,
  );
}
console.log("");
for (const s of shorelines) {
  console.log(
    `${s.label.padEnd(9)} ring ${String(s.ringVertices).padStart(3)}v  deck ${s.deckZ.toFixed(2)}  crown ${s.crownZ?.toFixed(2)} at ${s.crownAtM} m  lip ${s.lipM?.toFixed(2)}  batter 1:${s.batter?.ratio}`,
  );
}
console.log("");
for (const s of swatchPoints) console.log(`swatch ${s.name.padEnd(16)} ${s.hex}  rgb(${s.rgb.join(",")})  quad ${s.quad.id}`);
console.log("");
for (const s of seaPerPatch) console.log(`sea ${s.patch.padEnd(16)} median ${s.z50.toFixed(2)} m  (${s.points.toLocaleString()} class-9 points)`);
console.log("");
for (const w of written) console.log(`wrote ${w.path}  values ${w.valuesSha256.slice(0, 16)}`);
console.log(`wrote ${join(outDir, "provenance.json")}  ${manifestRows.length} inputs`);
console.log("");
console.log(`cache manifest rows: ${allProvenance().length}`);
for (const t of timings) console.log(`  ${t.label.padEnd(28)} ${(t.ms / 1000).toFixed(1)} s`);
console.log(`  ${"total".padEnd(28)} ${(timings.reduce((s, t) => s + t.ms, 0) / 1000).toFixed(1)} s`);
