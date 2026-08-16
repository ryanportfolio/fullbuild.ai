# Harness Generation Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the hosted creator waiting through GitHub's asynchronous template initialization so selected skills are applied instead of reporting that the newly created repository is empty.

**Architecture:** `applyRepositorySkillSelection` will poll the exact `.claude/settings.json` readiness signal with a bounded backoff instead of assuming template contents exist within 2.25 seconds. The retry policy remains dependency-free and injectable for fast deterministic tests, while the route keeps its existing honest partial-success response if GitHub still does not become ready.

**Tech Stack:** TypeScript, Next.js route handlers, GitHub REST API, Node test runner

---

### Task 1: Reproduce the empty-repository race

**Files:**
- Modify: `tests/harness-github.test.mjs`

- [ ] **Step 1: Add a failing retry regression test**

Add a test where the first five reads of `.claude/settings.json` return GitHub's real `404` payload:

```js
Response.json({ message: 'This repository is empty.' }, { status: 404 })
```

Return the settings file on the sixth read, stub the remaining Git Data API calls, inject a delay function that records wait durations without sleeping, and assert that customization completes.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/harness-github.test.mjs`

Expected: FAIL because the current implementation stops after the fifth settings read.

### Task 2: Poll template readiness with a bounded backoff

**Files:**
- Modify: `src/lib/harness-github.ts`
- Modify: `tests/harness-github.test.mjs`

- [ ] **Step 1: Add an injectable delay contract**

Extend the helper input without changing route callers:

```ts
sleep?: (milliseconds: number) => Promise<void>;
```

Default it to a Promise-backed timer in production. Tests pass a resolved recorder.

- [ ] **Step 2: Replace the five-attempt loop**

Use this fixed readiness schedule between attempts:

```ts
const GENERATED_REPOSITORY_RETRY_DELAYS_MS = [
  250, 500, 1000, 1500, 2000, 2500, 3000, 3000, 3000, 3000,
];
```

Retry only `GithubApiError` status `404`. Return immediately when `.claude/settings.json` exists. Re-throw non-404 failures and the final 404 unchanged so the route preserves the repository URL and warning.

- [ ] **Step 3: Assert the backoff and terminal behavior**

Assert the sixth-read success waits `[250, 500, 1000, 1500, 2000]`. Add a terminal test that returns 404 for every read, verifies eleven reads and all ten scheduled delays, and confirms the final GitHub error is preserved.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/harness-github.test.mjs`

Expected: PASS with the generation-readiness regression covered.

### Task 3: Improve production diagnosis without leaking credentials

**Files:**
- Modify: `src/app/api/harness/github/create/route.ts`
- Modify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Log a structured safe failure summary**

Replace the raw error log with only the repository full name, GitHub status when available, and error message:

```ts
console.error('Harness skill customization failed after repository creation', {
  repository: repository.full_name,
  status: error instanceof GithubApiError ? error.status : null,
  message: error instanceof Error ? error.message : 'Unknown customization error',
});
```

Do not log the user access token, cookies, request body, or disabled skill list.

- [ ] **Step 2: Pin the safe logging contract**

Assert the route contains the structured fields and does not pass the raw error object to `console.error`.

- [ ] **Step 3: Run creator tests**

Run: `node --test tests/harness-creator.test.mjs`

Expected: PASS.

### Task 4: Verify and ship the production fix

**Files:**
- Verify: `src/lib/harness-github.ts`
- Verify: `src/app/api/harness/github/create/route.ts`
- Verify: `tests/harness-github.test.mjs`
- Verify: `tests/harness-creator.test.mjs`

- [ ] **Step 1: Run focused verification**

Run: `node --test tests/harness-github.test.mjs tests/harness-creator.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run all dependency-free tests**

Run every `tests/*.test.mjs` file except `tests/set-edge.test.mjs`, whose Playwright dependency is not installed in this worktree.

Expected: all runnable tests pass, with only intentional skips.

- [ ] **Step 3: Run targeted TypeScript and diff checks**

Run the existing targeted Harness TypeScript configuration, then `git diff --check` and `rtk git diff`.

Expected: no type errors, whitespace errors, secrets, or unrelated changes.

- [ ] **Step 4: Ship through the active merge workflow**

Stage only the plan, helper, route, and two test files. Commit, push the existing `codex/harness-skill-selector` branch, open or reuse its PR, wait for Vercel, and squash-merge to `main` without deleting the branch.

- [ ] **Step 5: Verify production behavior**

Confirm the merged production deployment passes. Ask the user to run one new repository creation because an end-to-end creator check necessarily creates an external GitHub repository; if it fails, use the new structured production log to identify the exact remaining GitHub API step.
