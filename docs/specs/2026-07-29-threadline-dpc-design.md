# Threadline DPC Prototype — Product and Technical Design

**Status:** Approved by the request to select and build the strongest role-specific prototype
**Audience:** Apparel product teams, technical leads, and interviewers
**Prototype boundary:** Interactive local demo with deterministic data; production architecture is represented by inspectable source and deployment artifacts, not a claimed live enterprise integration

## 1. Outcome

Threadline is an apparel digital product creation (DPC) launch-readiness control tower. It turns fragmented Centric PLM, CLO 3D, compliance, costing, and commerce events into one prioritized view of which styles can launch, which are blocked, and why.

The prototype must prove four things within two minutes:

1. The candidate understands apparel product development, not only generic dashboards.
2. The interface makes a complex operational problem immediately legible.
3. The code demonstrates React and Java/Spring Boot boundaries, API integration, database design, security, performance, CI/CD, AKS, and ArgoCD.
4. Every claim is honest: simulated data is labeled, deploy artifacts are reference architecture, and unavailable integrations are not presented as live.

## 2. Product decision

### Chosen direction: launch-readiness control tower

A launch-readiness workflow is stronger than a generic PLM clone or consumer storefront because it exposes the integration and automation work described by the role. It creates a natural place to demonstrate event ingestion, validation, prioritized exceptions, data lineage, and resilient cloud deployment.

### Rejected directions

- **Generic collection dashboard:** attractive but weak technical depth.
- **Consumer outfit builder:** visually engaging but poorly aligned with enterprise DPC responsibilities.
- **Full PLM replacement:** implausibly broad for a prototype and would invite shallow, fabricated behavior.

## 3. Users and jobs

### Product developer

- See whether a style is ready for handoff.
- Understand the highest-impact blocker without opening several systems.
- Confirm source freshness and ownership.

### Technical designer

- See CLO asset, fit, material, and colorway validation state.
- Resolve or acknowledge a correctable validation issue.

### Integration engineer / technical lead

- Inspect each style’s data lineage.
- Retry a failed sync safely.
- See idempotency, observability, and deployment contracts.

## 4. Primary flow

1. User lands on **Launch Control** for `FW26 / North America`.
2. Hero summary answers: launch date, readiness percent, ready styles, blocked styles, and active integrations.
3. A prioritized **Exception Queue** surfaces the most consequential blocker.
4. User selects a style from the collection table.
5. **Style Inspector** reveals milestone readiness, source systems, freshness, owner, and issue details.
6. User resolves the prototype’s safe simulated issue or retries an integration event.
7. Readiness, queue order, event log, and style state update together.
8. **System Map** explains the production path: Centric/CLO webhooks → Spring Boot API → validation/automation → PostgreSQL → downstream commerce, with GitHub Actions → ACR → ArgoCD → AKS for delivery.

## 5. Interface

### Visual language

- Editorial operations room, not template SaaS.
- Ink navy, bone canvas, signal orange, readiness green, and electric blue.
- Apparel construction cues: pattern notches, seam lines, measurement ticks, fabric swatches, and garment silhouettes.
- No gradients, glassmorphism, stock imagery, or decorative charts without decisions attached.
- Dense information uses strong hierarchy, whitespace, and tabular numerals.

### Desktop composition

- Slim product rail with season and environment.
- Main header with collection status and demo-data badge.
- Readiness summary band.
- Two-column workspace:
  - left: prioritized exception queue and collection table;
  - right: sticky style inspector with garment illustration and milestone rail.
- Lower sections: integration event stream and production system map.

### Mobile composition

- Rail becomes compact top bar.
- Summary cards scroll horizontally.
- Queue and collection become stacked cards.
- Inspector follows selected style and remains fully usable.
- System map becomes a vertical flow.

### States

- Initial deterministic loaded state.
- Style selected state.
- Blocker resolved state with reversible “reset demo”.
- Integration retry state: queued → processing → healthy.
- Empty exception queue after all resolvable demo issues close.
- Reduced-motion state removes transitions without removing information.

## 6. Domain model

### StyleSummary

- `id`, `styleNumber`, `name`, `category`, `owner`
- `colorways`, `targetMargin`, `launchDate`
- `readiness` (0–100), `status`
- `thumbnailVariant`
- milestone states for `plm`, `threeD`, `materials`, `costing`, `compliance`, `commerce`
- `blockers[]`, `updatedAt`

### Blocker

- `id`, `styleId`, `severity`, `code`, `title`, `detail`
- `source`, `owner`, `ageHours`
- `resolvableInDemo`, `resolutionAction`

### IntegrationEvent

- `id`, `styleId`, `source`, `type`, `state`
- `occurredAt`, `correlationId`, `attempt`

### Readiness rule

Readiness is the percentage of completed required milestones. Any critical blocker caps status at `blocked`; otherwise 100 is `ready`, 70–99 is `at-risk`, and lower values are `in-progress`.

## 7. Technical architecture

### Interactive portfolio surface

- Next.js App Router and React 19 client component.
- TypeScript domain types and deterministic fixture adapter.
- CSS Module with design tokens, responsive states, keyboard focus, reduced motion, and high-contrast status shapes plus text labels.
- No production API claim. UI explicitly says `SIMULATED DATA`.

### Production reference service

- Java 21 and Spring Boot 4.1.
- REST endpoints for readiness summaries, style inspection, event ingestion, blocker resolution, and integration retry.
- PostgreSQL as runtime database.
- Portable JPA mappings and configuration profile for Microsoft SQL Server.
- Flyway schema with indexed style, milestone, blocker, and integration-event tables.
- Inbound webhook contract uses timestamped HMAC signature validation, idempotency keys, and correlation IDs.
- Optimistic locking protects concurrent resolution.
- Cursor pagination bounds event-stream reads.
- Actuator health/readiness endpoints support Kubernetes probes.

### Delivery

- GitHub Actions runs Node contract/type/build checks and Maven verification.
- Container image is built once, signed/attested by the intended pipeline, and pushed to Azure Container Registry.
- Kubernetes manifests set non-root security context, resource requests/limits, probes, autoscaling, disruption budget, and workload identity service account.
- ArgoCD Application pulls the Git-tracked desired state into AKS. CI does not receive broad cluster credentials.

## 8. Security and performance contracts

- Demo mutation is in-memory and reversible.
- Production mutation endpoints require authorization scopes.
- Webhook payloads have size limits, signature verification, replay window, idempotency, and schema validation.
- Secrets are referenced from Azure Key Vault through workload identity; none live in Git.
- Structured logs contain correlation IDs but no apparel asset payloads or personal data.
- Database indexes cover season/status queries and integration-event chronology.
- Summary queries use projections rather than materializing full style graphs.
- API responses support ETag/conditional reads.

## 9. Verification

### Automated

- Node contract test checks route, gallery entry, semantic regions, demo label, keyboard controls, responsive/reduced-motion CSS, and architecture source artifacts.
- TypeScript typecheck and Next production build.
- Spring service unit/integration tests when Maven dependencies are available.
- YAML/static contract checks for required AKS and ArgoCD safety settings.

### Visual

- Codex Browser verifies desktop and mobile layouts, interactions, focus, and
  reduced-motion behavior. Standalone Playwright remains a fallback only.
- Verify unique sentinel text to exclude stale-server screenshots.
- Check no horizontal overflow, legible 320px layout, keyboard focus, selected-style behavior, issue resolution, retry progression, and reduced-motion rendering.

## 10. Non-goals

- No Centric or CLO credentials.
- No reverse-engineered vendor API contracts.
- No claim that reference Kubernetes resources were deployed.
- No authentication UI.
- No attempt to replace an enterprise PLM.
- No fabricated business ROI.
