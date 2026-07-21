// Quench sculpt target baker. Offscreen 2D canvas renders each sculpt as an
// RGBA texture: R = blurred height target, G = sharp mask (blends in from
// set 0.35 for crisp edges), B = reflection glyphs (page copy shimmering in
// the metal), A = 255. Sizes are quantized to 32px buckets so mobile URL bar
// resizes are no-ops; glyph draws use "900 <px> QuenchDisplay" and callers
// must re-bake once document.fonts.ready fires.

const HAS_OFFSCREEN = typeof OffscreenCanvas !== "undefined";

export function quantize32(x) {
  return Math.max(32, Math.round(x / 32) * 32);
}

export function bakeSize(cssW, cssH, dpr) {
  const d = Math.min(dpr || 1, 1.5);
  const w = Math.min(1024, quantize32(cssW * d));
  const aspect = cssW > 0 ? cssH / cssW : 1;
  const h = Math.min(1024, quantize32(w * aspect));
  return { w, h };
}

export function signature(id, w, h) {
  return id + ":" + w + "x" + h;
}

function makeCanvas(w, h) {
  if (HAS_OFFSCREEN) return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function layer(w, h) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function gray(v) {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return "rgb(" + c + "," + c + "," + c + ")";
}

function fontStr(px) {
  return "900 " + Math.max(4, Math.round(px)) + "px QuenchDisplay";
}

// Fit a text line to maxW at a starting size, returns the fitted px
function fitPx(ctx, text, startPx, maxW) {
  ctx.font = fontStr(startPx);
  const m = ctx.measureText(text).width || 1;
  return m > maxW ? (startPx * maxW) / m : startPx;
}

// Blur a source canvas into a fresh canvas. Prefers ctx.filter; falls back to
// a downsample and upsample approximation when filter is unsupported
function blurred(src, radius, w, h) {
  const out = layer(w, h);
  if (!out) return src;
  const r = Math.max(0.5, radius);
  out.ctx.filter = "blur(" + r + "px)";
  if (/blur/.test(out.ctx.filter)) {
    out.ctx.drawImage(src, 0, 0);
    out.ctx.filter = "none";
    return out.canvas;
  }
  const f = Math.max(1, r / 2);
  const sw = Math.max(2, Math.round(w / f));
  const sh = Math.max(2, Math.round(h / f));
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext("2d");
  if (!sctx) return src;
  sctx.drawImage(src, 0, 0, sw, sh);
  out.ctx.imageSmoothingEnabled = true;
  out.ctx.drawImage(small, 0, 0, w, h);
  return out.canvas;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// ---- recipes: each returns { height, mask, reflect } canvases (or null) ----

// The tagline is baked from measured DOM line boxes (opts.lines, normalized
// to the anchor rect) so the GL relief is pixel-registered to the headline.
// Falls back to a fixed two-line layout when no measurements exist
function bakeTagline(w, h, opts) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = opts && Array.isArray(opts.lines) && opts.lines.length
    ? opts.lines
    : [
        { text: "FROM MAYBE", cx: 0.5, cy: 0.28, w: 0.92 },
        { text: "TO MADE", cx: 0.5, cy: 0.72, w: 0.92 }
      ];

  const fitted = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const px = fitPx(ctx, ln.text, h, Math.max(8, ln.w * w));
    fitted.push(px);
    ctx.fillStyle = gray(i === lines.length - 1 ? 1.0 : 0.78);
    ctx.font = fontStr(px);
    ctx.fillText(ln.text, ln.cx * w, ln.cy * h);
  }

  const refl = layer(w, h);
  if (refl) {
    const rctx = refl.ctx;
    rctx.textAlign = "center";
    rctx.textBaseline = "middle";
    rctx.fillStyle = gray(0.85);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      rctx.font = fontStr(fitted[i] * 0.4);
      rctx.fillText(ln.text, ln.cx * w, (0.5 + (ln.cy - 0.5) * 0.55) * h);
    }
  }
  return {
    height: blurred(mask.canvas, 0.012 * w, w, h),
    mask: mask.canvas,
    reflect: refl ? blurred(refl.canvas, 0.032 * w, w, h) : null
  };
}

function bakeOrb(w, h) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = gray(1.0);
  ctx.font = fontStr(h * 0.78);
  ctx.fillText("?", w / 2, h * 0.55);
  // Wide stroke so the counter and stem catch ridge speculars
  ctx.strokeStyle = gray(1.0);
  ctx.lineWidth = 0.035 * w;
  ctx.strokeText("?", w / 2, h * 0.55);
  return {
    height: blurred(mask.canvas, 0.02 * w, w, h),
    mask: mask.canvas,
    reflect: null
  };
}

function bakeLens(w, h) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  ctx.strokeStyle = gray(1.0);
  ctx.lineWidth = 0.09 * w;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.36, h * 0.29, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.02 * w;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.94);
  ctx.lineTo(w * 0.94, h * 0.06);
  ctx.stroke();
  return {
    height: blurred(mask.canvas, 0.02 * w, w, h),
    mask: mask.canvas,
    reflect: null
  };
}

function bakeIngot(w, h) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  const rw = w * 0.76;
  const rh = h * 0.46;
  const x = (w - rw) / 2;
  const y = (h - rh) / 2;
  ctx.fillStyle = gray(1.0);
  roundRectPath(ctx, x, y, rw, rh, 0.08 * w);
  ctx.fill();
  // Two rectangular notches cut from the top edge
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillRect(x + rw * 0.24, y - 2, rw * 0.12, rh * 0.22 + 2);
  ctx.fillRect(x + rw * 0.62, y - 2, rw * 0.12, rh * 0.22 + 2);
  ctx.globalCompositeOperation = "source-over";
  return {
    height: blurred(mask.canvas, 0.04 * w, w, h),
    mask: mask.canvas,
    reflect: null
  };
}

function bakeGhost(w, h) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  const r = 0.3 * Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = gray(1.0);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (-90 + i * 60) * (Math.PI / 180);
    const vx = cx + r * Math.cos(a);
    const vy = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  return {
    height: blurred(mask.canvas, 0.04 * w, w, h),
    mask: mask.canvas,
    reflect: null
  };
}

function bakeDevice(w, h) {
  const mask = layer(w, h);
  if (!mask) return null;
  const ctx = mask.ctx;
  const rw = w * 0.80;
  const rh = h * 0.62;
  const x = (w - rw) / 2;
  const y = (h - rh) / 2;
  ctx.fillStyle = gray(1.0);
  roundRectPath(ctx, x, y, rw, rh, 0.05 * w);
  ctx.fill();
  // "00" knocked out of the slab
  ctx.globalCompositeOperation = "destination-out";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontStr(h * 0.42);
  ctx.fillText("00", w / 2, h / 2);
  ctx.globalCompositeOperation = "source-over";
  return {
    height: blurred(mask.canvas, 0.02 * w, w, h),
    mask: mask.canvas,
    reflect: null
  };
}

function bakePools(w, h) {
  const base = layer(w, h);
  if (!base) return null;
  const ctx = base.ctx;
  ctx.fillStyle = gray(0.5);
  // Size by the short axis: the future anchor is wide and shallow, so
  // width-proportional circles smear into bands instead of discrete basins
  const m = Math.min(w, h);
  const r = 0.34 * m;
  for (const fx of [0.2, 0.5, 0.8]) {
    ctx.beginPath();
    ctx.arc(w * fx, h * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return {
    height: blurred(base.canvas, 0.15 * m, w, h),
    mask: null,
    reflect: null
  };
}

function bakeMirror(w, h) {
  const base = layer(w, h);
  if (!base) return null;
  base.ctx.fillStyle = gray(0.55);
  base.ctx.fillRect(0, 0, w, h);
  const refl = layer(w, h);
  if (refl) {
    const rctx = refl.ctx;
    rctx.textAlign = "center";
    rctx.textBaseline = "middle";
    rctx.fillStyle = gray(0.9);
    // Large glyphs, tight blur: the mirror texture is short and wide, so a
    // width-proportional blur would smear the line into invisibility
    const px = fitPx(rctx, "LET'S BUILD THE WHOLE THING", h * 0.5, w * 0.82);
    rctx.font = fontStr(px);
    rctx.fillText("LET'S BUILD THE WHOLE THING", w / 2, h / 2);
  }
  return {
    height: base.canvas,
    mask: null,
    reflect: refl ? blurred(refl.canvas, 0.006 * w, w, h) : null
  };
}

const RECIPES = {
  tagline: bakeTagline,
  orb: bakeOrb,
  lens: bakeLens,
  ingot: bakeIngot,
  ghost: bakeGhost,
  device: bakeDevice,
  pools: bakePools,
  mirror: bakeMirror
};

function channelData(canvas, w, h) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    return null;
  }
}

export function createBaker() {
  // Merge the three grayscale layers of a recipe into one RGBA ImageData
  function bake(id, w, h, opts) {
    const recipe = RECIPES[id];
    if (!recipe || !(w > 0) || !(h > 0)) return null;
    try {
      const layers = recipe(w, h, opts);
      if (!layers || !layers.height) return null;
      const hD = channelData(layers.height, w, h);
      if (!hD) return null;
      const mD = channelData(layers.mask, w, h);
      const rD = channelData(layers.reflect, w, h);
      const out = new ImageData(w, h);
      const o = out.data;
      const n = w * h;
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        o[j] = hD[j];
        o[j + 1] = mD ? mD[j] : 0;
        o[j + 2] = rD ? rD[j] : 0;
        o[j + 3] = 255;
      }
      return out;
    } catch (err) {
      return null;
    }
  }
  return { bake };
}
