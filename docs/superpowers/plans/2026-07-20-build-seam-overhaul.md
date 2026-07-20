# Build Seam Portfolio Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current wireframe proof-lab portfolio with The Build Seam: a mobile-equivalent, stage-transforming, placeholder-ready experience whose whole viewport demonstrates `idea → design → engineering → shipped`.

**Architecture:** Keep the dependency-free DOM-first static build and existing truthful stage machine. Replace the geometry/WebGL identity with semantic phase layers, one pure phase-token module, CSS/SVG material transformations, and small interaction code that sets explicit state variables. Content remains JSON-owned; every visual surface has a meaningful DOM fallback.

**Tech Stack:** Node.js ES modules, semantic HTML, CSS custom properties/clip-path/3D transforms, inline SVG, native pointer/keyboard/IntersectionObserver APIs, Node test runner, locally vendored OFL variable font, Chrome browser acceptance.

---

## File map

- `content/site.json` — identity copy, lifecycle evidence, three honest placeholder cases, exit placeholder.
- `src/template.mjs` — semantic arrival, Build Seam layers, case portals, compact lifecycle, shipment gate, exit.
- `src/phase-state.mjs` — pure lifecycle visual tokens and interpolation helpers.
- `src/stage-machine.mjs` — retain truthful navigation/lock behavior.
- `src/app.mjs` — stage controls, seam manipulation, CSS state synchronization, viewport reveals.
- `src/styles.css` — complete Build Seam art direction, responsive system, motion, fallbacks.
- `assets/fonts/Anybody[wdth,wght].ttf` and `assets/fonts/OFL.txt` — locally hosted typography and license.
- `assets/favicon.svg` — new seam mark.
- `tests/site-contract.test.mjs` — semantic, placeholder, truth, accessibility, and anti-default contract.
- `tests/phase-state.test.mjs` — deterministic phase-token and interpolation tests.
- `tests/stage-machine.test.mjs` — extend locked shipment announcement expectations if required.
- `scripts/verify-site.mjs` — Build Seam authority, assets, budgets, no stale WebGL identity.
- Remove after replacement passes: `src/geometry.mjs`, `src/renderer.mjs`, `src/fallback-renderer.mjs`, `tests/geometry.test.mjs`.

### Task 1: Lock the replacement contract

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Create: `tests/phase-state.test.mjs`
- Modify: `tests/stage-machine.test.mjs`

- [ ] **Step 1: Replace old proof-object expectations with failing Build Seam assertions**

Require one `h1`, exact tagline, `data-build-seam`, four `data-phase-control` elements, three distinct `data-placeholder-case` articles, a visible shipment gate, an exit placeholder, no `proof-canvas`, no `wireframe`, and complete no-JS content.

```js
assert.match(html, /data-build-seam/);
assert.equal((html.match(/data-phase-control=/g) ?? []).length, 4);
assert.equal((html.match(/data-placeholder-case/g) ?? []).length, 3);
assert.match(html, /Project title pending/);
assert.match(html, /Question pending/);
assert.match(html, /Hypothesis pending/);
assert.match(html, /production proof pending/i);
assert.match(html, /channel pending/i);
assert.doesNotMatch(html, /proof-canvas|wireframe|data-proof-viewport/);
```

- [ ] **Step 2: Add phase-token tests before implementation**

```js
import { PHASE_TOKENS, interpolatePhase, resolvePhase } from "../src/phase-state.mjs";

test("lifecycle phases have distinct material laws", () => {
  assert.deepEqual(PHASE_TOKENS.map(({ id }) => id), ["idea", "design", "engineering", "shipped"]);
  assert.equal(new Set(PHASE_TOKENS.map(({ silhouette }) => silhouette)).size, 4);
  assert.ok(PHASE_TOKENS[0].width > PHASE_TOKENS[2].width);
  assert.ok(PHASE_TOKENS[3].depth > PHASE_TOKENS[0].depth);
});

test("phase interpolation returns exact endpoints", () => {
  assert.deepEqual(interpolatePhase(0, 1, 0), resolvePhase(0));
  assert.deepEqual(interpolatePhase(0, 1, 1), resolvePhase(1));
});
```

- [ ] **Step 3: Run RED**

Run: `node --test tests/site-contract.test.mjs tests/phase-state.test.mjs tests/stage-machine.test.mjs`

Expected: failure because Build Seam markup and `src/phase-state.mjs` do not exist; old proof-object assertions also conflict.

### Task 2: Define truthful placeholder content

**Files:**
- Modify: `content/site.json`
- Modify: `tests/site-contract.test.mjs`

- [ ] **Step 1: Add the new content shape**

Keep `brand`, `deployment`, and four factual `stages`. Replace defensive hero/case framing with:

```json
{
  "hero": {
    "kicker": "Independent AI product builder",
    "title": "From maybe to made.",
    "lede": "I turn uncertain ideas into complete, working products—design, engineering, and the decisions between them."
  },
  "placeholders": [
    { "id": "future-product", "kind": "Future product", "title": "Project title pending", "form": "portal", "placeholder": true },
    { "id": "future-research", "kind": "Future research", "title": "Question pending", "form": "fold", "placeholder": true },
    { "id": "future-experiment", "kind": "Future experiment", "title": "Hypothesis pending", "form": "stack", "placeholder": true }
  ],
  "exit": { "title": "Let’s build the whole thing.", "contact": "Channel pending", "placeholder": true }
}
```

Give every placeholder a one-sentence purpose and explicit missing-evidence field. Retain no fake client, metric, employer, testimonial, award, or outcome.

- [ ] **Step 2: Strengthen tests**

Assert every placeholder has `placeholder === true`, a unique `form`, explicit `pending` language, and no prohibited claims.

- [ ] **Step 3: Run focused content tests**

Run: `node --test tests/site-contract.test.mjs`

Expected: content assertions pass; markup assertions remain RED.

### Task 3: Implement phase laws

**Files:**
- Create: `src/phase-state.mjs`
- Test: `tests/phase-state.test.mjs`

- [ ] **Step 1: Implement four immutable tokens**

```js
export const PHASE_TOKENS = Object.freeze([
  Object.freeze({ id: "idea", index: 0, width: 145, weight: 760, depth: 0, seam: 24, silhouette: "fluid" }),
  Object.freeze({ id: "design", index: 1, width: 112, weight: 700, depth: 0.35, seam: 42, silhouette: "planar" }),
  Object.freeze({ id: "engineering", index: 2, width: 72, weight: 640, depth: 0.72, seam: 64, silhouette: "articulated" }),
  Object.freeze({ id: "shipped", index: 3, width: 98, weight: 720, depth: 1, seam: 86, silhouette: "fused" }),
]);
```

Implement `resolvePhase(target)`, numeric `lerp`, `interpolatePhase(from, to, progress)`, and clamping. Endpoint progress must return exact token copies.

- [ ] **Step 2: Run GREEN**

Run: `node --test tests/phase-state.test.mjs`

Expected: all phase tests pass.

### Task 4: Build the semantic experience

**Files:**
- Rewrite: `src/template.mjs`
- Regenerate: `index.html`
- Test: `tests/site-contract.test.mjs`

- [ ] **Step 1: Build arrival markup**

Create header, one `h1`, identity copy, four native phase buttons, diagonal seam, four phase worlds, and one layered artifact. Canvas is not required. Every decorative layer is `aria-hidden="true"`; complete meaning remains in text.

```html
<section class="arrival" data-build-seam data-phase="engineering">
  <div class="phase-world phase-world--idea" data-phase-world="idea" aria-hidden="true"></div>
  <div class="phase-world phase-world--design" data-phase-world="design" aria-hidden="true"></div>
  <div class="phase-world phase-world--engineering" data-phase-world="engineering" aria-hidden="true"></div>
  <div class="phase-world phase-world--shipped" data-phase-world="shipped" aria-hidden="true"></div>
  <div class="build-seam" data-seam-handle aria-hidden="true"></div>
  <div class="arrival__copy">…</div>
  <nav class="phase-controls" aria-label="Build lifecycle">…</nav>
</section>
```

- [ ] **Step 2: Build three non-card placeholder portals**

Render unique semantic `<article>` structures keyed by `form`: diagonal portal, fan fold, and articulated stack. Show explicit placeholder/pending language in each.

- [ ] **Step 3: Build compact lifecycle + gate + exit**

Reuse factual stage artifact/decision/constraint/verification/source fields. Keep three reachable stage links and one disabled shipped control. Render the shipment-gate copy and pending contact without pretending either exists.

- [ ] **Step 4: Build and run markup tests**

Run: `npm run build; node --test tests/site-contract.test.mjs`

Expected: generated HTML freshness and all semantic Build Seam assertions pass.

### Task 5: Establish type and material system

**Files:**
- Add: `assets/fonts/Anybody[wdth,wght].ttf`
- Add: `assets/fonts/OFL.txt`
- Rewrite: `src/styles.css`
- Modify: `assets/favicon.svg`

- [ ] **Step 1: Vendor official font and license**

Download from Google Fonts’ official `ofl/anybody` directory. Keep the unmodified variable font filename and full OFL text. Do not add a package dependency.

- [ ] **Step 2: Define tokens and deterministic font loading**

```css
@font-face {
  font-family: "Anybody";
  src: url("/assets/fonts/Anybody%5Bwdth,wght%5D.ttf") format("truetype-variations");
  font-style: normal;
  font-weight: 100 900;
  font-stretch: 50% 150%;
  font-display: swap;
}

:root {
  --ink: #17151f;
  --milk: #f3f0e8;
  --cobalt: #3347ff;
  --orchid: #a987ff;
  --lemon: #e9ff65;
  --coral: #ff6b58;
  --mineral: #8be7ff;
  --seam: 64%;
  --phase-width: 72;
  --phase-depth: 0.72;
}
```

- [ ] **Step 3: Implement the desktop composition**

Build edge-to-edge phase fields, diagonal `clip-path` boundaries, large variable-width title, layered artifact transforms, stage-specific silhouettes, portal forms, compact lifecycle, and closing contact world. No repeated section formula.

- [ ] **Step 4: Implement mobile equivalence**

At 390×844, keep wordmark, role, full title, seam/artifact, official tagline, and all stage marks in the first viewport. Recompose portals edge-to-edge; do not hide the signature.

- [ ] **Step 5: Implement accessibility modes**

Add visible focus, 44px controls, `prefers-reduced-motion`, `forced-colors`, print/no-JS fallback, and robust 200% zoom. Motion-free mode shows all four lifecycle laws as a static foldout.

### Task 6: Wire meaningful interaction

**Files:**
- Rewrite: `src/app.mjs`
- Retain: `src/stage-machine.mjs`
- Test: `tests/stage-machine.test.mjs`, `tests/phase-state.test.mjs`

- [ ] **Step 1: Synchronize machine state to CSS**

Import `resolvePhase` and set `data-phase`, `--phase-index`, `--phase-width`, `--phase-depth`, and `--seam` on the arrival/lifecycle roots. Keep shipped lock truth.

- [ ] **Step 2: Add direct seam manipulation**

Pointer movement affects the seam only while the arrival is actively manipulated. Keyboard stage controls remain authoritative. Use passive viewport listeners where no prevention occurs. Do not add cursor followers or ambient animation.

- [ ] **Step 3: Add orchestrated arrival + interruptibility**

For non-reduced motion, visually sweep idea → design → engineering and settle within 2.2 seconds. Any click, key, pointerdown, or scroll cancels the intro and gives control immediately.

- [ ] **Step 4: Add portal and viewport state**

IntersectionObserver toggles explicit `is-in-view`/active portal state; motion changes clipping or transform, not generic opacity-only fade-ups.

- [ ] **Step 5: Run behavior tests**

Run: `node --test tests/phase-state.test.mjs tests/stage-machine.test.mjs`

Expected: all pass, including locked shipment and reduced-motion discrete states.

### Task 7: Remove obsolete identity and update verifier

**Files:**
- Delete: `src/geometry.mjs`
- Delete: `src/renderer.mjs`
- Delete: `src/fallback-renderer.mjs`
- Delete: `tests/geometry.test.mjs`
- Modify: `scripts/verify-site.mjs`
- Modify: `.agents/reference/engineering/architecture.md`
- Modify: `.agents/reference/engineering/commands.md`
- Modify: `.agents/reference/product/brand.md`

- [ ] **Step 1: Remove unused WebGL proof modules after replacements pass**

Search import graph first. Delete only when `src/app.mjs`, tests, and verifier no longer import them.

- [ ] **Step 2: Replace verifier authority**

Require phase tokens, semantic Build Seam, placeholder truth, local font/license, dependency-free package, reduced motion/forced colors, no stale proof canvas, and generated freshness. Raise asset budget for the unmodified OFL font; report it separately from HTML/CSS/JS.

- [ ] **Step 3: Update durable architecture/brand facts**

Describe DOM/SVG/CSS phase layers, variable-font lifecycle behavior, stage lock, and browser evidence. Replace obsolete stable-mesh claims instead of keeping contradictions.

- [ ] **Step 4: Run integrated verification**

Run: `npm run build; npm test; npm run verify; node .claude/scripts/test-codex-contract.mjs`

Expected: all commands exit 0; no stale geometry imports or references.

### Task 8: Real-browser critique loop

**Files:**
- Modify as findings require: `src/template.mjs`, `src/styles.css`, `src/app.mjs`, `content/site.json`
- Create: `docs/reviews/build-seam-pass-01.md`
- Create: `docs/reviews/build-seam-pass-02.md`

- [ ] **Step 1: Capture required states in Chrome**

Widths: 1440×900, 1280×720, 768×1024, 390×844. Capture arrival, mid transition, each lifecycle state, all placeholder portals, shipment gate, exit, focus, reduced motion, and 200% zoom.

- [ ] **Step 2: Run critique matrix**

Score clarity, originality, signature, composition, typography, motion, placeholder resilience, mobile equivalence, and accessibility. Record exact screenshot + causal layer for every score below target.

- [ ] **Step 3: Repair highest-leverage issues and rerun**

Fix concept/composition before type, type before motion, motion before texture/microdetail. Re-run failed and neighboring states.

- [ ] **Step 4: Require two consecutive fresh critiques**

Fresh agents must use actual browser evidence. Stop only when every dimension is at least 2, required dimensions are 3, no four-tell cluster remains, and two consecutive passes find no material improvement.

### Task 9: Final audit and automatic integration

**Files:**
- Modify: `docs/reviews/final-requirement-audit.md`
- Stage only explicit task files; exclude `.codex/hooks.json`.

- [ ] **Step 1: Audit every objective requirement against authoritative evidence**

Map skill creation/research, radical design, placeholder quality, AI-tell avoidance, award-source synthesis, browser refinement, local-only scope, and stopping proof to files, test output, and screenshots.

- [ ] **Step 2: Run fresh final verification**

Run: `npm run build; npm test; npm run verify; node .claude/scripts/test-codex-contract.mjs`

Then run final desktop/mobile Chrome smoke with console and horizontal-overflow checks.

- [ ] **Step 3: Integrate under active Auto-Merge Mode**

Stage explicit paths only, commit with required co-author trailer, push branch, ensure one PR, squash-merge to `main`, and keep the working branch. Never stage `.codex/hooks.json`.
