# Harness Skill Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosted Harness creator users disable unwanted skills before repository creation, while keeping every skill recoverable, never reporting an unapplied selection as successful, and giving honest setup timing for nearly blank repositories.

**Architecture:** One static JavaScript catalog drives the framework-free selector and is imported by server code as the validation allowlist. The create route generates the repository first, then creates one atomic Git commit that updates `.claude/settings.json` with `skillOverrides` and removes generated Codex adapter entry files for disabled skills; if that second GitHub operation fails, the repository URL is still returned with an explicit warning because creation cannot be rolled back safely.

**Tech Stack:** Static HTML/CSS/JavaScript, native `<dialog>`, Next.js route handlers, GitHub Contents API, Node test runner, Playwright

---

### Task 1: Pin selection and merge behavior

**Files:**
- Create: `public/harness-firmware/new/skill-catalog.js`
- Modify: `src/lib/harness-github.ts`
- Modify: `tests/harness-github.test.mjs`

- [ ] **Step 1: Write failing validation and merge tests**

Assert that `normalizeDisabledSkills` accepts known optional slugs, rejects duplicates, unknown slugs, non-arrays, and `init-project`, and returns catalog order. Assert that `mergeSkillOverrides` preserves hooks, permissions, and unrelated overrides while adding selected `"off"` entries and removing stale catalog-owned `"off"` entries.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/harness-github.test.mjs`

Expected: FAIL because the helpers and catalog do not exist.

- [ ] **Step 3: Implement the catalog-backed helpers**

Import the catalog JSON into `src/lib/harness-github.ts`, derive the allowlist and required set, and export:

```ts
export function normalizeDisabledSkills(value: unknown): string[] | null;
export function mergeSkillOverrides(settingsText: string, disabledSkills: string[]): string;
```

`mergeSkillOverrides` parses an object, preserves unrelated settings, writes disabled catalog skills as `"off"`, deletes stale catalog `"off"` values, and returns formatted JSON with a final newline.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/harness-github.test.mjs`

Expected: PASS.

### Task 2: Apply selection after template generation

**Files:**
- Modify: `src/lib/harness-github.ts`
- Modify: `src/app/api/harness/github/create/route.ts`
- Modify: `tests/harness-creator.test.mjs`
- Modify: `docs/harness-github-app.md`

- [ ] **Step 1: Extend route contract assertions**

Assert that the route accepts `disabledSkills`, rejects an invalid selection with status 422 before calling GitHub, calls a helper that updates `.claude/settings.json`, and returns the repository URL plus an honest customization warning after a post-create failure.

- [ ] **Step 2: Add the GitHub settings updater**

Implement:

```ts
export async function applyRepositorySkillSelection(input: {
  owner: string;
  repository: string;
  branch: string;
  disabledSkills: string[];
  token: string;
}): Promise<void>;
```

Read `.claude/settings.json` through the Contents API, retry brief post-generation 404s, merge the allowlisted overrides, create a settings blob, remove matching `.agents/skills/<name>/SKILL.md` entries in a derived tree, and advance the default branch with one non-forced commit named `Configure Harness skills`.

- [ ] **Step 3: Wire the create route**

Validate `disabledSkills` before repository creation. Skip the update when none are disabled. After generation, apply the selection; on failure, return `customized: false` and a warning alongside the created repository URL instead of returning a retry-inducing error.

- [ ] **Step 4: Update the app permission contract**

Change GitHub App Contents permission from read-only to read and write and explain that write access is used only for the generated repository's single Harness configuration commit.

- [ ] **Step 5: Run focused tests and type checking**

Run: `node --test tests/harness-github.test.mjs tests/harness-creator.test.mjs`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Build the skill selector

**Files:**
- Modify: `public/harness-firmware/new/index.html`
- Modify: `public/harness-firmware/new/new-project.css`
- Modify: `public/harness-firmware/new/new-project.js`
- Modify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Add failing static-surface assertions**

Assert one accessible dialog, one trigger with `aria-expanded`, live enabled-count output, required-skill treatment, honest `create → scaffold → init-project` guidance, selector focus styles, and the absence of banned gradients, blur, glow, rounded cards, em dashes, and heading periods.

- [ ] **Step 2: Add semantic selector markup**

Add a compact `SKILLS / 23 ENABLED / CUSTOMIZE` trigger to the repository form. Add a native dialog with grouped skill rows, `Enable all`, `Clear optional`, `Done`, a live count, and a plain explanation that disabled skills remain in the repository and can be re-enabled. Describe `init-project` as a required later setup utility that becomes useful after the user adds a framework, scaffold, or first project files.

- [ ] **Step 3: Style the selector within the creator contract**

Use existing phosphor, cyan, bone, panel, and line tokens. The dialog is a square-edged right-side instrument sheet with a fixed header/footer, scrollable groups, drawn focus boxes, and 390px mobile coverage. Reduced motion resolves directly to the open/closed end state without hiding content.

- [ ] **Step 4: Wire catalog loading and form submission**

Import `skill-catalog.js`, render grouped checkboxes, lock `init-project`, update all counts and the create CTA, serialize only disabled slugs, restore focus when the dialog closes, and render customization success or warning text returned by the server. Replace the current immediate `init-project` instruction with `create → scaffold → init-project` guidance in both the intro and success state.

- [ ] **Step 5: Run creator tests**

Run: `node --test tests/harness-creator.test.mjs`

Expected: PASS.

### Task 4: Verify the complete change

**Files:**
- Create: `.tmp/harness-skill-selector-capture.mjs`
- Create: `.tmp/harness-skill-selector/desktop.png`
- Create: `.tmp/harness-skill-selector/mobile.png`
- Create: `.tmp/harness-skill-selector/reduced-motion.png`

- [ ] **Step 1: Run static and server checks**

Run: `node --test tests/harness-github.test.mjs tests/harness-creator.test.mjs tests/harness-firmware.test.mjs`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Exercise the browser flow**

On a fresh local port, confirm the page sentinel, open the selector, disable the first and last optional skills, run both bulk controls, close with Escape and `Done`, and verify the live count and submitted payload. Confirm keyboard focus returns to the trigger.

- [ ] **Step 3: Capture and grade**

Capture the open selector at 1440x900, 390x844, and `prefers-reduced-motion: reduce`. Check dialog overflow, clipped text, visible focus, stable ground/grid continuity, no blank SVG state, no console errors, no failed catalog request, and a clear repository-creation focal point.

- [ ] **Step 4: Review the diff and report limits**

Run: `rtk git diff`

Confirm no unrelated files changed. Report live GitHub creation as unverified unless valid App credentials and a disposable test account are available. Do not commit, push, deploy, or modify GitHub App settings without separate authorization.
