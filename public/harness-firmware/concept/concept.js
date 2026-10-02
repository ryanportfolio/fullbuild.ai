import { heroState, fieldToRGBA, blueNoise64, SEED } from "/harness-firmware/src/dither.mjs";
import Lenis from "./vendor/lenis.mjs";

const root = document.documentElement;
root.classList.remove("no-js");
root.classList.add("js");
root.dataset.enhanced = "true";

const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const phoneQuery = matchMedia("(max-width: 760px)");
const loopDesktopQuery = matchMedia("(min-width: 1200px)");

const beatNames = ["intent", "context", "bounded-work", "execution", "evidence", "review-fork", "repair", "reconcile", "release", "refine"];
// The symbol stays in its native 600 x 1320 geometry for the complete phone map.
// Desktop cameras place each active node on the side opposite its foreground panel.
const cameras = [
  { x: 300, y: 68, scale: 1.62, anchorX: 850, anchorY: 230 },
  { x: 300, y: 182, scale: 1.62, anchorX: 350, anchorY: 300 },
  { x: 300, y: 296, scale: 1.62, anchorX: 850, anchorY: 380 },
  { x: 300, y: 410, scale: 1.62, anchorX: 350, anchorY: 430 },
  { x: 300, y: 524, scale: 1.58, anchorX: 850, anchorY: 430 },
  { x: 300, y: 676, scale: 1.4, anchorX: 348, anchorY: 430 },
  { x: 300, y: 844, scale: 1.56, anchorX: 850, anchorY: 430 },
  { x: 300, y: 974, scale: 1.58, anchorX: 350, anchorY: 430 },
  { x: 300, y: 1088, scale: 1.58, anchorX: 850, anchorY: 540 },
  { x: 300, y: 1208, scale: 1.56, anchorX: 350, anchorY: 620 },
];

const beats = [...document.querySelectorAll("[data-beat]")];
const storyMechanisms = [...document.querySelectorAll("[data-beat-mechanism]")];
const instrumentRail = document.querySelector(".instrument-rail");
const cameraGroup = document.querySelector("[data-map-camera]");
const mapBeat = document.querySelector("[data-map-beat]");
const mapState = document.querySelector("[data-map-state]");
const storyHeading = document.querySelector("[data-engineering-word]");
const fittedHeadings = [...document.querySelectorAll("[data-fit-heading]")];
const heroHeading = document.querySelector("[data-fit-heading]");
const loopLines = [...document.querySelectorAll(".loop-track .loop-line")];
const skillCards = [...document.querySelectorAll("[data-skill-reveal]")];
const symbol = document.getElementById("system-map");
const nodes = symbol ? [...symbol.querySelectorAll("[data-node]")] : [];
const routes = symbol ? [...symbol.querySelectorAll("[data-route-index]")] : [];
const loopSequence = document.querySelector("[data-loop-sequence]");
const loopScroll = document.querySelector("[data-loop-scroll]");
const loopStage = document.querySelector("[data-loop-stage]");
const loopProof = document.querySelector("[data-loop-proof]");
const loopProofMaps = [...document.querySelectorAll(".loop-proof-map")];
const phaserTargets = [...document.querySelectorAll("[data-phaser-title], [data-phaser-word]")].map((target) => ({
  id: target.dataset.phaserTarget,
  target,
  canvas: null,
  context: null,
  mask: null,
  width: 0,
  height: 0,
  maskTop: 0,
  maskBottom: 1,
  activated: false,
  near: false,
  startedAt: 0,
}));
const phaserById = new Map(phaserTargets.map((record) => [record.id, record]));
const phaserNoise = blueNoise64(SEED);
const hero = document.getElementById("hero");
const heroField = document.querySelector("[data-hero-field]");
const heroFieldContext = heroField?.getContext("2d", { alpha: true });
const systemPlate = document.querySelector("[data-system-plate]");
const contextSection = document.querySelector("#context-architecture");
const memorySection = document.querySelector("#memory");
const plateStations = new Map([...document.querySelectorAll("[data-plate-station]")].map((element) => [element.dataset.plateStation, element]));
const plateRoutes = new Map([...document.querySelectorAll("[data-plate-route]")].map((element) => [element.dataset.plateRoute, element]));
const plateReturnPath = document.querySelector("[data-plate-return-path]");
const plateReturnPacket = document.querySelector("[data-plate-return-packet]");
const paritySections = [...document.querySelectorAll(".context-section, .memory-section, .runtime-section, .creator-section")];
const parityVisibility = new WeakMap(paritySections.map((section) => [section, false]));
const parityStartTimes = new WeakMap();
const contextPackets = [...document.querySelectorAll(".context-router i")];
const memoryConsoleLines = [...document.querySelectorAll(".memory-console-body p")];
const memoryObservePacket = document.querySelector(".memory-observe-packet");
const memoryTunnel = document.querySelector(".memory-tunnel");
const memoryWritePacket = document.querySelector(".memory-write-packet");
const memoryCommitPacket = document.querySelector(".memory-commit-packet");
const memoryOrbit = document.querySelector(".memory-orbit");
const memoryRecallPacket = document.querySelector(".memory-recall-packet");
const memoryWaves = document.querySelector(".memory-waves");
const runtimePacketIn = document.querySelector(".runtime-packet-in");
const runtimePacketA = document.querySelector(".runtime-packet-a");
const runtimePacketB = document.querySelector(".runtime-packet-b");
const creatorGo = document.querySelector(".creator-go");
const creatorTunnel = document.querySelector(".creator-tunnel");
const creatorInstallRows = [...document.querySelectorAll(".creator-install")];
const creatorPacketOne = document.querySelector(".creator-packet-one");
const creatorPacketTwo = document.querySelector(".creator-packet-two");
const creatorOrbit = document.querySelector(".creator-orbit");
const creatorReadyTag = document.querySelector(".creator-ready-tag");
const revealElements = [...document.querySelectorAll(".reveal")];
const mechanismElements = new Map([...document.querySelectorAll("[data-mechanism]")].map((element) => [element.dataset.mechanism, element]));
const mechanismHoldPhases = Object.freeze({
  "horizon-contract": ["horizon", "contract", 0],
  "horizon-execute": ["horizon", "execute", 0.25],
  "horizon-audit": ["horizon", "audit", 0.5],
  "horizon-dead-end": ["horizon", "dead-end", 0.75],
  "horizon-verified": ["horizon", "verified", 1],
  "context-roots": ["context", "roots", 0],
  "context-route": ["context", "route", 0.5],
  "context-library": ["context", "library", 1],
  "memory-observe": ["memory", "observe", 0],
  "memory-commit": ["memory", "commit", 0.34],
  "memory-retrieve": ["memory", "retrieve", 0.67],
  "memory-replay-complete": ["memory", "complete", 1],
  "runtime-source": ["runtime", "source", 0],
  "runtime-adapt": ["runtime", "adapt", 0.5],
  "runtime-fan-out": ["runtime", "fan-out", 1],
  "creator-name": ["creator", "name", 0],
  "creator-assemble": ["creator", "assemble", 0.5],
  "creator-ready": ["creator", "ready", 1],
  "finale-ready": ["finale", "ready", 1],
});
const loopHoldProgress = Object.freeze({
  "loop-plan": 0.06,
  "loop-advance": 0.20,
  "loop-check": 0.355,
  "loop-fail": 0.505,
  "loop-return": 0.655,
  "loop-ship": 0.815,
  "loop-static": 1,
});
const loopBeatNames = Object.freeze(Object.keys(loopHoldProgress));

let frame = 0;
let invalid = true;
let smoothScroll = null;
let held = false;
let heldIndex = 0;
let currentIndex = 0;
let currentProgress = 0;
let beatTops = [];
let beatBottom = 0;
let storyHeadingTop = 0;
let storyHeadingRange = 1;
let loopTop = 0;
let loopRange = 1;
let memoryTop = 0;
let memoryHandoffProgress = -1;
let loopHeld = false;
let loopHeldName = "loop-static";
let loopHeldProgress = 1;
let loopCurrentName = "loop-static";
let loopCurrentProgress = 1;
let loopCurrentState = { dominant: "loop-static", gate: "open", claim: "retained", route: "settled" };
let phaserHeld = null;
let phaserOwnsParity = false;
let mechanismHeld = null;
let phaserResizePending = false;
let frameResolvers = [];
let heroFitState = { target: 0, widths: [] };
const headingFitStates = new WeakMap();
const revealTimers = new Set();
let heroFieldMask = null;
let heroFieldImage = null;
let heroFieldWidth = 0;
let heroFieldHeight = 0;
let heroFieldDrift = 0;
let heroFieldStartedAt = performance.now();
let heroFieldReady = false;
let heroFieldVisible = true;
let heroFieldLastBucket = -1;
let heroFieldHeldStamp = "";
let systemPlateStartedAt = performance.now();
let parityHeld = null;

function measure() {
  beatTops = beats.map((beat) => beat.getBoundingClientRect().top + scrollY);
  const last = beats.at(-1);
  beatBottom = last ? last.getBoundingClientRect().bottom + scrollY : 1;
  if (storyHeading) {
    const rect = storyHeading.getBoundingClientRect();
    storyHeadingTop = rect.top + scrollY - innerHeight * 0.68;
    storyHeadingRange = Math.max(1, rect.height + innerHeight * 0.36);
  }
  if (loopScroll && loopStage) {
    const rect = loopScroll.getBoundingClientRect();
    loopTop = rect.top + scrollY;
    loopRange = Math.max(1, loopScroll.offsetHeight - innerHeight);
  }
  if (memorySection) {
    const rect = memorySection.getBoundingClientRect();
    memoryTop = rect.top + scrollY;
  }
  invalid = false;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function configureSmoothScroll() {
  smoothScroll?.destroy();
  smoothScroll = null;
  delete window.__lenis;
  if (motionQuery.matches) return;

  smoothScroll = new Lenis({
    autoRaf: false,
    lerp: 0.085,
    smoothWheel: true,
    syncTouch: false,
    wheelMultiplier: 0.85,
    touchMultiplier: 1,
    overscroll: false,
    anchors: { lerp: 0.095 },
  });
  smoothScroll.on("virtual-scroll", schedule);
  smoothScroll.on("scroll", schedule);
  window.__lenis = smoothScroll;
}

function advanceSmoothScroll(now) {
  if (!smoothScroll) return false;
  smoothScroll.raf(now);
  return smoothScroll.isScrolling === "smooth";
}

function derivedState() {
  if (invalid) measure();
  if (held) return { index: heldIndex, progress: heldIndex / (beatNames.length - 1), local: 0 };
  if (phoneQuery.matches || motionQuery.matches) return { index: beatNames.length - 1, progress: 1, local: 0 };

  const target = scrollY + innerHeight * 0.55;
  let index = 0;
  for (let i = 0; i < beatTops.length; i += 1) {
    if (target >= beatTops[i]) index = i;
  }
  const from = beatTops[index] ?? 0;
  const to = beatTops[index + 1] ?? beatBottom;
  const local = clamp((target - from) / Math.max(1, to - from), 0, 1);
  const first = beatTops[0] ?? 0;
  const progress = clamp((target - first) / Math.max(1, beatBottom - first), 0, 1);
  return { index, progress, local };
}

function cameraFor(index) {
  if (held || phoneQuery.matches || motionQuery.matches) return cameras[index];
  return cameras[index];
}

function applyNodeStates(index) {
  const finished = phoneQuery.matches || motionQuery.matches;
  nodes.forEach((node) => {
    const nodeIndex = Number(node.dataset.nodeIndex);
    const state = finished || nodeIndex < index ? "retained" : nodeIndex === index ? "active" : "idle";
    if (node.dataset.state !== state) node.dataset.state = state;
  });

  const activeRouteIndex = Math.max(1, index);
  let activeRouteAssigned = false;
  routes.forEach((route) => {
    const routeIndex = Number(route.dataset.routeIndex);
    let state = "idle";
    if (finished || routeIndex < activeRouteIndex) state = "retained";
    else if (routeIndex === activeRouteIndex && !activeRouteAssigned) {
      state = "active";
      activeRouteAssigned = true;
    }
    if (!finished && route.dataset.route === "clean-bypass" && index === 6) state = "bypassed";
    if (route.dataset.state !== state) route.dataset.state = state;
  });
}

function applyCamera(camera) {
  if (!cameraGroup) return;
  const transform = `translate(${camera.anchorX} ${camera.anchorY}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`;
  if (cameraGroup.getAttribute("transform") !== transform) cameraGroup.setAttribute("transform", transform);
}

function applyEngineeringProgress() {
  if (!storyHeading) return 1;
  const finished = held || phoneQuery.matches || motionQuery.matches;
  const progress = finished ? 1 : clamp((scrollY - storyHeadingTop) / storyHeadingRange, 0, 1);
  storyHeading.style.setProperty("--engineering-progress", progress.toFixed(4));
  storyHeading.style.setProperty("--engineering-clip", `${((1 - progress) * 100).toFixed(2)}%`);
  return progress;
}

function applyMemoryHandoff() {
  if (!contextSection || !memorySection) return 1;
  const progress = motionQuery.matches
    ? 1
    : clamp((scrollY - (memoryTop - innerHeight * 0.96)) / Math.max(1, innerHeight * 0.44), 0, 1);
  const quantized = Math.round(progress * 240) / 240;
  if (quantized === memoryHandoffProgress) return quantized;
  memoryHandoffProgress = quantized;
  const value = quantized.toFixed(4);
  contextSection.style.setProperty("--memory-handoff-progress", value);
  memorySection.style.setProperty("--memory-handoff-progress", value);
  return quantized;
}

function rangeProgress(value, start, end) {
  return clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
}

function linePoint(points, progress) {
  const scaled = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = points[index];
  const to = points[index + 1];
  return [from[0] + (to[0] - from[0]) * local, from[1] + (to[1] - from[1]) * local];
}

function loopNameFor(progress) {
  if (progress < 0.12) return "loop-plan";
  if (progress < 0.28) return "loop-advance";
  if (progress < 0.43) return "loop-check";
  if (progress < 0.58) return "loop-fail";
  if (progress < 0.73) return "loop-return";
  if (progress < 0.90) return "loop-ship";
  return "loop-static";
}

function loopLocalFor(name, progress) {
  const ranges = {
    "loop-plan": [0, 0.12],
    "loop-advance": [0.12, 0.28],
    "loop-check": [0.28, 0.43],
    "loop-fail": [0.43, 0.58],
    "loop-return": [0.58, 0.73],
    "loop-ship": [0.73, 0.90],
    "loop-static": [0.90, 1],
  };
  return rangeProgress(progress, ...ranges[name]);
}

function loopStateFor(name, local) {
  if (name === "loop-plan" || name === "loop-advance") return { dominant: name, gate: "closed", claim: "packet", route: "forward" };
  if (name === "loop-check") return { dominant: name, gate: "closed", claim: "claim", route: "forward" };
  if (name === "loop-fail" || name === "loop-return") return { dominant: name, gate: "closed", claim: "confirmed-problem", route: "return" };
  if (name === "loop-ship") return { dominant: name, gate: local >= 0.40 ? "open" : "closed", claim: "check-passed", route: "release" };
  return { dominant: "loop-static", gate: "open", claim: local < 0.30 ? "settling" : "retained", route: "settled" };
}

function loopPhasesFor(name, local) {
  return {
    local: Number(local.toFixed(4)),
    planCharge: name === "loop-plan" ? rangeProgress(local, 0, 0.55) : name === "loop-return" ? Number(local >= 0.40) : 0,
    checkMove: name === "loop-check" ? rangeProgress(local, 0, 0.15) : 0,
    checkExpand: name === "loop-check" ? rangeProgress(local, 0.15, 0.30) : 0,
    checkScan: name === "loop-check" ? rangeProgress(local, 0.30, 0.70) : 0,
    failMove: name === "loop-fail" ? rangeProgress(local, 0, 0.25) : 0,
    failReveal: name === "loop-fail" ? rangeProgress(local, 0.20, 0.35) : 0,
    failReturn: name === "loop-fail" ? rangeProgress(local, 0.25, 0.75) : 0,
    returnMove: name === "loop-return" ? local : 0,
    shipRetain: name === "loop-ship" ? rangeProgress(local, 0, 0.15) : 0,
    shipKey: name === "loop-ship" ? rangeProgress(local, 0.15, 0.30) : 0,
    shipGate: name === "loop-ship" ? rangeProgress(local, 0.30, 0.40) : name === "loop-static" ? 1 : 0,
    shipPacket: name === "loop-ship" ? rangeProgress(local, 0.40, 1) : 0,
    settleFade: name === "loop-static" ? rangeProgress(local, 0, 0.30) : 0,
  };
}

function setLoopStationStates(map, name, local) {
  const stations = Object.fromEntries([...map.querySelectorAll("[data-loop-station]")].map((station) => [station.dataset.loopStation, station]));
  const set = (station, state, phase = 0) => {
    stations[station].dataset.state = state;
    stations[station].style.setProperty("--loop-station-progress", clamp(phase, 0, 1).toFixed(4));
  };
  ["plan", "prove", "evidence", "human", "ship"].forEach((station) => set(station, "idle"));
  if (name === "loop-plan") {
    const charge = rangeProgress(local, 0, 0.55);
    set("plan", charge < 1 ? "charging" : "active", charge);
  } else if (name === "loop-advance") {
    set("plan", "retained", 1);
    set("prove", "active", 1);
  } else if (name === "loop-check") {
    set("plan", "retained", 1);
    set("prove", "active", 1);
  } else if (name === "loop-fail") {
    set("plan", "retained", 1);
    set("prove", "retained", 1);
    const retain = rangeProgress(local, 0, 0.25);
    set("evidence", retain < 1 ? "charging" : "retained", retain);
  } else if (name === "loop-return") {
    set("plan", local >= 0.40 ? "active" : "retained", 1);
    set("prove", "retained", 1);
    set("evidence", "retained", 1);
  } else if (name === "loop-ship") {
    const retain = rangeProgress(local, 0, 0.15);
    ["plan", "prove", "evidence"].forEach((station) => set(station, retain < 1 ? "retaining" : "retained", retain));
    const authority = rangeProgress(local, 0.15, 0.30);
    set("human", local < 0.30 ? "human-charging" : local < 0.40 ? "human-ready" : "human-open", authority);
    if (local >= 0.40) set("ship", "active", 1);
  } else {
    const retain = rangeProgress(local, 0, 0.30);
    ["plan", "prove", "evidence"].forEach((station) => set(station, "retained", 1));
    set("ship", retain < 1 ? "retaining" : "retained", retain);
    set("human", "human-open", 1);
  }
}

function setLoopMap(map, name, progress, dominantAllowed) {
  const phone = map.classList.contains("loop-proof-map-phone");
  const rig = map.querySelector("[data-loop-claim-rig]");
  const scan = map.querySelector("[data-loop-scan-gate]");
  const scanBlock = scan?.querySelector("rect");
  const token = map.querySelector("[data-loop-return-token]");
  const gate = map.querySelector("[data-loop-human-gate]");
  const forward = map.querySelector('[data-loop-active-route="forward"]');
  const returnRoute = map.querySelector('[data-loop-active-route="return"]');
  const release = map.querySelector('[data-loop-active-route="release"]');
  const stateLabels = [...map.querySelectorAll("[data-loop-state-label]")];
  const positions = phone
    ? { plan: [175, 106], advance: [[175, 126], [175, 164]], check: [175, 258], fail: [175, 401], ship: [[175, 611], [175, 689]], scanHalf: 120 }
    : { plan: [142, 91], advance: [[160, 91], [214, 91]], check: [325, 126], fail: [325, 272], ship: [[325, 447], [325, 513]], scanHalf: 73 };
  const band = loopLocalFor(name, progress);

  let rigMode = "retained";
  let rigPoint = positions.fail;
  let rigScale = [1, 1];
  let rigOpacity = 1;
  let scanOffset = 0;
  let forwardOffset = 1;
  let returnOffset = 1;
  let releaseOffset = 1;
  let evidenceProgress = 0;
  let problemReveal = 0;
  let residueOffset = 1;
  let keyProgress = 0;
  let gateProgress = 0;
  if (name === "loop-plan") {
    rigMode = "packet";
    rigPoint = positions.plan;
  } else if (name === "loop-advance") {
    rigMode = "packet";
    rigPoint = linePoint(positions.advance, band);
    forwardOffset = 1 - band;
  } else if (name === "loop-check") {
    const approach = rangeProgress(band, 0, 0.15);
    const expansion = rangeProgress(band, 0.15, 0.30);
    rigPoint = linePoint([positions.advance[1], positions.check], approach);
    rigMode = band < 0.15 ? "packet" : expansion < 1 ? "expanding" : "claim";
    if (band >= 0.15 && expansion < 1) rigScale = [0.115 + expansion * 0.885, 0.31 + expansion * 0.69];
    const scanProgress = rangeProgress(band, 0.30, 0.70);
    scanOffset = -positions.scanHalf + positions.scanHalf * 2 * scanProgress;
  } else if (name === "loop-fail") {
    const move = rangeProgress(band, 0, 0.25);
    evidenceProgress = move;
    problemReveal = rangeProgress(band, 0.20, 0.35);
    rigMode = "transition";
    rigPoint = linePoint([positions.check, positions.fail], move);
    returnOffset = 1 - rangeProgress(band, 0.25, 0.75);
  } else if (name === "loop-return") {
    rigMode = "evidence";
    evidenceProgress = 1;
    problemReveal = 1;
    residueOffset = 1 - band;
  } else if (name === "loop-ship") {
    const movement = rangeProgress(band, 0.40, 1);
    keyProgress = rangeProgress(band, 0.15, 0.30);
    gateProgress = rangeProgress(band, 0.30, 0.40);
    rigMode = band >= 0.40 ? "packet" : "retained";
    rigPoint = linePoint(positions.ship, movement);
    releaseOffset = 1 - movement;
  } else if (name === "loop-static") {
    const fade = rangeProgress(band, 0, 0.30);
    rigMode = fade < 1 ? "packet" : "retained";
    rigPoint = positions.ship[1];
    rigOpacity = 1 - fade;
    keyProgress = 1;
    gateProgress = 1;
    residueOffset = 0;
  }

  rig?.setAttribute("data-mode", rigMode);
  rig?.setAttribute("transform", `translate(${rigPoint[0].toFixed(2)} ${rigPoint[1].toFixed(2)}) scale(${rigScale[0].toFixed(4)} ${rigScale[1].toFixed(4)})`);
  rig?.style.setProperty("opacity", rigOpacity.toFixed(4));
  map.style.setProperty("--loop-evidence-progress", evidenceProgress.toFixed(4));
  map.style.setProperty("--loop-problem-reveal", problemReveal.toFixed(4));
  map.style.setProperty("--loop-residue-offset", residueOffset.toFixed(4));
  map.style.setProperty("--loop-key-progress", keyProgress.toFixed(4));
  if (scan) scan.setAttribute("transform", `translate(${positions.check[0]} ${positions.check[1]})`);
  if (scanBlock) scanBlock.setAttribute("transform", `translate(${scanOffset.toFixed(2)} 0)`);
  forward?.style.setProperty("--loop-route-offset", forwardOffset.toFixed(4));
  returnRoute?.style.setProperty("--loop-route-offset", returnOffset.toFixed(4));
  release?.style.setProperty("--loop-route-offset", releaseOffset.toFixed(4));

  if (token) {
    const returnProgress = band;
    const returnPoints = phone
      ? (returnProgress <= 0.5
          ? linePoint([[48, 401], [14, 401], [14, 264]], returnProgress * 2)
          : linePoint([[14, 264], [14, 126], [24, 126]], (returnProgress - 0.5) * 2))
      : (returnProgress <= 0.5
          ? linePoint([[226, 272], [66, 272], [66, 218]], returnProgress * 2)
          : linePoint([[66, 218], [66, 134], [92, 134]], (returnProgress - 0.5) * 2));
    token.setAttribute("transform", `translate(${returnPoints[0].toFixed(2)} ${returnPoints[1].toFixed(2)})`);
  }

  gate?.querySelector(".loop-gate-left")?.setAttribute("transform", `translate(${(-18 * gateProgress).toFixed(2)} 0)`);
  gate?.querySelector(".loop-gate-right")?.setAttribute("transform", `translate(${(18 * gateProgress).toFixed(2)} 0)`);
  stateLabels.forEach((label) => {
    const visible = label.dataset.loopStateLabel === name;
    label.dataset.visible = String(visible);
    label.toggleAttribute("data-loop-dominant", visible && dominantAllowed);
  });
  setLoopStationStates(map, name, band);
}

function applyLoopProgress(progress) {
  const name = loopNameFor(progress);
  const local = loopLocalFor(name, progress);
  loopCurrentName = name;
  loopCurrentProgress = progress;
  loopCurrentState = { ...loopStateFor(name, local), ...loopPhasesFor(name, local) };
  if (loopProof) loopProof.dataset.state = name;
  const phoneMapActive = phoneQuery.matches;
  loopProofMaps.forEach((map) => setLoopMap(map, name, progress, map.classList.contains("loop-proof-map-phone") === phoneMapActive));
}

function drawPhaserMask(record, maskContext, targetRect) {
  const maskElements = record.target.matches("[data-phaser-title]")
    ? [...record.target.querySelectorAll("[data-phaser-mask]")]
    : [record.target];
  maskContext.clearRect(0, 0, record.width, record.height);
  maskContext.fillStyle = "#fff";
  maskContext.textAlign = "left";
  maskContext.textBaseline = "alphabetic";
  maskElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const text = element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE ? element.firstChild.textContent : element.textContent;
    maskContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ("letterSpacing" in maskContext) maskContext.letterSpacing = style.letterSpacing;
    const metrics = maskContext.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || Number.parseFloat(style.fontSize) * 0.78;
    const descent = metrics.actualBoundingBoxDescent || Number.parseFloat(style.fontSize) * 0.2;
    const baseline = rect.top - targetRect.top + (rect.height - ascent - descent) / 2 + ascent;
    maskContext.fillText(text, rect.left - targetRect.left, baseline);
  });
}

function allocatePhaser(record, rebuild = false) {
  if (motionQuery.matches) return;
  const targetRect = record.target.getBoundingClientRect();
  const width = Math.max(1, Math.round(targetRect.width));
  const height = Math.max(1, Math.round(targetRect.height));
  if (!record.canvas) {
    record.canvas = document.createElement("canvas");
    record.canvas.className = "phaser-canvas";
    record.canvas.dataset.phaserCanvas = record.id;
    record.canvas.setAttribute("aria-hidden", "true");
    record.target.append(record.canvas);
    record.context = record.canvas.getContext("2d", { alpha: true });
  } else if (!rebuild && record.width === width && record.height === height) {
    record.activated = true;
    return;
  }
  record.width = width;
  record.height = height;
  record.canvas.width = width;
  record.canvas.height = height;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  drawPhaserMask(record, maskContext, targetRect);
  const alpha = maskContext.getImageData(0, 0, width, height).data;
  record.mask = new Float32Array(width * height);
  let maskTop = height;
  let maskBottom = 0;
  for (let index = 0; index < record.mask.length; index += 1) {
    const value = alpha[index * 4 + 3] / 255;
    record.mask[index] = value;
    if (value > 0.05) {
      const y = Math.floor(index / width);
      maskTop = Math.min(maskTop, y);
      maskBottom = Math.max(maskBottom, y);
    }
  }
  record.maskTop = maskTop < height ? maskTop : 0;
  record.maskBottom = maskBottom > record.maskTop ? maskBottom : height - 1;
  record.activated = true;
}

function paintPhaser(record, now) {
  if (!record.canvas || !record.mask) return false;
  let mode = "cycle";
  let time = (now - record.startedAt) % 5200;
  if (phaserHeld) {
    if (phaserHeld.id !== record.id) {
      record.canvas.style.opacity = "0";
      record.context.clearRect(0, 0, record.width, record.height);
      return false;
    }
    mode = phaserHeld.state;
    time = mode === "idle" ? 3000 : mode === "sweep-mid" ? 900 : 2100;
  }
  if (time >= 2400) {
    record.canvas.style.opacity = "0";
    record.context.clearRect(0, 0, record.width, record.height);
    return mode === "cycle";
  }
  let rowAge;
  let opacity = 1;
  if (time < 1800) {
    const linear = time / 1800;
    const smooth = linear * linear * (3 - 2 * linear);
    const beam = record.maskTop + (record.maskBottom - record.maskTop) * smooth;
    const span = Math.max(1, record.maskBottom - record.maskTop);
    rowAge = (y) => (beam - y) / span * 0.55;
  } else {
    const handoff = (time - 1800) / 600;
    rowAge = () => 0.08 + handoff * 0.28;
    opacity = 1 - handoff;
  }
  const field = heroState(record.mask, record.width, record.height, phaserNoise, rowAge, 0);
  const rgba = fieldToRGBA(field, new Uint8ClampedArray(record.width * record.height * 4));
  record.context.putImageData(new ImageData(rgba, record.width, record.height), 0, 0);
  record.canvas.style.opacity = opacity.toFixed(4);
  return mode === "cycle";
}

function renderPhasers(now) {
  if (motionQuery.matches) return false;
  if (phaserResizePending) {
    phaserTargets.filter((record) => record.canvas).forEach((record) => allocatePhaser(record, true));
    phaserResizePending = false;
  }
  let running = false;
  phaserTargets.forEach((record) => {
    if (!record.canvas || (!record.near && !phaserHeld)) return;
    running = paintPhaser(record, now) || running;
  });
  return running && !phaserHeld;
}

function phaseForMechanism(name, progress) {
  if (name === "horizon") return progress < 0.20 ? "contract" : progress < 0.40 ? "execute" : progress < 0.60 ? "audit" : progress < 0.80 ? "dead-end" : "verified";
  if (name === "context") return progress < 0.34 ? "roots" : progress < 0.67 ? "route" : "library";
  if (name === "memory") return progress < 0.25 ? "observe" : progress < 0.50 ? "commit" : progress < 0.75 ? "retrieve" : "complete";
  if (name === "runtime") return progress < 0.34 ? "source" : progress < 0.67 ? "adapt" : "fan-out";
  if (name === "creator") return progress < 0.34 ? "name" : progress < 0.67 ? "assemble" : "ready";
  return "ready";
}

function applyMechanismStates() {
  mechanismElements.forEach((element, name) => {
    if (name === "facts") return;
    let progress = 1;
    let phase = phaseForMechanism(name, progress);
    if (mechanismHeld?.name === name) {
      progress = mechanismHeld.progress;
      phase = mechanismHeld.phase;
    } else if (!phoneQuery.matches && !motionQuery.matches) {
      const rect = element.getBoundingClientRect();
      progress = clamp((innerHeight * 0.82 - rect.top) / Math.max(innerHeight * 0.72, rect.height * 0.72), 0, 1);
      phase = phaseForMechanism(name, progress);
    }
    element.dataset.mechanismPhase = phase;
    element.style.setProperty("--mechanism-progress", progress.toFixed(4));
    if (name === "context") {
      const route = progress < 0.34 ? rangeProgress(progress, 0, 0.34) * 0.25 : progress < 0.67 ? 0.25 + rangeProgress(progress, 0.34, 0.67) * 0.5 : 0.75 + rangeProgress(progress, 0.67, 1) * 0.25;
      element.style.setProperty("--context-route", route.toFixed(4));
      element.style.setProperty("--context-packet", progress.toFixed(4));
    }
  });
}

function cubicEase(value) {
  const x1 = 0.2;
  const y1 = 0.8;
  const x2 = 0.2;
  const y2 = 1;
  const sample = (t, a, b) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  const slope = (t, a, b) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t ** 2;
  let t = clamp(value, 0, 1);
  for (let index = 0; index < 6; index += 1) {
    const delta = sample(t, x1, x2) - value;
    const derivative = slope(t, x1, x2);
    if (Math.abs(derivative) < 0.00001) break;
    t = clamp(t - delta / derivative, 0, 1);
  }
  return sample(t, y1, y2);
}

function cycleProgress(now, duration, delay = 0) {
  const elapsed = Math.max(0, now - delay);
  return (elapsed % duration) / duration;
}

function keyed(progress, frames, ease = true) {
  if (progress <= frames[0][0]) return frames[0][1];
  for (let index = 1; index < frames.length; index += 1) {
    const [at, value] = frames[index];
    const [fromAt, fromValue] = frames[index - 1];
    if (progress <= at) {
      const local = (progress - fromAt) / Math.max(.0001, at - fromAt);
      const amount = ease ? cubicEase(local) : local;
      return fromValue + (value - fromValue) * amount;
    }
  }
  return frames.at(-1)[1];
}

function setTransform(element, transform, opacity) {
  if (!element) return;
  element.style.transform = transform;
  if (opacity !== undefined) element.style.opacity = opacity.toFixed(4);
}

function allocateHeroField() {
  if (!hero || !heroField || !heroFieldContext) return;
  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
  const scale = dpr / 2;
  heroFieldWidth = Math.max(64, Math.round(hero.clientWidth * scale));
  heroFieldHeight = Math.max(64, Math.round(hero.clientHeight * scale));
  heroField.width = heroFieldWidth;
  heroField.height = heroFieldHeight;
  const offscreen = document.createElement("canvas");
  offscreen.width = heroFieldWidth;
  offscreen.height = heroFieldHeight;
  const context = offscreen.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  context.textBaseline = "alphabetic";
  const heroRect = hero.getBoundingClientRect();
  heroHeading?.querySelectorAll("span").forEach((line) => {
    const rect = line.getBoundingClientRect();
    const style = getComputedStyle(line);
    context.font = `${style.fontStyle} ${style.fontWeight} ${Number.parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
    if ("letterSpacing" in context) context.letterSpacing = `${Number.parseFloat(style.letterSpacing) * scale}px`;
    if ("fontKerning" in context) context.fontKerning = style.fontKerning;
    const metrics = context.measureText(line.textContent);
    const ascent = metrics.actualBoundingBoxAscent || Number.parseFloat(style.fontSize) * scale * .78;
    const descent = metrics.actualBoundingBoxDescent || Number.parseFloat(style.fontSize) * scale * .2;
    const baseline = (rect.top - heroRect.top) * scale + ((rect.height * scale - ascent - descent) / 2) + ascent;
    context.fillText(line.textContent, (rect.left - heroRect.left) * scale, baseline);
  });
  const alpha = context.getImageData(0, 0, heroFieldWidth, heroFieldHeight).data;
  heroFieldMask = new Float32Array(heroFieldWidth * heroFieldHeight);
  for (let index = 0; index < heroFieldMask.length; index += 1) heroFieldMask[index] = alpha[index * 4 + 3] > 96 ? 1 : .25;
  heroFieldImage = heroFieldContext.createImageData(heroFieldWidth, heroFieldHeight);
  heroFieldReady = true;
  heroFieldStartedAt = performance.now();
  heroFieldDrift = 0;
  heroFieldLastBucket = -1;
  heroFieldHeldStamp = "";
}

function paintHeroField(now) {
  if (!heroFieldReady || !heroFieldVisible || !heroFieldMask || !heroFieldImage) return false;
  const heldAge = parityHeld?.kind === "hero" ? { cold: .18, charge: .82, retained: 60 }[parityHeld.phase] : parityHeld?.kind === "plate" ? 60 : null;
  const age = heldAge ?? (now - heroFieldStartedAt) / 1000;
  const heldStamp = heldAge === null ? "" : `${parityHeld.kind}:${parityHeld.phase}`;
  const bucket = heldAge === null ? (age <= 2.2 ? Math.floor(age * 60) : 132 + Math.floor((age - 2.2) * 1000 / 90)) : -1;
  if ((heldAge === null && bucket === heroFieldLastBucket) || (heldAge !== null && heldStamp === heroFieldHeldStamp)) return heldAge === null;
  heroFieldLastBucket = bucket;
  heroFieldHeldStamp = heldStamp;
  if (heldAge === null && age > 2.2) heroFieldDrift = Math.floor((age - 2.2) * 1000 / 90);
  const drawAge = age > 2.2 ? 60 : age;
  const rowAge = (y) => drawAge - (y / heroFieldHeight) * .9;
  const field = heroState(heroFieldMask, heroFieldWidth, heroFieldHeight, phaserNoise, rowAge, heroFieldDrift);
  fieldToRGBA(field, heroFieldImage.data);
  heroFieldContext.putImageData(heroFieldImage, 0, 0);
  heroHeading?.classList.toggle("charging", drawAge <= .75);
  return heldAge === null;
}

function renderSystemPlate(now) {
  if (!systemPlate || !heroFieldVisible) return false;
  const phases = ["human", "route-context", "context", "route-model", "model", "route-proof", "proof-check", "return", "repair", "retained"];
  const heldIndex = parityHeld?.kind === "plate" ? phases.indexOf(parityHeld.phase) : parityHeld?.kind === "hero" ? phases.length - 1 : -1;
  const duration = 13000;
  const progress = heldIndex >= 0 ? heldIndex / (phases.length - 1) : cycleProgress(now - systemPlateStartedAt, duration);
  const index = heldIndex >= 0 ? heldIndex : Math.min(phases.length - 1, Math.floor(progress * phases.length));
  const local = heldIndex >= 0 ? 1 : (progress * phases.length) % 1;
  const phase = phases[index];
  systemPlate.dataset.platePhase = phase;
  const stationOrder = ["human", "system", "model", "proof"];
  const activeByPhase = { human: 0, "route-context": 0, context: 1, "route-model": 1, model: 2, "route-proof": 2, "proof-check": 3, return: 3, repair: 2, retained: 4 };
  const activeIndex = activeByPhase[phase];
  stationOrder.forEach((name, stationIndex) => {
    const element = plateStations.get(name);
    let state = stationIndex < activeIndex ? "retained" : stationIndex === activeIndex ? "active" : "idle";
    if (phase === "return" && (name === "proof" || name === "model")) state = "return";
    if (phase === "repair" && name === "model") state = "active";
    if (phase === "retained") state = "retained";
    element.dataset.state = state;
    element.style.setProperty("--plate-scan", state === "active" || state === "return" ? local.toFixed(4) : "0");
  });
  const routeNames = ["human-system", "system-model", "model-proof"];
  const routePhaseNames = ["route-context", "route-model", "route-proof"];
  routeNames.forEach((name, routeIndex) => {
    const element = plateRoutes.get(name);
    const active = phase === routePhaseNames[routeIndex];
    const retained = activeIndex > routeIndex;
    element.style.setProperty("--route-progress", active ? local.toFixed(4) : retained ? "1" : "0");
    element.style.setProperty("--route-opacity", active ? "1" : retained ? ".35" : ".12");
    element.querySelectorAll("span").forEach((packet) => { packet.style.background = retained && !active ? "var(--kept)" : "var(--live)"; });
  });
  const returnProgress = phase === "return" ? local : phase === "repair" ? 1 : 0;
  systemPlate.style.setProperty("--return-dash", (1 - returnProgress).toFixed(4));
  systemPlate.style.setProperty("--return-opacity", returnProgress > 0 ? "1" : "0");
  systemPlate.style.setProperty("--return-packet-opacity", phase === "return" ? "1" : "0");
  if (plateReturnPath && plateReturnPacket && phase === "return") {
    const point = linePoint([[38, 278], [38, 194], [24, 180], [10, 180], [10, 104], [24, 90], [38, 90], [38, 22]], local);
    plateReturnPacket.setAttribute("transform", `translate(${(point[0] - 38).toFixed(2)} ${(point[1] - 278).toFixed(2)})`);
  }
  return heldIndex < 0;
}

function sectionTime(section, now) {
  if (!section || !parityVisibility.get(section)) return null;
  return now - (parityStartTimes.get(section) || now);
}

function renderContext(now) {
  const section = mechanismElements.get("context");
  const elapsed = sectionTime(section, now);
  if (elapsed === null) return false;
  const heldProgress = mechanismHeld?.name === "context" ? mechanismHeld.progress : parityHeld?.kind === "context" ? parityHeld.progress : null;
  contextPackets.forEach((packet, index) => {
    const progress = heldProgress ?? cycleProgress(elapsed, 4800, index * 550);
    const travel = keyed(progress, [[0, 0], [.14, 0], [.54, phoneQuery.matches ? 36 : 46], [.76, phoneQuery.matches ? 36 : 46], [1, 0]]);
    const opacity = keyed(progress, [[0, .2], [.14, .2], [.54, 1], [.76, 1], [1, .2]]);
    const charge = keyed(progress, [[0, 0], [.14, 0], [.54, 1], [.76, 1], [1, 0]]);
    packet.style.setProperty("--context-route-travel", `${travel.toFixed(2)}px`);
    packet.style.setProperty("--context-route-opacity", opacity.toFixed(4));
    packet.style.setProperty("--context-route-charge", charge.toFixed(4));
    packet.style.backgroundColor = charge >= .5 ? "var(--ink-kept)" : "var(--blue)";
  });
  return heldProgress === null;
}

function renderMemory(now) {
  const section = mechanismElements.get("memory");
  const elapsed = sectionTime(section, now);
  if (elapsed === null) return false;
  const heldProgress = mechanismHeld?.name === "memory" ? mechanismHeld.progress : null;
  const progress = (duration, delay = 0) => heldProgress ?? cycleProgress(elapsed, duration, delay);
  const waves = progress(7200);
  setTransform(memoryWaves, `scaleY(${keyed(waves, [[0, 1], [.5, .82], [1, 1]]).toFixed(4)})`, keyed(waves, [[0, .62], [.5, 1], [1, .62]]));
  const observe = progress(5800);
  setTransform(memoryObservePacket, `translate(${keyed(observe, [[0, -138], [.18, -138], [.52, 0], [.78, 0], [1, -138]]).toFixed(2)}px, ${keyed(observe, [[0, -64], [.18, -64], [.52, 0], [.78, 0], [1, -64]]).toFixed(2)}px)`, keyed(observe, [[0, .2], [.18, .2], [.52, 1], [.78, 1], [1, .2]]));
  const tunnel = progress(7400);
  setTransform(memoryTunnel, `scaleX(${keyed(tunnel, [[0, 1], [.5, .82], [1, 1]]).toFixed(4)})`, keyed(tunnel, [[0, .45], [.5, .9], [1, .45]]));
  const write = progress(6200);
  setTransform(memoryWritePacket, `translateX(${keyed(write, [[0, 0], [.14, 0], [.52, 108], [.78, 108], [1, 0]]).toFixed(2)}px)`, keyed(write, [[0, .4], [.14, .4], [.52, 1], [.78, 1], [1, .4]]));
  setTransform(memoryCommitPacket, `scale(${keyed(write, [[0, .72], [.42, 1], [.78, 1], [1, .72]]).toFixed(4)})`, keyed(write, [[0, .28], [.42, 1], [.78, 1], [1, .28]]));
  const orbit = progress(7400);
  setTransform(memoryOrbit, `scaleX(${keyed(orbit, [[0, 1], [.52, .86], [1, 1]]).toFixed(4)})`, keyed(orbit, [[0, .38], [.52, 1], [.82, 1], [1, .38]]));
  const recall = progress(6000);
  setTransform(memoryRecallPacket, `translateX(${keyed(recall, [[0, 0], [.18, 0], [.54, -42], [.80, -42], [1, 0]]).toFixed(2)}px)`, keyed(recall, [[0, .32], [.18, .32], [.54, 1], [.80, 1], [1, .32]]));
  const replayElapsed = heldProgress === null ? elapsed % (memoryConsoleLines.length * 460 + 3600) : heldProgress * memoryConsoleLines.length * 460;
  const shown = heldProgress === 1 ? memoryConsoleLines.length : Math.min(memoryConsoleLines.length, Math.floor(replayElapsed / 460) + 1);
  memoryConsoleLines.forEach((line, index) => {
    line.style.opacity = index < shown ? "1" : ".2";
    line.style.transform = index < shown ? "none" : "translateY(8px)";
    line.classList.toggle("cur", index === shown - 1 && shown < memoryConsoleLines.length);
  });
  return heldProgress === null;
}

function renderRuntime(now) {
  const section = mechanismElements.get("runtime");
  const elapsed = sectionTime(section, now);
  if (elapsed === null) return false;
  const heldProgress = mechanismHeld?.name === "runtime" ? mechanismHeld.progress : null;
  const incoming = heldProgress ?? cycleProgress(elapsed, 5800);
  const outputA = heldProgress ?? cycleProgress(elapsed, 5800);
  const outputB = heldProgress ?? cycleProgress(elapsed, 5800, 350);
  const renderPacket = (element, progress, distance, stops) => setTransform(element, `translateX(${keyed(progress, stops.map(([at, value]) => [at, value * distance])).toFixed(2)}px)`, keyed(progress, [[0, .2], [.10, .2], [.42, 1], [.72, 1], [1, .2]]));
  renderPacket(runtimePacketIn, incoming, 31, [[0, 0], [.10, 0], [.42, 1], [.72, 1], [1, 0]]);
  renderPacket(runtimePacketA, outputA, 27, [[0, 0], [.34, 0], [.66, 1], [.84, 1], [1, 0]]);
  renderPacket(runtimePacketB, outputB, 27, [[0, 0], [.34, 0], [.66, 1], [.84, 1], [1, 0]]);
  return heldProgress === null;
}

function renderCreator(now) {
  const section = mechanismElements.get("creator");
  const elapsed = sectionTime(section, now);
  if (elapsed === null) return false;
  const heldProgress = mechanismHeld?.name === "creator" ? mechanismHeld.progress : null;
  const progressFor = (duration, delay = 0) => heldProgress ?? cycleProgress(elapsed, duration, delay);
  const button = progressFor(5200);
  const charged = button >= .36 && button <= .68;
  [creatorGo, creatorReadyTag].forEach((element) => { if (element) element.style.fill = charged ? "var(--blue)" : "var(--green)"; });
  const tunnel = progressFor(7000);
  setTransform(creatorTunnel, `scaleX(${keyed(tunnel, [[0, 1], [.5, .82], [1, 1]]).toFixed(4)})`, keyed(tunnel, [[0, .45], [.5, 1], [1, .45]]));
  creatorInstallRows.forEach((row, index) => {
    const progress = progressFor(5800, index * 450);
    row.style.opacity = keyed(progress, [[0, .22], [.18, .22], [.34, 1], [.76, 1], [1, .22]], false).toFixed(4);
  });
  const left = progressFor(5800);
  setTransform(creatorPacketOne, `translateX(${keyed(left, [[0, 0], [.12, 0], [.48, 90], [.76, 90], [1, 0]]).toFixed(2)}px)`, keyed(left, [[0, .3], [.12, .3], [.48, 1], [.76, 1], [1, .3]]));
  const right = progressFor(5800);
  setTransform(creatorPacketTwo, `translateX(${keyed(right, [[0, 0], [.18, 0], [.52, -82], [.80, -82], [1, 0]]).toFixed(2)}px)`, keyed(right, [[0, .3], [.18, .3], [.52, 1], [.80, 1], [1, .3]]));
  const ready = progressFor(6400);
  setTransform(creatorOrbit, `scaleX(${keyed(ready, [[0, 1], [.52, .86], [.82, .86], [1, 1]]).toFixed(4)})`, keyed(ready, [[0, .38], [.52, 1], [.82, 1], [1, .38]]));
  return heldProgress === null;
}

function renderOriginalParity(now) {
  let running = paintHeroField(now);
  running = renderSystemPlate(now) || running;
  running = renderContext(now) || running;
  running = renderMemory(now) || running;
  running = renderRuntime(now) || running;
  running = renderCreator(now) || running;
  return running && !document.hidden;
}

function render(now = performance.now()) {
  frame = 0;
  const scrollRunning = advanceSmoothScroll(now);
  const { index, progress } = derivedState();
  const camera = cameraFor(index);
  currentIndex = index;
  currentProgress = progress;

  beats.forEach((beat, beatIndex) => beat.classList.toggle("is-active", beatIndex === index));
  applyNodeStates(index);
  applyCamera(camera);
  applyEngineeringProgress();
  applyMemoryHandoff();
  applyMechanismStates();

  const staticLoop = !loopDesktopQuery.matches || motionQuery.matches;
  const loopProgress = loopHeld ? loopHeldProgress : staticLoop ? 1 : clamp((scrollY - loopTop) / Math.max(1, loopRange), 0, 1);
  applyLoopProgress(loopProgress);

  const nextBeat = `${String(index + 1).padStart(2, "0")} · ${beatNames[index].replaceAll("-", " ").toUpperCase()}`;
  const nextState = beats[index]?.querySelector(".beat-index")?.textContent?.split("·").at(-1)?.trim() || "ACTIVE";
  if (mapBeat && mapBeat.textContent !== nextBeat) mapBeat.textContent = nextBeat;
  if (mapState && mapState.textContent !== nextState) mapState.textContent = nextState;

  const pending = frameResolvers;
  frameResolvers = [];
  pending.forEach((resolve) => resolve());
  const phasersRunning = phaserHeld ? renderPhasers(now) : heroFieldReady && (now - heroFieldStartedAt) < 2400 ? false : renderPhasers(now);
  if (renderOriginalParity(now) || phasersRunning || scrollRunning) schedule();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

function finishFiniteAnimations() {
  document.getAnimations().forEach((animation) => {
    const endTime = animation.effect?.getComputedTiming().endTime;
    if (Number.isFinite(endTime)) animation.finish();
  });
}

function textWidth(line) {
  const range = document.createRange();
  range.selectNodeContents(line);
  const width = range.getBoundingClientRect().width;
  range.detach();
  return width;
}

function fitLoopLines() {
  loopLines.forEach((line) => line.style.removeProperty("--loop-scale"));
  loopLines.forEach((line) => {
    const cell = line.closest("li");
    if (!cell) return;
    const style = getComputedStyle(cell);
    const target = cell.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - 2;
    const naturalWidth = textWidth(line);
    const scale = naturalWidth > 0 ? Math.min(1, target / naturalWidth) : 1;
    line.style.setProperty("--loop-scale", scale.toFixed(4));
  });
}

function fitHeading(heading) {
  const lines = [...heading.querySelectorAll("[data-fit-line]")];
  if (lines.length < 2) return;

  lines.forEach((line) => line.style.removeProperty("font-size"));
  const target = Math.max(0, heading.clientWidth - 1);
  if (!target) return;

  const bases = lines.map((line) => Number.parseFloat(getComputedStyle(line).fontSize));
  const naturalWidths = lines.map(textWidth);
  lines.forEach((line, index) => {
    const naturalWidth = naturalWidths[index];
    if (naturalWidth > 0) line.style.fontSize = `${bases[index] * target / naturalWidth}px`;
  });

  // Letter spacing and font shaping do not scale perfectly linearly. Correct
  // the residual after the first write so every actual glyph run meets target.
  const firstPassWidths = lines.map(textWidth);
  lines.forEach((line, index) => {
    const width = firstPassWidths[index];
    const size = Number.parseFloat(line.style.fontSize);
    if (width > 0 && size > 0) line.style.fontSize = `${size * target / width}px`;
  });

  const state = { target, widths: lines.map(textWidth) };
  headingFitStates.set(heading, state);
  if (heading === heroHeading) heroFitState = state;
  heading.dataset.fitReady = "true";
  invalid = true;
  schedule();
}

function fitDisplayHeadings() {
  fittedHeadings.forEach(fitHeading);
  fitLoopLines();
}

function finishSkillReveal(card) {
  card.dataset.printState = "complete";
}

function queueSkillReveal(card) {
  if (card.dataset.printState !== "waiting") return;
  if (motionQuery.matches) {
    finishSkillReveal(card);
    return;
  }
  card.dataset.printState = "printing";
  const blockCount = card.querySelectorAll("[data-print-block]").length;
  const gap = Number.parseInt(card.style.getPropertyValue("--print-gap"), 10) || 80;
  const timer = setTimeout(() => {
    revealTimers.delete(timer);
    finishSkillReveal(card);
  }, blockCount * gap + 320);
  revealTimers.add(timer);
}

const printGaps = [82, 108, 74, 96, 68, 116, 88, 102];
skillCards.forEach((card, cardIndex) => {
  const blocks = [...card.querySelectorAll(".skill-body > *")];
  const terminal = document.createElement("span");
  terminal.className = "skill-terminal mono";
  terminal.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "skill-terminal-label";
  label.textContent = card.querySelector(".skill-index")?.textContent || "SKILL";
  terminal.append(label);
  for (let step = 0; step < 5; step += 1) {
    const cell = document.createElement("i");
    cell.style.setProperty("--terminal-step", String(step + 1));
    terminal.append(cell);
  }
  const cursor = document.createElement("i");
  cursor.className = "terminal-cursor";
  terminal.append(cursor);
  card.querySelector(".skill-head")?.append(terminal);

  card.style.setProperty("--print-gap", `${printGaps[cardIndex % printGaps.length]}ms`);
  blocks.forEach((block, blockIndex) => {
    block.dataset.printBlock = "";
    block.style.setProperty("--print-step", String(blockIndex + 1));
  });
  card.dataset.printState = motionQuery.matches ? "complete" : "waiting";
});

const skillObserver = !motionQuery.matches && "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        queueSkillReveal(entry.target);
      });
    }, { rootMargin: "0px 0px -18% 0px", threshold: 0.01 })
  : null;

if (skillObserver) skillCards.forEach((card) => skillObserver.observe(card));
else skillCards.forEach(finishSkillReveal);

const storyMechanismObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !phoneQuery.matches) return;
        entry.target.closest(".beat")?.classList.add("is-seen");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -18% 0px", threshold: 0.01 })
  : null;

function syncStoryMechanismObserver() {
  storyMechanismObserver?.disconnect();
  if (motionQuery.matches) {
    beats.forEach((beat) => beat.classList.add("is-seen"));
    return;
  }
  if (phoneQuery.matches) storyMechanisms.forEach((mechanism) => {
    if (!mechanism.closest(".beat")?.classList.contains("is-seen")) storyMechanismObserver?.observe(mechanism);
  });
}

syncStoryMechanismObserver();

const phaserObserver = !motionQuery.matches && "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = phaserById.get(entry.target.dataset.phaserTarget);
        if (!record) return;
        record.near = entry.isIntersecting;
        if (entry.isIntersecting && !record.canvas) {
          allocatePhaser(record);
          record.startedAt = performance.now();
        }
      });
      schedule();
    }, { rootMargin: "45% 0px", threshold: 0.01 })
  : null;

const revealOrder = new Map(revealElements.map((element, index) => [element, index]));
let revealQueued = 0;
let revealLast = 0;
const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      [...entries].sort((a, b) => revealOrder.get(a.target) - revealOrder.get(b.target)).forEach((entry) => {
        if (!entry.isIntersecting || entry.target.classList.contains("on")) return;
        if (motionQuery.matches || held || mechanismHeld) {
          entry.target.classList.add("on");
          revealObserver.unobserve(entry.target);
          return;
        }
        const now = performance.now();
        const wait = now - revealLast > 400 ? 0 : (revealQueued += 1) * 70;
        if (now - revealLast > 400) revealQueued = 0;
        revealLast = now;
        const timer = setTimeout(() => {
          entry.target.classList.add("on");
          revealTimers.delete(timer);
        }, wait);
        revealTimers.add(timer);
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .15 })
  : null;
if (revealObserver && !motionQuery.matches) revealElements.forEach((element) => revealObserver.observe(element));
else revealElements.forEach((element) => element.classList.add("on"));

const chargeHeadings = [...document.querySelectorAll(".context-section h2, .memory-lead h2, .runtime-copy h2, .creator-heading h2")];
const chargeObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || motionQuery.matches || held || mechanismHeld) return;
        entry.target.classList.add("excited");
        const timer = setTimeout(() => {
          entry.target.classList.remove("excited");
          revealTimers.delete(timer);
        }, 260);
        revealTimers.add(timer);
        chargeObserver.unobserve(entry.target);
      });
    }, { threshold: .9 })
  : null;
chargeHeadings.forEach((heading) => chargeObserver?.observe(heading));

const parityObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      const now = performance.now();
      entries.forEach((entry) => {
        parityVisibility.set(entry.target, entry.isIntersecting);
        if (entry.isIntersecting && !parityStartTimes.has(entry.target)) parityStartTimes.set(entry.target, now);
      });
      schedule();
    }, { rootMargin: "18% 0px", threshold: .01 })
  : null;
paritySections.forEach((section) => parityObserver?.observe(section));

const heroObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      heroFieldVisible = entries.some((entry) => entry.isIntersecting);
      if (heroFieldVisible) schedule();
    }, { threshold: .01 })
  : null;
if (hero) heroObserver?.observe(hero);

function onScroll() { if (!(held && loopHeld)) schedule(); }
let heroResizeTimer = 0;
function onResize() {
  invalid = true;
  phaserResizePending = true;
  clearTimeout(heroResizeTimer);
  heroResizeTimer = setTimeout(() => {
    allocateHeroField();
    schedule();
  }, 120);
  schedule();
}
function onModeChange() {
  if (motionQuery.matches) skillCards.forEach(finishSkillReveal);
  syncStoryMechanismObserver();
  invalid = true;
  schedule();
}

function onMotionModeChange() {
  configureSmoothScroll();
  onModeChange();
}

addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onResize, { passive: true });
phoneQuery.addEventListener("change", onModeChange);
loopDesktopQuery.addEventListener("change", onModeChange);
motionQuery.addEventListener("change", onMotionModeChange);
const headingObserver = fittedHeadings.length && "ResizeObserver" in window
  ? new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const width = entry.contentRect.width ?? 0;
        const state = headingFitStates.get(entry.target);
        if (!state || Math.abs(width - state.target - 1) > 0.5) fitHeading(entry.target);
      });
    })
  : null;
fittedHeadings.forEach((heading) => headingObserver?.observe(heading));
fitDisplayHeadings();
document.fonts.ready.then(() => {
  fitDisplayHeadings();
  allocateHeroField();
  if (!motionQuery.matches) {
    const heroPhaser = phaserById.get("hero");
    allocatePhaser(heroPhaser);
    heroPhaser.startedAt = performance.now() + 2400;
    phaserTargets.forEach((record) => phaserObserver?.observe(record.target));
  }
  onResize();
});

function resolveBeat(value) {
  const index = typeof value === "number" ? value : beatNames.indexOf(value);
  if (!Number.isInteger(index) || index < 0 || index >= beatNames.length) throw new RangeError(`Unknown capture beat: ${value}`);
  return index;
}

function settle() {
  return new Promise((resolve) => {
    frameResolvers.push(resolve);
    schedule();
  });
}

window.__capture = {
  loopBeats: [...loopBeatNames],
  phaserTargets: [...phaserById.keys()],
  mechanismHolds: Object.keys(mechanismHoldPhases),
  showpieceHolds: ["hero-cold", "hero-charge", "hero-retained", "plate-human", "plate-route-context", "plate-context", "plate-route-model", "plate-model", "plate-route-proof", "plate-proof-check", "plate-return", "plate-repair", "plate-retained"],
  async showpieceHold(name) {
    const [kind, ...phaseParts] = name.split("-");
    const phase = phaseParts.join("-");
    const validHero = kind === "hero" && ["cold", "charge", "retained"].includes(phase);
    const validPlate = kind === "plate" && ["human", "route-context", "context", "route-model", "model", "route-proof", "proof-check", "return", "repair", "retained"].includes(phase);
    if (!validHero && !validPlate) throw new RangeError(`Unknown showpiece hold: ${name}`);
    parityHeld = { kind, phase };
    phaserHeld = { id: "hero", state: "idle" };
    root.classList.add("capture-showpiece-held");
    await document.fonts.ready;
    fitDisplayHeadings();
    scrollTo({ top: 0, behavior: "instant" });
    heroFieldVisible = true;
    await settle();
    await settle();
    return this.state();
  },
  async showpieceThaw() {
    parityHeld = null;
    phaserHeld = null;
    root.classList.remove("capture-showpiece-held");
    heroFieldStartedAt = performance.now();
    systemPlateStartedAt = performance.now();
    await settle();
    return this.state();
  },
  async hold(beat) {
    heldIndex = resolveBeat(beat);
    held = true;
    root.classList.add("capture-held");
    await document.fonts.ready;
    fitDisplayHeadings();
    const heldBeat = beats[heldIndex];
    if (heldBeat) scrollTo({ top: heldBeat.getBoundingClientRect().top + scrollY - (instrumentRail?.getBoundingClientRect().height || 0) - 16, behavior: "instant" });
    if (instrumentRail) {
      instrumentRail.style.position = "absolute";
      instrumentRail.style.top = `${scrollY}px`;
      instrumentRail.style.transform = "translateZ(0)";
    }
    await settle();
    finishFiniteAnimations();
    skillCards.filter((card) => card.dataset.printState === "printing").forEach(finishSkillReveal);
    await settle();
    cameraGroup?.getBoundingClientRect();
    return this.state();
  },
  freeze() {
    smoothScroll?.stop();
    return this.hold(currentIndex);
  },
  thaw() {
    held = false;
    root.classList.remove("capture-held");
    if (instrumentRail) {
      instrumentRail.style.removeProperty("position");
      instrumentRail.style.removeProperty("top");
      instrumentRail.style.removeProperty("transform");
    }
    smoothScroll?.start();
    invalid = true;
    return settle();
  },
  step(index) { return this.hold(index); },
  async loopHold(name) {
    if (!Object.hasOwn(loopHoldProgress, name)) throw new RangeError(`Unknown loop capture beat: ${name}`);
    loopHeld = true;
    loopHeldName = name;
    loopHeldProgress = loopHoldProgress[name];
    root.classList.add("capture-loop-held");
    await document.fonts.ready;
    fitDisplayHeadings();
    if (loopSequence) scrollTo({ top: loopSequence.getBoundingClientRect().top + scrollY, behavior: "instant" });
    await settle();
    await settle();
    loopProof?.getBoundingClientRect();
    return this.state();
  },
  async loopHoldProgress(progress) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new RangeError(`Loop capture progress must be between 0 and 1: ${progress}`);
    loopHeld = true;
    loopHeldProgress = progress;
    loopHeldName = loopNameFor(progress);
    root.classList.add("capture-loop-held");
    await document.fonts.ready;
    fitDisplayHeadings();
    if (loopSequence) scrollTo({ top: loopSequence.getBoundingClientRect().top + scrollY, behavior: "instant" });
    await settle();
    await settle();
    loopProof?.getBoundingClientRect();
    return this.state();
  },
  async loopThaw() {
    loopHeld = false;
    loopHeldName = "loop-static";
    loopHeldProgress = 1;
    root.classList.remove("capture-loop-held");
    invalid = true;
    await settle();
    return this.state();
  },
  async phaserHold(target, state) {
    if (!phaserById.has(target)) throw new RangeError(`Unknown phaser target: ${target}`);
    if (!["idle", "sweep-mid", "handoff"].includes(state)) throw new RangeError(`Unknown phaser state: ${state}`);
    await document.fonts.ready;
    fitDisplayHeadings();
    const record = phaserById.get(target);
    allocatePhaser(record, true);
    record.near = true;
    phaserHeld = { id: target, state };
    if (target === "hero") {
      parityHeld = { kind: "hero", phase: "retained" };
      phaserOwnsParity = true;
      root.classList.add("capture-showpiece-held");
    }
    await settle();
    if (target === "hero") finishFiniteAnimations();
    await settle();
    return this.state();
  },
  async phaserThaw() {
    phaserHeld = null;
    if (phaserOwnsParity) {
      parityHeld = null;
      phaserOwnsParity = false;
      root.classList.remove("capture-showpiece-held");
    }
    phaserTargets.forEach((record) => { record.startedAt = performance.now(); });
    await settle();
    return this.state();
  },
  async mechanismHold(name) {
    if (!Object.hasOwn(mechanismHoldPhases, name)) throw new RangeError(`Unknown mechanism capture hold: ${name}`);
    const [mechanismName, phase, progress] = mechanismHoldPhases[name];
    const element = mechanismElements.get(mechanismName);
    mechanismHeld = { hold: name, name: mechanismName, phase, progress };
    root.classList.add("capture-mechanism-held");
    await document.fonts.ready;
    fitDisplayHeadings();
    if (element) scrollTo({ top: element.getBoundingClientRect().top + scrollY - (instrumentRail?.getBoundingClientRect().height || 0) - 12, behavior: "instant" });
    await settle();
    element?.querySelectorAll(".reveal").forEach((item) => item.classList.add("on"));
    element?.querySelectorAll(".excited").forEach((item) => item.classList.remove("excited"));
    finishFiniteAnimations();
    await settle();
    element?.getBoundingClientRect();
    return this.state();
  },
  async mechanismThaw() {
    mechanismHeld = null;
    root.classList.remove("capture-mechanism-held");
    invalid = true;
    await settle();
    return this.state();
  },
  phaserMetrics(target) {
    const record = phaserById.get(target);
    if (!record?.canvas || !record.mask) return { allocated: false };
    const pixels = record.context.getImageData(0, 0, record.width, record.height).data;
    let insideSignal = 0;
    let outsideSignal = 0;
    for (let index = 0; index < record.mask.length; index += 1) {
      if (pixels[index * 4 + 3] === 0) continue;
      if (record.mask[index] > 0.01) insideSignal += 1;
      else outsideSignal += 1;
    }
    const targetRect = record.target.getBoundingClientRect();
    const canvasRect = record.canvas.getBoundingClientRect();
    return {
      allocated: true,
      insideSignal,
      outsideSignal,
      targetRect: targetRect.toJSON(),
      canvasRect: canvasRect.toJSON(),
      pixels: record.canvas.toDataURL(),
    };
  },
  state() {
    const camera = cameras[held ? heldIndex : currentIndex];
    return { held, beat: beatNames[held ? heldIndex : currentIndex], index: held ? heldIndex : currentIndex, progress: held ? heldIndex / (beatNames.length - 1) : currentProgress, route: beatNames[held ? heldIndex : currentIndex], camera: { ...camera }, engineeringProgress: Number(storyHeading?.style.getPropertyValue("--engineering-progress") || 1), memoryHandoffProgress, scroll: { enabled: Boolean(smoothScroll), stopped: smoothScroll?.isStopped ?? false, moving: smoothScroll?.isScrolling === "smooth" }, heroFit: { target: heroFitState.target, widths: [...heroFitState.widths] }, loop: { ...loopCurrentState, held: loopHeld, beat: loopHeld ? loopHeldName : loopCurrentName, progress: loopHeld ? loopHeldProgress : loopCurrentProgress }, phaser: { held: phaserHeld ? { ...phaserHeld } : null, canvases: phaserTargets.filter((record) => record.canvas).map((record) => record.id) }, mechanism: mechanismHeld ? { ...mechanismHeld } : null, showpiece: parityHeld ? { ...parityHeld } : null };
  },
};

addEventListener("pagehide", () => {
  removeEventListener("scroll", onScroll);
  removeEventListener("resize", onResize);
  phoneQuery.removeEventListener("change", onModeChange);
  loopDesktopQuery.removeEventListener("change", onModeChange);
  motionQuery.removeEventListener("change", onMotionModeChange);
  headingObserver?.disconnect();
  skillObserver?.disconnect();
  storyMechanismObserver?.disconnect();
  phaserObserver?.disconnect();
  revealObserver?.disconnect();
  chargeObserver?.disconnect();
  parityObserver?.disconnect();
  heroObserver?.disconnect();
  clearTimeout(heroResizeTimer);
  revealTimers.forEach(clearTimeout);
  revealTimers.clear();
  smoothScroll?.destroy();
  smoothScroll = null;
  delete window.__lenis;
  if (frame) cancelAnimationFrame(frame);
  delete window.__capture;
}, { once: true });

configureSmoothScroll();
schedule();
