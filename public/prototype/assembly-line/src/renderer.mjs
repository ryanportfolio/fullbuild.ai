const SEED = 20260720;

export function createSeededRandom(seed = SEED) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/* Seeded 3D value noise: smooth, deterministic, no texture fetch. Used at
   build time only, so cost is irrelevant; smoothness is what matters. */
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);
  const zf = smootherstep(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
    lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
    zf,
  );
}

function fbm(x, y, z, octaves = 3) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / norm;
}

function createBaseSphere(subdivisions) {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const norm = (v) => {
    const length = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  let positions = raw.map(norm);
  let triangles = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let step = 0; step < subdivisions; step += 1) {
    const midpointCache = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!midpointCache.has(key)) {
        const va = positions[a];
        const vb = positions[b];
        positions.push(norm([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
        midpointCache.set(key, positions.length - 1);
      }
      return midpointCache.get(key);
    };
    const nextTriangles = [];
    for (const [a, b, c] of triangles) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      nextTriangles.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    triangles = nextTriangles;
  }

  return { positions, triangles };
}

const flatten = (vectors) => {
  const out = new Float32Array(vectors.length * 3);
  vectors.forEach((v, index) => {
    out[index * 3] = v[0];
    out[index * 3 + 1] = v[1];
    out[index * 3 + 2] = v[2];
  });
  return out;
};

/* Smooth per-vertex normals for one morph target, averaged from adjacent
   face normals. Baked per target and interpolated in the vertex shader so
   shading stays smooth through every in-between shape. */
function smoothNormals(positions, triangles) {
  const normals = positions.map(() => [0, 0, 0]);
  for (const [a, b, c] of triangles) {
    const pa = positions[a];
    const pb = positions[b];
    const pc = positions[c];
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const index of [a, b, c]) {
      normals[index][0] += nx;
      normals[index][1] += ny;
      normals[index][2] += nz;
    }
  }
  return normals.map((n) => {
    const length = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / length, n[1] / length, n[2] / length];
  });
}

export function createArtifactGeometry() {
  const { positions, triangles } = createBaseSphere(4);
  const coarse = createBaseSphere(0);

  // Plane (normal + offset) of each of the 20 icosahedron faces, for the
  // machine state's clean large facets.
  const facePlanes = coarse.triangles.map(([a, b, c]) => {
    const pa = coarse.positions[a];
    const pb = coarse.positions[b];
    const pc = coarse.positions[c];
    const n = [
      (pa[0] + pb[0] + pc[0]) / 3,
      (pa[1] + pb[1] + pc[1]) / 3,
      (pa[2] + pb[2] + pc[2]) / 3,
    ];
    const length = Math.hypot(n[0], n[1], n[2]);
    const normal = [n[0] / length, n[1] / length, n[2] / length];
    const offset = pa[0] * normal[0] + pa[1] * normal[1] + pa[2] * normal[2];
    return { normal, offset };
  });

  // Vapor: soft lumpy cloud. Low-frequency fbm keeps neighboring vertices
  // moving together, so the surface reads as one soft mass, never spikes.
  const vapor = positions.map(([x, y, z]) => {
    const r = 1.06 + 0.26 * fbm(x * 1.6 + 3.1, y * 1.6, z * 1.6);
    return [x * r, y * r, z * r];
  });

  // Blueprint: the ideal measured form, a perfect sphere. Drafting lines are
  // drawn in the fragment shader, not in the geometry.
  const blueprint = positions.map(([x, y, z]) => [x * 1.1, y * 1.1, z * 1.1]);

  // Machine: 20 large planar facets (the coarse icosahedron), each vertex
  // projected onto its nearest face plane. Crisp, articulated, no noise.
  const machine = positions.map(([x, y, z]) => {
    let best = facePlanes[0];
    let bestDot = -Infinity;
    for (const plane of facePlanes) {
      const d = x * plane.normal[0] + y * plane.normal[1] + z * plane.normal[2];
      if (d > bestDot) {
        bestDot = d;
        best = plane;
      }
    }
    const r = (best.offset / bestDot) * 1.06;
    return [x * r, y * r, z * r];
  });

  // Fused: rounded cube via superellipsoid, the sealed crate.
  const fused = positions.map(([x, y, z]) => {
    const p = 6;
    const radius = 0.95 / ((Math.abs(x) ** p + Math.abs(y) ** p + Math.abs(z) ** p) ** (1 / p));
    return [x * radius, y * radius, z * radius];
  });

  // Coherent scatter: neighboring vertices drift together into soft lobes
  // (low-frequency noise direction + radial push), so high scatter reads as
  // "not yet condensed" instead of an explosion of shards.
  const scatterDirections = positions.map(([x, y, z]) => {
    const nx = fbm(x * 1.1 + 11.3, y * 1.1, z * 1.1, 2);
    const ny = fbm(x * 1.1, y * 1.1 + 7.7, z * 1.1, 2);
    const nz = fbm(x * 1.1, y * 1.1, z * 1.1 + 5.9, 2);
    const reach = 0.55 + 0.5 * (fbm(x * 0.9 + 19.1, y * 0.9, z * 0.9, 2) * 0.5 + 0.5);
    return [
      (x * 0.7 + nx * 1.1) * reach,
      (y * 0.7 + ny * 1.1) * reach,
      (z * 0.7 + nz * 1.1) * reach,
    ];
  });

  return Object.freeze({
    vertexCount: positions.length,
    triangleCount: triangles.length,
    indices: new Uint16Array(triangles.flat()),
    directions: flatten(positions),
    targets: Object.freeze({
      vapor: flatten(vapor),
      blueprint: flatten(blueprint),
      machine: flatten(machine),
      fused: flatten(fused),
    }),
    normals: Object.freeze({
      vapor: flatten(smoothNormals(vapor, triangles)),
      blueprint: flatten(smoothNormals(blueprint, triangles)),
      machine: flatten(smoothNormals(machine, triangles)),
      fused: flatten(smoothNormals(fused, triangles)),
    }),
    scatterDirections: flatten(scatterDirections),
  });
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 aVapor;
in vec3 aBlueprint;
in vec3 aMachine;
in vec3 aFused;
in vec3 aVaporN;
in vec3 aBlueprintN;
in vec3 aMachineN;
in vec3 aFusedN;
in vec3 aDir;
in vec3 aScatter;

uniform float uTime;
uniform float uScatter;
uniform float uSpin;
uniform mat4 uView;

out vec3 vNormal;
out vec3 vPosition;
out vec3 vDir;

vec3 morph(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  if (t < 1.0) return mix(a, b, smoothstep(0.0, 1.0, t));
  if (t < 2.0) return mix(b, c, smoothstep(0.0, 1.0, t - 1.0));
  return mix(c, d, smoothstep(0.0, 1.0, t - 2.0));
}

void main() {
  float t = clamp(uTime, 0.0, 3.0);
  vec3 position = morph(aVapor, aBlueprint, aMachine, aFused, t);
  vec3 normal = normalize(morph(aVaporN, aBlueprintN, aMachineN, aFusedN, t));
  position += aScatter * uScatter;

  float c = cos(uSpin);
  float s = sin(uSpin);
  mat3 spin = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  position = spin * position;

  vNormal = spin * normal;
  vPosition = position;
  vDir = aDir;
  gl_Position = uView * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
in vec3 vDir;

uniform vec3 uBase;
uniform vec3 uLine;
uniform vec3 uRim;
uniform float uLines;
uniform float uFlat;
uniform float uHeat;

out vec4 outColor;

float draftLine(float coordinate, float count) {
  float cell = coordinate * count;
  float distanceToLine = abs(fract(cell) - 0.5);
  float width = fwidth(cell);
  // Lines sit on cell boundaries (fract near 0 or 1, i.e. distance near 0.5)
  return smoothstep(0.5 - width * 1.6, 0.5 - width * 0.2, distanceToLine);
}

void main() {
  vec3 faceNormal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
  vec3 normal = normalize(mix(normalize(vNormal), faceNormal, uFlat));

  vec3 keyDirection = normalize(vec3(0.5, 0.72, 0.48));
  vec3 fillDirection = normalize(vec3(-0.6, -0.15, 0.35));
  float key = pow(max(dot(normal, keyDirection), 0.0), 1.15);
  float fill = max(dot(normal, fillDirection), 0.0) * 0.22;
  float ambient = 0.34 + 0.08 * normal.y;
  float rim = pow(clamp(1.0 - abs(normal.z), 0.0, 1.0), 2.6);

  vec3 shaded = uBase * (ambient + key * 0.72 + fill);
  shaded += uRim * rim * 0.4;
  shaded += vec3(1.0, 0.5, 0.38) * uHeat * pow(key, 3.0) * 0.35;

  // Drafting lines for the blueprint state: latitude and longitude rules
  // drawn on the ideal sphere, anti-aliased in screen space.
  float longitude = atan(vDir.z, vDir.x) / 6.2831853 + 0.5;
  float latitude = asin(clamp(vDir.y, -1.0, 1.0)) / 3.1415927 + 0.5;
  // Longitude rules fade toward the poles where they would converge to mush
  float poleFade = 1.0 - pow(abs(vDir.y), 6.0);
  float lines = max(draftLine(longitude, 18.0) * poleFade, draftLine(latitude, 11.0));
  shaded = mix(shaded, uLine, lines * uLines * 0.85);

  outColor = vec4(pow(shaded, vec3(1.0 / 2.2)), 1.0);
}
`;

/* Per-state material: base surface, drafting-line color, rim tint, line and
   flat-shading amounts. Flat shading only matters for the machine state,
   where the 20 large facets read as intentional planes. */
const STATE_LOOKS = Object.freeze([
  Object.freeze({ base: [0.52, 0.47, 0.66], line: [0.52, 0.47, 0.66], rim: [0.92, 0.9, 0.96], lines: 0.0, flat: 0.0 }),
  Object.freeze({ base: [0.85, 0.84, 0.8], line: [0.11, 0.16, 0.85], rim: [0.75, 0.78, 0.95], lines: 1.0, flat: 0.0 }),
  Object.freeze({ base: [0.1, 0.1, 0.14], line: [0.1, 0.1, 0.14], rim: [0.52, 0.78, 0.88], lines: 0.0, flat: 1.0 }),
  Object.freeze({ base: [0.78, 0.16, 0.11], line: [0.78, 0.16, 0.11], rim: [0.93, 0.9, 0.85], lines: 0.0, flat: 0.12 }),
]);

const mixLook = (t) => {
  const clamped = Math.min(3, Math.max(0, t));
  const index = Math.min(2, Math.floor(clamped));
  const amount = clamped - index;
  const from = STATE_LOOKS[index];
  const to = STATE_LOOKS[index + 1];
  const lerp = (a, b) => a + (b - a) * amount;
  return {
    base: from.base.map((v, i) => lerp(v, to.base[i])),
    line: from.line.map((v, i) => lerp(v, to.line[i])),
    rim: from.rim.map((v, i) => lerp(v, to.rim[i])),
    lines: lerp(from.lines, to.lines),
    flat: lerp(from.flat, to.flat),
  };
};

function compileProgram(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
  }
  return program;
}

function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

export function createWorkshopRenderer(canvas, { maxDevicePixelRatio = 1.75 } = {}) {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const geometry = createArtifactGeometry();
  let program;
  try {
    program = compileProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  } catch {
    return null;
  }
  gl.useProgram(program);

  const bindAttribute = (name, data) => {
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  };

  bindAttribute("aVapor", geometry.targets.vapor);
  bindAttribute("aBlueprint", geometry.targets.blueprint);
  bindAttribute("aMachine", geometry.targets.machine);
  bindAttribute("aFused", geometry.targets.fused);
  bindAttribute("aVaporN", geometry.normals.vapor);
  bindAttribute("aBlueprintN", geometry.normals.blueprint);
  bindAttribute("aMachineN", geometry.normals.machine);
  bindAttribute("aFusedN", geometry.normals.fused);
  bindAttribute("aDir", geometry.directions);
  bindAttribute("aScatter", geometry.scatterDirections);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);

  const uniforms = {};
  for (const name of ["uTime", "uScatter", "uSpin", "uView", "uBase", "uLine", "uRim", "uLines", "uFlat", "uHeat"]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  const state = {
    time: 2,
    scatter: 0.02,
    heat: 0.35,
    spin: -0.55,
    offsetX: 0.92,
    offsetY: 0.06,
    scale: 0.58,
  };

  const render = () => {
    const dpr = Math.min(maxDevicePixelRatio, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = width / height;
    // Far plane covers the smallest hop scale: distance = 4.6 / scale can
    // reach ~37 when the artifact hops down the shop rules at scale ~0.125.
    const projection = perspective(Math.PI / 5, aspect, 0.1, 60);
    const distance = 4.6 / state.scale;
    const translate = (x, y, z) => new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1,
    ]);
    const multiply = (a, b) => {
      const out = new Float32Array(16);
      for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
          let sum = 0;
          for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
          out[column * 4 + row] = sum;
        }
      }
      return out;
    };
    const tilt = Math.PI / 14;
    const rotateX = new Float32Array([
      1, 0, 0, 0,
      0, Math.cos(tilt), Math.sin(tilt), 0,
      0, -Math.sin(tilt), Math.cos(tilt), 0,
      0, 0, 0, 1,
    ]);
    const view = multiply(projection, multiply(translate(state.offsetX, state.offsetY, -distance), rotateX));

    const look = mixLook(state.time);
    gl.uniform1f(uniforms.uTime, state.time);
    gl.uniform1f(uniforms.uScatter, state.scatter);
    gl.uniform1f(uniforms.uSpin, state.spin);
    gl.uniformMatrix4fv(uniforms.uView, false, view);
    gl.uniform3fv(uniforms.uBase, look.base);
    gl.uniform3fv(uniforms.uLine, look.line);
    gl.uniform3fv(uniforms.uRim, look.rim);
    gl.uniform1f(uniforms.uLines, look.lines);
    gl.uniform1f(uniforms.uFlat, look.flat);
    gl.uniform1f(uniforms.uHeat, state.heat);

    gl.drawElements(gl.TRIANGLES, geometry.indices.length, gl.UNSIGNED_SHORT, 0);
  };

  let lost = false;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
  });

  return Object.freeze({
    vertexCount: geometry.vertexCount,
    triangleCount: geometry.triangleCount,
    render,
    set(partial) {
      Object.assign(state, partial);
      if (!lost) render();
    },
    get: () => Object.freeze({ ...state }),
    isLost: () => lost,
    dispose() {
      const extension = gl.getExtension("WEBGL_lose_context");
      if (extension) extension.loseContext();
    },
  });
}
