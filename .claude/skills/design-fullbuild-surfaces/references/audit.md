# Auditing a surface against its own contract

This audit reports violations of a contract that already exists. It never invents a new style, and taste is never the arbiter.

Slop is the absence of a decision. The same element, chosen and defended in the surface's contract header, is fine. That is the only formulation that lets one rubric hold both The Working Set's gradient ban and Quench's deliberate iridescence.

## Phases, in order

1. **Scope.** Name the surface and locate its contract: the header comment plus `:root` block of its stylesheet. For `src/app`, that is `src/app/globals.css`. Two cases, never blurred. Where a written contract exists, audit against it. Where none exists (today: Assembly Line, Fault Line, and the one-line headers on Burn-In and Quench), the deliverable is a *proposed* contract header reconstructed from the tokens, `index.html` and engine, put to the user for confirmation, and the audit does not run until they confirm it. A reconstructed contract that quietly becomes the pass/fail baseline is the auditor grading the surface against its own invention, which is the failure this file's first sentence exists to prevent.
2. **Scan.** Ripgrep for the patterns below, plus read the diff. Do not install or run an external scanner.
3. **Triage.** For every hit, decide: default nobody chose, or deliberate and defended by the contract. Only defaults are violations.
4. **Report.** Grouped, located, with a tally.
5. **Fix**, only if fixes were requested.

**Hard gate: do not mass-edit before the user has seen the report.** Against six mutually contradictory contracts, an auditor that edits first will silently strip Burn-In's barrel distortion or Quench's iridescence.

## Rule ids

Cite the contract rule, not an imported opinion. For The Working Set:

| Id | Rule | Critical |
|---|---|---|
| INK-01 | Four inks, four meanings, never mixed | yes |
| INK-02 | Revision-red only on live-in-production, gated by the health probe | yes |
| GROUND-01 | Two grounds only, same ink meanings in both | |
| MAT-01 | No gradients, no `backdrop-filter`, no glassmorphism, no blur as depth | yes |
| MAT-02 | Depth from linework, real projection and baked AO | |
| MARGIN-01 | Nothing crosses the title-block rail; the canvas paints only inside its band cell | yes |
| NUM-01 | No invented figures; a null value renders the empty witness line | yes |
| NUM-02 | Every metric carries a source, shipped in the DOM | |
| A11Y-01 | De-emphasis is a token, never opacity | |
| A11Y-02 | Focus is a drawn registration box, never a glow | |
| A11Y-03 | Token pairs hold AA on both grounds | |
| MOTION-01 | Only the declared verbs (DRAW, HINGE, POUR) | |
| MOTION-02 | Reduced motion resolves to the finished end state | yes |
| MOTION-03 | One rAF authority | yes |
| PE-01 | No-JS and no-WebGL paths are real content | yes |
| VOICE-01 | No em dashes, no periods on headings (see `.claude/reference/voice.md`) | |

**A critical violation caps the audit regardless of how good the rest of the diff is.** Red spent on something that is not live, anything crossing the rail, or an invented figure are categorical failures, not point deductions.

## Detecting the critical rules

A critical rule with no procedure is a wish. The ripgrep patterns below reach only some of them, so every critical id gets a mechanical check here, run in the capture script at every viewport in the matrix.

| Id | Detection |
|---|---|
| INK-01 | Collect computed `color` and `stroke` across the rendered tree, resolve each against the four ink tokens, report every value that is none of them |
| INK-02 | For each element painting `--accent-live` or `--accent-link`, assert it is or sits inside an anchor carrying `data-live` with a truthy health reading. Any other red is a violation, not a question |
| MAT-01 | The gradient, `backdrop-filter` and blur patterns below, plus a computed-style pass for `background-image` other than `none` |
| MARGIN-01 | At each viewport compare `el.getBoundingClientRect().right` against the rail's `left`, and run `document.elementFromPoint` at the centre of everything clickable to confirm the rail does not intercept it. Both probes are from `.claude/reference/pitfalls.md`, where this shipped broken once (fr-track min-content overflow) |
| NUM-01 | Grep `src/lib/projects.ts` for metric objects with no `source` field, and assert every rendered metric slot holds a figure or the empty witness line |
| MOTION-02 | Capture under a `reducedMotion: 'reduce'` context and assert the finished end state, plus the `animation: none` pattern below |
| MOTION-03 | Assert exactly one `gsap.ticker.add` call site and no second `requestAnimationFrame` authority |
| PE-01 | Load with JavaScript disabled and assert non-empty rendered text and non-zero stroke geometry. A blank canvas or empty box fails |

For a prototype, build the equivalent short table from that prototype's own declared contract. Never import The Working Set's table into a prototype: Fault Line runs four saturated flats, Quench runs two accents, Harborline runs a four-colour semantic contract, and all three are correct.

Every rule you write down ships with its known false positives beside it. In this corpus roughly half of any pattern's hits are defended choices, so a rule without a false-positive note is actively harmful. Worked examples: an ordinal rule would strip `S-01` to `S-05`, `T-01` and `t+01` to `t+04`, which are a real drawing-set and build-time sequence; a monospace-as-chrome rule would flag Martian Mono, which is the deliberate measured voice; a tracked-caps rule would flag the rail lettering.

## Scan patterns

Tailwind class-name patterns are useless here; this repo has no Tailwind. Search raw CSS and CSS Modules:

- `linear-gradient|radial-gradient|conic-gradient` and `background-clip:\s*text`
- `backdrop-filter|filter:\s*blur`
- `box-shadow` with a non-zero blur radius
- `opacity:\s*0?\.[0-9]` on text, which is usually A11Y-01
- hex literals outside the `:root` token block, which is usually an undeclared accent
- `Math.random`
- `getBoundingClientRect` interleaved with style writes inside `useFrame`, `onUpdate`, `pointermove` or a scroll handler, or a scroll-invariant rect re-read every tick instead of cached. Known false positive: `DrawingSet.tsx` 60 to 61 reads two viewport-relative rects per scroll tick and writes once after both, behind the mount gate documented at 64 to 67. That is the defended pattern this rule points at, not a hit
- `animation:\s*none` inside a `prefers-reduced-motion` block
- selectors and `data-` attribute branches with no element that sets them, since there is no linter installed to catch dead code

## Report format

```text
VIOLATION  src/components/sheets/SheetFrame.module.css:84  MAT-01  gradient on the pour cap -> resolve to a hatch or a flat concrete token
DEFENDED   public/prototype/burn-in/src/styles.css:212     (n/a)   conic graticule, declared in the header contract
QUESTION   src/lib/projects.ts:57                          NUM-01  metric has no source field

3 groups, 1 violation, 1 question, 1 defended
```

## Suppressions

A deliberate effect that a rule will keep flagging gets pinned in source, scoped to the rule id, with a written reason. Anything else re-litigates the same decision every session.

```css
/* fb-audit-ignore MAT-01: barrel distortion is this prototype's declared
   phosphor material, stated in the contract header above. */
```

Prefer the id-scoped form so new rules still surface. A suppression without a reason is itself a violation, and matches the house rule that every non-obvious decision states why inline.

## Fixing

Order: shared tokens and theme first, then components, then one-off call sites, then copy. A token-level fix removes many hits at once; per-call-site edits produce the sprawling diffs the git rules forbid.

- Never invent new brand colours. If a palette must change, propose neutrals plus the existing accent and let the user confirm. Palette discovery on `src/app` is out of scope entirely.
- No new dependencies to do this work.
- After fixing, re-scan and record any hits deliberately left, with the reason. Those are the raw material for the next suppression.

## Verifying

Capture, then grade. Capturing without grading is not verification.

**Matrix:** desktop and 390x844 mobile, both grounds, plus a `reducedMotion: 'reduce'` context, with before and after shots paired at the same scroll depth. Playwright headless only, through a `.tmp/` copy of `scripts/capture.mjs` with the port swapped, plus `scripts/capture-modes.mjs` for the mode assertions.

**Grade each frame:**

- Is the canvas actually rendering, or black behind healthy-looking DOM? The number one failure mode on this site, and the reason the freeze and thaw handle exists.
- Is any reveal stuck half-way? A stalled stroke dashoffset looks exactly like this in a still.
- Does each depth have a clear focal point, or is there a dead mid-scroll frame?
- Edge defects: overflow past the rail, a wrong crop, a grid lattice not continuing across the opaque panel.

**Facts, not impressions.** `capture-modes.mjs` already asserts canvas count, h1 opacity and stroke dashoffset. When the work touches capture, two cheap additions are worth making: fail the run on console errors and failed requests, and record dropped-frame share so jank becomes a number rather than an adjective.

**Contrast is computed, not asserted.** For an A11Y-03 claim, compute the composited ratio for the token pair on each ground and report the numbers. A comment saying a token passes AA is not evidence.

The `refine` skill runs the critique-fix-recapture loop. This file supplies what to check.
