# Pass 03 — Anti-slop, accessibility, and resilience (Time-Lapse Manufacture)

Date: 2026-07-20
Renderer: Google Chrome via `node .kimi/shot.mjs` and `.kimi/audit-shot.mjs` (`--nojs`, `--reduced`); interaction checks via live CDP session
States: desktop, tablet, mobile, no JavaScript, reduced motion, keyboard, shipment gate, idle rest, 200%-equivalent

## Rejection tests (inspection of captured states)

- **Cluster test:** no four-tell cluster in any viewport. Centered-hero + abstract-decoration absent; artifact is load-bearing. Scroll reveal softened (0.6rem, three element kinds) to stay below the fade-up-cascade tell.
- **Swap test:** the world is bound to `idea → design → engineering → shipped`, Case 00, and the honest gate; an interchangeable agency could not keep the copy.
- **Decoration test:** remove the artifact and navigation, state, and proof still function (anchors, SVG silhouettes, semantic panels). It encodes state — not garnish.
- **Silhouette test:** vapor cloud / blueprint planes / faceted machine / sealed crate are distinct at a squint.
- **Retelling test:** “you scroll and the product gets built; the crate stays locked until deployment is proven.”
- **Placeholder test:** three unbuilt artifacts (scaffold, blueprint fold, parts tray) with explicit pending chips.
- **Adjacent-evolution test:** one retained primitive (subject-derived palette). Reinvention threshold met.
- **Information-device test:** `t+01–t+04` encode real build time; `WORK ORDER 00` is the real case; `BUILD / ENGINEERING` is live state.

## Defects found and fixed

- Reduced-motion clock overlapped the first stage heading → clock hidden under `prefers-reduced-motion`.
- Stage figure SVGs lost their 5.5rem sizing and `fill: none` in the stylesheet rewrite → restored; figures now appear exactly in no-JS/reduced contexts and hide when the rendered layer carries the state.
- Canonical stage copy still narrated the retired Build Seam → `content/site.json` design/engineering decisions rewritten to the manufacture world; evidence link now points at `docs/specs/2026-07-20-manufacture-design.md`.

## Verified

- **No JavaScript:** full story, machine SVG fallback in arrival, anchor controls resolve to static stage panels (`p3-nojs-arrival.png`).
- **Reduced motion:** discrete stacked states with figure icons; no transitions; canvas never initializes (`p3-reduced-lifecycle-b.png`, `p3-reduced-design-b.png`).
- **Keyboard:** arrow/Home/End navigation moves focus and state; `aria-current="step"` follows; focus visible.
- **Shipment gate:** shipped control announces `shipped — production proof pending` in the polite live region, flashes the gated state for 3s, and never activates; `deployment.verified` remains `false`.
- **Idle rest:** 0 `requestAnimationFrame` calls per second after settling (measured in the live page).
- **200%-equivalent (720×450):** no horizontal overflow; identity and copy reachable (`p3-zoom200.png`).
- **Determinism:** fixed seed `20260720`; two geometry builds byte-identical (unit-tested). 642 vertices / 1,280 triangles, inside the 1,400/2,800 budget.

## Limitations

- Forced-colors mode is gated statically (dedicated media block plus the deterministic verifier); no local forced-colors emulator was available for a fresh render.
- WebGL renders through SwiftShader in headless captures; discrete-GPU frame timing was not measured.
