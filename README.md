<a href="https://fullbuild.ai">
  <img src=".github/readme/social-preview.png" alt="Sheet S-01 of fullbuild.ai: the wordmark plotted in graphite on drafting paper, with a materials legend, sheet index, and title block reading STAGE 01 IDEA" />
</a>

# fullbuild.ai

**[fullbuild.ai](https://fullbuild.ai)** · idea → design → engineering → shipped

A portfolio built as an architect's working drawing set. Scrolling advances a
set of four sheets, and the drawing builds itself as you go: the same building
appears as a graphite sketch, then a dimensioned blueprint, then an isometric
structural frame, and finally the poured, finished thing, lit only where work
is actually live.

## The four sheets

| | |
|:---:|:---:|
| ![Sheet S-01, IDEA: graphite elevation, materials legend, and sheet index on drafting paper](.github/readme/stage-01-idea.png) | ![Sheet S-02, DESIGN: dimensioned blueprint panel in night mode](.github/readme/stage-02-design-night.png) |
| ![Sheet S-03, ENGINEERING: isometric wireframe frame with a structural takeoff table](.github/readme/stage-03-engineering.png) | ![Sheet S-04, SHIPPED: the poured frame with revision-red markers on live projects](.github/readme/stage-04-shipped.png) |

- **STAGE 01 · IDEA** (graphite). A loose orthographic elevation plots itself
  on load, stroke by stroke, like a pen plotter.
- **STAGE 02 · DESIGN** (cyanotype). The sketch resolves into a dimensioned
  blueprint stating the design intent: type family, ink budget, base grid,
  motion verbs, contrast floor. Night mode drops the sheet onto dark paper.
- **STAGE 03 · ENGINEERING** (concrete). The load-bearing frame, drawn as an
  isometric wireframe and quantified in a real structural takeoff.
- **STAGE 04 · SHIPPED** (revision red). The pour: the frame fills with
  material, and the one accent colour ignites on whatever is live in
  production right now.

## The constraint contract

Rules govern the design, not taste. Coherence reads as intent:

- **Four inks, four meanings, never mixed.** Each pipeline stage owns one
  colour.
- **Revision red means exactly one thing:** live in production right now. A
  runtime health probe ([`src/lib/health.ts`](src/lib/health.ts)) de-ignites
  red back to graphite if a project goes down, so the accent can never assert
  what it can't prove.
- **The title-block `REV` field is the deployed commit**
  ([`src/lib/git.ts`](src/lib/git.ts)). The sheet revision is the repository
  revision.
- **Unknown facts render as empty witness lines**, never invented numbers.
- **No gradients, no glassmorphism, no backdrop blur.** Depth comes from
  linework and projection.
- **Three motion verbs only:** draw · hinge · pour.
- **Mono is the measured voice** (dimensions, stack, metrics). Prose is never
  mono.
- **`prefers-reduced-motion`** collapses the set into four fully composed
  static sheets.

## Stack

Next.js (App Router) · TypeScript · React Three Fiber (3D walk-through, in
progress) · GSAP + Lenis · Zustand · CSS Modules

Tailwind is deliberately absent. With no utility classes in the build, no
gradient or blur utility can leak in and break the contract.

## Adding real work

All shipped work lives in one typed file:
[`src/lib/projects.ts`](src/lib/projects.ts). Append an entry with a real
title, real `href`, real metrics, and `live: true`. The build sizes STAGE 04
to what actually exists, and a metric with `value: null` renders an honest
empty witness line instead of an invented number.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

The screenshots in this README come from the capture harness in
[`scripts/capture.mjs`](scripts/capture.mjs): point it at a dev server on
port 3117, add `--dark` for night mode. It freezes the GSAP ticker before
each shot so the plotter, hinge, and pour land on stable frames.

## License

[MIT](LICENSE)
