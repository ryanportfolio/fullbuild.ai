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

## `next build` clobbers a running `next dev` server (2026-07-20)

Symptom: the dev server (preview pane / localhost:3000) suddenly serves raw
UNSTYLED HTML or 404s every `/_next/static/**` chunk — CSS `<link>` 404, JS
chunks 404 — even though the server process is up and returns 200 for the
page itself. Bit this session twice.

Cause: `next dev` and `next build` share the same `.next/` output dir.
Running `npm run build` while `npm run dev` is live overwrites the dev
server's chunks with production-hashed ones; the already-served HTML still
references the old hashes, so every asset 404s. A hard reload alone does NOT
fix it — the server is serving a poisoned `.next`.

Fix: stop the dev server, `rm -rf .next`, restart dev. Then hard-reload the
tab (CSS chunk goes 404 -> 200).

Prevention: never run `next build` against the live checkout while a dev
server is running on it. To verify a production build, either stop the dev
server first, or build/serve from a separate throwaway copy. For runtime
motion verification prefer the dev server + Playwright harness (no build
needed).
