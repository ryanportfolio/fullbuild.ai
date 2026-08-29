# Layline pitfalls

Gotchas specific to the Layline race replay (scene, render gate, capture
harness, mirror sync). Cross-cutting site traps stay in `pitfalls.md`;
mirror-sync procedure lives in the `ship-layline` skill.

## Pixel comparisons: park the mouse off-canvas first (2026-08-23)

Symptom: two Playwright element screenshots of the Layline canvas taken around
a forced redraw differed by ~350 channel samples (max delta 87) and read as a
render-gate bug. The picture was fine: element screenshots composite every DOM
layer over the element's box, and the pointer left sitting on the water after a
click puts the BoatCursor overlay (and any hover state) into both shots at
slightly different paint states.

Fix: `page.mouse.move()` to a corner outside the canvas box before capturing,
then re-shoot. Control run with the pointer parked showed 0 delta across all
2.76M samples, settled frame vs forced redraw. Applies to any DOM-overlaid
canvas comparison on this site, headed Chrome included.

## Per-cent-of-target needs a steady-sailing window (2026-08-23)

Symptom: the brief's performance view read the fleet at 257 to 864 per cent of
polar target on the beat. Nothing was wrong with the polar or the fixes.

Cause: `polarFrac(twa)` goes to nearly zero inside the no-go zone, so a boat
swinging through head to wind divides its own speed by almost nothing and the
ratio runs away. On the shipped race, 18 of about 100 beat fixes per boat sit
inside a turn at 4 Hz, which is enough to carry the mean.

Fix: `analytics.polarReview` drops every fix within `STEADY_WINDOW` (3 s, the
same window `maneuversOf` merges flips across) of a detected turn. The fleet
then reads 87.5 to 92.1 per cent, and the dropped seconds are accounted
separately as the knots each turn cost. A TWA floor alone is not enough and is
not needed: with the window applied, floors of 0, 20 and 30 degrees give
identical figures.

## The cover's stroke widths no longer need --plot-px (2026-08-23)

While the boot cover drew the fleet's approach tracks, `vector-effect:
non-scaling-stroke` was banned on the layer: Chrome reads `stroke-dasharray` in
device pixels once a stroke is non-scaling, and the reveal (how far a boat had
sailed, cut out of the dash) repeated down the track instead of drawing one
prefix. The workaround was a measured metres-per-pixel written onto the drawing
as `--plot-px` and multiplied into every width.

Those tracks are gone. Nothing on the cover reveals a path with a dash now, so
the polar's grid, its target curve and the VMG traces use non-scaling-stroke
like the console's own strip does. Bring the ban back with any dash-reveal.

## One clock, owned by the shell (2026-08-23)

The brief's prestart loop lives in `RaceBrief.tsx`, not in a view. Only one view
is mounted at a time and the performance view does not move, so a loop inside
`BriefPanels` stopped the countdown, and the scene warming behind the cover with
it, the moment a reader opened the other tab. Views subscribe to the store and
paint; the shell seeks.

The opening seek stays guarded (`!(t >= race.tMin && t < 0)`). Unguarded it
fires on every view swap: measured before the guard, switching at t = -6 put the
clock back to -10 and a held capture left its stated time.

## The polar cloud is not byte-reproducible (2026-08-23)

Two captures of the performance view at a stated time land on one of exactly two
hashes, differing by 6 pixels out of 691,390, each off by one LSB in one
channel, all of them antialiased edges of individual dots in the 886-sample
cloud. It is a Chrome rasterization path choice, not motion: the view has no
animation and the two hashes are stable values rather than a continuum.
`shape-rendering: geometricPrecision` changes nothing (verified: identical
hashes). Do not demand a byte-identical hash for this view; the panels view is
byte-identical across four runs and still worth pinning.

## Freeform inherits the entering rig's field of view (2026-08-28)

`seedFreeformFromShot` (`interaction.ts`) copies `shot.fov` into the freeform
camera: enter from tactical and the scene renders at 45 deg (1056.2 px/rad),
from tv at 40 (1202.0 px/rad), from chase at 55. The battery cycles
chase, tv, tactical before freeform, so its shots use 45; a probe that goes
straight to freeform gets 40, and the same asserted yaw/pitch/dist puts a
ridge 23 px away from where the battery's constant predicts. Pixel arithmetic
is only comparable within one entry route. Every capture script must print
its route and focal constant into its own JSON.

## Capture posing is API-only (2026-08-28)

`window.__layline.camera({yaw, pitch, dist})` poses the freeform camera
absolutely, clamped to pointer limits, echoed back through `info()`. Synthetic
pointer drags under-rotate under load (owner-observed) and are banned for
posing. A still press is never safe on the canvas: on water it toggles
playback, on a boat it selects (`pressOutcome`). `__layline.ui(false)` bares
the scene (visibility, no reflow) for environment crops. The animated dither
advances per drawn frame: hash-compare only captures with identical scripted
frame counts; pixel-diff otherwise.

## Ready follows the drawn venue frame; tactical never settles frozen (2026-08-29)

Round 6 rewired readiness: `window.__layline.ready` = webglOk plus a venue
tri-state (absent/loading/rendered/failed), and `rendered` is written only by
the last venue layer's `onAfterRender`. On a venue race, ready flips exactly
when `info().drawCalls` reaches 53 and is never true at 48: a capture behind
ready genuinely contains the coast. Two sharp edges. (1) On the failure path
ready is true only after the procedural fallback arc's own drawn frame
(`failed` is not ready; the arc's onAfterRender promotes it to `fallback`,
fixed after codex round-6 P1: previously a paused replay could sit ready with
no coast drawn at all). A capture that needs the REAL coast must still check
draw calls: ready + fallback contains the arc, not the venue. (2) The settled
tactical rig drops the venue
(49 draws / 81,962 tris live, keyed on the composed shot reaching mix >= 1),
but a FROZEN page never completes the hand-over: `rig("tactical")` after
`freeze()` holds all five venue draws indefinitely. A capture wanting the
settled tactical framing must thaw, wait at least 2.5 s, then re-freeze.
Also: `npm run build` tears the running dev server's `.next` (document 200,
stylesheets/chunks 404 or 500); restart the server and re-run the server
gate before any capture that follows a build.

## venue-lens mask vs readiness, and lens after settled tactical (2026-08-29)

`__layline.show({venueLayers: [...]})` (dev-only inspection door) hides venue
layer meshes by visibility, and readiness is latched by the LAST venue layer's
`onAfterRender`: an invisible mesh never renders, so an early venue mask could
strand `ready` at `loading` forever. FIXED after codex review of f9944a0d:
the mask DEFERS venue-layer hiding until the venue's first drawn frame (or a
promotion without one, e.g. settled tactical), then applies the pending mask
itself and requests one frame so a frozen page shows it (verified headed:
mask before ready, ready rises, draws settle at the masked 49). Related fix,
same review: layer meshes (re)mounting on a frozen page request their own
frame, so `lens()` aimed at the coast right after a SETTLED tactical rig
dropped it now draws the venue (49 -> 54 draws, verified). Capture scripts
still must not assume the FIRST frame after such a lens() contains the coast:
wait on `info().drawCalls`. Also from the lens audit: production elimination
of the lens/show doors is asserted by source inspection (every door behind
`process.env.NODE_ENV !== "production"`); a build-level proof
(`NEXT_DIST_DIR=.next-audit npm run build` + grep client chunks for
`api.lens`/`setShowMask`) is owed at the next quiet-worktree gate run since
`npm run build` tears a live dev server's `.next`.
