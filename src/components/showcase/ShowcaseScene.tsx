"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DodecahedronGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Fog,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  Object3D,
  OctahedronGeometry,
  RGBAFormat,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { ShowcaseProject } from "./data";
import { projectFloat, SHOWCASE_PROJECTS } from "./data";
import { hashSeed, randomBetween, seededRandom } from "./prng";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/*
 * The chase answers a pointing device, not a narrow viewport. Gating it on width meant a
 * mouse on a 390px window moved nothing, while the real question is whether anything can
 * hover at all: a finger cannot, so touch keeps the static pose.
 */
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const FINALE_DEBRIS_COUNT = 46;
/*
 * Three debris populations, not one. A single uniform tetra count filled every frame with
 * identical navy triangles and buried the subject; the reference is deep space with a
 * handful of big physical objects in it, so the small motes get cut hard and the weight
 * moves into sparse black occluders and edge-lit shards.
 */
const FRAGMENT_COUNT = 92;
const OCCLUDER_COUNT = 44;
const SHARD_COUNT = 68;
/*
 * A fourth population, and the one the field was missing: sparse big grey-white slabs.
 * The reference field is mostly black with a handful of large plates in it catching the
 * key hard enough to read near white, so the frame has physical scale. Twenty-two small
 * dark shards never gave it any.
 */
const SLAB_COUNT = 30;
/*
 * And a fifth: the chromatic slivers. The reference field is peppered with tiny violet and
 * cyan splinters, far too small to read as objects and far too many to be slabs, and they
 * are most of what gives the back half of the journey its colour. Without them the late
 * chapters were dark grey plates on a blue floor with nothing chromatic between them.
 */
const SLIVER_COUNT = 168;
const FINALE_SLIVER_COUNT = 54;
const ENTRY_FOREGROUND_COUNT = 20;
const STAR_PINPOINT_COUNT = 3400;
const STAR_MID_COUNT = 620;
const STAR_BOKEH_COUNT = 72;
const PROJECT_SPACING = 11.5;
// Alternating exit lanes. Neighbours always leave through opposite halves of the frame,
// which is what lets a handoff read as a relay across the screen instead of two hulls
// stacked on the same spot.
const CHAPTER_VERTICALS = [1.12, -0.86, 0.78, -1.06] as const;
/*
 * The half width a chapter is eased toward once it is a long way out. The nine shells run
 * from 1.18 to 1.85 across their widest axis, and at a handoff stop that spread was the
 * single biggest term in how large the incoming crystal read. This sits under the middle
 * of that range, so a far chapter is a small object rather than a second hero.
 */
const FAR_BAND_EXTENT = 1.32;

declare global {
  interface Window {
    __showcaseCapture?: {
      freeze: () => void;
      thaw: () => void;
      step: (milliseconds: number) => void;
    };
  }
}

type ShowcaseSceneProps = {
  progress: number;
  ready: boolean;
  entered: boolean;
  entrySettled: boolean;
  compactViewport: boolean;
  reducedMotion: boolean;
  cursorRef: MutableRefObject<{ x: number; y: number; clientX: number; clientY: number }>;
  onLoadProgress: (progress: number) => void;
};

function useFinePointer() {
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(FINE_POINTER_QUERY);
    const update = () => setFinePointer(query.matches);
    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  return finePointer;
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function makeProjectTexture(project: ShowcaseProject) {
  const width = 256;
  const height = 160;
  const pixels = new Uint8Array(width * height * 4);
  const random = seededRandom(hashSeed(project.id));
  const palette = project.colors.map(hexToRgb);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const radius = Math.hypot(nx - 0.5, ny - 0.5);
      let signal = 0;

      switch (project.motif) {
        case "fault":
          signal = Math.abs(ny - 0.5 - Math.sin(nx * 17) * 0.08) < 0.12 ? 1 : nx;
          break;
        case "assembly":
          signal = (Math.floor(nx * 9) + Math.floor(ny * 5)) % 3 === 0 ? 1 : ny * 0.7;
          break;
        case "burn":
          signal = Math.sin(radius * 42 + Math.atan2(ny - 0.5, nx - 0.5) * 3) * 0.5 + 0.5;
          break;
        case "quench":
          signal = Math.max(0, 1 - radius * 1.6) + Math.sin((nx + ny) * 35) * 0.12;
          break;
        case "market":
          signal = Math.floor(nx * 12) % 2 === 0 ? 0.18 + ny : 0.72 - ny * 0.3;
          break;
        case "loop":
          signal = Math.abs(radius - 0.28 - Math.sin(Math.atan2(ny - 0.5, nx - 0.5) * 6) * 0.04) < 0.08 ? 1 : radius;
          break;
        case "thread":
          signal = Math.abs(ny - 0.5 - Math.sin(nx * 23) * 0.22) < 0.055 ? 1 : nx * ny;
          break;
        case "morrow":
          signal = Math.max(0, Math.sin(nx * 22) * Math.cos(ny * 14)) * 0.6 + ny * 0.45;
          break;
        case "dead-low":
          signal = Math.floor((ny + Math.sin(nx * 60) * 0.035) * 18) % 2 === 0 ? nx : 1 - nx;
          break;
      }

      const noise = (random() - 0.5) * 0.22;
      const value = Math.min(1, Math.max(0, signal + noise));
      const first = palette[value > 0.58 ? 0 : 2];
      const second = palette[value > 0.82 ? 1 : value > 0.35 ? 0 : 2];
      const blend = Math.min(1, Math.max(0, value * 1.2));
      const offset = (y * width + x) * 4;

      pixels[offset] = Math.round(first[0] * (1 - blend) + second[0] * blend);
      pixels[offset + 1] = Math.round(first[1] * (1 - blend) + second[1] * blend);
      pixels[offset + 2] = Math.round(first[2] * (1 - blend) + second[2] * blend);
      pixels[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = MirroredRepeatWrapping;
  texture.wrapT = MirroredRepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Reads the mean luminance of a loaded capture and returns the gamma plus level that put
// every project on the same working exposure. Deterministic: fixed sample grid, no
// randomness. Without it the near-black consoles stay invisible inside the volume and the
// cream editorial pages clip to a featureless white hull.
function measureMediaTone(image: unknown) {
  if (typeof document === "undefined") return [1, 1] as const;
  const source = image as CanvasImageSource | null;
  if (!source) return [1, 1] as const;
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [1, 1] as const;
  try {
    context.drawImage(source, 0, 0, 24, 24);
    const { data } = context.getImageData(0, 0, 24, 24);
    let total = 0;
    const samples: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      const luma = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
      total += luma;
      samples.push(luma);
    }
    const mean = Math.min(0.96, Math.max(0.02, total / samples.length));
    const gamma = MathUtils.clamp(Math.log(0.44) / Math.log(mean), 0.3, 2.2);
    const level = MathUtils.clamp(0.44 / Math.pow(mean, gamma), 0.55, 1.6);
    // Anchoring on the average alone lets a capture that is mostly one flat bright panel,
    // an orange type plate against a little dark type, hit the target with that panel
    // still sitting near white. Inside the volume that reads as a lit slab rather than a
    // lens, because a plate with no dark pixels in it has nothing to be bimodal with. The
    // ceiling holds every capture's hot mass to the level the well-behaved bright ones
    // already land on, and leaves the rest of the set untouched.
    samples.sort((first, second) => first - second);
    const hotMass = samples[Math.round(0.5 * (samples.length - 1))];
    const hotOutput = Math.pow(MathUtils.clamp(hotMass, 0, 1), gamma) * level;
    const HOT_MASS_CEILING = 0.64;
    return [
      gamma,
      hotOutput > HOT_MASS_CEILING ? level * (HOT_MASS_CEILING / hotOutput) : level,
    ] as const;
  } catch {
    return [1, 1] as const;
  }
}

type CrystalShape = {
  solid: "icosahedron" | "dodecahedron" | "octahedron";
  detail: number;
  radius: number;
  stretch: readonly [number, number, number];
  // positive narrows the top into a teardrop, negative narrows the base
  taper: number;
  // pinches the equator, which is what turns a boulder into a ring-ish profile
  waist: number;
  // how far the ridge and cleft warp is allowed to eat the base solid
  ridge: number;
};

// One system, nine silhouettes. The base solid sets the facet count, the stretch sets
// the stance, and taper plus waist cut the profile, so a chapter stays recognisable at
// far approach when the media inside it is still too small to read.
const CRYSTAL_SHAPES: Record<ShowcaseProject["motif"], CrystalShape> = {
  // wide boulder, the opening hero
  morrow: { solid: "icosahedron", detail: 1, radius: 1.3, stretch: [1.24, 0.9, 1.02], taper: 0.12, waist: 0, ridge: 1 },
  // teardrop
  burn: { solid: "icosahedron", detail: 1, radius: 1.3, stretch: [0.96, 1.12, 0.96], taper: 0.42, waist: 0, ridge: 0.9 },
  // hexagonal slab, twelve broad pentagons cut thin
  fault: { solid: "dodecahedron", detail: 0, radius: 1.4, stretch: [1.16, 1.0, 0.62], taper: 0, waist: 0, ridge: 0.34 },
  // blunt angular block
  assembly: { solid: "octahedron", detail: 1, radius: 1.44, stretch: [1.04, 1.0, 1.02], taper: 0, waist: 0, ridge: 0.72 },
  // tall shard, densest facet grid
  quench: { solid: "icosahedron", detail: 2, radius: 1.12, stretch: [0.9, 1.06, 0.9], taper: -0.24, waist: 0, ridge: 1.1 },
  // long low boulder on a fine pentagon grid
  market: { solid: "dodecahedron", detail: 1, radius: 1.28, stretch: [1.3, 0.84, 1.06], taper: 0, waist: 0, ridge: 0.55 },
  // pinched ring
  loop: { solid: "icosahedron", detail: 2, radius: 1.32, stretch: [1.14, 0.98, 1.14], taper: 0, waist: 0.46, ridge: 0.5 },
  // eight-face diamond
  thread: { solid: "octahedron", detail: 0, radius: 1.44, stretch: [1.14, 0.9, 1.0], taper: 0, waist: 0, ridge: 0.24 },
  // squat twenty-face chip
  "dead-low": { solid: "icosahedron", detail: 0, radius: 1.46, stretch: [1.1, 0.82, 1.1], taper: 0, waist: 0, ridge: 0.3 },
};

const CRYSTAL_BASE_FACES = { icosahedron: 20, dodecahedron: 12, octahedron: 8 } as const;

function makeCrystalGeometry(project: ShowcaseProject) {
  const shape = CRYSTAL_SHAPES[project.motif];
  const sourceGeometry =
    shape.solid === "dodecahedron"
      ? new DodecahedronGeometry(shape.radius, shape.detail)
      : shape.solid === "octahedron"
        ? new OctahedronGeometry(shape.radius, shape.detail)
        : new IcosahedronGeometry(shape.radius, shape.detail);
  const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
  if (geometry !== sourceGeometry) sourceGeometry.dispose();
  const positions = geometry.attributes.position;
  const phase = (hashSeed(project.id) % 6283) / 1000;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const ridge = Math.sin(x * 4.7 + y * 3.3 + z * 5.9 + phase);
    const cleft = Math.cos(x * 7.1 - y * 2.8 + z * 4.4 + phase * 0.7);
    // Centred on 1, so the shape radius alone decides how large a chapter reads and
    // the ridge dial only decides how much the warp is allowed to blur the base solid.
    const swell = 1 + (0.76 + (ridge + 1) * 0.13 + (cleft + 1) * 0.065 - 0.955) * shape.ridge;
    const warpedX = x * swell * (1 + Math.sin(y * 5.2 + phase) * 0.11 * shape.ridge)
      + (y * 0.055 + z * 0.045) * shape.ridge;
    const warpedY = y * swell * (1 + Math.cos(z * 4.3 + phase) * 0.12 * shape.ridge)
      + (z * 0.025 - x * 0.035) * shape.ridge;
    const warpedZ = z * swell * (1 + Math.sin(x * 6.1 - phase) * 0.14 * shape.ridge)
      + x * y * 0.04 * shape.ridge;

    const height = MathUtils.clamp(warpedY / shape.radius, -1, 1);
    const taperEnd = shape.taper >= 0 ? Math.max(0, height) : Math.max(0, -height);
    const profile =
      (1 - Math.abs(shape.taper) * Math.pow(taperEnd, 1.4))
      * (1 - shape.waist * Math.exp(-Math.pow(height / 0.34, 2)));

    positions.setXYZ(
      index,
      warpedX * profile * shape.stretch[0],
      warpedY * shape.stretch[1],
      warpedZ * profile * shape.stretch[2],
    );
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  // Every base face of a polyhedron emits a contiguous run of vertices, so one facet is
  // one run. Grouping by facet (not by triangle) is what gives the media a break at
  // every seam instead of a triangle wireframe, and the run length is what varies the
  // facet density from chapter to chapter.
  const baseFaces = CRYSTAL_BASE_FACES[shape.solid];
  const facetSize = Math.max(3, Math.round(positions.count / baseFaces / 3) * 3);
  const facetCount = Math.ceil(positions.count / facetSize);
  const facetCentroids = new Float32Array(facetCount * 3);
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const facet = Math.floor(vertex / facetSize);
    facetCentroids[facet * 3] += positions.getX(vertex);
    facetCentroids[facet * 3 + 1] += positions.getY(vertex);
    facetCentroids[facet * 3 + 2] += positions.getZ(vertex);
  }
  for (let facet = 0; facet < facetCount; facet += 1) {
    const x = facetCentroids[facet * 3] / facetSize;
    const y = facetCentroids[facet * 3 + 1] / facetSize;
    const z = facetCentroids[facet * 3 + 2] / facetSize;
    facetCentroids[facet * 3] = x;
    facetCentroids[facet * 3 + 1] = y;
    facetCentroids[facet * 3 + 2] = z;
  }

  const facetIds = new Float32Array(positions.count);
  const shardIds = new Float32Array(positions.count);
  const facetCenters = new Float32Array(positions.count * 3);
  const barycentrics = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const facet = Math.floor(vertex / facetSize);
    facetIds[vertex] = facet;
    shardIds[vertex] = Math.floor(vertex / 3);
    facetCenters[vertex * 3] = facetCentroids[facet * 3];
    facetCenters[vertex * 3 + 1] = facetCentroids[facet * 3 + 1];
    facetCenters[vertex * 3 + 2] = facetCentroids[facet * 3 + 2];
    barycentrics[vertex * 3 + (vertex % 3)] = 1;
  }
  geometry.setAttribute("aFacet", new BufferAttribute(facetIds, 1));
  geometry.setAttribute("aShard", new BufferAttribute(shardIds, 1));
  geometry.setAttribute("aFacetCenter", new BufferAttribute(facetCenters, 3));
  geometry.setAttribute("aBarycentric", new BufferAttribute(barycentrics, 3));

  return geometry;
}

const CRYSTAL_VERTEX_SHADER = /* glsl */ `
  attribute float aFacet;
  attribute float aShard;
  attribute vec3 aFacetCenter;
  attribute vec3 aBarycentric;
  uniform float uHover;
  uniform float uShapePhase;
  varying vec3 vLocalPosition;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec3 vBarycentric;
  varying vec3 vFacetCurve;
  varying float vFacet;
  varying float vShard;

  float facetHash(float value) {
    return fract(sin(value * 91.713) * 43758.5453);
  }

  void main() {
    // Hover re-cuts the silhouette without opening it. The swell is a smooth field of
    // the untouched position, so two facets that share an edge always send their shared
    // vertices to the same place and the volume stays welded shut. A per-facet pulse
    // used to slide the outer plates clear of the body and leave background between them.
    float field = sin(position.x * 3.4 + uShapePhase)
      * cos(position.y * 2.9 - uShapePhase * 0.7)
      + sin(position.z * 3.9 + uShapePhase * 1.3) * 0.72
      + cos((position.x + position.y + position.z) * 2.3 + uShapePhase * 0.4) * 0.55;
    float swell = clamp(field * 0.44, -1.0, 1.0) * uHover * 0.175;
    vec3 weldDirection = normalize(position + vec3(0.0001));
    // The gather still cracks each facet off its neighbours, but capped so a crack never
    // grows wider than the shell is thick and the interior reads through it, not the void.
    float contraction = uHover * (0.012 + facetHash(aFacet * 4.19 + 1.77) * 0.02);
    vec3 gathered = mix(position, aFacetCenter, contraction);
    vec3 deformed = gathered + weldDirection * swell;
    vLocalPosition = deformed;
    vFacet = aFacet;
    vShard = aShard;
    vBarycentric = aBarycentric;
    // Where this vertex sits inside its own facet, measured in the plane of the facet.
    // The fragment stage bends the shading normal along it so a flat plate behaves like a
    // shallow cap, and the amount travels in local units so a distant chapter and a near
    // one curve by the same physical amount rather than by however large they draw.
    vec3 facetOffset = deformed - aFacetCenter;
    vec3 facetTangent = facetOffset - normal * dot(facetOffset, normal);
    vFacetCurve = normalize(normalMatrix * facetTangent + vec3(1e-5)) * length(facetTangent);
    vec4 viewPosition = modelViewMatrix * vec4(deformed, 1.0);
    vViewPosition = viewPosition.xyz;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const CRYSTAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform sampler2D uTexture;
  uniform sampler2D uRelicTexture;
  uniform float uHover;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uExtent;
  uniform vec2 uMediaTone;
  uniform vec3 uAccent;
  uniform vec3 uTint;
  varying vec3 vLocalPosition;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  varying vec3 vBarycentric;
  varying vec3 vFacetCurve;
  varying float vFacet;
  varying float vShard;

  float hash(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  // Both media maps wrap mirrored, so a facet that lands off the sheet duplicates
  // the image instead of smearing an edge pixel.
  vec3 dispersed(sampler2D map, vec2 uv, vec2 split) {
    return vec3(
      texture2D(map, uv + split).r,
      texture2D(map, uv).g,
      texture2D(map, uv - split).b
    );
  }

  float facetEdge(float thickness) {
    vec3 width = fwidth(vBarycentric);
    vec3 smoothBarycentric = smoothstep(vec3(0.0), width * thickness, vBarycentric);
    return 1.0 - min(min(smoothBarycentric.x, smoothBarycentric.y), smoothBarycentric.z);
  }

  // The nine captures run from near-black consoles to cream editorial pages, so each one
  // is exposed to the same working range before the optics touch it.
  vec3 exposeMedia(vec3 media) {
    return pow(clamp(media, 0.0, 1.0), vec3(uMediaTone.x)) * uMediaTone.y;
  }

  // A hot facet has to keep its picture. A hard clamp turned the brightest plates into
  // blank white cards, which is the one thing a lens never does.
  vec3 shoulder(vec3 value) {
    const float knee = 0.68;
    vec3 over = max(value - knee, vec3(0.0));
    return min(value, vec3(knee)) + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
  }

  void main() {
    // The media is fitted to the silhouette, so it fills the volume edge to edge.
    vec2 cleanUv = vLocalPosition.xy / (uExtent * 2.04) + 0.5;

    float h1 = hash(vFacet + 1.7);
    float h2 = hash(vFacet * 3.71 + 8.4);
    float h3 = hash(vFacet * 6.13 + 2.9);
    float s1 = hash(vShard * 1.31 + 4.27);
    float s2 = hash(vShard * 5.77 + 11.3);

    vec3 viewNormal = normalize(vNormalView);
    vec3 viewDirection = normalize(-vViewPosition);
    float facing = abs(dot(viewNormal, viewDirection));
    float grazing = 1.0 - facing;
    float interior = gl_FrontFacing ? 1.0 : 0.16;

    // Each facet reads a different part of the sheet, so the image breaks and
    // duplicates across every seam the way a thick lens cluster does.
    vec2 facetUv = cleanUv - 0.5;
    facetUv = rotate2d((h1 - 0.5) * 0.92) * facetUv;
    facetUv *= 0.72 + h2 * 0.5;
    facetUv += vec2(h2 - 0.5, h3 - 0.5) * 0.34;
    facetUv += 0.5;

    vec2 flow = vec2(
      sin(cleanUv.y * 22.0 + uTime * 0.22 + h1 * 8.0),
      cos(cleanUv.x * 19.0 - uTime * 0.17 + h2 * 7.0)
    ) * 0.006;

    // Refraction offset follows the facet normal, and the two layers park at
    // opposing depths so the interior parallaxes as the crystal turns.
    vec2 bend = viewNormal.xy * (0.055 + grazing * 0.135);
    vec2 frontUv = facetUv + bend * 0.32 + flow;
    vec2 backUv = facetUv - bend * 1.25 - flow * 1.7;

    vec2 splitAxis = viewNormal.xy;
    vec2 splitDirection = splitAxis / max(length(splitAxis), 0.0015);
    vec2 split = splitDirection * (0.007 + grazing * 0.015);

    vec3 frontMedia = exposeMedia(dispersed(uTexture, frontUv, split));
    vec3 backMedia = exposeMedia(dispersed(uTexture, backUv, split * -0.62));
    float layerMix = 0.1 + grazing * 0.26;
    vec3 restMedia = mix(frontMedia, backMedia * 0.84, layerMix);
    float restLuma = dot(restMedia, vec3(0.2126, 0.7152, 0.0722));

    vec2 relicUv = rotate2d((h2 - 0.5) * 1.4) * (facetUv - 0.5) * (0.62 + h1 * 0.3)
      + 0.5 + vec2(h3 - 0.5, h1 - 0.5) * 0.3 - bend * 0.9;
    vec3 relic = dispersed(uRelicTexture, relicUv, split * 1.4);
    restMedia += relic * (0.12 + grazing * 0.42) * (1.0 - restLuma);
    // A lens is high contrast: deep interior shadow against a few hot reads.
    restMedia = clamp(restMedia, 0.0, 1.0);
    restMedia = mix(restMedia, restMedia * restMedia * (3.0 - 2.0 * restMedia), 0.6);

    float radiationMix = smoothstep(-0.9, 0.86, vLocalPosition.y + sin(vLocalPosition.x * 3.2) * 0.23);
    vec3 spectralRest = mix(vec3(0.0, 0.46, 1.0), vec3(1.0, 0.44, 0.018), radiationMix);
    // Facets carry their own thin-film colour and their own light level, which is what
    // makes a source facet read green next to a magenta one instead of one flat wash.
    // The project palette biases that film, so each chapter runs its own hue family.
    vec3 facetFilm = 0.34 + 1.02 * (0.5 + 0.5 * cos(6.2831853 * (h1 + facing * 0.3 + vec3(0.0, 0.33, 0.67))));
    facetFilm = mix(facetFilm, facetFilm * (0.42 + uTint * 1.24), 0.44);
    restMedia = mix(restMedia, restMedia * facetFilm, 0.55);
    // Wide per-facet exposure spread, weighted low. Most facets sit near the floor and a
    // handful run hot, which is the two-humped luminance the source volume shows at rest.
    // A linear draw put too many of the big plates in the same mid-bright band, which is
    // what a twelve-face chapter shows as one flat lit slab filling half the frame.
    restMedia *= mix(0.04, 1.86, pow(smoothstep(0.04, 0.97, h3), 1.35));
    restMedia += spectralRest * (0.006 + grazing * 0.03) * (1.0 - restLuma);
    // Oblique faces fall away hard. A gentle falloff left every face sitting in the same
    // milky midtone, where the source runs a deep body against a few hot reads.
    restMedia *= 0.006 + pow(facing, 2.9) * 0.994;

    // Hover recuts the interior per triangle, so twenty facets become eighty shards.
    float shardAngle = floor(h1 * 8.0) * 0.7853981634 + (s1 - 0.5) * 0.7 + uPointer.x * 0.28;
    vec2 shardUv = cleanUv - 0.5;
    shardUv *= 0.42 + s2 * 0.72;
    shardUv = rotate2d(shardAngle) * shardUv;
    shardUv += vec2(s1 - 0.5, s2 - 0.5) * 0.86 + uPointer * 0.05 + bend * 1.7;
    shardUv += 0.5;

    // How deep inside its own shard this fragment sits, measured in barycentric units so
    // a near chapter and a far one fringe by the same share of the plate rather than by
    // however many pixels they happen to cover. Zero at the shard centre, one on a seam.
    float seamDepth = clamp(1.0 - min(min(vBarycentric.x, vBarycentric.y), vBarycentric.z) * 3.0, 0.0, 1.0);
    // A real lens cluster throws its colour where the glass runs out, not across the
    // plate: the channels part company near a seam and travel together in the middle.
    // Widening the split here is what puts saturated fringes on the volume without
    // adding a lumen of light or painting a shard one flat hue, which is the difference
    // between dispersion and a candy wireframe.
    float seamFringe = pow(seamDepth, 1.6);
    // The seams of a cluster this rough are not polished, so the split scatters per pixel
    // instead of smearing one clean ghost. The scatter is keyed to the shard's own uv
    // rather than the screen, so the fringes travel with the volume as it turns.
    float speck = hash(floor(shardUv.x * 640.0) + floor(shardUv.y * 640.0) * 97.3);
    float splitStrength = (0.013 + 0.019 * s2) * (0.6 + seamFringe * 8.0) * (0.35 + speck * 1.8);
    vec2 shardSplit = rotate2d(shardAngle + uTime * 0.03 + (speck - 0.5) * 3.4) * vec2(splitStrength, 0.0);
    vec2 relicShardUv = rotate2d(-shardAngle * 0.42) * (shardUv - 0.5) * (0.66 + s1 * 0.26)
      + 0.5 + vec2(s2 - 0.5, s1 - 0.5) * 0.34;

    vec3 projectShard = exposeMedia(dispersed(uTexture, shardUv, shardSplit));
    vec3 relicShard = dispersed(uRelicTexture, relicShardUv, shardSplit * 1.5);
    float shardProjectLuma = dot(projectShard, vec3(0.2126, 0.7152, 0.0722));
    vec3 refracted = projectShard + relicShard * (0.24 + grazing * 0.44) * (1.0 - shardProjectLuma);
    // A shard either passes the picture or it passes nothing, so the stretch is steep and
    // pivots on the working exposure rather than lifting off the floor: the same amount of
    // light, sorted into a black body and a few hot reads. It is also what makes the split
    // legible, since it multiplies the gap the three channels opened as they parted.
    refracted = clamp((refracted - 0.44) * 2.4 + 0.42, 0.0, 1.3);
    // Hover is an optical volume, not a candy wrapper, so the film is not allowed to hold
    // still: its interference order moves with the scatter, which puts the colour down as
    // fine iridescent grain over the picture rather than painting a shard one pure hue.
    // That is how the reference reads under a pointer, dense chromatic speckle on a body
    // that still shows its image, and it costs no light because the film only multiplies.
    vec3 spectral = 0.74 + 0.5 * (0.5 + 0.5 * cos(6.2831853 * (h1 + s1 * 0.42 + speck * 0.34 + vec3(0.0, 0.34, 0.67))));
    spectral *= vec3(0.9, 0.96, 1.12);
    refracted = mix(refracted, refracted * spectral, 0.6);
    // Two soft ramps multiplied together left almost every shard in the same middle band,
    // which is the milky hover the reference never shows. One gate instead, squared so it
    // opens late and then quickly: most shards shut nearly to black and the few that open
    // pass the picture close to whole. The same light, sorted, which is the bimodal body
    // the reference shows under a pointer.
    float shardGate = smoothstep(0.12, 0.90, s2 * 0.55 + h3 * 0.45);
    refracted *= mix(0.02, 0.92, shardGate * shardGate);
    // Oblique shards fall away as hard under the pointer as they do at rest. A shallow
    // falloff was what turned hover into an evenly lit midtone hump.
    refracted *= 0.055 + pow(facing, 2.0) * 0.945;

    float rim = pow(grazing, 2.4);
    vec3 keyDirection = normalize(vec3(0.35, 0.72, 0.84));
    float light = 0.68 + 0.32 * abs(dot(viewNormal, keyDirection));
    // Hard facet glints: the source volume is mostly dark with a few near-white reads.
    vec3 fillDirection = normalize(vec3(-0.58, 0.3, 0.76));
    // A dead-flat plate is a binary mirror: the whole facet either catches the key or none
    // of it does, and on the eight and twelve-face chapters none of it ever did. Bending
    // the shading normal across each facet turns it into a shallow cap, so a tight lobe
    // has somewhere to travel and the rotation sweeps a hot read across one or two plates
    // instead of switching a whole face on at once. Only the highlight reads the curved
    // normal; the media keeps the flat one, so the per-facet break stays crisp. Cap depth
    // and axis vary per facet as well, so the sweet spot sits somewhere different on every
    // plate and plenty of plates never contain one: a uniform cap put an identical
    // headlight in the middle of all eight faces at once.
    vec3 curveBias = vec3(h1 - 0.5, h2 - 0.5, h3 - 0.5) * 0.42;
    vec3 curvedNormal = normalize(viewNormal + vFacetCurve * (0.9 + h2 * 1.5) + curveBias);
    vec3 mirror = reflect(-viewDirection, curvedNormal);
    float specular = max(dot(mirror, keyDirection), 0.0);
    // A faint wide halo under a hot narrow core, not the other way round. Leading with
    // the halo put a patch of fog on the dark plates instead of light coming off them.
    float glint = pow(specular, 86.0);
    // Two keys, tight lobes: with flat facets a single key leaves whole chapters without
    // a single hot read, and the source never shows a volume with no highlight at all.
    float spark = (pow(specular, 105.0)
      + pow(max(dot(mirror, fillDirection), 0.0), 86.0) * 0.8) * facing;
    float edge = facetEdge(1.35);
    float grain = hash(gl_FragCoord.x * 0.19 + gl_FragCoord.y * 0.73 + floor(uTime * 9.0)) - 0.5;
    vec3 color = mix(restMedia, refracted, uHover);
    float bodyLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color *= mix(0.74 + light * 0.24, 0.7 + light * 0.32, uHover);
    // The body is graded before the highlights land, so the wash drops away and the
    // specular reads stay hot: a lens in a black room is bimodal, not evenly lit.
    color = pow(shoulder(max(color, vec3(0.0))), vec3(mix(2.08, 2.3, uHover)));
    // The perimeter plates of a hovered volume turn almost edge-on, so the refraction
    // term drops out and whatever sits here is the whole of what a viewer sees there. At
    // the old level it drew a warm lit band right around the silhouette; the reference
    // keeps that boundary cool and dim and lets the interior carry the light.
    color += rim * (1.0 - bodyLuma * 0.7)
      * mix(spectralRest * 0.09 + uAccent * 0.03, spectralRest * 0.045 + vec3(0.34, 0.5, 1.0) * 0.05, uHover);
    // A hot read off a dispersive wedge carries the film's colour, not the lamp's. Leaving
    // the hovered glints white is what made the brightest pixels in the volume the only
    // colourless ones in it, where the reference keeps its hot reads chromatic. The film
    // averages to unity, so this tints the peaks rather than raising them.
    vec3 glintFilm = 0.28 + 1.34 * (0.5 + 0.5 * cos(6.2831853 * (h1 * 1.7 + s1 * 0.5 + speck * 0.3 + vec3(0.0, 0.33, 0.67))));
    color += glint * mix(vec3(0.62, 0.74, 1.0) * 0.26, vec3(0.6, 0.72, 1.0) * 0.15 * glintFilm, uHover);
    color += spark * mix(vec3(1.3, 1.34, 1.46), vec3(1.12, 1.16, 1.32) * glintFilm, uHover);
    // Lit seams stay a hover behaviour, and they stay faint. Any real level here draws a
    // triangle wireframe over the volume, and the source has no wireframe anywhere in it.
    color += edge * spectral * 0.07 * uHover * uHover;
    color += grain * mix(0.028, 0.03, uHover);
    color *= interior;
    // Screen captures carry far less chroma than the film-grade renders the reference
    // pours through its lens, so the facet tints get pushed back up here. Hover holds the
    // same amount: measured on the reference the hovered volume is no less chromatic than
    // the resting one, and because the mix runs against each pixel's own luma it moves
    // colour without moving brightness anywhere in the frame.
    float chroma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(chroma), color, 1.5);
    gl_FragColor = vec4(clamp(color, 0.0, 1.25), 1.0);
  }
`;

function LoadingClock({
  reducedMotion,
  onLoadProgress,
}: Pick<ShowcaseSceneProps, "reducedMotion" | "onLoadProgress">) {
  const lastProgress = useRef(-1);
  const complete = useRef(false);

  useEffect(() => {
    if (!reducedMotion) return;
    lastProgress.current = 100;
    complete.current = true;
    onLoadProgress(100);
  }, [onLoadProgress, reducedMotion]);

  useFrame(({ clock }) => {
    if (complete.current || reducedMotion) return;
    const value = Math.min(100, Math.round(clock.elapsedTime * 84));
    if (value === lastProgress.current) return;
    lastProgress.current = value;
    onLoadProgress(value);
    if (value === 100) complete.current = true;
  });

  return null;
}

function FrameAuthority({ reducedMotion }: Pick<ShowcaseSceneProps, "reducedMotion">) {
  const { advance, gl, invalidate, setFrameloop } = useThree();

  useEffect(() => {
    const preferredMode = reducedMotion || window.matchMedia(REDUCED_MOTION_QUERY).matches ? "demand" : "always";
    setFrameloop(preferredMode);
    invalidate();

    window.__showcaseCapture = {
      freeze: () => setFrameloop("never"),
      thaw: () => {
        setFrameloop(preferredMode);
        invalidate();
      },
      step: (milliseconds: number) => {
        setFrameloop("never");
        advance(performance.now() + milliseconds, true);
      },
    };

    const handleVisibility = () => {
      if (document.hidden) {
        setFrameloop("never");
      } else {
        setFrameloop(preferredMode);
        invalidate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      delete window.__showcaseCapture;
    };
  }, [advance, gl, invalidate, reducedMotion, setFrameloop]);

  useEffect(() => {
    const updatePixelRatio = () => {
      const ratio = Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.25 : 1.5);
      gl.setPixelRatio(ratio);
    };

    updatePixelRatio();
    window.addEventListener("resize", updatePixelRatio);
    return () => window.removeEventListener("resize", updatePixelRatio);
  }, [gl]);

  return null;
}

function CameraRig({ progress, reducedMotion, cursorRef }: Pick<ShowcaseSceneProps, "progress" | "reducedMotion" | "cursorRef">) {
  const finePointer = useFinePointer();

  useFrame(({ camera }) => {
    const pointer = cursorRef.current;
    const travel = projectFloat(progress);
    const targetZ = 5 - travel * PROJECT_SPACING;
    const pointerScale = finePointer && !reducedMotion ? 1 : 0;
    const targetX = pointer.x * 0.36 * pointerScale;
    const targetY = pointer.y * 0.2 * pointerScale;
    const damping = reducedMotion ? 1 : 0.08;

    camera.position.x += (targetX - camera.position.x) * damping;
    camera.position.y += (targetY - camera.position.y) * damping;
    camera.position.z += (targetZ - camera.position.z) * damping;
    camera.lookAt(targetX * 0.35, targetY * 0.35, camera.position.z - 6);
  });

  return null;
}

/*
 * The dusk curve every ambience decision reads from, and it only ever goes one way. The
 * first act is flooded cobalt and the back half keeps its colour while losing its light;
 * the finale is not a recovery, it is a black room with one radial glow in it.
 */
function duskAmount(progress: number) {
  return MathUtils.smoothstep(progress, 0.38, 0.8);
}

/*
 * P2-1: the room level per chapter, and the swing between neighbours is the whole point.
 * A single dimmer from lit to dark held every measured stop inside a two-to-one band while
 * the reference runs better than ten to one across the same journey: a flooded chapter,
 * then a near-black one, then a flooded one again. These are relative levels, applied to
 * the fog, the ground and the radiation together so a chapter grades as one room.
 */
const CHAPTER_AMBIENCE = [0.42, 0.24, 1.8, 0.16, 0.44, 2.1, 0.035, 0.02, 0.14] as const;

function ambienceAt(progress: number) {
  const travel = MathUtils.clamp(projectFloat(progress), 0, CHAPTER_AMBIENCE.length - 1);
  const lower = Math.floor(travel);
  const upper = Math.min(CHAPTER_AMBIENCE.length - 1, lower + 1);
  return MathUtils.lerp(CHAPTER_AMBIENCE[lower], CHAPTER_AMBIENCE[upper], travel - lower);
}

/*
 * How lit the objects in a room are, as opposed to how lit its air is. The arc above
 * already grades the fog, the ground and the radiation together; leaving the debris out of
 * it meant the two darkest chapters still carried a field of near-white plates, and a nine
 * level bloom spread those right across the frame. It bottoms out well above zero, because
 * a dark chapter is still a lit corridor, only a much dimmer one.
 */
function roomLight(progress: number) {
  return 0.4 + 0.6 * MathUtils.smoothstep(ambienceAt(progress), 0.02, 0.42);
}

function Atmosphere({ entered, progress }: Pick<ShowcaseSceneProps, "entered" | "progress">) {
  const { scene } = useThree();
  const targetGround = useMemo(() => new Color(), []);
  const targetFog = useMemo(() => new Color(), []);
  const chapterTint = useMemo(() => new Color(), []);
  const chapterGround = useMemo(() => new Color(), []);
  const chapterFogs = useMemo(() => SHOWCASE_PROJECTS.map((project) => new Color(project.colors[1])), []);
  const chapterGrounds = useMemo(() => SHOWCASE_PROJECTS.map((project) => new Color(project.colors[2])), []);
  const colors = useMemo(() => ({
    ground: new Color("#00000b"),
    journeyGround: new Color("#000008"),
    fog: new Color("#000070"),
    /*
     * Deliberately a fraction of the cobalt it used to be. Fog is what distant geometry
     * fades into, so a bright fog turned every far mote into a glowing blue chip and
     * packed them into a confetti swarm at the vanishing point, and it lifted the whole
     * empty frame to a navy wash where the reference holds a true black. The colour now
     * comes from RadiationGlow, which travels with the camera and hugs the featured
     * object instead of lighting the entire corridor at once.
     */
    journeyFog: new Color("#000733"),
  }), []);

  useFrame(() => {
    /*
     * The back half only gets darker, never neutral. Draining the colour is the
     * pointer's job, and it lands as a filter over the whole page, so the tint here
     * stays cobalt from the first chapter to the last. What does change chapter to
     * chapter is a quarter-strength pull toward the project's own mid tone, which is
     * enough to grade the room without ever leaving the blue.
     */
    const travel = MathUtils.clamp(projectFloat(progress), 0, SHOWCASE_PROJECTS.length - 1);
    const lower = Math.floor(travel);
    const upper = Math.min(SHOWCASE_PROJECTS.length - 1, lower + 1);
    const blend = travel - lower;
    const dusk = duskAmount(progress);
    const ambience = ambienceAt(progress);

    chapterTint.copy(chapterFogs[lower]).lerp(chapterFogs[upper], blend);
    targetFog
      .copy(colors.journeyFog)
      .lerp(chapterTint, 0.34)
      .multiplyScalar(ambience * (1 - dusk * 0.55));

    chapterGround.copy(chapterGrounds[lower]).lerp(chapterGrounds[upper], blend);
    // A quarter, not a half: the project darks carry enough red to grey out a corner that
    // the reference keeps at 0-3. The empty frame is the one place with no cobalt in it,
    // so the ground rides the ambience arc down harder than the fog does.
    // And the ground never rides the arc upward. A flooded chapter is flooded around its
    // object, not across its backdrop: past unity the multiplier was painting the empty
    // frame a lit navy, which is the one place the reference is measurably at zero.
    targetGround
      .copy(colors.journeyGround)
      .lerp(chapterGround, 0.18)
      .multiplyScalar(Math.min(1, ambience) * (1 - dusk * 0.7));

    if (scene.background instanceof Color) {
      scene.background.lerp(entered ? targetGround : colors.ground, 0.045);
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.lerp(entered ? targetFog : colors.fog, 0.045);
    }
  });

  return null;
}

/*
 * One round, soft-edged dot shared by all three star clouds. Square GL points were the
 * whole reason near stars read as rainbow-striped chips once chromatic aberration split
 * their hard edges.
 */
function usePointSprite() {
  const texture = useMemo(() => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = (y * size + x) * 4;
        const distance = Math.hypot(x - center, y - center) / center;
        const falloff = Math.max(0, 1 - distance);
        const alpha = Math.pow(falloff, 2.1) * 0.82 + Math.pow(falloff, 9) * 0.18;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.round(MathUtils.clamp(alpha, 0, 1) * 255);
      }
    }
    const map = new DataTexture(data, size, size, RGBAFormat);
    map.minFilter = LinearFilter;
    map.magFilter = LinearFilter;
    map.needsUpdate = true;
    return map;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

function starPositions(seed: string, count: number, spread: number) {
  const random = seededRandom(hashSeed(seed));
  const values = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    values[index * 3] = randomBetween(random, -9.5 * spread, 9.5 * spread);
    values[index * 3 + 1] = randomBetween(random, -5.5 * spread, 5.5 * spread);
    values[index * 3 + 2] = randomBetween(random, -105, 4);
  }

  return values;
}

function StarField({ reducedMotion, cursorRef }: Pick<ShowcaseSceneProps, "reducedMotion" | "cursorRef">) {
  const groupRef = useRef<Group>(null);
  const sprite = usePointSprite();
  /*
   * Three clouds instead of one uniform size. The reference sky is mostly warm pinpoints
   * with a scatter of brighter dots and a handful of soft bokeh discs, and that size
   * variance is what stops it reading as evenly sprayed sensor noise.
   */
  const pinpoints = useMemo(() => starPositions("showcase-star-pinpoints", STAR_PINPOINT_COUNT, 1), []);
  const mids = useMemo(() => starPositions("showcase-star-mids", STAR_MID_COUNT, 1.05), []);
  const bokeh = useMemo(() => starPositions("showcase-star-bokeh", STAR_BOKEH_COUNT, 1.1), []);

  useFrame((_, delta) => {
    const pointer = cursorRef.current;
    const group = groupRef.current;
    if (!group || reducedMotion) return;
    group.position.x = MathUtils.damp(group.position.x, pointer.x * -0.22, 3.4, delta);
    group.position.y = MathUtils.damp(group.position.y, pointer.y * -0.12, 3.4, delta);
  });

  return (
    <group ref={groupRef}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pinpoints, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={sprite}
          color="#fff0d6"
          size={0.026}
          sizeAttenuation
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </points>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[mids, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={sprite}
          color="#fffaf0"
          size={0.062}
          sizeAttenuation
          transparent
          opacity={0.94}
          depthWrite={false}
        />
      </points>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bokeh, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={sprite}
          color="#bfd4ff"
          size={0.24}
          sizeAttenuation
          transparent
          opacity={0.3}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/*
 * P2-5: debris that is lit like an object instead of tinted like a card, and fringed at
 * its own edges instead of by a pass over the whole frame. A global aberration has to stay
 * tiny or every bright speck smears into three; the reference fringes only where geometry
 * has an edge, so the split lives in the material and reads on the silhouette alone.
 */
const DEBRIS_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDebrisNormal;
  varying vec3 vDebrisView;

  void main() {
    vec4 instanced = instanceMatrix * vec4(position, 1.0);
    vec4 viewPosition = modelViewMatrix * instanced;
    vDebrisNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
    vDebrisView = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const DEBRIS_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBody;
  uniform vec3 uKey;
  uniform float uRim;
  uniform float uGloss;
  uniform float uFade;

  varying vec3 vDebrisNormal;
  varying vec3 vDebrisView;

  void main() {
    vec3 normal = normalize(vDebrisNormal);
    vec3 view = normalize(vDebrisView);
    float facing = abs(dot(normal, view));
    float grazing = 1.0 - facing;

    // One hard key and one cold fill, both tight: a plate either catches the light and
    // reads near white or it stays in the black, which is the bimodal field the source has.
    vec3 key = normalize(vec3(-0.38, 0.64, 0.66));
    vec3 fill = normalize(vec3(0.62, -0.24, 0.74));
    float lambert = max(0.0, dot(normal, key));
    float bounce = max(0.0, dot(normal, fill));
    vec3 mirror = reflect(-view, normal);
    float spec = pow(max(0.0, dot(mirror, key)), 38.0) + pow(max(0.0, dot(mirror, fill)), 54.0) * 0.6;

    vec3 color = uBody * (0.05 + pow(lambert, 1.9) * 1.0 + bounce * 0.14);
    color += uKey * spec * uGloss;

    // Geometry-local chromatic rim. The sign of the view-space normal decides which way
    // the split falls, so one edge of a plate runs cyan and the opposite edge runs violet.
    //
    // Both ends sit on the cool side now. The far end used to be a salmon, and a slab that
    // caught it landed as a rose shard with a crimson leading edge in contact with the
    // mark's baseline at pointer bottom-right: the one genuinely warm thing anywhere in the
    // frame, sitting on the one thing that may not carry warmth. Blue leads red at both
    // ends of the mix, so the split survives as cyan against violet.
    float fresnel = pow(grazing, 3.4);
    vec3 fringe = mix(vec3(0.14, 0.42, 1.7), vec3(0.86, 0.44, 1.28), smoothstep(-0.42, 0.42, normal.x));
    color += fringe * fresnel * uRim;

    // Fading to black, never to transparent: these are opaque instanced plates and any
    // real alpha would put them in the sorted pass and change how they meet the crystals.
    gl_FragColor = vec4(max(color, vec3(0.0)) * uFade, 1.0);
  }
`;

function FragmentField({
  entered,
  progress,
  reducedMotion,
  cursorRef,
}: Pick<ShowcaseSceneProps, "entered" | "progress" | "reducedMotion" | "cursorRef">) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);
  const edgeRef = useRef<InstancedMesh>(null);
  const occluderRef = useRef<InstancedMesh>(null);
  const shardRef = useRef<InstancedMesh>(null);
  const slabRef = useRef<InstancedMesh>(null);
  const sliverRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const enteredAt = useRef<number | null>(null);
  const moteMaterial = useRef<MeshStandardMaterial | null>(null);
  const occluderMaterial = useRef<MeshStandardMaterial | null>(null);
  /*
   * Same trap the entry artifact hit: R3F takes its own copy of the uniforms object on
   * mount, so a per-frame scalar has to be written through the live material, not through
   * the object this file authored. The prop below still seeds the value.
   */
  const debrisMaterials = useRef<Array<ShaderMaterial | null>>([]);
  const moteTint = useMemo(() => new Color("#202039"), []);
  const occluderTint = useMemo(() => new Color("#04040e"), []);
  const shardUniforms = useMemo(() => ({
    uBody: { value: new Color("#5d72a6") },
    uKey: { value: new Color("#dbe6ff") },
    uRim: { value: 0.78 },
    uGloss: { value: 1.6 },
    uFade: { value: 1 },
  }), []);
  const slabUniforms = useMemo(() => ({
    // grey-white, and lit hard: these are the plates that read as bright faces
    uBody: { value: new Color("#a3b3d2") },
    uKey: { value: new Color("#ffffff") },
    uRim: { value: 0.7 },
    uGloss: { value: 1.7 },
    uFade: { value: 1 },
  }), []);
  /*
   * Almost no body and almost all rim. A sliver is too small to show a lit face, so what
   * the reference actually shows of one is its fringe: a violet splinter with a cyan edge,
   * a couple of pixels across. Turning the gloss up and the body down is what keeps them
   * chromatic specks instead of a swarm of small grey plates.
   */
  const sliverUniforms = useMemo(() => ({
    uBody: { value: new Color("#3a2f7a") },
    uKey: { value: new Color("#8fd8ff") },
    uRim: { value: 2.4 },
    uGloss: { value: 2.2 },
    uFade: { value: 1 },
  }), []);
  const fragmentTexture = useLoader(
    TextureLoader,
    "/prototype/showcase/media/refractive-atlas-v2.png",
  ) as Texture;

  /*
   * Everything sits in the same corridor the camera flies down, and everything clears the
   * central tube so debris never lands on top of a crystal. What separates the three
   * populations is size law and material, not where they live.
   */
  const populations = useMemo(() => {
    const clearCorridor = (
      random: () => number,
      z: number,
      radiusX: number,
      radiusY: number,
      near: number,
    ) => {
      let x = randomBetween(random, -9.5, 9.5);
      let y = randomBetween(random, -5.5, 5.5);
      if (z > near && Math.abs(x) < radiusX && Math.abs(y) < radiusY) {
        if (random() > 0.5) {
          x = (random() > 0.5 ? 1 : -1) * randomBetween(random, radiusX + 0.3, 9.5);
        } else {
          y = (random() > 0.5 ? 1 : -1) * randomBetween(random, radiusY + 0.25, 5.5);
        }
      }
      return [x, y] as const;
    };

    const motesRandom = seededRandom(hashSeed("showcase-fragments"));
    const motes = Array.from({ length: FRAGMENT_COUNT }, () => {
      const z = randomBetween(motesRandom, -104, 2);
      const [x, y] = clearCorridor(motesRandom, z, 3.4, 2.45, -14);
      // heavy skew: nearly all specks, a handful with real presence
      const size = 0.18 + Math.pow(motesRandom(), 3.4) * 4.6;
      return {
        position: [x, y, z] as const,
        rotation: [
          motesRandom() * Math.PI,
          motesRandom() * Math.PI,
          motesRandom() * Math.PI,
        ] as const,
        scale: [size, size, size] as const,
      };
    });

    const occluderRandom = seededRandom(hashSeed("showcase-occluders"));
    const occluders = Array.from({ length: OCCLUDER_COUNT }, () => {
      const z = randomBetween(occluderRandom, -102, 1.4);
      const [x, y] = clearCorridor(occluderRandom, z, 4.2, 3.05, -16);
      const size = 0.42 + Math.pow(occluderRandom(), 1.6) * 1.42;
      return {
        position: [x, y, z] as const,
        rotation: [
          occluderRandom() * Math.PI,
          occluderRandom() * Math.PI,
          occluderRandom() * Math.PI,
        ] as const,
        scale: [
          size * randomBetween(occluderRandom, 0.72, 1.28),
          size * randomBetween(occluderRandom, 0.6, 1.2),
          size * randomBetween(occluderRandom, 0.5, 1.1),
        ] as const,
      };
    });

    const shardRandom = seededRandom(hashSeed("showcase-shards"));
    const shards = Array.from({ length: SHARD_COUNT }, () => {
      const z = randomBetween(shardRandom, -102, 1);
      const [x, y] = clearCorridor(shardRandom, z, 4, 2.9, -16);
      const size = 0.34 + Math.pow(shardRandom(), 1.35) * 0.86;
      return {
        position: [x, y, z] as const,
        rotation: [
          shardRandom() * Math.PI,
          shardRandom() * Math.PI,
          shardRandom() * Math.PI,
        ] as const,
        // plates, not solids: a shard is only ever a lit sliver edge-on
        scale: [size * 1.45, size * 0.82, size * 0.1] as const,
      };
    });

    // Sparse and large. These are the objects that give the corridor a sense of scale, so
    // they sit further out than the shards and they are allowed to be big.
    const slabRandom = seededRandom(hashSeed("showcase-slabs"));
    const slabs = Array.from({ length: SLAB_COUNT }, () => {
      const z = randomBetween(slabRandom, -96, 0.5);
      const [x, y] = clearCorridor(slabRandom, z, 5.2, 3.6, -18);
      // Skewed low. One slab allowed to fill a quarter of the frame reads as a wall, not
      // as debris, so the draw keeps most of them small and lets a couple run large.
      const size = 0.36 + Math.pow(slabRandom(), 2.1) * 1.5;
      return {
        position: [x, y, z] as const,
        rotation: [
          slabRandom() * Math.PI,
          slabRandom() * Math.PI,
          slabRandom() * Math.PI,
        ] as const,
        scale: [
          size * randomBetween(slabRandom, 0.85, 1.5),
          size * randomBetween(slabRandom, 0.5, 1.1),
          size * randomBetween(slabRandom, 0.04, 0.12),
        ] as const,
      };
    });

    // Many, tiny, and spread right across the corridor including the tube the crystals
    // fly down: a sliver is small enough that it reads as a speck in front of a hull
    // rather than as debris landing on it.
    const sliverRandom = seededRandom(hashSeed("showcase-slivers"));
    const slivers = Array.from({ length: SLIVER_COUNT }, () => {
      const z = randomBetween(sliverRandom, -100, 3);
      const size = 0.028 + Math.pow(sliverRandom(), 2.6) * 0.14;
      return {
        position: [
          randomBetween(sliverRandom, -9.5, 9.5),
          randomBetween(sliverRandom, -5.5, 5.5),
          z,
        ] as const,
        rotation: [
          sliverRandom() * Math.PI,
          sliverRandom() * Math.PI,
          sliverRandom() * Math.PI,
        ] as const,
        // splinters, so one axis runs long and the other two nearly vanish
        scale: [
          size * randomBetween(sliverRandom, 2.2, 5.4),
          size * randomBetween(sliverRandom, 0.5, 1.1),
          size * randomBetween(sliverRandom, 0.06, 0.2),
        ] as const,
      };
    });

    return { motes, occluders, shards, slabs, slivers };
  }, []);

  useEffect(() => {
    fragmentTexture.colorSpace = SRGBColorSpace;
    fragmentTexture.minFilter = LinearFilter;
    fragmentTexture.magFilter = LinearFilter;
    fragmentTexture.needsUpdate = true;
  }, [fragmentTexture]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const edges = edgeRef.current;
    const occluders = occluderRef.current;
    const shards = shardRef.current;
    const slabs = slabRef.current;
    const slivers = sliverRef.current;
    if (!mesh || !edges || !occluders || !shards || !slabs || !slivers) return;

    const write = (target: InstancedMesh, items: typeof populations.motes, second?: InstancedMesh) => {
      items.forEach((item, index) => {
        dummy.position.set(...item.position);
        dummy.rotation.set(...item.rotation);
        dummy.scale.set(...item.scale);
        dummy.updateMatrix();
        target.setMatrixAt(index, dummy.matrix);
        second?.setMatrixAt(index, dummy.matrix);
      });
      target.instanceMatrix.needsUpdate = true;
      if (second) second.instanceMatrix.needsUpdate = true;
    };

    write(mesh, populations.motes, edges);
    write(occluders, populations.occluders);
    write(shards, populations.shards);
    write(slabs, populations.slabs);
    write(slivers, populations.slivers);
  }, [dummy, populations]);

  useFrame(({ clock }, delta) => {
    const pointer = cursorRef.current;
    const group = groupRef.current;
    if (!group) return;

    if (!entered) enteredAt.current = null;
    if (entered && enteredAt.current === null) enteredAt.current = clock.elapsedTime;

    /*
     * ENTRY GATE. The reference frames the whole freeze against a clean cobalt plate: the
     * corridor debris is nowhere to be seen through the plus opening until the artifact has
     * gone past the lens. The field ducks out over a fifth of a second while the flood is
     * blooming, holds at nothing for the burst, and is fully back before the 3s handover so
     * the tail either side of it reads the same. Everything fades to black rather than to
     * transparent, so no population ever changes which pass it renders in.
     */
    const since = enteredAt.current === null ? 0 : clock.elapsedTime - enteredAt.current;
    // There is no transition to hide under reduced motion, and the loop is on demand
    // there, so a single frame landing inside the window would park the field at black
    // and never be asked to bring it back.
    const gate = entered && !reducedMotion
      ? Math.max(
        1 - MathUtils.smoothstep(since, 0, 0.22),
        MathUtils.smoothstep(since, 2.15, 2.8),
      )
      : 1;
    /*
     * P3-6: the debris belongs to the room too. The ambience arc graded the fog, the
     * ground and the radiation, but left every plate in the corridor at full key, so the
     * two darkest chapters still carried a field of near-white slabs and a nine level
     * bloom carried those right across the frame. That single term was most of the gap
     * between a five count reference stop and an eleven count local one.
     */
    const room = entered ? roomLight(progress) : 1;
    const lit = gate * room;
    debrisMaterials.current.forEach((material) => {
      if (material) material.uniforms.uFade.value = lit;
    });
    /*
     * THE MARK OWNS THE OPENING FRAME. The grey-white slabs are the brightest objects the
     * field has, and the corridor clears them in world units, which is a cylinder rather
     * than a cone: the same plate that sits well outside the tube twenty units back covers
     * a seventy by fifty pixel rectangle of the frame from there, and at two of the seven
     * pointer positions one of them landed square on the artifact and buried a registration
     * tick under it. No world radius can fix that, because the artifact chases the pointer
     * across four fifths of the frame. So the slabs stand down while the mark is up and
     * arrive with the camera, on the same clock the entry gate below already runs.
     */
    const slabMaterial = debrisMaterials.current[1];
    if (slabMaterial) {
      slabMaterial.uniforms.uFade.value = lit
        * (entered ? 0.16 + 0.84 * MathUtils.smoothstep(since, 0.05, 0.9) : 0.16);
    }
    // The slivers are a second act event. They arrive with the dusk and they carry the
    // colour the back half of the reference has and the front half does not.
    const sliverMaterial = debrisMaterials.current[2];
    if (sliverMaterial) {
      sliverMaterial.uniforms.uFade.value = gate
        * (0.18 + 0.82 * MathUtils.smoothstep(progress, 0.3, 0.62));
    }
    if (moteMaterial.current) {
      moteMaterial.current.color.copy(moteTint).multiplyScalar(lit);
      moteMaterial.current.emissiveIntensity = (entered ? 0.045 : 0.1) * lit;
    }
    if (occluderMaterial.current) {
      occluderMaterial.current.color.copy(occluderTint).multiplyScalar(gate);
    }

    if (reducedMotion) return;
    group.rotation.z = Math.sin(clock.elapsedTime * 0.035) * 0.015 + pointer.x * 0.012;
    group.rotation.y = MathUtils.damp(group.rotation.y, pointer.x * -0.025, 3.2, delta);
    group.position.x = MathUtils.damp(group.position.x, pointer.x * -0.3, 3.2, delta);
    group.position.y = MathUtils.damp(group.position.y, pointer.y * -0.16, 3.2, delta);
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, FRAGMENT_COUNT]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.072, 0]} />
        <meshStandardMaterial
          ref={moteMaterial}
          map={fragmentTexture}
          color="#202039"
          emissive="#000b5c"
          emissiveIntensity={entered ? 0.045 : 0.1}
          metalness={1}
          roughness={0.1}
        />
      </instancedMesh>
      <instancedMesh ref={edgeRef} args={[undefined, undefined, FRAGMENT_COUNT]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.0735, 0]} />
        <meshBasicMaterial
          color="#0a1660"
          wireframe
          transparent
          opacity={entered ? 0.014 : 0.025}
          depthWrite={false}
        />
      </instancedMesh>
      {/* Matte black chunks. They carry no light of their own; they exist to punch holes
          in the radiation wash so the field has foreground. */}
      <instancedMesh ref={occluderRef} args={[undefined, undefined, OCCLUDER_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial ref={occluderMaterial} color="#04040e" roughness={0.86} metalness={0.06} />
      </instancedMesh>
      {/* Thin reflective plates. The body stays dark so the shard only announces itself
          where the key catches a face, which is what reads as a lit sliver rather than a
          lavender card floating in the field. */}
      <instancedMesh ref={shardRef} args={[undefined, undefined, SHARD_COUNT]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.5, 0]} />
        <shaderMaterial
          ref={(node) => {
            debrisMaterials.current[0] = node;
          }}
          uniforms={shardUniforms}
          vertexShader={DEBRIS_VERTEX_SHADER}
          fragmentShader={DEBRIS_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      {/* The big grey-white slabs. Sparse enough to stay events rather than wallpaper, and
          bright enough on a caught face that the field reads as lit space with objects in
          it instead of a navy gradient. */}
      <instancedMesh ref={slabRef} args={[undefined, undefined, SLAB_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <shaderMaterial
          ref={(node) => {
            debrisMaterials.current[1] = node;
          }}
          uniforms={slabUniforms}
          vertexShader={DEBRIS_VERTEX_SHADER}
          fragmentShader={DEBRIS_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      {/* The chromatic splinters. One instanced draw of a shared unit box, so a hundred
          and sixty of them cost the same as the thirty slabs above. */}
      <instancedMesh ref={sliverRef} args={[undefined, undefined, SLIVER_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <shaderMaterial
          ref={(node) => {
            debrisMaterials.current[2] = node;
          }}
          uniforms={sliverUniforms}
          vertexShader={DEBRIS_VERTEX_SHADER}
          fragmentShader={DEBRIS_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/*
 * P1-10: the cobalt has to travel with the camera. A fixed world light gets left behind
 * within one chapter, which is why the first act read as a dark room with a blue lamp
 * instead of a flooded one. This is a camera-anchored additive gradient sitting behind the
 * featured crystal, so objects silhouette into it and the corners still fall to black.
 */
const RADIATION_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RADIATION_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uAspect;
  uniform vec2 uCenter;

  varying vec2 vUv;

  void main() {
    // Not a screen-space circle. The reference wash is wider than it is tall: it reaches
    // the side edges of the frame while the top and bottom corners stay black, so the
    // horizontal axis is only part-compensated for aspect.
    vec2 offset = (vUv - 0.5 - uCenter) * vec2(uAspect * 0.58, 1.0);
    float distance = length(offset) / max(0.0001, uRadius);
    // Three lobes, not two: a tight core sitting on the object, a shoulder that reaches
    // about a crystal width past it, and a wide skirt that dies well before the corners.
    float skirt = exp(-distance * distance * 1.25);
    float halo = exp(-distance * distance * 4.4);
    float core = exp(-distance * distance * 16.0);
    // A gaussian never reaches zero, and the sRGB encode turns whatever is left of it into
    // twenty counts of navy in every corner of the frame. The reference holds a literal
    // zero out there, so the wash is windowed to a finite extent: it still reaches the
    // side edges, and past the shoulder of that window there is nothing at all.
    float reach = 1.0 - smoothstep(0.46, 0.9, distance);
    float amount = (skirt * 0.2 + halo * 0.62 + core * 0.72) * reach * uOpacity;
    gl_FragColor = vec4(uColor * amount, 1.0);
  }
`;

type HeroAnchor = { x: number; y: number; weight: number };

function RadiationGlow({
  entered,
  progress,
  heroAnchorRef,
}: Pick<ShowcaseSceneProps, "entered" | "progress"> & {
  heroAnchorRef: MutableRefObject<HeroAnchor>;
}) {
  const meshRef = useRef<Mesh>(null);
  // R3F copies the uniforms object onto the material rather than adopting it, so every
  // per-frame write has to go through the material itself.
  const materialRef = useRef<ShaderMaterial>(null);
  const enteredAt = useRef<number | null>(null);
  const forward = useMemo(() => new Vector3(), []);
  const initialUniforms = useMemo(() => ({
    // All but pure blue. The reference wash reads 0/0/114 in the frame above a hero and
    // any green in the source colour survives the sRGB encode as a visible grey cast.
    uColor: { value: new Color("#0512ff") },
    uOpacity: { value: 0 },
    uRadius: { value: 0.52 },
    uAspect: { value: 1 },
    uCenter: { value: new Vector2(0, 0.05) },
  }), []);

  useFrame(({ camera, size }) => {
    const mesh = meshRef.current;
    const uniforms = materialRef.current?.uniforms;
    if (!mesh || !uniforms) return;

    if (!entered) enteredAt.current = null;
    // Wall time, not clock.elapsedTime: the capture hook switches the frameloop, which
    // resets the render clock and would send this ramp back to zero every time a stop is
    // frozen. The opening reveal in ProjectCrystal is keyed off performance.now for the
    // same reason.
    if (entered && enteredAt.current === null) enteredAt.current = performance.now();
    /*
     * The room lights come up as the gate leaves, not on the click. Snapping the wash to
     * its chapter level within half a second lit the frame through exactly the stretch the
     * reference holds as dark as its starter. It is fully arrived well before the 3s
     * handover, so both sides of the tail read the same.
     */
    const arrival = enteredAt.current === null
      ? 0
      : MathUtils.smoothstep((performance.now() - enteredAt.current) / 1000, 0.55, 1.95);

    const distance = 24;
    const height = 2 * Math.tan(MathUtils.degToRad(("fov" in camera ? camera.fov : 50) * 0.5)) * distance;
    const width = height * (size.width / Math.max(1, size.height));
    camera.getWorldDirection(forward);
    mesh.position.copy(camera.position).addScaledVector(forward, distance);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.set(width * 1.3, height * 1.3, 1);
    uniforms.uAspect.value = width / Math.max(0.0001, height);

    // Chapter centres are where the radiation peaks; the gaps between them stay darker.
    const travel = projectFloat(progress);
    const toChapter = Math.abs(travel - Math.round(travel));
    const hero = 1 - MathUtils.smoothstep(toChapter, 0.06, 0.44);
    const dusk = duskAmount(progress);
    const ambience = ambienceAt(progress);
    const finale = MathUtils.smoothstep(progress, 0.93, 0.995);

    /*
     * These read absurdly small and they are not. The glow is added in the linear buffer,
     * where the sRGB encode multiplies a shadow lift by roughly twenty on the way out, so
     * hundredths here land as a wash filling most of the frame.
     */
    const journey = (0.003 + hero * 0.16) * ambience * (1 - dusk * 0.42);
    const target = entered ? Math.max(journey, finale * 0.009) * arrival : 0;

    /*
     * P2-2: the wash belongs to the object, not to the camera. Parked on frame centre it
     * read as a lamp behind the lens; the reference puts it wherever the featured crystal
     * happens to be, so a chapter sitting high left has its light high left with it.
     */
    const anchor = heroAnchorRef.current;
    const follow = MathUtils.clamp(anchor.weight, 0, 1);
    // Read then clear: the crystals write after this callback in the same frame, and the
    // strongest claim wins, so the accumulator has to start every frame empty.
    anchor.weight = 0;
    const targetX = anchor.x * 0.5 * follow;
    const targetY = MathUtils.lerp(0.05, anchor.y * 0.5, follow);
    const center = uniforms.uCenter.value as Vector2;
    center.x += (targetX - center.x) * 0.07;
    center.y += (MathUtils.lerp(targetY, 0, finale) - center.y) * 0.07;

    uniforms.uOpacity.value += (target - uniforms.uOpacity.value) * 0.08;
    // Tighter than it was, and tighter still on a hero stop: the glow has to hug the
    // object rather than flood the frame, which is what keeps the corners at black.
    uniforms.uRadius.value = MathUtils.lerp(
      MathUtils.lerp(0.48, 0.68, hero) - dusk * 0.06,
      0.3,
      finale,
    );
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={initialUniforms}
        vertexShader={RADIATION_VERTEX_SHADER}
        fragmentShader={RADIATION_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/*
 * P1-1: the last screen still has a field in it. The travelling corridor is spent by the
 * time the camera reaches the contact lockup, so the finale carries its own band of debris
 * anchored to the camera: dark chunks and thin plates spread across the whole frame at a
 * range of depths, so the type stands inside the field rather than on an empty page.
 */
function FinaleDebris({ progress, reducedMotion }: Pick<ShowcaseSceneProps, "progress" | "reducedMotion">) {
  const groupRef = useRef<Group>(null);
  const chunkRef = useRef<InstancedMesh>(null);
  const edgeRef = useRef<InstancedMesh>(null);
  const plateRef = useRef<InstancedMesh>(null);
  const sliverRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const forward = useMemo(() => new Vector3(), []);
  // uFade is declared by the shared debris shader, so it has to be declared here too.
  // Leaving it out only worked because three.js reuses one program for both materials and
  // the corridor's slabs happened to have written a 1 into it first.
  // Darker bodies, harder rims. The reference's last screen is dark chunks with chromatic
  // fringes on them, not the grey-white plates the corridor carries: the lockup is the
  // only bright thing on it.
  const plateUniforms = useMemo(() => ({
    uBody: { value: new Color("#63708c") },
    uKey: { value: new Color("#ffffff") },
    uRim: { value: 0.94 },
    uGloss: { value: 1.5 },
    uFade: { value: 1 },
  }), []);
  const sliverUniforms = useMemo(() => ({
    uBody: { value: new Color("#3a2f7a") },
    uKey: { value: new Color("#8fd8ff") },
    uRim: { value: 2.4 },
    uGloss: { value: 2.2 },
    uFade: { value: 1 },
  }), []);

  const shards = useMemo(() => {
    const random = seededRandom(hashSeed("showcase-finale-debris"));
    return Array.from({ length: FINALE_DEBRIS_COUNT }, () => {
      const depth = randomBetween(random, 3.2, 21);
      // Spread scales with depth so the near shards stay near the edges and the far ones
      // gather toward the middle, which is what reads as a band rather than a wallpaper.
      const spread = 0.34 + depth * 0.052;
      const size = (0.05 + Math.pow(random(), 1.7) * 0.4) * (0.5 + depth * 0.09);
      return {
        position: [
          randomBetween(random, -9.4, 9.4) * spread,
          randomBetween(random, -5.6, 5.6) * spread,
          -depth,
        ] as const,
        rotation: [
          random() * Math.PI,
          random() * Math.PI,
          random() * Math.PI,
        ] as const,
        scale: [
          size * randomBetween(random, 0.8, 1.5),
          size * randomBetween(random, 0.62, 1.25),
          size * randomBetween(random, 0.12, 0.9),
        ] as const,
        spin: randomBetween(random, -0.16, 0.16),
      };
    });
  }, []);

  /*
   * The bright half of the finale field. Every third chunk is promoted to a big lit plate
   * so the last screen carries the same grey-white slabs with fringed edges the reference
   * shows, instead of a band of matte black pebbles.
   */
  const plates = useMemo(() => {
    const random = seededRandom(hashSeed("showcase-finale-plates"));
    return shards
      .filter((_, index) => index % 3 === 1)
      .map((shard) => ({
        position: shard.position,
        rotation: shard.rotation,
        scale: [
          shard.scale[0] * randomBetween(random, 1.1, 2.05),
          shard.scale[1] * randomBetween(random, 0.95, 1.75),
          shard.scale[2] * randomBetween(random, 0.18, 0.44),
        ] as const,
      }));
  }, [shards]);

  // The same chromatic splinters the corridor carries, kept alive on the last screen so
  // the finale field is peppered rather than emptied.
  const slivers = useMemo(() => {
    const random = seededRandom(hashSeed("showcase-finale-slivers"));
    return Array.from({ length: FINALE_SLIVER_COUNT }, () => {
      const depth = randomBetween(random, 2.6, 18);
      const spread = 0.4 + depth * 0.058;
      const size = (0.014 + Math.pow(random(), 2.4) * 0.05) * (0.6 + depth * 0.08);
      return {
        position: [
          randomBetween(random, -9.4, 9.4) * spread,
          randomBetween(random, -5.6, 5.6) * spread,
          -depth,
        ] as const,
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI] as const,
        scale: [
          size * randomBetween(random, 2.2, 5.2),
          size * randomBetween(random, 0.5, 1.1),
          size * randomBetween(random, 0.06, 0.2),
        ] as const,
      };
    });
  }, []);

  useLayoutEffect(() => {
    const chunks = chunkRef.current;
    const edges = edgeRef.current;
    const platesMesh = plateRef.current;
    const sliversMesh = sliverRef.current;
    if (!chunks || !edges || !platesMesh || !sliversMesh) return;

    shards.forEach((shard, index) => {
      dummy.position.set(...shard.position);
      dummy.rotation.set(...shard.rotation);
      dummy.scale.set(...shard.scale);
      dummy.updateMatrix();
      chunks.setMatrixAt(index, dummy.matrix);
      edges.setMatrixAt(index, dummy.matrix);
    });
    plates.forEach((plate, index) => {
      dummy.position.set(...plate.position);
      dummy.rotation.set(...plate.rotation);
      dummy.scale.set(...plate.scale);
      dummy.updateMatrix();
      platesMesh.setMatrixAt(index, dummy.matrix);
    });
    slivers.forEach((sliver, index) => {
      dummy.position.set(...sliver.position);
      dummy.rotation.set(...sliver.rotation);
      dummy.scale.set(...sliver.scale);
      dummy.updateMatrix();
      sliversMesh.setMatrixAt(index, dummy.matrix);
    });
    chunks.instanceMatrix.needsUpdate = true;
    edges.instanceMatrix.needsUpdate = true;
    platesMesh.instanceMatrix.needsUpdate = true;
    sliversMesh.instanceMatrix.needsUpdate = true;
  }, [dummy, plates, shards, slivers]);

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const visible = progress > 0.9;
    group.visible = visible;
    if (!visible) return;

    camera.getWorldDirection(forward);
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.rotation.z += reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.05) * 0.0008;
  });

  return (
    <group ref={groupRef} visible={false}>
      <instancedMesh ref={chunkRef} args={[undefined, undefined, FINALE_DEBRIS_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#07071c" roughness={0.42} metalness={0.72} side={DoubleSide} />
      </instancedMesh>
      {/* A trace of edge, not a drawn cage. Enough to catch the lamp on a silhouette so the
          composer's aberration has something to fringe; any more reads as a debug mesh. */}
      <instancedMesh ref={edgeRef} args={[undefined, undefined, FINALE_DEBRIS_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[0.505, 0]} />
        <meshBasicMaterial color="#3552ff" wireframe transparent opacity={0.1} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={plateRef} args={[undefined, undefined, plates.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <shaderMaterial
          uniforms={plateUniforms}
          vertexShader={DEBRIS_VERTEX_SHADER}
          fragmentShader={DEBRIS_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={sliverRef} args={[undefined, undefined, FINALE_SLIVER_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <shaderMaterial
          uniforms={sliverUniforms}
          vertexShader={DEBRIS_VERTEX_SHADER}
          fragmentShader={DEBRIS_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

function EntryShardCurtain({
  entered,
  reducedMotion,
  cursorRef,
}: Pick<ShowcaseSceneProps, "entered" | "reducedMotion" | "cursorRef">) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const finePointer = useFinePointer();
  const texture = useLoader(
    TextureLoader,
    "/prototype/showcase/media/entry-cinematic-v3.png",
  ) as Texture;
  /*
   * The curtain is foreground depth, not confetti on the drawing. Shards used to be seeded
   * anywhere in the frame at any size, and roughly twenty of them landed inside the mark's
   * own outline: one sitting on the baseline, one on a registration tick, a pair crowding
   * the drawn wall. Every candidate is projected forward onto the artifact's plane now,
   * where the two share a frame, and rejected if it covers the mark. The oversized tier is
   * gone with them, because a shard that reads as a plate at the lens is not depth either.
   *
   * The keep-out is measured from the curtain's own origin, so the curtain has to travel
   * with the mark or the exclusion is only true at dead centre. It used to slide the
   * opposite way, which is how a shard came to sit on the baseline at every off-centre
   * pointer position. The travel is carried in ENTRY_CURTAIN_FOLLOW below, and the margins
   * here are what is left over once it is: the residual excursion across the depth band,
   * plus the growth of the mark's own footprint under the roll at the frame corners.
   */
  const shards = useMemo(() => {
    const random = seededRandom(hashSeed("showcase-entry-curtain"));
    const keepOutX = ENTRY_LOGO_WIDTH * 0.58 * 0.5 + 0.62;
    const keepOutY = ENTRY_LOGO_HEIGHT * 0.58 * 0.5 + 0.55;
    return Array.from({ length: ENTRY_FOREGROUND_COUNT }, () => {
      const depth = randomBetween(random, ENTRY_CURTAIN_NEAR, ENTRY_CURTAIN_FAR);
      const scale = randomBetween(random, 0.24, 0.62);
      // A shard nearer the lens covers more of the frame per world unit, so both the
      // position and the shard's own reach are carried to the artifact's plane first.
      const cone = 4.9 / (5 - depth);
      const reach = 0.2 * scale * cone;
      let x = 0;
      let y = 0;
      let clear = false;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        x = randomBetween(random, -4.8, 4.8);
        y = randomBetween(random, -3.1, 3.1);
        if (Math.abs(x) * cone - reach > keepOutX) { clear = true; break; }
        if (Math.abs(y) * cone - reach > keepOutY) { clear = true; break; }
      }
      // Rejection sampling with no fallback is not an exclusion: sixteen misses used to
      // keep the last sample, mark or no mark. A shard that cannot find a seat is carried
      // out to the edge of the keep-out instead of being seated on the drawing.
      if (!clear) x = Math.sign(x || 1) * ((keepOutX + reach + 0.18) / cone);
      return {
        position: [x, y, depth] as const,
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI] as const,
        scale,
      };
    });
  }, []);

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
  }, [texture]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    shards.forEach((shard, index) => {
      dummy.position.set(...shard.position);
      dummy.rotation.set(...shard.rotation);
      dummy.scale.setScalar(shard.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, shards]);

  useFrame(({ clock, size, viewport }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const pointer = cursorRef.current;
    const chasing = finePointer && !reducedMotion && !entered;
    const [chaseX, chaseY] = entryChaseTarget(
      chasing ? pointer.x : 0,
      chasing ? pointer.y : 0,
      viewport,
      size.width,
    );
    group.position.z = MathUtils.damp(group.position.z, entered ? -8 : 0, 2.25, delta);
    // Same damping rate as the artifact, or a fast flick opens a gap between the two and
    // the keep-out stops holding for as long as the lag lasts.
    group.position.x = MathUtils.damp(
      group.position.x,
      chaseX * ENTRY_CURTAIN_FOLLOW,
      5.2,
      delta,
    );
    group.position.y = MathUtils.damp(
      group.position.y,
      chaseY * ENTRY_CURTAIN_FOLLOW,
      5.2,
      delta,
    );
    group.rotation.z = Math.sin(clock.elapsedTime * 0.11) * 0.025;
    group.visible = !entered || group.position.z > -7.7;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, ENTRY_FOREGROUND_COUNT]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial
          map={texture}
          color="#11142b"
          emissive="#000d68"
          emissiveIntensity={0.1}
          metalness={1}
          roughness={0.08}
        />
      </instancedMesh>
    </group>
  );
}

const ENTRY_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 displaced = position;
    // A fifth of what it was, because the prism under it is a third of what it was. The
    // media face rides a fraction of the panel's depth clear of the prism front, and a
    // ripple wider than that gap puts the footage back inside the volume it sits on.
    displaced.z += sin((uv.y * 11.0 + uv.x * 4.0 + uSeed) * 3.14159 + uTime * 0.7) * 0.0012;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const ENTRY_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uSeed;
  uniform float uFlare;
  uniform float uPoured;
  uniform vec2 uPointer;
  uniform vec2 uFaceOrigin;
  uniform vec2 uFaceSize;
  uniform vec4 uCrop;
  // The drawn silhouette's own box, so every panel can say where it sits on the mark.
  uniform vec4 uSheet;
  uniform float uAngle;
  uniform float uExposure;
  varying vec2 vUv;

  float hash(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec2 hash2(vec2 value) {
    return fract(sin(vec2(
      dot(value, vec2(127.1, 311.7)),
      dot(value, vec2(269.5, 183.3))
    )) * 43758.5453123);
  }

  // Worley F2 minus F1: the ridge between neighbouring seeds is the crack. Feeding it
  // slab coordinates rather than face UVs keeps one continuous ice network running
  // across the whole artifact instead of restarting inside every mosaic face.
  float crackRidge(vec2 point) {
    vec2 cellId = floor(point);
    vec2 offsetInCell = fract(point);
    float nearest = 8.0;
    float second = 8.0;

    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 neighbour = vec2(float(x), float(y));
        vec2 delta = neighbour + hash2(cellId + neighbour) - offsetInCell;
        float spread = dot(delta, delta);
        if (spread < nearest) {
          second = nearest;
          nearest = spread;
        } else if (spread < second) {
          second = spread;
        }
      }
    }

    return sqrt(second) - sqrt(nearest);
  }

  void main() {
    /*
     * ONE SKIN, NOT TWELVE. The sample point is the artifact's own surface coordinate, so
     * the drawn half reads one window continuously across every panel boundary. Keyed to
     * the panel's own UV it restarted inside each cell, and the wall read as exactly what
     * it is built from: a three by three grid with hard content jumps at every seam, fully
     * present at zero tilt before the chase had touched it. Slab is the same coordinate the
     * freeze already runs on, so the ice and the footage share one frame of reference.
     */
    vec2 slab = uFaceOrigin + (vUv - 0.5) * uFaceSize;
    vec2 sheet = (slab - uSheet.xy) / uSheet.zw;
    vec2 localUv = sheet - 0.5;
    float c = cos(uAngle);
    float s = sin(uAngle);
    localUv = mat2(c, -s, s, c) * localUv;
    vec2 uv = uCrop.xy + (localUv + 0.5) * uCrop.zw;
    // The tear rows run on the sheet too. Keyed per panel, a glitch row stopped dead on a
    // panel edge and handed the grid straight back on the frames it fired.
    float row = floor(sheet.y * 46.0);
    float tick = floor(uTime * 7.0);
    float gate = step(0.94, hash(vec2(row, tick)));
    float jitter = (hash(vec2(row, tick + 3.0)) - 0.5) * (0.003 + gate * 0.055);
    uv.x += jitter + uPointer.x * 0.004;
    uv.y += sin(uv.x * 19.0 + uTime * 0.8) * 0.0025;
    /*
     * Every sample is pinned inside its own crop window rather than to the whole plate.
     * The crops are chosen off the parts of the atlas that are footage, and a glitch row
     * that can slide a fortieth of the plate sideways is enough to walk one straight back
     * onto a sphere or into the sunset.
     */
    vec2 lo = uCrop.xy - 0.02;
    vec2 hi = uCrop.xy + uCrop.zw + 0.02;
    uv = clamp(uv, lo, hi);

    // Hard border fringing, not a speckle: the source splits the channels far enough
    // that every cell edge carries a magenta and cyan seam. One split for the whole skin,
    // because a per panel one is a per panel colour and the seam between two of them shows.
    float split = 0.0105 + gate * 0.036;
    vec3 media = vec3(
      texture2D(uTexture, clamp(uv + vec2(split, 0.0), lo, hi)).r,
      texture2D(uTexture, uv).g,
      texture2D(uTexture, clamp(uv - vec2(split, 0.0), lo, hi)).b
    );

    /*
     * The shadow lift, then the cell's own gain. Every crop is fitted to one working level
     * on the way in, but a matched mean is not a matched cell: a window that is a bright
     * streak over black still reads as a hole beside an evenly lit one. The lift raises what
     * is left in the shadows before the gain lands the window on the level, and the gain is
     * solved against these exact two numbers, so the pair always arrive together. Held below
     * the mosaic's old ceiling either way: the mark's panels are three times the area the
     * lattice faces were, and a wall of clipped white takes the line work with it.
     */
    vec3 exposed = min(pow(media + 0.012, vec3(0.46)) * uExposure, vec3(1.04));

    float luma = dot(exposed, vec3(0.2126, 0.7152, 0.0722));
    /*
     * Three per cent of the plate's own chroma left, not ten. The still life is not cobalt
     * and a tenth of it is enough to see: measured over the lit skin, blue was not the
     * leading channel on six per cent of it at every angle, and the samples read mint and
     * sage rather than anything the field contains.
     */
    vec3 monochrome = mix(exposed, vec3(luma), 0.97);
    /*
     * A toe that never reaches zero and a shoulder that never reaches paper. Cutting the
     * ramp at 0.04 crushed everything under it to black, so a window metered correctly on
     * its mean still came out a fifth dead: measured inside the skin, nineteen per cent of
     * it sat under twelve counts beside eight per cent blown, and the gable read as a hole
     * punched under the roof peak.
     */
    monochrome = smoothstep(vec3(-0.14), vec3(1.04), monochrome);

    float shade = dot(monochrome, vec3(0.2126, 0.7152, 0.0722));
    float scan = 0.94 + 0.06 * sin(sheet.y * 940.0 + uTime * 3.0);
    float grain = hash(gl_FragCoord.xy + vec2(uSeed * 41.0, tick)) - 0.5;
    // Flat and bright rather than glossy and black: the floor lifts to a navy haze and
    // the highlights carry, so a cell reads as bleached footage at any tilt.
    vec3 color = monochrome * scan * (0.60 + luma * 0.22) + vec3(0.034, 0.046, 0.086);
    /*
     * A TEAR IS A JUMP IN LEVEL, NOT A CHANGE OF COLOUR. The gated rows used to take red
     * and blue up together and leave green exactly where it was, which is the definition of
     * a violet band: measured over the lit skin the tears sat at hue 248 against a wall at
     * 232, they were the only chromatic event anywhere on the drawn half, and a tenth to a
     * seventh of that half was pinned against the green floor below by these two adds
     * alone. The red re-injection went with them, for the same reason and to the same end.
     * The row takes one cool lift whose own hue is the wall's, so a tear reads as the
     * exposure breaking rather than as a lavender stripe laid across the footage.
     */
    color += gate * vec3(0.038, 0.044, 0.066);
    color.b += max(0.0, exposed.b - exposed.g) * 0.16;
    // Grain rides the level rather than sitting under it. At a flat amplitude the noise
    // alone swung the shadow floor through nine counts and put a share of the skin back
    // under the black point the toe above was raised to clear.
    color += grain * (0.008 + 0.028 * shade);
    color = clamp((color - 0.018) * 1.15 + vec3(0.005, 0.008, 0.022), 0.0, 1.0);
    /*
     * COBALT, DOWN TO THE FRINGING. The channel split is the plate's own border colour and
     * it stays, but split far enough across a lit edge it lands on salmon, and salmon is a
     * colour the field does not contain anywhere. Red is held to the cool channels rather
     * than removed, so magenta and cyan seams survive intact and warm ones cannot happen.
     *
     * Green is held first, and to blue alone. Clamping red against whichever of the other
     * two led was a gate that green walked straight through: a sage or mint pixel is its
     * own permission slip under it, and the warm gate it did impose sat just above the
     * threshold the last pass measured against. Blue leads every lit pixel now, so the
     * cyan seams survive as blue-equal and the magenta ones as blue-equal too.
     */
    color.g = min(color.g, color.b * 1.01 + 0.004);
    color.r = min(color.r, max(color.g, color.b) * 1.015 + 0.004);
    /*
     * And a floor under green, held against whichever cool channel is lower. The two clamps
     * above only ever push green down, and nothing floored it against both, so a fringe with
     * red and blue level and green alone suppressed came out violet: measured over the lit
     * skin, five per cent of it ran min(r,b) minus g past ten counts, at a hue near 285
     * degrees against a field at 241. The warm axis was shut and the magenta one was left
     * open. Green can still never lead, so blue keeps the lead and the channel split's own
     * cyan and magenta seams survive as cool ones.
     *
     * A quarter of the slack it used to carry. At eighteen thousandths the floor was not a
     * clamp, it was a seat: the tear rows above wanted to run further violet than that and
     * every one of their pixels came to rest on it exactly, so a tenth of the lit skin
     * measured min(r, b) minus g at four or five counts by construction and no threshold
     * above five could ever fire. Six thousandths is a count and a half, which is under the
     * step between two neighbouring values on this wall.
     */
    color.g = max(color.g, min(color.r, color.b) - 0.006);
    color *= 1.0 - uPoured;

    /*
     * FLARE. The climax of the transition is the artifact freezing over: media crushes
     * to black while a cracked-ice network lights up white across every face. A per
     * region delay makes the freeze travel over the slab rather than snapping on.
     */
    float front = hash(floor(slab * 3.4) + 11.0) * 0.5;
    float freeze = smoothstep(front, front + 0.5, uFlare);
    float ridge = crackRidge(slab * 10.5);
    /*
     * The frozen plate is bimodal, and by a long way. Measured across the reference slab at
     * 1800ms: three quarters of it under 16 counts, half a percent between 16 and 32, five
     * percent between 180 and 220 and eight percent past 220. So the seam is a wide bar
     * with a blown centre, sitting straight on a black cell floor, and it is drawn here as
     * two bands rather than one ramp. One smoothstep cannot do it: widening a single ramp
     * to reach the 180 share carried the 220 share up with it, and the soft halo it used to
     * have was filling exactly the 16 to 32 band the reference leaves empty.
     */
    float core = 1.0 - smoothstep(0.030, 0.050, ridge);
    float shoulder = 1.0 - smoothstep(0.052, 0.105, ridge);
    float ice = max(core, shoulder * 0.845);
    // No foot on the ramp either: whatever the seam touches at all starts a fifth of the
    // way up, so nothing lands between the cell floor and the first step of the ice.
    ice = step(0.012, ice) * max(ice, 0.18);
    // The bleach is white, and on a cobalt field a white with red in it is a warm white.
    // Blue leads by a hair so the blown centre of a seam still reads as the field's own.
    vec3 frozen = mix(
      color * 0.035 + vec3(0.001, 0.002, 0.007),
      vec3(0.94, 0.97, 1.0),
      ice
    );
    color = mix(color, frozen, freeze);

    gl_FragColor = vec4(color, mix(1.0, freeze, uPoured));
  }
`;

/*
 * The entry artifact is the FullBuild mark standing up: the half drawn, half poured shed
 * from src/app/icon.svg, extruded off its own baseline. Every coordinate in this region is
 * written in that file's viewBox units so the construction can be read straight against
 * the path data, and entryLogoX / entryLogoY are the only place the mapping into world
 * space happens.
 *
 *   baseline     M8 82 H92
 *   drawn half   M18 82 V48 L35 32 L52 48 V82, plus M25 76 l12 -12 and M25 66 l9 -9
 *   poured half  M52 48 H82 V82 and M52 48 L68 32 L82 46, filled solid
 *
 * Both halves share the party wall at x52, which is why the two panel grids below start
 * and stop on it: the shed has to read as one construction cut down the middle, not as
 * two buildings parked next to each other.
 */
const ENTRY_LOGO_UNIT = 20;
const ENTRY_LOGO_ORIGIN_X = 50;
const ENTRY_LOGO_ORIGIN_Y = 57;

function entryLogoX(x: number) {
  return (x - ENTRY_LOGO_ORIGIN_X) / ENTRY_LOGO_UNIT;
}

// The viewBox counts downward and the scene counts upward, so the mark is flipped here
// once instead of at every call site.
function entryLogoY(y: number) {
  return (ENTRY_LOGO_ORIGIN_Y - y) / ENTRY_LOGO_UNIT;
}

const ENTRY_LOGO_WIDTH = entryLogoX(92) - entryLogoX(8);
const ENTRY_LOGO_HEIGHT = entryLogoY(32) - entryLogoY(82);

/*
 * THE CHASE IS ONE TRAVEL, READ TWICE. The artifact runs at the pointer, and the foreground
 * curtain has to know where it went: the curtain's keep-out is measured from its own origin,
 * so a curtain that does not travel with the mark only excludes the mark at dead centre.
 * Both read the target from here rather than each writing their own copy of it.
 */
const ENTRY_CHASE_X = 2.3;
const ENTRY_CHASE_Y = 1.42;
const ENTRY_CHASE_RISE = 0.12;
// The curtain sits between the lens and the mark, so a world unit of curtain travel covers
// more frame than a world unit of artifact travel. This is the reciprocal of the mean
// projection factor across the depth band below, which is what leaves the residual small
// enough for the keep-out margins to absorb at the frame corners.
const ENTRY_CURTAIN_NEAR = 1.5;
const ENTRY_CURTAIN_FAR = 2.6;
const ENTRY_CURTAIN_FOLLOW = 2 / (4.9 / (5 - ENTRY_CURTAIN_NEAR) + 4.9 / (5 - ENTRY_CURTAIN_FAR));

function entryViewportScale(pixelWidth: number) {
  return pixelWidth < 768 ? 0.44 : 0.58;
}

function entryChaseTarget(
  pointerX: number,
  pointerY: number,
  viewport: { width: number; height: number },
  pixelWidth: number,
) {
  /*
   * The pointer still moves the artifact one to one, but its reach is bounded by the
   * frustum, so a bottom corner parks the mark against the edge instead of posting it off
   * screen. The bound is measured from the live viewport, so a narrow window gets a narrow
   * reach rather than no chase at all.
   */
  const scale = entryViewportScale(pixelWidth);
  const reachX = Math.max(0.5, viewport.width / 2 - ENTRY_LOGO_WIDTH * scale * 0.42);
  const reachY = Math.max(0.4, viewport.height / 2 - ENTRY_LOGO_HEIGHT * scale * 0.42);
  return [
    MathUtils.clamp(pointerX * ENTRY_CHASE_X, -reachX, reachX),
    MathUtils.clamp(pointerY * ENTRY_CHASE_Y + ENTRY_CHASE_RISE, -reachY, reachY),
  ] as const;
}

type EntryLogoPoint = readonly [number, number];

function entryGridPanels(columns: number[], rows: number[]): EntryLogoPoint[][] {
  const panels: EntryLogoPoint[][] = [];
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns.length - 1; column += 1) {
      const left = columns[column];
      const right = columns[column + 1];
      const top = rows[row];
      const bottom = rows[row + 1];
      panels.push([[left, top], [right, top], [right, bottom], [left, bottom]]);
    }
  }
  return panels;
}

/*
 * The drawn half: a nine panel wall under three gable pieces. The wall is cut into panels
 * rather than left as one face because the media skin, the facet line work and the release
 * all key off the panel, and a single plate would give the artifact nothing to shatter into.
 */
const ENTRY_DRAWN_PANELS: EntryLogoPoint[][] = [
  ...entryGridPanels([18, 29, 40, 52], [48, 59.5, 71, 82]),
  [[18, 48], [26.5, 40], [35, 40], [35, 48]],
  [[35, 48], [35, 40], [43.5, 40], [52, 48]],
  [[26.5, 40], [35, 32], [43.5, 40]],
];

/*
 * The poured half takes the same cut, so the party wall lines up panel for panel. Its
 * gable is the asymmetric one the mark draws: apex at x68, and the right eave landing two
 * units above the wall head, which is what keeps the poured volume from reading as a
 * mirror of the drawn one.
 */
const ENTRY_POURED_PANELS: EntryLogoPoint[][] = [
  ...entryGridPanels([52, 63, 73, 82], [48, 60, 71, 82]),
  [[52, 48], [60, 40], [68, 40], [68, 48]],
  [[68, 48], [68, 40], [76, 40], [82, 46], [82, 48]],
  [[60, 40], [68, 32], [76, 40]],
];

/*
 * ONE POUR, ONE BODY. The cells above are what the pour shatters into, and nothing else:
 * held together they are twelve coplanar prisms whose shared boundaries fight for the depth
 * buffer, and every one of those boundaries picked itself out as a seam. So the pour is one
 * extrusion of its own silhouette at rest, and the cells only take over on the release.
 * This is the mark's own poured path closed onto the baseline, with the collinear eaves at
 * x60 and x76 dropped: they sit on the gable runs rather than turning them.
 */
const ENTRY_POURED_SILHOUETTE: EntryLogoPoint[] = [
  [52, 82], [52, 48], [68, 32], [82, 46], [82, 82],
];

type EntryPanel = {
  // World XY, centred on the panel and already seam inset, ready to become a Shape.
  outline: Array<[number, number]>;
  // The same panel grown by the skin reach, so the media closes onto its neighbours and
  // onto the strokes instead of leaving the seam open to the field.
  skin: Array<[number, number]>;
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  // The poured half: solid near-black volume, no media, no facet line work.
  poured: boolean;
  // 0 to 1 stagger: how far ahead of the pack this panel runs at the lens on release.
  release: number;
};

// The gap cut out of every panel so the shed reads as built tiles rather than one painted
// plane. It is also what the weld pays back frame by frame while the artifact is held shut.
// Held to a hairline: any wider and the party wall opens into a navy channel and the media
// stops reaching the strokes that are meant to bound it.
const ENTRY_SEAM = 0.004;

/*
 * How far the media skin grows past its own panel. The seam above is what makes the drawn
 * half read as built tiles, but a seam is a hole: the field is brighter than the mark and it
 * came straight through every join as a lit slot, and around the outside the skin stopped
 * short of the strokes that are meant to bound it. The skin closes both, and it is held
 * under the stroke's own half width so it can never be seen crossing a line.
 *
 * The skin grows half the reach past its own panel, so this is a pixel and a quarter of
 * overlap on every join and seven thousandths of overhang on the silhouette, which is still
 * inside the stroke that bounds it. The overlap is what the neighbour's own tilt and z
 * jitter have to be absorbed by, and at four tenths of a pixel it was not enough: the prism
 * under the skin came back through the join as a dark hairline down the panel column at x29
 * wherever the chase put real yaw on the artifact.
 */
const ENTRY_SKIN_REACH = 0.014;

// The working level every crop is exposed to, in linear light. One number for the whole
// skin is what makes twelve windows off one uneven plate read as one piece of footage.
const ENTRY_SKIN_LEVEL = 0.28;
/*
 * THE SHEET. The drawn silhouette's own box, in world units, which is what every panel
 * measures its place on the mark against. One level was never enough on its own: twelve
 * windows metered to the same mean are still twelve pieces of footage, and the wall read
 * as the grid it is built from, with the content jumping at each of the six seams at zero
 * tilt. The drawn half takes one window and the panels take their share of it.
 */
const ENTRY_SHEET_ORIGIN: readonly [number, number] = [entryLogoX(18), entryLogoY(82)];
const ENTRY_SHEET_SIZE: readonly [number, number] = [
  entryLogoX(52) - entryLogoX(18),
  entryLogoY(32) - entryLogoY(82),
];
/*
 * Which band the one skin window is cut from, and how big it is. Band 1 is the crumpled
 * foil, and it is the only band whose shape is anywhere near the mark's own: the others
 * are wide letterboxes that would have to be stretched four to one up a house.
 */
const ENTRY_SKIN_BAND = 1;
/*
 * And it is cut at the sheet's own proportion. The plate is square, so a window whose sides
 * are in the sheet's ratio arrives on the wall unstretched; the old one was 0.135 by 0.245,
 * which squeezed the drapery to four fifths of its width on the way in.
 */
const ENTRY_SKIN_WINDOW_HEIGHT = 0.16;
const ENTRY_SKIN_WINDOW: readonly [number, number] = [
  ENTRY_SKIN_WINDOW_HEIGHT * (ENTRY_SHEET_SIZE[0] / ENTRY_SHEET_SIZE[1]),
  ENTRY_SKIN_WINDOW_HEIGHT,
];
// Matches the slop the shader allows a glitch row either side of its window. Held back
// from the band edge here so a slid sample still lands on the band rather than past it.
const ENTRY_CROP_SLOP = 0.02;
// How far the one skin is allowed to lean. Full sheet width now rather than one panel's,
// so past a tenth of a radian the corners of the mark walk out of their own window.
const ENTRY_SKIN_TILT = 0.09;
/*
 * The shadow lift the shader applies before the per cell gain, and the pedestal under it so
 * a dead-black texel has something to raise. These are here rather than only in the shader
 * because the gain is solved against them: fit the gain to the raw window and the lift moves
 * the cell straight back off the level it was fitted to.
 */
const ENTRY_SKIN_GAMMA = 0.46;
const ENTRY_SKIN_PEDESTAL = 0.012;
/*
 * WHERE THE PLATE STOPS CARRYING ANYTHING. Below this linear luminance the source is at
 * zero to three counts in eight bit, and a lift cannot raise what was never recorded: the
 * gamma above turns a run of crushed texels into one constant value rather than into
 * detail. Measured on the wall, a window sat on that run read as a flat plate with only the
 * scan line and the grain moving on it, 99 per cent of its pixels inside one sixteen count
 * bucket. So the skin's seat is chosen for how much of the window is still alive.
 */
const ENTRY_SKIN_DEAD = 0.0015;
// How finely the one skin window sweeps its band, per axis. The skin is a single window
// carrying the whole drawn wall, so it is worth searching properly rather than sampling.
const ENTRY_SKIN_SEATS = 9;
// How many seats a cell tries inside its band before it takes the one with the least dead
// black in it. The band is what the crop may not leave; this is what it aims for inside it.
const ENTRY_CROP_TRIES = 10;
// What a crop width of clear air between two cells on the same band is worth against the
// evenness score above. Left at zero, the three cells sharing a band all sat on its one
// flattest corner and the wall repeated the same fold of foil three times.
const ENTRY_CROP_SPACING = 0.6;

/*
 * One thickness for the whole pour, matched into the drawn half's band so the party wall is
 * flush.
 *
 * A THIRD OF WHAT IT WAS, both halves. The rim's value was tuned twice and the band it
 * paints was never the thing that moved: a surface spanning half a depth either side of a
 * stroke plane laid at L projects (L + depth / 2) * sin(yaw) outside that stroke, which at
 * the old numbers was ten screen pixels of extrusion sitting outside the white line work on
 * the down-tilted contour. Dark it read as a hole, bright it read as a second, misregistered
 * outline. At a third of the depth the whole question is a two pixel edge on a drawn line.
 */
const ENTRY_POURED_DEPTH = 0.034;

// How far the poured cells knit past their own outlines once the release has taken them
// apart. Small enough that the pour still stops on the strokes the mark draws around it.
const ENTRY_POURED_KNIT = -0.004;

/*
 * WHERE THE MEDIA FACE RIDES, as a fraction of the panel's own depth. Past the half it
 * clears the prism front; the margin is what keeps it out of the depth buffer's noise now
 * that the extrusion is a rim rather than a slab. A hair further out than it was, because
 * the rim it has to clear is a third the depth it was.
 */
const ENTRY_FACE_LIFT = 0.62;

/*
 * THE POUR'S OWN VALUE. It used to be a near-black diffuse under a broad clearcoat, which
 * meant a near-white key at intensity 1.65 owned every count of it: measured across the
 * seven pointer positions the wall ran from luminance 1, where it vanished into the field
 * and left only its strokes, to luminance 45 as a neutral grey box brighter than the drawn
 * half beside it. A pour has one value. Most of it is carried here, where no angle can move
 * it, and the keys are left to lay the gradient over the top.
 *
 * Held above the field rather than merely off the key. At half a stop the pour landed on
 * luminance 12 against a backdrop that runs from 9 to 152 depending on where the glow
 * falls, so at the centre and the top left the poured house had two counts of separation
 * and survived as its strokes alone: an outline with nothing in it. The value is a
 * saturated cobalt rather than a brighter grey, so the wall gains mass without gaining the
 * neutral box read it was pulled back from.
 *
 * AND THE VALUE IS NOT THE WHOLE JOB. Carried entirely on the emissive the pour answered
 * no light at all: measured over the fill it held three to five distinct colours across
 * nineteen thousand pixels, one of them covering up to 99 per cent, at a luminance standard
 * deviation under two at every pointer position, with the gable and the wall landing within
 * five counts of each other. That is a cut-out standing beside a half that has depth in it.
 * The albedo now carries a real share, so the two low cobalt keys and their falloff lay a
 * gradient across the face and the near-white key models it, while the emissive still holds
 * the floor the chase cannot move. Split roughly half and half rather than all one way: the
 * pour is a volume the light finds, not a lamp.
 */
const ENTRY_POURED_COLOR = "#0b1442";
const ENTRY_POURED_EMISSIVE = "#0c1866";
const ENTRY_POURED_EMISSIVE_LEVEL = 0.52;
/*
 * Rough enough to stay a pour, glossy enough that the keys travel across it. At 0.94 the
 * lobe was so wide that three point lights and a near-white directional averaged into one
 * flat number whatever the tilt, and the wall's own view vector, which does swing across a
 * face this size, had nothing to move.
 */
const ENTRY_POURED_ROUGHNESS = 0.58;

function entryPanel(points: readonly EntryLogoPoint[], poured: boolean, index: number): EntryPanel {
  const random = seededRandom(hashSeed(`entry-${poured ? "poured" : "drawn"}-${index}`));
  const world = points.map(([x, y]) => [entryLogoX(x), entryLogoY(y)] as [number, number]);
  const xs = world.map(([x]) => x);
  const ys = world.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const width = right - left;
  const height = top - bottom;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  /*
   * The seam belongs to the drawn half alone. That half is built tiles and says so; the
   * poured half is one pour, and it takes a negative seam: its cells knit into each other
   * instead of butting. Butted exactly they still showed a grid, because two coplanar
   * meshes each cover their shared edge partly and the two coverages do not add back to
   * one, so a hairline of the field came through every join.
   */
  const seam = poured ? ENTRY_POURED_KNIT : ENTRY_SEAM;
  const insetX = 1 - seam / width;
  const insetY = 1 - seam / height;
  // The poured half's skin is its ice pane, and ice outside the silhouette is ice outside
  // the mark, so that half's skin stops exactly where its body does.
  const skinSeam = poured ? ENTRY_POURED_KNIT : -ENTRY_SKIN_REACH;
  const skinX = 1 - skinSeam / width;
  const skinY = 1 - skinSeam / height;

  return {
    outline: world.map(([x, y]) => [(x - centerX) * insetX, (y - centerY) * insetY]),
    skin: world.map(([x, y]) => [(x - centerX) * skinX, (y - centerY) * skinY]),
    /*
     * The poured half sits flat and square. Only the drawn half carries the z jitter and
     * the off-axis tilt, because that is the half that is meant to read as a sketch with
     * loose sheets in it; a poured wall with a wobble in it stops reading as poured.
     *
     * The jitter is a fraction of what it was, because the extrusion is. Given a swing wider
     * than the rim itself, a panel's media face crossed in front of the stroke plane and the
     * drawing ended up behind the skin it is meant to bound.
     */
    position: [
      centerX,
      centerY,
      poured ? 0 : randomBetween(random, -0.003, 0.003),
    ],
    /*
     * Both halves keep the same extrusion so the party wall is flush and the shed reads as
     * one build. The difference between them is material, never depth.
     *
     * A twentieth of the house width, not a fifth. The mark is a drawing standing up, and at
     * a fifth the extruded sides were a fifth of the frame the drawing covers: dead black
     * quads running down the outside of the outline at every off-centre pointer position,
     * reading as holes cut in the field rather than as the thickness of a line. The rim is
     * now narrow enough that the drawing bounds it at any angle the chase can reach.
     */
    size: [
      width,
      height,
      poured ? ENTRY_POURED_DEPTH : randomBetween(random, 0.03, 0.038),
    ],
    /*
     * The poured half sits dead flat and dead square: zero tilt, zero z. Even eight
     * thousandths of yaw per tile caught the key differently tile by tile and turned one
     * pour into a lit 3x3 grid, which is exactly what a pour is not.
     */
    /*
     * Half of what it was. Two neighbours free to roll a fiftieth of a radian apart walk
     * their shared edge out of line by more than the skin over it can close, and what came
     * through the join was the prism: a dark hairline down a panel column, on the half of
     * the wall the eye has nothing else to look at. The loose sheet read is worth less than
     * a wall with no grid in it.
     */
    rotation: poured
      ? [0, 0, 0]
      : [
          randomBetween(random, -0.008, 0.008),
          randomBetween(random, -0.008, 0.008),
          randomBetween(random, -0.004, 0.004),
        ],
    poured,
    release: random(),
  };
}

const ENTRY_SHARD_LAYOUT: EntryPanel[] = [
  ...ENTRY_DRAWN_PANELS.map((panel, index) => entryPanel(panel, false, index)),
  ...ENTRY_POURED_PANELS.map((panel, index) => entryPanel(panel, true, index)),
];

/*
 * WHERE THE MEDIA IS ALLOWED TO COME FROM. entry-cinematic-v3.png is a still life, and
 * three of the things standing in it are big glossy spheres with a shading terminator down
 * each one, plus an orange sunset and a gold disc. Cropped at random, a panel kept landing
 * on a whole sphere, and a sphere on a mosaic face reads as a bead stuck to the mark, which
 * is exactly the decoration the pearls were deleted for. The two orange regions are the
 * only warm thing in a cobalt field, so they are out for the same reason.
 *
 * These four windows are the parts of the plate that are footage rather than props: the
 * blue machinery through the middle, the crumpled foil bottom left, the bank of screens
 * bottom right, and the mirror shards under the machinery. Given in UV, so v counts up from
 * the bottom of the image.
 *
 * The foil band reaches higher up the drapery than it did. Its old ceiling at v0.355 cut off
 * exactly the run of lit folds the drawn wall needs, and left the one skin window nowhere to
 * sit but the bottom of the band, where the foil's shadows are crushed to nothing. It stops
 * at v0.38 because the gold disc starts at v0.39.
 */
const ENTRY_CROP_BANDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.4, 0.375, 0.645, 0.505],
  [0.03, 0.045, 0.205, 0.38],
  [0.55, 0.045, 0.965, 0.245],
  [0.355, 0.28, 0.62, 0.375],
];

/*
 * LINE WORK. The mark is a drawing before it is a volume, so the strokes the icon actually
 * carries are drawn as strokes here too rather than left to the panel edges: the baseline
 * running past both houses, the outline of the drawn shed, its two hatch strokes, and the
 * registration ticks an architect leaves wherever a line crosses a wall.
 */
/*
 * The stroke planes have to sit on the volume, not float in front of it. The panels reach
 * +/- depth/2, the media face rides at depth * ENTRY_FACE_LIFT, and the deepest panel in
 * either half extrudes to 0.095, so the front plane clears the widest media face and its
 * jitter and nothing else. Laid further out, the drawing sheared off the walls it traces
 * under the chase tilt and the back copy walked out past the silhouette as a second, hollow
 * house with its own roof and its own ground line.
 */
const ENTRY_LINE_FRONT = 0.034;
/*
 * GL lines are one pixel wide whatever the hardware, and one pixel of white over a lit
 * media crop is not a drawing, it is a scratch. Every stroke is laid down as a few
 * parallel lanes offset along its own normal instead, which is what gives the mark a
 * stroke weight the way the icon has one.
 */
const ENTRY_LINE_LANE = 0.0072;

// Traced on both faces of the extrusion with rails between them, so the drawn half reads
// as a frame with depth instead of a decal on the front.
const ENTRY_OUTLINE_STROKES: EntryLogoPoint[][] = [
  [[18, 82], [18, 48], [35, 32], [52, 48], [52, 82]],
];
// The ground line, past both houses on either side, exactly as the icon overruns it.
const ENTRY_BASELINE_STROKES: EntryLogoPoint[][] = [
  [[8, 82], [92, 82]],
];
// The two diagonals inside the drawn house, on its front face only.
const ENTRY_HATCH_STROKES: EntryLogoPoint[][] = [
  [[25, 76], [37, 64]],
  [[25, 66], [34, 57]],
];
// Short overshoots where a wall meets the ground line, the eave crosses the party wall,
// and the drawn peak lands.
const ENTRY_TICK_STROKES: EntryLogoPoint[][] = [
  [[8, 78.5], [8, 85.5]],
  [[18, 78.5], [18, 85.5]],
  [[52, 78.5], [52, 85.5]],
  [[82, 78.5], [82, 85.5]],
  [[92, 78.5], [92, 85.5]],
  [[47, 48], [57, 48]],
  [[35, 28.5], [35, 35.5]],
];
// The poured half is a solid, so the mark's own strokes are all it gets: the gable run and
// the wall head. Dimmer than the drawn work, but present, or a near-black volume on a
// near-black field has no silhouette at all.
const ENTRY_POURED_STROKES: EntryLogoPoint[][] = [
  [[52, 48], [68, 32], [82, 46], [82, 82]],
  [[52, 48], [82, 48]],
];

function pushEntryLane(
  points: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  plane: number,
  weight: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = (-dy / length) * ENTRY_LINE_LANE;
  const normalY = (dx / length) * ENTRY_LINE_LANE;

  for (let lane = 0; lane < weight; lane += 1) {
    const offset = lane - (weight - 1) / 2;
    points.push(
      ax + normalX * offset, ay + normalY * offset, plane,
      bx + normalX * offset, by + normalY * offset, plane,
    );
  }
}

function makeEntryLineWork(
  bands: Array<{
    strokes: EntryLogoPoint[][];
    planes: number[];
    rails?: boolean;
    weight?: number;
  }>,
) {
  const points: number[] = [];

  for (const { strokes, planes, rails, weight = 1 } of bands) {
    for (const stroke of strokes) {
      const world = stroke.map(([x, y]) => [entryLogoX(x), entryLogoY(y)] as const);
      for (const plane of planes) {
        for (let index = 0; index < world.length - 1; index += 1) {
          const [ax, ay] = world[index];
          const [bx, by] = world[index + 1];
          pushEntryLane(points, ax, ay, bx, by, plane, weight);
        }
      }
      if (rails && planes.length > 1) {
        const front = planes[0];
        const back = planes[planes.length - 1];
        for (const [x, y] of world) points.push(x, y, front, x, y, back);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return geometry;
}

function EntrySculpture({
  ready,
  entered,
  entrySettled,
  reducedMotion,
  cursorRef,
}: Pick<ShowcaseSceneProps, "ready" | "entered" | "entrySettled" | "reducedMotion" | "cursorRef">) {
  const groupRef = useRef<Group>(null);
  const cellRefs = useRef<Array<Group | null>>([]);
  const prismRefs = useRef<Array<Mesh | null>>([]);
  const pouredBodyRef = useRef<Mesh>(null);
  const finePointer = useFinePointer();
  /*
   * The face materials are driven through refs, not through the uniforms prop. R3F
   * copies a uniforms object into the material's own store on mount and keeps that
   * target stable, so writing to the object we authored moves nothing but the shared
   * vectors. The prop still seeds the values; every per frame scalar goes here.
   */
  const faceMaterials = useRef<Array<ShaderMaterial | null>>([]);
  const edgeMaterials = useRef<Array<{ opacity: number } | null>>([]);
  const lineRef = useRef<Group>(null);
  const lineMaterials = useRef<Array<{ opacity: number } | null>>([]);
  const enteredAt = useRef<number | null>(null);
  /*
   * THE DRAWING IS ONE DRAWING. Every stroke the mark actually carries is laid down once,
   * on the front plane, at full weight. Tracing the same strokes on the back plane at the
   * same weight is what turned every roofline into two parallel rails and the ground into
   * a three rail parallelogram as soon as the chase put any yaw on the artifact.
   */
  const drawnLineWork = useMemo(() => makeEntryLineWork([
    {
      strokes: ENTRY_OUTLINE_STROKES,
      planes: [ENTRY_LINE_FRONT],
      weight: 3,
    },
    { strokes: ENTRY_BASELINE_STROKES, planes: [ENTRY_LINE_FRONT], weight: 3 },
    { strokes: ENTRY_HATCH_STROKES, planes: [ENTRY_LINE_FRONT], weight: 2 },
    { strokes: ENTRY_TICK_STROKES, planes: [ENTRY_LINE_FRONT], weight: 2 },
  ]), []);
  /*
   * The pour's own silhouette, a lane wider than the drawing that bounds the other half.
   * Three lanes at half a pixel apart is a stroke a pixel and a quarter wide, and carried at
   * half opacity a single lane over a near-black field lands at luminance 106: under the
   * level a stroke has to reach to read at all. So the edge only actually appeared where two
   * lanes happened to round onto the same column, and where they did not the mark's own
   * right hand silhouette dropped out for runs of up to seven rows, measured at a quarter of
   * the rows at the worst pointer position. A fourth lane and a stroke that carries on one
   * lane put the edge on every row without making it the drawn half's equal.
   */
  const pouredLineWork = useMemo(() => makeEntryLineWork([
    {
      strokes: ENTRY_POURED_STROKES,
      planes: [ENTRY_LINE_FRONT],
      weight: 4,
    },
  ]), []);
  /*
   * The far edge of the extrusion, one lane wide and kept near the floor of visibility. It
   * is here so the drawn half still reads as a frame with a thickness rather than a decal,
   * and nowhere near bright enough to be mistaken for a second outline.
   */
  const depthLineWork = useMemo(() => makeEntryLineWork([
    {
      strokes: ENTRY_OUTLINE_STROKES,
      planes: [ENTRY_LINE_FRONT, -ENTRY_LINE_FRONT],
      rails: true,
      weight: 1,
    },
    {
      strokes: ENTRY_POURED_STROKES,
      planes: [ENTRY_LINE_FRONT, -ENTRY_LINE_FRONT],
      rails: true,
      weight: 1,
    },
  ]), []);
  /*
   * One prism per panel, plus the flat face the media skin rides on and the silhouette
   * edges. Extrude and shape geometries both hand back model coordinates as UVs, and the
   * media shader reads UV as a crop lookup, so the face is renormalised over its own box:
   * without it every panel samples the same smear of atlas.
   */
  const panelParts = useMemo(() => ENTRY_SHARD_LAYOUT.map(({ outline, skin, size: [width, height, depth] }) => {
    const shape = new Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let index = 1; index < outline.length; index += 1) {
      shape.lineTo(outline[index][0], outline[index][1]);
    }
    shape.closePath();
    const skinShape = new Shape();
    skinShape.moveTo(skin[0][0], skin[0][1]);
    for (let index = 1; index < skin.length; index += 1) {
      skinShape.lineTo(skin[index][0], skin[index][1]);
    }
    skinShape.closePath();

    const prism = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    prism.translate(0, 0, -depth / 2);
    const face = new ShapeGeometry(skinShape);
    const position = face.getAttribute("position");
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      uv[index * 2] = position.getX(index) / width + 0.5;
      uv[index * 2 + 1] = position.getY(index) / height + 0.5;
    }
    face.setAttribute("uv", new BufferAttribute(uv, 2));
    // Silhouette edges only: a wireframe would draw the triangulation across every gable
    // face, and the mark has no diagonals in it except the two it draws by hand.
    const edges = new EdgesGeometry(prism);

    return { prism, face, edges };
  }), []);
  /*
   * The pour, as one body. Extruded straight off the mark's own poured path so its
   * silhouette is the strokes and nothing wider, and so the wall inside it carries one
   * normal and one value instead of twelve tiles trading the depth buffer at every join.
   */
  const pouredBody = useMemo(() => {
    const shape = new Shape();
    const world = ENTRY_POURED_SILHOUETTE.map(([x, y]) => [entryLogoX(x), entryLogoY(y)] as const);
    shape.moveTo(world[0][0], world[0][1]);
    for (let index = 1; index < world.length; index += 1) shape.lineTo(world[index][0], world[index][1]);
    shape.closePath();
    const prism = new ExtrudeGeometry(shape, {
      depth: ENTRY_POURED_DEPTH,
      bevelEnabled: false,
      curveSegments: 1,
    });
    prism.translate(0, 0, -ENTRY_POURED_DEPTH / 2);
    return prism;
  }, []);
  const entryTexture = useLoader(
    TextureLoader,
    "/prototype/showcase/media/entry-cinematic-v3.png",
  ) as Texture;
  /*
   * THE SKIN IS METERED OFF THE PLATE, ONCE, ON THE WAY IN. Twelve windows cut at random
   * out of one uneven still life are twelve different exposures, and the wall read as a
   * checkerboard with panels missing: three or four cells cropped near-black regions and sat
   * dead beside blown neighbours. Metering in the shader off a handful of point taps could
   * not see it, because against the true window mean those taps were out by up to six times.
   *
   * So the plate is read down to a small luminance map here and every cell is fitted to the
   * same working level in two steps: a crop is chosen for how little of it is dead black,
   * and the gain that lands its own window on the level is solved over the lifted values the
   * shader will actually raise. Measured across the twelve, the shadow floor now spans less
   * than two to one where it used to span twenty.
   */
  const shardMedia = useMemo(() => {
    const grid = 192;
    let plate: Float32Array | null = null;
    const image = entryTexture.image as CanvasImageSource | undefined;
    if (typeof document !== "undefined" && image) {
      const canvas = document.createElement("canvas");
      canvas.width = grid;
      canvas.height = grid;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        try {
          context.drawImage(image, 0, 0, grid, grid);
          const pixels = context.getImageData(0, 0, grid, grid).data;
          const table = Array.from({ length: 256 }, (_, value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          plate = new Float32Array(grid * grid);
          for (let cell = 0; cell < grid * grid; cell += 1) {
            const offset = cell * 4;
            plate[cell] = 0.2126 * table[pixels[offset]]
              + 0.7152 * table[pixels[offset + 1]]
              + 0.0722 * table[pixels[offset + 2]];
          }
        } catch {
          plate = null;
        }
      }
    }
    // The atlas counts v up from the bottom of the image and the canvas counts down.
    const window = (u0: number, v0: number, cropWidth: number, cropHeight: number) => {
      const values: number[] = [];
      if (!plate) return values;
      for (let row = 0; row < grid; row += 1) {
        const v = 1 - (row + 0.5) / grid;
        if (v < v0 || v > v0 + cropHeight) continue;
        for (let column = 0; column < grid; column += 1) {
          const u = (column + 0.5) / grid;
          if (u < u0 || u > u0 + cropWidth) continue;
          values.push(plate[row * grid + column]);
        }
      }
      return values;
    };

    // What the cells before this one took out of the same band, so three cells sharing a
    // band do not all converge on its one flattest corner and hand the wall the same fold
    // of foil three times.
    const taken: Array<{ band: number; u: number; v: number }> = [];

    const cells = ENTRY_SHARD_LAYOUT.map((_, index) => {
      const random = seededRandom(hashSeed(`entry-shard-${index}`));
      const band = index % ENTRY_CROP_BANDS.length;
      const [bandU0, bandV0, bandU1, bandV1] = ENTRY_CROP_BANDS[band];
      // Never more than three quarters of a band, so a crop cannot walk to a band edge and
      // pick up whatever the band was drawn to exclude.
      const cropWidth = Math.min(randomBetween(random, 0.12, 0.2), (bandU1 - bandU0) * 0.75);
      const cropHeight = Math.min(randomBetween(random, 0.11, 0.18), (bandV1 - bandV0) * 0.75);
      const angle = randomBetween(random, -0.38, 0.38);
      // Every candidate is drawn whether or not the plate can be read, so the seeded stream
      // is the same sequence in a browser that refuses the canvas as in one that does not.
      const candidates = Array.from({ length: ENTRY_CROP_TRIES }, () => [
        randomBetween(random, bandU0, bandU1 - cropWidth),
        randomBetween(random, bandV0, bandV1 - cropHeight),
      ] as const);

      let choice = candidates[0];
      let best = -1;
      for (const [u0, v0] of candidates) {
        const values = window(u0, v0, cropWidth, cropHeight);
        if (values.length === 0) break;
        const sorted = [...values].sort((a, b) => a - b);
        const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
        // How much of the window is not dead black, relative to how bright it is overall.
        const floor = sorted[Math.floor(sorted.length * 0.25)] / Math.max(mean, 1e-4);
        // And how far it sits from the crops its neighbours in the band already hold, in
        // crop widths, so the two pulls are traded off rather than one of them winning.
        let apart = 1;
        for (const seat of taken) {
          if (seat.band !== band) continue;
          apart = Math.min(apart, Math.max(
            Math.abs(seat.u - u0) / cropWidth,
            Math.abs(seat.v - v0) / cropHeight,
          ));
        }
        const score = floor + ENTRY_CROP_SPACING * apart;
        if (score > best) {
          best = score;
          choice = [u0, v0] as const;
        }
      }
      taken.push({ band, u: choice[0], v: choice[1] });

      const values = window(choice[0], choice[1], cropWidth, cropHeight);
      let gain = 1;
      if (values.length > 0) {
        let lifted = 0;
        for (const value of values) lifted += (value + ENTRY_SKIN_PEDESTAL) ** ENTRY_SKIN_GAMMA;
        gain = MathUtils.clamp(ENTRY_SKIN_LEVEL / (lifted / values.length), 0.35, 4);
      }
      return { crop: [choice[0], choice[1], cropWidth, cropHeight] as const, angle, gain };
    });

    /*
     * AND ONE WINDOW FOR THE DRAWN HALF. The cells above are still what the pour shatters
     * into and still what the freeze travels over, but the media the drawn wall carries is
     * cut once, here, and read across the whole sheet. Twelve windows metered to one level
     * are still twelve pieces of footage: the wall showed the content jumping at each of
     * its six seams, at zero tilt, which is construction rather than chase. Same fit as the
     * cells use, over the one band whose shape is anywhere near the mark's.
     */
    const [bandU0, bandV0, bandU1, bandV1] = ENTRY_CROP_BANDS[ENTRY_SKIN_BAND];
    const skinRandom = seededRandom(hashSeed("entry-skin"));
    const skinWidth = Math.min(ENTRY_SKIN_WINDOW[0], bandU1 - bandU0 - ENTRY_CROP_SLOP);
    const skinHeight = Math.min(ENTRY_SKIN_WINDOW[1], bandV1 - bandV0 - ENTRY_CROP_SLOP);
    const skinAngle = randomBetween(skinRandom, -ENTRY_SKIN_TILT, ENTRY_SKIN_TILT);
    /*
     * THE SEAT IS SWEPT, NOT SAMPLED, AND IT IS SCORED ON WHAT IS STILL THERE. The cells
     * take a handful of random seats and keep the one with the highest floor over its own
     * mean, and that score is exactly backwards for this window: a window that is uniformly
     * dead has a floor equal to its mean and scores a perfect one. It picked the crushed
     * corner of the foil every time, and the lower right third to half of the drawn wall
     * came out a flat textureless plate at every pointer position.
     *
     * So the one skin walks its whole band on a grid and keeps the window with the most
     * live texels in it. A grid is as deterministic as the seeded draw was and it actually
     * reaches the best seat, which ten random tries did not.
     */
    const skinReachU = Math.max(0, bandU1 - skinWidth - ENTRY_CROP_SLOP - bandU0);
    const skinReachV = Math.max(0, bandV1 - skinHeight - ENTRY_CROP_SLOP - bandV0);
    // The band's middle, which is where the window sits if the browser refuses the canvas
    // and there is no plate to score against.
    let skinChoice = [bandU0 + skinReachU / 2, bandV0 + skinReachV / 2] as const;
    let skinBest = -1;
    for (let column = 0; column < ENTRY_SKIN_SEATS; column += 1) {
      for (let row = 0; row < ENTRY_SKIN_SEATS; row += 1) {
        const u0 = bandU0 + (skinReachU * column) / (ENTRY_SKIN_SEATS - 1);
        const v0 = bandV0 + (skinReachV * row) / (ENTRY_SKIN_SEATS - 1);
        const values = window(u0, v0, skinWidth, skinHeight);
        if (values.length === 0) break;
        let live = 0;
        for (const value of values) if (value > ENTRY_SKIN_DEAD) live += 1;
        const score = live / values.length;
        if (score > skinBest) {
          skinBest = score;
          skinChoice = [u0, v0] as const;
        }
      }
    }

    const skinValues = window(skinChoice[0], skinChoice[1], skinWidth, skinHeight);
    let skinGain = 1;
    if (skinValues.length > 0) {
      let lifted = 0;
      for (const value of skinValues) lifted += (value + ENTRY_SKIN_PEDESTAL) ** ENTRY_SKIN_GAMMA;
      skinGain = MathUtils.clamp(ENTRY_SKIN_LEVEL / (lifted / skinValues.length), 0.35, 4);
    }

    return {
      cells,
      skin: {
        crop: [skinChoice[0], skinChoice[1], skinWidth, skinHeight] as const,
        angle: skinAngle,
        gain: skinGain,
      },
    };
  }, [entryTexture]);
  const shardUniforms = useMemo(() => ENTRY_SHARD_LAYOUT.map((shard, index) => {
    /*
     * The drawn half takes the one skin. The poured half's pane never shows media at all,
     * so it keeps its own cell window and spends it on nothing but the ice.
     */
    const { crop, angle, gain } = shard.poured ? shardMedia.cells[index] : shardMedia.skin;
    return {
      uTexture: { value: entryTexture },
      uTime: { value: 0 },
      uSeed: { value: index * 0.731 + 0.17 },
      uFlare: { value: 0 },
      uPoured: { value: shard.poured ? 1 : 0 },
      uPointer: { value: new Vector2() },
      uFaceOrigin: { value: new Vector2(shard.position[0], shard.position[1]) },
      uFaceSize: { value: new Vector2(shard.size[0], shard.size[1]) },
      uCrop: { value: new Vector4(crop[0], crop[1], crop[2], crop[3]) },
      uSheet: {
        value: new Vector4(
          ENTRY_SHEET_ORIGIN[0],
          ENTRY_SHEET_ORIGIN[1],
          ENTRY_SHEET_SIZE[0],
          ENTRY_SHEET_SIZE[1],
        ),
      },
      uAngle: { value: angle },
      uExposure: { value: gain },
    };
  }), [entryTexture, shardMedia]);

  useEffect(() => {
    entryTexture.colorSpace = SRGBColorSpace;
    entryTexture.minFilter = LinearFilter;
    entryTexture.magFilter = LinearFilter;
    entryTexture.wrapS = MirroredRepeatWrapping;
    entryTexture.wrapT = MirroredRepeatWrapping;
    entryTexture.needsUpdate = true;
  }, [entryTexture]);

  useEffect(() => () => {
    drawnLineWork.dispose();
    pouredLineWork.dispose();
    depthLineWork.dispose();
    pouredBody.dispose();
    panelParts.forEach(({ prism, face, edges }) => {
      prism.dispose();
      face.dispose();
      edges.dispose();
    });
  }, [drawnLineWork, pouredLineWork, depthLineWork, pouredBody, panelParts]);

  useFrame(({ clock, size, viewport }, delta) => {
    const pointer = cursorRef.current;
    const group = groupRef.current;
    if (!group) return;
    group.visible = ready && !entrySettled;

    if (!entered) enteredAt.current = null;
    if (entered && enteredAt.current === null) enteredAt.current = clock.elapsedTime;

    const phase = enteredAt.current === null
      ? 0
      : reducedMotion
        ? 1
        : MathUtils.clamp((clock.elapsedTime - enteredAt.current) / 3, 0, 1);
    const expand = MathUtils.smoothstep(phase, 0.04, 0.55);
    // The freeze leads the release: cracks start spreading at 0.48s and the whole skin
    // is white ice by about 1.3s, well before the artifact lets go.
    const flare = MathUtils.smoothstep(phase, 0.16, 0.44);
    /*
     * The artifact holds together while it grows and freezes over, and only then does
     * the camera run into the opening. Release runs the shards at the lens instead of
     * away from it, so they are past the near plane well before the entrySettled unmount
     * at 3s has anything left to remove.
     *
     * Timed off the reference rather than eased for its own sake: the reference still
     * holds one tight plate at 1800ms and is fully scattered by 2500ms, and starting the
     * release at 1740 meant the local plate was already coming apart in the frame the
     * reference keeps whole. The window now opens at 1860 and closes at 2550, which is a
     * shorter and harder shatter with the same slack in front of the handover.
     */
    const burst = MathUtils.smoothstep(phase, 0.62, 0.85);
    /*
     * WELD. The reference holds one continuous plate through the whole freeze: butted
     * faces, white hairline seams, no navy showing between cells and no extruded sides
     * catching the key. Locally the rest pose earns its depth from the pointer tilt, so
     * the flattening only runs while the artifact is growing and frozen, and the burst
     * hands every jitter back on its way out. Zero at rest, zero once it lets go.
     *
     * It runs on its own clock rather than on `expand`, because the growth curve is only
     * half done at 900ms and the reference is already one plate by then.
     */
    const weld = MathUtils.smoothstep(phase, 0.02, 0.22) * (1 - burst);
    // The mark is wider than it is tall, so the slab's square scale would have run it into
    // both frame edges. These are set off the footprint the mosaic used to cover.
    const viewportScale = entryViewportScale(size.width);
    const pulse = entered ? 0 : Math.sin(clock.elapsedTime * 1.7) * 0.025;
    const chasing = finePointer && !reducedMotion && !entered;
    const cursorX = chasing ? pointer.x : 0;
    const cursorY = chasing ? pointer.y : 0;
    // CHASE. Read from the one place that owns it, because the foreground curtain has to
    // travel with the mark to keep its exclusion true away from dead centre.
    const [chaseX, chaseY] = entryChaseTarget(cursorX, cursorY, viewport, size.width);
    group.position.x = MathUtils.damp(group.position.x, chaseX, 5.2, delta);
    group.position.y = MathUtils.damp(group.position.y, chaseY, 5.2, delta);
    group.position.z = MathUtils.damp(group.position.z, 0.1 + expand * 0.22 + burst * 1.35, 6, delta);
    // The slab grows as one body. Opening real gaps between the faces before the release
    // would give the shatter away early, so the seams stay hairline until it lets go.
    group.scale.setScalar(viewportScale * (1 + pulse + expand * 0.52 + burst * 0.22));
    /*
     * The slab rests near face-on so the mosaic reads axis aligned, and the pointer
     * supplies the tilt that exposes the extruded side faces. Past roughly 26 degrees
     * the faces go edge on and the artifact stops reading at all, so the corners spend
     * their swing on the in-plane roll instead, which is where the source puts it.
     *
     * The travel is the chase; the tilt is only what shows the mark is a solid. Given a
     * corner's worth of roll the two gables came level with each other and the poured house
     * measured 57 per cent wider than it does at rest, which is the mark ceasing to be the
     * mark: the step between the two gables is its identity. Roll is halved and the two
     * off-axis swings are down a third, so a corner still tips the artifact and never
     * restates its proportions.
     *
     * AND THE STEP MAY NOT CHANGE SIGN. Halving it was not enough, because what a reader
     * sees is not the size of the offset but which gable is on top: the drawn apex measured
     * 25 pixels above the poured one at the top right and 24 below it at the top left, a
     * fifty pixel swing on a mark 220 tall, with the two houses trading which of them is the
     * larger as it went. The yaw and the roll are the two terms that do it, and at the top
     * left they add rather than cancel. Both are cut again here: the tilt is still what
     * shows the mark is a solid, and the mark still reads the same way round wherever the
     * pointer is.
     */
    group.rotation.x = MathUtils.damp(
      group.rotation.x,
      (entered ? 0.04 : 0.05 - cursorY * 0.12)
        + Math.sin(clock.elapsedTime * 0.32) * (entered ? 0.012 : 0.028)
        + expand * 0.03,
      4.6,
      delta,
    );
    group.rotation.y = MathUtils.damp(
      group.rotation.y,
      (entered ? 0.05 : 0.06 + cursorX * 0.085)
        + Math.sin(clock.elapsedTime * 0.27 + 0.8) * (entered ? 0.02 : 0.036)
        + expand * 0.06,
      4.6,
      delta,
    );
    group.rotation.z = MathUtils.damp(
      group.rotation.z,
      (entered ? 0 : cursorX * -0.036 + cursorY * 0.034)
        + Math.sin(clock.elapsedTime * 0.42) * (entered ? 0.01 : 0.018)
        + expand * 0.02,
      4.6,
      delta,
    );

    faceMaterials.current.forEach((material) => {
      if (!material) return;
      material.uniforms.uTime.value = clock.elapsedTime;
      material.uniforms.uFlare.value = flare;
      material.uniforms.uPointer.value.set(cursorX, cursorY);
    });

    // Anything past this local depth has crossed the near plane and is behind the lens.
    const nearLimit = (4.9 - group.position.z) / Math.max(0.001, group.scale.x);

    // The lattice spreads on the way out, not on the way up: a spread applied while the
    // slab is welded is exactly what opened navy channels between the faces.
    const spread = 1 + expand * 0.045 * (1 - weld);

    /*
     * The pour is one body until it lets go. The cells are still what it shatters into, so
     * the swap happens as the release opens, at a point where the twelve of them have moved
     * less than a thousandth of a unit off the shape the body was.
     */
    const bodyHeld = burst < 0.01;
    const body = pouredBodyRef.current;
    if (body) {
      body.visible = bodyHeld;
      body.scale.set(spread, spread, spread * (1 - weld * 0.78));
    }

    ENTRY_SHARD_LAYOUT.forEach(({ position: [baseX, baseY, baseZ], size: [width, height], rotation, release, poured }, index) => {
      const cell = cellRefs.current[index];
      if (!cell) return;
      const prism = prismRefs.current[index];
      // A pour with a per tile wobble in it is a tiled wall, and this drift was on every
      // cell: a sine per index moving each one in z and, through the same term, in pitch.
      if (prism && poured) prism.visible = !bodyHeld;
      const length = Math.max(0.001, Math.hypot(baseX, baseY));
      const drift = entered || poured ? 0 : Math.sin(clock.elapsedTime * 1.15 + index * 0.73) * 0.006;
      const radialX = baseX / length;
      const radialY = baseY / length;
      // Staggered runs at the lens. The shard keeps its size, so perspective is what
      // throws it outward: it swells and leaves through a frame edge.
      const run = burst * (0.62 + release * 0.9) * 3.9;
      const cellZ = baseZ * (1 - weld) + drift + burst * (index % 3 === 0 ? 0.08 : -0.04) + run;

      cell.position.set(
        baseX * spread + radialX * burst * 0.95,
        baseY * spread + radialY * burst * 0.95,
        cellZ,
      );
      cell.rotation.set(
        rotation[0] * (1 - weld) + drift * 0.4 + burst * (index % 2 ? -0.94 : 0.86),
        rotation[1] * (1 - weld) + burst * (index % 3 ? 1.05 : -0.88),
        rotation[2] * (1 - weld) + burst * (0.4 + release * 0.9),
      );
      // The face grows back over its own seam and the extrusion collapses to a wafer, so
      // the welded plate carries a white hairline grid instead of a wall of lit sides.
      const swell = 1 + burst * 0.2;
      cell.scale.set(
        swell * (1 + weld * (ENTRY_SEAM / width)),
        swell * (1 + weld * (ENTRY_SEAM / height)),
        swell * (1 - weld * 0.78),
      );
      cell.visible = cellZ < nearLimit;

      // The panel boundary hands the plate over to the ice. By the time the reference is
      // fully frozen there is no rectangle left anywhere on it, only the crack network, so
      // the facet lines duck to a trace while the weld holds. The poured half barely draws
      // them at all: the mark gives that side a silhouette, not a grid.
      //
      // And at rest the drawn half barely draws them either. The wall carries one window of
      // footage across every panel boundary, so the only thing still saying twelve tiles was
      // this trace: measured on the dark half it stepped a scan row by eight to ten counts
      // over a single pixel and picked out a panel corner as an L. It is the release that
      // needs the grid, not the rest pose.
      const edge = edgeMaterials.current[index];
      if (edge) {
        edge.opacity = (entered ? (poured ? 0.1 : 0.62) : poured ? 0 : 0.05) * (1 - weld * 0.86);
      }
    });

    // The drawing rushes the camera rather than shrinking away, and it lets go of the
    // volume it was tracing: by the time the panels shatter there is nothing left of the
    // line work, so the mark reads as coming apart rather than as a wireframe left behind.
    const lineGroup = lineRef.current;
    if (lineGroup) {
      // The line work is welded to the panels too: same spread, so the strokes stay on the
      // walls they trace, and the depth rails fold flat so the frozen plate reads as a
      // drawing rather than as a box seen in perspective.
      const lineScale = spread * (1 + expand * 0.2 * (1 - weld)) * (1 + burst * 0.9);
      lineGroup.scale.set(lineScale, lineScale, lineScale * (1 - weld * 0.85));
      lineGroup.position.z = expand * 0.04 + burst * 5.2;
      lineGroup.visible = lineGroup.position.z < nearLimit;
    }
    const outlineFade = 1 - MathUtils.smoothstep(burst, 0.35, 0.95);
    /*
     * 0 the drawn strokes, 1 the poured half's silhouette, 2 the far edge of the extrusion.
     *
     * The pour's silhouette is dimmer than the drawing and it has to be present. At half
     * opacity a single lane of it composited to luminance 106 over the field, which is
     * under what the eye picks up as a line at all, so the mark's right hand edge only
     * showed where two lanes rounded onto one column and read dashed everywhere else.
     */
    const lineRest = [0.92, 0.7, 0.085];
    const lineHeld = [1, 0.82, 0.13];
    lineMaterials.current.forEach((material, index) => {
      if (!material) return;
      const level = entered ? lineHeld[index] ?? 0.2 : lineRest[index] ?? 0.14;
      material.opacity = level * outlineFade;
    });
  });

  /*
   * Mounted at the rest pose rather than at the origin. The frame loop damps toward
   * (0, 0.12, 0.1) over roughly 200ms, so mounting at zero meant the built mark rose and
   * grew a couple of per cent while the loader was still opaque, and the flat plate the
   * loader hands over would have been registered against a pose the artifact had not
   * reached yet. The first painted entry frame is now the loader's last frame.
   */
  return (
    <group ref={groupRef} position={[0, 0.12, 0.1]}>
      <group ref={lineRef}>
        <lineSegments geometry={drawnLineWork}>
          <lineBasicMaterial
            ref={(node) => {
              lineMaterials.current[0] = node;
            }}
            color="#eef2ff"
            transparent
            opacity={entered ? 1 : 0.92}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments geometry={pouredLineWork}>
          <lineBasicMaterial
            ref={(node) => {
              lineMaterials.current[1] = node;
            }}
            color="#c6d5ff"
            transparent
            opacity={entered ? 0.82 : 0.7}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments geometry={depthLineWork}>
          <lineBasicMaterial
            ref={(node) => {
              lineMaterials.current[2] = node;
            }}
            color="#8ea6e8"
            transparent
            opacity={entered ? 0.13 : 0.085}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      </group>
      {/*
        * THE POUR, WHOLE. One extrusion of the mark's own poured path, standing in for the
        * twelve cells until the release takes over: one silhouette that the strokes bound
        * exactly, one normal, one value. Twelve coplanar prisms could not hold any of the
        * three, and every boundary between them read as a seam on a wall that is meant to
        * have none.
        */}
      <mesh ref={pouredBodyRef} geometry={pouredBody}>
        <meshPhysicalMaterial
          color={ENTRY_POURED_COLOR}
          emissive={ENTRY_POURED_EMISSIVE}
          emissiveIntensity={ENTRY_POURED_EMISSIVE_LEVEL}
          metalness={0.14}
          roughness={ENTRY_POURED_ROUGHNESS}
          clearcoat={0.24}
          clearcoatRoughness={0.42}
        />
      </mesh>
      {ENTRY_SHARD_LAYOUT.map(({ size: [, , depth], poured }, index) => (
          <group
            key={`entry-shard-${index}`}
            ref={(node) => {
              cellRefs.current[index] = node;
            }}
          >
            <mesh
              geometry={panelParts[index].prism}
              visible={!poured}
              ref={(node) => {
                prismRefs.current[index] = node;
              }}
            >
              {/*
                * The material split is the whole mark: the drawn half is glass over a blue
                * lift, the poured half is a near-black mass with only a clearcoat on it.
                */}
              {/*
                * Both halves carry a lift they own outright rather than one the key lends
                * them. The pour used to take its whole value off a near-white directional
                * at intensity 1.65, so the chase yaw swung it from black to a neutral grey
                * box and back; the drawn half's rim went dead black at the same time and
                * read as a hole cut in the field. Emissive is view independent, so the
                * value stays put and the key is left to do the gradient and nothing else.
                *
                * The drawn half's rim sits between the two levels it has been tried at.
                * Whatever the tilt, the extruded side is the one part of the mark with no
                * media on it: taken down it rendered at luminance 5 against a field at 18
                * and read as a hole cut in the field, and taken up it rendered at luminance
                * 22 against a field at 3 and read as a bright second outline misregistered
                * against the drawing. Neither value was the fault. The band is a third the
                * width it was now, so this level is free to be what a line's edge is worth
                * rather than a compromise between two failures.
                *
                * And the prism loses every contest it has with the skin riding on it. The
                * media face clears the prism front by a fraction of the panel's own depth,
                * but the panels carry a z jitter and a tilt of their own, so at a shared
                * boundary a neighbour's prism could come out in front of the skin covering
                * it and paint a hairline down the join. A depth offset settles it once, for
                * every join, at every angle: the rim still draws wherever nothing covers it,
                * which is the outside of the silhouette and nowhere else.
                */}
              <meshPhysicalMaterial
                color={poured ? ENTRY_POURED_COLOR : "#020619"}
                emissive={poured ? ENTRY_POURED_EMISSIVE : "#0c1e74"}
                emissiveIntensity={poured ? ENTRY_POURED_EMISSIVE_LEVEL : 0.72}
                metalness={poured ? 0.14 : 0.94}
                roughness={poured ? ENTRY_POURED_ROUGHNESS : 0.12}
                clearcoat={poured ? 0.24 : 1}
                clearcoatRoughness={poured ? 0.42 : 0.06}
                polygonOffset
                polygonOffsetFactor={2}
                polygonOffsetUnits={2}
              />
            </mesh>
            <lineSegments geometry={panelParts[index].edges}>
              <lineBasicMaterial
                ref={(node) => {
                  edgeMaterials.current[index] = node;
                }}
                color="#dce7ff"
                transparent
                opacity={entered ? (poured ? 0.1 : 0.62) : poured ? 0 : 0.05}
                depthWrite={false}
                toneMapped={false}
              />
            </lineSegments>
            {poured ? (
              // The poured wall stays a bare near-black volume at rest; this pane is fully
              // transparent until the freeze reaches it, then carries the same ice.
              <mesh geometry={panelParts[index].face} position={[0, 0, depth * ENTRY_FACE_LIFT]}>
                <shaderMaterial
                  ref={(node) => {
                    faceMaterials.current[index * 2] = node;
                  }}
                  uniforms={shardUniforms[index]}
                  vertexShader={ENTRY_VERTEX_SHADER}
                  fragmentShader={ENTRY_FRAGMENT_SHADER}
                  side={DoubleSide}
                  transparent
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            ) : (
              <>
                <mesh geometry={panelParts[index].face} position={[0, 0, depth * ENTRY_FACE_LIFT]}>
                  <shaderMaterial
                    ref={(node) => {
                      faceMaterials.current[index * 2] = node;
                    }}
                    uniforms={shardUniforms[index]}
                    vertexShader={ENTRY_VERTEX_SHADER}
                    fragmentShader={ENTRY_FRAGMENT_SHADER}
                    side={DoubleSide}
                    toneMapped={false}
                  />
                </mesh>
                {/*
                  * Same face, same orientation, moved back. It used to be turned through a
                  * half turn about its own centre to mirror the crop, and a half turn about
                  * the centre of an asymmetric gable panel fills exactly the corner the
                  * trapezoid leaves empty: the union with the front face was the panel's
                  * bounding rectangle, which is why torn flags of footage hung past both
                  * roof slopes. The face is double sided already, so it needs no turn.
                  */}
                <mesh geometry={panelParts[index].face} position={[0, 0, -depth * ENTRY_FACE_LIFT]}>
                  <shaderMaterial
                    ref={(node) => {
                      faceMaterials.current[index * 2 + 1] = node;
                    }}
                    uniforms={shardUniforms[index]}
                    vertexShader={ENTRY_VERTEX_SHADER}
                    fragmentShader={ENTRY_FRAGMENT_SHADER}
                    side={DoubleSide}
                    toneMapped={false}
                  />
                </mesh>
              </>
            )}
          </group>
        ))}
    </group>
  );
}

function ProjectCrystal({
  project,
  index,
  progress,
  entered,
  entrySettled,
  compactViewport,
  reducedMotion,
  cursorRef,
  heroAnchorRef,
}: {
  project: ShowcaseProject;
  index: number;
  heroAnchorRef: MutableRefObject<HeroAnchor>;
} & Pick<ShowcaseSceneProps, "progress" | "entered" | "entrySettled" | "compactViewport" | "reducedMotion" | "cursorRef">) {
  const { camera, gl } = useThree();
  const groupRef = useRef<Group>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const hoverMix = useRef(0);
  const settledAt = useRef<number | null>(null);
  const anchorPoint = useMemo(() => new Vector3(), []);
  const heroPoint = useMemo(() => new Vector3(), []);
  const finePointer = useFinePointer();
  const [hovered, setHovered] = useState(false);
  const fallbackTexture = useMemo(() => makeProjectTexture(project), [project]);
  const shellGeometry = useMemo(() => makeCrystalGeometry(project), [project]);
  const relicTexture = useLoader(
    TextureLoader,
    "/prototype/showcase/media/refractive-atlas-v2.png",
  ) as Texture;
  const [loadedTexture, setLoadedTexture] = useState<Texture | null>(null);
  const [mediaTone, setMediaTone] = useState<readonly [number, number]>([1, 1]);
  const shellExtent = useMemo(() => {
    const box = shellGeometry.boundingBox;
    if (!box) return new Vector2(1.4, 1.4);
    return new Vector2(
      Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
      Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
    );
  }, [shellGeometry]);
  const shaderUniforms = useMemo(() => ({
    uTexture: { value: fallbackTexture as Texture },
    uRelicTexture: { value: relicTexture },
    uHover: { value: 0 },
    uTime: { value: 0 },
    uPointer: { value: new Vector2() },
    uExtent: { value: shellExtent },
    uMediaTone: { value: new Vector2(1, 1) },
    uAccent: { value: new Color(project.colors[1]) },
    uTint: { value: new Color(project.colors[0]) },
    uShapePhase: { value: (hashSeed(`${project.id}-shape`) % 6283) / 1000 },
  }), [fallbackTexture, project.colors, project.id, relicTexture, shellExtent]);
  const randomValues = useMemo(() => {
    const random = seededRandom(hashSeed(`${project.id}-placement`));
    return {
      x: randomBetween(random, 0.06, 0.22) * (index % 2 === 0 ? -1 : 1),
      y: randomBetween(random, -0.08, 0.22),
      tiltX: randomBetween(random, -0.16, 0.16),
      tiltY: randomBetween(random, -0.1, 0.1),
    };
  }, [index, project.id]);

  useEffect(() => {
    relicTexture.colorSpace = SRGBColorSpace;
    relicTexture.wrapS = MirroredRepeatWrapping;
    relicTexture.wrapT = MirroredRepeatWrapping;
    relicTexture.needsUpdate = true;
  }, [relicTexture]);

  useEffect(() => {
    let active = true;
    let currentTexture: Texture | null = null;
    const loader = new TextureLoader();

    loader.load(
      project.media,
      (texture) => {
        currentTexture = texture;
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.wrapS = MirroredRepeatWrapping;
        texture.wrapT = MirroredRepeatWrapping;
        texture.needsUpdate = true;
        if (active) {
          setMediaTone(measureMediaTone(texture.image));
          setLoadedTexture(texture);
        } else {
          texture.dispose();
        }
      },
      undefined,
      () => {
        if (active) {
          setMediaTone([1, 1]);
          setLoadedTexture(null);
        }
      },
    );

    return () => {
      active = false;
      currentTexture?.dispose();
    };
  }, [project.media]);

  useEffect(() => () => {
    fallbackTexture.dispose();
    shellGeometry.dispose();
  }, [fallbackTexture, shellGeometry]);

  useEffect(() => {
    shaderUniforms.uTexture.value = loadedTexture ?? fallbackTexture;
    shaderUniforms.uMediaTone.value.set(
      loadedTexture ? mediaTone[0] : 1,
      loadedTexture ? mediaTone[1] : 1,
    );
  }, [fallbackTexture, loadedTexture, mediaTone, shaderUniforms]);

  useEffect(() => () => {
    if (gl.domElement.dataset.hoveredProject === project.id) {
      delete gl.domElement.dataset.hoveredProject;
    }
  }, [gl, project.id]);

  useFrame(({ clock, size }, delta) => {
    const pointer = cursorRef.current;
    const group = groupRef.current;
    if (!group) return;

    const travel = projectFloat(progress);
    const offset = index - travel;
    // Width decides how the chapter is composed; the pointer capability decides whether
    // it answers a cursor at all. Conflating the two killed the chase on narrow windows.
    const mobile = size.width < 768;
    const chasing = finePointer && !reducedMotion;
    // One sign per chapter drives the approach and the exit alike, so a chapter always
    // leaves through the corner the next one is not arriving from. Sharing a direction
    // between the two used to stack the outgoing hull on top of the incoming speck.
    const lateral = index % 2 === 0 ? -1 : 1;
    const vertical = CHAPTER_VERTICALS[index % CHAPTER_VERTICALS.length];
    // The landing frame is a portrait, not a handover. Until the reader has left the first
    // stop every other chapter waits two thirds of a chapter further out, which parks the
    // second crystal past the approach window instead of in the corner of the opening shot.
    // The hold is gone well before chapter one reaches its own stop at 0.117, so it only
    // ever shapes the arrival and never the rest of the journey.
    const landingHold = index === 0 ? 0 : 1 - MathUtils.smoothstep(progress, 0.008, 0.09);
    const approaching = offset > 0 ? offset + landingHold * 0.62 : 0;
    const departing = Math.max(0, -offset);
    const departurePhase = MathUtils.smoothstep(departing, 0.02, 0.42);
    // The exit accelerates. Near its own stop the crystal barely drifts, then it runs
    // off the frame edge fast enough that the next chapter owns the screen alone by the
    // time the ledger names it.
    const departTravel = departing * (0.85 + departing * 1.9);

    // Wall time, not clock.elapsedTime: switching the frameloop resets the render clock,
    // which would restart the opening reveal every time the capture hook freezes.
    if (!entrySettled) settledAt.current = null;
    if (entrySettled && settledAt.current === null) settledAt.current = performance.now();
    const revealClock = index === 0 && settledAt.current !== null && !reducedMotion
      ? MathUtils.smoothstep((performance.now() - settledAt.current) / 1000, 0, 0.82)
      : 1;
    // Scrolling mid-arrival hands the crystal straight to the journey curve instead of
    // snapping it, so the opening chapter never plays backwards.
    const firstReveal = index === 0
      ? Math.max(revealClock, MathUtils.smoothstep(progress, 0.006, 0.03))
      : 1;

    // Hero pose owns offset 0 for every chapter, not just the opening one: the crystal
    // sits close and large at each stop, then recedes on approach and passes on exit.
    const approachPhase = MathUtils.smoothstep(approaching, 0, 0.3);
    const heroDepth = mobile ? 6.5 : 5.6;
    const heroScale = mobile ? 0.56 : 0.9;
    // Nearly flat, then quartic. The near half of an approach holds the incoming chapter
    // at a couple of hundred pixels so it is legible while the outgoing one is still
    // leaving, and only the far end falls away, so nothing pops in.
    //
    // The quartic saturates rather than running away: past about a chapter and a quarter
    // out the setback stops growing, so the chapter after next reads as a small object at
    // a handoff stop instead of a thirty pixel speck. The near approach is untouched, which
    // is what keeps the ledger-named chapter the largest thing on screen.
    const setbackCeiling = mobile ? 34 : 45;
    const approachSetback = setbackCeiling * (1 - Math.exp(
      -(approaching * approaching * 0.5
        + approaching * approaching * approaching * approaching * (mobile ? 9 : 12)) / setbackCeiling,
    ));
    // The opening chapter closes the last of that distance itself: it travels in out of
    // the debris field rather than inflating on the spot at its final depth.
    const revealApproach = (1 - firstReveal) * (mobile ? 7.4 : 6.8);
    const depth = MathUtils.lerp(
      MathUtils.lerp(heroDepth, mobile ? 4.2 : 3.15, departurePhase),
      mobile ? 7 : 6.2,
      approachPhase,
    ) + approachSetback + revealApproach;
    /*
     * FAR BAND. The setback above is one curve for nine chapters, so at a handoff stop the
     * apparent size of the incoming crystal was decided by how wide its own shell happens
     * to be: the broadest of them arrived at a hundred and five pixels while the most
     * compact arrived at sixty from the identical offset, and the reference holds those
     * stops closer to a lone hero than to a relay between two objects. Past three quarters
     * of a chapter out the scale eases toward a common apparent width, so every chapter
     * hands over at the same size whatever its silhouette. It is eased rather than
     * switched, and it is zero for the whole near approach, so the hero pose, the landing
     * portrait and the exit are all untouched.
     */
    const farBand = MathUtils.smoothstep(approaching, 0.7, 1.06);
    const farNormal = MathUtils.lerp(
      1,
      FAR_BAND_EXTENT / Math.max(0.6, shellExtent.x),
      farBand,
    );
    const baseScale = MathUtils.lerp(
      MathUtils.lerp(heroScale, mobile ? 0.66 : 1.04, departurePhase),
      mobile ? 0.44 : 0.66,
      approachPhase,
    ) * farNormal;

    // Lateral spread scales with depth, so an approaching chapter holds the same corner
    // of the frame the whole way in instead of sliding off the edge as it closes.
    const approachSpread = MathUtils.smoothstep(approaching, 0.05, 0.42);
    const x = randomValues.x * (mobile ? 0.34 : 1)
      + lateral * approachSpread * depth * (mobile ? 0.09 : 0.4)
      + lateral * departTravel * (mobile ? 2.4 : 4.9);
    const y = randomValues.y * (mobile ? 0.65 : 1)
      + vertical * approachSpread * depth * (mobile ? 0.16 : 0.2)
      + vertical * departTravel * (mobile ? 1.7 : 3.4)
      - (mobile ? 0.14 : 0);

    // Reveal from near zero, not 0.16: the crystal becomes visible on the same frame
    // entrySettled flips, so anything larger reads as a pop. Scale finishes early and
    // hands the rest of the arrival to the z travel above.
    const scale = baseScale
      * MathUtils.lerp(0.015, 1, MathUtils.smoothstep(firstReveal, 0, 0.45));

    // No compact-viewport shortcut here: showing chapter one at full scale the instant
    // "entered" flips popped the crystal into the middle of the entry choreography.
    const journeyStarted = entrySettled || progress >= 0.035;
    // The far edge of the window reads the held approach, not the raw offset, so the
    // landing hold decides visibility as well as depth and the second crystal arrives
    // through the same edge every other chapter uses.
    group.visible = entered && offset > -0.56 && approaching < 1.4 && journeyStarted && progress < 0.985;
    group.position.set(x, y, camera.position.z - Math.max(3, depth));
    hoverMix.current = MathUtils.damp(hoverMix.current, hovered && chasing ? 1 : 0, 11, delta);
    const glass = hoverMix.current;
    group.scale.setScalar(scale * (1 + glass * 0.045));

    /*
     * P2-2: publish where this chapter sits on screen while it owns the frame, so the
     * radiation wash can anchor to the object. Strongest claim wins; RadiationGlow clears
     * the accumulator at the top of every frame.
     */
    const claim = group.visible
      ? (1 - MathUtils.smoothstep(Math.abs(offset), 0.08, 0.62)) * firstReveal
      : 0;
    if (claim > heroAnchorRef.current.weight) {
      heroPoint.copy(group.position).project(camera);
      heroAnchorRef.current.x = MathUtils.clamp(heroPoint.x, -1.1, 1.1);
      heroAnchorRef.current.y = MathUtils.clamp(heroPoint.y, -1.1, 1.1);
      heroAnchorRef.current.weight = claim;
    }

    /*
     * The title pill is pinned to the artifact. Project the crystal's lower right shoulder
     * into screen space and hand it to CSS, so the pill hugs the crystal and drifts with
     * it instead of trailing the cursor around the frame.
     */
    if (hovered && group.visible) {
      const halfWidth = shellExtent.x * (compactViewport ? 1.55 : 1.28) * group.scale.x;
      const halfHeight = shellExtent.y * (compactViewport ? 1.23 : 1.14) * group.scale.y;
      anchorPoint.set(x + halfWidth * 0.58, y - halfHeight * 0.4, group.position.z);
      anchorPoint.project(camera);
      const anchorX = MathUtils.clamp(
        (anchorPoint.x * 0.5 + 0.5) * size.width,
        24,
        size.width * 0.56,
      );
      const anchorY = MathUtils.clamp(
        (-anchorPoint.y * 0.5 + 0.5) * size.height,
        96,
        size.height - 120,
      );
      const root = gl.domElement.closest("main");
      if (root instanceof HTMLElement) {
        root.style.setProperty("--showcase-anchor-x", `${Math.round(anchorX)}px`);
        root.style.setProperty("--showcase-anchor-y", `${Math.round(anchorY)}px`);
      }
    }

    const pointerX = chasing ? pointer.x : 0;
    const pointerY = chasing ? pointer.y : 0;
    const drift = reducedMotion ? 0 : clock.elapsedTime * 0.022 * (index % 2 ? -1 : 1);
    group.rotation.x = MathUtils.damp(
      group.rotation.x,
      randomValues.tiltX * 0.55 - pointerY * 0.15 + drift,
      4.8,
      delta,
    );
    group.rotation.y = MathUtils.damp(
      group.rotation.y,
      randomValues.tiltY + pointerX * 0.22 - offset * 0.42,
      4.8,
      delta,
    );
    group.rotation.z = MathUtils.damp(
      group.rotation.z,
      -offset * 0.18 + pointerX * -0.026 + glass * pointerY * 0.025,
      4.8,
      delta,
    );

    const material = materialRef.current;
    if (material) {
      material.uniforms.uHover.value = glass;
      material.uniforms.uTime.value = clock.elapsedTime;
      material.uniforms.uPointer.value.set(pointerX, pointerY);
      material.uniforms.uTexture.value = loadedTexture ?? fallbackTexture;
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerEnter={(event) => {
        event.stopPropagation();
        // A finger cannot hover, so a tap never latches the pill open with no way to close it
        if (!finePointer) return;
        gl.domElement.dataset.hoveredProject = project.id;
        setHovered(true);
      }}
      onPointerLeave={() => {
        delete gl.domElement.dataset.hoveredProject;
        setHovered(false);
      }}
    >
      <mesh
        scale={compactViewport ? [1.55, 1.23, 0.84] : [1.28, 1.14, 0.84]}
        rotation={[0.12, -0.22, 0.045]}
      >
        <primitive object={shellGeometry} attach="geometry" />
        <shaderMaterial
          ref={materialRef}
          uniforms={shaderUniforms}
          vertexShader={CRYSTAL_VERTEX_SHADER}
          fragmentShader={CRYSTAL_FRAGMENT_SHADER}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/*
 * P1-9: grain and aberration are a film character, not a constant. Base grain is
 * monochrome and screen-blended so it lifts a pure-black floor instead of disappearing
 * into it, aberration is small enough that a lone bright speck stays one dot, and the
 * entry transition drives both hard for about a second and a half before settling.
 */
/*
 * The grain is screen-blended into the linear buffer, where a shadow lift costs almost
 * nothing in absolute terms and everything after the sRGB encode: 0.07 here would put a
 * black corner at 50/255. Measured against the reference, whose dark corners sit at 0-3,
 * the useful range is thousandths.
 *
 * This pass is white noise, and the reference floor is not: its speckle reads pure blue,
 * around 0/0/99, over a true black. So the settled level here is only a whisper and the
 * analog floor is carried by the blue speckle in `.scene::after`; what this pass is for is
 * the entry, where the film genuinely breaks up across all three channels.
 */
const GRAIN_BASE_OPACITY = 0.0003;
/*
 * Halved. Screen blending only ever adds, so a white noise pass driven this hard is a
 * fifteen count lift across the whole frame for as long as it is open: at the old gain the
 * transition's peak measured eleven counts brighter than the reference while carrying half
 * its grain, which is a lift wearing grain's clothes rather than grain.
 */
const GRAIN_SPIKE_GAIN = 24;
/*
 * A LENS SPLIT IS A WARM SPLIT, WHEREVER IT IS WIDE ENOUGH TO SEE. This pass reads red one
 * way along the offset and blue the other, so every hard edge it crosses gets a red rim on
 * one side and a cyan one on the other, and on a field with no warmth anywhere else the red
 * one is the only thing in the frame that is not cobalt. Measured on the burst frames it
 * put nearly a per cent of the lit pixels past ten counts of red over blue, worst at 132
 * red against 38 blue, on the artifact's own panels coming apart. The split itself is film
 * and it stays; what changes is where it is wide enough to resolve. Half a pixel narrower,
 * and the radial ramp below holds it off everything but the outer frame.
 */
const CHROMATIC_BASE = { x: 0.00108, y: 0.00051 } as const;
/*
 * Where the radial ramp starts, in half-diagonals: the effect shifts by (2 * distance from
 * centre - this) * offset, so nothing inside this radius splits at all. At 0.52 the ramp
 * opened a third of the way out from centre, which is the middle of the frame and exactly
 * where the debris field lives. At 0.86 it is the last sixth of the frame, where a lens
 * genuinely does this and where the vignette is already taking the corner down.
 */
const CHROMATIC_MODULATION = 0.86;

/*
 * The break-up arrives late. Measured on the reference, the first six hundred milliseconds
 * of the transition are no grainier than the settled film and the peak lands around 1.2s,
 * so a spike that fired on the click was lifting the whole frame by twenty counts through
 * exactly the stretch the reference keeps clean.
 */
function entrySpike(seconds: number) {
  if (seconds < 0.62) return 0;
  if (seconds < 1.05) return MathUtils.smoothstep(seconds, 0.62, 1.05);
  // Narrow on purpose. This pass is white noise, so every millisecond it is held open
  // costs the whole frame a lift; holding it to 2s put ten counts on the run-out where
  // the reference is already most of the way to black.
  if (seconds < 1.45) return 1;
  return 1 - MathUtils.smoothstep(seconds, 1.45, 2.05);
}

function FilmGrade({
  entered,
  reducedMotion,
  chromaticOffset,
  noiseRef,
}: Pick<ShowcaseSceneProps, "entered" | "reducedMotion"> & {
  chromaticOffset: Vector2;
  noiseRef: MutableRefObject<{ blendMode: { opacity: { value: number } } } | null>;
}) {
  const enteredAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (entered && enteredAt.current === null) enteredAt.current = clock.elapsedTime;
    if (!entered) enteredAt.current = null;

    const elapsed = enteredAt.current === null ? -1 : clock.elapsedTime - enteredAt.current;
    const spike = reducedMotion ? 0 : entrySpike(elapsed);

    chromaticOffset.set(
      CHROMATIC_BASE.x * (1 + spike * 2.4),
      CHROMATIC_BASE.y * (1 + spike * 2.4),
    );
    const noise = noiseRef.current;
    if (noise) noise.blendMode.opacity.value = GRAIN_BASE_OPACITY * (1 + spike * GRAIN_SPIKE_GAIN);
  });

  return null;
}

function SceneWorld(props: ShowcaseSceneProps) {
  const chromaticOffset = useMemo(() => new Vector2(CHROMATIC_BASE.x, CHROMATIC_BASE.y), []);
  const noiseRef = useRef<{ blendMode: { opacity: { value: number } } } | null>(null);
  const heroAnchorRef = useRef<HeroAnchor>({ x: 0, y: 0, weight: 0 });

  return (
    <>
      <color attach="background" args={["#00000b"]} />
      <fog attach="fog" args={["#000070", 3.2, 38]} />
      {/* Low ambient on purpose. A soft fill on every face is what turned the debris into
          flat lavender cards; the field wants one hard key and a black everywhere else. */}
      <ambientLight intensity={0.26} color="#8ba0ff" />
      <directionalLight position={[3, 4, 5]} intensity={1.7} color="#e7edff" />
      <pointLight position={[-3, -1, 2]} intensity={6} distance={22} color="#1239ff" />

      <LoadingClock reducedMotion={props.reducedMotion} onLoadProgress={props.onLoadProgress} />
      <FrameAuthority reducedMotion={props.reducedMotion} />
      <CameraRig progress={props.progress} reducedMotion={props.reducedMotion} cursorRef={props.cursorRef} />
      <Atmosphere entered={props.entered} progress={props.progress} />
      <RadiationGlow entered={props.entered} progress={props.progress} heroAnchorRef={heroAnchorRef} />
      <FilmGrade
        entered={props.entered}
        reducedMotion={props.reducedMotion}
        chromaticOffset={chromaticOffset}
        noiseRef={noiseRef}
      />
      <StarField reducedMotion={props.reducedMotion} cursorRef={props.cursorRef} />
      <EntryShardCurtain entered={props.entered} reducedMotion={props.reducedMotion} cursorRef={props.cursorRef} />
      <FragmentField
        entered={props.entered}
        progress={props.progress}
        reducedMotion={props.reducedMotion}
        cursorRef={props.cursorRef}
      />
      <FinaleDebris progress={props.progress} reducedMotion={props.reducedMotion} />
      {SHOWCASE_PROJECTS.map((project, index) => (
        <ProjectCrystal
          key={project.id}
          project={project}
          index={index}
          progress={props.progress}
          entered={props.entered}
          entrySettled={props.entrySettled}
          compactViewport={props.compactViewport}
          reducedMotion={props.reducedMotion}
          cursorRef={props.cursorRef}
          heroAnchorRef={heroAnchorRef}
        />
      ))}

      <EffectComposer multisampling={0} enableNormalPass={false}>
        {/* P2-3: a real optical shoulder. At threshold 0.5 with a single mip the halo died
            inside twenty pixels of the silhouette; the reference carries light a long way
            past a bright hero, so the threshold drops and the mip chain runs wide. */}
        <Bloom
          mipmapBlur
          intensity={1.6}
          luminanceThreshold={0.34}
          luminanceSmoothing={0.42}
          radius={0.92}
          levels={9}
        />
        <ChromaticAberration
          offset={chromaticOffset}
          radialModulation
          modulationOffset={CHROMATIC_MODULATION}
        />
        {/* Harder than it was. The corners of the reference frame are literally zero, and a
            gentle vignette left a lifted navy haze sitting in all four of them. */}
        <Vignette eskil={false} offset={0.14} darkness={0.86} />
        {/* Grain is the last thing the film does, after the vignette, so the analog floor
            reaches the corners instead of being darkened out of them. */}
        <Noise
          ref={(instance: unknown) => {
            noiseRef.current = instance as { blendMode: { opacity: { value: number } } } | null;
          }}
          opacity={GRAIN_BASE_OPACITY}
          premultiply={false}
          blendFunction={BlendFunction.SCREEN}
        />
      </EffectComposer>
    </>
  );
}

export function ShowcaseScene(props: ShowcaseSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50, near: 0.05, far: 160 }}
      dpr={[1, 1.5]}
      frameloop={props.reducedMotion ? "demand" : "always"}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#000209", 1);
        gl.domElement.dataset.captureSurface = "showcase";
      }}
      fallback={<div data-fallback="showcase-canvas" />}
    >
      <SceneWorld {...props} />
    </Canvas>
  );
}

export function ShowcaseEntryScene({
  ready,
  entered,
  entrySettled,
  reducedMotion,
  cursorRef,
}: Pick<ShowcaseSceneProps, "ready" | "entered" | "entrySettled" | "reducedMotion" | "cursorRef">) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50, near: 0.05, far: 40 }}
      dpr={[1, 1.5]}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
    >
      {/*
        * The ambient carries the mark and the key lays the gradient, not the other way
        * round. At intensity 1.65 the near-white key owned the poured wall outright: the
        * chase yaw swung that wall through four stops and parked it at a neutral grey, off
        * a palette the rest of the piece holds to cobalt. A key that models rather than
        * exposes, over a base the angle cannot move.
        */}
      <ambientLight intensity={1.15} color="#98aaff" />
      <directionalLight position={[3, 4, 5]} intensity={0.72} color="#f2f4ff" />
      <pointLight position={[-3, -1, 2]} intensity={8.5} distance={20} color="#1640ff" />
      {/*
        * The two low keys are cobalt, and they are here to give the poured wall a gradient,
        * nothing else. A warm pair used to sit in these slots and it lit the poured half as
        * an orange lamp with a blown copper hotspot on it, which is a colour the field does
        * not contain anywhere else. They sit further off the plate than they did, so the
        * falloff crosses the whole wall instead of parking a highlight on one tile.
        */}
      <pointLight position={[2.6, -1.9, 2.6]} intensity={9} distance={13} color="#6f8bff" />
      {/*
        * Mirrored, and deliberately weaker. A single right-hand key left the left column
        * of the plate dead cold at pointer-bl. Shorter reach on this side, so the lift only
        * arrives when the tilt turns a wall into it rather than sitting on the rest pose.
        */}
      <pointLight position={[-2.6, -1.9, 2.6]} intensity={6.5} distance={11} color="#8fa4ff" />
      <EntrySculpture
        ready={ready}
        entered={entered}
        entrySettled={entrySettled}
        reducedMotion={reducedMotion}
        cursorRef={cursorRef}
      />
    </Canvas>
  );
}
