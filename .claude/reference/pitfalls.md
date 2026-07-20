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
