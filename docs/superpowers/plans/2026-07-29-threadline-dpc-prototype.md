# Threadline DPC Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interview-ready apparel DPC launch-readiness prototype with a working React surface and inspectable Spring Boot, PostgreSQL, CI, AKS, and ArgoCD reference implementation.

**Architecture:** A Next.js React route uses a deterministic in-memory adapter so the portfolio demo is reliable and honest. A separate Spring Boot service expresses the production API, persistence, security, and integration boundaries; GitHub Actions and GitOps manifests show the deployment path without claiming it was deployed.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Java 21, Spring Boot 4.1, PostgreSQL, Microsoft SQL Server profile, Flyway, GitHub Actions, Kubernetes/AKS, ArgoCD

---

## File map

- `src/app/prototype/threadline/page.tsx`: route metadata and server shell.
- `src/app/prototype/threadline/threadline.module.css`: complete responsive visual system.
- `src/components/threadline/ThreadlineApp.tsx`: accessible client interactions and derived readiness state.
- `src/components/threadline/Garment.tsx`: reusable apparel-specific SVG illustrations.
- `src/lib/threadline/domain.ts`: types, fixtures, and pure readiness calculations.
- `tests/prototype-threadline.test.mjs`: zero-dependency portfolio and infrastructure contract.
- `public/prototype/index.html`: prototype gallery entry.
- `showcase/threadline/README.md`: interviewer-oriented architecture, runbook, tradeoffs, and truthful status.
- `showcase/threadline/backend/pom.xml`: Java build and dependencies.
- `showcase/threadline/backend/src/main/**`: Spring API, security, ingestion, persistence, and configuration.
- `showcase/threadline/backend/src/test/**`: domain, API, and webhook tests.
- `showcase/threadline/backend/src/main/resources/db/migration/V1__baseline.sql`: portable relational schema and indexes.
- `showcase/threadline/infra/**`: container, Kubernetes, and ArgoCD desired state.
- `.github/workflows/threadline-ci.yml`: scoped CI verification.

### Task 1: Lock the public contract

**Files:**
- Create: `tests/prototype-threadline.test.mjs`

- [ ] **Step 1: Write the failing contract test**

Use Node’s built-in test runner. Assert the gallery has one `/prototype/threadline` link; the React page contains `THREADLINE`, `SIMULATED DATA`, `Exception queue`, `Collection readiness`, `Integration pulse`, and `System map`; the CSS contains desktop, `900px`, `620px`, reduced-motion, and focus-visible rules; and the showcase contains `pom.xml`, `Dockerfile`, `deployment.yaml`, `application.yaml`, and CI workflow.

- [ ] **Step 2: Verify red**

Run: `node --test tests/prototype-threadline.test.mjs`
Expected: FAIL because Threadline files do not exist.

### Task 2: Implement domain model and fixtures

**Files:**
- Create: `src/lib/threadline/domain.ts`

- [x] **Step 1: Define exact domain types**

Define `MilestoneKey`, `MilestoneState`, `StyleStatus`, `Blocker`, `StyleSummary`, and `IntegrationEvent`. Keep the UI’s status vocabulary to `ready | at-risk | blocked | in-progress`.

- [x] **Step 2: Add deterministic fixtures**

Create six FW26 styles across outerwear, knitwear, bottoms, and accessories. Include one critical material-compliance blocker, one CLO colorway mismatch, one failed PLM event, two ready styles, and one in-progress style.

- [x] **Step 3: Add pure selectors**

Implement:

```ts
export function readinessFor(style: StyleSummary): number {
  const values = Object.values(style.milestones);
  return Math.round((values.filter((state) => state === "complete").length / values.length) * 100);
}

export function statusFor(style: StyleSummary): StyleStatus {
  if (style.blockers.some((blocker) => blocker.severity === "critical")) return "blocked";
  const readiness = readinessFor(style);
  if (readiness === 100) return "ready";
  if (readiness >= 70) return "at-risk";
  return "in-progress";
}
```

### Task 3: Build the React control tower

**Files:**
- Create: `src/app/prototype/threadline/page.tsx`
- Create: `src/components/threadline/ThreadlineApp.tsx`
- Create: `src/components/threadline/Garment.tsx`

- [x] **Step 1: Create the route shell**

Export metadata with title `Threadline — Apparel DPC Launch Control` and render `<ThreadlineApp />`.

- [x] **Step 2: Build navigation and launch summary**

Implement a labeled simulated-data badge, season selector, launch countdown, readiness score, ready/blocked counts, and integration health. Use semantic `<header>`, `<nav>`, `<main>`, `<section>`, and `<table>` elements.

- [x] **Step 3: Build exception queue and collection table**

Each blocker button selects its style. Each style row is keyboard actionable, exposes an explicit status label, and updates `aria-current`. Sorting is deterministic: critical blockers, warning blockers, then readiness ascending.

- [x] **Step 4: Build style inspector**

Render garment SVG, style number, name, owner, launch date, margin, colorways, milestone rail, blockers, source freshness, and selected event correlation ID.

- [x] **Step 5: Build safe interactions**

`Resolve demo issue` removes only blockers with `resolvableInDemo`, marks the matching milestone complete, and appends an audit event. `Retry sync` moves the failed PLM event through processing to healthy. `Reset demo` restores fixtures. Every mutation announces through an `aria-live` region.

- [x] **Step 6: Build integration pulse and system map**

Render visible source → ingest → validate → persist → publish flow plus GitHub → ACR → ArgoCD → AKS delivery path. Label production-only boundaries.

### Task 4: Create intentional responsive styling

**Files:**
- Create: `src/app/prototype/threadline/threadline.module.css`

- [x] **Step 1: Add tokens and apparel construction language**

Use ink, bone, orange, green, and blue tokens; tabular numerals; 1px rules; pattern notches; stitch dashes; garment swatches; and strong typographic hierarchy. Do not use gradients, blur, or stock imagery.

- [x] **Step 2: Add layouts**

Desktop uses a slim rail, full-width summary, 8/4 content grid, and sticky inspector. At `900px`, collapse to one column. At `620px`, use compact cards and horizontal summary scroll. At `360px`, preserve 16px minimum body text and no horizontal page overflow.

- [x] **Step 3: Add accessible states**

Provide `:focus-visible`, non-color status shapes and labels, `prefers-reduced-motion`, `prefers-contrast`, hover only inside `@media (hover: hover)`, and 44px minimum interactive targets.

### Task 5: Add the Spring Boot production contract

**Files:**
- Create: `showcase/threadline/backend/pom.xml`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/ThreadlineApplication.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/readiness/ReadinessController.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/readiness/ReadinessService.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/readiness/StyleEntity.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/readiness/StyleRepository.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/integration/WebhookController.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/integration/WebhookSignatureVerifier.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/integration/IdempotencyService.java`
- Create: `showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/config/SecurityConfiguration.java`
- Create: `showcase/threadline/backend/src/main/resources/application.yml`
- Create: `showcase/threadline/backend/src/main/resources/db/migration/V1__baseline.sql`
- Create: `showcase/threadline/backend/src/test/java/ai/fullbuild/threadline/readiness/ReadinessServiceTest.java`
- Create: `showcase/threadline/backend/src/test/java/ai/fullbuild/threadline/integration/WebhookSignatureVerifierTest.java`

- [x] **Step 1: Configure the build**

Use Spring Boot `4.1.0`, Java 21, web, validation, data-jpa, actuator, security, OAuth2 resource server, PostgreSQL, SQL Server runtime driver, Flyway, and Testcontainers test dependencies.

- [x] **Step 2: Implement read contracts**

Expose:

```text
GET /api/v1/seasons/{season}/readiness
GET /api/v1/styles/{styleId}
GET /api/v1/integrations/events?cursor={cursor}&limit={1..100}
```

Use projection DTOs, bounded pagination, ETag responses, and indexed repository queries.

- [x] **Step 3: Implement mutation contracts**

Expose:

```text
POST /api/v1/integrations/{source}/events
POST /api/v1/blockers/{blockerId}/resolve
POST /api/v1/integrations/events/{eventId}/retry
```

Require `Idempotency-Key`, `X-Webhook-Timestamp`, `X-Webhook-Signature`, and `X-Correlation-Id` for webhook ingest. Reject replays outside five minutes.

- [x] **Step 4: Implement schema**

Create `style`, `milestone`, `blocker`, `integration_event`, and `idempotency_record` tables with UUID primary keys, optimistic `version`, UTC timestamps, foreign keys, unique idempotency key, and indexes on `(season, status)`, `(style_id, severity)`, and `(source, occurred_at desc)`.

- [x] **Step 5: Add tests**

Test readiness calculation, critical-blocker status capping, constant-time HMAC verification, expired timestamp rejection, and duplicate idempotency behavior.

### Task 6: Add delivery architecture

**Files:**
- Create: `showcase/threadline/infra/Dockerfile`
- Create: `showcase/threadline/infra/k8s/base/deployment.yaml`
- Create: `showcase/threadline/infra/k8s/base/service.yaml`
- Create: `showcase/threadline/infra/k8s/base/hpa.yaml`
- Create: `showcase/threadline/infra/k8s/base/pdb.yaml`
- Create: `showcase/threadline/infra/k8s/base/kustomization.yaml`
- Create: `showcase/threadline/infra/argocd/application.yaml`
- Create: `.github/workflows/threadline-ci.yml`

- [x] **Step 1: Containerize safely**

Use a multi-stage Temurin 21 build, copy only the layered JAR into a JRE image, run as numeric non-root user, expose 8080, and add no secrets.

- [x] **Step 2: Define AKS workload**

Set `runAsNonRoot`, read-only root filesystem, dropped capabilities, seccomp runtime default, 250m/512Mi requests, 1 CPU/1Gi limits, startup/readiness/liveness probes, rolling update, topology spread, and workload-identity service account.

- [x] **Step 3: Define resilience**

Autoscale 2–8 replicas at 70% CPU and 75% memory. Require one available pod through a disruption budget.

- [x] **Step 4: Define GitOps**

ArgoCD Application targets `showcase/threadline/infra/k8s/overlays/prod`, uses automated prune/self-heal, creates namespace, and retries with bounded backoff.

- [x] **Step 5: Define CI**

On pull requests touching Threadline, run Node contract/type/build checks and Maven verify. On protected release tags, build the image, push to ACR using OIDC, create provenance, and update the GitOps image digest through a reviewable change. Never give CI cluster-admin credentials.

### Task 7: Write interviewer handoff and gallery entry

**Files:**
- Create: `showcase/threadline/README.md`
- Modify: `public/prototype/index.html`

- [x] **Step 1: Add gallery entry**

Add item `08`, title `Threadline`, copy `Apparel launch control across PLM, 3D, compliance, and commerce.`, platform tag `React + Spring Boot`, and route `/prototype/threadline`.

- [x] **Step 2: Write evidence-first README**

Cover problem, two-minute demo script, architecture, API, data model, security, performance, testing, CI/CD, tradeoffs, local commands, and verified/not-verified matrix. Link the portfolio route and every production artifact.

### Task 8: Verify and refine

**Files:**
- Modify: any Threadline file proven defective by verification

- [x] **Step 1: Run contract test**

Run: `node --test tests/prototype-threadline.test.mjs`
Expected: all Threadline contract tests pass.

- [x] **Step 2: Run project checks**

Run: `npm run typecheck` and `NEXT_DIST_DIR=.next-threadline npm run build`.
Expected: both exit 0.

- [x] **Step 3: Run backend checks when dependencies are available**

Run from `showcase/threadline/backend`: `mvn --batch-mode verify`.
Expected: unit and Testcontainers tests pass. If Maven or Docker is unavailable, report the exact unverified layer.

- [x] **Step 4: Visual verification**

Serve the current worktree on a unique port. Use the in-app Codex Browser for
1440×1100, 900×1100, 390×844, and 320×700 checks. Confirm the `THREADLINE`
sentinel through `textContent`, then inspect initial, selected, resolved, retry,
and reset states. Use standalone Playwright only if Codex Browser cannot perform
a necessary check.

- [x] **Step 5: Adversarial pass**

Test keyboard-only operation, no-JS server shell, reduced motion, empty blocker state, long style names, source failure, smallest viewport, and no horizontal overflow. Fix every observed defect.

- [x] **Step 6: Re-run all available checks**

Expected: contract, type, build, and visual checks pass; unavailable infrastructure checks remain explicitly marked.
