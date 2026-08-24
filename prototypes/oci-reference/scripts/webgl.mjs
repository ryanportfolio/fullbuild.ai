// webgl.mjs — SINGLE authoritative WebGL module for the oci-reference prototype.
// Halftone/Bayer-dither post pass + pointer-trail ping-pong feedback pass.
//
// Provenance:
// - Halftone fragment below is .tmp/oci-shaders/bNZcloly-s24.glsl VERBATIM.
//   Sole repair: corrupted trailing "= color;" restored to "gl_FragColor = color;"
//   (three.js r178 compiles ShaderMaterial sources as #version 300 es on its WebGL2
//   context and auto-maps varying/texture2D/gl_FragColor, so the rest is untouched).
// - Trail fragment below is .tmp/oci-shaders/trail-shader.glsl mechanically
//   downgraded GLSL3 -> GLSL1 style (in->varying, texture->texture2D,
//   layout(out)->discard, gColor->gl_FragColor).
// - All uniform values are the exact live captures in
//   .tmp/long-horizon/oci-homepage/evidence/uniforms.json.
//
// Documented deviations from the round brief (captured evidence wins):
// - Canvas is the scaffold's existing <canvas id="gl"> (index.html); init() takes
//   whatever canvas element the caller passes.
// - uPixelSize is 1 in the live capture (7.7 lives in uPixelSizeMultiplier, mixed
//   in-shader against trailIntensity), so it is NOT viewport.x / 7.7.
// - lenis-lite.mjs exposes no 'scroll' event emitter; scrollY/velocity flow through
//   update(delta, scrollY, velocity) driven from LenisLite's onFrame hook in main.mjs.
// - Oracle trail uVelocity/uPointer were all zero at capture (no pointer input during
//   recording); the pointer-speed + scroll-velocity -> uVelocity mapping below is
//   inferred behavior, flagged here rather than silently invented.

import * as THREE from "../vendor/three.module.js";

/* ---------------- oracle uniform constants (uniforms.json) ---------------- */

const COLOR_DARK = [0.098039, 0.145098, 0.666667]; // #1925aa
const COLOR_LIGHT = [0.717647, 0.72549, 0.827451]; // #b7b9d3

const DEFAULTS = {
  matrixSize: 8,
  bias: 0.1,
  ditherAmount: 1,
  scaleResolution: 1,
  opacity: 1,
  colorNum: 2, // posterize to two tones
  zoomLoad: 1.2,
  zoomScrolled: 1,
  pixelSize: 1, // live capture value
  pixelSizeMultiplier: 7.7,
  textureSizeFallback: [1000, 560], // hero-source.png
  trailIntensityMultiplier: 1.02,
  biasNoiseScale: 1.4,
  biasNoiseSpeed: 94,
  biasPulseSpeed: 3.1,
  biasNoiseWeight: 0.77,
  biasPulseWeight: 0.87,
  biasAnimationStrength: 0.29,
};

const TRAIL_DEFAULTS = {
  initialRadius: 0.066,
  initialRadiusMultiplier: 0.015,
  borderSize: 0.129,
  borderSizeMultiplier: 0.054,
  decayRate: 0.057, // per-frame mix toward black (frame-rate dependent, like oracle)
};

const SCROLL_RANGE = 1200; // hero band: scrollY 0..1200 drives uZoom 1.2 -> 1

// Bias-noise/pulse time scale. The oracle bundle's uBiasNoiseSpeed=94 / uBiasPulseSpeed=3.1
// are per-SECOND rates only if uTime advances in raw seconds — but the live reference
// dither is near-static at rest (r9-gpu probe: 0.27% pixel churn over 600ms, luma stable),
// while raw-seconds proto churned 20.7%/600ms with whole-field luma swinging 105->75
// (the "glitchy glitter" owner report). uTime therefore advances at 0.01x so the bias
// field drifts on the reference's measured timescale. Evidence: r9-gpu/dither-a/b crops.
const ANIM_TIME_SCALE = 0.001;

/* ---------------- shared vertex: pass-through UV ---------------- */

/* Full-screen triangle (reference bundle construction): positions already in clip
   space, UV derived from position — no geometry UV attribute, no matrix dependence. */
const VERT = [
  "varying vec2 vUv;",
  "",
  "void main() {",
  "  vUv = position.xy * 0.5 + 0.5;",
  "  gl_Position = vec4(position.xy, 0.0, 1.0);",
  "}",
].join("\n");

/* ------- halftone/dither fragment: oracle bNZcloly-s24.glsl verbatim ------- */

const HALFTONE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tMap;
uniform vec2 uTextureSize; // texture width, height
uniform vec2 uPlaneSize;   // plane width, height

uniform vec2 uResolution;
uniform vec3 uColorDark;
uniform vec3 uColorLight;
uniform float uMatrixSize;
uniform float uBias;
uniform float uDitherAmount;
uniform float uScaleResolution;
uniform float uOpacity;
uniform float uZoom;
uniform float uColorNum;
uniform float uPixelSize;
uniform float uPixelSizeMultiplier;
uniform float uTime;
uniform sampler2D uTrail;
uniform float uTrailIntensityMultiplier;
uniform float uBiasNoiseScale;
uniform float uBiasNoiseSpeed;
uniform float uBiasPulseSpeed;
uniform float uBiasNoiseWeight;
uniform float uBiasPulseWeight;
uniform float uBiasAnimationStrength;

varying vec2 vUv;

//	Classic Perlin 3D Noise
//	by Stefan Gustavson (https://github.com/stegu/webgl-noise)
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec3 P){
  vec3 Pi0 = floor(P); // Integer part for indexing
  vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); // Fractional part for interpolation
  vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}

const float bayerMatrix2x2[4] = float[4](
  0.0 / 4.0, 2.0 / 4.0,
  3.0 / 4.0, 1.0 / 4.0
);

const float bayerMatrix4x4[16] = float[16](
   0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
   3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
  15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
);

const float bayerMatrix8x8[64] = float[64](
    0.0/ 64.0, 48.0/ 64.0, 12.0/ 64.0, 60.0/ 64.0,  3.0/ 64.0, 51.0/ 64.0, 15.0/ 64.0, 63.0/ 64.0,
  32.0/ 64.0, 16.0/ 64.0, 44.0/ 64.0, 28.0/ 64.0, 35.0/ 64.0, 19.0/ 64.0, 47.0/ 64.0, 31.0/ 64.0,
    8.0/ 64.0, 56.0/ 64.0,  4.0/ 64.0, 52.0/ 64.0, 11.0/ 64.0, 59.0/ 64.0,  7.0/ 64.0, 55.0/ 64.0,
  40.0/ 64.0, 24.0/ 64.0, 36.0/ 64.0, 20.0/ 64.0, 43.0/ 64.0, 27.0/ 64.0, 39.0/ 64.0, 23.0/ 64.0,
    2.0/ 64.0, 50.0/ 64.0, 14.0/ 64.0, 62.0/ 64.0,  1.0/ 64.0, 49.0/ 64.0, 13.0/ 64.0, 61.0/ 64.0,
  34.0/ 64.0, 18.0/ 64.0, 46.0/ 64.0, 30.0/ 64.0, 33.0/ 64.0, 17.0/ 64.0, 45.0/ 64.0, 29.0/ 64.0,
  10.0/ 64.0, 58.0/ 64.0,  6.0/ 64.0, 54.0/ 64.0,  9.0/ 64.0, 57.0/ 64.0,  5.0/ 64.0, 53.0/ 64.0,
  42.0/ 64.0, 26.0/ 64.0, 38.0/ 64.0, 22.0/ 64.0, 41.0/ 64.0, 25.0/ 64.0, 37.0/ 64.0, 21.0 / 64.0
);

vec3 orderedDither(vec2 uv, float lum, float trailIntensity, float animatedBias) {
  float threshold = 0.0;

  if (uMatrixSize == 2.0) {
    int x = int(mod(floor(uv.x * uResolution.x), 2.0));
    int y = int(mod(floor(uv.y * uResolution.y), 2.0));
    threshold = bayerMatrix2x2[y * 2 + x];
  } else if (trailIntensity < 0.5) {
    int x = int(mod(floor(uv.x * uResolution.x), 4.0));
    int y = int(mod(floor(uv.y * uResolution.y), 4.0));
    threshold = bayerMatrix4x4[y * 4 + x];
  } else {
    int x = int(mod(floor(uv.x * uResolution.x), 8.0));
    int y = int(mod(floor(uv.y * uResolution.y), 8.0));
    threshold = bayerMatrix8x8[y * 8 + x];
  }

  float value = threshold + animatedBias * (1.0 + 2.0 * trailIntensity);

  vec3 color = mix(uColorDark, uColorLight, step(value, lum));
  return color;
}

vec3 dither(vec2 uv, float lum) {
  vec3 color = vec3(lum);

  int x = int(uv.x * uResolution.x) % 8;
  int y = int(uv.y * uResolution.y) % 8;
  float threshold = bayerMatrix8x8[y * 8 + x];

  color.rgb += threshold;
  color.r = floor(color.r * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
  color.g = floor(color.g * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
  color.b = floor(color.b * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);

  return color;
}

vec3 ditherColor(vec2 uv, vec3 color) {
  int x = int(uv.x * uResolution.x) % 8;
  int y = int(uv.y * uResolution.y) % 8;
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.88;

  color.rgb += threshold;
  color.r = floor(color.r * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
  color.g = floor(color.g * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
  color.b = floor(color.b * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);

  return color;
}

void main() {
  float textureAspect = uTextureSize.x / uTextureSize.y;
  float planeAspect   = uPlaneSize.x / uPlaneSize.y;

  vec2 scale;
  vec2 offset;

  if (textureAspect > planeAspect) {
      // Texture is wider → fit height, crop left/right
      float s = planeAspect / textureAspect;
      scale  = vec2(s, 1.0);
      offset = vec2((1.0 - s) * 0.5, 0.0);
  } else {
      // Texture is taller → fit width, crop top/bottom
      float s = textureAspect / planeAspect;
      scale  = vec2(1.0, s);
      offset = vec2(0.0, (1.0 - s) * 0.5);
  }

  // Apply zoom with top-left origin
  vec2 zoomedUv = vUv / uZoom;
  zoomedUv.y = 1.0 - (1.0 - vUv.y) / uZoom;

  // Apply object-fit: cover transform
  vec2 coverUv = zoomedUv * scale + offset;
  vec2 safeUv = clamp(coverUv, 0.0, 1.0);

  // Sample trail texture and use its intensity
  vec2 screenUv = gl_FragCoord.xy / uResolution.xy;
  float trailIntensity = texture2D(uTrail, screenUv).r;

  // Normal pixel size for color sampling
  vec2 normalizedPixelSize = uPixelSize / uResolution;
  vec2 uvPixel = normalizedPixelSize * floor(safeUv / normalizedPixelSize);

  // Sample color with normal pixel size
  vec4 color = texture2D(tMap, uvPixel);

  // Dynamic pixel size for luminance calculation (varies with trail intensity)
  float dynamicPixelSize = mix(uPixelSize, uPixelSize * uPixelSizeMultiplier, trailIntensity);
  vec2 normalizedDynamicPixelSize = dynamicPixelSize / uResolution;
  vec2 uvPixelDynamic = normalizedDynamicPixelSize * floor(safeUv / normalizedDynamicPixelSize);

  // Sample for luminance with dynamic pixel size
  vec4 colorForLum = texture2D(tMap, uvPixelDynamic);
  float lum = dot(vec3(0.2126, 0.7152, 0.0722), colorForLum.rgb);

  // Animate bias with uTime and noise
  float noiseValue = cnoise(vec3(safeUv * uBiasNoiseScale, uTime * uBiasNoiseSpeed));
  float timePulse = sin(uTime * uBiasPulseSpeed) * 0.5 + 0.5;
  float animatedBias = uBias + (noiseValue * uBiasNoiseWeight + timePulse * uBiasPulseWeight) * uBiasAnimationStrength;

  vec3 dither = orderedDither(gl_FragCoord.xy / (uResolution.xy * uScaleResolution), lum, trailIntensity * uTrailIntensityMultiplier, animatedBias);  // color.rgb = dither(gl_FragCoord.xy / (uResolution.xy * uScaleResolution), lum);
  // color.rgb = ditherColor(gl_FragCoord.xy / (uResolution.xy * uScaleResolution), color.rgb);

  color.rgb = mix(color.rgb, dither.rgb, uDitherAmount);
  color.a = uOpacity;

  gl_FragColor = color;
}
`;

/* --------------- trail fragment: oracle trail-shader.glsl --------------- */

const TRAIL_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D u_texture;
uniform vec2 uPointer;
uniform vec2 uLastPointer;
uniform float uAspect;
uniform float uVelocity;
uniform float uTime;
uniform float uInitialRadius;
uniform float uInitialRadiusMultiplier;
uniform float uBorderSize;
uniform float uBorderSizeMultiplier;
uniform float uDecayRate;

varying vec2 vUv;

float circle(vec2 uv, vec2 disc_center, float disc_radius, float border_size) {
  uv -= disc_center;
  uv.x *= uAspect; // Correct for aspect ratio
  float dist = sqrt(dot(uv, uv));
  return smoothstep(disc_radius+border_size, disc_radius-border_size, dist);
}

// Distance from point to line segment
float lineSegment(vec2 p, vec2 a, vec2 b, float radius, float border) {
  // Adjust for aspect ratio
  p.x *= uAspect;
  a.x *= uAspect;
  b.x *= uAspect;

  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float dist = length(pa - ba * h);

  return smoothstep(radius + border, radius - border, dist);
}

void main() {
  vec4 color = texture2D(u_texture, vUv);

  // Draw line between last position and current position
  float line = lineSegment(vUv, uLastPointer, uPointer, uInitialRadius + uVelocity * uInitialRadiusMultiplier, uBorderSize + uVelocity * uBorderSizeMultiplier);

  // Add circle at current position for the end cap
  float currentCircle = circle(vUv, uPointer, uInitialRadius + uVelocity * uInitialRadiusMultiplier, uBorderSize + uVelocity * uBorderSizeMultiplier);

  // Combine line and circle, modulated by velocity
  color.rgb += max(line, currentCircle) * uVelocity;
  color.rgb = mix(color.rgb, vec3(0.0), uDecayRate);
  color.rgb = clamp(color.rgb, vec3(0.0), vec3(1.0));
  color.a = 1.0;

  gl_FragColor = color;
}
`;

/* ================================ runtime ================================ */

function zoomForScroll(scrollY) {
  const span = DEFAULTS.zoomLoad - DEFAULTS.zoomScrolled;
  const t = Math.min(1, Math.max(0, scrollY / SCROLL_RANGE));
  return Math.max(DEFAULTS.zoomScrolled, DEFAULTS.zoomLoad - t * span);
}

function makeBlackDataTexture(width, height) {
  // Float RGBA seed (reference bundle): must match the HalfFloat ping-pong RTs'
  // precision — an 8-bit seed would quantize the first feedback frames.
  const data = new Float32Array(width * height * 4); // zeros = empty trail
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export async function initWebGL(canvas, lenis, heroImage) {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error("[webgl] init(canvas, lenis, heroImage): canvas element required");
  }

  // heroImage: <img> element (already loaded) or src string; resolved before material setup.
  let image = heroImage;
  if (typeof image === "string") {
    image = new Image();
    image.decoding = "async";
    image.src = heroImage;
  }
  if (image && !(image instanceof HTMLImageElement)) {
    throw new Error("[webgl] heroImage must be an HTMLImageElement or a src string");
  }
  if (image && !image.complete) {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("[webgl] hero image failed to load")), { once: true });
    });
  }

  /* ----- renderer / scene / camera: ortho covering the full viewport ----- */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  // Raw numeric passthrough, matching the oracle's plain-WebGL sampling (no decode,
  // no output transfer): what the shader writes is what lands in the framebuffer.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const trailScene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  // Full-screen triangle [-1,-1, 3,-1, -1,3] (reference bundle construction).
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );

  const heroTexture = new THREE.Texture(image || undefined);
  heroTexture.colorSpace = THREE.NoColorSpace;
  heroTexture.wrapS = THREE.ClampToEdgeWrapping;
  heroTexture.wrapT = THREE.ClampToEdgeWrapping;
  heroTexture.magFilter = THREE.LinearFilter;
  heroTexture.minFilter = THREE.LinearFilter;
  heroTexture.generateMipmaps = false;
  heroTexture.needsUpdate = true;

  /* ----- program 2: halftone/dither post material (uniform names verbatim) ----- */

  const halftoneUniforms = {
    tMap: { value: heroTexture },
    uTrail: { value: null },
    uTextureSize: { value: new THREE.Vector2(DEFAULTS.textureSizeFallback[0], DEFAULTS.textureSizeFallback[1]) },
    uPlaneSize: { value: new THREE.Vector2(1, 1) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColorDark: { value: new THREE.Vector3(COLOR_DARK[0], COLOR_DARK[1], COLOR_DARK[2]) },
    uColorLight: { value: new THREE.Vector3(COLOR_LIGHT[0], COLOR_LIGHT[1], COLOR_LIGHT[2]) },
    uMatrixSize: { value: DEFAULTS.matrixSize },
    uBias: { value: DEFAULTS.bias },
    uDitherAmount: { value: DEFAULTS.ditherAmount },
    uScaleResolution: { value: DEFAULTS.scaleResolution },
    uOpacity: { value: DEFAULTS.opacity },
    uZoom: { value: DEFAULTS.zoomLoad },
    uColorNum: { value: DEFAULTS.colorNum },
    uPixelSize: { value: DEFAULTS.pixelSize },
    uPixelSizeMultiplier: { value: DEFAULTS.pixelSizeMultiplier },
    uTime: { value: 0 },
    uTrailIntensityMultiplier: { value: DEFAULTS.trailIntensityMultiplier },
    uBiasNoiseScale: { value: DEFAULTS.biasNoiseScale },
    uBiasNoiseSpeed: { value: DEFAULTS.biasNoiseSpeed },
    uBiasPulseSpeed: { value: DEFAULTS.biasPulseSpeed },
    uBiasNoiseWeight: { value: DEFAULTS.biasNoiseWeight },
    uBiasPulseWeight: { value: DEFAULTS.biasPulseWeight },
    uBiasAnimationStrength: { value: DEFAULTS.biasAnimationStrength },
  };
  const halftoneMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: HALFTONE_FRAG,
    uniforms: halftoneUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const halftoneMesh = new THREE.Mesh(geometry, halftoneMaterial);
  scene.add(halftoneMesh);

  /* ----- program 1: pointer-trail feedback material ----- */

  const trailUniforms = {
    u_texture: { value: null },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uLastPointer: { value: new THREE.Vector2(0, 0) },
    uAspect: { value: 1 },
    uVelocity: { value: 0 },
    uTime: { value: 0 },
    uInitialRadius: { value: TRAIL_DEFAULTS.initialRadius },
    uInitialRadiusMultiplier: { value: TRAIL_DEFAULTS.initialRadiusMultiplier },
    uBorderSize: { value: TRAIL_DEFAULTS.borderSize },
    uBorderSizeMultiplier: { value: TRAIL_DEFAULTS.borderSizeMultiplier },
    uDecayRate: { value: TRAIL_DEFAULTS.decayRate },
  };
  const trailMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: trailUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const trailMesh = new THREE.Mesh(geometry, trailMaterial);
  trailScene.add(trailMesh);

  /* ----- ping-pong render targets + neutral trail state ----- */

  // Reference ping-pong construction (bundle constants: type 1016 = HalfFloatType,
  // filter 1003 = NearestFilter, no depth/stencil). 8-bit RTs quantize the trail
  // feedback into visible decay steps; half-float keeps the decay exponential-smooth.
  const rtOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const rtA = new THREE.WebGLRenderTarget(1, 1, rtOptions);
  const rtB = new THREE.WebGLRenderTarget(1, 1, rtOptions);
  let readRt = rtA;
  let writeRt = rtB;
  let emptyTrail = makeBlackDataTexture(1, 1); // resized with the canvas
  halftoneUniforms.uTrail.value = emptyTrail;

  /* ----- sizing ----- */

  let cssW = 1;
  let cssH = 1;
  function resize() {
    cssW = canvas.clientWidth || window.innerWidth;
    cssH = canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    const bw = Math.max(1, Math.round(cssW * pr));
    const bh = Math.max(1, Math.round(cssH * pr));

    camera.left = -cssW / 2;
    camera.right = cssW / 2;
    camera.top = cssH / 2;
    camera.bottom = -cssH / 2;
    camera.updateProjectionMatrix();

    // Fullscreen triangle is authored in clip space — no mesh scaling applies.

    rtA.setSize(bw, bh);
    rtB.setSize(bw, bh);

    emptyTrail.dispose();
    emptyTrail = makeBlackDataTexture(bw, bh);
    if (!halftoneUniforms.uTrail.value || halftoneUniforms.uTrail.value.isDataTexture) {
      halftoneUniforms.uTrail.value = emptyTrail;
    }

    halftoneUniforms.uPlaneSize.value.set(cssW, cssH); // viewport
    halftoneUniforms.uResolution.value.set(bw, bh); // drawing-buffer space (gl_FragCoord)
    if (heroTexture.image && heroTexture.image.naturalWidth) {
      halftoneUniforms.uTextureSize.value.set(heroTexture.image.naturalWidth, heroTexture.image.naturalHeight);
    }
    trailUniforms.uAspect.value = cssW / cssH;

    // Fresh targets start cleared so the first feedback read sees black.
    const prevBackground = new THREE.Color();
    renderer.getClearColor(prevBackground);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rtA);
    renderer.clear();
    renderer.setRenderTarget(rtB);
    renderer.clear();
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevBackground, prevAlpha);

  }

  /* ----- pointer tracking (uv space, origin bottom-left like gl_FragCoord) ----- */

  const pointer = { x: 0, y: 0 };
  const prevPointer = { x: 0, y: 0 };
  let smoothedVelocity = 0;
  let disposed = false;

  function onPointerMove(event) {
    pointer.x = event.clientX / Math.max(1, cssW);
    pointer.y = 1 - event.clientY / Math.max(1, cssH);
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  let elapsed = 0;

  /* ----- frame update ----- */

  function update(delta = 0, scrollY = null, velocity = 0) {
    if (disposed) return;
    const dt = Math.min(Math.max(delta, 0), 0.1);
    elapsed += dt;

    const y = scrollY === null || scrollY === undefined ? (lenis && typeof lenis.current === "number" ? lenis.current : window.scrollY) : scrollY;

    halftoneUniforms.uTime.value = elapsed * ANIM_TIME_SCALE;
    halftoneUniforms.uZoom.value = zoomForScroll(y);
    halftoneUniforms.uDitherAmount.value = DEFAULTS.ditherAmount;
    trailUniforms.uTime.value = elapsed;

    // uVelocity: pointer travel this frame (uv units) + Lenis scroll speed, smoothed.
    // Gain 30/40 tuned against r9-gpu trail probes: at 10/80 the trail read 1.97%
    // pixel-response vs the reference's 5.66% under an identical sweep (the earlier
    // 14-21% reading was bias-glitter noise, not trail). 30/40 lands in the ref band.
    const moved = Math.hypot(pointer.x - prevPointer.x, pointer.y - prevPointer.y);
    const target = Math.min(1, moved * 40 + Math.abs(velocity) / 40);
    smoothedVelocity += (target - smoothedVelocity) * 0.35;

    trailUniforms.uLastPointer.value.set(prevPointer.x, prevPointer.y);
    trailUniforms.uPointer.value.set(pointer.x, pointer.y);
    trailUniforms.uVelocity.value = smoothedVelocity;
    trailUniforms.u_texture.value = readRt.texture;

    // Trail pass: segment+cap over decayed previous frame into the write target.
    renderer.setRenderTarget(writeRt);
    renderer.render(trailScene, camera);
    const swap = readRt;
    readRt = writeRt;
    writeRt = swap;
    halftoneUniforms.uTrail.value = readRt.texture;
    prevPointer.x = pointer.x;
    prevPointer.y = pointer.y;

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function destroyInternal() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("resize", resize);
    geometry.dispose();
    halftoneMaterial.dispose();
    trailMaterial.dispose();
    heroTexture.dispose();
    emptyTrail.dispose();
    rtA.dispose();
    rtB.dispose();
    renderer.dispose();
  }

  resize();
  window.addEventListener("resize", resize);

  return { update, resize, destroy: destroyInternal };
}