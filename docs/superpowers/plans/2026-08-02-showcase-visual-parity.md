# Showcase Exact-Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/prototype/showcase` so the source recording's composition, material, continuous ready-state sculpture, Get Started fracture, blue spatial field, and project-camera choreography are recognizably matched while retaining FullBuild prototypes, identity, and copy.

**Architecture:** Keep one Next route, one R3F canvas, one seeded field, and the existing 17-screen scroll document. Replace the DOM thumbnail collage and wire sphere with an R3F cell sculpture; drive its continuous ready motion and fracture from the canvas clock; retain the gate briefly after activation so the transition can finish; then reveal a saturated multi-facet project crystal and keep the same camera authority through all nine chapters.

**Tech Stack:** Next 15, React 19, TypeScript, React Three Fiber, Three, `@react-three/postprocessing`, CSS Modules, Node test runner, Playwright, ffmpeg evidence extraction

---

No commit, push, PR, publication, dependency installation, or external deployment is authorized by this plan.

## Evidence and exact target

- Source recording: `C:/Users/Home/Desktop/2026-08-02 21-58-16.mp4`, 1920x1080, 60fps, 35.03 seconds.
- Ready-state evidence: `.tmp/reference-forensics/noomo-showcase/user-video/frame-001.jpg` through `frame-020.jpg`.
- Transition evidence: source recording frames 20 through 27 at two frames per second.
- Project evidence: `.tmp/reference-forensics/noomo-showcase/user-video/storyboard-2fps-01.png` and `storyboard-2fps-02.png`.
- Source motion target: a rotating hollow cross/ring made from glossy rectangular media cells; activation resolves the cells to cracked wire shells, expands the ring toward camera, explodes it into a dense field, then brings the first saturated project crystal forward without requiring initial scroll.
- Project interaction target: resting crystal shows one clean readable project surface; pointer hover fractures that surface into the supplied glass/ice kaleidoscope, increases chromatic split, and adds pointer-following rotation. The user's hover screenshot is `C:/Users/Home/AppData/Local/Temp/codex-clipboard-98d603c9-ef7f-42a8-aef8-44d3983541d0.png`.
- Content decision: FullBuild marks, copy, project names, and repository-owned project captures remain. Visual fidelity is judged on composition, density, material, timing, movement, and state transitions rather than source branding.

### Task 1: Lock the corrected behavioral contract

**Files:**
- Modify: `tests/prototype-showcase.test.mjs`
- Modify: `src/components/showcase/ShowcaseApp.tsx`

- [ ] **Step 1: Add assertions for the transition state**

Add static checks requiring a retained entry gate during activation, an explicit settled state, an R3F entry sculpture, and no DOM thumbnail cluster:

```js
assert.match(app, /data-entry-settled=\{entrySettled\}/);
assert.match(app, /data-entering=\{entered\}/);
assert.match(app, /ready\s*&&\s*!entrySettled/);
assert.doesNotMatch(app, /className=\{styles\.entryCluster\}/);
assert.match(scene, /function EntrySculpture/);
assert.match(scene, /entrySettled/);
assert.match(scene, /onPointerEnter/);
assert.match(scene, /hoverMix/);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/prototype-showcase.test.mjs`

Expected: FAIL because the current gate unmounts immediately and the entry sculpture is still a DOM collage plus wire icosahedron.

- [ ] **Step 3: Add the activation handoff state**

`ShowcaseApp` owns `entrySettled`. On activation set `entered=true`, keep the gate mounted with `data-entering=true`, and set `entrySettled=true` after the authored 3000ms fracture. Under reduced motion, settle immediately. Pass `entrySettled` to `ShowcaseScene`. Show the first project ledger once settled even at scroll progress zero.

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/prototype-showcase.test.mjs`

Expected: PASS.

### Task 2: Replace the flat ready collage with the rotating cell sculpture

**Files:**
- Modify: `src/components/showcase/ShowcaseScene.tsx`
- Modify: `src/app/prototype/showcase/showcase.module.css`

- [ ] **Step 1: Remove `ArchiveMark` and `.entryCluster`**

Delete the wire icosahedron plus two bars and the six absolutely positioned screenshot cards. Neither exists in the source silhouette.

- [ ] **Step 2: Build `EntrySculpture`**

Create a seeded 16-cell hollow cross from box meshes arranged around a central plus-shaped void. Each cell uses a repository project texture, a dark glossy body, cold emissive rim, and one bright internal sphere or media face. The group rotates continuously on X/Y while individual cells wobble at small amplitude. Desktop target envelope is roughly 32% viewport width by 58% viewport height; mobile target is roughly 86% viewport width.

- [ ] **Step 3: Author activation fracture inside the R3F clock**

When `entered` flips, capture the canvas clock time. Map 0 to 3000ms into three phases: rotate/center, cracked-shell expansion, then radial release. Use the same `useFrame` authority; do not add a second rAF. Hide the sculpture after phase 1 while leaving its released cells visually handed into the background fragment field.

- [ ] **Step 4: Preserve deterministic and reduced-motion behavior**

All offsets come from `seededRandom`. `window.__showcaseCapture` still freezes, thaws, and steps the canvas authority. Reduced motion resolves directly to the first-project state with no hidden content.

### Task 3: Match the manifesto geometry and controls

**Files:**
- Modify: `src/components/showcase/ShowcaseApp.tsx`
- Modify: `src/app/prototype/showcase/showcase.module.css`

- [ ] **Step 1: Recompose five flexed display lines**

Use FullBuild copy in the source's layout roles: left phrase, measured center gap or metadata, right phrase, with short blue pills on three emphasis groups. At 1920x1080 target approximately 112px display size, 0.96 line height, 20px horizontal inset, and a block spanning y=245 to y=825. Preserve deliberate mobile crop rather than shrinking into a card.

- [ ] **Step 2: Match surface treatment**

Add restrained red/blue channel separation to the display text, bright granular noise over the whole frame, and a radiation-blue center field falling to deep navy at the edges. Remove the black left wash that currently changes the composition.

- [ ] **Step 3: Match header and CTA scale**

Desktop header controls target 32 to 36px height, not 42px. CTA target is approximately 130x42px at 32 to 44px from the bottom, with a compact circular arrow. Keep FullBuild identity and accessible focus treatment.

- [ ] **Step 4: Keep the DOM manifesto during fracture**

On `data-entering=true`, fade and dither the text over roughly 900ms, hide the CTA immediately, and keep the blue field visible until the 3D fracture fills the frame. Unmount only after `entrySettled`.

### Task 4: Rebuild project crystals and spatial field

**Files:**
- Modify: `src/components/showcase/ShowcaseScene.tsx`
- Modify: `src/components/showcase/data.ts`
- Modify: `src/app/prototype/showcase/showcase.module.css`

- [ ] **Step 1: Keep the field blue throughout the journey**

Remove the current fade to near-black and remove journey-wide grayscale. Use deep blue ground, brighter blue fog, stronger star bloom, and a dense seeded mix of distant particles plus larger near-camera dark fragments with emissive blue rims.

- [ ] **Step 2: Turn every project object into a saturated media crystal with a real hover material**

At rest, map the local project capture over a deformed polygonal core and keep one readable front surface. On pointer enter, smooth `hoverMix` toward 1 inside `useFrame`: split the outer shell into irregular textured facets, offset/rotate those facets into a glass/ice kaleidoscope, increase the cold wire shell and chromatic separation, and apply pointer-following X/Y rotation. On pointer leave, smooth back to the intact readable object. The object remains visibly colored and internally bright rather than reading as a dim gray screenshot inside transparent plastic.

- [ ] **Step 3: Match scale and depth choreography**

The first project appears from far depth after the activation fracture, grows to roughly 34% to 46% viewport height, rotates through a faceted/kaleidoscopic pose, then recedes as the next object arrives. Camera travel remains scroll-driven after the initial automatic handoff.

- [ ] **Step 4: Keep the ledger subordinate**

Retain FullBuild names, summaries, and disabled case-study controls. Keep the ledger small at the lower-left, reveal it after the first object resolves, and prevent it from competing with the crystal.

### Task 5: Build matched motion and viewport evidence

**Files:**
- Modify: `.tmp/reference-forensics/noomo-showcase/capture-local.mjs`
- Create: `.tmp/reference-forensics/noomo-showcase/capture-motion.mjs`
- Modify: `.tmp/reference-forensics/noomo-showcase/design-contract.md`

- [ ] **Step 1: Add the 1920x1080 authority viewport**

Capture loader, ready, activation at 0/500/1000/1500/2000/2500/3000ms, first project settled, first project hovered at its center, pointer moved off the object, and representative scroll chapters at the same recording dimensions.

- [ ] **Step 2: Retain the responsive matrix**

Capture `390x844`, `768x900`, `1024x900`, `1280x900`, `1440x900`, and `1920x1080`. Record console errors, page errors, failed required requests, canvas dimensions, scroll height, project count, reduced-motion state, and no-JS content.

- [ ] **Step 3: Grade source/local pairs**

For each state record must-fix defects in silhouette, focal hierarchy, text envelope, background density, object brightness, transition timing, resting/hovered crystal distinction, pointer response, ledger visibility, and clipping. Every code fix invalidates affected evidence and requires recapture.

- [ ] **Step 4: Continue the refine loop until dry**

Stop only after a full desktop and mobile comparison round produces no new must-fix defect. “Uses WebGL,” “has nine projects,” or “build passes” are necessary but never substitutes for matched pixels and motion.

### Task 6: Verify the exact final build

**Files:**
- Verify: `tests/prototype-showcase.test.mjs`
- Verify: production route `/prototype/showcase`

- [ ] **Step 1: Run focused correctness checks**

Run:

```powershell
node --test tests/prototype-showcase.test.mjs
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Run the full prototype suite and classify unrelated failures**

Run: `node --test tests/prototype-*.test.mjs`

Expected: Showcase remains green. Any unrelated failure must be named exactly and not hidden.

- [ ] **Step 3: Verify the production server**

Rebuild, restart the local production server on port 3012, sentinel-check `Loading showcase` and `WITH US IT HAPPENS`, then run the 1920x1080 production motion capture with zero console errors, page errors, or failed required requests.

- [ ] **Step 4: Completion audit**

Re-open the original two user images, the supplied hover screenshot, the 35-second recording storyboards, and final local captures. Check every explicit requirement: FullBuild content retained, no audio, no external case-study pages, exact ready-state composition, continuous sculpture motion, activation fracture, automatic first-project handoff, clean resting crystal, glass/ice hover fracture, pointer response, nine-project scroll journey, mobile behavior, reduced motion, no-JS content, and production build. Do not call complete if any item lacks direct evidence.
