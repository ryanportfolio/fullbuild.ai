/* Named places in the Long Beach venue, in the renderer's world frame.
 *
 * `venue-lens.mjs` photographs things by name. This is where the names get
 * their coordinates, and none of them are typed in by eye: every anchor is
 * either an OpenStreetMap element the baker itself pins by id, or a cluster
 * measured out of the shipped asset, so a target cannot drift away from the
 * geometry it is supposed to be looking at without the derivation saying so.
 *
 * Two sources, in this order of authority:
 *
 *   1. The Overpass responses in `.tmp/venue-cache/`, which are the exact
 *      bytes `scripts/layline-bake-venue.mjs` built the asset from. A hero the
 *      baker pins by id (the four THUMS islands, the Queen Mary, the Gerald
 *      Desmond replacement, the Spruce Goose dome) is anchored on that
 *      element's own ring, projected with the baker's own frame maths.
 *   2. `public/prototype/layline/venues/long-beach.bin`, for the places OSM
 *      does not name as one thing: a bank of cranes, a tank farm, a downtown.
 *      Those are the largest cluster of asset vertices meeting a stated test
 *      (the storage-tank substance byte, port geometry above 50 m, urban
 *      massing above 60 m), so the anchor is literally the middle of what the
 *      camera will see.
 *
 * Every target then has its ground and its summit read back out of the asset,
 * which is what the framing distances are derived from.
 *
 * The cache is scratch and is not committed. `--gazetteer` regenerates
 * `scripts/venue-lens-targets.json` from it; the committed JSON is what a run
 * without the cache uses.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const DEG = Math.PI / 180;

/* The venue's frame, copied from the `VENUES` table and the `project()` in
 * scripts/layline-bake-venue.mjs. `assertBakerAgrees` below fails the
 * derivation if the baker's numbers ever move away from these. */
export const VENUE = {
  id: "long-beach",
  origin: { lat: 33.742, lon: -118.155 },
  bearing: 215,
  mPerLat: 110574,
};

/* The OSM elements the baker pins by id (its `heroes` table), and the oil-field
 * box it reads Signal Hill's derricks out of. Restated here rather than
 * imported because the baker is a script that runs its whole bake on import;
 * `assertBakerAgrees` holds the two copies together. */
const PINNED = {
  "island-freeman": { way: 40500950, note: "Freeman Island, GNIS 242469" },
  "island-white": { way: 40500920, note: "White Island, GNIS 1667935" },
  "island-chaffee": { way: 40500949, note: "Chaffee Island, GNIS 255464" },
  "island-grissom": { way: 40500921, note: "Grissom Island, GNIS 243043" },
  "queen-mary": { way: 438331516, note: "The Queen Mary, historic=ship" },
  gateway: { way: 1433959973, note: "Long Beach International Gateway, man_made=bridge" },
  dome: { way: 721199801, note: "Spruce Goose dome, outer way of OSM relation 6573072" },
};
const DERRICK_BOX = { south: 33.79, west: -118.19, north: 33.815, east: -118.145 };

export function frameOf(venue = VENUE) {
  const mPerLon = 111320 * Math.cos(venue.origin.lat * DEG);
  const cosB = Math.cos(venue.bearing * DEG);
  const sinB = Math.sin(venue.bearing * DEG);
  /* lat/lon -> course frame (x across, y up the course) -> world frame, which
   * is the course frame with z = -y: the same swap `vertex()` in the baker
   * applies when it writes a position, and the same one the camera rigs apply
   * when they read a boat's track. */
  return (lat, lon) => {
    const e = (lon - venue.origin.lon) * mPerLon;
    const n = (lat - venue.origin.lat) * venue.mPerLat;
    return { x: e * cosB - n * sinB, z: -(e * sinB + n * cosB) };
  };
}

/** Every element in the venue's Overpass cache, by `type:id`. */
function indexCache(cacheDir) {
  const idx = new Map();
  const files = readdirSync(cacheDir).filter((f) => f.startsWith("overpass") && f.endsWith(".json"));
  for (const file of files) {
    const body = JSON.parse(readFileSync(join(cacheDir, file), "utf8"));
    for (const element of body.elements) {
      const key = `${element.type}:${element.id}`;
      if (!idx.has(key)) idx.set(key, { element, file });
    }
  }
  return idx;
}

/**
 * Centre and reach of a way's own geometry, in world metres.
 *
 * A closed ring is centred on its area centroid, an open way on the mean of its
 * vertices. The difference is not academic: the THUMS island rings carry their
 * detail unevenly, and on Freeman the vertex mean lands 65.6 m from the area
 * centroid, which is a third of that target's closest framing distance. Ways
 * that are lines rather than rings (the bridge, the breakwater) have no
 * interior, so the mean is all there is; the caller overrides the breakwater
 * anyway, because the mean of an 11 km mole's two ends is water.
 */
function wayShape(way, toWorld) {
  const points = way.geometry.filter((p) => p !== null && p !== undefined);
  const closed =
    points.length > 3 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lon === points[points.length - 1].lon;
  const count = points.length - (closed ? 1 : 0);
  const world = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i < count; i++) {
    const p = toWorld(points[i].lat, points[i].lon);
    world.push(p);
    x += p.x;
    z += p.z;
  }
  x /= count;
  z /= count;
  let how = "mean of the way's vertices";
  if (closed) {
    let twiceArea = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < count; i++) {
      const p = world[i];
      const q = world[(i + 1) % count];
      const cross = p.x * q.z - q.x * p.z;
      twiceArea += cross;
      cx += (p.x + q.x) * cross;
      cz += (p.z + q.z) * cross;
    }
    /* A degenerate ring (zero signed area) has no centroid; the mean stands. */
    if (Math.abs(twiceArea) > 1) {
      x = cx / (3 * twiceArea);
      z = cz / (3 * twiceArea);
      how = "area centroid of the closed ring";
    }
  }
  let radius = 0;
  for (const p of world) radius = Math.max(radius, Math.hypot(p.x - x, p.z - z));
  return { x, z, radius, points: world, how };
}

/* ------------------------------------------------------------------ asset */

/** Layer positions and substance bytes, straight out of the shipped container. */
export function readAssetLayers(binPath) {
  let bytes = readFileSync(binPath);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x334e564c) throw new Error(`${binPath} is not an LVN3 container`);
  const layerCount = view.getUint32(4, true);
  const bodyOffset = view.getUint32(12, true);
  const layers = [];
  for (let i = 0; i < layerCount; i++) {
    const rec = 16 + i * 24;
    const classId = view.getUint16(rec, true);
    const attrMask = view.getUint8(rec + 4);
    const yUnit = view.getUint8(rec + 5);
    const vertCount = view.getUint32(rec + 8, true);
    let at = bodyOffset + view.getUint32(rec + 16, true);
    const pos = new Float64Array(vertCount * 3);
    for (let v = 0; v < vertCount; v++) {
      pos[v * 3] = view.getInt16(at, true);
      pos[v * 3 + 1] = view.getInt16(at + 2, true) / yUnit;
      pos[v * 3 + 2] = view.getInt16(at + 4, true);
      at += 6;
    }
    /* channel order is the container's: fade, shade, dist, base, mat */
    let chan = at;
    if (attrMask & 1) chan += vertCount;
    if (attrMask & 2) chan += vertCount;
    if (attrMask & 4) chan += vertCount * 2;
    if (attrMask & 8) chan += vertCount;
    const mats =
      attrMask & 16 ? new Uint8Array(bytes.buffer, bytes.byteOffset + chan, vertCount) : null;
    layers.push({ classId, vertCount, pos, mats });
  }
  return layers;
}

/* Flood fill over a square grid. A cluster is whatever survives being poured
 * into `cell`-metre bins that touch, which is the cheapest test that answers
 * "these cranes are one bank and those are the next terminal along". */
function clusters(points, cell) {
  const bins = new Map();
  for (const p of points) {
    const key = `${Math.round(p[0] / cell)},${Math.round(p[2] / cell)}`;
    let bin = bins.get(key);
    if (bin === undefined) bins.set(key, (bin = []));
    bin.push(p);
  }
  const seen = new Set();
  const found = [];
  for (const key of bins.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const stack = [key];
    const members = [];
    while (stack.length > 0) {
      const at = stack.pop();
      members.push(...bins.get(at));
      const [i, j] = at.split(",").map(Number);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const near = `${i + di},${j + dj}`;
          if (bins.has(near) && !seen.has(near)) {
            seen.add(near);
            stack.push(near);
          }
        }
      }
    }
    found.push(members);
  }
  found.sort((a, b) => b.length - a.length);
  return found;
}

function shapeOf(members) {
  let x = 0;
  let z = 0;
  for (const p of members) {
    x += p[0];
    z += p[2];
  }
  x /= members.length;
  z /= members.length;
  let radius = 0;
  for (const p of members) radius = Math.max(radius, Math.hypot(p[0] - x, p[2] - z));
  return { x, z, radius, count: members.length };
}

function pointsOf(layer, keep) {
  const out = [];
  for (let v = 0; v < layer.vertCount; v++) {
    const p = [layer.pos[v * 3], layer.pos[v * 3 + 1], layer.pos[v * 3 + 2]];
    if (keep(p, v)) out.push(p);
  }
  return out;
}

/* What the asset actually stands at this anchor: the lowest and highest vertex
 * of real geometry (every layer bar the horizon curtain, which is a shell on
 * the eye and not a place) inside the target's own reach. */
function reliefAt(layers, x, z, radius) {
  let low = Infinity;
  let high = -Infinity;
  let count = 0;
  for (const layer of layers) {
    if (layer.classId === 5) continue;
    for (let v = 0; v < layer.vertCount; v++) {
      const dx = layer.pos[v * 3] - x;
      const dz = layer.pos[v * 3 + 2] - z;
      if (dx * dx + dz * dz > radius * radius) continue;
      const y = layer.pos[v * 3 + 1];
      if (y < low) low = y;
      if (y > high) high = y;
      count += 1;
    }
  }
  if (count === 0) return { ground: 0, top: 0, vertices: 0 };
  return { ground: round1(low), top: round1(high), vertices: count };
}

const round1 = (v) => Math.round(v * 10) / 10;

/* The three ranges a target is photographed from unless the caller says
 * otherwise. Tied to the target's own reach rather than fixed, because the same
 * three metres that frame the dome would be standing inside Signal Hill: the
 * near one is close enough that the feature overflows the frame and its surface
 * is the subject, the middle one holds the whole thing, the far one puts it in
 * its setting. Floors stop a small feature asking for a range the near plane
 * would clip. */
export function defaultDistances(radius) {
  const step = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), hi) / 5) * 5;
  return [step(radius * 0.45, 40, 220), step(radius * 1.1, 90, 500), step(radius * 2.6, 200, 1200)];
}

/**
 * Build the gazetteer from the cache and the shipped asset.
 * Throws with a plain message if the Overpass cache is not on this machine.
 */
export function deriveGazetteer(root) {
  const cacheDir = join(root, ".tmp", "venue-cache");
  if (!existsSync(cacheDir)) {
    throw new Error(
      `no Overpass cache at ${cacheDir}: run scripts/layline-bake-venue.mjs long-beach once, or use the committed scripts/venue-lens-targets.json`,
    );
  }
  assertBakerAgrees(root);
  const toWorld = frameOf();
  const idx = indexCache(cacheDir);
  const layers = readAssetLayers(
    join(root, "public", "prototype", "layline", "venues", `${VENUE.id}.bin`),
  );
  const targets = [];

  const add = (name, shape, derivedFrom) => {
    const relief = reliefAt(layers, shape.x, shape.z, Math.max(shape.radius, 60));
    targets.push({
      name,
      x: Math.round(shape.x),
      z: Math.round(shape.z),
      radius: Math.round(shape.radius),
      ground: relief.ground,
      top: relief.top,
      /* What the camera aims at: a third of the way up the thing, so a tower
       * stands in the top of the frame and its footing is still in it. */
      aimY: round1(relief.ground + (relief.top - relief.ground) * 0.35),
      range: Math.round(Math.hypot(shape.x, shape.z)),
      assetVertices: relief.vertices,
      dists: defaultDistances(shape.radius),
      derivedFrom,
    });
  };

  for (const [name, pin] of Object.entries(PINNED)) {
    const hit = idx.get(`way:${pin.way}`);
    if (hit === undefined) throw new Error(`${name}: OSM way ${pin.way} is not in the cache`);
    const shape = wayShape(hit.element, toWorld);
    add(name, shape, `OSM way ${pin.way} (${pin.note}), ${shape.how}; cache ${hit.file}`);
  }

  /* The breakwater: the longest `man_made=breakwater` way in the cache, aimed
   * at its own middle vertex rather than its mean, because a 11 km mole bends
   * and the mean of its ends is water. */
  let longest = null;
  for (const { element } of idx.values()) {
    if (element.type !== "way" || element.tags?.man_made !== "breakwater") continue;
    if (!Array.isArray(element.geometry)) continue;
    const shape = wayShape(element, toWorld);
    let length = 0;
    for (let i = 1; i < shape.points.length; i++) {
      length += Math.hypot(
        shape.points[i].x - shape.points[i - 1].x,
        shape.points[i].z - shape.points[i - 1].z,
      );
    }
    if (longest === null || length > longest.length) longest = { element, shape, length };
  }
  if (longest === null) throw new Error("no man_made=breakwater way in the cache");
  {
    const mid = longest.shape.points[Math.floor(longest.shape.points.length / 2)];
    add(
      "breakwater",
      { x: mid.x, z: mid.z, radius: 320 },
      `OSM way ${longest.element.id} (${longest.element.tags.name ?? "breakwater"}), longest man_made=breakwater in the cache at ${Math.round(longest.length)} m, aimed at its middle vertex; reach stated at 320 m because a mole has no radius`,
    );
  }

  const port = layers.find((l) => l.classId === 3);
  const massing = layers.find((l) => l.classId === 2);
  const heroes = layers.find((l) => l.classId === 4);
  if (port === undefined || massing === undefined || heroes === undefined) {
    throw new Error("the asset is missing its port, massing or hero layer");
  }

  /* Signal Hill: the derricks themselves, not the middle of the box they were
   * scattered in. The box is 5 km by 4.6 km and its centre is bare hillside;
   * anchoring the target there put every shot on empty terrain with the
   * derricks a kilometre off frame, which is how this one was caught. The
   * hero geometry inside the box is exactly what the baker put there, so its
   * own centroid and extent are the target. */
  {
    const corners = [
      toWorld(DERRICK_BOX.south, DERRICK_BOX.west),
      toWorld(DERRICK_BOX.south, DERRICK_BOX.east),
      toWorld(DERRICK_BOX.north, DERRICK_BOX.west),
      toWorld(DERRICK_BOX.north, DERRICK_BOX.east),
    ];
    const lowX = Math.min(...corners.map((p) => p.x));
    const highX = Math.max(...corners.map((p) => p.x));
    const lowZ = Math.min(...corners.map((p) => p.z));
    const highZ = Math.max(...corners.map((p) => p.z));
    const derricks = pointsOf(
      heroes,
      (p) => p[0] >= lowX && p[0] <= highX && p[2] >= lowZ && p[2] <= highZ,
    );
    if (derricks.length === 0) throw new Error("no hero geometry inside the baker's derrickBox");
    add(
      "signal-hill",
      shapeOf(derricks),
      `centroid and extent of the ${derricks.length} L4 hero vertices inside the baker's derrickBox (33.790..33.815 N, -118.190..-118.145 E), which is where it scatters the oil-field derricks`,
    );
  }
  /* The three places OSM has no single name for. Each is the largest cluster of
   * asset vertices meeting one test, so the anchor is the middle of exactly
   * what the lens will photograph. */
  const pick = (name, points, cell, test) => {
    const found = clusters(points, cell);
    if (found.length === 0) throw new Error(`${name}: no vertices matched ${test}`);
    const runnerUp = found[1] === undefined ? 0 : found[1].length;
    add(
      name,
      shapeOf(found[0]),
      `largest cluster of ${test} at ${cell} m bins: ${found[0].length} vertices, next largest ${runnerUp}`,
    );
  };
  pick(
    "tank-farm",
    pointsOf(port, (_p, v) => port.mats !== null && port.mats[v] === 6),
    120,
    "L3 vertices carrying the storage-tank substance byte (MAT_TANK = 6)",
  );
  pick(
    "crane-bank",
    pointsOf(port, (p) => p[1] > 50),
    150,
    "L3 vertices above 50 m, which on this layer is gantry crane and nothing else",
  );
  pick(
    "downtown",
    pointsOf(massing, (p) => p[1] > 60),
    250,
    "L2 vertices above 60 m, the urban massing tall enough to be a tower",
  );

  targets.sort((a, b) => a.name.localeCompare(b.name));
  return {
    venue: VENUE.id,
    origin: VENUE.origin,
    bearing: VENUE.bearing,
    frame: "world: x across the course, z = -(up the course), y up. Same frame the asset ships in.",
    derivedAt: new Date().toISOString().slice(0, 10),
    targets,
  };
}

/* The two facts this file copies out of the baker. If either moves, every
 * anchor below it is wrong by exactly the amount nobody would notice, so the
 * derivation refuses to run rather than write a plausible lie. */
function assertBakerAgrees(root) {
  const baker = readFileSync(join(root, "scripts", "layline-bake-venue.mjs"), "utf8");
  const problems = [];
  if (!baker.includes(`origin: { lat: ${VENUE.origin.lat}, lon: ${VENUE.origin.lon} }`)) {
    problems.push("the baker's origin is no longer 33.742 / -118.155");
  }
  if (!baker.includes(`bearing: ${VENUE.bearing},`)) {
    problems.push(`the baker's course bearing is no longer ${VENUE.bearing}`);
  }
  for (const [name, pin] of Object.entries(PINNED)) {
    if (!baker.includes(String(pin.way))) problems.push(`${name}: the baker no longer pins ${pin.way}`);
  }
  if (!baker.includes(`south: ${DERRICK_BOX.south}, west: ${DERRICK_BOX.west}`)) {
    problems.push("the baker's derrickBox has moved");
  }
  if (problems.length > 0) {
    throw new Error(`gazetteer is out of step with the baker:\n  ${problems.join("\n  ")}`);
  }
}

export function loadGazetteer(root) {
  const path = join(root, "scripts", "venue-lens-targets.json");
  if (!existsSync(path)) {
    throw new Error(`no gazetteer at ${path}: run "node scripts/venue-lens.mjs --gazetteer" first`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
