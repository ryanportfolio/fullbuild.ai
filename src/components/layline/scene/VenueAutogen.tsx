"use client";

/**
 * The machine-generated venue: a Draco-compressed glTF (textures JPEG/PNG
 * today; the KTX2 path stays wired for a later compressed rebake), baked
 * offline from LiDAR, imagery, footprints and OSM water, drawn in place of
 * the hand-baked LVN coast under `?venue=autogen`.
 *
 * This module is the only importer of three's GLTF, Draco and KTX2 loaders, so
 * it is loaded lazily by `LaylineScene` and its chunk is never fetched without
 * the parameter. Everything the scene needs to NAME the mode (paths, manifest
 * shape, the node-to-layer-class mapping) lives in `venue-autogen-config.ts`,
 * which imports nothing; that split is what keeps the default page byte for byte
 * what it was.
 *
 * Placement is identity on purpose. The contract fixes the asset's origin as the
 * same local anchor the hand-baked asset uses and its axes as the course frame's
 * own, so the only transform applied here is the manifest's `yDatum` lift, and
 * the anchor is checked against the race rather than trusted.
 *
 * The two asynchronous things in this mode, the manifest and the .glb, both go
 * through the render gate: a paused replay draws nothing on its own and a coast
 * that landed without `requestSceneFrame` would wait for the next interaction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { useReplay } from "../store";
import { requestSceneFrame } from "./gate";
import { VENUE_LAYER_PREFIX, setVenueDrawnForMask } from "./inspect";
import { FallbackShore } from "./VenueShore";
import {
  ANCHOR_EPSILON_DEG,
  AUTOGEN_ASSET,
  AUTOGEN_MANIFEST,
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  disposeScene,
  layerClassOf,
  parseAutogenManifest,
  type AutogenManifest,
} from "./venue-autogen-config";

/* Same notification the baked shore sends, and for the same reason: the
 * inspection mask defers venue-layer hiding until readiness has latched,
 * because an invisible mesh never fires `onAfterRender`. In production the mask
 * does not exist and these calls compile to nothing. */
function tellMaskVenueDrawn(drawnNow: boolean): void {
  if (
    process.env.NODE_ENV !== "production" &&
    setVenueDrawnForMask(drawnNow) &&
    drawnNow
  ) {
    requestSceneFrame();
  }
}

/** What the load produced, kept together so unmount can take it all down. */
interface AutogenScene {
  root: Group;
  manifest: AutogenManifest;
  /* One entry per top-level node the asset carries, in draw order. */
  layers: { name: string; classId: number; meshes: number; triangles: number }[];
  meshes: number;
  triangles: number;
}

/**
 * Name the top-level nodes so the inspection mask can reach them, and put them
 * in the manifest's order.
 *
 * The mask matches `venue-layer-<classId>` and stops walking at the first name
 * it owns, so the name goes on the top-level node rather than on each mesh: one
 * flag hides a whole semantic layer, exactly as it does over the baked asset.
 * The manifest's node order is the draw order (`renderOrder`), which is also
 * what makes "the last layer" a defined thing for a capture to wait on.
 */
function labelLayers(root: Group, manifest: AutogenManifest): AutogenScene["layers"] {
  const nodes = [...root.children];
  nodes.sort((a, b) => {
    const ai = manifest.nodes.indexOf(a.name);
    const bi = manifest.nodes.indexOf(b.name);
    /* A node the manifest never listed sorts last and keeps class 0: it draws,
     * but no `venueLayers` list can single it out. */
    return (ai < 0 ? manifest.nodes.length : ai) - (bi < 0 ? manifest.nodes.length : bi);
  });
  const layers: AutogenScene["layers"] = [];
  nodes.forEach((node, order) => {
    const classId = layerClassOf(manifest, node.name);
    let meshes = 0;
    let triangles = 0;
    node.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh !== true) return;
      meshes += 1;
      mesh.renderOrder = order;
      const index = mesh.geometry.getIndex();
      const position = mesh.geometry.getAttribute("position");
      const count = index?.count ?? position?.count ?? 0;
      triangles += Math.floor(count / 3);
    });
    layers.push({ name: node.name, classId, meshes, triangles });
    /* Named after the labelling walk, not before it: `traverse` above reads
     * child names and this one is the node's own. */
    if (classId > 0) node.name = `${VENUE_LAYER_PREFIX}${classId}`;
    node.userData.autogenNode = layers[layers.length - 1].name;
  });
  return layers;
}

declare global {
  interface Window {
    /* Dev-only readback, the counterpart of `__laylineTiles`: what loaded, how
     * big it was, and what the renderer is holding. Capture scripts read the
     * layer map out of here rather than recomputing it. */
    __laylineAutogen?: {
      info: () => {
        status: string;
        asset: string;
        manifest: AutogenManifest | null;
        layers: AutogenScene["layers"];
        meshes: number;
        triangles: number;
        memory: { geometries: number; textures: number };
        programs: number;
      };
    };
  }
}

export function VenueAutogen({ origin }: { origin: { lat: number; lon: number } }) {
  const gl = useThree((state) => state.gl);
  const [scene, setScene] = useState<AutogenScene | null>(null);
  const status = useReplay((state) => state.venueAsset);
  const inFrame = useReplay((state) => state.venueInFrame);
  /* One transition per load, and it belongs to the load that asked for it, the
   * same rule the baked shore keeps. */
  const drawn = useRef(false);

  const anchorLat = origin.lat;
  const anchorLon = origin.lon;

  useEffect(() => {
    const controller = new AbortController();
    let built: AutogenScene | null = null;
    drawn.current = false;
    tellMaskVenueDrawn(false);
    useReplay.getState().setVenueAsset("loading");

    /* Per-mount loaders, never module singletons. Both hold worker pools and a
     * WASM instance, and `detectSupport` writes renderer-specific state into the
     * KTX2 loader: a shared instance would carry a dead context's answer into the
     * next one. The cost is one decoder fetch per mount, which the HTTP cache
     * serves after the first. */
    const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
    const ktx2 = new KTX2Loader()
      .setTranscoderPath(BASIS_TRANSCODER_PATH)
      .detectSupport(gl);
    const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);

    (async () => {
      const manifestResponse = await fetch(AUTOGEN_MANIFEST, { signal: controller.signal });
      if (!manifestResponse.ok) {
        throw new Error(`manifest ${manifestResponse.status} ${manifestResponse.statusText}`);
      }
      const manifest = parseAutogenManifest(await manifestResponse.json());
      /* The anchor is the whole reason the mesh lands where the course is, and
       * the contract says the bake reuses the race's own. A drifted one is a
       * mis-bake, and drawing it would put a coast a hundred metres from where
       * the marks are and call it Long Beach. */
      if (
        Math.abs(manifest.origin.lat - anchorLat) > ANCHOR_EPSILON_DEG ||
        Math.abs(manifest.origin.lon - anchorLon) > ANCHOR_EPSILON_DEG
      ) {
        throw new Error(
          `autogen manifest anchor ${manifest.origin.lat},${manifest.origin.lon} is not this race's ${anchorLat},${anchorLon}`,
        );
      }

      const assetResponse = await fetch(AUTOGEN_ASSET, { signal: controller.signal });
      if (!assetResponse.ok) {
        throw new Error(`${assetResponse.status} ${assetResponse.statusText}`);
      }
      const buffer = await assetResponse.arrayBuffer();
      if (controller.signal.aborted) return;

      /* One mark pair per load, read back by the audit battery, matching the
       * baked asset's `layline-venue-parse`. The Draco transcode and the KTX2
       * upload are both inside it, which is the number this mode is judged on. */
      performance.mark("layline-autogen-parse-start");
      const gltf = await loader.parseAsync(buffer, "");
      performance.mark("layline-autogen-parse-end");
      performance.measure(
        "layline-autogen-parse",
        "layline-autogen-parse-start",
        "layline-autogen-parse-end",
      );
      /* The parse can outlive the mount that asked for it, and by here it has
       * already allocated GPU-backed geometry: aborting is not enough, the
       * result has to be given back. */
      if (controller.signal.aborted) {
        disposeScene(gltf.scene);
        return;
      }

      const root = gltf.scene;
      /* Sea levels made to coincide; see `yDatum` in venue-autogen-config. */
      root.position.set(0, -manifest.origin.yDatum, 0);
      const layers = labelLayers(root, manifest);
      let meshes = 0;
      let triangles = 0;
      for (const layer of layers) {
        meshes += layer.meshes;
        triangles += layer.triangles;
      }
      built = { root, manifest, layers, meshes, triangles };
      setScene(built);
      requestSceneFrame();
    })().catch((error) => {
      /* An abort is this component's own cleanup, not a failure. */
      if (controller.signal.aborted) return;
      console.warn("autogen venue failed to load", error);
      useReplay.getState().setVenueAsset("failed");
      /* A paused replay draws nothing on its own; without this the fallback arc
       * would wait for the next interaction while ready stayed down. */
      requestSceneFrame();
    });

    return () => {
      controller.abort();
      if (built !== null) disposeScene(built.root);
      /* The loaders own worker pools and a WASM heap apiece; dropping the
       * reference without this leaves both running for the life of the page. */
      draco.dispose();
      ktx2.dispose();
      setScene(null);
      useReplay.getState().setVenueAsset("absent");
      tellMaskVenueDrawn(false);
    };
  }, [gl, anchorLat, anchorLon]);

  /* Dev-only readback door. Outside development this whole block is a constant
   * false and the minifier drops it, the same way the inspection bridge goes. */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__laylineAutogen = {
      info: () => ({
        status: useReplay.getState().venueAsset,
        asset: AUTOGEN_ASSET,
        manifest: scene?.manifest ?? null,
        layers: scene?.layers ?? [],
        meshes: scene?.meshes ?? 0,
        triangles: scene?.triangles ?? 0,
        memory: { ...gl.info.memory },
        programs: gl.info.programs?.length ?? 0,
      }),
    };
    return () => {
      delete window.__laylineAutogen;
    };
  }, [scene, gl]);

  /* The meshes can (re)mount on a frozen page: the capture lens forces
   * `venueInFrame` true DURING a drawn frame, React commits the remount after
   * that frame, and a `never` frameloop schedules nothing on its own. Same
   * hazard and same fix as the baked shore's. */
  useEffect(() => {
    if (scene === null || !inFrame) return;
    requestSceneFrame();
  }, [scene, inFrame]);

  /* Nothing left to wait for in the one case where no venue frame will ever be
   * drawn: the settled tactical rig is holding the coast out of the scene on
   * purpose. Without this, `ready` would sit at `loading` forever. */
  useEffect(() => {
    if (scene === null || inFrame || drawn.current) return;
    drawn.current = true;
    useReplay.getState().setVenueAsset("rendered");
    tellMaskVenueDrawn(true);
  }, [scene, inFrame]);

  /**
   * Readiness, stated as the streamed venue states it rather than as the baked
   * one does: `rendered` means a frame has been drawn with SOME autogen
   * geometry in it, not that every layer has been through the pipe.
   *
   * The baked asset can promise the stricter thing because its layers are
   * frustum-culling-exempt (their shaders move vertices, so a bounding sphere
   * says nothing) and every one of them therefore draws every frame. These
   * nodes are ordinary glTF meshes with honest bounds and culling left on,
   * which is most of why the mode is cheap; waiting on the last of them would
   * strand `ready` at `loading` on any pose that legitimately cannot see it.
   */
  const markDrawn = useCallback(() => {
    if (drawn.current) return;
    drawn.current = true;
    useReplay.getState().setVenueAsset("rendered");
    tellMaskVenueDrawn(true);
  }, []);

  useEffect(() => {
    if (scene === null) return;
    const meshes: Mesh[] = [];
    scene.root.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh === true) meshes.push(mesh);
    });
    for (const mesh of meshes) mesh.onAfterRender = markDrawn;
    return () => {
      for (const mesh of meshes) mesh.onAfterRender = () => {};
    };
  }, [scene, markDrawn]);

  /* Same rule the other two venues follow: a venue that could not load puts the
   * scene's own procedural arc up, and readiness waits for THAT mesh's drawn
   * frame (`failed` is not ready; the arc promotes it to `fallback`). */
  if (status === "failed" || status === "fallback") return <FallbackShore />;
  /* The settled tactical rig sees 250 m of water from 160 m up and the nearest
   * real land is 715 m away, so the venue's draws are pure cost there. */
  if (scene === null || !inFrame) return null;
  return <primitive object={scene.root} />;
}
