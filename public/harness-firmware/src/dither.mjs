// PHOSPHOR dither engine: shared by the browser runtime (phosphor.js) and
// the build-time baker (scripts/bake-phosphor.mjs via src/bake.html).
// Everything here is deterministic: the blue-noise seed is the template's
// measured git revision (0x5224beb) read as hex. Same inputs, same dots.
//
// Pixel states are strictly 4-valued: the P7 phosphor law:
//   OFF     unpowered glass
//   RESIDUE spent phosphor (latent mass)
//   GREEN   afterglow (persistent: committed bytes)
//   BLUE    beam (volatile: flashes, always decays)
export const OFF = 0;
export const RESIDUE = 1;
export const GREEN = 2;
export const BLUE = 3;

export const PALETTE = {
  [OFF]: [7, 11, 12], // #070B0C
  [RESIDUE]: [34, 53, 42], // #22352A
  [GREEN]: [166, 255, 94], // #A6FF5E
  [BLUE]: [95, 217, 255], // #5FD9FF
};

export const SEED = 0x5224beb; // template rev: even the grain is versioned

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 8x8 Bayer matrix by the standard recurrence M(2n) = [[4M,4M+2],[4M+3,4M+1]]
export const BAYER8 = (() => {
  let m = [[0]];
  for (let n = 1; n < 8; n *= 2) {
    const next = [];
    for (let y = 0; y < n * 2; y += 1) next.push(new Array(n * 2));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        next[y][x] = 4 * m[y][x];
        next[y][x + n] = 4 * m[y][x] + 2;
        next[y + n][x] = 4 * m[y][x] + 3;
        next[y + n][x + n] = 4 * m[y][x] + 1;
      }
    }
    m = next;
  }
  const flat = new Float32Array(64);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) flat[y * 8 + x] = (m[y][x] + 0.5) / 64;
  return flat;
})();

export const bayer = (x, y) => BAYER8[((y & 7) << 3) | (x & 7)];

// 64x64 blue-noise threshold tile via incremental void-and-cluster:
// place ranks one at a time at the current minimum-energy pixel, then add a
// toroidal Gaussian around the placement. Ranks -> thresholds in [0,1).
export function blueNoise64(seed = SEED) {
  const N = 64;
  const size = N * N;
  const rng = mulberry32(seed);
  const energy = new Float32Array(size);
  const rank = new Float32Array(size).fill(-1);
  // tiny jitter so argmin ties break deterministically-but-randomly
  for (let i = 0; i < size; i += 1) energy[i] = rng() * 1e-4;
  // precomputed toroidal Gaussian kernel, sigma 1.9
  const kernel = new Float32Array(size);
  const s2 = 2 * 1.9 * 1.9;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const dx = Math.min(x, N - x);
      const dy = Math.min(y, N - y);
      kernel[y * N + x] = Math.exp(-(dx * dx + dy * dy) / s2);
    }
  }
  for (let r = 0; r < size; r += 1) {
    let best = -1;
    let bestE = Infinity;
    for (let i = 0; i < size; i += 1) {
      if (rank[i] < 0 && energy[i] < bestE) {
        bestE = energy[i];
        best = i;
      }
    }
    rank[best] = r;
    const bx = best % N;
    const by = (best / N) | 0;
    for (let y = 0; y < N; y += 1) {
      const ky = ((y - by + N) % N) * N;
      const row = y * N;
      for (let x = 0; x < N; x += 1) {
        energy[row + x] += kernel[ky + ((x - bx + N) % N)];
      }
    }
  }
  const t = new Float32Array(size);
  for (let i = 0; i < size; i += 1) t[i] = (rank[i] + 0.5) / size;
  return t;
}

export const noiseAt = (tile, x, y) => tile[((y & 63) << 6) | (x & 63)];

// ---------------------------------------------------------------------------
// Scene geometry (pure math: the node test imports these and recounts)
// ---------------------------------------------------------------------------

// Spectrum: 20 vertical bands ordered by real hex offset. Each band carries
// exactly `blocks` glow dots (1 dot = 1 flash block = 1,024 B: countable),
// a residue wash whose density encodes tier, and a top cap filled to the
// band's true last-block pad fraction.
export function spectrumGeometry(facts, w, h) {
  const n = facts.skills.length;
  const gap = Math.max(4, Math.round(w * 0.006));
  const bandW = (w - gap * (n - 1)) / n;
  const capH = Math.max(6, Math.round(h * 0.045));
  const capGap = Math.max(4, Math.round(h * 0.02));
  const dotR = Math.max(1.5, bandW * 0.055);
  const bands = facts.skills.map((s, i) => {
    const x = i * (bandW + gap);
    const rng = mulberry32(fnv1a(s.name) ^ SEED);
    const dots = [];
    const yTop = capH + capGap;
    const areaH = h - yTop;
    let guard = 0;
    while (dots.length < s.blocks && guard < 4000) {
      guard += 1;
      const px = x + dotR * 2 + rng() * (bandW - dotR * 4);
      const py = yTop + dotR * 2 + rng() * (areaH - dotR * 4);
      let ok = true;
      for (const d of dots) {
        const dx = d.x - px;
        const dy = d.y - py;
        if (dx * dx + dy * dy < dotR * dotR * 16) {
          ok = false;
          break;
        }
      }
      if (ok) dots.push({ x: px, y: py });
    }
    return {
      name: s.name,
      bytes: s.bytes,
      blocks: s.blocks,
      tier: s.tier,
      hexOffset: s.hexOffset,
      padFillPct: s.padFillPct,
      x,
      w: bandW,
      capH,
      dots,
    };
  });
  return { bands, gap, bandW, capH, capGap, dotR };
}

export const TIER_DENSITY = { core: 0.28, discipline: 0.17, extras: 0.1 };

// ---------------------------------------------------------------------------
// Scene rasters: write 4-state fields into a Uint8Array (w*h)
// ---------------------------------------------------------------------------

export function renderSpectrum(facts, w, h, tile, excited = null) {
  const geo = spectrumGeometry(facts, w, h);
  const field = new Uint8Array(w * h).fill(OFF);
  for (const b of geo.bands) {
    const hot = excited === b.name;
    const density = TIER_DENSITY[b.tier];
    const x0 = Math.round(b.x);
    const x1 = Math.round(b.x + b.w);
    // residue wash (tier-coded density), cap fill, dots
    for (let y = 0; y < h; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = y * w + x;
        if (y < b.capH) {
          // hairline outline so a near-zero pad reads as an empty cap, not a hole
          const border = y === 0 || y === b.capH - 1 || x === x0 || x === x1 - 1;
          if (border) field[idx] = hot ? BLUE : RESIDUE;
          else if (bayer(x, y) < b.padFillPct / 100) field[idx] = hot ? BLUE : RESIDUE;
        } else if (y >= b.capH + geo.capGap) {
          if (noiseAt(tile, x, y) < density) field[idx] = hot ? BLUE : RESIDUE;
        }
      }
    }
    for (const d of b.dots) {
      stampDot(field, w, h, d.x, d.y, geo.dotR, hot ? BLUE : GREEN);
    }
  }
  return { field, geo };
}

function stampDot(field, w, h, cx, cy, r, state) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) field[y * w + x] = state;
    }
  }
}

// Core + halo: a small green core (the resident 8,317 B) inside a vast
// residue halo (the 175,102 B payload). The green amplitude is binary-searched
// until lit-green / lit-residue matches the real byte ratio within 0.2%.
export function renderCoreHalo(facts, w, h, tile) {
  // burst rides the numeral's top-right shoulder, off the decimal axis
  // (dead-center it stacked over the decimal dot and "8.1" read as "8:1");
  // the residue halo stays centered behind the numeral
  const cx = w * 0.615;
  const cy = h * 0.3;
  const hx = w / 2;
  const hy = h / 2;
  const haloSigma = Math.min(w, h) * 0.34;
  const coreSigma = Math.min(w, h) * 0.055;
  const target = facts.residentBytes / facts.onDemandBytes;
  // feather the halo at the image bounds so the panel has no hard seams
  const env = (x, y) => Math.min(1, Math.min(y, h - 1 - y) / (h * 0.14))
    * Math.min(1, Math.min(x, w - 1 - x) / (w * 0.1));
  const count = (coreAmp) => {
    let g = 0;
    let r = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const cdx = x - cx;
        const cdy = y - cy;
        const hdx = x - hx;
        const hdy = y - hy;
        const t = noiseAt(tile, x, y);
        if (coreAmp * Math.exp(-(cdx * cdx + cdy * cdy) / (2 * coreSigma * coreSigma)) > t) g += 1;
        else if (0.85 * env(x, y) * Math.exp(-(hdx * hdx + hdy * hdy) / (2 * haloSigma * haloSigma)) > t) r += 1;
      }
    }
    return { g, r };
  };
  let lo = 0.2;
  let hi = 30;
  let amp = 1;
  for (let i = 0; i < 28; i += 1) {
    amp = (lo + hi) / 2;
    const { g, r } = count(amp);
    if (g / Math.max(1, r) > target) hi = amp;
    else lo = amp;
  }
  const field = new Uint8Array(w * h).fill(OFF);
  let g = 0;
  let r = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const cdx = x - cx;
      const cdy = y - cy;
      const hdx = x - hx;
      const hdy = y - hy;
      const t = noiseAt(tile, x, y);
      if (amp * Math.exp(-(cdx * cdx + cdy * cdy) / (2 * coreSigma * coreSigma)) > t) {
        field[y * w + x] = GREEN;
        g += 1;
      } else if (0.85 * env(x, y) * Math.exp(-(hdx * hdx + hdy * hdy) / (2 * haloSigma * haloSigma)) > t) {
        field[y * w + x] = RESIDUE;
        r += 1;
      }
    }
  }
  return { field, greenLit: g, residueLit: r, ratio: g / Math.max(1, r) };
}

// Lazy-ratio ramp: exponential luminance decay Bayer-dithered across the
// width; the green head spans the true resident share of the width (4.7%),
// the residue tail carries the remaining 95.3%.
export function renderRamp(facts, w, h, tile) {
  const field = new Uint8Array(w * h).fill(OFF);
  const headW = (facts.residentPctOfOnDemand / 100) * w;
  const tau = w / 4.2;
  for (let y = 0; y < h; y += 1) {
    const edge = 1 - Math.abs(y - h / 2) / (h / 2); // soft vertical envelope
    for (let x = 0; x < w; x += 1) {
      if (x <= headW) {
        // crisp resident head: near-rectangular, dithered only at the rim
        if (edge > 0.06 && Math.pow(edge, 0.12) * 1.4 > bayer(x, y)) field[y * w + x] = GREEN;
      } else {
        const L = Math.exp(-(x - headW) / tau) * Math.pow(edge, 0.6);
        if (L > bayer(x, y) * 0.9) field[y * w + x] = RESIDUE;
        else if (L * 0.5 > noiseAt(tile, x, y)) field[y * w + x] = RESIDUE;
      }
    }
  }
  return { field, headW };
}

// One image, two tubes: a green core splits into two dithered traces ending
// in two scope faces. Traces are quadratic Beziers sampled densely; glow is
// distance-falloff around the samples: density is the only "line weight".
export function renderTubes(facts, w, h, tile) {
  const field = new Uint8Array(w * h).fill(OFF);
  const core = { x: w * 0.2, y: h * 0.5 };
  const faces = [
    { x: w * 0.78, y: h * 0.26, label: 'claude' },
    { x: w * 0.78, y: h * 0.74, label: 'codex' },
  ];
  const lum = new Float32Array(w * h);
  const paint = (px, py, sigma, gain) => {
    const rr = sigma * 3;
    const x0 = Math.max(0, Math.floor(px - rr));
    const x1 = Math.min(w - 1, Math.ceil(px + rr));
    const y0 = Math.max(0, Math.floor(py - rr));
    const y1 = Math.min(h - 1, Math.ceil(py + rr));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - px;
        const dy = y - py;
        const v = gain * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        const i = y * w + x;
        if (v > lum[i]) lum[i] = v;
      }
    }
  };
  for (const f of faces) {
    const ctrl = { x: w * 0.5, y: f.y < h / 2 ? h * 0.16 : h * 0.84 };
    for (let t = 0; t <= 1; t += 0.004) {
      const mt = 1 - t;
      const x = mt * mt * core.x + 2 * mt * t * ctrl.x + t * t * f.x;
      const y = mt * mt * core.y + 2 * mt * t * ctrl.y + t * t * f.y;
      paint(x, y, 3, 1.25);
    }
    // scope face: rounded-rect border glow
    const fw = w * 0.14;
    const fh = h * 0.32;
    for (let t = 0; t < 1; t += 0.002) {
      const p = rectPoint(f.x, f.y, fw, fh, t);
      paint(p.x, p.y, 2.2, 1.3);
    }
    paint(f.x, f.y, 3.2, 1.4); // the same green core dot in each tube
  }
  paint(core.x, core.y, 6, 1.6);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const t = noiseAt(tile, x, y);
      if (lum[i] > 1.05 && lum[i] > t * 1.4) field[i] = GREEN;
      else if (lum[i] > t) field[i] = RESIDUE;
    }
  }
  // recolor the three core dots green regardless of wash
  stampDot(field, w, h, core.x, core.y, 4, GREEN);
  for (const f of faces) stampDot(field, w, h, f.x, f.y, 2.6, GREEN);
  return { field, core, faces };
}

function rectPoint(cx, cy, rw, rh, t) {
  // perimeter walk of a w x h rect centered at (cx, cy)
  const per = 2 * (rw + rh);
  let d = t * per;
  if (d < rw) return { x: cx - rw / 2 + d, y: cy - rh / 2 };
  d -= rw;
  if (d < rh) return { x: cx + rw / 2, y: cy - rh / 2 + d };
  d -= rh;
  if (d < rw) return { x: cx + rw / 2 - d, y: cy + rh / 2 };
  d -= rw;
  return { x: cx - rw / 2, y: cy + rh / 2 - d };
}

// Ambient hero field: mask-weighted phosphor. `mask` is a Float32Array (w*h)
// of excitation weights (1 inside the headline glyphs, ~0.25 ambient).
// `age` is seconds since the beam passed each row (negative = not yet swept).
export function heroState(mask, w, h, tile, rowAge, driftT) {
  const field = new Uint8Array(w * h).fill(OFF);
  for (let y = 0; y < h; y += 1) {
    const age = rowAge(y);
    // pre-excitation ramp ahead of the beam, exponential decay behind it:
    // both edges of the sweep band are dither-density falloffs, never lines
    const flash = age >= 0 ? Math.exp(-age * 6) : Math.exp(age * 26);
    if (age < 0 && flash < 0.002) continue;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const m = mask[i];
      const t = noiseAt(tile, x + ((driftT * 3) | 0), y);
      // glyphs take the full charge; ambient glass only murmurs under the beam
      const L = m * (0.22 + flash * (m > 0.6 ? 0.9 : 0.35));
      if (L > t) {
        // blue-to-green handoff dithered per dot on an independent threshold
        const mix = noiseAt(tile, x + 47, y + 21);
        field[i] = flash > mix ? BLUE : m > 0.6 ? GREEN : RESIDUE;
      }
    }
  }
  return field;
}

// Map a 4-state field into RGBA pixels (Uint8ClampedArray, w*h*4)
export function fieldToRGBA(field, out) {
  for (let i = 0; i < field.length; i += 1) {
    const c = PALETTE[field[i]];
    const o = i * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = field[i] === OFF ? 0 : 255;
  }
  return out;
}
