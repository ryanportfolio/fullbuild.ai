// Quench WebGL2 engine. Raw context, no three.js. Two passes:
//
// Pass S (magnetization): 256x256 RGBA8 ping-pong. Blur + decay the previous
// field, splat a gaussian at the cursor. Gives lingering ferrofluid pull
// trails. Skipped on tier L (analytic cursor falloff only).
//
// Pass M (main, fullscreen): the whole material. Height field = domain-warped
// fbm liquid + lattice ferro spikes under the cursor field, sculpted toward
// baked artifact targets (R blurred height, G sharp mask, B reflection glyphs)
// inside up to two active anchor rects. Forward-difference normals (3 height
// evals), chrome shading with fresnel environment and key light, thin-film
// iridescence on high-curvature ridges that fades as surfaces set.

const FIELD_SIZE = 256;

const VS = `#version 300 es
void main() {
  float x = (gl_VertexID == 1) ? 3.0 : -1.0;
  float y = (gl_VertexID == 2) ? 3.0 : -1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

const FS_FIELD = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform float u_dt;
uniform vec2 u_cursorUv;
uniform float u_splat;
uniform float u_aspect;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / ${FIELD_SIZE}.0;
  float o = 1.5 / ${FIELD_SIZE}.0;
  float e = 0.0;
  e += texture(u_prev, uv + vec2(o, 0.0)).r;
  e += texture(u_prev, uv - vec2(o, 0.0)).r;
  e += texture(u_prev, uv + vec2(0.0, o)).r;
  e += texture(u_prev, uv - vec2(0.0, o)).r;
  e *= 0.25;
  e *= pow(0.96, u_dt * 60.0);
  vec2 d = uv - u_cursorUv;
  d.x *= u_aspect;
  e += exp(-dot(d, d) / 0.0036) * u_splat;
  outColor = vec4(min(e, 1.0), 0.0, 0.0, 1.0);
}
`;

const FS_MAIN = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_res;
uniform float u_time;
uniform float u_scale;
uniform vec2  u_cursorPx;
uniform float u_cursorStrength;
uniform sampler2D u_field;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform vec4  u_rectA;
uniform vec4  u_rectB;
uniform float u_setA;
uniform float u_setB;
uniform float u_gainA;
uniform float u_gainB;
uniform int   u_modeA;
uniform int   u_modeB;
uniform float u_wobblePhase;
uniform int   u_octaves;
uniform float u_iriGain;
uniform int   u_fieldOn;
uniform int   u_deviceLocked;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    if (i >= u_octaves) break;
    v += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

float easeSet(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// Soft-edged inside weight for a contain-fitted rect uv. Wide feather so
// imprints emerge from the metal instead of sitting in a stamped tray
float rectW(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 lo = smoothstep(vec2(0.0), vec2(0.14), uv);
  vec2 hi = vec2(1.0) - smoothstep(vec2(0.86), vec2(1.0), uv);
  return lo.x * lo.y * hi.x * hi.y;
}

float fieldStrength(vec2 p) {
  vec2 d = (p - u_cursorPx) / (0.20 * u_res.y);
  float f = exp(-dot(d, d)) * u_cursorStrength;
  if (u_fieldOn == 1) f += textureLod(u_field, p / u_res, 0.0).r;
  return f;
}

float sculptBlend(vec2 p, float h, float liquid, float spikes, sampler2D tex, vec4 rect, float setv, float gain, int mode) {
  if (rect.z < 1.0 || setv <= 0.002) return h;
  vec2 uv = (p - rect.xy) / rect.zw;
  float w = rectW(uv);
  if (w <= 0.002) return h;
  vec3 t = textureLod(tex, vec2(uv.x, 1.0 - uv.y), 0.0).rgb;
  // Sharp mask blends in as the metal sets, so half-set glyphs already read
  float sculptH = mix(t.r, max(t.r, t.g), smoothstep(0.35, 0.85, setv));
  // Gate near zero so a decaying rect never stamps its border into the liquid
  float e = easeSet(setv) * w * smoothstep(0.12, 0.30, setv);
  // Local glyph presence: far from any stroke the liquid stays untouched, so
  // the imprint never reads as a flattened rectangular tray
  float presence = smoothstep(0.08, 0.30, max(t.r, t.g));
  if (mode == 1) {
    // Ghost: the shipped cube never stabilizes. Continuous noise wobble so
    // the hex flexes as one molten body, contained by its sharp silhouette
    float cell = vnoise(p / u_scale * 0.02);
    sculptH *= 1.0 + 0.12 * sin(u_time * 1.7 + cell * 6.28318 + u_wobblePhase);
    return mix(h, sculptH * 1.6 + liquid * 0.12, e * smoothstep(0.3, 0.7, t.g));
  }
  if (mode == 2) {
    // Pools: deep depressions, never spikes
    return h - t.r * 1.8 * e;
  }
  if (mode == 3) {
    // Mirror: flatten toward stillness with a wide vertical feather so the
    // pool edge melts into the surrounding liquid instead of cutting a seam
    float wm = smoothstep(0.0, 0.30, uv.y) * (1.0 - smoothstep(0.70, 1.0, uv.y));
    return mix(h, mix(0.5, liquid, 0.12), e * wm);
  }
  if (mode == 4) {
    // Device: lower-right corner stays molten while unverified
    float corner = smoothstep(0.55, 0.85, uv.x) * (1.0 - smoothstep(0.15, 0.45, uv.y));
    float gate = smoothstep(0.35, 0.65, fbm(uv * 3.0 + u_time * 0.08));
    float liquidMask = (u_deviceLocked == 1) ? corner * (0.55 + 0.45 * gate) : 0.0;
    return mix(h, sculptH * 1.6 + liquid * 0.12, e * presence * (1.0 - liquidMask));
  }
  // Mode 0: per-rect amplitude so letters and motifs read as ridges, and
  // cursor spikes only grow on glyph strokes, never as loose artifacts
  return mix(h, sculptH * gain + liquid * 0.06 + spikes * 1.4 * t.g, e * presence);
}

float heightAt(vec2 p) {
  vec2 cp = p / u_scale;
  vec2 np = cp * 0.006;
  vec2 warp = vec2(
    fbm(np * 1.7 + vec2(1.7, 9.2) + u_time * 0.06),
    fbm(np * 1.7 + vec2(8.3, 2.8) - u_time * 0.05)
  );
  // Two bands: large calm swells under fine wrinkle, so the surface has
  // quiet mirror stretches between ridge lines instead of uniform crumple
  float liquid = 0.55 * fbm(np * 0.35 + warp * 0.4)
               + 0.45 * fbm(np + (warp - 0.5) * 0.9 + u_time * 0.03);
  float f = 0.055;
  // Rotated, phase-jittered, noise-modulated lattice so cursor spikes
  // cluster organically instead of reading as an axis-aligned blob grid
  vec2 rp = mat2(0.921, -0.389, 0.389, 0.921) * cp;
  float j = vnoise(rp * f * 0.159);
  float lattice = max(0.0, sin(rp.x * f + j * 6.28318) + sin(rp.y * f * 1.13 + j * 4.0)) * 0.5;
  lattice *= 0.6 + 0.8 * vnoise(cp * 0.02);
  float spikes = pow(lattice, 3.0) * fieldStrength(p) * 1.6;
  float h = liquid + spikes;
  h = sculptBlend(p, h, liquid, spikes, u_texA, u_rectA, u_setA, u_gainA, u_modeA);
  h = sculptBlend(p, h, liquid, spikes, u_texB, u_rectB, u_setB, u_gainB, u_modeB);
  return h;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float eps = 1.5;
  float h0 = heightAt(p);
  float hx = heightAt(p + vec2(eps, 0.0));
  float hy = heightAt(p + vec2(0.0, eps));
  vec2 grad = (vec2(hx, hy) - h0) / eps * (26.0 * u_scale);
  vec3 N = normalize(vec3(-grad, 1.4));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.4, 0.55, 0.72));
  float ndv = clamp(N.z, 0.0, 1.0);
  vec3 R = reflect(-V, N);

  // Local set weight, ghost iridescence boost, baked page-copy glow,
  // mirror stillness mask, pool occlusion mask
  float setLocal = 0.0;
  float iriBoost = 0.0;
  float glow = 0.0;
  float mirrorMask = 0.0;
  float poolMask = 0.0;
  vec2 uvA = (p - u_rectA.xy) / max(u_rectA.zw, vec2(1.0));
  float wA = (u_rectA.z >= 1.0) ? rectW(uvA) : 0.0;
  if (wA > 0.0) {
    setLocal = max(setLocal, easeSet(u_setA) * wA);
    if (u_modeA == 1) iriBoost = max(iriBoost, wA * smoothstep(0.15, 0.6, textureLod(u_texA, vec2(uvA.x, 1.0 - uvA.y), 0.0).g));
    if (u_modeA == 3) mirrorMask = max(mirrorMask, wA * easeSet(u_setA));
    if (u_modeA == 2) poolMask = max(poolMask, textureLod(u_texA, vec2(uvA.x, 1.0 - uvA.y), 0.0).r * wA * easeSet(u_setA));
    glow += textureLod(u_texA, clamp(vec2(uvA.x, 1.0 - uvA.y) + R.xy * 0.08, 0.0, 1.0), 0.0).b * wA;
  }
  vec2 uvB = (p - u_rectB.xy) / max(u_rectB.zw, vec2(1.0));
  float wB = (u_rectB.z >= 1.0) ? rectW(uvB) : 0.0;
  if (wB > 0.0) {
    setLocal = max(setLocal, easeSet(u_setB) * wB);
    if (u_modeB == 1) iriBoost = max(iriBoost, wB * smoothstep(0.15, 0.6, textureLod(u_texB, vec2(uvB.x, 1.0 - uvB.y), 0.0).g));
    if (u_modeB == 3) mirrorMask = max(mirrorMask, wB * easeSet(u_setB));
    if (u_modeB == 2) poolMask = max(poolMask, textureLod(u_texB, vec2(uvB.x, 1.0 - uvB.y), 0.0).r * wB * easeSet(u_setB));
    glow += textureLod(u_texB, clamp(vec2(uvB.x, 1.0 - uvB.y) + R.xy * 0.08, 0.0, 1.0), 0.0).b * wB;
  }

  // Dark mirror: crushed midtones, hot ridge speculars, real black in troughs
  vec3 env = mix(vec3(0.003, 0.004, 0.007), vec3(0.68, 0.72, 0.85), R.y * 0.5 + 0.5);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 HV = normalize(L + V);
  float spec = pow(max(dot(N, HV), 0.0), 90.0) * 2.4;
  float sheen = pow(max(dot(N, HV), 0.0), 14.0) * 0.22;
  vec3 albedo = vec3(0.030, 0.034, 0.042);
  vec3 color = albedo * 0.35 + env * fres + vec3(spec + sheen);
  color *= 1.0 - poolMask * 0.6;
  // The still pool darkens toward a night-sky reflection, quieter than the
  // surrounding liquid, so the baked reflection line can surface in it
  color = mix(color, env * 0.15, mirrorMask);

  // Thin-film interference painted along crest lines; liquid flares, set
  // chrome keeps a faint film baseline, the mirror pool goes glass-dead
  float crest = smoothstep(0.55, 0.95, h0);
  float curv = clamp(abs(hx + hy - 2.0 * h0) * 5.0, 0.0, 1.0) * crest;
  float ph = ndv * 1.2 + curv * 3.0 + u_time * 0.02;
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(ph) + vec3(0.0, 0.36, 0.70)));
  float gain = u_iriGain * max(max(1.0 - setLocal, iriBoost), 0.12) * (1.0 - mirrorMask) * smoothstep(0.0, 0.35, ndv);
  color += film * smoothstep(0.30, 0.75, curv) * gain;

  // Baked reflection copy shimmers in color space, brightest in the pool,
  // never divided away by fresnel on flat surfaces
  color += glow * vec3(0.85, 0.92, 1.0) * (0.08 + 0.45 * mirrorMask);

  vec2 suv = p / u_res;
  float vig = smoothstep(1.30, 0.55, length(suv - 0.5) * 1.7);
  color = mix(vec3(0.002, 0.0025, 0.0035), color, vig);
  // Contrast curve: deepen troughs toward void, keep ridge speculars hard
  color = pow(max(color, vec3(0.0)), vec3(1.4));
  color += (hash21(p + fract(u_time) * 61.7) - 0.5) / 255.0;
  outColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Quench shader compile failed: " + log);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Quench program link failed: " + log);
  }
  return prog;
}

function locations(gl, prog, names) {
  const out = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

export function createEngine(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true
  });
  if (!gl) return null;

  const progField = link(gl, VS, FS_FIELD);
  const progMain = link(gl, VS, FS_MAIN);
  const uField = locations(gl, progField, [
    "u_prev", "u_dt", "u_cursorUv", "u_splat", "u_aspect"
  ]);
  const uMain = locations(gl, progMain, [
    "u_res", "u_time", "u_scale", "u_cursorPx", "u_cursorStrength",
    "u_field", "u_texA", "u_texB", "u_rectA", "u_rectB",
    "u_setA", "u_setB", "u_gainA", "u_gainB", "u_modeA", "u_modeB", "u_wobblePhase",
    "u_octaves", "u_iriGain", "u_fieldOn", "u_deviceLocked"
  ]);

  const vao = gl.createVertexArray();

  function plainTexture(w, h, data) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  const fieldTex = [
    plainTexture(FIELD_SIZE, FIELD_SIZE),
    plainTexture(FIELD_SIZE, FIELD_SIZE)
  ];
  const fieldFbo = [gl.createFramebuffer(), gl.createFramebuffer()];
  for (let i = 0; i < 2; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex[i], 0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const blackTex = plainTexture(1, 1, new Uint8Array([0, 0, 0, 255]));
  const targets = [];

  let ping = 0;
  let scale = 1;
  let bufW = 2;
  let bufH = 2;
  let octaves = 4;
  let fieldOn = true;
  let disposed = false;

  function resize(cssW, cssH, dpr, tierScale) {
    const d = Math.min(dpr || 1, 1.5);
    scale = d * (tierScale || 1);
    bufW = Math.max(2, Math.round(Math.max(1, cssW) * scale));
    bufH = Math.max(2, Math.round(Math.max(1, cssH) * scale));
    canvas.width = bufW;
    canvas.height = bufH;
  }

  function setOctaves(n) {
    octaves = Math.max(1, Math.min(5, n | 0));
  }

  function setFieldOn(on) {
    fieldOn = !!on;
  }

  function clearField() {
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo[i]);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function setTarget(index, imageData) {
    if (disposed || !imageData) return;
    const i = index | 0;
    let entry = targets[i];
    if (!entry) {
      entry = { tex: plainTexture(1, 1), w: 1, h: 1 };
      targets[i] = entry;
    }
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    entry.w = imageData.width;
    entry.h = imageData.height;
  }

  // Mode-0 relief amplitude per sculpt: stage motifs need more height than
  // the tagline to survive the fbm noise floor at their smaller anchors
  const GAINS = { tagline: 2.0, orb: 3.0, lens: 3.0, ingot: 2.6 };

  // Contain-fit the target texture inside the css anchor rect, then convert
  // to framebuffer px with y flipped
  function fitRect(pair) {
    const entry = pair ? targets[pair.texIndex | 0] : null;
    const r = pair ? pair.anchorRectPx : null;
    if (!entry || !r || !(r.w > 2) || !(r.h > 2) || !(pair.set > 0)) {
      return { rect: [0, 0, 0, 0], tex: blackTex, set: 0, gain: 2, mode: 0 };
    }
    let w = r.w;
    let h = r.h;
    // Mode 3 (mirror) is a flat fill and the tagline is baked from measured
    // DOM line boxes: both stretch to the anchor so texture uv space maps the
    // anchor rect exactly, keeping GL glyphs registered to the DOM headline
    if ((pair.mode | 0) !== 3 && pair.sculptId !== "tagline") {
      const ta = entry.w / Math.max(1, entry.h);
      if (w / h > ta) w = h * ta;
      else h = w / ta;
    }
    const cssX = r.x + (r.w - w) / 2;
    const cssY = r.y + (r.h - h) / 2;
    return {
      rect: [cssX * scale, bufH - (cssY + h) * scale, w * scale, h * scale],
      tex: entry.tex,
      set: pair.set,
      gain: GAINS[pair.sculptId] !== undefined ? GAINS[pair.sculptId] : 2,
      mode: pair.mode | 0
    };
  }

  function stepField(dt, cursor) {
    if (disposed || !fieldOn) return;
    const dst = 1 - ping;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo[dst]);
    gl.viewport(0, 0, FIELD_SIZE, FIELD_SIZE);
    gl.useProgram(progField);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex[ping]);
    gl.uniform1i(uField.u_prev, 0);
    gl.uniform1f(uField.u_dt, dt);
    const cx = (cursor.x * scale) / bufW;
    const cy = (bufH - cursor.y * scale) / bufH;
    gl.uniform2f(uField.u_cursorUv, cx, cy);
    const splat = Math.min(1, (cursor.speed || 0) * 0.004) + (cursor.held ? 0.25 : 0);
    gl.uniform1f(uField.u_splat, splat * Math.max(0, Math.min(1, cursor.strength)));
    gl.uniform1f(uField.u_aspect, bufW / bufH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    ping = dst;
  }

  function render(frame) {
    if (disposed) return;
    const cursor = frame.cursor || { x: -1e4, y: -1e4, strength: 0 };
    const pairs = frame.pairs || [];
    const a = fitRect(pairs[0]);
    const b = fitRect(pairs[1]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufW, bufH);
    gl.clearColor(0.0196, 0.0235, 0.0314, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(progMain);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldOn ? fieldTex[ping] : blackTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(uMain.u_field, 0);
    gl.uniform1i(uMain.u_texA, 1);
    gl.uniform1i(uMain.u_texB, 2);

    gl.uniform2f(uMain.u_res, bufW, bufH);
    gl.uniform1f(uMain.u_time, frame.time || 0);
    gl.uniform1f(uMain.u_scale, scale);
    gl.uniform2f(uMain.u_cursorPx, cursor.x * scale, bufH - cursor.y * scale);
    gl.uniform1f(uMain.u_cursorStrength, Math.max(0, Math.min(1, cursor.strength || 0)));
    gl.uniform4fv(uMain.u_rectA, a.rect);
    gl.uniform4fv(uMain.u_rectB, b.rect);
    gl.uniform1f(uMain.u_setA, a.set);
    gl.uniform1f(uMain.u_setB, b.set);
    gl.uniform1f(uMain.u_gainA, a.gain);
    gl.uniform1f(uMain.u_gainB, b.gain);
    gl.uniform1i(uMain.u_modeA, a.mode);
    gl.uniform1i(uMain.u_modeB, b.mode);
    gl.uniform1f(uMain.u_wobblePhase, frame.wobblePhase || 0);
    gl.uniform1i(uMain.u_octaves, octaves);
    gl.uniform1f(uMain.u_iriGain, frame.iriGain !== undefined ? frame.iriGain : 1);
    gl.uniform1i(uMain.u_fieldOn, fieldOn ? 1 : 0);
    gl.uniform1i(uMain.u_deviceLocked, frame.deviceLocked ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const t of targets) if (t) gl.deleteTexture(t.tex);
    gl.deleteTexture(blackTex);
    gl.deleteTexture(fieldTex[0]);
    gl.deleteTexture(fieldTex[1]);
    gl.deleteFramebuffer(fieldFbo[0]);
    gl.deleteFramebuffer(fieldFbo[1]);
    gl.deleteProgram(progField);
    gl.deleteProgram(progMain);
    gl.deleteVertexArray(vao);
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return {
    resize,
    setOctaves,
    setFieldOn,
    setTarget,
    stepField,
    render,
    clearField,
    dispose,
    get scale() {
      return scale;
    }
  };
}
