/**
 * Cache-first fetch with a provenance log, for the venue bake's remote inputs.
 *
 * The rule the baker already follows for Overpass and Terrarium, applied to the
 * two new sources: a file that exists on disk is never refetched, and every
 * response that does come off the network gets its sha256, byte count, exact
 * URL and retrieval date appended to a manifest. A bake then reproduces from
 * the cache with the network unplugged, and every number in a derived product
 * traces back to bytes somebody can re-hash.
 *
 * Layout under .tmp/venue-cache/ (gitignored; only the derived products are
 * committed):
 *
 *   lidar/<collection>/ept.json
 *   lidar/<collection>/hierarchy-<key>.json
 *   lidar/<collection>/node-<key>.laz
 *   naip/<quad>-<size>-<bboxHash>.png
 *   provenance/lidar-naip.tsv
 *
 * One manifest file, spelled one way. Windows filesystems are case-insensitive,
 * so `MANIFEST.tsv` and `manifest.tsv` are the same file: during the research
 * round a second spelling silently overwrote the first and ate a fetch log.
 * Nothing here writes any other casing of this name.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export const CACHE_ROOT = ".tmp/venue-cache";
const MANIFEST = join(CACHE_ROOT, "provenance", "lidar-naip.tsv");
const MANIFEST_HEADER = "sha256\tbytes\tfile\turl\tretrieved\n";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** ISO date, and the only place in this pipeline a clock is read. Retrieval
 * dates reach the derived products through the manifest, never through a
 * `Date.now()` at derivation time, so a re-derivation cannot change them. */
const today = () => new Date().toISOString().slice(0, 10);

function readManifest() {
  const rows = new Map();
  if (!existsSync(MANIFEST)) return rows;
  for (const line of readFileSync(MANIFEST, "utf8").split("\n").slice(1)) {
    if (!line) continue;
    const f = line.split("\t");
    if (f.length < 5) continue;
    rows.set(f[2], { sha256: f[0], bytes: Number(f[1]), file: f[2], url: f[3], retrieved: f[4] });
  }
  return rows;
}

let manifest = null;
const manifestRows = () => (manifest ??= readManifest());

function appendManifest(row) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  if (!existsSync(MANIFEST)) writeFileSync(MANIFEST, MANIFEST_HEADER);
  appendFileSync(MANIFEST, `${row.sha256}\t${row.bytes}\t${row.file}\t${row.url}\t${row.retrieved}\n`);
  manifestRows().set(row.file, row);
}

/** The manifest row for a cached file, or null. */
export function provenanceOf(rel) {
  return manifestRows().get(rel) ?? null;
}

/** Every manifest row, in the order the files were first written. */
export function allProvenance() {
  return [...manifestRows().values()];
}

/**
 * Fetch `url` unless `rel` is already cached, and return its bytes.
 *
 * `retries` exists for the National Map ImageServer, which returns transient
 * 502s under load on URLs that are otherwise known good; S3 is served the same
 * way for uniformity. `verify` is given the buffer before it is written and
 * must throw to reject a response: NAIP answers a lock-to-a-quad-that-does-not-
 * cover-the-box request with an all-white PNG and HTTP 200, so "the request
 * succeeded" is not the same as "the bytes are usable", and a bad body must
 * never reach the cache.
 */
export async function cachedFetch(url, rel, { retries = 5, verify = null, label = null } = {}) {
  const path = join(CACHE_ROOT, rel);
  if (existsSync(path)) {
    const buf = readFileSync(path);
    if (!provenanceOf(rel)) {
      /* On disk but not in the log: record it now so the product's provenance
       * is complete. The retrieval date falls back to the file's own mtime,
       * which is the best evidence left of when this machine got the bytes. */
      appendManifest({
        sha256: sha256(buf),
        bytes: buf.length,
        file: rel,
        url,
        retrieved: statSync(path).mtime.toISOString().slice(0, 10),
      });
    }
    return buf;
  }

  let res = null;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      res = await fetch(url, { headers: { "User-Agent": "layline-venue-bake/1" } });
    } catch (error) {
      lastError = error;
      continue;
    }
    if (res.ok) break;
    lastError = new Error(`${res.status} ${res.statusText}`);
    res = null;
  }
  if (!res) throw new Error(`${label ?? rel}: ${lastError?.message ?? "no response"} for ${url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (verify) verify(buf);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  appendManifest({ sha256: sha256(buf), bytes: buf.length, file: rel, url, retrieved: today() });
  return buf;
}

/** Cached bytes for a file the baker fetched, with a provenance row built from
 * the file itself. Used for the Overpass responses this pipeline reads but does
 * not own; `note` records which of the baker's queries produced it. */
export function readBakerCache(rel, note) {
  const path = join(CACHE_ROOT, rel);
  if (!existsSync(path)) {
    throw new Error(`${rel} is not in ${CACHE_ROOT}; run node scripts/layline-bake-venue.mjs first`);
  }
  const buf = readFileSync(path);
  const logged = provenanceOf(rel);
  return {
    buf,
    provenance: {
      file: rel,
      sha256: sha256(buf),
      bytes: buf.length,
      query: note,
      retrieved: logged?.retrieved ?? statSync(path).mtime.toISOString().slice(0, 10),
    },
  };
}
