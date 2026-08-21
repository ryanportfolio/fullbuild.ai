# Harness Firmware skills refresh implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Harness Firmware site to describe the current 30-skill template, expose every skill in the repository creator, call out the seven new workflows, and replace the text-only fullbuild.ai home link with the house mark.

**Architecture:** Keep `facts.json` as the measured source for the phosphor visualizations and use `skill-catalog.js` as the creator's selectable catalog. Update static HTML proof and tests from the same pinned Harness Firmware commit. Reuse the shipped `RailLogo` geometry as inline SVG so the static page needs no new asset or runtime.

**Tech Stack:** Static HTML, CSS, ES modules, Node test runner, Next.js static rewrites.

---

### Task 1: Pin the current Harness Firmware facts

**Files:**
- Modify: `public/harness-firmware/facts.json`
- Modify: `public/harness-firmware/src/dither.mjs`
- Modify: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Measure the upstream source**

Use commit `2094fa7b0aef3aaa92b70db5c7c296f5bfbecbdc`. Read Git blob sizes for `CLAUDE.md`, `AGENTS.md`, `.claude/skills/**`, and `.agents/skills/**`; parse every active skill name and YAML description.

- [ ] **Step 2: Update the fact fixture**

Set `skillCount` to 30, add the seven new skill entries in descending byte order, recalculate block counts and hex offsets, update tree/blob hashes, and recompute all resident/on-demand totals.

- [ ] **Step 3: Update deterministic visualization seed**

Set `SEED` in `public/harness-firmware/src/dither.mjs` to `0x2094fa7b` and update its measurement comment.

- [ ] **Step 4: Update pinned test expectations**

Change the commit, tree hashes, skill count, tier counts, and `onDemandScope` assertion in `tests/harness-firmware.test.mjs` to the new measured values.

- [ ] **Step 5: Run the fact tests**

Run `node --test tests/harness-firmware.test.mjs`. Expected: all Harness Firmware fact, editorial, deterministic rendering, and accessibility checks pass.

### Task 2: Expose and explain the new skills

**Files:**
- Modify: `public/harness-firmware/new/skill-catalog.js`
- Modify: `public/harness-firmware/new/index.html`
- Modify: `public/harness-firmware/new/new-project.css`
- Modify: `public/harness-firmware/index.html`
- Modify: `tests/harness-creator.test.mjs`
- Modify: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Add all seven catalog records**

Add `automate-me` to core workflows; add `babysit-ci`, `codex-review`, and `verify-this` to quality disciplines; add `arena`, `bro`, and `unslop` to specialist tools. Each record gets a plain-language label and description.

- [ ] **Step 2: Mark recently added skills**

Add a `recent: true` property to the seven new records. Render a `NEW` state in the selector metadata and style it with the existing action-green token.

- [ ] **Step 3: Replace stale creator counts**

Update no-JavaScript fallback counts and visible initial outputs from 23 to 30. Runtime JS remains the source after load.

- [ ] **Step 4: Add a new-capabilities block to the skills section**

Insert a compact seven-item list ahead of the existing defining-workflows list. Each item links to the pinned canonical `SKILL.md` and states the concrete action it adds.

- [ ] **Step 5: Refresh every measured statement**

Replace all 23-skill, byte, KiB, token, commit, tree, adapter, alt-text, FAQ, footer, and runtime-diagram values with the new facts. Rebuild the screen-reader spectrum inventory from all 30 skill entries.

- [ ] **Step 6: Extend tests**

Assert that creator catalog names exactly equal `facts.skills`, every new skill carries the recent flag, the selector exposes the recent marker, and the landing page links all seven new canonical skill files.

### Task 3: Replace the text home mark

**Files:**
- Modify: `public/harness-firmware/index.html`
- Modify: `public/harness-firmware/src/phosphor.css`
- Modify: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Reuse the canonical house geometry**

Replace `<a class="chrome-home" href="/">fullbuild.ai</a>` with the finished seven-path house SVG used by `src/components/chrome/RailLogo.tsx`. Keep `aria-label="fullbuild.ai home"` on the link and mark the SVG decorative.

- [ ] **Step 2: Fit the mark to desktop and mobile chrome**

Give the SVG an explicit compact size, keep stroke widths legible, and preserve the existing focus treatment and click target.

- [ ] **Step 3: Pin semantics in tests**

Assert that `chrome-home` has the accessible home label, contains the canonical mark paths, and no longer renders the text-only wordmark.

### Task 4: Verify the full change

**Files:**
- Verify: `public/harness-firmware/**`
- Verify: `tests/harness-firmware.test.mjs`
- Verify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Run focused tests**

Run `node --test tests/harness-firmware.test.mjs tests/harness-creator.test.mjs`. Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run `npm run typecheck`. Expected: exit code 0.

- [ ] **Step 3: Start a fresh local server**

Check the chosen port is unused, then run `node scripts/serve-prototype.mjs` on a fresh port. Confirm a changed sentinel such as `30 workflows` appears in loaded page text before trusting the preview.

- [ ] **Step 4: Inspect desktop and mobile**

Use the Codex Browser for interaction checks at desktop and 390x844. Confirm the landing-page house mark, seven new-skill links, selector group counts, modal overflow, `NEW` markers, keyboard-close behavior, and no console errors.

- [ ] **Step 5: Run headless capture evidence when supported**

Use the repository's Playwright capture path against the same fresh server and grade desktop/mobile frames. If the capture tooling cannot exercise this static route, report visual capture as unverified rather than substituting an in-app screenshot claim.

