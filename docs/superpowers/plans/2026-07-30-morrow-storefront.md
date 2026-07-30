# Morrow Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished customer-facing apparel storefront while clearly
retaining Threadline as the internal DPC operations prototype.

**Architecture:** Morrow is a new Next.js App Router prototype. A focused
commerce projection derives core style identity from Threadline fixtures and
adds shopper-specific data. Client state owns product configuration and bag
interactions; no external commerce behavior is implied.

**Tech Stack:** React 19, Next.js 15, TypeScript, CSS Modules, generated raster
campaign art, Node contract tests, Codex Browser

---

### Task 1: Lock the paired-surface contract

**Files:**
- Create: `tests/prototype-morrow.test.mjs`
- Modify: `tests/prototype-threadline.test.mjs`

- [ ] **Step 1: Write the failing Morrow contract**

Require `/prototype/morrow`, the gallery entry, `CUSTOMER STOREFRONT PROTOTYPE`,
collection browsing, color and size controls, simulated 3D copy, bag state,
cross-links, responsive rules, reduced motion, and focus-visible styles:

```js
for (const contract of [
  "CUSTOMER STOREFRONT PROTOTYPE",
  "Shop the collection",
  "Choose color",
  "Choose size",
  "SIMULATED 3D VIEW",
  "Add to bag",
  "aria-live",
  "/prototype/threadline",
]) {
  assert.match(app, new RegExp(contract));
}
```

- [ ] **Step 2: Extend the Threadline contract**

Assert that Threadline contains `INTERNAL DPC OPERATIONS PROTOTYPE` and links to
`/prototype/morrow`.

- [ ] **Step 3: Run the tests and confirm failure**

Run:

```bash
node --test tests/prototype-morrow.test.mjs tests/prototype-threadline.test.mjs
```

Expected: Morrow files and the new Threadline labels are absent.

### Task 2: Create the shared commerce projection

**Files:**
- Create: `src/lib/morrow/catalog.ts`

- [ ] **Step 1: Define shopper types**

Add `CommerceProduct`, `ProductColor`, `ProductSize`, and `BagLine` with exact
style identity, price, description, fit, material, care, traceability, swatches,
stock, and merchandising fields.

- [ ] **Step 2: Derive six products from Threadline**

Import `demoStyles` and enrich each style through an explicit metadata map.
Export `commerceProducts` and `formatPrice(cents)`; fail fast if a metadata
entry does not match an existing style ID.

- [ ] **Step 3: Type-check**

Run `npm run typecheck`.

Expected: PASS.

### Task 3: Build the Morrow shopper experience

**Files:**
- Create: `src/app/prototype/morrow/page.tsx`
- Create: `src/app/prototype/morrow/morrow.module.css`
- Create: `src/components/morrow/MorrowApp.tsx`
- Create: `src/components/morrow/ProductSilhouette.tsx`
- Create: `public/prototype/morrow/city-weather-campaign.png`

- [ ] **Step 1: Generate the campaign visual**

Use the built-in image generation tool to create original editorial apparel
photography: a model wearing a vermilion technical shell in a wet concrete city
setting, wide crop, useful negative space, no text, logo, or watermark. Copy the
selected final asset into the project path above.

- [ ] **Step 2: Add route metadata**

Set the page title to `Morrow — City / Weather` and describe it as a
customer-facing apparel storefront prototype.

- [ ] **Step 3: Build the catalog and hero**

Implement a sticky retail header, explicit prototype badge, editorial hero,
collection introduction, six product cards, and storefront-to-operations
cross-link.

- [ ] **Step 4: Build product configuration**

Use native dialog semantics for product detail. Support color and size
selection, sold-out size handling, fit/material/care details, and a range-based
simulated 3D view with an exact accessible value.

- [ ] **Step 5: Build bag state**

Disable add-to-bag until a size is selected. Add one configured line to local
bag state, announce it, render a native bag dialog, calculate subtotal with
`formatPrice`, and support line removal.

- [ ] **Step 6: Add responsive and accessible CSS**

Implement desktop, tablet, 390 px, and 320 px layouts; visible focus; 44 px
mobile targets; dialog backdrops; no page overflow; and reduced-motion
fallbacks. Do not use gradients, blur, or glass effects.

### Task 4: Clarify and connect Threadline

**Files:**
- Modify: `src/components/threadline/ThreadlineApp.tsx`
- Modify: `src/app/prototype/threadline/page.tsx`
- Modify: `src/app/prototype/threadline/threadline.module.css`
- Modify: `public/prototype/index.html`
- Modify: `showcase/threadline/README.md`

- [ ] **Step 1: Label the internal surface**

Add the exact `INTERNAL DPC OPERATIONS PROTOTYPE` label near the page identity,
retain `SIMULATED DATA`, and describe the intended internal users.

- [ ] **Step 2: Cross-link downstream**

Add a clear `View customer storefront` link to `/prototype/morrow`.

- [ ] **Step 3: Update discovery and interview documentation**

Describe Threadline as internal operations in the gallery. Add Morrow as entry
09 with a customer storefront label. Update the README with the paired-surface
story and a short shopper demo.

### Task 5: Verify and ship

**Files:**
- Modify: `docs/superpowers/plans/2026-07-30-morrow-storefront.md`

- [ ] **Step 1: Run contracts**

```bash
node --test tests/prototype-loop-zero.test.mjs tests/prototype-threadline.test.mjs tests/prototype-morrow.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript and production build**

```bash
npm run typecheck
NEXT_DIST_DIR=.next-morrow npm run build
```

Expected: `/prototype/threadline` and `/prototype/morrow` both statically
generate.

- [ ] **Step 3: Run backend verification**

From `showcase/threadline/backend`, run `mvn --batch-mode verify`.

Expected: 10 tests, 0 failures, 0 errors, 0 skipped.

- [ ] **Step 4: Verify with Codex Browser**

Use a fresh route load and sentinel checks. Inspect 1440 px, 900 px, 390 px, and
320 px widths. Exercise product selection, disabled and enabled add-to-bag
states, color selection, simulated 3D range, bag removal, Escape close, and both
cross-links.

- [ ] **Step 5: Audit and integrate**

Run `git diff --check`, inspect the exact staged paths, commit on the retained
session branch, push, create one new PR because PR #108 is merged, wait for
required checks, and squash-merge without deleting the branch.
