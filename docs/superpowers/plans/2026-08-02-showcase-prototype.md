# Showcase Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/prototype/showcase` as an original fullbuild.ai reconstruction of the Noomo Showcase starter and 17-screen spatial project journey, excluding audio and external case-study pages.

**Architecture:** A routed Next prototype server-renders its interface and no-JS floor, then one client component owns a fixed R3F canvas and all interaction state. A single requestAnimationFrame authority renders a seeded scene of instanced fragments plus nine procedural project crystals carrying repository-owned project captures and deterministic fallbacks; native scroll supplies deterministic progress and fixed DOM overlays supply accessible copy. The stylesheet owns the visual contract, responsive transformation, starter, ledger, mobile menu, and finale.

**Tech Stack:** Next 15, React 19, TypeScript, Three 0.171, React Three Fiber 9, Three postprocessing, CSS Modules, Node test runner, bundled Playwright

---

No Git commit, push, PR, or deployment is part of this plan because the current request authorizes implementation and verification only.

## File structure

- Create `src/app/prototype/showcase/page.tsx`: route metadata and app mount
- Create `src/app/prototype/showcase/showcase.module.css`: binding contract, full visual system, responsive and accessibility states
- Create `src/components/showcase/ShowcaseApp.tsx`: accessible UI shell, loader/entry state, header, ledger, menu, finale, no-JS floor
- Create `src/components/showcase/ShowcaseScene.tsx`: R3F canvas, deterministic scene, scroll camera, crystals, postprocessing, capture hook
- Create `src/components/showcase/data.ts`: the nine real prototype records and scroll interpolation helpers
- Create `src/components/showcase/prng.ts`: seeded PRNG used by every generated transform
- Create `tests/prototype-showcase.test.mjs`: contract, deterministic behavior, voice, discoverability, and static integrity tests
- Modify `public/prototype/index.html`: add one gallery row for Showcase
- Create `.tmp/reference-forensics/noomo-showcase/capture-local.mjs`: local source-matched capture and assertion harness

### Task 1: Lock the prototype contract with failing tests

**Files:**

- Create: `tests/prototype-showcase.test.mjs`

- [ ] **Step 1: Write discoverability, rights, timing, and accessibility tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Showcase is discoverable and owns a written contract", async () => {
  const [gallery, page, app, scene, styles] = await Promise.all([
    read("public/prototype/index.html"),
    read("src/app/prototype/showcase/page.tsx"),
    read("src/components/showcase/ShowcaseApp.tsx"),
    read("src/components/showcase/ShowcaseScene.tsx"),
    read("src/app/prototype/showcase/showcase.module.css"),
  ]);
  assert.equal((gallery.match(/href="\/prototype\/showcase"/g) ?? []).length, 1);
  assert.match(page, /ShowcaseApp/);
  assert.match(app, /Get started/);
  assert.match(scene, /__showcaseCapture/);
  for (const term of ["Palette", "Type roles", "Motion verbs", "Signature", "Ban list", "Risk"]) {
    assert.ok(styles.includes(term), `missing ${term}`);
  }
});

test("Showcase ships nine projects on one 17-screen track", async () => {
  const [data, styles] = await Promise.all([
    read("src/components/showcase/data.ts"),
    read("src/app/prototype/showcase/showcase.module.css"),
  ]);
  assert.equal((data.match(/\n\s+id: "/g) ?? []).length, 9);
  assert.match(styles, /height:\s*1700(?:svh|vh)/);
});

test("Showcase keeps source assets forensic only", async () => {
  const files = await Promise.all([
    read("src/components/showcase/ShowcaseApp.tsx"),
    read("src/components/showcase/ShowcaseScene.tsx"),
    read("src/components/showcase/data.ts"),
    read("src/app/prototype/showcase/showcase.module.css"),
  ]);
  const shipped = files.join("\n");
  for (const forbidden of [
    "noomoagency.com",
    "casesStone16.glb",
    "newCell13.glb",
    "ShowcaseBG.mp3",
    "Coinbase.mp4",
    "ppneuemontreal",
  ]) assert.ok(!shipped.includes(forbidden), `source asset leaked: ${forbidden}`);
  assert.ok(!shipped.includes("Math.random"), "randomness must be seeded");
  assert.ok(!shipped.includes("—"), "voice contract forbids em dashes");
});

test("Showcase has real no-JS and reduced-motion floors", async () => {
  const [app, styles] = await Promise.all([
    read("src/components/showcase/ShowcaseApp.tsx"),
    read("src/app/prototype/showcase/showcase.module.css"),
  ]);
  assert.match(app, /<noscript>/);
  assert.match(app, /aria-live="polite"/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(styles, /animation:\s*none/);
  assert.match(styles, /:focus-visible/);
});
```

- [ ] **Step 2: Run the test and confirm the missing files fail**

Run: `node --test tests/prototype-showcase.test.mjs`

Expected: FAIL with `ENOENT` for `src/app/prototype/showcase/page.tsx`.

### Task 2: Add deterministic project truth and interpolation

**Files:**

- Create: `src/components/showcase/data.ts`
- Create: `src/components/showcase/prng.ts`
- Modify: `tests/prototype-showcase.test.mjs`

- [ ] **Step 1: Add the complete nine-project dataset**

```ts
export type ShowcaseProject = {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  palette: readonly [string, string, string];
  visual: "seam" | "assembly" | "scope" | "metal" | "market" | "loop" | "thread" | "weather" | "tide";
};

export const SHOWCASE_PROJECTS: readonly ShowcaseProject[] = [
  { id: "fault-line", title: "Fault Line", description: "One seam moves through four material phases and refuses a generic card stack.", tags: ["Prototype", "Motion", "Material"], palette: ["#ff3b2f", "#f4efdf", "#161616"], visual: "seam" },
  { id: "assembly-line", title: "Assembly Line", description: "Scroll becomes build time while one artifact changes state in a fixed production spine.", tags: ["Scroll", "WebGL", "Systems"], palette: ["#ffcf24", "#101010", "#e8e0cf"], visual: "assembly" },
  { id: "burn-in", title: "Burn-In", description: "A bench instrument measures the work and lets signal emerge from controlled noise.", tags: ["Instrument", "Shader", "Signal"], palette: ["#59ff89", "#07130c", "#d8ffe2"], visual: "scope" },
  { id: "quench", title: "Quench", description: "Liquid metal hardens phase by phase and keeps unshipped material visibly unsettled.", tags: ["WebGL", "Material", "Scroll"], palette: ["#ff5b14", "#120b08", "#f5d2b8"], visual: "metal" },
  { id: "fahrzeugmarkt", title: "Fahrzeugmarkt", description: "A used-car marketplace makes every visible filter correspond to a real query.", tags: ["Marketplace", "Vue", "Spring Boot"], palette: ["#f6dd3b", "#142033", "#e8edf5"], visual: "market" },
  { id: "loop-zero", title: "Loop Zero", description: "A private execution layer where agents run, fail, fix, and return with evidence.", tags: ["Agents", "Execution", "Proof"], palette: ["#aa7cff", "#101114", "#39d1df"], visual: "loop" },
  { id: "threadline", title: "Threadline", description: "Apparel operations connect PLM, 3D, compliance, and commerce without losing product truth.", tags: ["Operations", "React", "Spring Boot"], palette: ["#fd5321", "#11151d", "#d8dfef"], visual: "thread" },
  { id: "morrow", title: "Morrow", description: "Approved apparel product truth survives the move from internal workflow to customer choice.", tags: ["Storefront", "Commerce", "Product"], palette: ["#b8ff3e", "#151515", "#f1f0e8"], visual: "weather" },
  { id: "dead-low", title: "Dead Low", description: "A tide model turns a four-mile seabed crossing into one exact answer at the ramp.", tags: ["Service", "Live model", "Wayfinding"], palette: ["#ff3b0f", "#0b2e33", "#e4e4d6"], visual: "tide" },
] as const;

export const TRACK_SCREENS = 17;
export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const projectFloat = (progress: number) => clamp01(progress) * (SHOWCASE_PROJECTS.length - 1);
export const activeProjectIndex = (progress: number) => Math.min(SHOWCASE_PROJECTS.length - 1, Math.max(0, Math.round(projectFloat(progress))));
```

- [ ] **Step 2: Add the seeded generator**

```ts
export function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(next: () => number, min: number, max: number) {
  return min + (max - min) * next();
}
```

- [ ] **Step 3: Test the tails and deterministic sequence**

Add assertions that progress below zero maps to project 0, progress above one maps to project 8, and two `mulberry32(8162)` instances emit equal eight-value sequences.

- [ ] **Step 4: Run the data tests**

Run: `node --test tests/prototype-showcase.test.mjs`

Expected: contract test still fails on route/app/scene files; deterministic data assertions PASS.

### Task 3: Build a thin scene spike and prove Three 0.171 is sufficient

**Files:**

- Create: `src/components/showcase/ShowcaseScene.tsx`

- [ ] **Step 1: Create the scene API and one deterministic crystal**

The exported component must use this interface and capture contract:

```ts
export type ShowcaseSceneProps = {
  progress: number;
  entered: boolean;
  reducedMotion: boolean;
  onReady: () => void;
  onActiveProjectChange: (index: number) => void;
};

declare global {
  interface Window {
    __showcaseCapture?: {
      freeze: () => void;
      thaw: () => void;
      step: (milliseconds?: number) => void;
    };
  }
}
```

Render one `dodecahedronGeometry` with an authored `CanvasTexture`, one seeded `instancedMesh`, ambient and directional lights, and fog. Use `<Canvas frameloop="never">` plus one component-owned requestAnimationFrame loop calling `advance()` so freeze, thaw, and step control the only animation authority.

- [ ] **Step 2: Cap render cost and dispose generated resources**

Use `dpr={[1, mobile ? 1.25 : 1.5]}`. Dispose CanvasTextures and remove `window.__showcaseCapture` in effect cleanup. Pause the authority on `document.visibilitychange` and when the scene is frozen.

- [ ] **Step 3: Run typecheck as the thin end-to-end probe**

Run: `npm run typecheck`

Expected: PASS. A module-resolution failure for Three examples invalidates this architecture and requires switching the post pass to `@react-three/postprocessing`, not installing a new dependency.

### Task 4: Scale the scene to the complete journey

**Files:**

- Modify: `src/components/showcase/ShowcaseScene.tsx`

- [ ] **Step 1: Prepare nine repository-owned project textures with procedural fallbacks**

Capture the repository's own prototype routes into compact local WebP textures. Keep the source site's videos forensic-only. Each project also gets a deterministic generated fallback using its record's palette and visual enum, so a failed image request cannot blank the crystal.

- [ ] **Step 2: Author the camera track**

For project index `i`, place its crystal at `z = -i * 12`, alternate `x` between `-2.4` and `2.4`, and vary `y` using the seeded sequence. Camera `z` interpolates from `8` to `-(projectCount - 1) * 12 + 5`; each active crystal scales from `0.45` to `2.8` and back across a local chapter distance of `1.2`.

- [ ] **Step 3: Add the shader-grade surface treatment**

Use one persistent `EffectComposer` with `Bloom`, `Noise`, and `ChromaticAberration`. Gate effect parameters instead of mounting and unmounting the composer. Use blue fog, black/metal crystal shells, additive points, and an opaque black floorless background.

- [ ] **Step 4: Add pointer parallax and reduced motion**

On widths above 768px, normalize pointer to `[-1, 1]`, lerp by `0.08`, and offset camera by `0.36` x and `0.2` y. Reduced motion disables pointer response and continuous drift, selects the nearest chapter pose, and renders one finished frame after each scroll update.

- [ ] **Step 5: Re-run typecheck**

Run: `npm run typecheck`

Expected: PASS.

### Task 5: Build the accessible starter, interface, and finale

**Files:**

- Create: `src/components/showcase/ShowcaseApp.tsx`
- Create: `src/app/prototype/showcase/page.tsx`

- [ ] **Step 1: Create the route**

```tsx
import type { Metadata } from "next";
import { ShowcaseApp } from "@/components/showcase/ShowcaseApp";

export const metadata: Metadata = {
  title: "Showcase · Spatial Prototype Archive",
  description: "Nine fullbuild.ai prototypes preserved in one continuous spatial scroll.",
};

export default function ShowcasePage() {
  return <ShowcaseApp />;
}
```

- [ ] **Step 2: Implement state ownership**

`ShowcaseApp` owns `ready`, `entered`, `menuOpen`, `activeProject`, `progress`, and `reducedMotion`. One passive native scroll listener batches reads into the scene authority, computes `progress = scrollY / (documentElement.scrollHeight - innerHeight)`, and changes the active index only when `activeProjectIndex(progress)` changes.

- [ ] **Step 3: Render semantic controls and overlays**

Use a real `<button>` for `Get started`, the sound-looking inert tile (`aria-label="Audio omitted in this prototype"`, disabled), and the mobile menu. Use `<nav>` for external fullbuild destinations, an `<article aria-live="polite">` for the active project ledger, and a disabled visual CTA button labeled `View case study`. Do not mount inactive ledgers.

- [ ] **Step 4: Render the no-JS floor**

Inside `<noscript>`, render the prototype title, all nine project titles and descriptions, and the contact email. This content must be normal flow, not hidden behind the fixed canvas.

- [ ] **Step 5: Add the starter transition**

Scene readiness moves progress to 100 and exposes `Get started`. Activation scrolls to zero, sets `entered`, releases body scroll, and moves focus to the main showcase heading. No audio element is created.

### Task 6: Author the visual contract and responsive system

**Files:**

- Create: `src/app/prototype/showcase/showcase.module.css`

- [ ] **Step 1: Put the binding contract before every rule**

The comment must state Palette, Type roles, Grid, Motion verbs, Ban list, Signature, Risk, rejected alternatives, and the source-rights decision from `.tmp/reference-forensics/noomo-showcase/design-contract.md`.

- [ ] **Step 2: Declare the exact surface tokens**

```css
.shell {
  --void: #020411;
  --void-soft: #050516;
  --radiation: #0004eb;
  --frost: #d9e0ed;
  --cold-white: #d6e3fc;
  --ice: #d2e0ff;
  --pad: 2rem;
  min-height: 1700svh;
  background: var(--void);
  color: var(--frost);
  font-family: var(--font-archivo);
  font-size: 10px;
}
```

- [ ] **Step 3: Match desktop geometry**

Header: 15px top, 20px sides, 42px content height. Ledger: fixed 52px from bottom, 32px sides, grid columns 310px 523px, 77px gap. CTA: 32px tall, radiation ground, 20px mono. Project copy: 20px / 22px. Tags: 14px / 20px. Finale: full viewport with 6vw display text.

- [ ] **Step 4: Match mobile geometry**

Below 768px hide desktop nav, mail control, Info, and tags. Keep 16px inset, 30px inert sound tile, 30px 3x3 menu, one-column ledger 52px from bottom, and 34px project title. Finale email moves to the bottom and the display statement breaks into two centered lines.

- [ ] **Step 5: Add focus, reduced motion, and no-JS rules**

Every control gets a 2px radiation/frost registration outline with 3px offset. Reduced motion sets transition durations to `1ms`, leaves all project copy visible, and does not use `animation: none`. `noscript` content uses a normal-flow black page with visible headings.

### Task 7: Add gallery discovery and close static checks

**Files:**

- Modify: `public/prototype/index.html`
- Modify: `tests/prototype-showcase.test.mjs`

- [ ] **Step 1: Add one gallery row after Dead Low**

```html
<li>
  <a class="row" href="/prototype/showcase">
    <span class="num">13</span>
    <span>
      <h2>Showcase</h2>
      <p>Nine prototypes preserved inside one continuous field of fractured media.</p>
    </span>
    <span class="tags">
      <span class="tag tag--platform">Spatial portfolio · WebGL</span>
      <span class="tag tag--live">view</span>
    </span>
  </a>
</li>
```

- [ ] **Step 2: Run the focused contract suite**

Run: `node --test tests/prototype-showcase.test.mjs`

Expected: all tests PASS.

- [ ] **Step 3: Run all prototype contracts**

Run: `node --test tests/prototype-*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `$env:NEXT_DIST_DIR='.next-showcase-verify'; npm run build`

Expected: Next production build exits 0 and emits `/prototype/showcase`.

### Task 8: Compare, diagnose, and iterate until dry

**Files:**

- Create: `.tmp/reference-forensics/noomo-showcase/capture-local.mjs`
- Modify: any Showcase file named by a measured defect

- [ ] **Step 1: Start a fresh local server and sentinel-check it**

Use a unique free port. Confirm `/prototype/showcase` contains `Spatial Prototype Archive` before trusting any image.

- [ ] **Step 2: Capture the full acceptance matrix**

Use bundled Playwright at `390x844`, `768x900`, `1024x900`, `1280x900`, and `1440x900`. Capture starter, post-entry top, half-screen first project, every viewport-height stop, bottom, mobile menu, keyboard focus, and `reducedMotion: "reduce"`. Freeze through `window.__showcaseCapture.freeze()` before every screenshot and thaw after.

- [ ] **Step 3: Assert behavior mechanically**

Fail on console errors, failed required requests, horizontal overflow, a missing canvas, project count other than nine, scroll height outside one pixel of 1700 viewport heights, hidden active ledger, pointer interception, missing visible focus, blank no-JS content, or reduced-motion content left transformed offscreen.

- [ ] **Step 4: Grade frames against source evidence**

For each viewport, compare source and local contact sheets. Name every mismatch in header geometry, field density, camera scale, crystal ownership, ledger baseline, color/bleach timing, and finale composition. Fix the root cause, recapture all affected frames, and repeat until one complete pass has no must-fix visual or behavioral defect.

- [ ] **Step 5: Run the completion audit**

Re-run focused tests, all prototype tests, typecheck, production build, full screenshot matrix, keyboard flow, mobile menu, reduced motion, and no-JS. Inspect `git diff` to confirm no forensic source asset entered tracked paths and no unrelated user change was touched.
