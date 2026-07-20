import { resolvePhase } from "./phase-state.mjs";
import { createStageMachine } from "./stage-machine.mjs";

document.documentElement.classList.add("has-js");

const dataNode = document.querySelector("#site-data");
const root = document.querySelector("[data-build-seam]");
const seam = root?.querySelector(".build-seam");
const readout = root?.querySelector("[data-phase-readout]");
const controls = Array.from(document.querySelectorAll("[data-phase-control]"));
const stages = Array.from(document.querySelectorAll("[data-stage-panel]"));
const revealTargets = Array.from(document.querySelectorAll(".lifecycle-stage, .future-case, .principles article"));
const site = JSON.parse(dataNode.textContent);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const initialIndex = Math.max(0, site.stages.findIndex(({ id }) => id === site.caseStudy.status));
let releaseTimer = 0;

const setPhaseVariables = (phase) => {
  root.style.setProperty("--phase-width", phase.width);
  root.style.setProperty("--phase-weight", phase.weight);
  root.style.setProperty("--phase-depth", phase.depth);
  root.style.setProperty("--seam-x", `${phase.seam}%`);
};

const applyPhase = (state) => {
  const phase = resolvePhase(state.index);
  root.dataset.phase = phase.id;
  document.documentElement.dataset.activePhase = phase.id;
  setPhaseVariables(phase);
  readout.textContent = phase.id;

  controls.forEach((control, index) => {
    control.setAttribute("aria-current", index === state.index ? "step" : "false");
  });

  stages.forEach((stage, index) => {
    stage.toggleAttribute("data-active", index === state.index);
  });

  root.classList.remove("is-changing");
  requestAnimationFrame(() => root.classList.add("is-changing"));
  clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => root.classList.remove("is-changing"), reducedMotion ? 0 : 760);
};

const machine = createStageMachine({
  stages: site.stages,
  deploymentVerified: site.deployment.verified,
  reducedMotion,
  initialIndex,
  onChange: applyPhase,
});

applyPhase(machine.getState());

const announceLocked = () => {
  readout.textContent = "shipped — production proof pending";
  root.classList.remove("is-gated");
  requestAnimationFrame(() => root.classList.add("is-gated"));
  window.setTimeout(() => root.classList.remove("is-gated"), 3000);
};

controls.forEach((control, index) => {
  control.addEventListener("click", () => {
    if (!machine.set(index) && control.getAttribute("aria-disabled") === "true") announceLocked();
  });
});

root.querySelector(".phase-console")?.addEventListener("keydown", (event) => {
  const current = controls.indexOf(document.activeElement);
  if (current < 0) return;

  let next = current;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(controls.length - 1, current + 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, current - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = controls.length - 1;
  else return;

  event.preventDefault();
  controls[next].focus();
  if (!machine.set(next) && controls[next].getAttribute("aria-disabled") === "true") announceLocked();
});

if (seam && !reducedMotion) {
  let dragging = false;

  const moveSeam = (event) => {
    if (!dragging) return;
    const bounds = root.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    root.style.setProperty("--seam-x", `${Math.min(86, Math.max(18, x))}%`);
  };

  seam.addEventListener("pointerdown", (event) => {
    dragging = true;
    seam.setPointerCapture(event.pointerId);
    root.classList.add("is-directing");
    moveSeam(event);
  });
  seam.addEventListener("pointermove", moveSeam);
  seam.addEventListener("pointerup", (event) => {
    dragging = false;
    seam.releasePointerCapture(event.pointerId);
    root.classList.remove("is-directing");
    root.style.setProperty("--seam-x", `${resolvePhase(machine.getState().index).seam}%`);
  });
  seam.addEventListener("pointercancel", () => {
    dragging = false;
    root.classList.remove("is-directing");
  });
}

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

window.addEventListener("pagehide", () => {
  clearTimeout(releaseTimer);
  machine.destroy();
}, { once: true });
