// One WebGL2 context, one rAF client. Persistence lives in a scroll-stable
// atlas (one fixed slot per scope) ping-ponged at half resolution. Pass A
// composites beam energy over the decayed previous frame; pass B tonemaps to
// amber phosphor with graticule, 5-tap bloom, barrel, vignette, scanline
// shimmer, and procedural noise dither.

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG_A = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform vec2 u_texSize;
uniform vec4 u_slot;
uniform float u_decay;
uniform int u_kind;
uniform int u_wave;
uniform float u_time;
uniform float u_resolve;
uniform float u_trigger;
uniform float u_sweepMul;
uniform float u_spike;
uniform float u_aspect;
uniform float u_core;
uniform float u_emax;
uniform vec4 u_seg[96];
uniform int u_segCount;
uniform float u_segGain;
in vec2 v_uv;
out vec4 outColor;

float hash11(float n){ return fract(sin(n * 127.1) * 43758.5453123); }
float vnoise(float x){
  float i = floor(x), f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
float fbm(float x){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(x); x = x * 2.17 + 11.3; a *= 0.5; }
  return v;
}
float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
float glow(float d, float core){
  return exp(-(d * d) / (core * core)) + 0.045 * exp(-d / (core * 3.0));
}

void main(){
  vec2 tuv = (u_slot.xy + v_uv * u_slot.zw) / u_texSize;
  float e = texture(u_prev, tuv).r * u_decay;
  vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);
  float x = v_uv.x;

  if (u_kind == 0){
    // Union distance then max-composite: repeated coverage never double
    // deposits, so strokes stay ribbons instead of bead chains
    float md = 1e9;
    for (int i = 0; i < 96; i++){
      if (i >= u_segCount) break;
      md = min(md, segDist(p, u_seg[i].xy, u_seg[i].zw));
    }
    if (u_segCount > 0) e = max(e, glow(md, u_core) * u_segGain);
    // Operator acknowledge: a grabbed control shivers the whole trace
    e += u_spike * 0.30 * exp(-abs(p.y - 0.5) / (u_core * 7.0))
       * (0.5 + 0.5 * sin(p.x * 38.0 - u_time * 30.0));
  } else if (u_kind == 3){
    vec2 park = vec2(0.055 * u_aspect, 0.5);
    float breathe = 0.75 + 0.25 * sin(u_time * 1.05);
    e += glow(length(p - park), 0.02) * 0.06 * breathe;
    e += glow(abs(p.y - 0.5), 0.006) * 0.004;
    float md = 1e9;
    for (int i = 0; i < 96; i++){
      if (i >= u_segCount) break;
      md = min(md, segDist(p, u_seg[i].xy, u_seg[i].zw));
    }
    if (u_segCount > 0) e += glow(md, u_core) * u_segGain;
  } else {
    float period = 2.6 / max(u_sweepMul, 0.05);
    float headX = fract(u_time / period + float(u_wave) * 0.37);
    if (u_wave >= 3){
      float cell = floor(x * 9.0 + 0.2);
      float dash = step(0.42, fract(x * 9.0 + 0.2));
      float flick2 = 0.85 + 0.15 * vnoise(cell * 3.1 + u_time * 0.7);
      float dropout = abs(cell - 6.0) < 0.5 ? step(0.35, vnoise(u_time * 0.4)) : 1.0;
      e += glow(abs(v_uv.y - 0.5), u_core) * dash * 0.16 * flick2 * dropout;
      if (u_wave == 4){
        // Armed pulse: a slow heartbeat riding the hold line
        float phase = fract(u_time / 3.6);
        float beat = exp(-pow((phase - 0.5) * 9.0, 2.0));
        float env = exp(-pow((x - 0.5) * 9.0, 2.0));
        float yb = 0.5 - beat * env * 0.16 * sin(x * 44.0 - 22.0);
        e += glow(abs(v_uv.y - yb), u_core * 0.9) * 0.10 * beat;
      }
      // A safed press burns its refusal into the phosphor for a moment
      float md = 1e9;
      for (int i = 0; i < 96; i++){
        if (i >= u_segCount) break;
        md = min(md, segDist(p, u_seg[i].xy, u_seg[i].zw));
      }
      if (u_segCount > 0) e = max(e, glow(md, u_core) * u_segGain);
    } else {
      float noi = 0.5 + (fbm(x * 7.0 + u_time * 1.35 + float(u_wave) * 17.0) - 0.5) * 0.9;
      if (u_wave == 0){
        float flash = pow(vnoise(u_time * 0.5 + 3.7), 5.0);
        noi = mix(noi, 0.5 + 0.28 * sin(x * 15.0 + u_time * 2.0), flash * 0.85);
      }
      float tgt = 0.5;
      if (u_wave == 1){
        float env = smoothstep(0.0, 0.35, x) * smoothstep(1.0, 0.62, x);
        tgt = 0.5 + 0.30 * sin(x * 14.0) * env;
      } else if (u_wave == 2){
        float ph = fract(x * 3.0);
        float lvl = smoothstep(0.0, 0.03, ph) - smoothstep(0.5, 0.53, ph);
        tgt = mix(0.70, 0.28, lvl);
      }
      float y = mix(noi, tgt, clamp(u_resolve, 0.0, 1.0));
      y += u_trigger * 0.20;
      y += u_spike * 0.20 * exp(-pow((x - headX) * 7.0, 2.0)) * sin(34.0 * x - u_time * 24.0);
      float hot = 0.32 + 1.5 * exp(-pow((x - headX) * 16.0, 2.0));
      e += glow(abs(p.y - y), u_core) * hot * 0.22;
    }
  }
  // Phosphor saturates: bounds runaway accumulation wherever the beam parks
  e = min(e, u_emax);
  outColor = vec4(e, 0.0, 0.0, 1.0);
}`;

const FRAG_B = `#version 300 es
precision highp float;
uniform sampler2D u_persist;
uniform sampler2D u_noise;
uniform vec2 u_texSize;
uniform vec4 u_slot;
uniform float u_time;
uniform float u_tint;
uniform float u_boot;
uniform vec2 u_rectSize;
uniform vec2 u_grid;
uniform vec2 u_headB;
uniform float u_headBGain;
in vec2 v_uv;
out vec4 outColor;

float hash11(float n){ return fract(sin(n * 127.1) * 43758.5453123); }

float sampleE(vec2 uv){
  uv = clamp(uv, vec2(0.004), vec2(0.996));
  vec2 t = (u_slot.xy + uv * u_slot.zw) / u_texSize;
  return texture(u_persist, t).r;
}
vec3 tonemap(float e, float tint){
  float v = 1.0 - exp(-e * 0.9);
  vec3 ember = mix(vec3(0.30, 0.11, 0.02), vec3(0.30, 0.045, 0.02), tint);
  vec3 mid = mix(vec3(1.0, 0.706, 0.329), vec3(1.0, 0.231, 0.184), tint);
  vec3 hot = mix(vec3(1.0, 0.953, 0.863), vec3(1.0, 0.80, 0.74), tint);
  vec3 c = ember * smoothstep(0.0, 0.35, v);
  c = mix(c, mid, smoothstep(0.30, 0.72, v));
  c = mix(c, hot, smoothstep(0.80, 0.97, v));
  return c * v;
}

void main(){
  vec2 c0 = v_uv - 0.5;
  vec2 p = 0.5 + c0 * (1.0 + 0.09 * dot(c0, c0));

  vec2 px = 1.0 / max(u_slot.zw, vec2(1.0));
  float e = sampleE(p);
  e += 0.14 * (sampleE(p + vec2(px.x * 1.7, 0.0)) + sampleE(p - vec2(px.x * 1.7, 0.0))
             + sampleE(p + vec2(0.0, px.y * 1.7)) + sampleE(p - vec2(0.0, px.y * 1.7)));
  // Live beam head: drawn fresh each presented frame, never persisted, so
  // the trail records only the stroke while the head itself stays a hot spot
  if (u_headBGain > 0.0){
    float ar = u_rectSize.x / max(u_rectSize.y, 1.0);
    vec2 hp = vec2(p.x * ar, p.y);
    vec2 hb = vec2(u_headB.x * ar, u_headB.y);
    float hd = length(hp - hb);
    e += (exp(-(hd * hd) / 0.00012) + 0.05 * exp(-hd / 0.02)) * u_headBGain;
  }

  vec2 gp = p * u_grid;
  vec2 gw = max(fwidth(gp), vec2(1e-4));
  vec2 gd = abs(fract(gp) - 0.5) / gw;
  float line = 1.0 - min(min(gd.x, gd.y), 1.0);
  // 5-per-division tick marks along the two center axes
  vec2 mg = abs(fract(gp * 5.0) - 0.5) / (gw * 5.0);
  float tickY = (1.0 - min(mg.x, 1.0)) * (1.0 - smoothstep(0.008, 0.016, abs(p.y - 0.5)));
  float tickX = (1.0 - min(mg.y, 1.0)) * (1.0 - smoothstep(0.012, 0.02, abs(p.x - 0.5)));
  line = max(line, max(tickY, tickX) * 0.7);
  float edgeMask = step(0.006, p.x) * step(p.x, 0.994) * step(0.006, p.y) * step(p.y, 0.994);
  float flick = (u_boot >= 1.0) ? 1.0 : step(hash11(floor(u_time * 47.0)), u_boot * 1.15) * u_boot;

  vec3 col = vec3(0.016, 0.018, 0.022);
  col += vec3(0.141, 0.169, 0.192) * line * 0.55 * flick * edgeMask;
  col += tonemap(e, u_tint);

  col *= 1.0 + 0.035 * sin(v_uv.y * u_rectSize.y * 1.35 + u_time * 3.0);
  float vig = 1.0 - 0.35 * pow(length(c0) * 1.35, 2.2);
  col *= clamp(vig, 0.55, 1.0);

  float n = texture(u_noise, gl_FragCoord.xy / 128.0).r;
  col += (n - 0.5) * (2.0 / 255.0);
  col = max(col, vec3(0.0));

  vec2 lp = v_uv * u_rectSize;
  vec2 half_ = u_rectSize * 0.5;
  float rad = min(9.0, min(half_.x, half_.y));
  vec2 q = abs(lp - half_) - (half_ - vec2(rad));
  float rd = length(max(q, vec2(0.0))) - rad;
  float mask = 1.0 - smoothstep(-1.0, 1.0, rd);

  outColor = vec4(col * mask, mask);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("shader: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(gl, fragSrc, uniforms) {
  const pr = gl.createProgram();
  gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(pr));
  }
  const loc = {};
  for (const name of uniforms) loc[name] = gl.getUniformLocation(pr, name);
  return { pr, loc };
}

export function createGlCore(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true
  });
  if (!gl) return null;

  const floatOk = !!gl.getExtension("EXT_color_buffer_float");
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let persistScale = 0.5;

  const passA = program(gl, FRAG_A, [
    "u_prev", "u_texSize", "u_slot", "u_decay", "u_kind", "u_wave", "u_time",
    "u_resolve", "u_trigger", "u_sweepMul", "u_spike", "u_aspect", "u_core",
    "u_emax", "u_seg", "u_segCount", "u_segGain"
  ]);
  const passB = program(gl, FRAG_B, [
    "u_persist", "u_noise", "u_texSize", "u_slot", "u_time", "u_tint",
    "u_boot", "u_rectSize", "u_grid", "u_headB", "u_headBGain"
  ]);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Deterministic procedural noise texture for the dither, no asset fetch.
  const noiseTex = gl.createTexture();
  {
    const n = 128;
    const data = new Uint8Array(n * n * 4);
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0;
      return (seed & 0xff);
    };
    for (let i = 0; i < data.length; i += 4) {
      const v = rnd();
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  const atlas = {
    tex: [null, null],
    fbo: [null, null],
    w: 0, h: 0,
    latest: 0,
    slots: new Map(),
    sig: ""
  };

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internal = floatOk ? gl.RGBA16F : gl.RGBA8;
    const type = floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  function ensureAtlas(scopes) {
    const gutter = 4;
    const wants = scopes.map((s) => {
      const r = s.rect;
      const w = Math.max(8, Math.round((r ? r.width : 8) * dpr * persistScale));
      const h = Math.max(8, Math.round((r ? r.height : 8) * dpr * persistScale));
      return { id: s.id, w, h };
    });
    // Quantize to 16px so mobile URL-bar resizes do not thrash the atlas.
    const sig = persistScale + "|" + wants.map((w) => w.id + ":" + (Math.ceil(w.w / 16)) + "x" + (Math.ceil(w.h / 16))).join(",");
    if (sig === atlas.sig && atlas.tex[0]) return false;
    atlas.sig = sig;

    let aw = 8, ah = 0;
    atlas.slots.clear();
    for (const w of wants) {
      atlas.slots.set(w.id, { x: 0, y: ah, w: w.w, h: w.h });
      aw = Math.max(aw, w.w);
      ah += w.h + gutter;
    }
    aw = Math.min(aw, maxTex);
    ah = Math.min(Math.max(ah, 8), maxTex);
    atlas.w = aw;
    atlas.h = ah;

    for (let i = 0; i < 2; i++) {
      if (atlas.tex[i]) { gl.deleteTexture(atlas.tex[i]); gl.deleteFramebuffer(atlas.fbo[i]); }
      const t = makeTarget(aw, ah);
      atlas.tex[i] = t.tex;
      atlas.fbo[i] = t.fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    atlas.latest = 0;
    return true;
  }

  function resizeCanvas() {
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // frame: array of per-scope entries built by scopes.mjs.
  function render(frame, time, opts = {}) {
    resizeCanvas();
    // A rebuilt atlas starts empty; callers that skip pass A must re-bake
    const atlasRebuilt = ensureAtlas(frame);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);

    if (opts.passA !== false) {
      const write = 1 - atlas.latest;
      gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fbo[write]);
      gl.useProgram(passA.pr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.tex[atlas.latest]);
      gl.uniform1i(passA.loc.u_prev, 0);
      gl.uniform2f(passA.loc.u_texSize, atlas.w, atlas.h);
      gl.enable(gl.SCISSOR_TEST);
      for (const s of frame) {
        if (s.runA === false) continue;
        const slot = atlas.slots.get(s.id);
        if (!slot) continue;
        gl.viewport(slot.x, slot.y, slot.w, slot.h);
        gl.scissor(slot.x, slot.y, slot.w, slot.h);
        gl.uniform4f(passA.loc.u_slot, slot.x, slot.y, slot.w, slot.h);
        gl.uniform1f(passA.loc.u_decay, s.decay);
        gl.uniform1i(passA.loc.u_kind, s.kindIdx);
        gl.uniform1i(passA.loc.u_wave, s.waveIdx);
        gl.uniform1f(passA.loc.u_time, time);
        gl.uniform1f(passA.loc.u_resolve, s.resolve);
        gl.uniform1f(passA.loc.u_trigger, s.trigger);
        gl.uniform1f(passA.loc.u_sweepMul, s.sweepMul);
        gl.uniform1f(passA.loc.u_spike, s.spike);
        gl.uniform1f(passA.loc.u_aspect, slot.w / slot.h);
        gl.uniform1f(passA.loc.u_core, s.core);
        gl.uniform1f(passA.loc.u_emax, s.emax ?? 5.0);
        gl.uniform1i(passA.loc.u_segCount, s.segCount | 0);
        if (s.segCount > 0 && s.segs) gl.uniform4fv(passA.loc.u_seg, s.segs, 0, s.segCount * 4);
        gl.uniform1f(passA.loc.u_segGain, s.segGain);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      atlas.latest = write;
    }

    if (opts.passB !== false) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(passB.pr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.tex[atlas.latest]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      gl.uniform1i(passB.loc.u_persist, 0);
      gl.uniform1i(passB.loc.u_noise, 1);
      gl.uniform2f(passB.loc.u_texSize, atlas.w, atlas.h);
      gl.enable(gl.SCISSOR_TEST);
      for (const s of frame) {
        if (!s.visible || !s.rect) continue;
        const slot = atlas.slots.get(s.id);
        if (!slot) continue;
        const r = s.rect;
        const x = Math.round(r.left * dpr);
        const w = Math.round(r.width * dpr);
        const h = Math.round(r.height * dpr);
        const y = canvas.height - Math.round(r.top * dpr) - h;
        if (w < 2 || h < 2) continue;
        gl.viewport(x, y, w, h);
        gl.scissor(x, y, w, h);
        gl.uniform4f(passB.loc.u_slot, slot.x, slot.y, slot.w, slot.h);
        gl.uniform1f(passB.loc.u_time, time);
        gl.uniform1f(passB.loc.u_tint, s.tint);
        gl.uniform1f(passB.loc.u_boot, s.boot);
        gl.uniform2f(passB.loc.u_rectSize, w, h);
        gl.uniform2f(passB.loc.u_grid, 8, 4);
        gl.uniform2f(passB.loc.u_headB, s.headUv ? s.headUv[0] : 0, s.headUv ? s.headUv[1] : 0);
        gl.uniform1f(passB.loc.u_headBGain, s.headUv ? s.headGain : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.SCISSOR_TEST);
    }

    return { atlasRebuilt };
  }

  return {
    gl,
    dpr,
    render,
    setPersistScale(s) { persistScale = s; atlas.sig = ""; },
    getPersistScale() { return persistScale; }
  };
}
