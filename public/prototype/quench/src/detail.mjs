// quench · detail.mjs
// The satellite opens its cell. The pool zooms until it fills the viewport and
// its surface resolves into the halftone screen, then the cell's own words sit
// on top of it. One modal at a time: focus trapped, three ways out, page scroll
// held, pointer input to the metal cut while the cursor is out of sight.
//
// No frame loop of its own. The zoom, the lens and the dissolve are keyframes
// and the two canvases are painted once per open, so window.__quench.freeze()
// parks the whole transition with everything else on the page.

import { DISC_R } from "./bake.mjs";
import { STILL } from "./field.mjs";
import { screenParams, sampleGrid, paintScreen, hasLight } from "./halftone.mjs";

// Matches the 153vmax stack and the 75vmax lens in the stylesheet. The stack
// has to stay wider than the lens at every point of the zoom or the growing
// circle would run off its own image
const STACK = 1.53;
const SAMPLE = 0.84;  // of the cell square; must exceed 2 * DISC_R to cover the pool
const SCREEN_MAX = 2400;
const PLATE_MAX = 1400;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function px(v) {
  return Math.round(v * 10) / 10 + "px";
}

function text(el, value) {
  if (el) el.textContent = value;
}

// Only the animations on the element itself, never the subtree: the open pass
// is cancelled the moment the close pass starts, and a cancelled animation
// settles its promise, which would end the close before it played
function afterOwnAnimations(el, fn) {
  const list = el.getAnimations ? el.getAnimations() : [];
  if (!list.length) {
    fn();
    return;
  }
  let left = list.length;
  let done = false;
  const step = () => {
    left--;
    if (left <= 0 && !done) {
      done = true;
      fn();
    }
  };
  for (const a of list) a.finished.then(step, step);
}

export function createDetail(opts) {
  const o = opts || {};
  const root = document.querySelector(".detail");
  if (!root) return null;

  const lens = root.querySelector(".detail-lens");
  const plate = root.querySelector(".detail-plate");
  const screen = root.querySelector(".detail-screen");
  const col = root.querySelector(".detail-col");
  const scroller = root.querySelector(".detail-scroll");
  if (!lens || !col || !scroller) return null;

  const html = document.documentElement;
  const glCanvas = o.glCanvas || null;
  const reduced = o.reduced === true;
  const onChange = typeof o.onChange === "function" ? o.onChange : function () {};
  const stagesData = new Map();
  if (o.siteData && Array.isArray(o.siteData.stages)) {
    for (const s of o.siteData.stages) if (s && s.id) stagesData.set(s.id, s);
  }

  let openStage = null;
  let opener = null;
  let savedScroll = 0;

  function fillColumn(stage) {
    const id = stage.getAttribute("data-molten") || "";
    text(col.querySelector(".detail-index"), (stage.querySelector(".stage-index") || {}).textContent || "");
    text(col.querySelector(".detail-name"), (stage.querySelector(".stage-name") || {}).textContent || "");
    text(col.querySelector(".detail-state"), (stage.querySelector(".stage-state") || {}).textContent || "");

    const body = col.querySelector(".detail-body");
    if (body) {
      body.textContent = "";
      for (const p of stage.querySelectorAll(".stage-copy")) {
        const line = document.createElement("p");
        line.textContent = p.textContent;
        body.appendChild(line);
      }
    }

    // Facts, not claims: both rows are read straight out of the page's own
    // data block, which is what drives the render of this pool
    const specs = col.querySelector(".detail-specs");
    if (specs) {
      specs.textContent = "";
      const d = stagesData.get(id);
      if (d) {
        addSpec(specs, "state", String(d.state));
        if (typeof d.cap === "number") addSpec(specs, "set cap", d.cap.toFixed(2));
      }
    }
  }

  function addSpec(list, key, value) {
    const row = document.createElement("div");
    row.className = "detail-spec";
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    list.appendChild(row);
  }

  function measure(stage) {
    const disc = stage.querySelector(".cell-disc");
    if (!disc) return null;
    const r = disc.getBoundingClientRect();
    if (!(r.width > 8)) return null;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const side = STACK * Math.max(vw, vh);
    const sample = SAMPLE * r.width;
    return {
      vw,
      vh,
      side,
      sample,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      pool: DISC_R * r.width,
      k: sample / side
    };
  }

  // The state's own static plate, the same one the page draws for this disc
  // when there is no live metal. It is the hero wherever the pool cannot be
  // read back: no WebGL, or reduced motion, where the discs never render
  function applyPlate(stage) {
    const v = getComputedStyle(stage).getPropertyValue("--plate");
    if (v) root.style.setProperty("--detail-plate", v.trim());
  }

  function applyGeometry(g) {
    root.style.setProperty("--dtx", px(g.cx - g.vw / 2));
    root.style.setProperty("--dty", px(g.cy - g.vh / 2));
    root.style.setProperty("--dk", g.k.toFixed(4));
    root.style.setProperty("--dr0", px(g.pool));
    root.style.setProperty("--dcx", px(g.cx));
    root.style.setProperty("--dcy", px(g.cy));
  }

  // The pool as it stands right now, read back off the live buffer. The engine
  // keeps preserveDrawingBuffer on, so the last rendered frame is still there
  function sourceRect(g) {
    if (!glCanvas || !(glCanvas.width > 2) || !html.classList.contains("gl-live")) return null;
    const k = glCanvas.width / g.vw;
    const s = Math.min(g.sample * k, glCanvas.width, glCanvas.height);
    const x = Math.max(0, Math.min(glCanvas.width - s, (g.cx - g.sample / 2) * k));
    const y = Math.max(0, Math.min(glCanvas.height - s, (g.cy - g.sample / 2) * k));
    return { x, y, w: s, h: s };
  }

  function paint(stage, g) {
    if (reduced || !plate || !screen) return false;
    const rect = sourceRect(g);
    if (!rect) return false;
    const params = screenParams(STILL[stage.getAttribute("data-sculpt")] || 0);

    // Sample first: a dead read means no pool to screen, and the state's static
    // plate is a truer hero than a black rectangle
    const cells = Math.max(8, Math.round(g.side / params.pitch));
    const data = sampleGrid(glCanvas, rect, cells, cells);
    if (!hasLight(data)) return false;

    const pb = Math.round(Math.min(g.side, PLATE_MAX));
    plate.width = pb;
    plate.height = pb;
    const pc = plate.getContext("2d", { alpha: false });
    if (!pc) return false;
    pc.imageSmoothingQuality = "high";
    try {
      pc.drawImage(glCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, pb, pb);
    } catch (err) {
      return false;
    }

    const sb = Math.round(Math.min(g.side, SCREEN_MAX));
    screen.width = sb;
    screen.height = sb;
    return paintScreen(screen, data, cells, cells, params, sb) > 0;
  }

  function release() {
    for (const c of [plate, screen]) {
      if (!c) continue;
      c.width = 1;
      c.height = 1;
    }
    root.classList.remove("has-screen");
  }

  function lockScroll() {
    savedScroll = window.scrollY || 0;
    html.classList.add("detail-open");
  }

  function unlockScroll() {
    html.classList.remove("detail-open");
    if ((window.scrollY || 0) === savedScroll) return;
    // The page declares smooth scrolling, and a restore has to be a jump back
    // to where the reader was, not a ride
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, savedScroll);
    html.style.scrollBehavior = prev;
  }

  function focusables() {
    const list = [];
    for (const el of root.querySelectorAll(FOCUSABLE)) {
      if (el.offsetWidth > 0 || el.offsetHeight > 0) list.push(el);
    }
    return list;
  }

  function onKey(e) {
    if (!openStage) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const list = focusables();
    if (!list.length) {
      e.preventDefault();
      root.focus({ preventScroll: true });
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const at = document.activeElement;
    const inside = root.contains(at) && at !== root;
    if (e.shiftKey) {
      if (!inside || at === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(stage, trigger) {
    if (openStage) return;
    const g = measure(stage);
    if (!g) return;
    openStage = stage;
    opener = trigger || null;
    fillColumn(stage);
    applyPlate(stage);
    applyGeometry(g);
    root.classList.remove("is-closing");
    root.hidden = false;
    root.classList.toggle("has-screen", paint(stage, g));
    root.scrollTop = 0;
    void root.offsetWidth; // the keyframes must start from the geometry above
    root.classList.add("is-open");
    lockScroll();
    onChange(true);
    document.addEventListener("keydown", onKey, true);
    root.focus({ preventScroll: true });
  }

  function close() {
    if (!openStage) return;
    const back = opener;
    openStage = null;
    opener = null;
    document.removeEventListener("keydown", onKey, true);
    root.classList.add("is-closing");
    unlockScroll();
    onChange(false);
    if (back) back.focus({ preventScroll: true });
    void root.offsetWidth;
    afterOwnAnimations(root, () => {
      if (openStage) return; // reopened while the fade was still running
      root.classList.remove("is-open", "is-closing");
      root.hidden = true;
      release();
    });
  }

  for (const stage of document.querySelectorAll("#lifecycle .stage")) {
    const sat = stage.querySelector(".satellite");
    if (!sat) continue;
    sat.addEventListener("click", (e) => {
      e.preventDefault();
      open(stage, sat);
    });
  }

  for (const btn of root.querySelectorAll("[data-detail-close]")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });
  }

  return { close, isOpen: () => openStage !== null };
}
