// Burn-In entry. Feature-detects WebGL2, wires the engine, panel, reduced
// motion, the no-WebGL fallback, and the window.__burnin capture contract.

import { createGlCore } from "./gl-core.mjs";
import { createScopes } from "./scopes.mjs";
import { initPanel } from "./panel.mjs";

const html = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function bootNoGl() {
  html.classList.add("no-webgl");
  initPanel({
    reduced,
    setKnob() {},
    spike() {}
  });
  window.__burnin = {
    freeze() {},
    thaw() {},
    step() {},
    booted: Promise.resolve()
  };
}

function bootGl(core) {
  html.classList.add("gl-live");
  const scopes = createScopes();
  if (reduced) scopes.setReduced();

  let simTime = 0;
  let last = 0;
  let rafId = 0;
  let frozen = false;
  let running = false;
  let benchDone = reduced;
  const benchTimes = [];

  let bootedResolve;
  const booted = new Promise((res) => { bootedResolve = res; });
  scopes.onBoot(() => bootedResolve());

  let panel = null;

  // The beam casts light onto the chassis: two custom properties drive a
  // spill gradient and readout-well warmth in CSS
  const bezel = document.querySelector(".hero-bezel");
  function spill(frame) {
    if (!bezel) return;
    const h = frame.find((f) => f.id === "hero");
    if (h && h.headUv) {
      bezel.style.setProperty("--beam-x", h.headUv[0].toFixed(3));
      bezel.style.setProperty("--beam-heat", Math.min(1, h.headGain / 2.6).toFixed(3));
    } else {
      bezel.style.setProperty("--beam-heat", "0");
    }
  }

  function tick(dt) {
    simTime += dt;
    scopes.readRects(window.innerHeight);
    const frame = scopes.update(dt, simTime, window.innerHeight);
    const res = core.render(frame, simTime);
    // Persistence is lost when the atlas rebuilds (resize, font reflow);
    // restart the beam so the tagline redraws instead of vanishing
    if (res.atlasRebuilt) scopes.resetHero();
    spill(frame);
    if (panel) panel.updateStats(scopes.stats);
  }

  function loop(now) {
    if (!last) last = now;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt);
    if (!benchDone) {
      benchTimes.push(dt);
      if (benchTimes.length >= 22) {
        benchDone = true;
        const sample = benchTimes.slice(2);
        const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
        if (avg > 0.034 && core.getPersistScale() > 0.25) core.setPersistScale(0.25);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  // Reduced motion: bake the fully resolved end state, then park the loop.
  // Substeps accumulate real persistence so the tagline carries an honest
  // trail-age gradient, then a single pass B presents it.
  function renderStatic() {
    scopes.readRects(window.innerHeight);
    const sub = 1 / 48;
    for (let i = 0; i < 220; i++) {
      simTime += sub;
      const frame = scopes.update(sub, simTime, window.innerHeight);
      const lastPass = scopes.heroComplete() || i === 219;
      core.render(frame, simTime, { passB: lastPass });
      if (lastPass) break;
    }
    if (panel) panel.updateStats(scopes.stats);
    bootedResolve();
  }

  let presentQueued = false;
  function present() {
    if (presentQueued) return;
    presentQueued = true;
    requestAnimationFrame(() => {
      presentQueued = false;
      scopes.readRects(window.innerHeight);
      const frame = scopes.update(0, simTime, window.innerHeight);
      const res = core.render(frame, simTime, { passA: false });
      // The atlas was rebuilt empty (font reflow or resize): re-bake
      if (res.atlasRebuilt) {
        scopes.resetHero();
        renderStatic();
      }
    });
  }

  panel = initPanel({
    reduced,
    setKnob(id, v) {
      scopes.setKnob(id, v);
      if (reduced && !frozen) tick(1 / 30);
    },
    spike(id) {
      scopes.spike(id);
      if (reduced && !frozen) tick(1 / 30);
    }
  });

  const skipOnce = () => scopes.skipBoot();
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, skipOnce, { once: true, passive: true })
  );

  if (reduced) {
    renderStatic();
    // Font load reflows the page under the baked frame; bake again in place
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        scopes.resetHero();
        renderStatic();
      });
    }
    window.addEventListener("scroll", present, { passive: true });
    // Resize can rebuild the persistence atlas from zero; re-bake fully
    // instead of blitting an empty texture
    window.addEventListener("resize", () => {
      scopes.resetHero();
      renderStatic();
    }, { passive: true });
  } else {
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  window.__burnin = {
    freeze() {
      frozen = true;
      if (running) { cancelAnimationFrame(rafId); running = false; }
    },
    thaw() {
      frozen = false;
      if (!reduced && !running) {
        running = true;
        last = 0;
        rafId = requestAnimationFrame(loop);
      }
    },
    step(ms) {
      tick(Math.max(0, ms) / 1000);
    },
    debug: () => scopes.debug(),
    booted
  };
}

function main() {
  const canvas = document.getElementById("gl");
  let core = null;
  try {
    core = canvas ? createGlCore(canvas) : null;
  } catch (err) {
    core = null;
  }
  if (core) bootGl(core);
  else bootNoGl();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}
