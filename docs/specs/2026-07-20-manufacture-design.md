# fullbuild.ai — Time-Lapse Manufacture

## Status

Selected replacement direction, 2026-07-20. Supersedes the Build Seam test design as the local prototype. Hosting, publishing, deployment artifacts, caching, robots, Open Graph, social cards, and release verification remain excluded. The Build Seam spec (`2026-07-20-build-seam-design.md`) stays on record as the previous direction.

## Thesis

**The site turns scrolling into time so a recruiter remembers watching one artifact get manufactured from idea to shipped.**

The signature is a single artifact that exists in four manufacture states. Scrolling, dragging, keys, or stage controls move time backward and forward; the whole viewport — world, navigation, content, typography — is the workshop the artifact is built in. Nothing is decorated: every visual change is a change of manufacture state.

## Directions rejected

1. **Build Seam acid poster (current test design):** flat lemon field, oversized ink grotesk, coral diagonal stripe, decorative labeled blocks. Neo-brutalist poster cluster; fails the swap test; the seam is a stripe, not a boundary that changes material law; static in stills.
2. **Dark WebGL metaverse / AI control room:** particles, orbs, grid tunnels, fake telemetry. Interchangeable with any AI studio; tech theater without subject.
3. **Cream editorial Proof Press:** serif + cream + ruled composition + thread motif. Named AI-default cluster; retains proof/ledger vocabulary.

## Candidate score

Scores: 0 rejects, 3 exceptional.

| Candidate | Originality | Subject fit | Spatial + motion | Placeholders | Mobile | Feasibility | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Time-Lapse Manufacture | 3 | 3 | 3 | 3 | 2 | 2 | 16 |
| Phase Chamber (raymarched matter states) | 2 | 3 | 3 | 3 | 2 | 2 | 15 |
| Scrollworld Ribbon (continuum zones) | 2 | 2 | 2 | 2 | 3 | 3 | 14 |

Time-Lapse Manufacture wins: it maps the tagline literally (idea → design → engineering → shipped are manufacture stages), gives placeholders an honest physical form (unbuilt artifacts), and the repository has already proven shared-topology mesh morphing once (pre-rebuild raw-WebGL2 renderer, 1,225 vertices with endpoint tests).

Adjacent-evolution count vs. the test design: palette 1 (subject-derived stage materials, re-lit from flat poster to atmospheric workshop), dominant type treatment 0, hero silhouette 0, layout 0, proof metaphor 0, signature-object category 0, motion grammar 0. Reinvention threshold met.

## Experience arc

### 1. Arrival — Made in real time

- Full viewport is the workshop: atmospheric depth, not a flat poster field. One artifact floats mid-manufacture at the current true stage (`engineering`, per `content/site.json`).
- `fullbuild.ai`, “Independent AI product builder,” official tagline, and primary action visible immediately.
- Statement: `FROM MAYBE / TO MADE.` set in Anybody, width axis still encoding lifecycle.
- Opening motion: the artifact assembles from loose parts into the engineering state over 1,600–2,200ms; interruptible. Reduced motion starts at the settled state.

### 2. Disturbance — Time is a control

- Scroll, drag, arrow keys, or the stage rail move time. The artifact morphs backward toward vapor (idea) or forward toward fused (shipped) with shared-topology interpolation.
- Blueprint annotations, type width, lighting, and stage readout change together.
- The visitor learns time travel through direct visual cause, not instructions.

### 3. Exploration — Unbuilt artifacts

Three honest future-case placeholders, each a different state of not-yet-made:

- `Future product / 01 — Project title pending`: a **scaffold** — an empty frame awaiting its artifact.
- `Future research / 02 — Question pending`: a **blueprint fold** — drawings without a build.
- `Future experiment / 03 — Hypothesis pending`: a **parts tray** — exploded components not yet assembled.

Distinct silhouettes and motion laws; none is a card. Replacing placeholder content must not require layout redesign.

### 4. Proof — One build, four states

Case 00 becomes the compact interactive manufacture: the same artifact at four times, each with artifact/decision/constraint/verification annotations from `content/site.json`:

- **Idea / vapor:** loose cloud of uncommitted parts, unstable bounding volume, orchid + mineral.
- **Design / blueprint:** parts resolved into measured drawings and cut planes, cobalt + milk.
- **Engineering / machine:** articulated assembly, visible joints and constraints, lemon + ink + cobalt. Current true state.
- **Shipped / fused:** sealed crate, calm and solid, coral + milk + ink. Remains visibly gated by `production proof pending`.

The same stage IDs and truthful deployment lock remain. Showing the fused state never claims this checkout is deployed.

### 5. Payoff — The whole build

The compact Case 00 explanation shows real decisions and evidence links. Time is driven to the end: the artifact fuses, the crate closes — and the seal reads `PRODUCTION PROOF PENDING`. The gate is the payoff: exactly what is missing, stated in the world's own language.

### 6. Exit — Commission a build

The workshop resolves to an empty pedestal and a work order: `LET’S BUILD THE WHOLE THING.` Contact value is explicitly `channel pending` until supplied. No generic three-column footer.

## Visual system

### Palette

Same subject-derived materials, re-lit — atmospheric workshop, not flat poster fields:

- Ink: `#17151F` (shadow, machine)
- Milk: `#F3F0E8` (daylight, paper)
- Cobalt: `#3347FF` (blueprint)
- Orchid: `#A987FF` (vapor)
- Signal lemon: `#E9FF65` (safety, current state)
- Coral: `#FF6B58` (hot metal, seals)
- Mineral blue: `#8BE7FF` (coolant, glass)

Gradients allowed for light and atmosphere (volumetric falloff, hot metal cooling). No dark-neon backdrop, no purple-on-white SaaS gradient, no glass cards, no global grain disguise.

### Typography

- Local Anybody variable family (width + weight axes, OFL-1.1) remains the brand contract.
- Width still encodes lifecycle: expansive vapor, measured blueprint, compressed machine, balanced fused.
- New treatment: blueprint annotation voice (measured, condensed, leader lines) replaces poster-shout voice. Hierarchy from scale, width, and placement; no uppercase-label forest.
- All text usable under fallback metrics.

### Composition

- The artifact owns the center; annotations and content orbit it with leader-line logic.
- Asymmetry and depth layering; no eyebrow + heading + ruled-grid recipe, no bento, no equal cards, no one-pixel-rule matrix.
- Negative space is workshop air — it carries depth and anticipation, never accidental emptiness.

## Rendered-layer contract (spectacle escalation)

Per `making-fullbuild-unforgettable/references/art-direction.md`:

- Raw WebGL2, one context, no runtime dependencies. A library would require explicit user authorization.
- Shared-topology deterministic mesh: fixed vertex/triangle budget, seeded assembly scatter (same seed → same arrival, every load), morph targets for the four manufacture states.
- Progressive enhancement: semantic DOM + inline SVG silhouettes of the four states ship first and carry full meaning. WebGL adds material richness only. No-WebGL, forced-colors, and reduced-motion contexts get the discrete four-state experience.
- Renders only during arrival, transitions, and direct manipulation; zero animation frames at rest; device-pixel-ratio capped; transfer budgets enforced by `npm run verify`.
- Pointer affects only the directly manipulated artifact/time control.

## Motion contract

- Arrival assembly: 1,600–2,200ms orchestrated; interruptible.
- Time change: 80ms anticipation, 640ms morph, 180ms rest.
- Animate transform, clip-path, opacity, variable-font axes, and mesh interpolation deliberately; no `transition: all`.
- No ambient loop, cursor follower, particles-for-atmosphere, generic fade-up cascade, or idle wobble.
- Reduced motion: discrete four-state composite with identical content and controls.

## Semantic and interaction contract

- Exactly one visible `h1`.
- DOM contains the full story without JavaScript.
- Native links/buttons; stage controls keyboard accessible.
- `shipped` remains unavailable while `deployment.verified` is false and announces `production proof pending`.
- Placeholder cases carry `placeholder: true`, distinct visual tokens, and explicit pending language.
- No fabricated clients, employers, metrics, awards, testimonials, or outcomes.
- Internal evidence links resolve.
- Meaning survives no JS, narrow viewports, forced colors, reduced motion, and no WebGL.

## Browser acceptance

Required viewports: 1440×900, 1280×720, 768×1024, 390×844.

Capture arrival, assembly mid-state, settled manufacture states, one interaction per placeholder, shipment gate, exit, keyboard focus, reduced motion, no-WebGL fallback, and 200% zoom. Score five-second clarity, originality, signature, composition, typography, motion, placeholder resilience, mobile equivalence, and accessibility.

Every dimension at least 2; clarity, originality, signature, mobile equivalence, and accessibility at 3. Two consecutive fresh-browser passes with no material issue before stopping.
