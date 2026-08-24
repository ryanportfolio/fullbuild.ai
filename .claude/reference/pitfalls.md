# Pitfalls

> Accumulated project-specific gotchas. Dated entries, newest at the bottom. If this file exceeds ~200 lines, split by area (`pitfalls-<area>.md`) and update the CLAUDE.md index.

## Starter safety

This starter must not ship maintainer-only checkout paths, private workflow
rules, secrets, or local-machine assumptions. Put those in untracked personal
instructions or in a private fork-specific memory file instead.

Worktree changes are isolated. Before claiming a template change is available
somewhere else, verify the exact branch or checkout the user asked about. Do not
merge, pull into another checkout, or touch paths outside the current workspace
unless the user explicitly asks in the current session.

## Local preview servers: stale or wrong site (2026-07-18)

Symptom: opening a local dev/preview server shows an outdated version of the
site, or a completely different project.

Root causes:

1. **Server reuse on a busy port.** Preview tooling (and manual servers) reuse
   whatever is already bound to the port. A server left over from a prior
   session serves old code; a different project on a shared default port
   (3000/5173/8080) serves the wrong site entirely.
2. **Worktree mismatch.** Server launched from the main checkout while edits
   live in a git worktree (or the reverse) — edits never appear no matter how
   often the page reloads.
3. **Stale build output.** Serving `dist/`/`build/` without rebuilding after
   source edits.
4. **Browser cache / service worker.** Old assets persist even after the
   server itself is current.

Prevention protocol (run every time before trusting a preview):

1. Before starting: check the port (`netstat -ano | findstr :<port>` on
   Windows, `lsof -i :<port>` on Unix). Port busy → inspect the owning PID's
   command line and cwd; if they don't match the current checkout, kill it or
   start on a fresh unique port. Never assume a reused server is the right one.
2. After loading: **sentinel check** — verify the page contains a string unique
   to the change just made (via page-text extraction, not a screenshot glance).
   No sentinel visible → server is stale or wrong; stop and diagnose before
   claiming anything works.
3. Static builds: rebuild before serving; confirm output mtime is newer than
   the edited sources.
4. Staleness persists after 1–2 → hard reload, unregister service workers, or
   use a fresh browser profile.

## Screenshots time out on RAF-driven pages (2026-07-20)

Symptom: `chrome-devtools take_screenshot` (and the preview pane) fail with
`Page.captureScreenshot timed out`. Cause: Lenis' scroll loop + GSAP's ticker
call `requestAnimationFrame` continuously — the page never reaches an idle
frame, so the CDP capture waits behind the rAF queue past its `protocolTimeout`.
A `frameloop="always"` R3F canvas makes it worse (continuous GPU commits).

Fixes, in order of preference:

1. **Don't render when idle.** R3F island uses `frameloop="demand"` +
   `invalidate()` on store change → 0 frames at rest → captures need no freeze.
2. **Freeze handle for GSAP/Lenis.** `DrawingSet` exposes a dev-only global:
   `window.__capture.freeze()` = `gsap.ticker.sleep()` (halts the ticker, and
   Lenis whose `raf` runs on it); `window.__capture.thaw()` = `gsap.ticker.wake()`.
   Restartable, no reload. Capture flow: `__capture.freeze()` → screenshot →
   `__capture.thaw()`. Prod-stripped via `NODE_ENV`.
3. **Library-agnostic last resort** (no app handle available): override
   `window.requestAnimationFrame = () => 0` to starve every rAF loop after one
   frame — but this leaves the libs dead until a reload, so prefer (2).

Note: `chrome-devtools emulate` supports `colorScheme` (use it for light/dark
theme shots) but NOT `prefers-reduced-motion`, so you can't force the static
reduced-motion path for capture that way.

## Screenshots of a frameloop="demand" WebGL layer capture STALE (2026-07-20)

Symptom: after a state change, `getComputedStyle`/pixel readback of the canvas
shows the NEW frame, but `chrome-devtools take_screenshot` shows the PREVIOUS
one (e.g. a diamond that is red in the buffer renders black in the screenshot).
Cause: CDP `Page.captureScreenshot` grabs the compositor SURFACE, and an R3F
`frameloop="demand"` canvas only commits a new surface when it actually renders;
after an on-demand render the compositor copy can lag. `preserveDrawingBuffer`
lets `canvas.drawImage`/readback see the true latest buffer, but does NOT fix the
screenshot.

Fixes:
1. Force a fresh compositor commit right before capture by nudging the canvas
   layer: `layer.style.opacity = '0.985'` (any tiny style change works). Reliable
   and does NOT disturb app state.
2. Do NOT use `resize_page` for this if you're holding manual store state — a
   resize fires ScrollTrigger.refresh and overwrites scroll-derived values
   (e.g. `pour` jumps back to its scroll position).
3. Authoritative check regardless of the screenshot: read pixels via
   `ctx.drawImage(canvas,0,0)` + `getImageData` (needs `preserveDrawingBuffer`),
   or sample store/uniform values directly.

## Embedded preview browser loads with the gsap ticker ASLEEP (2026-07-20)

Symptom: on a fresh page load in the Claude Code Browser pane, every
time-based GSAP animation is dead — DRAW timelines sit at progress 0 while
`paused()` is false and their ScrollTriggers report active. Direct-write
paths (ScrollTrigger onUpdate scrubs, IntersectionObserver-driven state) may
also fire erratically or not at all. Reproduces on the UNMODIFIED branch, so
do not chase it as a regression in your diff.

Cause: the pane's renderer starts with rAF suspended/throttled, and the gsap
ticker never wakes. `window.__capture.thaw()` (= `gsap.ticker.wake()`)
revives it, but with `lagSmoothing(0)` the whole accumulated delta applies in
one tick — timelines jump straight to their end, so pacing cannot be observed
there.

Verification that actually works: run `scripts/capture.mjs` (Playwright with
background-throttling disabled) against a live dev server. It yields real
timing, working IntersectionObserver state flips, live pen telemetry, and
screenshots. The script hardcodes `localhost:3117` — that port may be held by
a STALE orphan server from an earlier session (sentinel-check the HTML before
trusting it); copy the script to `.tmp/` with the port swapped to your own
dev server instead.

## pathLength=1 + GSAP autoRound = stroke DRAW never actually animated (2026-07-20)

Symptom: dash-reveal strokes (`pathLength={1}`, tween `strokeDashoffset` 1 -> 0)
pop on whole rather than drawing their travel; the "draw" reads as staggered
popping. Cause: with pathLength=1 the entire sweep lives inside ONE CSS pixel,
and GSAP CSSPlugin's default autoRound snaps every intermediate value to 1|0.
The travel tween was binary from day one — the effect's motion was only ever
the stagger. Fix: `autoRound: false` on the dashoffset tween (or use a larger
pathLength scale). Detection that caught it: sample offsets mid-animation and
count strokes in (0.01, 0.99) — zero partials at every instant means the tween
is snapping.

## GSAP CSS px dash + pathLength=1 = every stroke permanently truncated (2026-07-21)

Symptom: every `.ws-draw` stroke finishes its reveal drawn to only ~80% of its
length and stays that way (cover elevation: columns never reach the roof,
ridge/ground lines cut short). Worse on larger windows. Cause: GSAP's CSSPlugin
serializes `strokeDasharray`/`strokeDashoffset` to **px**, and Chrome divides
px dash values by the render scale before applying them against `pathLength=1`
— at a 472px render of a 380-unit viewBox only 1/1.243 ≈ 80.4% of each stroke
paints. Fix (DrawingSet.tsx): set/animate dash values as SVG **attributes**
(`attr: { 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }`) — user units,
pathLength-normalized. **Correction (2026-07-25):** this entry used to claim
attributes are "exact at any size". They are not, while the stroke also carries
`vector-effect: non-scaling-stroke` — see the non-scaling-stroke entry below,
which is the same 1/scale error arriving by a second route. On stroke completion remove the
animation dash and restore any authored dash pattern, dropping `pathLength`
there (authored dashes like "2 4" are viewBox units; against pathLength=1 they
exceed the whole path and render solid). This also supersedes the autoRound
entry above: the attr plugin doesn't round, so `autoRound: false` is gone.
Detection: compare a stroke's painted extent against its geometry (zoomed
screenshot), or check `getComputedStyle(stroke).strokeDasharray` for px units.

## Inflating an SVG in the DOM to "zoom in" breaks its dash reveal (2026-07-25)

Symptom: a magnified screenshot shows dash-reveal strokes painting only a
fraction of their length and stopping in mid-air, with `stroke-dashoffset` read
as 0 and the ticker frozen — a bug that does not exist at normal size. Cause:
the zoom rig set `width: 1100px` on the figure to get pixels on a small mark.
These strokes carry `vector-effect: non-scaling-stroke`, which measures dash
lengths in the svg's own CSS-pixel space, so at scale S a full-length dash
paints only 1/S of the path. At 1100px against a 384-unit viewBox that is 35%,
which reads convincingly as a geometry or path-command bug. Cost several
cycles: an `A` arc command was blamed, rewritten as a cubic, and the cubic
"failed" identically before the rig itself was suspected.

Rules: never inflate the element to inspect a dashed stroke. Magnify the
RASTER instead — capture at a high `deviceScaleFactor` at the real layout
width, then upscale the PNG.

## non-scaling-stroke silently truncates every dash reveal (2026-07-25)

`vector-effect: non-scaling-stroke` and a `pathLength=1` dash reveal cannot both
be on the same stroke. The UA measures the dash pattern in the svg's own
CSS-pixel space, so at render scale S (= `svg.getBoundingClientRect().width /
viewBox width`) a "full length" dash paints only 1/S of the path. Above S≈1.5
the pattern is short enough to REPEAT inside the path, so the stroke comes out
as segment-gap-segment rather than merely short.

Measured on the live site at a 1920 viewport: MarginStudy rendered 554px against
a 384-unit viewBox (S = 1.44) and every mark painted 69% — ground line short of
its columns, rafters short of the apex, registration ring an open hook. The
cover Elevation renders 707px against 380 units (S = 1.86); its ground line
pinned at dashoffset 0.5 painted 96 units, gap, then 72 units of a 360-unit
path, against the 180 units it should have.

Fix: **drop `vector-effect`** from the animated strokes. Applied in both
MarginStudy and Marks.tsx (which backs every .ws-draw stroke on the site).
Dashes then measure in user units and `pathLength=1` is exact at every size.
The cost is that stroke WIDTHS scale with the drawing, which for a drawing that
scales as a whole is the honest behaviour; re-check any hairline under 0.6 user
units, since it can drop below half a device pixel at the narrow end and grey out.

Note this is invisible near S = 1.0 and does NOT show up in a settled screenshot
of anything that strips its dash attributes on completion the way DrawingSet
does — there the defect lives only in the reveal, ending in a snap to full
length. Detection: pin a long stroke at `stroke-dashoffset` 0.5 and check that
the painted run is half the path and not half/S, and always read
`getBoundingClientRect().width / viewBox width` before trusting any dash shot.

## fr-track min-content overflow crosses the rail (2026-07-21)

Symptom: sheet content (appendix contact specimen) renders under the fixed
rail (a Margin Law break) and anything clickable there is unreachable
(Playwright: "aside[data-rail] intercepts pointer events"). Cause: `fr` grid
tracks have a min-content floor. One unbreakable item (the WORKFLOWS heading at
7.5vw ≈ 833px, or a nowrap mono line) forces its column wider than the grid,
and the overflow runs right, under the rail. Fix pattern: size display-scale
one-word headings to their column (vw coefficient derived from the column's
share of the measure), `minmax(0, 1fr)` + `min-width: 0` down the chain,
`overflow-wrap: anywhere` as last resort, collapse to one column earlier.
Detection: `elementFromPoint` at the element's center, or compare
`el.getBoundingClientRect().right` against the rail's `left`.

## Playwright harness traps on this site (2026-07-21)

- `document.body.innerText.includes(...)` returns the RENDERED text —
  `text-transform: uppercase` content fails a mixed-case sentinel check. Use
  `textContent` for sentinels.
- Raw `page.mouse.*` coordinates do NOT auto-scroll the target into view
  (unlike `click`/`fill`). Scroll first via `__lenis.scrollTo(y, { immediate:
  true })`, then re-read the bounding box.
- `mailto:hi@fullbuild.ai` matches TWO links (shipped sheet + appendix);
  scope selectors (`#rev a[href^="mailto:"]`) or strict mode kills the run.
- Blank areas of an SVG are not hit targets: an interactive svg (the SGN box)
  needs a transparent `<rect pointerEvents="fill">` catcher or strokes can
  only start on painted geometry.

## WebGL persistence atlases go blank on font reflow / resize (2026-07-21)

Symptom (burn-in prototype, applies to any accumulate-into-FBO design): a
`prefers-reduced-motion` or on-demand render path that bakes into a persistence
framebuffer once, then only re-presents, shows black scopes after the webfont
finishes loading or the window resizes. Cause: element rects change, the atlas
allocator sees a new signature and recreates its textures cleared to zero, and
the present-only path never re-accumulates. Fix pattern: the render core
returns `atlasRebuilt`; present-only callers must re-bake when it is true, and
the initial bake should also re-run on `document.fonts.ready`. Capture scripts:
`window.__burnin.freeze()/step(ms)` gives deterministic frames for screenshots
(occluded Playwright windows throttle rAF to ~1fps, which is a capture
artifact, not a page bug).

## Per-frame custom-property writes on `<html>` are a full-document tax (2026-07-31)

Symptom: scroll runs at ~35fps with >half of frames over 25ms; trace shows
style recalc (not layout, not script) dominating, with repeated recalcs of the
ENTIRE document (1859 elements, 5-8ms each). Cause: writing an inherited CSS
custom property (`--depth`) to `document.documentElement` every scroll tick.
Two costs compound: every element's computed style must update (custom props
inherit), and any consumer painting a large surface (the `--rule-sub`
`color-mix` in the html/body ground gradients) repaints + re-rasters the whole
viewport per write.

Fix pattern (DrawingSet.tsx `applyDepth`): split channels — per-frame writes go
to the smallest subtree that visibly needs smoothness (the rail, for its ruler
head), and the `<html>`-level write quantizes to ratchet steps (1/24) sized so
the largest painted change per step is imperceptible (0.0033 alpha here).
Result: 57fps, whole-document recalcs 173 -> 24 per scroll.

Diagnosis method that found it (scripts preserved in this entry's PR #115):
wrap `CSSStyleDeclaration.prototype.setProperty` / `setAttribute` via
`page.addInitScript` to census per-frame writes, trace `UpdateLayoutTree`
`elementCount` to see recalc scope, then A/B each suspect with an init-script
patch before touching source. Headless-fps caveat: SwiftShader raster floors
fps at ~35-40 regardless of variant, so main-thread trace sums (recalc,
commit, raster COUNT) are the transferable metric, not raw fps — though a
strong-enough fix (this one) still shows up as 57fps even there.

## Codex local UI verification uses Codex Browser first (2026-07-29)

Symptom: a Codex session starts a separate Playwright workflow even though the
in-app Codex Browser is available, splitting UI state across tools and making
stale tabs or extra preview processes harder to diagnose. Fix: Codex must use
the in-app Codex Browser for local navigation, screenshots, interaction checks,
and responsive inspection. Standalone Playwright is a fallback only when Codex
Browser cannot perform a necessary check or the user explicitly requests it.
This rule is Codex-specific; Claude Code keeps its configured verification
workflow. Browser choice does not replace the existing fresh-port and sentinel
checks.

## Firefox drops subpaths when a finished stroke keeps its dash

The dash draw-in (`pathLength={1}` + `stroke-dasharray: 1 1`, offset 1 -> 0) must END with both dash attributes REMOVED. Firefox mis-renders a lingering dasharray on multi-subpath paths even at offset 0: later subpaths land in dash gaps, so hatch ticks, dim arrows, and letterforms vanish or "rearrange" while single-subpath strokes look fine. Chromium forgives the residue completely, so Chromium-only verification passes clean and the defect ships to Firefox users. Reproduced 2026-08-08 on the rail sketch (PR #154). The law: a finished stroke carries no dash. Strip attrs on completion (see `.ws-draw` tweens, `useRailSketchDraw`, DrawingSet's sketch scrub, RailLogo's settle timer); `tests/rail-sketch-draw.test.mjs` pins it. Verify dash work in Playwright **Firefox**, not just Chromium. The SAME defect fires at the START: a stroke parked at offset 1 with the rig hung leaks subpath fragments on load, so the waiting state must be carried by the `visibility` attribute, never by the dash (PR #156) — a stroke wears the dash ONLY while actively in flight.

## RTK proxy hook mangles CLI flags for native binaries (2026-08-08)

Symptom: `npx next dev -p 43121` dies with `error: unknown option '-p'`, and
`npx next dev --help` prints a two-line build summary instead of next's usage
text. Cause: the RTK shell hook rewrites and output-filters commands, and it
eats short and long flags on its way to the native exe. The local `next` binary
and `next` package are both fine. Fix: prefix with `rtk proxy`, which executes
the raw command unfiltered:
`NEXT_DIST_DIR=.next-warp rtk proxy npx next dev -p 43121`. Plain `node --test`
and `npm run typecheck` are unaffected. Isolate concurrent worktrees with
`NEXT_DIST_DIR` (read at `next.config.mjs:13`) as well as a distinct port: two
dev servers sharing one build dir corrupt each other silently.

## Lenis scrollTo refuses in silence while stopped or locked (2026-08-10)

`lenis.scrollTo(target, opts)` opens with
`if ((this.isStopped || this.isLocked) && !force) return` — no throw, no return
value, nothing to check. Any custom control that drives the page through Lenis
(the bound-edge scrollbar in `src/components/chrome/SetEdge.tsx`) therefore has
to pass `force: true`, or it moves under the cursor while the page stays put:
the worst failure a control has, because it looks like it worked. The homepage
intro holds `isStopped` for its whole ~6s run, so the window is real, not
theoretical.

The same 6s window makes Playwright verification of anything in the margin race
the intro. `data-intro-pending` lifting is NOT the all-clear — the film keeps
painting for seconds after it. Gate on the thing you are about to click actually
being hittable, plus the authority being awake:

```js
await page.waitForFunction(() => {
  const el = document.elementFromPoint(window.innerWidth - 6, 40);
  return !window.__lenis.isStopped && el?.closest('[data-set-edge]') !== null;
});
```

Two probes were written off as product bugs before `elementFromPoint` showed the
pointer was landing on `intro_loadSheet` the whole time.

## Suppressing the native scrollbar must be gated on the replacement (2026-08-10)

`scrollbar-width: none` on `html` is written by `SetEdge` stamping
`data-set-edge` at mount, never as a static rule, and the CSS is width-gated to
match where the custom strip actually draws (`min-width: 901px`, since `--edge-w`
collapses to 0 below that). A blanket suppression leaves no-JS visitors, the
app-router prototypes (which mount no site chrome), and every narrow window with
no scrollbar of any kind. Related trap in the same component: the strip's
"is there anything to scroll" floor must be `range > 1`, not the half-a-viewport
floor the site log uses — that floor answers a question about whether an
animation has room, and borrowing it left `/examples` (197px of overhang at
1440x900) with the native bar suppressed and nothing drawn in its place.

## Static prototype pages: relative asset paths 404 at the clean URL (2026-08-19)

Symptom: /prototype/<name> renders unstyled HTML with broken images, while
/prototype/<name>/ renders fine. The rewrite serves the clean URL WITHOUT a
trailing slash, so the browser resolves relative hrefs (`css/site.css`,
`../foredge/img/...`) one directory up and they 404. serve-prototype.mjs
mirrors this, so the trap reproduces locally only if you test the no-slash
form; testing with the slash masks it.

Fix: every asset href/src/url() in a static prototype page is root-absolute
(`/prototype/<name>/css/site.css`), the convention quench and doodad already
follow. Files that are always requested at their real path (the foredge email
.html artifacts) may keep relative paths. Verify new prototype pages at the
no-slash URL.

## Headed Chrome steals the screen unless you place it (2026-08-23)

The browser rule is headed Chrome on the real GPU, and a plain
`chromium.launch({ headless: false, channel: "chrome" })` drops that window on
top of whatever the operator is doing and takes the keyboard with it.

Minimizing does not solve it. Measured on the owner's box: a window minimized
through CDP (`Browser.setWindowBounds`, `windowState: "minimized"`) loses its
compositor surface on Windows and requestAnimationFrame throttles to **1 Hz**,
with or without `--disable-features=CalculateNativeWinOcclusion`. Screenshots
still return fresh pixels at 1 Hz, so a static DOM shot survives; every frame
timing, scroll narrative, Lenis/GSAP/R3F run and the Layline pixel-ratio
governor read garbage.

Fix: `scripts/lib/launch-chrome.mjs` -> `launchPlacedChrome()`. It places the
window on a display that is not holding the foreground window, then hands the
foreground back to the window that had it. `CHROME_PLACE` picks the mode:
`other-monitor` (default), `offscreen` (parked at -2400,-2400, rendered but
never visible, and the fallback when only one display is attached), or `here`.
Both placed modes held 100.5 fps on a 100 Hz panel, same as an unplaced window.

Notes: `--window-position` applies to the first window of a launch, so one
launch per run. Placement is Windows-only and degrades to a plain headed launch
elsewhere. The DIP-to-pixel mapping assumes both displays share a scale factor.

## A GitHub release asset cannot back a `<video>` (2026-08-24)

Release assets are free hosting and serve `Accept-Ranges: bytes`, so a media
element seeks in them correctly and they look like a solved problem. The
response also carries:

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename=<name>.mp4
```

GitHub bakes both into the signed redirect target, so nothing about how the
file was uploaded or named changes them. Desktop Chrome sniffs the bytes and
plays anyway, which is how it ships; an engine that takes the declared type at
its word has no media to decode, and the element just sits there. Reported on
`/layline-vid`: play did nothing on a phone.

Fix: commit the file under `public/` and serve it same-origin. Vercel declares
`video/mp4` with ranges intact (measured on
`/prototype/maranatha/assets/farm1.mp4`). That puts the bytes in git forever,
so the encode has to earn its size: `/layline-vid` re-cut CRF 22 to CRF 29 for
47.3 MB at SSIM Y 0.994 against the master, with duration, frame count and fps
unchanged so nothing the sheet prints moved. Re-derive the poster, the scrub
sheet and `peaks.json` from the file actually served, and re-measure SSIM;
`scripts/reel-peaks.mjs` carries the whole pipeline in its header.

Same class, same page: `Element.requestFullscreen` does not exist on iOS
Safari. Fullscreen there is `HTMLVideoElement.webkitEnterFullscreen()` and
nothing else, so a fullscreen button that targets a wrapper is dead on that
engine and blows the whole layout up to the display everywhere else.

## The Next.js dev indicator is not page furniture (2026-08-24)

Symptom: a screenshot verifier reports "the page's fixed compass badge sits over
the CTA at the foot of the viewport", measures it at roughly x 20 to 62, and
files a blocker. Two rounds of the Layline race-library CTA moved a button to
clear it before anyone asked what the disc was. It is the Next.js dev-tools
button: a 36px circle at bottom left, inside a `nextjs-portal` custom element,
present on `next dev` only and absent from `next build` + `next start`.

It hides from ordinary DOM sweeps, so it reads like unfamiliar app chrome: it
lives in a closed-looking shadow root, so `document.querySelectorAll('*')` never
returns it, while `document.elementFromPoint` over it returns `NEXTJS-PORTAL`
with a 0x0 box. That is the tell.

Rule: before designing around any fixed element nobody can name, find the
component that draws it. `document.querySelectorAll('nextjs-portal')` and walking
`el.shadowRoot` names it in one call, and a `next start` run on the built output
settles it. Grepping the repo for the thing you think it is proves nothing when
the thing is not in the repo.

Layline-specific traps live in `pitfalls-layline.md`.

## External clone/capture services vs robots.txt (2026-08-24)

Symptom: the Ditto clone API returned failed with a robots.txt disallows-crawling error on a target reference site (oci.madebybuzzworthy.com), while manual Playwright inspection of the same page worked fine.

Cause: capture services do bulk crawling and honor robots.txt; an interactive browser session loading one page is a different activity class. Many polished portfolio sites disallow automated crawling.

Resolution: do not route around a refusal. Default to the reference-site-prototyping skill Playwright forensics (screenshots, getAnimations, stylesheet inventory, shader extraction, HAR) as the primary evidence path; treat external capture services as optional tier-3 bulk inventory at best.

## DSH harness: multiline inline commands fragile (2026-08-24)

Symptom: Invalid arguments or silent no-output from pwsh tool calls carrying multiline inline scripts (repeated ~4x in one session).

Cause: the DSH run_code/pwsh bridge mangles multiline strings with nested quotes passed inline.

Resolution: write .mjs/.ps1 files with the file-write tool, then execute by path (node file.mjs, pwsh -File file.ps1). Recurs across every session in this harness.
