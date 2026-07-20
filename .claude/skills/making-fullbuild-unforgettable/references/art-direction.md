# Art-direction framework

## Outcome contract

fullbuild.ai must succeed before real case-study content exists. A recruiter should understand within five seconds:

1. this is a complete-product builder;
2. the work spans idea, design, engineering, and shipment;
3. the maker has a distinctive point of view;
4. there is an obvious path to explore proof and eventually make contact.

“Impressive” is insufficient. The experience needs one retellable memory: a visitor should be able to describe its signature to another person without saying only “dark,” “3D,” or “animated.”

## Derive; do not decorate

Build a source map before moodboards:

| Source | Questions | Possible material |
|---|---|---|
| Product | What changes from idea to shipped? | phase, pressure, assembly, transformation, convergence |
| Human | What judgment remains irreducibly human? | edits, cuts, commitments, taste, acceptance |
| Engineering | What is real in the system? | topology, state, dependency, verification, failure, recovery |
| Portfolio | What must be proven quickly? | range, authorship, outcomes, contact, evidence |
| Name | What can “fullbuild” uniquely own? | continuity, whole-system view, no handoff gap |

Choose a physical or spatial world with behavior, not a style adjective. “Cinematic,” “brutalist,” and “futuristic” describe finish. “An impossible assembly line carrying one artifact through four laws of matter” describes a world.

## Thesis gate

Complete all four:

- **Transformation:** The site turns ___ into ___.
- **Memory:** A visitor remembers ___.
- **Mechanism:** Interaction physically demonstrates ___.
- **Proof:** Placeholder and final cases reveal ___.

Reject a thesis when it depends on adjectives, a library, a visual effect, or content that does not exist.

## Anti-default divergence

Before choosing, generate three obvious directions and ban them. Include the current direction among them when redesigning. Then create at least three candidates from different media or spatial logics, not palette variants.

For each candidate, answer:

- Why can only fullbuild.ai own this?
- What happens in the first three seconds?
- How do the four lifecycle states obey different rules?
- What survives with placeholder copy and no project imagery?
- What is the reduced-motion version?
- What is the first mobile viewport?

Score candidates 0–3 on originality, subject fit, spatial/motion payoff, placeholder strength, mobile equivalence, and implementation credibility. Any 0 rejects. Select the highest ownable candidate; if the safest candidate wins only on implementation ease, challenge it with a bolder feasible alternative. Do not hybridize winners into a feature pile.

For reinvention briefs, run an adjacent-evolution audit. Count retained primitives from the current site: palette, dominant type treatment, split-hero silhouette, ruled editorial grid, proof/ledger/press vocabulary, micro-label system, signature-object category, and motion grammar. Three retained primitives means iteration, not reinvention. Reject or explain why each retained primitive is uniquely indispensable.

When the user asks for “out of this world,” the signature must alter at least three layers of the experience—viewport/world, navigation, content presentation, typography, or motion physics. A better orb, strip, thread, card, or press alone cannot carry the brief.

## Experience arc

Treat the page as six beats:

1. **Arrival:** identity + signature, immediate and legible.
2. **Disturbance:** one impossible or surprising change establishes behavior.
3. **Orientation:** visitor learns how to move without an instruction wall.
4. **Exploration:** placeholder cases become distinct portals, specimens, rooms, or chapters.
5. **Proof:** design and engineering evidence becomes concrete, not procedural prose.
6. **Exit:** contact/next-step area resolves the visual idea rather than ending in a generic footer.

Motion needs anticipation, transformation, and rest. One orchestrated set piece beats continuous ambient movement. Every large effect must either reveal content, encode lifecycle state, or demonstrate craft.

## Placeholder rule

Use honest labels such as `Future case / 01`, `Proof slot`, or `Project title pending`. Do not use lorem ipsum when intentional short copy can carry rhythm. Compose placeholders with authored scale, cropping, color, and interaction so replacement content can inherit the same system.

Vary placeholder forms to prove range. Do not create three identical cards. A product case, research case, and experimental case may share navigation but should not share the same silhouette.

## Spectacle escalation: 3D, shaders, canvas

High-end rendering is permitted when it is the mechanism, never when it is garnish. The decoration test decides: if removing the 3D layer leaves meaning, navigation, and proof intact, the layer is garnish—delete it or make it load-bearing.

When a direction genuinely needs 3D, shaders, or canvas:

1. **Stack discipline.** Prefer raw WebGL2 or 2D canvas; the repo's dependency-free build is a feature. A new runtime dependency (Three.js, GSAP, a loader) requires explicit user authorization before use, and must still respect every contract below.
2. **Progressive enhancement.** Semantic DOM and the SVG/DOM fallback ship first and carry the full story. The rendered layer adds material richness; it never gates content, navigation, or the shipment lock. No-WebGL, forced-colors, and reduced-motion contexts receive an equivalent discrete experience, not a hole.
3. **Determinism.** Generative visuals use seeded randomness: same seed, same output, every load. Geometry, particle counts, and simulation parameters are fixed, named, and auditable—not per-frame improvisation. (Precedent: the pre-rebuild renderer ran a fixed 1,225-vertex mesh with endpoint tests.)
4. **Budgets.** Vertex/triangle counts, texture sizes, and transfer weight are declared up front and enforced by `npm run verify`. The render loop reaches zero animation frames at rest; pointer input affects only the directly manipulated object; no ambient idle loop.
5. **One rendered world.** A single WebGL/canvas context with one visual law. Multiple unrelated rendered objects read as tech theater.

Spectacle raises the audit bar, it does not lower it: every matrix dimension still must score 3 where required, in a real browser, with the rendered layer active and with it disabled.

## Implementation sequence

1. Write tests for semantic and truth contracts that the new direction changes.
2. Build arrival + signature on desktop and mobile.
3. Build one lifecycle transformation and reduced-motion equivalent.
4. Build one complete placeholder case surface.
5. Expand only after the high-risk slice passes a real-browser critique.
6. Add detail in descending leverage: composition → type → motion → texture → micro-interaction.

Avoid polishing weak composition with grain, glow, noise, or more animation.
