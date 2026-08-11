# Harness Firmware Greptile Editorial Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/harness-firmware` into a proof-first, Greptile-inspired editorial page while preserving the current Harness Firmware copy, PHOSPHOR identity, sourced figures, and progressive-enhancement floor.

**Architecture:** Keep the standalone HTML/CSS/ES-module artifact and its existing dither engine. Change information architecture and framing in `index.html`, extend the declared PHOSPHOR contract in `phosphor.css`, and make the existing runtime responsive to keyboard input, resize, live reduced-motion changes, and deterministic capture. Existing prose paragraphs remain verbatim; new UI copy is limited to navigation, evidence labels, sourced FAQ answers, and repeated repository actions.

**Tech Stack:** Static HTML, authored CSS, browser ES modules, Canvas 2D, Node test runner, Playwright capture scripts in `.tmp/`.

> **Execution amendment (2026-08-11):** `origin/main` advanced to `15342b515e43da030a7d7a8c0abd37f6c1cb6fa4` while this plan was in progress. That commit refreshed the product story and moved the measured Harness Firmware source to `d9cd99f5d6126d58918e117b584369dd610f4f59`. The implementation preserves that newer copy and its 23-skill story. Any earlier `8.1 KiB`, `20 skills`, `8,317 B`, `175,102 B`, or `5224beb` snippets below are historical red-test examples, not current requirements. Current assertions and artwork derive the separate Claude `9,355 B` and Codex `7,206 B` footprints, `188,216 B` of canonical entry files, and scoped support/adapter totals from the refreshed facts artifact.

---

### Task 1: Lock the structural and accessibility contract

**Files:**
- Modify: `tests/harness-firmware.test.mjs`
- Read: `public/harness-firmware/facts.json`
- Read: `.tmp/reference-forensics/greptile-harness/design-contract.md`

- [ ] **Step 1: Add failing document-contract assertions**

Add one test that requires the hero to sit inside `<main id="main">`, a labelled firmware index with anchors for `#action`, `#kernel`, `#skills`, and `#flash`, a four-cell measured proof rail, native FAQ details, lazy lower-page images, and a keyboard-operable spectrum region:

```js
test("editorial structure keeps proof, navigation, and controls semantic", async () => {
  const html = await read("public/harness-firmware/index.html");
  assert.match(html, /<main id="main">[\s\S]*<section class="hero"/);
  assert.match(html, /<nav[^>]+aria-label="Firmware index"/);
  for (const id of ["action", "kernel", "skills", "flash"]) {
    assert.ok(html.includes(`href="#${id}"`), `index links to ${id}`);
    assert.ok(html.includes(`id="${id}"`), `page exposes ${id}`);
  }
  assert.equal((html.match(/class="proof-cell/g) ?? []).length, 4);
  assert.ok((html.match(/<details/g) ?? []).length >= 4);
  assert.match(html, /id="spectrum"[^>]+tabindex="0"/);
  assert.match(html, /id="spectrum"[^>]+aria-describedby="spectrum-help"/);
  assert.ok((html.match(/loading="lazy"/g) ?? []).length >= 3);
});
```

- [ ] **Step 2: Add failing runtime and responsive assertions**

Require the spectrum arrow-key model, live media-query listener, capture handle, resize handling, replay cleanup, and a one-column mobile inventory:

```js
test("runtime exposes deterministic and inclusive interaction paths", async () => {
  const [js, css] = await Promise.all([
    read("public/harness-firmware/src/phosphor.js"),
    read("public/harness-firmware/src/phosphor.css"),
  ]);
  assert.match(js, /addEventListener\(['"]keydown['"]/);
  assert.match(js, /ArrowLeft|ArrowRight/);
  assert.match(js, /motionQuery\.addEventListener\(['"]change['"]/);
  assert.match(js, /ResizeObserver|addEventListener\(['"]resize['"]/);
  assert.match(js, /window\.__capture/);
  assert.match(js, /clearTimeout\(/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.skill-list\s*\{[^}]*grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 3: Run the focused tests and confirm the new assertions fail**

Run: `node --test tests/harness-firmware.test.mjs`

Expected: existing five tests pass; the two new contract tests fail on missing editorial structure and runtime hooks.

### Task 2: Recompose the page without rolling back copy

**Files:**
- Modify: `public/harness-firmware/index.html`
- Test: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Put the product inside the main landmark and promote the chrome into an index**

Move the opening `<main id="main">` above the hero. Keep the existing hero name, title, description, readout, note, and color key verbatim. Replace the sparse header body with this semantic shell:

```html
<header class="chrome">
  <a class="chrome-home" href="/">fullbuild.ai</a>
  <nav class="firmware-index mono" aria-label="Firmware index">
    <a href="#action">ACTION</a>
    <a href="#kernel">KERNEL</a>
    <a href="#skills">SKILLS</a>
    <a href="#flash">FLASH</a>
  </nav>
  <a class="chrome-action mono" href="https://github.com/ryanportfolio/Harness-Firmware">GITHUB</a>
</header>
```

- [ ] **Step 2: Add the measured proof rail immediately after the hero**

Each cell links to the existing detailed evidence and names `facts.json` or the runtime section as its source:

```html
<section class="proof-rail" aria-label="Measured firmware proof">
  <a class="proof-cell" href="#kernel"><b data-stat>8.1 KiB</b><span>resident each turn</span><small class="mono">FACTS.JSON · 8,317 B</small></a>
  <a class="proof-cell" href="#skills"><b data-stat>20</b><span>on-demand skills</span><small class="mono">TREE · 175,102 B</small></a>
  <a class="proof-cell" href="#kernel"><b data-stat>21.1&times;</b><span>leaner than loading all skills</span><small class="mono">MEASURED · ≈4 B/TOKEN</small></a>
  <a class="proof-cell" href="#runtimes"><b data-stat>2</b><span>agent runtimes</span><small class="mono">ONE COMMITTED SOURCE</small></a>
</section>
```

- [ ] **Step 3: Mark existing content as the evidence narrative**

Set `id="action"` on the durable-memory section, `id="kernel"` on the resident-footprint section, `id="skills"` on the on-demand-skills section, `id="runtimes"` on the runtime section, and `id="flash"` on install. Preserve every existing paragraph and transcript line. Reorder the unchanged runtime section before install so compatibility is established before conversion.

- [ ] **Step 4: Add an operational FAQ and final repository action**

Use native `<details>` so the answers work without JavaScript. Answers must restate only claims already present in the current page:

```html
<section class="sec sec-faq" id="faq">
  <div class="sec-body">
    <span class="gtag mono"><b>BEFORE YOU FLASH</b> · OPERATIONAL ANSWERS</span>
    <h2 class="reveal">Questions the repo answers</h2>
    <div class="faq-list reveal">
      <details><summary>What stays loaded every turn?</summary><p>The rules, plus one line describing each skill: 8,317 bytes, about 2,079 tokens.</p></details>
      <details><summary>Where does project memory live?</summary><p>Lessons are written into a named file in the repo and committed, so later sessions and teammates can read them.</p></details>
      <details><summary>Which runtimes use the same source?</summary><p>Claude Code reads the source files directly. A repository script regenerates the Codex adapters when a skill changes.</p></details>
      <details><summary>Can I install only the skills?</summary><p>Yes. The marketplace path adds the twenty skills to a repo you already have.</p></details>
    </div>
    <a class="cta final-cta" href="https://github.com/ryanportfolio/Harness-Firmware">INSPECT THE REPO &rarr;</a>
  </div>
</section>
```

- [ ] **Step 5: Add enhancement metadata without changing meaning**

Add `loading="lazy" decoding="async"` to the three lower-page baked images. Add `tabindex="0"`, `role="region"`, `aria-label="Skill flash map"`, and `aria-describedby="spectrum-help"` to `#spectrum`; make the existing pan hint the `#spectrum-help` instruction.

- [ ] **Step 6: Run the HTML contract tests**

Run: `node --test tests/harness-firmware.test.mjs`

Expected: structure assertions pass; runtime assertions still fail.

### Task 3: Extend the PHOSPHOR editorial system

**Files:**
- Modify: `public/harness-firmware/src/phosphor.css`
- Test: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Extend the binding contract comment**

Declare the new rules in the stylesheet header: proof precedes explanation; geometry comes from flat rails, ticks, addresses, and connector boundaries; evidence numbers remain sourced; motion verbs remain `CHARGE`, `DECAY`, and `RETAIN`; no Greptile colors, type, assets, mascot, blur, or rounded-card system.

- [ ] **Step 2: Style the sticky firmware index and proof rail**

Use only existing tokens, one-pixel borders, `color-mix`, type, and flat pseudo-element ticks. The index must remain keyboard visible and horizontally contained. The proof rail is four columns at desktop, two at tablet/mobile, and one at narrow widths only if the 2x2 cells cannot hold their labels.

- [ ] **Step 3: Give each existing section a distinct evidence geometry**

Make `#action` a dominant incident slab; make `#kernel` an asymmetric measure panel; retain the spectrum as the widest data artifact; turn `.practices` into a numbered vertical trace; frame runtime and install as split interface modules; style FAQ rows as native instrument drawers. No generic rounded cards, gradients, blur, shadows, or new colors.

- [ ] **Step 4: Repair contrast and narrow layouts**

Raise informational microtext mixes to at least 60% bone, preserve decorative hidden labels separately, use `minmax(0, 1fr)` and `min-width: 0` down grid chains, collapse install at 850px, and explicitly add:

```css
@media (max-width: 700px) {
  .skill-list { grid-template-columns: 1fr; }
  .skill-list li { min-width: 0; }
}
```

- [ ] **Step 5: Run the stylesheet contract scan**

Run: `node --test tests/harness-firmware.test.mjs`

Expected: the original five tests still pass; no undeclared hue, gradient, shadow, blur, external font, sub-11px type, or second easing enters the file.

### Task 4: Make enhancement deterministic and inclusive

**Files:**
- Modify: `public/harness-firmware/src/phosphor.js`
- Test: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Replace the sampled motion flag with live state**

Define `const motionQuery = matchMedia('(prefers-reduced-motion: reduce)')`, keep `let reduced = motionQuery.matches`, and add one `change` listener that reveals all content, stops loops and replays, and paints final states when reduction turns on.

- [ ] **Step 2: Scope transcript timers to visibility**

Store each replay timeout, clear it on observer exit or reduced-motion change, and restart from a deterministic first line on re-entry. In the stopped state, remove replay-only classes so the complete static transcript remains readable.

- [ ] **Step 3: Rebuild the hero field on geometry changes**

Extract canvas allocation/mask generation into an idempotent `resize()` method, call it after `document.fonts.ready`, and observe the hero with `ResizeObserver`. A resize cancels the active frame, rebuilds its arrays, and paints either the current stable field or the reduced-motion final frame.

- [ ] **Step 4: Add keyboard parity to the spectrum**

Track a selected band index. `ArrowLeft` and `ArrowRight` move one band, `Home` and `End` jump to the first/last band, and each handled key calls `preventDefault()`, paints the band, and updates the existing `aria-live` readout. Pointer and touch continue to use the same `select(index)` function.

- [ ] **Step 5: Expose the capture handle**

Publish one restartable handle:

```js
window.__capture = {
  freeze() {
    captureFrozen = true;
    heroController?.stop();
    replayControllers.forEach((controller) => controller.stop(true));
  },
  thaw() {
    captureFrozen = false;
    heroController?.resume();
  },
};
```

- [ ] **Step 6: Run the complete contract suite**

Run: `node --test tests/harness-firmware.test.mjs`

Expected: all tests pass with full native output.

### Task 5: Verify the rendered result at the acceptance matrix

**Files:**
- Create temporarily: `.tmp/reference-forensics/greptile-harness/capture-refactor.mjs`
- Create temporarily: `.tmp/reference-forensics/greptile-harness/refactor-*.png`
- Modify if defects appear: `public/harness-firmware/index.html`
- Modify if defects appear: `public/harness-firmware/src/phosphor.css`
- Modify if defects appear: `public/harness-firmware/src/phosphor.js`

- [ ] **Step 1: Start a fresh local server and prove the sentinel**

Use an unused port from the current worktree. Fetch `/harness-firmware` and assert the response includes `Measured firmware proof` before opening a browser.

- [ ] **Step 2: Capture matched viewport frames**

Capture top, proof rail, action, skills, runtime, install, FAQ, and full-page frames at `390x844`, `700x900`, `701x900`, `820x900`, `1280x900`, and `1440x900`. Freeze through `window.__capture.hold('retained')` immediately before each screenshot.

- [ ] **Step 3: Assert mechanical layout facts**

At every viewport, fail on `scrollWidth > clientWidth`, page errors, failed local requests, hidden headings, blank canvas, clipped interactive centers, or a sticky header covering the focused anchor. At 390px, assert every `.skill-list li` right edge is within the viewport.

- [ ] **Step 4: Verify keyboard, reduced-motion, and no-JS states**

Tab from the skip link through index and actions, focus `#spectrum`, press `End`, `ArrowLeft`, and `Home`, and assert its readout changes. Repeat with `reducedMotion: 'reduce'` and JavaScript disabled; all prose, transcripts, figures, FAQ answers, and install commands must remain available.

- [ ] **Step 5: Grade, fix, and recapture**

Inspect every full-resolution image for one focal point per depth, rail collisions, crop errors, dead frames, unreadable microtext, stuck reveals, and generic repeated-card rhythm. Apply the smallest contract-preserving fix and repeat the complete matrix until no defect remains.

- [ ] **Step 6: Run final repository checks and inspect the diff**

Run: `node --test tests/harness-firmware.test.mjs`

Run the repository production build command discovered from `package.json` without installing dependencies. Then run `rtk git diff --check` and `rtk git diff -- public/harness-firmware/index.html public/harness-firmware/src/phosphor.css public/harness-firmware/src/phosphor.js tests/harness-firmware.test.mjs`.

Expected: tests and build pass, no whitespace errors, and only the approved Harness Firmware files plus this plan are changed. Git commit, push, PR, and deployment are intentionally excluded because the user did not authorize shipping.

### Task 6: Run the `$wow-loop` adversarial evidence gate

**Files:**
- Read: `.tmp/reference-forensics/greptile-harness/refactor-*.png`
- Read: `.tmp/reference-forensics/greptile-harness/refactor-metrics.json`
- Read: all modified Harness Firmware files and their complete diff
- Modify only for confirmed findings: `public/harness-firmware/index.html`, `public/harness-firmware/src/phosphor.css`, `public/harness-firmware/src/phosphor.js`, `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Dispatch fresh, read-only experience verification**

The verifier must inspect every cited full-resolution screenshot, compare matched baseline frames, measure disputed layout, and try to disprove hierarchy, reference translation, Fullbuild identity, responsive quality, and visual dryness.

- [ ] **Step 2: Dispatch fresh, read-only engineering verification**

The verifier must run tests, read the full diff, inspect browser metrics, and try to disprove lifecycle cleanup, deterministic capture, keyboard parity, reduced-motion switching, no-JS completeness, performance, semantics, and scope.

- [ ] **Step 3: Dispatch fresh accessibility and provenance verification**

The verifier must compute contrast, walk keyboard/focus behavior, check landmarks and native details, prove all new figures are sourced, confirm current copy remains present, and reject any borrowed proprietary asset or inflated claim.

- [ ] **Step 4: Reproduce and fix every confirmed blocker, high, or medium finding**

Use the same viewport/state that produced each defect. Keep one hot-file owner. Recapture the exact failed frame and rerun the relevant measurement before requesting a new verifier round.

- [ ] **Step 5: End only on a dry independent round**

The gate passes when fresh verifiers report zero confirmed blocker/high/medium findings, or when any residual is explicitly named with its cause and evidence. The orchestrator then reruns tests, banned-pattern scans, the capture matrix, and reads the final money-shot frames itself.

---

## Completion record (2026-08-11)

- Implemented the proof-first editorial spine and preserved the PHOSPHOR material/color law, firmware metaphor, open-source positioning, and current upstream product copy.
- Re-derived all published measurements from Harness Firmware commit `d9cd99f5d6126d58918e117b584369dd610f4f59`, including separate Claude/Codex resident footprints and separate canonical/support/adapter scopes.
- Completed fresh visual, engineering, and accessibility/provenance gates with zero remaining blocker, high, medium, or low findings.
- Final capture matrix passed at 1440, 1280, 820, 701, 700, 390, and 320 pixels with no page overflow, browser errors, failed requests, hidden reveals, or failed keyboard/capture/motion probes.
- `node --test tests/harness-firmware.test.mjs` passes 7/7; JS/MJS syntax checks and `git diff --check` pass. The repository production build remains unverified in this worktree because dependencies are absent (`next` is not installed); no dependency installation was authorized.
- Commit, push, pull request, and deployment remain intentionally excluded.
