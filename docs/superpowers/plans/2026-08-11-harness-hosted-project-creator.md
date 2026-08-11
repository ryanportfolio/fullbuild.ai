# Harness Hosted Project Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Greptile-inspired creation demo to the Harness product page and a secure hosted GitHub template creator at `/harness-firmware/new`.

**Architecture:** Keep the product and creator surfaces framework-free under `public/harness-firmware/`. Add narrow Next route handlers for GitHub App installation and repository creation. Pure helpers own signing, App JWT creation, validation, and GitHub requests so route files remain auditable.

**Tech Stack:** Static HTML/CSS/JavaScript, Next.js route handlers, Node crypto, GitHub REST API, Node test runner, Playwright

---

### Task 1: Pin the hosted auth contract

**Files:**
- Create: `src/lib/harness-github.ts`
- Create: `tests/harness-github.test.mjs`

- [ ] **Step 1: Write the failing helper contract test**

Assert that project names accept `my-app`, reject whitespace and all-dot names, signed installation payloads reject tampering, and configuration reports false when the four required variables are absent.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/harness-github.test.mjs`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure helpers**

Implement these interfaces without GitHub SDK dependencies:

```ts
export interface HarnessInstallation {
  installationId: number;
  owner: string;
  issuedAt: number;
}

export function githubAppConfigured(env?: NodeJS.ProcessEnv): boolean;
export function validateProjectName(value: string): boolean;
export function signInstallation(value: HarnessInstallation, secret: string): string;
export function verifyInstallation(value: string, secret: string): HarnessInstallation | null;
export function createAppJwt(appId: string, privateKey: string, now?: number): string;
```

Use HMAC-SHA256 for signed cookies, RS256 for the GitHub App JWT, constant-time signature comparison, and no token persistence.

- [ ] **Step 4: Run the focused test**

Expected: PASS.

### Task 2: Add GitHub App routes with safe fallback

**Files:**
- Create: `src/app/api/harness/github/status/route.ts`
- Create: `src/app/api/harness/github/connect/route.ts`
- Create: `src/app/api/harness/github/callback/route.ts`
- Create: `src/app/api/harness/github/create/route.ts`
- Create: `src/app/api/harness/github/disconnect/route.ts`

- [ ] **Step 1: Add status and connect routes**

`status` returns `{ configured, connected, owner, fallbackUrl }`. `connect` creates a signed ten-minute state cookie and redirects to the configured GitHub App installation URL. Without configuration it redirects to `https://github.com/ryanportfolio/Harness-Firmware/generate`.

- [ ] **Step 2: Add callback route**

Validate the returned state against the HttpOnly cookie, fetch the installation account with an App JWT, then store only `{ installationId, owner, issuedAt }` in a signed HttpOnly cookie.

- [ ] **Step 3: Add create route**

Validate same-origin requests, the signed installation cookie, project name, description length, and visibility. Mint a one-hour installation token server-side, call `POST /repos/ryanportfolio/Harness-Firmware/generate`, discard the token, and return `{ ok, name, owner, url }`.

- [ ] **Step 4: Add disconnect route**

Clear the installation cookie and return `{ ok: true }`.

- [ ] **Step 5: Run type checking**

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Build the hosted New Project surface

**Files:**
- Create: `public/harness-firmware/new/index.html`
- Create: `public/harness-firmware/new/new-project.css`
- Create: `public/harness-firmware/new/new-project.js`
- Modify: `next.config.mjs`

- [ ] **Step 1: Add the clean route rewrite**

Map `/harness-firmware/new` to `/harness-firmware/new/index.html` before the general Harness product rewrite.

- [ ] **Step 2: Build the static form**

Render project name, description, private/public choice, GitHub connection state, an exact inclusion list, live progress, fallback action, and an accessible success panel. The title is `New Project`.

- [ ] **Step 3: Wire progressive behavior**

On load, read status. Connected users submit to the create route. Unconfigured users receive the GitHub template action. Keep complete instructions in the HTML so no-JS users can still create through GitHub.

- [ ] **Step 4: Add reduced-motion and focus states**

Reduced motion shows the final pipeline state. Every control uses a drawn focus box. No hidden content depends on animation.

### Task 4: Add the product-page creation story

**Files:**
- Modify: `public/harness-firmware/index.html`
- Modify: `public/harness-firmware/src/phosphor.css`
- Modify: `public/harness-firmware/src/phosphor.js`
- Modify: `tests/harness-firmware.test.mjs`

- [ ] **Step 1: Write structure assertions**

Assert `#create` exists before `#kernel`, its CTA points to `/harness-firmware/new`, and its inclusion list names memory, skills, Claude Code, and Codex without claiming shared memories.

- [ ] **Step 2: Add the section**

Build a form-to-repository-to-Harness visual sequence using original inline SVG and the existing CHARGE, ROUTE, and RETAIN motion vocabulary.

- [ ] **Step 3: Promote creation in the hero**

Make `CREATE A PROJECT` the primary CTA and keep the GitHub template as the direct fallback.

- [ ] **Step 4: Run tests**

Run: `node --test tests/harness-firmware.test.mjs tests/harness-github.test.mjs`

Expected: PASS.

### Task 5: Verify rendered states

**Files:**
- Modify: `.tmp/reference-forensics/greptile-harness/capture-refactor.mjs`

- [ ] **Step 1: Capture the product demo and creator**

Capture 1440x900, 820x900, 390x844, and 320x720, plus reduced-motion and no-JS creator states.

- [ ] **Step 2: Grade the frames**

Check focal hierarchy, overflow, clipped form controls, blank SVG states, heading punctuation, exact skill links, console errors, failed requests, and keyboard completion.

- [ ] **Step 3: Run final verification**

Run `npm run typecheck`, `npm run build`, and the focused Node tests. Record GitHub App live creation as unverified until credentials exist.
