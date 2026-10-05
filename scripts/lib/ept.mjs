/**
 * Entwine Point Tile reader for the venue bake: hierarchy walk over a box,
 * cache-first node fetch, decode, and conversion into the baker's course frame.
 *
 * EPT stores a subsample of the cloud at every octree level, so full resolution
 * over a region is the union of the deepest nodes AND every ancestor clipped to
 * the region, not the leaves alone. `nodesInBox` collects that union.
 *
 * Coverage is the hierarchy, not the bounding box. `boundsConforming` on a
 * terrestrial collection routinely covers water it holds no points for, which
 * matters here because the THUMS islands sit 1.5-5 km offshore: only walking
 * the octree to the leaf says whether a point has data.
 *
 * Everything this returns is in the course frame (metres, +y up the course
 * axis) with z left exactly as the file carries it, which for the 3DEP LA
 * collections is NAVD88 orthometric metres on the Geoid18 model.
 */
import { cachedFetch, provenanceOf, sha256 } from "./venue-cache.mjs";
import { decodeLaz } from "./laz.mjs";
import { mercatorEnvelopeOfCourseBox } from "./geo.mjs";

/** Bounds of an octree node key `<depth>-<x>-<y>-<z>`, in the collection SRS. */
export function keyBounds(ept, key) {
  const [d, ix, iy, iz] = key.split("-").map(Number);
  const [minx, miny, minz] = ept.bounds;
  const step = (ept.bounds[3] - minx) / 2 ** d;
  return [
    minx + ix * step,
    miny + iy * step,
    minz + iz * step,
    minx + (ix + 1) * step,
    miny + (iy + 1) * step,
    minz + (iz + 1) * step,
  ];
}

/** Numeric key order, so a node list never depends on traversal accidents. */
export function compareKeys(a, b) {
  const ka = a.split("-").map(Number);
  const kb = b.split("-").map(Number);
  for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

/** A reader bound to one collection on one EPT endpoint. */
export async function openCollection({ endpoint, collection }) {
  const base = `${endpoint.replace(/\/+$/, "")}/${collection}`;
  const dir = `lidar/${collection}`;
  const eptBuf = await cachedFetch(`${base}/ept.json`, `${dir}/ept.json`, {
    label: `${collection} ept.json`,
  });
  const ept = JSON.parse(eptBuf.toString("utf8"));
  const pages = new Map();
  /* The hierarchy pages decide which nodes get read, so they are as much an
   * input to a derived product as the point data is. They are recorded here
   * rather than left out because a page fetched at a different time could
   * select a different node set from the same bytes elsewhere. */
  const hierarchyInputs = [];

  const loadPage = async (key) => {
    let page = pages.get(key);
    if (page) return page;
    const rel = `${dir}/hierarchy-${key}.json`;
    const url = `${base}/ept-hierarchy/${key}.json`;
    const buf = await cachedFetch(url, rel, { label: `${collection} hierarchy ${key}` });
    hierarchyInputs.push({
      file: rel,
      sha256: sha256(buf),
      bytes: buf.length,
      query: url,
      retrieved: provenanceOf(rel)?.retrieved ?? null,
    });
    page = JSON.parse(buf.toString("utf8"));
    pages.set(key, page);
    return page;
  };

  /** Every node key whose horizontal footprint meets [minx, miny, maxx, maxy],
   * down to `maxDepth`. Ancestors are kept: their points are part of the full
   * resolution set, not a coarse preview of it. */
  const nodesInBox = async (box, maxDepth) => {
    const found = [];
    const visit = async (key, parentPage) => {
      let page = parentPage;
      let count = page[key];
      if (count === undefined) return;
      if (count === -1) {
        page = await loadPage(key);
        count = page[key];
      }
      if (!count) return;
      const b = keyBounds(ept, key);
      if (b[3] < box[0] || b[0] > box[2] || b[4] < box[1] || b[1] > box[3]) return;
      found.push({ key, count });
      const depth = Number(key.split("-", 1)[0]);
      if (depth >= maxDepth) return;
      const [, ix, iy, iz] = key.split("-").map(Number);
      for (let cx = 0; cx < 2; cx++) {
        for (let cy = 0; cy < 2; cy++) {
          for (let cz = 0; cz < 2; cz++) {
            await visit(`${depth + 1}-${ix * 2 + cx}-${iy * 2 + cy}-${iz * 2 + cz}`, page);
          }
        }
      }
    };
    await visit("0-0-0-0", await loadPage("0-0-0-0"));
    found.sort((a, b) => compareKeys(a.key, b.key));
    return found;
  };

  const fetchNode = (key) =>
    cachedFetch(`${base}/ept-data/${key}.laz`, `${dir}/node-${key}.laz`, {
      label: `${collection} node ${key}`,
    });

  return {
    collection,
    base,
    dir,
    ept,
    eptProvenance: {
      file: `${dir}/ept.json`,
      sha256: sha256(eptBuf),
      bytes: eptBuf.length,
      query: `${base}/ept.json`,
      retrieved: provenanceOf(`${dir}/ept.json`)?.retrieved ?? null,
    },
    hierarchyInputs,
    loadPage,
    nodesInBox,
    fetchNode,
  };
}

/** Growable parallel columns; cheaper and far smaller than an array of tuples
 * when a 600 m box holds four million points. */
class PointColumns {
  constructor(capacity = 1 << 16) {
    this.n = 0;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.c = new Uint8Array(capacity);
  }
  grow() {
    const size = this.x.length * 2;
    for (const name of ["x", "y", "z", "c"]) {
      const next = new this[name].constructor(size);
      next.set(this[name]);
      this[name] = next;
    }
  }
  push(x, y, z, c) {
    if (this.n === this.x.length) this.grow();
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.c[i] = c;
  }
  trim() {
    return {
      n: this.n,
      x: this.x.subarray(0, this.n),
      y: this.y.subarray(0, this.n),
      z: this.z.subarray(0, this.n),
      c: this.c.subarray(0, this.n),
    };
  }
}

/**
 * Collect every point inside a course-frame axis-aligned box.
 *
 * The box is defined in the course frame, so the octree query has to run over
 * the mercator envelope that encloses it (the two frames are 215 degrees apart
 * here) and the per-point test happens after the conversion back.
 *
 * Returns { points, nodes, bytes, gpsRange, inputs }, where `inputs` is the
 * provenance row per fetched node, ordered by key.
 */
export async function collectCourseBox(reader, frame, courseBox, maxDepth) {
  const envelope = mercatorEnvelopeOfCourseBox(frame, courseBox, 2);
  const nodes = await reader.nodesInBox(envelope, maxDepth);
  const columns = new PointColumns();
  const inputs = [];
  let bytes = 0;
  let gpsMin = Infinity;
  let gpsMax = -Infinity;

  for (const node of nodes) {
    const buf = await reader.fetchNode(node.key);
    const rel = `${reader.dir}/node-${node.key}.laz`;
    bytes += buf.length;
    inputs.push({
      file: rel,
      sha256: sha256(buf),
      bytes: buf.length,
      query: `${reader.base}/ept-data/${node.key}.laz`,
      retrieved: provenanceOf(rel)?.retrieved ?? null,
    });
    const decoded = await decodeLaz(buf);
    for (let i = 0; i < decoded.count; i++) {
      const p = frame.projectMercator(decoded.x[i], decoded.y[i]);
      if (p.x < courseBox.x0 || p.x > courseBox.x1 || p.y < courseBox.y0 || p.y > courseBox.y1) {
        continue;
      }
      columns.push(p.x, p.y, decoded.z[i], decoded.classification[i]);
      if (decoded.gpsTime) {
        const t = decoded.gpsTime[i];
        if (t < gpsMin) gpsMin = t;
        if (t > gpsMax) gpsMax = t;
      }
    }
  }

  return {
    points: columns.trim(),
    nodes,
    bytes,
    envelope,
    gpsRange: gpsMin === Infinity ? null : [gpsMin, gpsMax],
    inputs,
  };
}
