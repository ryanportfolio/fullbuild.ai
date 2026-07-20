import { resolvePhase, interpolatePhase } from "./phase-state.mjs";
import { createStageMachine } from "./stage-machine.mjs";
import { createWorkshopRenderer } from "./renderer.mjs";

document.documentElement.classList.add("has-js");

const dataNode = document.querySelector("#site-data");
const arrival = document.querySelector("[data-manufacture]");
const canvas = arrival?.querySelector("[data-workshop-canvas]");
const readout = arrival?.querySelector("[data-time-readout]");
const clock = document.querySelector("[data-lifecycle-clock]");
const controls = Array.from(document.querySelectorAll("[data-time-control]"));
const panels = Array.from(document.querySelectorAll("[data-stage-panel]"));
const revealTargets = Array.from(document.querySelectorAll(".lifecycle-stage, .future-case, .principles article, .case-zero__receipt p"));
const track = document.querySelector("[data-lifecycle-track]");
const site = JSON.parse(dataNode.textContent);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const forcedColors = matchMedia("(forced-colors: active)").matches;
const initialIndex = Math.max(0, site.stages.findIndex(({ id }) => id === site.caseStudy.status));

const phase = resolvePhase(initialIndex);
const live = {
  time: initialIndex,
  scatter: phase.scatter,
  heat: phase.heat,
  spin: -0.55,
};
let renderer = null;
let releaseTimer = 0;
let rafId = 0;
let scrollOwnsTime = false;
let controlTarget = initialIndex;

const setPhaseVariables = (tokens) => {
  arrival.style.setProperty("--phase-width", tokens.width);
  arrival.style.setProperty("--phase-weight", tokens.weight);
  document.documentElement.style.setProperty("--phase-scatter", tokens.scatter);
};

const renderFrame = () => {
  if (renderer && !renderer.isLost()) {
    renderer.set({
      time: live.time,
      scatter: live.scatter,
      heat: live.heat,
      spin: live.spin,
    });
  }
  if (clock) clock.textContent = `t+${live.time.toFixed(2)}`;
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

const tweenTo = (target, { duration = 760 } = {}) => {
  cancelAnimationFrame(rafId);
  if (reducedMotion || duration === 0) {
    live.time = target;
    const tokens = resolvePhase(Math.round(target));
    live.scatter = tokens.scatter;
    live.heat = tokens.heat;
    renderFrame();
    return;
  }
  const from = { time: live.time, scatter: live.scatter, heat: live.heat, spin: live.spin };
  const tokens = interpolatePhase(Math.round(live.time), Math.round(target), 1);
  const to = { time: target, scatter: tokens.scatter, heat: tokens.heat, spin: -0.55 + (target - from.time) * 0.35 };
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = easeInOut(progress);
    live.time = from.time + (to.time - from.time) * eased;
    live.scatter = from.scatter + (to.scatter - from.scatter) * eased;
    live.heat = from.heat + (to.heat - from.heat) * eased;
    live.spin = from.spin + (to.spin - from.spin) * eased;
    renderFrame();
    if (progress < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
};

const applyPhase = (state) => {
  const tokens = resolvePhase(state.index);
  arrival.dataset.phase = tokens.id;
  document.documentElement.dataset.activePhase = tokens.id;
  setPhaseVariables(tokens);
  readout.textContent = tokens.id;

  controls.forEach((control, index) => {
    control.setAttribute("aria-current", index === state.index ? "step" : "false");
  });
  panels.forEach((panel, index) => {
    panel.toggleAttribute("data-active", index === state.index);
  });

  arrival.classList.remove("is-changing");
  requestAnimationFrame(() => arrival.classList.add("is-changing"));
  clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => arrival.classList.remove("is-changing"), reducedMotion ? 0 : 900);

  controlTarget = state.index;
  if (!scrollOwnsTime) tweenTo(state.index);
};

const machine = createStageMachine({
  stages: site.stages,
  deploymentVerified: site.deployment.verified,
  reducedMotion,
  initialIndex,
  onChange: applyPhase,
});

const announceLocked = () => {
  readout.textContent = "shipped — production proof pending";
  arrival.classList.remove("is-gated");
  requestAnimationFrame(() => arrival.classList.add("is-gated"));
  window.setTimeout(() => arrival.classList.remove("is-gated"), 3000);
};

const requestStage = (control, index) => {
  if (!machine.set(index) && control.getAttribute("aria-disabled") === "true") announceLocked();
};

controls.forEach((control, index) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    requestStage(control, index);
  });
});

arrival.querySelector(".time-console")?.addEventListener("keydown", (event) => {
  const current = controls.indexOf(document.activeElement);
  if (current < 0) return;

  let next = current;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(controls.length - 1, current + 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, current - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = controls.length - 1;
  else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    requestStage(controls[current], current);
    return;
  } else return;

  event.preventDefault();
  controls[next].focus();
  requestStage(controls[next], next);
});

// Rendered layer: progressive enhancement only. The semantic DOM and SVG
// silhouettes below already carry the complete story.
if (canvas && !reducedMotion && !forcedColors) {
  renderer = createWorkshopRenderer(canvas);
  if (renderer) {
    document.documentElement.classList.add("has-gl");
    if (matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      live.scatter = 1;
      renderFrame();
      tweenTo(initialIndex, { duration: 1900 });
    } else {
      renderFrame();
    }
  }
}

// Direct manipulation: drag the artifact to scrub build time.
if (renderer && !reducedMotion) {
  let dragging = false;
  let startX = 0;
  let startTime = 0;

  arrival.addEventListener("pointerdown", (event) => {
    if (event.target.closest("a, button")) return;
    dragging = true;
    startX = event.clientX;
    startTime = live.time;
    arrival.setPointerCapture(event.pointerId);
    arrival.classList.add("is-directing");
    cancelAnimationFrame(rafId);
  });
  arrival.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const delta = ((event.clientX - startX) / arrival.clientWidth) * 4.5;
    live.time = Math.min(3, Math.max(0, startTime + delta));
    const tokens = interpolatePhase(Math.floor(Math.min(2.99, live.time)), Math.min(3, Math.floor(Math.min(2.99, live.time)) + 1), live.time % 1);
    live.scatter = tokens.scatter;
    live.heat = tokens.heat;
    renderFrame();
  });
  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    arrival.classList.remove("is-directing");
    if (arrival.hasPointerCapture?.(event.pointerId)) arrival.releasePointerCapture(event.pointerId);
    const nearest = Math.round(live.time);
    machine.set(nearest);
    tweenTo(nearest);
  };
  arrival.addEventListener("pointerup", release);
  arrival.addEventListener("pointercancel", release);
}

const fitView = () => {
  if (!renderer || renderer.isLost()) return;
  const width = window.innerWidth;
  const tier = width <= 760 ? "narrow" : width <= 1080 ? "mid" : "wide";
  const views = {
    narrow: { free: { offsetX: 0, offsetY: -0.75, scale: 0.35 }, spine: { offsetX: 0, offsetY: 0.42, scale: 0.42 } },
    mid: { free: { offsetX: 0.15, offsetY: -1.2, scale: 0.4 }, spine: { offsetX: -0.3, offsetY: 0.15, scale: 0.45 } },
    wide: { free: { offsetX: 0.62, offsetY: 0.02, scale: 0.62 }, spine: { offsetX: -0.55, offsetY: 0, scale: 0.5 } },
  };
  renderer.set(scrollOwnsTime ? views[tier].spine : views[tier].free);
};

// Scroll = time through the manufacture spine; controls own time elsewhere.
if (track) {
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const rect = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      const inside = rect.top < viewport * 0.5 && rect.bottom > viewport * 1.0;
      if (inside && !reducedMotion) {
        if (!scrollOwnsTime) {
          scrollOwnsTime = true;
          fitView();
        }
        const progress = Math.min(1, Math.max(0, -rect.top / (rect.height - viewport)));
        const target = progress * 3;
        cancelAnimationFrame(rafId);
        live.time = target;
        const lower = Math.floor(Math.min(2.99, target));
        const tokens = interpolatePhase(lower, lower + 1, target - lower);
        live.scatter = tokens.scatter;
        live.heat = tokens.heat;
        renderFrame();
        const nearest = Math.round(target);
        panels.forEach((panel, index) => panel.toggleAttribute("data-active", index === nearest));
        document.documentElement.dataset.activePhase = resolvePhase(nearest).id;
      } else if (scrollOwnsTime) {
        scrollOwnsTime = false;
        fitView();
        const state = machine.getState();
        panels.forEach((panel, index) => panel.toggleAttribute("data-active", index === state.index));
        document.documentElement.dataset.activePhase = resolvePhase(state.index).id;
        tweenTo(controlTarget);
      }
      const nearTrack = rect.top < viewport * 0.9 && rect.bottom > viewport;
      const nearArrival = window.scrollY < viewport * 0.6;
      document.documentElement.classList.toggle("workshop-docked", !(nearTrack || nearArrival));
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Dev-only deep link for visual review: ?t=1.5 scrolls the manufacture
  // spine to the matching build time. Not used by the public experience.
  const deepLink = new URLSearchParams(window.location.search).get("t");
  if (deepLink !== null) {
    const target = Math.min(3, Math.max(0, Number(deepLink) || 0));
    requestAnimationFrame(() => {
      const docTop = track.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: docTop + (track.offsetHeight - window.innerHeight) * (target / 3), behavior: "instant" });
    });
  }
}

window.addEventListener("resize", () => {
  fitView();
  renderFrame();
});
window.dispatchEvent(new Event("resize"));

if (!reducedMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in-view");
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -12%", threshold: 0.12 });

  revealTargets.forEach((target) => observer.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-in-view"));
}

requestAnimationFrame(() => document.documentElement.classList.add("is-ready"));

// Dev-only capture handle: starve in-flight tweens so CDP screenshots never
// wait behind an animation frame. See project memory "screenshot-raf-timeout".
window.__capture = Object.freeze({
  freeze() {
    cancelAnimationFrame(rafId);
  },
  thaw() {
    renderFrame();
  },
});

window.addEventListener("pagehide", () => {
  clearTimeout(releaseTimer);
  cancelAnimationFrame(rafId);
  machine.destroy();
  renderer?.dispose();
}, { once: true });
