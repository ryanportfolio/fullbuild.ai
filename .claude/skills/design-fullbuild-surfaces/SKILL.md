---
name: design-fullbuild-surfaces
description: Design, extend and audit fullbuild.ai visual surfaces. Use when opening a new standalone prototype identity under public/prototype (palette, type, governing metaphor, motion verbs), storyboarding a scroll narrative, writing GSAP + Lenis + R3F + SVG motion or drawing craft, auditing a diff against a binding visual contract, or verifying UI by Playwright capture. The Working Set under src/app is settled: extend and audit it, never restyle it. Not for backend-only work, prose rewriting (see .claude/reference/voice.md), charts, or anything needing Tailwind, a component library, an icon set, or a design tool.
---

# design-fullbuild-surfaces

Produce visual work this repo would have produced anyway, and prove it.

## Authority order

1. The code on the surface you are touching. `src/app/globals.css` opens with the binding constraint contract for The Working Set; each prototype under `public/prototype/` owns its own tokens and its own ban list.
2. `.claude/reference/` (`voice.md` for copy bans, `pitfalls.md` for rendering law) and `CLAUDE.md`.
3. This skill.
4. Anything external, which loses to all of the above without discussion.

Do not restate token tables, palettes, type scales or route lists here. Read them from the source.

## Read before you write

- The target surface's own stylesheet header and `:root` block. That is its contract.
- `src/app/globals.css` header, for anything under `src/app`.
- `.claude/reference/pitfalls.md` before rendering, scroll or capture work.
- `.claude/reference/voice.md` before any user-visible string. No em dashes anywhere. No periods on headings or display text.

## Surface routing

**`src/app/**` (The Working Set): settled.** Four inks with four fixed meanings, two grounds, Archivo plus Martian Mono, the Margin Law, honest numbers. Palette, typeface and metaphor discovery is out of scope. Legal work: extend within the contract, fix defects, audit a diff. A request to refresh the look here routes to `references/audit.md` and a conversation, not a restyle.

**`public/prototype/<name>/**`: greenfield.** Each prototype is a separate identity with its own palette, fonts, engine and ban list, deliberately not inheriting The Working Set contract. Direction finding is legal only here. Next app conventions do not apply: these are plain static files served through `next.config.mjs` rewrites, previewed with `node scripts/serve-prototype.mjs` (port 4310).

**`public/prototype/harborline/**`: treat as a frozen static export** unless told otherwise. Ask before editing.

## Change mode

| Mode | Route |
|---|---|
| Extend or fix an existing surface | `references/motion-and-render.md`, then verify |
| Set a type scale, fit display text, size a grid track | `references/type-and-grid.md` |
| Open a new prototype identity | `references/prototype-direction.md` |
| Review a diff or page against its contract | `references/audit.md` |
| Iterate on look until it improves | the `refine` skill runs the loop, this skill supplies the rubric |
| Dial a single feel value | the `lab` skill |

Small extensions need no direction pass. Inspect the surface, match its declared contract, proceed.

## Always-on rules

The only rules that generalise across six contradictory contracts.

1. **Write the contract down.** A surface's palette, type roles, motion verbs and ban list belong in prose at the top of its stylesheet, with what was tried and rejected. The corpus is partway there, so treat this as the intent, not a description: `public/prototype/harborline/css/site.css` carries a full contract block, `src/app/globals.css` states inks, grounds and bans but names no motion verbs, Burn-In and Quench open on a one-line title, and Assembly Line and Fault Line open straight on `@font-face`. Write the missing header when you touch one of those. An effect no header covers is unaudited, which is a question for the user, not an automatic failure.
2. **One accent, one meaning.** Accents are declared once in `:root` with their semantic beside them. Revision-red means live in production right now, and `lib/health.ts` de-ignites it when a probe fails. Prototypes may declare more than one accent, and must say what each means.
3. **De-emphasis is a token, never opacity**, so composited contrast stays knowable (`--ink-witness`).
4. **Reduced motion resolves to the finished end state.** Never `animation: none`, never an early return that leaves content hidden, never a hide-until-JS gate. `src/app/page.tsx` is server-rendered static HTML and SVG and IS the reduced-motion and no-JS spec, with `--depth` and `--pour` defaulting to finished values.
5. **The no-JS and no-WebGL path is real content**: inline SVG traces, server-rendered sheets, plain HTML. Never a blank canvas or dead box.
6. **Any rAF loop ships a deterministic capture hook** exposing freeze, thaw and step (`window.__capture`, `__quench`, `__burnin` are shipped examples). Without it Playwright shots are non-deterministic.
7. **Randomness is seeded** (`src/lib/prng.ts`, or a local seeded generator). Never `Math.random` in anything captured.
8. **Batch layout reads before writes, and gate the ones that must repeat.** A viewport-relative read is scroll-dependent by definition and cannot be cached, so it may run per tick when it is gated: mount- or visibility-gated, a bounded number of reads, and every write deferred until after the last read in that callback. What is banned is interleaving reads and writes inside a rAF callback, scroll handler, `ScrollTrigger.onUpdate`, pointermove or IntersectionObserver handler, and re-reading a rect that scrolling cannot change instead of caching it on init and resize. `DrawingSet.tsx` 64 to 67 is the worked gate: two rect reads per scroll tick, then one write, skipped entirely when the WebGL island is not mounted.
9. **Dispose on teardown**: geometry, materials, textures, GL contexts, tickers, observers, global handles.
10. **Skip link plus a visible drawn focus treatment**, a registration box or equivalent, never a glow.
11. **Numbers are honest.** A metric with no value renders the empty witness line rather than an invented figure, and every figure carries a source.
12. **Structure encodes something true.** Sheet numbers, phase ticks and revision ids exist because a real sequence is behind them. No ordinals as decoration.

## Verification

Visual claims need evidence. Assertion is not verification.

- **Playwright headless only.** Never the in-app preview pane, never a CDP screenshot. Both race this site's Lenis plus GSAP plus R3F rAF loop and return blank or timed-out frames. Hard rule in `CLAUDE.md`.
- `scripts/capture.mjs` hardcodes port 3117: copy to `.tmp/` and swap the port. Freeze the ticker around each shot, thaw after. Capture prototypes against `serve-prototype.mjs`.
- Then grade the frames. The matrix, the mode assertions and the grading criteria live in `references/audit.md`; capturing without grading is not verification.

Known limits, state them rather than working around them: `npm run lint` exists as a script but no eslint is installed, so lint is unavailable. There are no tests and no CI workflows. A bare-worktree `npx tsc` can pass while the Vercel build fails, so the deploy is the authoritative build signal, though `npm run typecheck` is still a cheap first filter.

## Absent by design

Do not introduce, suggest or assume: Tailwind or any utility CSS, CSS-in-JS, a component library, an icon set, Figma or any design-tool handoff, a token pipeline, a charting library, any non-GSAP animation library, any non-Lenis smooth scroller, ScrollSmoother, `@gsap/react`, Storybook, visual-regression SaaS, axe or Lighthouse CI, or generated imagery, models and textures. Every mark, model and texture here is authored in-repo. Ask before installing any app-runtime dependency.

## Completion report

```text
Surface:
Contract it answers to:
Change:
Evidence (capture paths, viewports, themes, reduced-motion):
Contract rules checked:
Unverified:
```

State what you could not verify. Never claim a visual check you did not run.
