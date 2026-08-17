---
description: Use when building or refining a web prototype from a live reference site's design, layout, responsive behavior, interactions, or motion; when clone/capture tooling such as Ditto is available or the user says /reference-site-prototyping.
---

# Reference-site prototyping

Reconstruct the design system and behavior, not the source implementation. Browser evidence is authoritative. Clone output is forensic evidence only unless the user owns the source and explicitly requests a literal port.

Read `references/forensics-contract.md` before acting.

## Workflow

Copy this checklist into the working plan:

```text
Reference prototype:
- [ ] Inspect source through full scroll and state changes
- [ ] Capture matched source viewports
- [ ] Run optional forensic capture
- [ ] Write the design contract and asset decisions
- [ ] Build cleanly in repository conventions
- [ ] Compare, diagnose, and iterate until dry
- [ ] Verify behavior, accessibility, build, and production if deployed
```

### 1. Establish evidence

Use an exposed browser-control capability to inspect the live source. Scroll the entire page at desktop and mobile widths. Exercise navigation, hover, focus, menus, accordions, carousels, sticky elements, and scroll-triggered motion. Record computed styles and bounding boxes when visual behavior is ambiguous.

Capture source screenshots at matched target widths. Include target breakpoints and at least one in-between width. Screenshots without live scrolling miss behavior; code inspection without pixels misses rendering.

### 2. Use clone tooling as a forensic scanner

If Ditto or similar tooling is available, use it to inventory assets, font declarations, measurements, section structure, responsive clues, motion files, and verification failures. Prefer an exposed connector. With a REST API, use only a secret already stored in the environment; never paste, echo, persist, or commit a key.

Do not ship generated clone code by default. A high aggregate score can hide clipped mobile sections, missing interactions, hydration problems, or huge unmaintainable components. Inspect the report and rendered result, then extract facts into the design contract.

### 3. Write the design contract

Before implementation, capture tokens, typography, container geometry, section sequence, responsive transformations, interaction/motion rules, and asset decisions using `references/design-contract-template.md`. If reuse rights are not explicit, replace logos, distinctive copy, proprietary illustrations, and uncertain fonts with original or licensed equivalents.

### 4. Build cleanly

Implement semantic, accessible components in the repository's existing architecture. Recreate observed behavior rather than copied scripts. Support keyboard interaction, touch, and `prefers-reduced-motion`. Preserve the reference's hierarchy, rhythm, density, and energy while using the prototype's own identity.

### 5. Refine until dry

For each target viewport and state: capture source and local, name observable defects, find the root cause in computed layout or code, apply a focused fix, recapture. Test between breakpoints, not only at them. Stop only when a full comparison round finds no must-fix visual or behavioral defects.

Run repository verification. If deployment was explicitly requested, smoke-test the production URL too. Report evidence and known deviations; never claim parity from a score alone.

### 6. Judge GPU work on a GPU

Headless browsers usually fall back to a software rasterizer. Anything WebGL, canvas, heavy compositing, or filter-driven then renders at the wrong resolution, the wrong speed, and sometimes the wrong appearance. A performance budget or an adaptive quality tier measured there is measuring the rasterizer, not the code.

Before reporting any frame time, or judging any material that a GPU shades, check which renderer you actually got:

```js
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
```

A SwiftShader, llvmpipe, or "software" string means relaunch headed (`chromium.launch({ headless: false })`) and measure again. Check whether the driver is already installed before concluding it is unavailable; a headed run is often one flag away, not a new dependency.

Never write "unverified on real hardware" into a report until you have confirmed a headed run is genuinely impossible. Stating a limitation is not a substitute for spending the two minutes to remove it.

Software rendering is also not bit-reproducible at the last significant bit, so byte-identical screenshot hashes are the wrong acceptance check. Assert determinism of the inputs and allow a small pixel-delta tolerance on the image.

## Anti-patterns

- Don't ship clone-generated markup, styles, or scripts by default; extract facts, build fresh.
- Don't trust an aggregate similarity score over side-by-side captures.
- Don't compare only at exact breakpoints; defects live between them.
- Don't keep logos, distinctive copy, proprietary art, or uncertain fonts without explicit rights.
- Don't paste, echo, persist, or commit capture-API keys.
- Don't report frame times, or tune a quality tier, from a software rasterizer. Check the renderer string, then relaunch headed.
- Don't record a limitation you could have removed. Try the headed run before writing "unverified on real hardware".
- Don't fake a reference's material with a preset. A hard light-to-dark gradient split baked into type or a shape reads as an effect, not a surface; if the real material is rendered elsewhere on the page, keep the static layer quiet instead of competing with it.
