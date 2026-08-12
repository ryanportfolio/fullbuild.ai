# Harness Runtime and Context Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped runtime graphic, expose the hosted creator from its illustration, and explain the template's routed CLAUDE.md and AGENTS.md context architecture.

**Architecture:** Keep the static Harness Firmware page dependency-free. Use semantic inline SVG and CSS for all new diagrams, with complete static states and restrained route motion that is disabled by reduced-motion and capture modes. Keep source-backed measurements subordinate to the product explanation.

**Tech Stack:** Static HTML, CSS, inline SVG, Node test runner, Playwright visual verification

---

### Task 1: Lock content and interaction contracts

**Files:**
- Modify: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Add assertions for the chosen runtime heading and optimization link**

```js
assert.ok(html.includes("Built for Claude Code and Codex"));
assert.ok(html.includes('href="https://savetokens.tips"'));
```

- [ ] **Step 2: Add assertions for creator illustration link semantics**

```js
assert.match(html, /<a class="creator-visual creator-link" href="\/harness-firmware\/new\/"/);
```

- [ ] **Step 3: Add assertions for a source-linked context architecture section**

```js
assert.ok(html.includes('id="context-architecture"'));
assert.ok(html.includes("CLAUDE.md"));
assert.ok(html.includes("AGENTS.md"));
```

- [ ] **Step 4: Run the focused test and verify it fails**

Run: `node --test tests/harness-firmware.test.mjs`
Expected: FAIL on the new contracts

### Task 2: Rebuild runtime evidence as a semantic schematic

**Files:**
- Modify: `public/harness-firmware/index.html`
- Modify: `public/harness-firmware/src/phosphor.css`

- [ ] **Step 1: Replace the baked tube visual and floating labels**

Use one accessible inline SVG with a left playbook source, an orthogonal router, and two equal output cards for Claude Code and Codex. Keep 9,355 B and 7,206 B as secondary metrology.

- [ ] **Step 2: Add route motion and static fallbacks**

Animate two small packets along separate lanes. Disable all animation under `.capture-frozen`, `.motion-reduced`, and `prefers-reduced-motion`.

- [ ] **Step 3: Replace the heading and add the supporting SaveTokens link**

```html
<h2 class="reveal">Built for Claude Code and Codex</h2>
<a class="context-cta mono" href="https://savetokens.tips">HOW WE OPTIMIZE CONTEXT &rarr;</a>
```

### Task 3: Make the launcher illustration actionable

**Files:**
- Modify: `public/harness-firmware/index.html`
- Modify: `public/harness-firmware/src/phosphor.css`

- [ ] **Step 1: Wrap the first creator visual in a direct link**

```html
<a class="creator-visual creator-link" href="/harness-firmware/new/" aria-label="Open the Harness Firmware web project creator">
```

- [ ] **Step 2: Add persistent affordance and keyboard-visible focus**

Add an `OPEN WEB CREATOR` corner tag, border-color transition, and a clearly visible focus outline without moving the card.

### Task 4: Add routed context architecture section

**Files:**
- Modify: `public/harness-firmware/index.html`
- Modify: `public/harness-firmware/src/phosphor.css`

- [ ] **Step 1: Add a concise explanation**

```html
<h2 class="reveal">Load only what the work needs</h2>
<p class="copy reveal">CLAUDE.md and AGENTS.md stay small. They route each agent to focused project files only when the task needs them.</p>
```

- [ ] **Step 2: Add a semantic file-routing diagram**

Show CLAUDE.md and AGENTS.md entering a shared index, then branching to architecture, commands, deployment, pitfalls, secrets, tech stack, and voice references. Link root-file cards and the optimization CTA to their actual sources.

- [ ] **Step 3: Verify responsive collapse**

At 700px and below, stack the diagram lanes and preserve readable labels without horizontal page overflow.

### Task 5: Verify, publish, and check production

**Files:**
- Test: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/harness-firmware.test.mjs`
Expected: all tests pass

- [ ] **Step 2: Run type verification**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 3: Capture the changed sections**

Capture desktop, tablet, and phone screenshots with normal and reduced motion. Verify no collisions, clipping, horizontal page overflow, console errors, failed requests, or hidden focus states.

- [ ] **Step 4: Commit, push, merge, and verify the live sentinel**

Ship only the explicit files above, wait for deployment success, then confirm the live page contains `Built for Claude Code and Codex` and `Load only what the work needs`.
