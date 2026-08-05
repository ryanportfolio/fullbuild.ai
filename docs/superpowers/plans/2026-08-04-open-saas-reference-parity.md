# Open SaaS Reference Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a rights-safe `/prototype/open-saas` static prototype matching https://opensaas.sh/ in layout, responsive behavior, interaction states, motion character, and light/dark presentation.

**Architecture:** Add a zero-build static prototype with semantic HTML, a single contract-driven stylesheet, and a small progressive-enhancement module. Reuse no source code or proprietary media. Register the clean route and gallery entry, then verify with static contract tests and matched Playwright screenshots.

**Tech Stack:** HTML, CSS, vanilla JavaScript modules, inline SVG, Node test runner, Playwright capture

**Execution status:** Complete. All six tasks passed their acceptance checks on 2026-08-04. The final matched capture matrix is recorded in `.tmp/reference-forensics/open-saas/design-contract.md`.

---

### Task 1: Register and contract-test the prototype

**Files:**
- Modify: `next.config.mjs`
- Modify: `public/prototype/index.html`
- Create: `tests/prototype-open-saas.test.mjs`

- [ ] **Step 1: Write the failing contract test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Open SaaS reference prototype ships its complete contract', async () => {
  const [config, directory, page, styles, script] = await Promise.all([
    read('next.config.mjs'),
    read('public/prototype/index.html'),
    read('public/prototype/open-saas/index.html'),
    read('public/prototype/open-saas/styles.css'),
    read('public/prototype/open-saas/app.mjs'),
  ]);
  assert.match(config, /source: '\/prototype\/open-saas'/);
  assert.equal((directory.match(/href="\/prototype\/open-saas"/g) ?? []).length, 1);
  for (const section of ['hero', 'customers', 'story', 'features', 'roadmap', 'testimonials', 'faq']) {
    assert.match(page, new RegExp(`data-section="${section}"`));
  }
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /localStorage/);
  assert.doesNotMatch(page + styles + script, /\u2014/);
});
```

- [ ] **Step 2: Run the test and confirm missing files fail**

Run: `node --test tests/prototype-open-saas.test.mjs`

Expected: FAIL because `public/prototype/open-saas/index.html` does not exist.

- [ ] **Step 3: Add the rewrite and gallery card**

Add `{ source: '/prototype/open-saas', destination: '/prototype/open-saas/index.html' }` beside static prototype rewrites and one numbered gallery row linking `/prototype/open-saas`.

### Task 2: Build semantic page structure and original artwork

**Files:**
- Create: `public/prototype/open-saas/index.html`
- Create: `public/prototype/open-saas/assets/fonts/Anybody[wdth,wght].ttf`

- [ ] **Step 1: Create the semantic shell**

Create a skip link, promo bar, banner navigation, `main`, and footer. Main contains exactly these contracts in order:

```html
<section data-section="hero"></section>
<section data-section="customers"></section>
<section data-section="story"></section>
<section data-section="features"></section>
<section data-section="roadmap"></section>
<section data-section="testimonials"></section>
<section data-section="faq"></section>
```

- [ ] **Step 2: Author original visual substitutes**

Use inline SVG and HTML/CSS cards for the hero orbit, AI constellation, auth form, pricing stack, analytics cards, feature art, progress bars, and abstract avatar initials. Do not reference `opensaas.sh`, its media, Wasp marks, or user avatars.

- [ ] **Step 3: Copy the repo-owned variable font**

Copy `public/prototype/fault-line/assets/fonts/Anybody[wdth,wght].ttf` into the new prototype’s `assets/fonts/` directory so the prototype remains self-contained.

### Task 3: Reconstruct the visual system and responsive geometry

**Files:**
- Create: `public/prototype/open-saas/styles.css`

- [ ] **Step 1: Write the binding contract header and tokens**

Declare warm-white, ink, navy, yellow, orange, dark-ground, powder-blue, borders, and semantic roadmap colors. State GLIDE, REVEAL, TILT, signature orbit, bans, and risk before the first CSS rule.

- [ ] **Step 2: Match desktop geometry**

Implement the 56px promo, 81px navigation, 1216px rail, 60/60 hero, 7/5 hero split, alternating 520px story columns, three-column bento grid, four-column roadmap, three-column testimonials, and 8,800px target page rhythm at 1280 to 1440 widths.

- [ ] **Step 3: Match responsive transformations**

At 1024 preserve split story rows with reduced gutters. At 768 keep the hero text full width while story rows remain two-column. Below 640 hide hero art, open a right drawer, stack story and features, convert roadmap to horizontal snap, and target the source’s 12,800px mobile rhythm without horizontal overflow.

- [ ] **Step 4: Add dark and reduced-motion states**

Use `[data-theme="dark"]` token swaps. Reduced motion must resolve reveals and the orbit to visible, static end states, never hide content with `animation: none` alone.

### Task 4: Add progressive behavior

**Files:**
- Create: `public/prototype/open-saas/app.mjs`

- [ ] **Step 1: Add theme persistence**

Read `open-build-theme`, apply `data-theme`, synchronize every `[data-theme-toggle]` control, and store the user’s explicit choice.

- [ ] **Step 2: Add mobile navigation**

Toggle `aria-expanded`, `[data-open]`, the scrim, drawer, and body scroll lock. Escape, scrim click, and navigation activation close the drawer.

- [ ] **Step 3: Add one-shot reveals**

Use one `IntersectionObserver` at `rootMargin: '0px 0px -18% 0px'`, add `.is-visible` once, and bypass hiding when reduced motion is active.

- [ ] **Step 4: Expose deterministic capture state**

Expose `window.__openBuildCapture.freeze()` and `.thaw()` to pause and resume orbit/reveal animation classes for deterministic screenshots.

### Task 5: Run static verification

**Files:**
- Test: `tests/prototype-open-saas.test.mjs`

- [ ] **Step 1: Run focused contract test**

Run: `node --test tests/prototype-open-saas.test.mjs`

Expected: PASS with one passing test.

- [ ] **Step 2: Run all prototype tests**

Run: `node --test tests/prototype-*.test.mjs`

Expected: all tests pass.

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck` then `npm run build`.

Expected: both exit 0. Lint is unavailable because this repository has no ESLint installation.

### Task 6: Capture, compare, and refine until dry

**Files:**
- Create: `.tmp/reference-forensics/open-saas/capture-local.mjs`
- Modify as defects require: `public/prototype/open-saas/index.html`, `public/prototype/open-saas/styles.css`, `public/prototype/open-saas/app.mjs`

- [ ] **Step 1: Serve on a fresh port and sentinel-check**

Run `node scripts/serve-prototype.mjs --port 4317`, verify the process command line belongs to this worktree, and confirm `Open Build` exists in loaded `textContent`.

- [ ] **Step 2: Capture the matched matrix**

Capture 390x844, 768x900, 1024x900, 1280x900, and 1440x900 full pages plus hero, menu, FAQ, dark, and reduced-motion states into `.tmp/reference-forensics/open-saas/local/`.

- [ ] **Step 3: Grade every frame**

Compare source and local at the same viewport and state. Check rail alignment, page height, section offsets, type scale, card density, crop, overflow, drawer geometry, FAQ state, dark contrast, visible focus, no-JS content, console errors, and failed required assets.

- [ ] **Step 4: Iterate until no must-fix defects remain**

Each fix invalidates affected evidence. Recapture the affected viewport and update the acceptance matrix only after the defect disappears.
