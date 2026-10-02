# Harness Concept Smooth Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jagged wheel scrolling on the Harness Firmware concept page with smooth, controlled inertia while preserving native touch, keyboard, anchors, nested comparison scrolling, reduced motion, and deterministic capture controls.

**Architecture:** Vendor the exact Lenis 1.3.25 ES module already locked by `package-lock.json`, then drive it from the page's existing `render(now)` requestAnimationFrame authority with `autoRaf: false`. Lenis smooths wheel input only. Touch remains native, reduced motion destroys the instance, the horizontal memory comparison opts out, and the existing capture handle gains scroll freeze and state reporting.

**Tech Stack:** Static HTML, CSS, browser ES modules, Lenis 1.3.25, Node test runner, Playwright capture harness

---

### Task 1: Pin the scroll contract in tests

**Files:**
- Modify: `tests/harness-firmware-concept.test.mjs`

- [ ] **Step 1: Add failing source-contract assertions**

```js
assert.equal(await exists("public/harness-firmware/concept/vendor/lenis.mjs"), true);
assert.match(js, /import Lenis from "\.\/vendor\/lenis\.mjs"/);
assert.match(js, /new Lenis\(\{[\s\S]*?autoRaf:\s*false[\s\S]*?lerp:\s*0\.085[\s\S]*?wheelMultiplier:\s*0\.85/);
assert.match(js, /smoothScroll\.raf\(now\)/);
assert.match(js, /smoothScroll\?\.destroy\(\)/);
assert.match(html, /class="memory-comparison-scroll"[^>]*data-lenis-prevent/);
assert.match(css, /\.lenis\.lenis-smooth\s*\{\s*scroll-behavior:\s*auto/);
```

- [ ] **Step 2: Run the concept test and confirm failure**

Run: `node --test tests/harness-firmware-concept.test.mjs`

Expected: FAIL because the vendored module and Lenis integration do not exist yet.

### Task 2: Vendor the locked Lenis build

**Files:**
- Create: `public/harness-firmware/concept/vendor/lenis.mjs`
- Create: `public/harness-firmware/concept/vendor/lenis-LICENSE.txt`

- [ ] **Step 1: Obtain the exact lockfile version**

Run: `npm pack lenis@1.3.25 --pack-destination .tmp/lenis-pack`

Expected: `.tmp/lenis-pack/lenis-1.3.25.tgz`, matching the lockfile integrity.

- [ ] **Step 2: Extract only the browser module and license**

```powershell
tar -xf .tmp/lenis-pack/lenis-1.3.25.tgz -C .tmp/lenis-unpack package/dist/lenis.mjs package/LICENSE
Copy-Item .tmp/lenis-unpack/package/dist/lenis.mjs public/harness-firmware/concept/vendor/lenis.mjs
Copy-Item .tmp/lenis-unpack/package/LICENSE public/harness-firmware/concept/vendor/lenis-LICENSE.txt
```

- [ ] **Step 3: Verify the vendored module declares version 1.3.25**

Run: `rg -n '1.3.25' public/harness-firmware/concept/vendor/lenis.mjs`

Expected: one version declaration.

### Task 3: Integrate Lenis with the existing animation authority

**Files:**
- Modify: `public/harness-firmware/concept/concept.js`
- Modify: `public/harness-firmware/concept/concept.css`
- Modify: `public/harness-firmware/concept/index.html`

- [ ] **Step 1: Import and configure wheel smoothing**

```js
import Lenis from "./vendor/lenis.mjs";

let smoothScroll = null;

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
    anchors: { offset: -92, lerp: 0.095 },
  });
  smoothScroll.on("virtual-scroll", schedule);
  smoothScroll.on("scroll", schedule);
  window.__lenis = smoothScroll;
}
```

- [ ] **Step 2: Advance Lenis from `render(now)`**

```js
function advanceSmoothScroll(now) {
  if (!smoothScroll) return false;
  smoothScroll.raf(now);
  return smoothScroll.isScrolling === "smooth";
}

function render(now = performance.now()) {
  frame = 0;
  const scrollRunning = advanceSmoothScroll(now);
  // existing render work
  if (renderOriginalParity(now) || phasersRunning || scrollRunning) schedule();
}
```

- [ ] **Step 3: Preserve CSS and nested-scroll behavior**

```css
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-stopped { overflow: clip; }
.lenis [data-lenis-prevent] { overscroll-behavior: contain; }
```

Add `data-lenis-prevent` to `.memory-comparison-scroll` so its horizontal interaction remains native.

- [ ] **Step 4: Reconfigure on reduced-motion changes and destroy on pagehide**

```js
function onModeChange() {
  configureSmoothScroll();
  // existing mode-change work
}

addEventListener("pagehide", () => {
  smoothScroll?.destroy();
  delete window.__lenis;
  // existing teardown
}, { once: true });
```

- [ ] **Step 5: Extend deterministic capture state**

```js
freeze() {
  smoothScroll?.stop();
  return this.hold(currentIndex);
},
thaw() {
  smoothScroll?.start();
  // existing capture release work
},
state() {
  return {
    // existing capture state
    scroll: {
      enabled: Boolean(smoothScroll),
      stopped: smoothScroll?.isStopped ?? false,
      moving: smoothScroll?.isScrolling === "smooth",
    },
  };
}
```

### Task 4: Verify behavior and tune the feel

**Files:**
- Modify: `tests/harness-firmware-concept.test.mjs`
- Use: `scripts/capture-harness-firmware-concept.mjs`

- [ ] **Step 1: Run source checks**

Run: `node --check public/harness-firmware/concept/concept.js`

Expected: PASS.

Run: `node --test tests/harness-firmware-concept.test.mjs`

Expected: 11 tests pass.

- [ ] **Step 2: Verify desktop wheel interpolation**

At 1440 by 900, inject one wheel delta and sample `scrollY` over at least eight animation frames. Expected: monotonic movement across multiple frames, no single-frame jump to the target, and final movement within 15 percent of `deltaY * 0.85`.

- [ ] **Step 3: Verify input parity**

Check wheel, PageDown, Space, arrow keys, anchor links, browser history restoration, and the horizontal memory comparison. Expected: wheel is smoothed; keyboard, touch, and nested scrolling remain native and usable.

- [ ] **Step 4: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce`. Expected: `window.__lenis` is absent, scrolling remains native, and all content is visible.

- [ ] **Step 5: Grade responsive captures**

Capture 1440 by 900 and 390 by 844. Confirm zero horizontal overflow, stable sticky sections, no shifted section tops, and no failed local assets.

No commit step is included because this session has no explicit commit authorization.
