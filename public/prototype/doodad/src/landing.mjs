// doodad · landing.mjs
// Owns RISE (section entrances), UNBLUR (word reveal), DRIFT (hero tile
// springs) and the deterministic capture hook. No scroll listeners anywhere:
// entrances are IntersectionObserver, the springs are a single rAF loop that
// only runs while the tile row is on screen.
//
// The <html> gates are set by the inline script in <head> so the page never
// flashes: data-js means the wheel owns its stage, data-motion means motion
// is allowed and the start states are armed.

const root = document.documentElement;
const motion = root.getAttribute("data-motion") === "on";
const hasIO = "IntersectionObserver" in window;

/* ------------------------------------------------------------------ RISE */

const risers = [...document.querySelectorAll("[data-anim]")];

if (motion && hasIO) {
  const riseWatch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-shown", "true");
        riseWatch.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" }
  );
  for (const el of risers) riseWatch.observe(el);
} else {
  for (const el of risers) el.setAttribute("data-shown", "true");
}

/* ---------------------------------------------------------------- UNBLUR */

const paragraph = document.querySelector("[data-reveal]");

if (paragraph) {
  // The spans are authored in the HTML, so the sentence is real text with or
  // without JS. All this adds is the stagger and the trigger.
  const words = [...paragraph.querySelectorAll("span")];
  words.forEach((word, i) => {
    word.style.transitionDelay = (i * 0.035).toFixed(3) + "s";
  });

  if (motion && hasIO) {
    const wordWatch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const word of words) word.setAttribute("data-shown", "true");
          wordWatch.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    wordWatch.observe(paragraph);
  } else {
    for (const word of words) word.setAttribute("data-shown", "true");
  }
}

/* ----------------------------------------------------------------- DRIFT */

const POS_S = 0.13;
const POS_D = 0.68;
const ROT_S = 0.1;
const ROT_D = 0.65;
const TILT_S = 0.1;
const TILT_D = 0.68;
const RANGE = 240;
const OFF_X = 28;
const OFF_Y = 32;
const MAX_ROT = 14;
const MAX_TILT = 18;
const TICK = 0.018;
const FRAME_MS = 1000 / 60;

const row = document.querySelector("[data-icons]");
const tiles = row ? [...row.querySelectorAll("[data-magnet]")] : [];

// Phases are seeded off the index, never random, so a frozen frame at a given
// clock value is byte-for-byte the same frame every run.
const springs = tiles.map((el, i) => ({
  el,
  x: 0, y: 0, vx: 0, vy: 0,
  rot: 0, vrot: 0,
  tiltX: 0, tiltY: 0, vTiltX: 0, vTiltY: 0,
  phase: (i / tiles.length) * Math.PI * 2
}));

let mouseX = -9999;
let mouseY = -9999;
let clock = 0;
let visible = false;
let frozen = false;
let frame = null;

function render() {
  // Every rect first, every transform after. Transforms never move a sibling's
  // border box, so the numbers are identical either way, but reading one tile
  // after writing the last one forces a synchronous layout per tile per frame.
  const centres = springs.map((s) => {
    const rect = s.el.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });

  springs.forEach((s, index) => {
    const dx = mouseX - centres[index].cx;
    const dy = mouseY - centres[index].cy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Idle float first: even with the cursor a mile away the hand breathes.
    let toX = Math.cos(clock * 0.7 + s.phase) * 2;
    let toY = Math.sin(clock + s.phase) * 5;
    let toRot = 0;
    let toTiltX = 0;
    let toTiltY = 0;
    let scale = 1;

    if (distance < RANGE && distance > 0) {
      const pull = 1 - distance / RANGE;
      toX += (dx / distance) * OFF_X * pull;
      toY += (dy / distance) * OFF_Y * pull;
      toRot = (dx / RANGE) * MAX_ROT;
      toTiltX = -(dy / distance) * MAX_TILT * pull;
      toTiltY = (dx / distance) * MAX_TILT * pull;
      scale = 1 + pull * 0.09;
    }

    s.vx = (s.vx + (toX - s.x) * POS_S) * POS_D;
    s.x += s.vx;
    s.vy = (s.vy + (toY - s.y) * POS_S) * POS_D;
    s.y += s.vy;
    s.vrot = (s.vrot + (toRot - s.rot) * ROT_S) * ROT_D;
    s.rot += s.vrot;
    s.vTiltX = (s.vTiltX + (toTiltX - s.tiltX) * TILT_S) * TILT_D;
    s.tiltX += s.vTiltX;
    s.vTiltY = (s.vTiltY + (toTiltY - s.tiltY) * TILT_S) * TILT_D;
    s.tiltY += s.vTiltY;

    s.el.style.transform =
      "translate(" + s.x.toFixed(2) + "px," + s.y.toFixed(2) + "px)" +
      " rotateZ(" + s.rot.toFixed(2) + "deg)" +
      " rotateX(" + s.tiltX.toFixed(2) + "deg)" +
      " rotateY(" + s.tiltY.toFixed(2) + "deg)" +
      " scale(" + scale.toFixed(3) + ")";
  });
}

function tick() {
  clock += TICK;
  render();
  frame = visible && !frozen ? requestAnimationFrame(tick) : null;
}

function start() {
  if (frame || frozen || !visible) return;
  frame = requestAnimationFrame(tick);
}

function stop() {
  if (!frame) return;
  cancelAnimationFrame(frame);
  frame = null;
}

if (motion && springs.length && hasIO) {
  document.addEventListener(
    "mousemove",
    (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
    },
    { passive: true }
  );

  new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting === visible) continue;
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    }
  }).observe(row);
}

/* --------------------------------------------------------- capture hook */

// Restarting a CSS animation from zero and then pausing it is what makes a
// frozen frame reproducible: animation-play-state on its own would park the
// loop at whatever offset the wall clock happened to be at.
function rewindLoops() {
  for (const el of document.querySelectorAll("[data-loop]")) {
    const kept = el.style.animation;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = kept;
  }
}

// freeze() rewinds rather than merely pausing. However many frames happened to
// run before the call, the springs go back to their seated state, the cursor is
// forgotten and the clock returns to zero, so freeze() + n * step(ms) draws the
// same frame on every run.
function rewindSprings() {
  clock = 0;
  mouseX = -9999;
  mouseY = -9999;
  for (const s of springs) {
    s.x = 0; s.y = 0; s.vx = 0; s.vy = 0;
    s.rot = 0; s.vrot = 0;
    s.tiltX = 0; s.tiltY = 0; s.vTiltX = 0; s.vTiltY = 0;
  }
}

window.__capture = {
  freeze() {
    frozen = true;
    stop();
    root.classList.add("is-frozen");
    rewindLoops();
    rewindSprings();
    render();
  },
  thaw() {
    frozen = false;
    root.classList.remove("is-frozen");
    rewindLoops();
    start();
  },
  step(ms = FRAME_MS) {
    clock += TICK * (ms / FRAME_MS);
    render();
  }
};
