---
name: reference-site-prototyping
description: Use when building or refining a web prototype from a live reference site's design, layout, responsive behavior, interactions, motion, or page transitions; when capture tooling is available or the user says /reference-site-prototyping.
---

# Reference-site prototyping

Reconstruct the design system and behavior, not the source implementation. Browser evidence is authoritative. 1-to-1 means LITERALLY everything observable matches: every computed property (color, background, borders, typography, spacing, opacity, cursor, selection, focus states) on every element, at every breakpoint, in every state. The only sanctioned deviations are the rights/directive replacements - copy wording, imagery, logos, fonts of uncertain license - and deviations the owner explicitly accepts. Anything else that differs is a defect, whether or not a screenshot metric flags it. Clone output and extracted bundle code are forensic evidence only unless the user owns the source and explicitly requests a literal port.

Read `references/forensics-contract.md` before acting.

## Scope

Default scope is exactly the URL(s) named in the request — that page, top to bottom, with every state it exposes. If the request names a bare domain or says "the site", ask which page to start with before profiling. Never expand to other pages, navigation targets, or sitewide crawls without an explicit ask; record discovered internal links as candidates for follow-up requests, nothing more.

## Workflow

Copy this checklist into the working plan:

```text
Reference prototype:
- [ ] Confirm scope: exactly the requested URL(s), that page top to bottom
- [ ] Inspect source through full scroll and state changes
- [ ] Sample document.getAnimations() at rest AND during hover, click, scroll, and navigation
- [ ] Inventory CSS: @keyframes, :hover/:focus rules, transition durations/easings, :root tokens, effect vocabulary
- [ ] Detect canvas/WebGL layers; if present, extract shader sources, uniforms, and network asset list
- [ ] Capture scroll physics curve and page-transition choreography
- [ ] Capture matched viewports (desktop, mobile, in-between) plus no-JS pass
- [ ] Paint-property parity pass: diff computed color/background/border/typography/opacity per matched element pair, always including text over canvas or imagery
- [ ] Run optional forensic capture
- [ ] Write the design contract and asset decisions
- [ ] Build cleanly in repository conventions
- [ ] Compare, diagnose, iterate until dry — layout via screenshots, structure via DOM census, motion via frame sequences or video, then a live full-scroll pass
- [ ] Verify behavior, accessibility, build, and production if deployed
```

### 1. Establish evidence

Use an exposed browser-control capability to inspect the live source. Scroll the entire page at desktop and mobile widths. Exercise navigation, hover, focus, menus, accordions, carousels, sticky elements, and scroll-triggered motion. Record computed styles and bounding boxes when visual behavior is ambiguous. Probe scroll-triggered sections in their revealed state - scroll each into view before inventorying it; an opacity-0 wrapper hides its children and manufactures "the reference has no X" conclusions that survive into the contract.

Animation ground truth: `document.getAnimations({ subtree: true })` sampled at rest, then re-sampled during and immediately after every interaction (hover, click, scroll step, route change), recording kind, target, duration, easing, and play state. A canvas-driven site can report zero DOM animations while carrying its entire experience in WebGL — zero at rest is a signal to hunt the canvas, not a finding.

Stylesheet inventory: `@keyframes` names; every `:hover`/`:focus` selector; every `transition:` rule with exact duration and easing; framework transition classes (`-enter-active`, `-leave-active`, `page-enter`); `::selection`; and the `:root` custom-property block — sites often publish their full design system (colors, fonts, durations, easings) there. Count effect vocabulary: `mix-blend-mode`, `clip-path`, `filter`, `position: sticky`, `position: fixed`.

Scroll physics: after a single wheel tick, sample `scrollY` every ~50 ms for one second. The curve identifies the smooth-scroll library (exponential lerp approach = Lenis-class), its settle time, and whether native scroll is hijacked. Page transitions: attach a MutationObserver for class/style changes on `html`/`body`, click an internal link, screenshot at ~100/400/900/1600 ms, and log added classes (overlay elements, `line-split`-style reveals, route change).

Capture source screenshots at matched target widths, including one in-between width. Screenshots without live scrolling miss behavior; code inspection without pixels misses rendering.

### 2. Optional capture tooling

If an external capture or clone service is exposed, treat its output as tier-3 forensic evidence: useful for bulk inventory and cross-checks, never shipped as code. Authenticate only with a secret already stored in the environment; never paste, echo, persist, or commit a key. Live browser observation outranks any generated report, and a service that refuses a target (robots.txt, terms) is not a gap to route around.

This skill's own method needs no capture service and is not crawling: it profiles the user-directed page interactively in a single browser session — the same activity class as a person opening DevTools on a page they chose to visit. robots.txt addresses automated bulk crawlers and indexers; it does not govern this interactive inspection, so a site's robots.txt never blocks the skill's evidence path.

Do not ship generated clone code by default. A high aggregate score can hide clipped mobile sections, missing interactions, hydration problems, or huge unmaintainable components. Inspect the report and rendered result, then extract facts into the design contract.

### 3. Write the design contract

Before implementation, capture tokens, typography, container geometry, section sequence, responsive transformations, the full motion spec, state matrix (per width AND per scroll state - fixed chrome differs across both: the OCI MENU box is visible at top at every width, transparent at lg and white below, and a top-state-only probe misread it as scroll-gated), scroll physics, page transitions, and canvas/WebGL system using `references/design-contract-template.md`. If reuse rights are not explicit, replace logos, distinctive copy, proprietary illustrations, and uncertain fonts with original or licensed equivalents.
Map every reference element slot to its demo replacement before building, and reconcile counts: if the reference has four process cards, the demo copy defines four and the build ships four. Slot drift (five steps defined, four cards in the reference, three built) is how a missing card ships undetected through every capture comparison — reconcile counts against the reference census, never against the copy doc alone (the copy doc can drift from the reference too). After staging substitute fonts, measure the reference's display-line widths and set per-element letter-spacing so lines land within ~5% of reference width: cap-height parity alone let a hero line run 20% wide and kiss the viewport edge (OCI).

### 4. Build cleanly

Implement semantic, accessible components in the repository's existing architecture. Recreate observed behavior rather than copied scripts. Support keyboard interaction and touch. Do NOT add `prefers-reduced-motion` support by default — this owner's standing directive is to omit it entirely (most reference sites ship none, and the match is the goal); add it only on explicit request, recorded in the contract. Preserve the reference's hierarchy, rhythm, density, and energy while using the prototype's own identity.

### 5. Refine until dry

For each target viewport and state: capture source and local, name observable defects, find the root cause in computed layout or code, apply a focused fix, recapture. Test between breakpoints, not only at them. Stop only when a full comparison round finds no must-fix visual or behavioral defects. Exclusion policy is per root cause, and each round re-verifies the root cause still explains the delta: 'content/alignment' exclusions quietly hid real defects (nav typography, section height) through an entire round-1 pass (OCI).

Screenshots judge layout only. For motion parity, record video of source and clone performing the same interaction (Playwright `recordVideo` or stepped frame captures) and compare choreography: order, overlap, duration, and easing character. Any scroll-coupled effect must be sampled at two or more scroll offsets on the reference to extract per-element rate and direction before implementing: one offset reads as 'staggered reveal' what is actually per-card parallax (OCI project names moved +158/-86/+8px over 321px of scroll), and a transform sampled once and baked as static may be one frame of a scrub (OCI step-card 'rotations' were mid-scrub values; the real effect settles at an aligned row). Compare page transitions the same way.
Layout parity is not structure parity. Per section, assert element counts and parentage against the reference (a census: four cards, each a sibling of the sticky title), and verify placement with `getBoundingClientRect` — computed `grid-column` can read 7/12 while the element renders in column 1 because a structural edit consumed a closing tag. For rotated or transformed elements compare the computed transform matrix and unrotated layout box instead of the bounding rect: rotation inflates bboxes and fakes pitch and size differences. Then run one live full-scroll pass at real speed, watching entrance animations fire, scroll-linked effects reverse, and hovers respond — position-matched pairs cannot see any of this. Dry requires raw unrounded metrics (rounding once flipped a pass to fail), a clean behavioral scroll-through, and the owner's eyes on the live site as the final gate. Histograms are nearly blind to layout shift: a section 248px too tall still scored 0.999 on a layout pair (OCI round 2), so gate structure numerically every comparison round — per-section element counts equal to the reference, docH within 1%, every section top within ~4px, and scrollWidth equal to the viewport at every tested width including desktop (offscreen overlays, absolutely-positioned copy, and rotated icons each pierced it by 4-150px); plus a computed paint-property diff (color, background-color, border-color, font-weight, letter-spacing, text-transform, opacity) that reads equal on every matched element pair. Geometry gates never see paint: a nav link rendered body-blue over a blue canvas passed every round until color was finally sampled (OCI).

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

### 7. Canvas and bundle forensics

When a `<canvas>` carries visuals (fixed-position, full-viewport, z-index behind content, `pointer-events: none`):

- Record the context type and the `WEBGL_debug_renderer_info` string, the canvas CSS (position, z-index, pointer-events), and a pixel-diff of screenshots across scroll positions to separate scroll-driven from time-driven rendering.
- Inventory network assets: `.riv`, `.glb`/`.gltf`, video, `woff2`, image sources, JS chunk count and sizes. Media absence plus a canvas means the effects are procedural — the code is the asset.
- Download the JS chunks and extract shader sources: string literals containing `gl_Position`, `gl_FragColor`, or `pc_fragColor`. Save each as `.glsl`, then read the uniforms (`u_*`) and `main()` to reconstruct the effect math — pixelation grids, ordered-dither matrices, noise fields, palette quantization, trail/ping-pong render targets. Uniform names are the effect's API: `uVelocity`, `uTime`, `uTrail` name the drivers (scroll, clock, pointer).
- Extract the full rendering pipeline, not just shaders: renderer setup (pixel ratio, clear color), render-target configuration (type — HalfFloatType vs UnsignedByteType changes trail/feedback decay from smooth to quantized; filtering — NearestFilter vs LinearFilter changes pixel character; depth/stencil buffers), texture format (DataTexture format + type), composite order (which pass renders into which target), vertex shader geometry (full-screen triangle vs quad), and GLSL version (GLSL3 in/out/layout vs GLSL1 varying/gl_FragColor — downgrade only if the target context requires it). Decode minified three.js constants by numeric value (NearestFilter=1003, HalfFloatType=1016, FloatType=1015, RGBAFormat=1023). A shader copied verbatim into the wrong pipeline produces visibly wrong output.
- Exact uniform values do not guarantee matching motion: time-base scaling, driver mapping, and easing need visual convergence. A noise field driven by raw seconds decorrelates every frame (whole-hero pixel churn 20% vs the reference's 0.3%) with every constant correct — compare a churn/luma-stability metric, then scale the clock.
- Image-processing shaders eat the source texture's luminance structure: a flat generated placeholder starves ordered dithering into coarse blocks. Match the reference's tonal distribution (smooth ramps, soft bands, grain) before judging the shader.
- Identify bundled libraries from source signatures (`REVISION="..." ` for three.js; smooth-scroll class options for lerp/duration), never from `window.*` globals — bundled libraries are not exposed.

## Anti-patterns

- Don't ship clone-generated markup, styles, or scripts by default; extract facts, build fresh.
- Don't trust an aggregate similarity score over side-by-side captures.
- Don't compare only at exact breakpoints; defects live between them.
- Don't conclude "no animations" from one at-rest `getAnimations()` sample, or detect libraries via `window.*` on a bundled site.
- Don't judge motion parity with screenshot pairs; motion needs frame sequences or video.
- Don't read a prior round's documented conclusion as ground truth - re-derive it from the live site when fresh evidence contradicts it; probes taken at unrevealed or top-only states are hypotheses (OCI round 2 'knew' testimonials had no client name and the MENU box was scroll-gated; both were probe-state artifacts).
- Don't call a round dry on rounded metrics or static pairs alone — assert DOM structure, run a live scroll-through, and put the owner's eyes on it last.
- Don't equate 1-to-1 with layout + motion. Parity is every observable computed property, everywhere. Color and contrast mismatches survive every histogram gate (text over canvas sits inside excluded-by-policy frames), so paint properties need their own sampled pass.
- Don't keep logos, distinctive copy, proprietary art, or uncertain fonts without explicit rights.
- Don't paste, echo, persist, or commit capture-API keys.
- Don't report frame times, or tune a quality tier, from a software rasterizer. Check the renderer string, then relaunch headed.
- Don't record a limitation you could have removed. Try the headed run before writing "unverified on real hardware".
- Don't fake a reference's material with a preset. A hard light-to-dark gradient split baked into type or a shape reads as an effect, not a surface; if the real material is rendered elsewhere on the page, keep the static layer quiet instead of competing with it.