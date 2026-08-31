/* The autogen venue's paths, its manifest shape and the manifest reader, split
 * from `VenueAutogen.tsx` so `LaylineScene` can name the mode without pulling
 * three's GLTF, Draco and KTX2 loaders into the page bundle. Nothing here
 * imports anything: it runs under node and its rules are held to a test rather
 * than to a screenshot, the same way `inspect.ts` is.
 *
 * The format itself is fixed by `.tmp/autogen-prod/contract.md`: a Draco-
 * compressed .glb next to a JSON manifest, both under
 * `public/prototype/layline/venues/`, decoders vendored locally. The shipped
 * textures are JPEG/PNG (no KTX2 encoder exists on the bake machine); the
 * KTX2 loader stays wired so a later ETC1S/UASTC rebake needs no code change. */

/** The asset the `?venue=autogen` mode draws, and the manifest beside it. */
export const AUTOGEN_ASSET = "/prototype/layline/venues/long-beach-autogen.glb";
export const AUTOGEN_MANIFEST = "/prototype/layline/venues/long-beach-autogen.json";

/* Decoder binaries, vendored out of `node_modules/three/examples/jsm/libs/`
 * (draco/gltf and basis) by hand and pinned to the installed three by
 * `tests/layline-venue-autogen.test.mjs`, which compares the served bytes with
 * the ones in node_modules. No CDN: a third-party origin on this page would be
 * a request the visitor did not ask for and a decoder nobody in this repo has
 * hashed.
 *
 * Both paths end in a slash because three's loaders concatenate a filename onto
 * them without inserting one. */
export const DRACO_DECODER_PATH = "/prototype/layline/decoders/draco/";
export const BASIS_TRANSCODER_PATH = "/prototype/layline/decoders/basis/";

/** Files the vendoring has to keep in step with the installed three. The test
 * reads this list rather than a hand-kept copy of it. */
export const VENDORED_DECODERS = [
  { served: "draco/draco_decoder.js", source: "draco/gltf/draco_decoder.js" },
  { served: "draco/draco_decoder.wasm", source: "draco/gltf/draco_decoder.wasm" },
  { served: "draco/draco_wasm_wrapper.js", source: "draco/gltf/draco_wasm_wrapper.js" },
  { served: "basis/basis_transcoder.js", source: "basis/basis_transcoder.js" },
  { served: "basis/basis_transcoder.wasm", source: "basis/basis_transcoder.wasm" },
] as const;

/**
 * What the bake writes beside the .glb.
 *
 * The manifest is the only thing that says which top-level nodes the asset
 * carries; the contract leaves that set to the bake lane. The runtime therefore
 * reads the node list from here rather than guessing at names, and a node in the
 * file that the manifest does not list is drawn but not maskable (see
 * `layerClassOf` below).
 */
export interface AutogenManifest {
  /* Where the asset's origin sits on earth, and what its y = 0 means.
   *
   * lat/lon are the course anchor and must be the race's own (the contract
   * forbids inventing a new one); the runtime refuses a mesh whose anchor has
   * drifted, because a silently misplaced coast is worse than no coast.
   *
   * `yDatum` is the height in metres, in the asset's own vertex units, that the
   * course frame calls y = 0, i.e. sea level. The runtime lifts the whole asset
   * by `-yDatum` so the two sea levels coincide. A bake that already writes
   * course-frame vertices says 0 and the offset is a no-op. */
  origin: { lat: number; lon: number; yDatum: number };
  extentM: number;
  nodes: readonly string[];
  stats: {
    bytes: number;
    triangles: number;
    textureBytes: number;
    drawCalls: number;
  };
  sha256: string;
  sources: Record<string, string>;
  bake: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read a manifest, or say why it is not one.
 *
 * Strict about the four fields the runtime actually uses (origin, extent, the
 * node list, and the byte stats a capture reports) and incurious about the rest:
 * `sources` and `bake` are provenance the bake lane owns and this code only
 * carries through to `__laylineAutogen.info()`. A manifest that fails here is a
 * failed venue, not a silently half-placed one, because the anchor is the whole
 * reason the mesh lands where the course is.
 */
export function parseAutogenManifest(value: unknown): AutogenManifest {
  if (!isRecord(value)) throw new Error("autogen manifest is not an object");
  const origin = value.origin;
  if (!isRecord(origin)) throw new Error("autogen manifest has no origin");
  const lat = num(origin.lat);
  const lon = num(origin.lon);
  /* yDatum is what y = 0 means in metres; an asset that does not say cannot be
   * placed against the course's own sea level. */
  const yDatum = num(origin.yDatum);
  if (lat === null || lon === null || yDatum === null) {
    throw new Error("autogen manifest origin needs finite lat, lon and yDatum");
  }
  const extentM = num(value.extentM);
  if (extentM === null || extentM <= 0) {
    throw new Error("autogen manifest needs a positive extentM");
  }
  const nodes = value.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0 || !nodes.every((n) => typeof n === "string")) {
    throw new Error("autogen manifest needs a non-empty list of node names");
  }
  const stats = isRecord(value.stats) ? value.stats : {};
  const sha256 = typeof value.sha256 === "string" ? value.sha256 : "";
  return {
    origin: { lat, lon, yDatum },
    extentM,
    nodes: [...(nodes as string[])],
    stats: {
      bytes: num(stats.bytes) ?? 0,
      triangles: num(stats.triangles) ?? 0,
      textureBytes: num(stats.textureBytes) ?? 0,
      drawCalls: num(stats.drawCalls) ?? 0,
    },
    sha256,
    sources: isRecord(value.sources) ? (value.sources as Record<string, string>) : {},
    bake: isRecord(value.bake) ? value.bake : {},
  };
}

/**
 * The class id the inspection mask reaches a node's mesh by.
 *
 * `__layline.show({venueLayers: [...]})` matches `venue-layer-<id>` and the
 * baked LVN asset numbers those from its own layer table. The autogen asset has
 * no layer table, so the manifest's node ORDER is the table: the first listed
 * node is class 1, the second class 2, and so on. Stated here rather than
 * inside the component so a capture script can compute the same mapping from
 * the manifest alone; `__laylineAutogen.info().layers` echoes it back.
 *
 * A node in the file the manifest never listed gets 0, which the mask reads as
 * a class no `venueLayers` list can name: it draws, and `{all: false}` hides it
 * along with everything else, but it cannot be singled out. That is the honest
 * answer for geometry the manifest did not declare.
 */
export function layerClassOf(manifest: AutogenManifest, nodeName: string): number {
  const index = manifest.nodes.indexOf(nodeName);
  return index < 0 ? 0 : index + 1;
}

/* ---------------------------------------------------------------- disposal */

/**
 * What the disposal walk needs of a scene node. Three's `Object3D`, `Mesh`,
 * `BufferGeometry` and `Material` all satisfy these structurally, which is what
 * lets the release path be held to a test under node rather than to a
 * screenshot of a memory counter, the same trade `inspect.ts` makes.
 */
export interface DisposableResource {
  dispose: () => void;
}
export interface DisposableNode {
  children: DisposableNode[];
  geometry?: DisposableResource;
  material?: DisposableResource | DisposableResource[];
  clear?: () => void;
}

/* Every distinct texture a material holds, without naming the twelve slots
 * glTF can fill: three's materials carry their maps as own properties and
 * anything with an `isTexture` is one of them. */
function collectTextures(material: DisposableResource, into: Set<DisposableResource>): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (
      typeof value === "object" &&
      value !== null &&
      (value as { isTexture?: boolean }).isTexture === true
    ) {
      into.add(value as DisposableResource);
    }
  }
}

/**
 * Give back everything a load took: geometries, materials, and the textures
 * those materials hold.
 *
 * Not optional and not deferred. Textures are collected into a set before any
 * of them is disposed, because a KTX2 image is routinely shared by several
 * glTF materials and disposing one twice is a double free of a GPU handle
 * three has already forgotten about.
 *
 * Returns what it released, so a capture can compare the count with the
 * renderer's own.
 */
export function disposeScene(root: DisposableNode): {
  geometries: number;
  materials: number;
  textures: number;
} {
  const textures = new Set<DisposableResource>();
  let geometries = 0;
  let materials = 0;
  const walk = (node: DisposableNode): void => {
    if (node.geometry !== undefined) {
      node.geometry.dispose();
      geometries += 1;
    }
    const held = node.material;
    if (held !== undefined) {
      for (const material of Array.isArray(held) ? held : [held]) {
        collectTextures(material, textures);
        material.dispose();
        materials += 1;
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  for (const texture of textures) texture.dispose();
  /* The graph itself goes too: a detached primitive whose children still point
   * at disposed geometry is a trap for anything that walks the scene later. */
  root.clear?.();
  return { geometries, materials, textures: textures.size };
}

/* How far the manifest's anchor may sit from the race's own scenery origin
 * before the mesh is refused. The contract says the bake reuses the SAME anchor
 * the home-made asset uses, so this is a typo check, not a tolerance: 0.001
 * degrees is about 111 m of latitude, which is inside a single terrain quad and
 * far outside any rounding the manifest would carry. */
export const ANCHOR_EPSILON_DEG = 0.001;
