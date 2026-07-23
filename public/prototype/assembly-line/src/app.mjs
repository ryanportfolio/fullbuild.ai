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
const revealTargets = Array.from(document.querySelectorAll(".future-case, .principles article, .case-zero__receipt p"));
const statusPhase = document.querySelector("[data-status-phase]");
const track = document.querySelector("[data-lifecycle-track]");
const principlesSection = document.querySelector(".principles");
const stairs = Array.from(document.querySelectorAll(".principles__list article"));
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
let hopOwnsTime = false;
let controlTarget = initialIndex;
// Entry-handoff blend state; owned by the spine scroll handler below but
// read by the resize handler so a resize never snaps a running blend.
let handoff = null;
let instantSpine = false;
let lastSpineTime = initialIndex;

const setPhaseVariables = (tokens) => {
  arrival.style.setProperty("--phase-width", tokens.width);
  arrival.style.setProperty("--phase-weight", tokens.weight);
  document.documentElement.style.setProperty("--phase-scatter", tokens.scatter);
};

const stageViews = () => {
  const width = window.innerWidth;
  const tier = width <= 760 ? "narrow" : width <= 1080 ? "mid" : "wide";
  const views = {
    // Narrow spine: smaller scale so high-scatter states (vapor) stay inside
    // the 390px frame instead of flooding it edge to edge.
    narrow: { free: { offsetX: 0, offsetY: -1.15, scale: 0.32 }, spine: { offsetX: 0, offsetY: 0.3, scale: 0.34 } },
    mid: { free: { offsetX: 0.55, offsetY: -1.25, scale: 0.33 }, spine: { offsetX: -0.3, offsetY: 0.15, scale: 0.45 } },
    wide: { free: { offsetX: 0.92, offsetY: 0.06, scale: 0.58 }, spine: { offsetX: -0.55, offsetY: 0, scale: 0.5 } },
  };
  // Short landscape viewports squeeze the free band between lede and promise
  // row; pull the artifact further right and down so spikes clear the text.
  if (tier === "mid" && window.innerHeight <= 760) {
    views.mid.free = { offsetX: 0.8, offsetY: -1.45, scale: 0.29 };
  }
  return views[tier];
};

// Live camera view, tweened alongside time so free <-> spine handoffs glide
// instead of snapping. Starts at the free view for the current tier.
const viewLive = { ...stageViews().free };

const targetView = () => {
  const views = stageViews();
  return scrollOwnsTime ? views.spine : views.free;
};

const fitView = () => {
  if (!renderer || renderer.isLost()) return;
  Object.assign(viewLive, targetView());
  renderer.set({ ...viewLive });
};

const renderFrame = (view) => {
  if (renderer && !renderer.isLost()) {
    renderer.set({
      time: live.time,
      scatter: live.scatter,
      heat: live.heat,
      spin: live.spin,
      ...(view ? { offsetX: view.offsetX, offsetY: view.offsetY, scale: view.scale } : null),
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
    Object.assign(viewLive, targetView());
    renderFrame(viewLive);
    return;
  }
  const from = { time: live.time, scatter: live.scatter, heat: live.heat, spin: live.spin, ...viewLive };
  const tokens = interpolatePhase(Math.round(live.time), Math.round(target), 1);
  const view = targetView();
  const to = { time: target, scatter: tokens.scatter, heat: tokens.heat, spin: -0.55 + (target - from.time) * 0.35, ...view };
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = easeInOut(progress);
    live.time = from.time + (to.time - from.time) * eased;
    live.scatter = from.scatter + (to.scatter - from.scatter) * eased;
    live.heat = from.heat + (to.heat - from.heat) * eased;
    live.spin = from.spin + (to.spin - from.spin) * eased;
    viewLive.offsetX = from.offsetX + (to.offsetX - from.offsetX) * eased;
    viewLive.offsetY = from.offsetY + (to.offsetY - from.offsetY) * eased;
    viewLive.scale = from.scale + (to.scale - from.scale) * eased;
    renderFrame(viewLive);
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
  if (statusPhase) statusPhase.textContent = tokens.id;

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
  if (!scrollOwnsTime && !hopOwnsTime) tweenTo(state.index);
};

const machine = createStageMachine({
  stages: site.stages,
  deploymentVerified: site.deployment.verified,
  reducedMotion,
  initialIndex,
  onChange: applyPhase,
});

let gateTimer = 0;
const announceLocked = () => {
  readout.textContent = "shipped / production proof pending";
  arrival.classList.remove("is-gated");
  requestAnimationFrame(() => arrival.classList.add("is-gated"));
  clearTimeout(gateTimer);
  gateTimer = window.setTimeout(() => {
    arrival.classList.remove("is-gated");
    // Restore truth so re-queries read the committed phase and the next
    // gate hit is a fresh live-region change.
    readout.textContent = resolvePhase(machine.getState().index).id;
  }, 3000);
};

const requestStage = (control, index) => {
  if (!machine.set(index) && control.getAttribute("aria-disabled") === "true") announceLocked();
};

controls.forEach((control, index) => {
  control.addEventListener("click", (event) => {
    // Reduced motion: unlocked anchors keep their native jump to the stacked
    // panels; only the locked gate is intercepted.
    if (reducedMotion && control.getAttribute("aria-disabled") !== "true") {
      machine.set(index);
      return;
    }
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
  // Focus may land on the locked gate; only activate unlocked stages so
  // arrowing past the end does not spam the gate announcement.
  if (controls[next].getAttribute("aria-disabled") !== "true") requestStage(controls[next], next);
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
    if (event.target.closest("a, button, .arrival__copy, .arrival__promise, .time-console")) return;
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
    // live.time - lower, not % 1: at the clamp (exactly 3) modulo wraps the
    // progress to 0 and desyncs material from shape.
    const lower = Math.floor(Math.min(2.99, live.time));
    const tokens = interpolatePhase(lower, lower + 1, live.time - lower);
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
    const before = machine.getState().index;
    if (machine.set(nearest) || nearest === before) {
      tweenTo(nearest);
    } else {
      // Gate holds against drag too: announce and snap back to the last
      // legal stage.
      announceLocked();
      tweenTo(before);
    }
  };
  arrival.addEventListener("pointerup", release);
  arrival.addEventListener("pointercancel", release);
}

// End-of-track handoff: the artifact shrinks and hops down the shop-rules
// stagger, landing on each rule's top border, instead of cutting out.
// Screen px <-> renderer offsets via the same perspective the renderer uses:
// FOV pi/5, camera distance 4.6 / scale, object radius ~1.1.
const HOP_F = 1 / Math.tan(Math.PI / 10);
const hopHalfPx = (scale, height) => ((HOP_F * 1.1 * scale) / 4.6) * (height / 2);

const hopAnchors = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;
  const spine = stageViews().spine;
  const spineDistance = 4.6 / spine.scale;
  const start = {
    x: (((spine.offsetX * HOP_F) / (aspect * spineDistance)) + 1) / 2 * width,
    y: ((1 - (spine.offsetY * HOP_F) / spineDistance) / 2) * height,
    scale: spine.scale,
  };
  const ladder = [0.5, 0.38, 0.28];
  return [start, ...stairs.map((stair, index) => {
    const rect = stair.getBoundingClientRect();
    const scale = spine.scale * ladder[index];
    const half = hopHalfPx(scale, height);
    // Land on the right end of each rule's top border: the copy sits under
    // the left side, so the right end is clear air on every stagger step.
    return { x: rect.right - half - 12, y: rect.top - half + 2, scale };
  })];
};

const hopActive = (trackRect, viewport) => {
  if (!renderer || renderer.isLost() || reducedMotion) return false;
  if (!principlesSection || stairs.length < 3 || window.innerWidth <= 760) return false;
  if (trackRect.bottom > viewport - 2) return false;
  // Once the last stair has scrolled well past the top, hand back to docking.
  return stairs[2].getBoundingClientRect().top > -viewport * 0.2;
};

const renderHop = () => {
  if (!renderer || renderer.isLost()) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const sectionTop = principlesSection.getBoundingClientRect().top;
  const p = Math.min(1, Math.max(0, (height - sectionTop) / (height * 0.85)));
  const anchors = hopAnchors();
  const bounds = [[0, 0.4], [0.4, 0.72], [0.72, 1]];
  const seg = p < 0.4 ? 0 : p < 0.72 ? 1 : 2;
  const [segStart, segEnd] = bounds[seg];
  const u = (p - segStart) / (segEnd - segStart);
  const eased = u * u * (3 - 2 * u);
  const from = anchors[seg];
  const to = anchors[seg + 1];
  const arc = [120, 85, 60][seg] * 4 * u * (1 - u);
  const x = from.x + (to.x - from.x) * eased;
  const y = from.y + (to.y - from.y) * eased - arc;
  const scale = from.scale + (to.scale - from.scale) * eased;

  cancelAnimationFrame(rafId);
  const tokens = resolvePhase(3);
  live.time = 3;
  live.scatter = tokens.scatter;
  live.heat = tokens.heat;
  live.spin = -0.55 + p * 1.4;
  if (clock) clock.textContent = "t+3.00";
  const distance = 4.6 / scale;
  renderer.set({
    time: 3,
    scatter: live.scatter,
    heat: live.heat,
    spin: live.spin,
    offsetX: (((x / width) * 2 - 1) * distance * (width / height)) / HOP_F,
    offsetY: ((1 - (y / height) * 2) * distance) / HOP_F,
    scale,
  });
};

// Scroll = time through the manufacture spine; controls own time elsewhere.
if (track) {
  let ticking = false;

  // Entry handoff: when scroll takes ownership, blend from the committed
  // arrival state (time, material, camera) into the scroll-derived state over
  // HANDOFF_MS instead of snapping both in one frame. The scroll target keeps
  // moving while the blend runs, so each frame re-reads it and converges.
  const HANDOFF_MS = 900;

  const spineFrame = (now) => {
    cancelAnimationFrame(rafId);
    const rect = track.getBoundingClientRect();
    const viewport = window.innerHeight;
    const progress = Math.min(1, Math.max(0, -rect.top / (rect.height - viewport)));
    track.classList.toggle("is-track-ending", progress > 0.985);
    const target = progress * 3;
    lastSpineTime = target;
    const lower = Math.floor(Math.min(2.99, target));
    const tokens = interpolatePhase(lower, lower + 1, target - lower);
    if (handoff) {
      const p = Math.min(1, (now - handoff.start) / HANDOFF_MS);
      const eased = easeInOut(p);
      const f = handoff.from;
      const spine = stageViews().spine;
      live.time = f.time + (target - f.time) * eased;
      live.scatter = f.scatter + (tokens.scatter - f.scatter) * eased;
      live.heat = f.heat + (tokens.heat - f.heat) * eased;
      viewLive.offsetX = f.offsetX + (spine.offsetX - f.offsetX) * eased;
      viewLive.offsetY = f.offsetY + (spine.offsetY - f.offsetY) * eased;
      viewLive.scale = f.scale + (spine.scale - f.scale) * eased;
      renderFrame(viewLive);
      if (p >= 1) {
        handoff = null;
      } else {
        // Keep blending between scroll events; __capture.freeze() starves
        // this the same way it starves tweens.
        rafId = requestAnimationFrame((t) => {
          if (scrollOwnsTime && handoff) spineFrame(t);
        });
      }
    } else {
      live.time = target;
      live.scatter = tokens.scatter;
      live.heat = tokens.heat;
      renderFrame();
    }
    return target;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const rect = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      const inside = rect.top < viewport * 0.5 && rect.bottom > viewport - 2;
      const wasHopping = hopOwnsTime;
      hopOwnsTime = hopActive(rect, viewport);
      if (wasHopping !== hopOwnsTime) {
        document.documentElement.classList.toggle("is-hopping", hopOwnsTime);
        // Hop released away from the track (deep link, fast jump): restore the
        // committed stage instantly while the canvas is docked out of sight.
        if (!hopOwnsTime && !(inside && !reducedMotion)) {
          fitView();
          tweenTo(machine.getState().index, { duration: 0 });
        }
      }
      if (inside && !reducedMotion) {
        if (!scrollOwnsTime) {
          scrollOwnsTime = true;
          cancelAnimationFrame(rafId);
          if (instantSpine) {
            // Deep-link review jumps land settled; no entry morph.
            instantSpine = false;
            fitView();
          } else {
            handoff = {
              start: performance.now(),
              from: { time: live.time, scatter: live.scatter, heat: live.heat, ...viewLive },
            };
          }
        }
        const target = spineFrame(performance.now());
        const nearest = Math.round(target);
        panels.forEach((panel, index) => panel.toggleAttribute("data-active", index === nearest));
        document.documentElement.dataset.activePhase = resolvePhase(nearest).id;
      } else if (scrollOwnsTime) {
        scrollOwnsTime = false;
        handoff = null;
        // View glides back to the free dock inside the tween below instead
        // of snapping.
        // Keep the tail faded when leaving past the bottom; only a top exit
        // (scrolling back up) restores the panel.
        if (rect.top > 0) track.classList.remove("is-track-ending");
        // Commit the last scrolled stage (gate still holds) so console,
        // phase, and artifact agree after the spine releases.
        const nearest = Math.round(lastSpineTime);
        if (!machine.set(Math.min(nearest, 2))) {
          const state = machine.getState();
          panels.forEach((panel, index) => panel.toggleAttribute("data-active", index === state.index));
          document.documentElement.dataset.activePhase = resolvePhase(state.index).id;
          // The hop keeps the fused artifact on screen past the track; do not
          // morph it back mid-descent.
          if (!hopOwnsTime) tweenTo(controlTarget);
        }
      }
      if (hopOwnsTime) renderHop();
      const nearTrack = rect.top < viewport * 0.9 && rect.bottom > viewport - 2;
      const nearArrival = window.scrollY < viewport * 0.6;
      document.documentElement.classList.toggle("workshop-docked", !(nearTrack || nearArrival || hopOwnsTime));
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Dev-only deep link for visual review: ?t=1.5 scrolls the manufacture
  // spine to the matching build time. Not used by the public experience.
  const deepLink = new URLSearchParams(window.location.search).get("t");
  if (deepLink !== null) {
    const target = Math.min(3, Math.max(0, Number(deepLink) || 0));
    instantSpine = true;
    requestAnimationFrame(() => {
      const docTop = track.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: docTop + (track.offsetHeight - window.innerHeight) * (target / 3), behavior: "instant" });
    });
  }
}

window.addEventListener("resize", () => {
  if (hopOwnsTime) {
    renderHop();
    return;
  }
  // Mid-handoff: the blend re-reads stageViews() every frame, so it adapts
  // to the new tier on its own; a fitView here would snap the camera.
  if (handoff) return;
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
  clearTimeout(gateTimer);
  cancelAnimationFrame(rafId);
  machine.destroy();
  renderer?.dispose();
}, { once: true });
