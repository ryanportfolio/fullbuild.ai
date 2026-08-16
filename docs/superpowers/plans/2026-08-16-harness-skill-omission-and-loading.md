# Harness Skill Omission and Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deselected skills physically absent from generated repositories and make repository creation read as a distinct animated process state.

**Architecture:** The server will read the generated repository's complete recursive Git tree, derive deletion entries for every blob below each deselected skill's canonical and Codex adapter directories, and commit those deletions together with the existing settings override. The framework-free creator will switch the submit control into a dark cyan loading instrument with an animated beacon and route line, while honest selection and success copy states that files are omitted.

**Tech Stack:** Next.js route helpers, GitHub REST Git Trees API, TypeScript, static HTML/CSS/ES modules, Node test runner

---

### Task 1: Pin complete skill-directory deletion

**Files:**
- Modify: `tests/harness-github.test.mjs`
- Modify: `src/lib/harness-github.ts`

- [ ] **Step 1: Expand the atomic-selection regression test**

Add a recursive tree response containing canonical and adapter files for `lab`, `merge`, and an enabled skill. Assert the helper requests `/git/trees/base-tree-sha?recursive=1`, then sends deletion entries for every disabled blob and no enabled blob:

```js
if (requestUrl.endsWith('/git/trees/base-tree-sha?recursive=1')) {
  return Response.json({
    truncated: false,
    tree: [
      { path: '.claude/skills/lab/SKILL.md', mode: '100644', type: 'blob', sha: 'lab-entry' },
      { path: '.claude/skills/lab/templates.md', mode: '100644', type: 'blob', sha: 'lab-template' },
      { path: '.agents/skills/lab/SKILL.md', mode: '100644', type: 'blob', sha: 'lab-adapter' },
      { path: '.claude/skills/merge/SKILL.md', mode: '100644', type: 'blob', sha: 'merge-entry' },
      { path: '.agents/skills/merge/SKILL.md', mode: '100644', type: 'blob', sha: 'merge-adapter' },
      { path: '.claude/skills/init-project/SKILL.md', mode: '100644', type: 'blob', sha: 'required-entry' },
    ],
  });
}
```

Expected tree body after the settings entry:

```js
[
  { path: '.claude/skills/lab/SKILL.md', mode: '100644', type: 'blob', sha: null },
  { path: '.claude/skills/lab/templates.md', mode: '100644', type: 'blob', sha: null },
  { path: '.agents/skills/lab/SKILL.md', mode: '100644', type: 'blob', sha: null },
  { path: '.claude/skills/merge/SKILL.md', mode: '100644', type: 'blob', sha: null },
  { path: '.agents/skills/merge/SKILL.md', mode: '100644', type: 'blob', sha: null },
]
```

- [ ] **Step 2: Run the focused test and confirm the old seven-request flow fails**

Run: `node --experimental-strip-types --test tests/harness-github.test.mjs`

Expected: FAIL because no recursive tree is read and only adapter `SKILL.md` paths are deleted.

- [ ] **Step 3: Read and validate the complete base tree**

Add typed recursive tree objects and fetch the tree after resolving the head commit:

```ts
type GitTreeEntry = {
  path?: string;
  mode?: '100644' | '100755' | '120000';
  type?: 'blob' | 'tree' | 'commit';
};
type GitTree = { tree?: GitTreeEntry[]; truncated?: boolean };

const baseTree = await githubApi<GitTree>(
  `${repositoryPath}/git/trees/${encodeURIComponent(headCommit.tree.sha)}?recursive=1`,
  {},
  token,
);
if (!baseTree.tree || baseTree.truncated) {
  throw new Error('GitHub did not return the complete generated repository tree');
}
```

- [ ] **Step 4: Derive deletions from actual repository paths**

Build canonical and adapter prefixes for each deselected skill, retain only blob entries below those prefixes, verify every deselected canonical `SKILL.md` exists, and map the actual path and mode to `sha: null`. Include these entries after `.claude/settings.json` in the atomic tree request.

```ts
const skillPrefixes = selectedSkills.flatMap((skill) => [
  `.claude/skills/${skill}/`,
  `.agents/skills/${skill}/`,
]);
const deletionEntries = baseTree.tree
  .filter((entry): entry is GitTreeEntry & { path: string; mode: '100644' | '100755' | '120000'; type: 'blob' } => (
    typeof entry.path === 'string'
    && entry.type === 'blob'
    && (entry.mode === '100644' || entry.mode === '100755' || entry.mode === '120000')
    && skillPrefixes.some((prefix) => entry.path.startsWith(prefix))
  ))
  .map((entry) => ({ path: entry.path, mode: entry.mode, type: entry.type, sha: null }));

for (const skill of selectedSkills) {
  if (!deletionEntries.some((entry) => entry.path === `.claude/skills/${skill}/SKILL.md`)) {
    throw new Error(`Harness skill files were missing for ${skill}`);
  }
}
```

- [ ] **Step 5: Cover readiness mocks and incomplete trees**

Return a complete recursive tree in the readiness-success mock. Add a rejection test where `truncated: true` and assert the helper stops before creating a commit with `GitHub did not return the complete generated repository tree`.

- [ ] **Step 6: Run backend tests and commit**

Run: `node --experimental-strip-types --test tests/harness-github.test.mjs`

Expected: all tests pass.

Commit:

```bash
git add src/lib/harness-github.ts tests/harness-github.test.mjs
git commit -m "fix: omit deselected Harness skills"
```

### Task 2: Make creation an unmistakable process state

**Files:**
- Modify: `public/harness-firmware/new/index.html`
- Modify: `public/harness-firmware/new/new-project.css`
- Modify: `public/harness-firmware/new/new-project.js`
- Modify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Write loading and copy contract assertions**

Assert the submit button exposes `aria-busy="false"`, JavaScript toggles `is-creating` and changes the label to `Assembling repository`, CSS gives `.action.is-creating` a cyan border and panel background, and `@keyframes creating-route` animates only transform. Assert the picker says deselected skills are omitted and the success string says `omitted from this repository`.

- [ ] **Step 2: Run the creator test and confirm it fails**

Run: `node --test tests/harness-creator.test.mjs`

Expected: FAIL on missing loading-state and omission-copy contracts.

- [ ] **Step 3: Update the button and selection copy**

Use named label and glyph spans so JavaScript does not depend on child order:

```html
<button class="action primary" type="submit" id="create-button" aria-busy="false">
  <span data-action-label>Create repository</span>
  <span data-action-glyph aria-hidden="true">-&gt;</span>
</button>
```

Change the picker helper to `Deselected skills are omitted from the generated repository`, and change the picker kicker from `REVERSIBLE` to `REPOSITORY CONTENTS`.

- [ ] **Step 4: Add the distinct animated process styling**

Keep the normal green clipped action unchanged. While creating, remove the clipped silhouette, use the dark panel and cyan border/text, add a stepped cyan beacon, and animate a cyan bottom route using transform only:

```css
.action.is-creating {
  position: relative;
  overflow: hidden;
  border-color: var(--blue);
  padding-left: 38px;
  color: var(--blue);
  background: var(--panel);
  clip-path: none;
  cursor: wait;
}
.action.is-creating::before { animation: creating-beacon 900ms steps(1, end) infinite; }
.action.is-creating::after { animation: creating-route 1.35s ease-in-out infinite; }
@keyframes creating-route {
  from { transform: translateX(-110%); }
  to { transform: translateX(330%); }
}
```

Replace the global reduced-motion `animation: none` rule with a one-frame duration and iteration count, keeping explicit final packet and install states so no meaning disappears.

- [ ] **Step 5: Centralize submit state in JavaScript**

Add `setCreateState(creating)` to toggle `isCreating`, disabled controls, the `is-creating` class, `aria-busy`, and the button strings. Call it before the fetch and in `finally`:

```js
function setCreateState(creating) {
  isCreating = creating;
  createButton.disabled = creating;
  skillTrigger.disabled = creating;
  createButton.classList.toggle('is-creating', creating);
  createButton.setAttribute('aria-busy', String(creating));
  createButton.querySelector('[data-action-label]').textContent = creating
    ? 'Assembling repository'
    : `Create with ${enabledSkillCount()} skills`;
  createButton.querySelector('[data-action-glyph]').textContent = creating ? 'Working' : '->';
}
```

Render a successful customized result as `${enabledCount} skills included. ${disabledCount} omitted from this repository.`

- [ ] **Step 6: Bump static asset cache keys and run the test**

Update both static asset query strings in `index.html` from `20260816a` to `20260816b`.

Run: `node --test tests/harness-creator.test.mjs`

Expected: all tests pass.

### Task 3: Align product and operations documentation

**Files:**
- Modify: `docs/specs/2026-08-11-new-project-creator.md`
- Modify: `docs/harness-github-app.md`

- [ ] **Step 1: Correct the hosted-boundary specification**

State that every file under `.claude/skills/<disabled>/` and `.agents/skills/<disabled>/` is omitted in the atomic configuration commit, with `.claude/settings.json` retaining the selected `"off"` values as metadata and defense in depth.

- [ ] **Step 2: Correct the deployment verification procedure**

Require verification that neither disabled directory exists, enabled and required directories remain, settings contain the chosen overrides, and no token appears in client surfaces.

- [ ] **Step 3: Run documentation and static contract checks**

Run: `rtk rg -n "remain in the repository|ready to restore|Canonical skill files remain" docs/specs/2026-08-11-new-project-creator.md docs/harness-github-app.md public/harness-firmware/new`

Expected: no stale creator behavior claim.

### Task 4: Verify and ship

**Files:**
- Verify: `src/lib/harness-github.ts`
- Verify: `public/harness-firmware/new/index.html`
- Verify: `public/harness-firmware/new/new-project.css`
- Verify: `public/harness-firmware/new/new-project.js`
- Verify: `tests/harness-github.test.mjs`
- Verify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Run focused tests**

Run: `node --experimental-strip-types --test tests/harness-github.test.mjs tests/harness-creator.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run the dependency-free suite**

Run all `.mjs` tests except the dependency-bound `tests/set-edge.test.mjs` with `node --experimental-strip-types --test`.

Expected: all runnable tests pass, with only documented skips.

- [ ] **Step 3: Run the targeted TypeScript check**

Run: `C:\Users\Home\CoreWise\PixelSwarm\node_modules\.bin\tsc.cmd -p .tmp\tsconfig-harness.json`

Expected: exit code 0.

- [ ] **Step 4: Review exact changes**

Run: `rtk git diff --check` and `rtk git diff --stat`.

Expected: no whitespace errors and only planned files changed.

- [ ] **Step 5: Commit remaining files**

```bash
git add public/harness-firmware/new/index.html public/harness-firmware/new/new-project.css public/harness-firmware/new/new-project.js tests/harness-creator.test.mjs docs/specs/2026-08-11-new-project-creator.md docs/harness-github-app.md docs/superpowers/plans/2026-08-16-harness-skill-omission-and-loading.md
git commit -m "feat: clarify Harness creation progress"
```

- [ ] **Step 6: Push, open the pull request, and wait for deployment checks**

Push `codex/harness-skill-selector`, open a pull request against `main`, and wait until Vercel and repository checks report success. Verify the preview HTML contains `Deselected skills are omitted from the generated repository` and the versioned stylesheet contains `.action.is-creating`.

- [ ] **Step 7: Squash merge under Auto-Merge Mode**

Merge only after required checks pass. Keep the working branch because session-wide Auto-Merge Mode forbids branch cleanup.
