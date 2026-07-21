# fullbuild.ai

> idea → design → engineering → shipped

A portfolio built as **an architect's working drawing set**. You don't scroll a
page — you advance a set of sheets, and the drawing builds itself as you go:

- **STATE 01 · Idea** — graphite. A loose orthographic elevation that plots
  itself on load like a pen plotter.
- **STATE 02 · Design** — cyanotype. The sketch resolves into a dimensioned
  blueprint. In dark mode it inverts to a true cyanotype negative.
- **STATE 03 · Engineering** — concrete. The load-bearing frame, drawn as an
  isometric wireframe, dimensioned with the real stack.
- **STATE 04 · Shipped** — revision-red. THE POUR: the frame fills, and the one
  accent colour ignites on what is live in production right now.

## The constraint contract

The design is governed by rules, not taste — coherence reads as intent:

- **Four inks, four meanings, never mixed.** Each pipeline stage owns one colour.
- **Revision-red means exactly one thing:** _live in production right now._ A
  runtime health probe de-ignites red → graphite if a project goes down, so the
  accent can never assert what it can't prove.
- **No gradients, no glassmorphism, no backdrop-blur.** Depth is earned by real
  linework and projection.
- **Three motion verbs only:** draw · hinge · pour.
- **Mono is the measured voice** (dimensions, stack, metrics); prose is never mono.
- **Unknown facts render as empty witness lines**, never fabricated data.
- `prefers-reduced-motion` collapses the set to four fully-composed static sheets.

## Stack

Next.js (App Router) · TypeScript · React Three Fiber _(3D walk-through — in
progress)_ · GSAP + Lenis · CSS Modules. No Tailwind (keeps gradient/blur
utilities from ever leaking in and violating the contract).

## Adding real work

All shipped work lives in one typed file: [`src/lib/projects.ts`](src/lib/projects.ts).
Append an entry — real title, real `href`, real metrics, `live: true`. The build
sizes STATE 04 to what actually exists; metrics with `value: null` render an
honest empty witness line rather than an invented number.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

The title-block `REV` field is bound to the real deployed commit — the sheet
revision _is_ the repository revision.
