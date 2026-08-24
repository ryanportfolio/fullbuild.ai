// dom.mjs — SINGLE DOM controller for the oci-reference prototype.
// Owns every interactive component: accordion, roll CTAs, overlay menu,
// line-split reveals, custom scrollbar, back-to-top. Durations/easings live in
// styles/tokens.css; state classes live in styles/motion.css — this module only
// builds structures and toggles state (design-contract.md, Motion spec).
//
// Measured values honored here (evidence/gap-captures.json, timings.json):
//   - line-split: opacity 0->1 + ty 50.59px->0, 458-499ms ease-out, ~80ms stagger,
//     REVERSIBLE on scroll-out, fires as the block crosses the lower viewport.
//   - accordion: grid-template-rows 0fr<->1fr bloom (~450-500ms), aria-expanded,
//     icon rotates 135deg (CSS-side).
//   - roll CTA: two stacked duplicate labels in an overflow-hidden anchor;
//     outgoing dy -44.78px + fade, incoming dy 64.61px->0, 282ms, reverses on exit.
//   - menu: panel translateX 100%->0 over 750ms decel; html.menu-open;
//     lenis.stop() while open (html.lenis-stopped equivalent); ESC/outside close.

const SCROLLBAR_IDLE_MS = 1000; // fade out after 1s idle
const MIN_THUMB_PX = 40;

export function init(lenis, webgl) {
  const root = document.documentElement;
  /** @type {Array<() => void>} */
  const disposers = [];

  /* ---------- line-split reveal ---------- */
  const splitBlocks = buildLineSplits();
  const disposeReveal = initRevealObserver(splitBlocks);
  if (disposeReveal) disposers.push(disposeReveal);
  /* ---------- step-card staircase reveal (scrolled into view) ---------- */
  const disposeStepReveal = initStepCardReveal();
  if (disposeStepReveal) disposers.push(disposeStepReveal);

  /* ---------- accordion ---------- */
  disposers.push(initAccordion());

  /* ---------- roll CTAs ---------- */
  disposers.push(initRollButtons());

  /* ---------- menu overlay ---------- */
  disposers.push(initMenu(lenis));

  /* ---------- custom scrollbar + frame plumbing ---------- */
  const disposeScrollbar = initScrollbar(lenis, webgl);
  if (disposeScrollbar) disposers.push(disposeScrollbar);

  /* ---------- back-to-top ---------- */
  disposers.push(initBackToTop(lenis));

  /* ---------- scrolled nav state (links hide, MENU box appears) ----------
     plus intro staircase parallax: ref shows the cutout only in the y1200 band
     (03-hero-1200-ref) and NOT at y900 (04-intro-ref) — the mask rides the
     scroll plane, translating 600px -> 0 across the hero-to-intro transition. */
  const steps = document.querySelector(".intro-steps");
  const onScroll = () => {
    root.classList.toggle("scrolled", window.scrollY > 60);
    if (steps) {
      const t = Math.min(1, Math.max(0, (window.scrollY - 900) / 300));
      steps.style.transform = "translateY(" + Math.round((1 - t) * 600) + "px)";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  disposers.push(() => window.removeEventListener("scroll", onScroll));

  /* ---------- testimonials carousel ---------- */
  disposers.push(initTestimonials());

  // Arm the first-load entry cascade after splits exist (hydration-order echo).
  requestAnimationFrame(() => root.classList.add("js-ready"));

  return {
    destroy() {
      for (const fn of disposers.splice(0)) {
        try { fn(); } catch { /* keep tearing down */ }
      }
      if (root.classList.contains("menu-open")) {
        root.classList.remove("menu-open");
        try { lenis.start(); } catch { /* lenis already gone */ }
      }
    },
  };
}

/* ---------- line-split: wrap .seed children into masked, staggered lines ----------
   Decorative stack carries aria-hidden so screen readers hear clean headings;
   original seeds become .sr-only text (contract Accessibility). Without JS the
   seeds render as plain visible blocks (motion.css gates hiding behind html.js). */
function buildLineSplits() {
  /** @type {Element[]} */
  const blocks = [];
  document.querySelectorAll("[data-split]").forEach((block) => {
    const seeds = Array.from(block.querySelectorAll(":scope > .seed"));
    if (!seeds.length || block.querySelector(":scope > .lines")) return; // idempotent
    const stack = document.createElement("span");
    stack.className = "lines";
    stack.setAttribute("aria-hidden", "true");
    seeds.forEach((seed, i) => {
      seed.classList.add("sr-only"); // keep original text for AT
      const line = document.createElement("span");
      line.className = "line";
      const inner = document.createElement("span");
      // The visible node must INHERIT the seed's typography classes (.display,
      // .hero-title-line, .services-title, ...). R9-iter1 defect M1: leaving them
      // on the sr-only seed rendered every display title at body size.
      inner.className = "line-inner " + seed.className.split(/\s+/).filter((c) => c && c !== "seed" && c !== "sr-only").join(" ");
      inner.textContent = seed.textContent;
      inner.style.setProperty("--line-i", String(i)); // stagger index * --stagger-lines
      line.appendChild(inner);
      stack.appendChild(line);
    });
    block.appendChild(stack);
    blocks.push(block);
  });
  return blocks;
}

/* ---------- reversible scroll-coupled reveals (contract Motion row 2) ----------
   Enter viewport -> .is-revealed added; leave -> removed (re-hides). Fires as the
   block top crosses the lower viewport edge; exact offset unsampled in evidence. */
function initRevealObserver(blocks) {
  if (!blocks.length) return null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("is-revealed", entry.isIntersecting));
    },
    // -12%: blocks fully inside the viewport at load (hero tagline sits under the
    // display title) must reveal without scrolling; -20% left them hidden at top.
    { rootMargin: "0px 0px -12% 0px", threshold: 0 }
  );
  blocks.forEach((block) => observer.observe(block));
  return () => observer.disconnect();
}

/* ---------- step-card staircase reveal (scrolled into view) ----------
   Cards stagger in as they cross the lower viewport: starting state per --step-i
   (translateY + rotate toward final), ending .is-revealed. Reversible on scroll-out.
   Self-clones handles the nth-child(4) we add in HTML. (contract Motion row Sticky/step cards) */
function initStepCardReveal() {
  const cards = Array.from(document.querySelectorAll('.step-card'));
  if (!cards.length) return null;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-revealed', entry.isIntersecting));
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
  cards.forEach((card, i) => {
    card.style.setProperty('--step-i', String(i));
    observer.observe(card);
  });
  return () => observer.disconnect();
}

/* ---------- accordion rows (services): exclusive-open, aria kept in sync ----------
   Height animates via grid-template-rows 0fr<->1fr (NOT max-height) so the ease-out
   curve stays smooth; transition itself lives in motion.css. Native <details>
   elements would need no wiring and are left to the browser. Closed panels get
   inert so the LEARN MORE link inside is not tabbable while clipped. */
function initAccordion() {
  const items = Array.from(document.querySelectorAll(".acc-item, [data-accordion]"));
  /** @type {Array<[Element, () => void]>} */
  const bound = [];

  const setItemOpen = (item, open) => {
    item.classList.toggle("open", open);
    const row = item.querySelector(".acc-row");
    const panel = item.querySelector(".acc-panel");
    if (row) row.setAttribute("aria-expanded", String(open));
    if (panel) {
      panel.setAttribute("aria-hidden", String(!open));
      panel.toggleAttribute("inert", !open);
    }
  };

  items.forEach((item) => {
    const row = item.querySelector(".acc-row");
    if (!row) return;
    const onClick = () => {
      const willOpen = !item.classList.contains("open");
      items.forEach((other) => { if (other !== item) setItemOpen(other, false); }); // one open at a time
      setItemOpen(item, willOpen);
    };
    row.addEventListener("click", onClick);
    bound.push([row, onClick]);
    setItemOpen(item, item.classList.contains("open")); // sync initial state
  });
  // Ref ships the FIRST services row expanded by default (r9-iter1 04-services-ref).
  if (items[0]) setItemOpen(items[0], true);

  return () => {
    for (const [row, onClick] of bound) row.removeEventListener("click", onClick);
    items.forEach((item) => {
      const panel = item.querySelector(".acc-panel");
      if (panel) panel.removeAttribute("inert");
    });
  };
}

/* ---------- roll CTAs: duplicate-label roll (gap-captures.json buttonRoll) ----------
   Builder guarantees the static two-label stack on any [data-roll]/.cta-roll that
   ships without one; hover/focus toggles .is-hovered (motion.css keys it alongside
   :hover/:focus-visible). Transitions are pure CSS on transform/opacity. */
function initRollButtons() {
  document.querySelectorAll("[data-roll], .cta-roll").forEach((el) => {
    el.classList.add("roll");
    if (el.querySelector(".roll-stack")) return;
    const text = (el.textContent || "").trim();
    if (!text) return;
    el.textContent = "";
    const stack = document.createElement("span");
    stack.className = "roll-stack";
    const outgoing = document.createElement("span");
    outgoing.className = "label outgoing";
    outgoing.textContent = text;
    const incoming = document.createElement("span");
    incoming.className = "label incoming";
    incoming.setAttribute("aria-hidden", "true");
    incoming.textContent = text;
    stack.append(outgoing, incoming);
    el.appendChild(stack);
  });

  /** @type {Array<[Element, () => void, () => void]>} */
  const bound = [];
  document.querySelectorAll(".roll").forEach((el) => {
    const on = () => el.classList.add("is-hovered");
    const off = () => el.classList.remove("is-hovered");
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("focusin", on);
    el.addEventListener("focusout", off);
    bound.push([el, on, off]);
  });

  return () => {
    for (const [el, on, off] of bound) {
      el.removeEventListener("pointerenter", on);
      el.removeEventListener("pointerleave", off);
      el.removeEventListener("focusin", on);
      el.removeEventListener("focusout", off);
      el.classList.remove("is-hovered");
    }
  };
}

/* ---------- menu overlay: slide-in, scroll lock, ESC + outside-click close ---------- */
function initMenu(lenis) {
  const root = document.documentElement;
  const btn = document.getElementById("menuBtn") || document.querySelector(".menu-btn");
  const panel = document.getElementById("menuPanel");
  if (!btn || !panel) return () => {};

  const isOpen = () => root.classList.contains("menu-open");
  const setOpen = (open) => {
    root.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    panel.setAttribute("aria-hidden", String(!open));
    if (open) lenis.stop(); else lenis.start(); // html.lenis-stopped equivalent
  };

  const onButtonClick = () => setOpen(!isOpen());
  const onKeyDown = (event) => {
    if (event.key === "Escape" && isOpen()) setOpen(false);
  };
  const onDocumentClick = (event) => {
    if (!isOpen()) return;
    const target = event.target;
    if (target instanceof Element && (target.closest("#menuPanel") || target.closest("#menuBtn"))) return;
    setOpen(false); // outside click
  };
  const onPanelClick = (event) => {
    if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
  };

  btn.addEventListener("click", onButtonClick);
  panel.addEventListener("click", onPanelClick);
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", onDocumentClick);
  panel.setAttribute("aria-hidden", "true");

  return () => {
    btn.removeEventListener("click", onButtonClick);
    panel.removeEventListener("click", onPanelClick);
    window.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("click", onDocumentClick);
    if (isOpen()) {
      root.classList.remove("menu-open");
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
      lenis.start();
    }
  };
}

/* ---------- custom scrollbar thumb + Lenis frame fan-out ----------
   Thumb height/position track scroll progress every frame; visibility fades in on
   scroll or pointer movement and out after IDLE_HIDE_MS idle. Also forwards the
   frame to the WebGL scene (hero band scrollY 0-1200 per canvas-scroll-diff.json). */
function initScrollbar(lenis, webgl) {
  const bar = document.querySelector(".scrollbar");
  const thumb = document.querySelector(".scrollbar-thumb");
  if (!bar || !thumb) return () => {};

  let hideTimer = 0;
  let lastY = -1;
  const show = () => {
    bar.classList.add("is-visible");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => bar.classList.remove("is-visible"), SCROLLBAR_IDLE_MS);
  };
  const onPointerMove = () => show();
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const previousOnFrame = typeof lenis.onFrame === "function" ? lenis.onFrame : null;
  lenis.onFrame = (y, max) => {
    if (previousOnFrame) previousOnFrame(y, max);
    const vh = window.innerHeight;
    const thumbH = Math.max(MIN_THUMB_PX, Math.round(vh * (vh / Math.max(max + vh, 1))));
    const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    thumb.style.height = thumbH + "px";
    thumb.style.top = Math.round(progress * (vh - thumbH)) + "px";
    if (y !== lastY) { lastY = y; show(); } // activity fade, idle timer resets per move
    if (webgl && typeof webgl.setScroll === "function") webgl.setScroll(y / 1200);
  };

  return () => {
    window.clearTimeout(hideTimer);
    window.removeEventListener("pointermove", onPointerMove);
    bar.classList.remove("is-visible");
    lenis.onFrame = previousOnFrame || (() => {});
  };
}

/* ---------- back-to-top links ride Lenis instead of native jump ---------- */
function initBackToTop(lenis) {
  /** @type {Array<[Element, (event: MouseEvent) => void]>} */
  const bound = [];
  document.querySelectorAll(".js-back-to-top").forEach((a) => {
    const onClick = (event) => {
      event.preventDefault();
      lenis.scrollTo(0);
    };
    a.addEventListener("click", onClick);
    bound.push([a, onClick]);
  });
  return () => {
    for (const [a, onClick] of bound) a.removeEventListener("click", onClick);
  };
}

/* ---------- testimonials carousel: 3 demo quotes, circular prev/next arrows ----------
   Ref shows client wordmark + quote + 01/03 counter with up/down circle arrows
   (probe-testi-a/b). Demo copy only; counter is zero-padded NN / NN. */
function initTestimonials() {
  const quote = document.getElementById("testiQuote");
  const client = document.getElementById("testiClient");
  const count = document.getElementById("testiCount");
  const who = document.getElementById("testiWho");
  const prev = document.getElementById("testiPrev");
  const next = document.getElementById("testiNext");
  if (!quote || !prev || !next) return () => {};

  const quotes = [
    {
      client: "Meridian Bank",
      text: "\u201cWorking with Bluestone feels like adding a permit department to our own staff \u2014 submissions land complete and approvals stop being a surprise.\u201d",
      who: "R. Alvarez, VP Operations<br />Meridian Bank",
    },
    {
      client: "Harborview Schools",
      text: "\u201cOur bond program cleared reviews on a schedule for the first time. Bluestone kept every tracker current and every reviewer answered.\u201d",
      who: "D. Chen, Facilities Director<br />Harborview Schools",
    },
    {
      client: "Corridor Industrial",
      text: "\u201cThey turned a violation notice into a two-week closeout plan and stayed on the phone with the agency until it was signed.\u201d",
      who: "M. Okafor, Managing Partner<br />Corridor Industrial",
    },
  ];
  let index = 0;
  const pad = (n) => String(n).padStart(2, "0");
  const render = () => {
    const q = quotes[index];
    quote.innerHTML = q.text;
    if (client) client.textContent = q.client;
    if (count) count.textContent = pad(index + 1) + " / " + pad(quotes.length);
    if (who) who.innerHTML = q.who;
  };
  const onPrev = () => { index = (index - 1 + quotes.length) % quotes.length; render(); };
  const onNext = () => { index = (index + 1) % quotes.length; render(); };
  prev.addEventListener("click", onPrev);
  next.addEventListener("click", onNext);
  return () => {
    prev.removeEventListener("click", onPrev);
    next.removeEventListener("click", onNext);
  };
}