# Motion, drawing and render craft

Local code outranks everything here. Where a rule below contradicts a documented decision in `src/components`, the code wins and its comment explains why.

## Scroll authority

**One rAF loop owns everything.** Lenis drives its raf through the GSAP ticker and forwards every scroll event to `ScrollTrigger.update`, and the same tick feeds the R3F camera, so DOM and WebGL cannot desync (`DrawingSet.tsx` 164 to 171). Never add a second authority, including a runtime degradation loop that unpins or disables motion mid-scroll: it fights the monotonic `--depth` ratchet, which exists so scrolling up never un-builds the drawing.

**Lenis needs no `scrollerProxy`.** It drives real native scroll position, so a proxy would put camera and DOM on different sources. Only the scroll-event listener half of third-party-scroller advice applies.

**Escalating quantities read `--depth`**, published on `<html>` and ratcheted. Do not invent a second progress source.

## ScrollTrigger

- Never mix `scrub` and `toggleActions` on one trigger. Scrub wins silently and the config is not an error.
- Trigger goes on the timeline or a top-level tween, never a child tween, never nested.
- Set `refreshPriority` when a trigger is created async or out of page order. `ExperienceIsland` is `dynamic(ssr:false)` and mounts only once the reader is descending, and the appended T-01 sheet extends the page after earlier triggers exist. Nothing sets it today.
- Call `ScrollTrigger.refresh()` after a real layout change and set `invalidateOnRefresh: true` on triggers whose start or end is computed from measured geometry. Resize is auto-handled and debounced; font swaps and dynamic content are not. This repo self-hosts variable faces through `next/font`, runs two JS heading fitters that resize display text after first paint (`type-and-grid.md`), and calls `refresh()` nowhere. The failure is quiet drift, so reproduce it in a capture before fixing. Refresh only on real change, debounced: a recalculation storm during a drag-resize is unaffordable here.
- Teardown: revert the `gsap.context`, remove the ticker callback, destroy Lenis, delete the global capture handle. `ScrollTrigger.getById(id).kill()` kills one trigger without tearing down the authority. Do not add `@gsap/react`; context plus explicit revert already gives that guarantee.
- `markers: true` only in a `.tmp/` copy, never committed, never during a capture run, or it contaminates every screenshot in the matrix.
- Use `clamp()` on start and end near maximum scroll, where the appendix and appended transmittal sheets sit and a naive `bottom top` range can never complete.
- Nothing on the main site pins: the rail is CSS-fixed, the Margin Law is structural, and Assembly Line gets its sticky spine from CSS `sticky` with no library. If a prototype does pin, set `anticipatePin: 1`, animate children rather than the pinned element, and check pinned sections do not overlap.

## Timing

No timing table is written down; these are the values in use and why.

**Drafting register (main site).** Mechanical, not luxurious: `power1.in`, `power2.out`, `power2.inOut`, `power3.out`, `sine.inOut` at roughly 0.32s to 0.9s, plus `--ease-hinge` reserved for scrubbed turns. Long-tail cinematic eases do not belong here.

**Prototype register.** Each prototype declares its own curve in its contract header. Fault Line's 720ms material curve and its abrupt gate shudder are correct because the abruptness carries the meaning of a refusal. There is no global ban on bounce, spring or abrupt motion; asserting one would forbid shipped, intentional work.

**Scrub choice.** `scrub: true` when the mark must track the reader exactly, because a pen that lags the hand stops reading as a hand; every trigger in `DrawingSet.tsx` is `scrub: true`. Numeric scrub lag only where the prototype's own material is meant to have inertia.

**Under scrub, shape the mapping, not the tween.** Scrubbed tweens use `ease: 'none'`, since an eased scrubbed tween reads as lag rather than choreography.

**One-shot reveals in framework-free prototypes** use an IntersectionObserver firing around 82% of viewport height, with a real one-shot guard.

**Order is authored**, never source order and never a uniform stagger. Stagger reads the authored order (`data-o` on every `ws-draw` stroke, erection order in the pour), and every sequence states its order and its reason.

**Reduced motion.** `gsap.matchMedia()` auto-reverts what it created when its query stops matching, the right shape for an OS setting that flips mid-session; `DrawingSet.tsx` checks `matchMedia` once at mount and never re-evaluates. The mechanism is an improvement, never a replacement for the parity requirement that the server-rendered floor IS the spec.

## SVG as drawing

- **Normalise, do not measure.** `pathLength={1}`, then author dasharray and dashoffset in that unit space. A runtime `getTotalLength()` is a layout read, needs JS (so the no-JS floor would ship undrawn strokes), and goes stale when a path rescales inside the band cell. `Marks.tsx` also documents that `vector-effect: non-scaling-stroke` breaks `pathLength=1` reveals.
- **Stroke order is the drafting hand.** `data-o` encodes the sequence a hand would use: setting-out and centre lines, then object lines, then dimensions and notes. Hardcoded per-class delays do not survive a procedural plate.
- **Set `transform-origin` explicitly.** SVG transforms default to (0,0), not the element centre. This bites every hinging group, rotating registration mark and spinning tick.
- **Separate rig from mark.** Transform the `<g>` for the sheet-level verb, animate stroke properties inside it for the mark-level verb. HINGE acts on the group, DRAW on the strokes.
- **No SMIL.** It is a second authority the rAF loop cannot scrub and `freeze()` cannot stop, so captures become non-deterministic. Its only real advantage is animating inside `<img>`, and every SVG here is inline.
- **Self-timed CSS keyframes are also a second clock.** Coordination means the rAF authority writes a custom property and CSS reads it. Independent keyframes are permitted only for genuinely independent ambient detail (an LED breathe, a cursor blink) in a prototype with no scroll authority.
- **Accessibility has two cases.** A pure plate gets `role="img"` plus a described `aria-label`. A figure carrying real links must not, because `role="img"` collapses the subtree and hides them; use group semantics with individually labelled focusable children. The cover figure is deliberately not `aria-hidden` for this reason.
- **Never copy** `@media (prefers-reduced-motion: reduce) { svg * { animation: none } }`. Where dashoffset is set to full length and only the keyframe drives it to zero, killing the animation leaves every stroke invisible, the blank-box failure `capture-modes.mjs` asserts against.
- Cap style is a contract decision. Round caps read as UI iconography rather than a plotted pen.

## Performance

No budget is written down. Treat numbers as hypotheses to measure with the `perf` skill and then record in `.claude/reference/`, not as gates. Core Web Vitals targets written for static marketing pages do not describe a continuous-rAF page with postprocessing.

- **Hot paths mutate transform, opacity and custom properties only**, never width, height, top, left, margin, padding, `filter` or `box-shadow`. This site mostly animates custom properties and `stroke-dashoffset`, outside that dichotomy.
- **Attribute animation on complex SVG repaints.** `MarginStudy` carries dashes as SVG attributes rather than CSS for this reason, and the Firefox repaint-trail bug sits on the same fault line (`.claude/reference/pitfalls.md`).
- **`will-change` is scoped and temporary**: applied before, removed after, few simultaneous elements, never global, never blanket across strokes. Unnecessary layer promotion on rotated drawing surfaces is the family the Firefox repaint trail came from, and the fix was hinge hysteresis, not a compositor hint.
- **Cap device pixel ratio.** A 4K display pushes several times the pixels through a bloom pass. `AdaptiveDpr` samples per-frame delta rather than wall-clock FPS, because under `frameloop="demand"` idle gaps between invalidation bursts read as dropped frames and demote healthy machines. Do not install `r3f-perf`.
- **Handle `webglcontextlost`** with `preventDefault` plus a `webglcontextrestored` rebuild, or the failure is a permanently dead canvas rather than a fallback.
- **Gate the loop.** `frameloop="demand"` with `invalidate()` from an explicit store subscription, and an exclusion list for fields that must not wake it (`progress` is excluded: never read in `useFrame`, would wake the loop every scroll tick). Mount-gate the heavy chunk on capability plus descent. Ask per `useFrame` callback whether it can unsubscribe rather than early-return when its sheet is off-screen.
- **3D economics:** few dynamic lights with the rest carried by emissive and baked AO, multisampling chosen deliberately (this repo runs 4, not 0), raymarch steps budgeted per viewport class, particles in the hundreds not thousands.

## R3F local truths that outrank external advice

- `SelectiveBloom` uses `selectionLayer` with per-frame `mesh.layers` membership, not the `selection` prop, which force-adds every diamond to the bloom layer and would keep a health-failed project glowing, breaking "red never lies".
- One `EffectComposer` is held for the island's lifetime and gated with `enabled`. `EffectComposer.dispose()` empties its pass list, so a composer surviving StrictMode's double-invoked effect renders the bloom chain over nothing, and each remount stranded a multisampled buffer pair plus the mip chain.
- `BloomStack` registers its frame callback at priority 0 when unlit, to hand rendering back to R3F.
- Depth is earned by linework, real orthographic projection and baked AO. Environment maps, HDRI lighting, orbit controls and float helpers import a lit, playful, orbitable aesthetic the fixed axonometric staging refuses.
- The store is a plain zustand 5 `create(...)` with no middleware: two-argument `subscribe(selector, callback)` needs `subscribeWithSelector`, and the store hook's equality-function overload was removed in zustand 5, so use `useShallow` if a shallow-compared selector is ever needed.
