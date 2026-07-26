# Loop Zero Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished `/prototype/loop-zero` experience and list it as prototype 07, using LocalStack's dark technical visual language with original FullBuild content and artwork.

**Architecture:** A dependency-free static prototype lives under `public/prototype/loop-zero/` and uses semantic HTML, one focused stylesheet, and one progressive-enhancement script. A Node built-in test guards the route, index entry, semantic sections, accessibility hooks, and motion fallback. Playwright captures fixed desktop and mobile matrices for visual refinement.

**Tech Stack:** HTML5, modern CSS, vanilla ES modules, SVG, Node `node:test`, Playwright

---

### Task 1: Acceptance contract

**Files:**
- Create: `tests/prototype-loop-zero.test.mjs`

- [x] **Step 1: Write the failing test**

Create a Node test that reads `public/prototype/loop-zero/index.html`, its stylesheet and script, plus `public/prototype/index.html`. Assert that prototype 07 exists once, the page has the planned hero/workflow/environments/proof/FAQ/footer landmarks, scripts load as modules, interactive FAQ controls expose `aria-expanded`, and CSS includes reduced-motion and mobile rules.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/prototype-loop-zero.test.mjs`

Expected: FAIL because `public/prototype/loop-zero/index.html` does not exist.

### Task 2: Static prototype

**Files:**
- Create: `public/prototype/loop-zero/index.html`
- Create: `public/prototype/loop-zero/src/styles.css`
- Create: `public/prototype/loop-zero/src/app.mjs`
- Create: `public/prototype/loop-zero/assets/favicon.svg`
- Modify: `public/prototype/index.html`

- [x] **Step 1: Build semantic page**

Implement the page structure and original FullBuild copy: announcement/header, hero with orbital execution visual, customer rail, outcomes, four-step workflow, environment cards, proof metrics, testimonial, FAQ, final CTA, and footer. Keep display headings free of periods and all copy free of em dashes.

- [x] **Step 2: Build the visual system**

Implement the measured reference system: `#101114` near-black ground, low-contrast grid, 58px desktop hero, lavender primary type, muted gray body type, indigo/cyan and violet glow, monospace controls, fine borders, wide section rhythm, and exact responsive behavior at 390px.

- [x] **Step 3: Add progressive motion**

Use IntersectionObserver for section reveals, pointer-based hero depth, FAQ disclosure controls, and a deterministic `window.__loopZeroCapture` handle for screenshot settling. Honor `prefers-reduced-motion`.

- [x] **Step 4: Add listing entry**

Add prototype `07`, title `Loop Zero`, original one-line description, and `/prototype/loop-zero` href to `public/prototype/index.html`.

- [x] **Step 5: Verify green**

Run: `node --test tests/prototype-loop-zero.test.mjs`

Expected: PASS with one passing test file and zero failures.

### Task 3: Visual refinement

**Files:**
- Modify as defects require: `public/prototype/loop-zero/index.html`
- Modify as defects require: `public/prototype/loop-zero/src/styles.css`
- Modify as defects require: `public/prototype/loop-zero/src/app.mjs`

- [x] **Step 1: Capture baseline matrix**

Start `node scripts/serve-prototype.mjs --port 4327`. Capture full page and hero/section shots at 1440×1000 and 390×844 into `.tmp/loop-zero/baseline/`.

- [x] **Step 2: Critique and fix**

Inspect every capture for legibility, collisions, dead space, inconsistent rhythm, mobile overflow, weak hierarchy, broken end states, and copy that can be cut. Apply fixes in user-visible-impact order.

- [x] **Step 3: Prove improvement**

Capture the same matrix into `.tmp/loop-zero/refined/`; compare pairs and inspect computed overflow, focus visibility, console errors, and reduced-motion state.

- [x] **Step 4: Run a dry critique round**

Repeat the capture and critique loop until one complete round finds no must-fix visual defects. Answer “what do I wish this had?” and implement in-scope wishes.

### Task 4: Final verification

**Files:**
- Verify all touched files

- [x] **Step 1: Run focused checks**

Run: `node --test tests/prototype-loop-zero.test.mjs`

Expected: PASS, zero failures.

- [x] **Step 2: Run project checks**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [x] **Step 3: Inspect final diff**

Run: `git diff --check` and inspect `git diff -- public/prototype/index.html public/prototype/loop-zero tests/prototype-loop-zero.test.mjs`.

Expected: no whitespace errors, no unrelated edits, all requested files present.
