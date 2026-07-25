# Type scale, variable axes and grid tracks

No framework sets type here. Every scale, axis value and track width is authored, so the craft below is the whole system. Local code still outranks this file.

## One root size, everything else in rem

The root size is the only zoom lever. `src/app/globals.css` sets `font-size: clamp(18px, 0.7vw + 12px, 23px)` on `html, body` and the rest of the type and spacing system is rem and clamp on top of it, so changing one number rescales the page like a browser zoom.

Derive the middle term rather than guessing it. For size `s1` at viewport `w1` and `s2` at `w2`, the vw coefficient is `100 * (s2 - s1) / (w2 - w1)` and the px constant is `s1` minus the coefficient's contribution at `w1`. The shipped values resolve to `0.007w + 12`, which hits 18px at 857px and 23px at 1571px and clamps outside that band. Write the two anchor viewports in a comment; a bare clamp with three magic numbers cannot be re-derived by the next author.

Timid small type is a slop tell. Pick the anchors so the desktop end reads deliberately large.

## Variable axes

Pick one axis to carry meaning and let the rest stay fixed. An axis that moves for decoration reads as a wobble.

- Say per role whether an axis is animated state or a fixed setting. Assembly Line transitions `font-variation-settings` and drives `wdth` from `--phase-width`, so width is state. The main site's label voice is a static `font-stretch: 125%`, so width is a role, not a signal.
- At display size prefer `wdth` over `wght` for emphasis. Weight at large sizes closes counters and darkens a whole block, while width changes the measure, which is what a display line is usually fighting over. At body size the tradeoff inverts: width damages rhythm, weight is the safer lever.
- `font-stretch` percentages and `font-variation-settings` do not compose. Choosing one per face avoids a later override silently resetting the other axis.
- Tracking is a function of size and case. The label voice runs `letter-spacing: 0.16em` at small caps size; the same tracking on a display line reads as a gap. Tighten as size grows, open as size shrinks.
- Telemetry, sheet numbers and any readout that changes gets `font-variant-numeric: tabular-nums`, as the mono voice already does in `globals.css` and across the title block, legend and shipped sheets. Proportional digits make a ticking number shimmer and shift its neighbours.

## Fitting display text to a measured column

`src/components/sheets/FitHeading.tsx` and `TaglineFit.tsx` both implement the same move: set every line flush to the measure rather than picking a size and hoping.

The method: clear the inline size so the CSS fallback governs, read the computed size as `base`, measure the text itself with a `Range` over the span's contents (the element box is the column, not the text), then set `fontSize = base * (target / textW)`. `TaglineFit` runs a corrective second pass because letter-spacing and word-spacing do not scale perfectly linearly with size, so one pass leaves a residual. Both refit on `document.fonts.ready` and on a `ResizeObserver`.

Two conditions this depends on:

- **The CSS size is a real fallback.** Fitting is an enhancement; with no JS the line simply runs shorter. Never author a size that is only correct after the fitter runs.
- **Fitting resizes display text after first paint, which changes page height.** That is exactly the case needing `ScrollTrigger.refresh()`, and this repo calls it nowhere. See the ScrollTrigger section in `motion-and-render.md`; the symptom is quiet drift in trigger start and end, so reproduce it in a capture before changing anything.

Where a static CSS size must land on the column without JS, derive the coefficient instead of tuning by eye: a word of `N` characters at the face's average advance `a` em fills a column occupying share `c` of the viewport at roughly `100 * c / (N * a)` vw. Measure `a` from the actual face at the actual axis settings.

## Grid tracks and the min-content floor

`fr` tracks have a min-content floor, so one unbreakable item can force its column wider than the grid and push the overflow right, under the fixed rail. That is a MARGIN-01 break and it has shipped broken here once (`.claude/reference/pitfalls.md`, fr-track min-content overflow, where the appendix contact specimen ended up unclickable behind the rail).

The ladder, in order:

1. Size one-word display headings to their column, by the fitter or the derived coefficient above.
2. `minmax(0, 1fr)` instead of `1fr`, and `min-width: 0` down the whole nesting chain, not just the outer grid. One un-floored descendant reinstates the overflow.
3. `overflow-wrap: anywhere` as a last resort, since it breaks words mid-glyph-run and looks it.
4. Collapse to one column at a wider breakpoint than feels necessary.

Detection is mechanical and belongs in the capture run, not the eye. See MARGIN-01 in `audit.md`.
