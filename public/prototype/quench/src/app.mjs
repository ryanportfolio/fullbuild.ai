// Quench entry. Boot ladder (gl / no-gl / reduced), the single rAF loop,
// batched layout reads, the tier benchmark, cursor plus wander attractor,
// scroll orchestration, the window.__quench capture hook (identical shape in
// every boot path), pagehide cleanup, and --coalesce writes. Every DOM query
// is guarded so a missing contract element degrades instead of throwing.

import { createEngine } from "./engine.mjs";
import { createBaker, bakeSize, signature } from "./bake.mjs";
import { createField, CAPS } from "./field.mjs";

const BOOT_DUR = 2.5;

const TIERS = [
  { scale: 0.55, octaves: 2, field: false }, // L
  { scale: 0.75, octaves: 3, field: true },  // M
  { scale: 1.0, octaves: 4, field: true }    // H
];

function installNoopHook() {
  window.__quench = {
    freeze() {},
    thaw() {},
    step() {},
    booted: Promise.resolve()
  };
}

function readSiteData() {
  try {
    const el = document.getElementById("site-data");
    if (!el) return null;
    return JSON.parse(el.textContent);
  } catch (err) {
    return null;
  }
}

function main() {
  const html = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("metal");

  let engine = null;
  if (canvas) {
    try {
      engine = createEngine(canvas);
    } catch (err) {
      engine = null;
    }
  }
  if (!engine) {
    html.classList.add("no-webgl");
    installNoopHook();
    return;
  }

  html.classList.add("gl-live");
  if (reduced) html.classList.add("reduced");

  const siteData = readSiteData();
  const deviceLocked = !(siteData && siteData.deployment && siteData.deployment.verified === true);

  // Molten contract: sections with data-molten + data-sculpt, each holding
  // exactly one anchor div. Anything malformed is skipped, never fatal
  const entries = [];
  for (const el of document.querySelectorAll("[data-molten]")) {
    const id = el.getAttribute("data-sculpt");
    const anchor = el.querySelector("[data-molten-anchor]");
    if (!id || !(id in CAPS) || !anchor) continue;
    entries.push({ id, el, anchor, texIndex: entries.length, sig: "" });
  }
  const heroEntry = entries.find((e) => e.id === "tagline") || null;
  const heroEl = document.getElementById("hero") || (heroEntry ? heroEntry.el : null);

  const field = createField(entries.map((e) => ({ id: e.id, texIndex: e.texIndex })));
  const baker = createBaker();
  const wobblePhase = Math.random() * Math.PI * 2;
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.5);

  // Tier: start M on small viewports or oversized buffers, else H
  let tier = 2;
  {
    const mp = (window.innerWidth * window.innerHeight * dprCap * dprCap) / 1e6;
    if (window.innerWidth <= 760 || mp > 3.2) tier = 1;
  }

  function applyTier() {
    const t = TIERS[tier];
    engine.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, t.scale);
    engine.setOctaves(t.octaves);
    engine.setFieldOn(t.field && !reduced);
  }

  // The tagline anchor is inflated 10% per side everywhere it is measured so
  // the headline glyphs sit inside the shader rect feather's flat-weight zone
  // (no faded last letters). Bake and render must inflate identically or the
  // relief loses DOM registration
  function inflateTagline(r) {
    const ex = r.width * 0.10;
    const ey = r.height * 0.10;
    return { left: r.left - ex, top: r.top - ey, width: r.width + 2 * ex, height: r.height + 2 * ey };
  }

  // The tagline bake is registered to the measured DOM line boxes so the GL
  // relief lands exactly on the headline glyphs (the engine stretches the
  // tagline texture to the anchor rect, so normalized coords map 1:1)
  function taglineLines(e, r) {
    const lines = [];
    for (const ln of e.anchor.querySelectorAll(".tagline-line")) {
      const lr = ln.getBoundingClientRect();
      if (lr.width < 2 || lr.height < 2) continue;
      lines.push({
        text: (ln.textContent || "").trim().toUpperCase(),
        cx: (lr.left + lr.width / 2 - r.left) / r.width,
        cy: (lr.top + lr.height / 2 - r.top) / r.height,
        w: lr.width / r.width
      });
    }
    return lines.length ? lines : null;
  }

  function rebake(force) {
    let changed = false;
    for (const e of entries) {
      const r0 = e.anchor.getBoundingClientRect();
      if (r0.width < 8 || r0.height < 8) continue;
      const r = e.id === "tagline" ? inflateTagline(r0) : r0;
      const size = bakeSize(r.width, r.height, dprCap);
      let opts = null;
      let sig = signature(e.id, size.w, size.h);
      if (e.id === "tagline") {
        const lines = taglineLines(e, r);
        if (lines) {
          opts = { lines };
          sig += ":" + lines
            .map((l) => Math.round(l.cx * 200) + "," + Math.round(l.cy * 200) + "," + Math.round(l.w * 200))
            .join("|");
        }
      }
      if (!force && sig === e.sig) continue;
      const img = baker.bake(e.id, size.w, size.h, opts);
      if (!img) continue;
      engine.setTarget(e.texIndex, img);
      e.sig = sig;
      changed = true;
    }
    return changed;
  }

  let simT = 0;
  let bootT = 0;
  let bootSkipped = false;
  let lastCoalesce = -1;
  let dead = false;
  let running = false;
  let frozen = false;
  let rafId = 0;
  let last = 0;

  let bootedResolve;
  let hasBooted = false;
  const booted = new Promise((res) => {
    bootedResolve = res;
  });
  function markBooted() {
    if (!hasBooted) {
      hasBooted = true;
      bootedResolve();
    }
  }

  const aborter = typeof AbortController !== "undefined" ? new AbortController() : null;
  const evOpts = (extra) => Object.assign({ passive: true }, aborter ? { signal: aborter.signal } : {}, extra || {});

  // Boot cinematic: one-shot 2.5s swell to 0.85 so the headline crests
  // legibly once before melting back to breathe. Skipped by reduced motion
  // and by the first interaction
  function bootFloor() {
    if (reduced || bootSkipped || bootT >= BOOT_DUR) return 0;
    return Math.sin(Math.PI * Math.min(1, bootT / BOOT_DUR)) * 0.85;
  }
  if (!reduced) {
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      window.addEventListener(type, () => {
        bootSkipped = true;
      }, evOpts({ once: true }));
    }
  }

  function writeCoalesce(v) {
    const c = Math.max(0, Math.min(1, v));
    if (lastCoalesce >= 0 && Math.abs(c - lastCoalesce) < 0.02) return;
    lastCoalesce = c;
    html.style.setProperty("--coalesce", c.toFixed(2));
  }

  // The DOM tagline stays visible until the metal word is legible, then
  // melts out; the headline never depends on the GL word existing
  let lastMelt = -1;
  function writeMelt(v) {
    const m = Math.max(0, Math.min(1, v));
    if (lastMelt >= 0 && Math.abs(m - lastMelt) < 0.02) return;
    lastMelt = m;
    html.style.setProperty("--melt", m.toFixed(2));
  }

  // All layout reads happen here, before any GL command in the frame
  function readLayout() {
    const vh = window.innerHeight || 1;
    const vw = window.innerWidth || 1;
    const list = [];
    for (const e of entries) {
      const sr = e.el.getBoundingClientRect();
      let ar = e.anchor.getBoundingClientRect();
      if (e.id === "tagline") ar = inflateTagline(ar);
      list.push({
        id: e.id,
        sectionCenterY: sr.top + sr.height / 2,
        anchorRect: { x: ar.left, y: ar.top, w: ar.width, h: ar.height }
      });
    }
    const heroH = heroEl ? heroEl.getBoundingClientRect().height : vh;
    return { list, vh, vw, heroH, scrollY: window.scrollY || 0 };
  }

  function tick(dt) {
    if (dead) return;
    simT += dt;
    bootT += dt;
    const lay = readLayout();
    const st = field.update(dt, {
      entries: lay.list,
      scrollY: lay.scrollY,
      viewportW: lay.vw,
      viewportH: lay.vh,
      heroHeight: lay.heroH,
      t: simT,
      bootFloor: bootFloor(),
      breatheOn: !reduced
    });
    if (TIERS[tier].field && !reduced) engine.stepField(dt, st.cursor);
    engine.render({
      time: simT,
      cursor: st.cursor,
      pairs: [st.pairA, st.pairB],
      wobblePhase,
      iriGain: 1,
      deviceLocked
    });
    writeCoalesce(st.pairA ? st.pairA.set : 0);
    // Steep gate: the DOM headline is gone by the time the relief is half
    // formed, so exactly one representation is ever dominant
    const hs = st.heroSet || 0;
    let m = Math.min(1, Math.max(0, (hs - 0.30) / 0.14));
    m = m * m * (3 - 2 * m);
    writeMelt(m);
    markBooted();
  }

  // Reduced motion: exactly one static formed tagline frame, then stop
  function renderStatic() {
    if (dead) return;
    const zero = { sculptId: null, texIndex: 0, anchorRectPx: { x: 0, y: 0, w: 0, h: 0 }, set: 0, mode: 0 };
    let heroPair = zero;
    if (heroEntry) {
      const ar = inflateTagline(heroEntry.anchor.getBoundingClientRect());
      heroPair = {
        sculptId: "tagline",
        texIndex: heroEntry.texIndex,
        anchorRectPx: { x: ar.left, y: ar.top, w: ar.width, h: ar.height },
        set: 0.88,
        mode: 0
      };
    }
    engine.render({
      time: 12.0,
      cursor: { x: -1e4, y: -1e4, speed: 0, strength: 0, held: false },
      pairs: [heroPair, zero],
      wobblePhase,
      iriGain: 1,
      deviceLocked
    });
    writeCoalesce(heroPair.set);
    writeMelt(1);
    markBooted();
  }

  // 22-frame benchmark windows: drop the first 2 dts, average the rest, and
  // step the tier ladder down before any fallback. At most two drops
  const benchTimes = [];
  let benchWindows = 0;
  let benchOn = !reduced;
  function benchFrame(dt) {
    benchTimes.push(dt);
    if (benchTimes.length < 22) return;
    const sample = benchTimes.slice(2);
    const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
    benchTimes.length = 0;
    benchWindows++;
    if (avg > 0.017 && tier > 0) {
      tier--;
      applyTier();
      if (benchWindows >= 2 || tier === 0) benchOn = false;
    } else {
      benchOn = false;
    }
  }

  function loop(now) {
    if (dead || !running) return;
    rafId = requestAnimationFrame(loop);
    if (document.hidden) {
      last = now;
      return;
    }
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
    if (benchOn) benchFrame(dt);
  }

  function startLoop() {
    if (dead || running || reduced) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  // ---- boot ----
  applyTier();
  rebake(true);

  if (reduced) {
    renderStatic();

    // past-hero: fade the canvas out beyond the hero (reduced mode only)
    let heroBottomDoc = 0;
    let pastHero = false;
    function readHeroBottom() {
      if (!heroEl) return;
      const r = heroEl.getBoundingClientRect();
      heroBottomDoc = r.bottom + (window.scrollY || 0);
    }
    readHeroBottom();
    window.addEventListener("scroll", () => {
      if (dead) return;
      const past = (window.scrollY || 0) > heroBottomDoc - 80;
      if (past !== pastHero) {
        pastHero = past;
        html.classList.toggle("past-hero", past);
      }
    }, evOpts());

    let rTimer = 0;
    window.addEventListener("resize", () => {
      if (dead) return;
      clearTimeout(rTimer);
      rTimer = setTimeout(() => {
        applyTier();
        rebake(false);
        readHeroBottom();
        renderStatic();
      }, 200);
    }, evOpts());
  } else {
    window.addEventListener("pointermove", (e) => {
      field.pointerMove(e.clientX, e.clientY, simT);
    }, evOpts());
    window.addEventListener("pointerdown", (e) => {
      field.pointerMove(e.clientX, e.clientY, simT);
      field.setHeld(true);
    }, evOpts());
    window.addEventListener("pointerup", () => {
      field.setHeld(false);
    }, evOpts());
    window.addEventListener("pointercancel", () => {
      field.setHeld(false);
    }, evOpts());

    let rTimer = 0;
    window.addEventListener("resize", () => {
      if (dead) return;
      clearTimeout(rTimer);
      rTimer = setTimeout(() => {
        applyTier();
        rebake(false);
        if (!running) tick(0);
      }, 150);
    }, evOpts());

    startLoop();
  }

  // The webfont lands after first paint and reflows layout under the canvas;
  // every glyph bake is stale until re-baked with QuenchDisplay
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(() => {
      if (dead) return;
      rebake(true);
      if (reduced) renderStatic();
      else if (!running) tick(0);
    });
  }

  window.addEventListener("pagehide", () => {
    if (dead) return;
    dead = true;
    stopLoop();
    if (aborter) aborter.abort();
    try {
      engine.dispose();
    } catch (err) {
      /* context already lost */
    }
  }, { once: true });

  // Capture hook: identical shape in every boot path. step(ms) advances the
  // sim clock and renders exactly one frame, working while frozen
  window.__quench = {
    freeze() {
      frozen = true;
      stopLoop();
    },
    thaw() {
      frozen = false;
      if (!reduced && !dead) startLoop();
    },
    step(ms) {
      if (dead) return;
      tick(Math.max(0, ms || 0) / 1000);
    },
    booted
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}
