// Entry point — oci-reference prototype scaffold.
// Boots Lenis-lite smooth scroll and the authoritative WebGL module (webgl.mjs:
// oracle halftone/dither + pointer-trail ping-pong), then hands both to the DOM
// controller (scripts/dom.mjs), which owns every interactive component:
// line-split reveals, accordion, roll CTAs, menu overlay, custom scrollbar.
import { LenisLite } from "./lenis-lite.mjs";
import { initWebGL } from "./webgl.mjs";
import { init } from "./dom.mjs";

const root = document.documentElement;

/* ---------- smooth scroll (exponential decay tuned to the measured settle band) ---------- */
let webgl = null;
let lastFrameT = performance.now();
let lastScrollY = window.scrollY;

const lenis = new LenisLite({
  lerp: 0.07, // 0.6-1.66s band, design-contract Scroll physics
  // Frame fan-out: dom.mjs chains its scrollbar logic onto this hook. Delta and
  // px/frame velocity feed the trail pass; hero-band zoom mapping lives in webgl.mjs.
  onFrame: (y) => {
    const now = performance.now();
    const delta = (now - lastFrameT) / 1000;
    const velocity = y - lastScrollY;
    lastFrameT = now;
    lastScrollY = y;
    if (webgl) webgl.update(delta, y, velocity);
  },
});

/* ---------- WebGL halftone scene ---------- */
// Authoritative module owns the halftone + trail passes. Init is async only
// because the hero source may still be decoding; failure leaves the bone
// background plus the .no-webgl fallback class.
initWebGL(document.getElementById("gl"), lenis, "./images/hero-source.png")
  .then((api) => {
    webgl = api;
    webgl.update(0, window.scrollY, 0); // first frame immediately
  })
  .catch((err) => {
    console.warn("[oci-reference] WebGL unavailable — static poster fallback engaged.", err);
    root.classList.add("no-webgl");
  });

/* ---------- DOM layer (scrollbar chains onto lenis.onFrame above) ---------- */
const dom = init(lenis, webgl);

// Dev-server teardown hook; no-op under plain static hosting.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dom.destroy();
    if (webgl) webgl.destroy();
  });
}
