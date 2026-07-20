# fullbuild.ai Showpiece Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Three fresh rendered-review agents are reserved for the required iteration passes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a recruiter-facing, DOM-first portfolio showpiece whose deterministic proof object carries the official four-stage lifecycle without fabricated evidence or AI-template styling.

**Architecture:** A dependency-free Node build reads one canonical JSON content source and emits semantic static HTML. CSS supplies the complete responsive visual system; small ES modules supply deterministic geometry, stage state, raw WebGL2 enhancement, SVG/DOM fallback, and input handling. Node's built-in test runner and a deterministic verification script gate content, shipment truth, geometry, budgets, and assets.

**Tech Stack:** HTML5, modern CSS, JavaScript ES modules, Node.js built-ins, raw WebGL2, SVG/DOM fallback, and a deliberate system-font fallback after official Recursive asset verification.

**Authorization:** Work on local branch `codex/fullbuild-showpiece`. Do not commit, push, deploy, publish, or install runtime dependencies.

---

### Task 1: Create RED acceptance harness

**Files:**
- Create: `package.json`
- Create: `tests/site-contract.test.mjs`
- Create: `tests/geometry.test.mjs`
- Create: `tests/stage-machine.test.mjs`
- Create: `scripts/verify-site.mjs`

- [x] **Step 1: Add dependency-free scripts**

```json
{
  "name": "fullbuild-ai",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "serve": "node scripts/serve.mjs",
    "test": "node --test",
    "verify": "node scripts/verify-site.mjs"
  }
}
```

- [x] **Step 2: Write failing contract tests**

`tests/site-contract.test.mjs` must import `content/site.json` with JSON import attributes and assert exact tagline, four ordered stage IDs, `deployment.verified === false`, nonempty real artifacts for idea/design/engineering, and locked shipped copy. It must build the page, then assert static HTML contains one H1, skip link, four stage sections, internal anchors, and no placeholder markers, lorem text, fake metric, empty `href`, or unverified `shipped` status.

`tests/geometry.test.mjs` must import `createProofGeometry`, call it twice with `fullbuild.ai/case-00`, and assert byte-identical positions/indices, equal vertex counts across four states, finite coordinates, valid index bounds, and exact interpolation endpoints.

`tests/stage-machine.test.mjs` must assert ordered stage transitions, arrow-key behavior, reduced-motion discrete transitions, and refusal to activate `shipped` when deployment is unverified.

- [x] **Step 3: Run RED**

Run: `npm test`

Expected: FAIL because `content/site.json`, build script, geometry module, and stage machine do not exist.

### Task 2: Implement canonical content and semantic static build

**Files:**
- Create: `content/site.json`
- Create: `src/template.mjs`
- Create: `scripts/build.mjs`
- Create: `index.html` (generated)

- [x] **Step 1: Add only verified content**

`content/site.json` must contain:

```json
{
  "brand": {
    "name": "fullbuild.ai",
    "tagline": "idea → design → engineering → shipped"
  },
  "caseStudy": {
    "id": "00",
    "title": "Building fullbuild.ai",
    "status": "engineering"
  },
  "deployment": { "verified": false, "url": null },
  "stages": [
    { "id": "idea", "label": "idea" },
    { "id": "design", "label": "design" },
    { "id": "engineering", "label": "engineering" },
    { "id": "shipped", "label": "shipped", "locked": true }
  ]
}
```

Each stage must add a real artifact, decision, constraint/rejected option, and verification state sourced from the design spec. Shipped states only `Production proof pending.`

- [x] **Step 2: Generate complete no-JavaScript HTML**

`src/template.mjs` must export `renderPage(site)` and emit skip link, header anchors, one H1, exact tagline, honest build status, Case Study 00, four semantic stage sections, decision ledger, system anatomy, verification ledger, fallback proof-object markup, and footer. Do not emit identity/contact/résumé/source links without real destinations.

- [x] **Step 3: Build and run contract test**

Run: `npm run build && node --test tests/site-contract.test.mjs`

Expected: PASS.

### Task 3: Implement deterministic proof geometry with RED/GREEN

**Files:**
- Create: `src/geometry.mjs`
- Test: `tests/geometry.test.mjs`

- [x] **Step 1: Confirm geometry RED**

Run: `node --test tests/geometry.test.mjs`

Expected: FAIL with missing `src/geometry.mjs`.

- [x] **Step 2: Implement stable indexed geometry**

Export:

```js
export function hashSeed(value) {}
export function createProofGeometry(seed, options = {}) {}
export function interpolateState(states, fromIndex, toIndex, t) {}
```

Use a seeded PRNG, one UV-like indexed grid, and four equal-length position arrays. Idea opens/noises the boundary; design resolves silhouette/control rhythm; engineering reveals indexed seams; shipped closes the same identity without becoming active proof. Return `indices`, `states`, `lineIndices`, and auditable `meta` containing vertex/triangle counts only.

- [x] **Step 3: Run GREEN**

Run: `node --test tests/geometry.test.mjs`

Expected: PASS.

### Task 4: Implement guarded stage state machine with RED/GREEN

**Files:**
- Create: `src/stage-machine.mjs`
- Test: `tests/stage-machine.test.mjs`

- [x] **Step 1: Confirm state RED**

Run: `node --test tests/stage-machine.test.mjs`

Expected: FAIL with missing `src/stage-machine.mjs`.

- [x] **Step 2: Implement one source of interaction truth**

Export `createStageMachine({ stages, deploymentVerified, reducedMotion, onChange })` with `set`, `next`, `previous`, `handleKey`, `getState`, and `destroy`. Clamp indices, expose transition progress, use discrete updates under reduced motion, and reject locked shipment without verification.

- [x] **Step 3: Run GREEN**

Run: `node --test tests/stage-machine.test.mjs`

Expected: PASS.

### Task 5: Build the semantic visual system

**Files:**
- Create: `src/styles.css`
- Modify: `src/template.mjs`
- Modify: `scripts/build.mjs`
- Modify: `index.html` (generated)

- [x] **Step 1: Implement tokens and asymmetric composition**

Define exact Carbon/Bone/Graphite/Nickel/Vermilion tokens, one easing family, type roles, grid/rule system, focus states, split hero, lifecycle rail, evidence rows, decision ledger, and verification ledger. Accent may style human-decision markers only—not generic links or hover.

- [x] **Step 2: Implement progressive responsive modes**

Desktop ≥1024px: split hero with sticky-but-nontrapping proof stage. Tablet: inline proof stage. Mobile <600px: normal flow, discrete static stage silhouettes, no pointer tilt. Add `prefers-reduced-motion`, `forced-colors`, `prefers-contrast`, print, 200% text/400% zoom resilience, and JavaScript-off styles.

- [x] **Step 3: Rebuild and run static checks**

Run: `npm run build && npm test`

Expected: PASS.

### Task 6: Implement raw WebGL2 enhancement and fallback

**Files:**
- Create: `src/renderer.mjs`
- Create: `src/fallback-renderer.mjs`
- Create: `src/app.mjs`
- Modify: `src/template.mjs`
- Modify: `scripts/build.mjs`

- [x] **Step 1: Implement renderer contracts**

`src/renderer.mjs` exports `createProofRenderer(canvas, geometry, options)`. Compile/link shaders with surfaced logs, upload one index buffer and four state buffers, compute true projection/lighting, interpolate state in the vertex shader, clamp pointer inspection to 3°, request frames only while dirty, handle resize, context loss/restoration, and expose `setStage`, `setPointer`, `render`, `destroy`.

- [x] **Step 2: Implement fallback renderer**

`src/fallback-renderer.mjs` uses deterministic software projection or SVG paths for stage stills. It receives the same geometry/stage state. Fallback must appear on WebGL failure, reduced motion, forced colors, context loss, narrow screens, or `?fallback=1`.

- [x] **Step 3: Wire inputs without scroll hijacking**

`src/app.mjs` loads the canonical page state embedded by the build, initializes the guarded stage machine, synchronizes stage buttons/arrow keys/scroll thresholds, updates adjacent DOM state text, applies pointer tilt only on capable pointers, and keeps canvas aria-hidden.

- [x] **Step 4: Build and run tests**

Run: `npm run build && npm test && npm run verify`

Expected: PASS.

### Task 7: Vendor and validate the typography specimen

**Files:**
- Create: `assets/fonts/Recursive.woff2`
- Create: `assets/fonts/OFL.txt`
- Modify: `src/styles.css`
- Modify: `scripts/verify-site.mjs`

- [x] **Step 1: Resolve official assets**

Use the official `arrowtype/recursive` GitHub repository/release only. Download one web variable WOFF2 and `OFL.txt`; record upstream URL and revision in CSS comments. Do not build fonts or install tooling.

- [x] **Step 2: Gate file and axes**

Assert WOFF2 ≤80 KB or document a spec adjustment before continuing. Confirm `MONO`, `CASL`, and `wght` axes render in the browser without text reflow. If the official web font exceeds budget or renders poorly, remove it and use the system fallback rather than silently violating the contract.

- [x] **Step 3: Rebuild and verify**

Run: `npm run build && npm run verify`

Expected: PASS with font source/license present or an explicit tested fallback decision recorded in project memory.

### Task 8: Add deterministic build, serving, and verification tools

**Files:**
- Create: `scripts/serve.mjs`
- Modify: `scripts/verify-site.mjs`
- Modify: `.agents/reference/engineering/commands.md`

- [x] **Step 1: Implement local server**

Serve only repository files, map `/` to `index.html`, set correct content types, reject traversal, print chosen localhost URL, and shut down cleanly.

- [x] **Step 2: Implement full verifier**

Check content schema, generated HTML freshness, internal anchors/assets, prohibited copy patterns, exact tagline/stages, shipment lock, deterministic geometry, file/Brotli budgets, font/license state, CSS semantic tokens, renderer/fallback hooks, and zero external runtime dependencies.

- [x] **Step 3: Record authoritative commands**

Write actual build/test/verify/serve commands and their meanings to `.agents/reference/engineering/commands.md` only after they run successfully.

- [x] **Step 4: Run integrated verification**

Run: `npm run build && npm test && npm run verify`

Expected: all commands exit 0 with counts and measured byte budgets.

### Task 9: Render and complete three mandatory iteration passes

**Files:**
- Create: `docs/reviews/pass-01-recruiter.md`
- Create: `docs/reviews/pass-02-craft.md`
- Create: `docs/reviews/pass-03-anti-slop-resilience.md`
- Modify: site source files required by accepted defects

- [x] **Step 1: Capture real browser outputs**

Capture above-fold and full-page renders at `1440×900`, `1024×768`, and `390×844`, plus reduced-motion and forced-fallback states. Every review subagent must read the Browser skill, open the live local URL in a real browser engine, interact with the stage controls and page states, save screenshots, and visually inspect them. The in-app Browser backend was not exposed inside isolated review agents, so they used installed Chrome 143 through temporary headless/CDP sessions. Source-only review is invalid.

- [x] **Step 2: Pass 1—recruiter comprehension**

Fresh browser reviewer must find concrete defects and one conceit-deepening opportunity. Fix accepted issues, rerender every affected viewport, and rerun integrated verification.

- [x] **Step 3: Pass 2—craft**

Fresh reviewer targets typography, spacing, composition, palette, geometry, shader, motion, responsive behavior. Fix, rerender, reverify.

- [x] **Step 4: Pass 3—anti-slop and resilience**

Fresh reviewer targets trope resemblance, factual honesty, semantic consistency, accessibility, reduced motion, fallback, and performance. Fix, rerender, reverify.

- [x] **Step 5: Final rendered gate**

Latest render must contain zero factual errors and zero constraint-contract violations. Any deferred opportunity needs explicit reason and must not block recruiter comprehension, craft, accessibility, or honesty.

### Task 10: Final requirement audit

**Files:**
- Modify: `README.md`
- Modify: `.agents/reference/product/roadmap.md`
- Modify: `.agents/reference/memory/decisions.md`

- [x] **Step 1: Audit every design-spec requirement**

Map each requirement to code, test, verifier output, screenshot, or unresolved blocker. Missing direct evidence means incomplete.

- [x] **Step 2: Document verified local use**

README explains purpose, exact commands, architecture, progressive enhancement, and honest shipment state. No performance or accessibility claim without captured evidence.

- [x] **Step 3: Record durable decisions and remaining blockers**

Update roadmap/decisions with final concept, stack, verified review passes, and missing owner/resume/contact/deployment inputs. Do not mark production shipment complete.

- [x] **Step 4: Run final checks**

Run: `npm run build && npm test && npm run verify`

Expected: PASS. Then inspect final browser renders and Git diff before any completion claim.

No commit, push, PR, deployment, or publication is authorized by this plan.
