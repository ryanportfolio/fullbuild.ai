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

export function createArtifactGeometry() {
  const random = createSeededRandom();
  const { positions, triangles } = createBaseSphere(3);

  const vapor = positions.map(([x, y, z]) => {
    const puff = 1.25 + random() * 0.55;
    const wobble = 0.18;
    return [
      x * puff + (random() - 0.5) * wobble,
      y * puff + (random() - 0.5) * wobble,
      z * puff + (random() - 0.5) * wobble,
    ];
  });

  const blueprint = positions.map(([x, y, z], index) => {
    const plane = index % 3;
    const point = [x * 1.15, y * 1.15, z * 1.15];
    point[plane] = point[plane] >= 0 ? 0.62 : -0.62;
    return point;
  });

  const machine = positions.map(([x, y, z]) => {
    const quantize = (value) => Math.round(value * 3) / 3;
    return [quantize(x) * 1.02, quantize(y) * 1.02, quantize(z) * 1.02];
  });

  const fused = positions.map(([x, y, z]) => {
    const cubeRadius = 0.92 / Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    const sphereRadius = 0.92;
    const radius = sphereRadius + (cubeRadius - sphereRadius) * 0.88;
    return [x * radius, y * radius, z * radius];
  });

  const scatterDirections = positions.map(() => {
    const theta = random() * TAU;
    const phi = Math.acos(2 * random() - 1);
    const reach = 1.8 + random() * 2.2;
    return [
      Math.sin(phi) * Math.cos(theta) * reach,
      Math.sin(phi) * Math.sin(theta) * reach,
      Math.cos(phi) * reach,
    ];
  });

  const barycentric = new Float32Array(positions.length * 3);
  for (const [a, b, c] of triangles) {
    barycentric[a * 3] = 1;
    barycentric[b * 3 + 1] = 1;
    barycentric[c * 3 + 2] = 1;
  }

  return Object.freeze({
    vertexCount: positions.length,
    triangleCount: triangles.length,
    indices: new Uint16Array(triangles.flat()),
    barycentric,
    targets: Object.freeze({
      vapor: flatten(vapor),
      blueprint: flatten(blueprint),
      machine: flatten(machine),
      fused: flatten(fused),
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
in vec3 aScatter;
in vec3 aBary;

uniform float uTime;
uniform float uScatter;
uniform float uSpin;
uniform mat4 uView;

out vec3 vBary;
out vec3 vNormal;
out vec3 vPosition;

vec3 morphTarget(float t) {
  if (t < 1.0) return mix(aVapor, aBlueprint, t);
  if (t < 2.0) return mix(aBlueprint, aMachine, t - 1.0);
  return mix(aMachine, aFused, t - 2.0);
}

void main() {
  vec3 position = morphTarget(clamp(uTime, 0.0, 3.0)) + aScatter * uScatter;
  float c = cos(uSpin);
  float s = sin(uSpin);
  position = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vNormal = normalize(position);
  vPosition = position;
  vBary = aBary;
  gl_Position = uView * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vBary;
in vec3 vNormal;
in vec3 vPosition;

uniform vec3 uBase;
uniform vec3 uEdge;
uniform vec3 uRim;
uniform float uWire;
uniform float uFlat;
uniform float uHeat;

out vec4 outColor;

void main() {
  vec3 faceNormal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
  vec3 normal = normalize(mix(vNormal, faceNormal, uFlat));
  vec3 lightDirection = normalize(vec3(0.55, 0.75, 0.45));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float rim = pow(1.0 - abs(normal.z), 2.2);

  vec3 shaded = uBase * (0.42 + 0.62 * diffuse) + uRim * rim * 0.55;
  shaded += vec3(1.0, 0.42, 0.35) * uHeat * pow(diffuse, 3.0) * 0.5;

  vec3 widths = fwidth(vBary);
  vec3 smoothed = smoothstep(vec3(0.0), widths * 2.2, vBary);
  float edge = 1.0 - min(min(smoothed.x, smoothed.y), smoothed.z);

  vec3 color = mix(shaded, uEdge, edge * uWire);
  outColor = vec4(color, 1.0);
}
`;

const STATE_LOOKS = Object.freeze([
  Object.freeze({ base: [0.5, 0.35, 0.9], edge: [0.55, 0.91, 1.0], rim: [0.55, 0.91, 1.0], wire: 0.55, flat: 0.05 }),
  Object.freeze({ base: [0.95, 0.94, 0.91], edge: [0.2, 0.28, 1.0], rim: [0.2, 0.28, 1.0], wire: 0.95, flat: 0.0 }),
  Object.freeze({ base: [0.13, 0.13, 0.19], edge: [0.91, 1.0, 0.4], rim: [0.55, 0.91, 1.0], wire: 0.8, flat: 1.0 }),
  Object.freeze({ base: [1.0, 0.42, 0.35], edge: [0.09, 0.08, 0.12], rim: [0.95, 0.94, 0.91], wire: 0.12, flat: 0.25 }),
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
    edge: from.edge.map((v, i) => lerp(v, to.edge[i])),
    rim: from.rim.map((v, i) => lerp(v, to.rim[i])),
    wire: lerp(from.wire, to.wire),
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
  bindAttribute("aScatter", geometry.scatterDirections);
  bindAttribute("aBary", geometry.barycentric);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);

  const uniforms = {};
  for (const name of ["uTime", "uScatter", "uSpin", "uView", "uBase", "uEdge", "uRim", "uWire", "uFlat", "uHeat"]) {
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
    offsetX: 0.62,
    offsetY: 0.02,
    scale: 0.62,
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
    const projection = perspective(Math.PI / 5, aspect, 0.1, 30);
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
    gl.uniform3fv(uniforms.uEdge, look.edge);
    gl.uniform3fv(uniforms.uRim, look.rim);
    gl.uniform1f(uniforms.uWire, look.wire);
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
