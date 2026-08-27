# Layline Contextual Analysis Implementation Plan

> **For Codex:** Execute this plan inline. The user approved the behavior and said to proceed. Do not commit, push, or deploy.

**Goal:** Keep Analysis Layers available independently of the Analyze task picker, show Start review context automatically before the gun, and restore normal replay context after the start.

**Architecture:** Separate the layer disclosure from the task workspace panel. Derive an effective analysis session from replay time and explicit task choice without mutating the stored task for automatic prestart behavior. Keep explicit layer overrides in the existing replay store.

**Tech Stack:** React, TypeScript, CSS Modules, Node test suites, headed GPU-backed Chrome verification.

---

### Task 1: Lock the behavior in source-level tests

**Files:**
- Modify: `tests/layline-analysis-workspace-layers.test.mjs`
- Modify: `tests/layline-analysis-workspace-ui.test.mjs`
- Modify: `tests/layline-workspace-integration.test.mjs`

- [x] Assert layer controls live in a standalone disclosure.
- [x] Assert the disclosure renders independently of the active Analyze task and before standings.
- [x] Assert Overview derives Start before the gun, while explicit Compare/Evidence replace it.
- [x] Run the targeted analysis contracts.

### Task 2: Separate Analysis Layers from task content

**Files:**
- Create: `src/components/layline/hud/AnalysisLayerDisclosure.tsx`
- Modify: `src/components/layline/hud/AnalysisWorkspacePanel.tsx`
- Modify: `src/components/layline/LaylineApp.tsx`
- Modify: `src/components/layline/layline.module.css`

- [x] Move the layer disclosure and controls into the standalone component.
- [x] Always render it when analysis workspaces are ready, collapsed by default.
- [x] Keep Analyze responsible only for opening and closing the task chooser.
- [x] Stack layers above replay standings when the race-list rail is closed.

### Task 3: Add contextual Start behavior

**Files:**
- Modify: `src/components/layline/LaylineApp.tsx`

- [x] Derive Start from stored Overview while replay time is before zero.
- [x] Preserve explicit Compare/Evidence selections before the gun.
- [x] Remove contextual Start at zero without mutating the store.
- [x] Restore contextual Start when scrubbing back before zero.
- [x] Keep the existing fallback for an explicitly selected Start task that crosses zero.

### Task 4: Verify

**Files:**
- Create: `.tmp/layline-context-analysis-probe.mjs`

- [x] Run targeted analysis tests.
- [x] Run `npm run typecheck`, scoped lint, and `npm test`.
- [x] Check the diff for accidental generated or unrelated edits.
- [x] Verify desktop and mobile behavior in headed GPU-backed Chrome, including picker independence, task replacement, gun transition, reverse scrub, layer defaults, and standings order.
