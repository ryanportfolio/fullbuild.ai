# Deployment

> Deploy target, build output, asset paths, publish flow.

The site is a Next.js app on Vercel, deployed from `main`. Merging to `main` publishes.

## Prototypes

`/prototype` is a gallery of drafts. Each entry is a directory of static files under `public/prototype/<name>/`, with clean URLs mapped onto their `index.html` by the `rewrites()` block in `next.config.mjs`. That array is the `afterFiles` group, so real files in `public/` resolve before any rewrite runs.

Adding a static prototype: drop the built files in `public/prototype/<name>/`, add its rewrite, add a card to `public/prototype/index.html`.

## Fahrzeugmarkt is the exception

`/prototype/fahrzeugmarkt` is a Vue single-page app backed by a live Spring Boot API and PostgreSQL. Vercel cannot host a JVM service, so the API and database run on **Railway** (project `fahrzeugmarkt`, services `api` and `Postgres`), built from `backend/Dockerfile` in https://github.com/ryanportfolio/fahrzeugmarkt with the repository root as the build context.

Two things about the wiring are deliberate and easy to break:

- **The API is proxied, not called cross-origin.** `/prototype/fahrzeugmarkt/api/:path*` rewrites to the Railway origin, which keeps the session cookie first-party and means the backend needs no CORS config and no `SameSite=None`. The origin comes from `FAHRZEUGMARKT_API`, defaulting to the current deployment, so it can be repointed without a code change.
- **Rewrite order matters.** The API rewrite must stay ahead of the single-page fallback (`/prototype/fahrzeugmarkt/:path*` onto `index.html`), or the fallback swallows every API call and returns HTML.

The proxy is scoped to the prototype's own path on purpose. A blanket `/api/*` rewrite would break the site's own `/api/transmit` route.

Rebuilding the front end after a change in the marketplace repo:

```bash
cd frontend
PUBLIC_BASE=/prototype/fahrzeugmarkt/ VITE_API_PREFIX=/prototype/fahrzeugmarkt npm run build
```

then copy `dist/` over `public/prototype/fahrzeugmarkt/`. Both variables are unset locally, where Vite proxies `/api` to a backend on port 8080.

The demo is intentionally not hardened: open registration, CSRF disabled, and demo credentials published in its README including an admin account. Its data is disposable and lives only in the Railway database.

## Large media: GitHub release assets

Big binaries (the /examples demonstration reel, 157MB mp4) never enter git or `public/`. They ship as release assets on this repo (`gh release create media-<name>-v<N> <file>`) and pages reference the stable download URL (`https://github.com/ryanportfolio/fullbuild.ai/releases/download/<tag>/<file>`). GitHub serves them with HTTP 206 range support, so `<video preload="metadata">` streams instead of downloading. Re-encode first (x264 CRF 23 `-movflags +faststart` took the 1.33GB screen-capture master to 157MB at 2Mbps with crisp text). Lightweight derivatives (poster, scrub sprite sheet, waveform peaks JSON) DO live in the repo beside the page. New reel cut = new tag, update `src/app/examples/reel.ts`, re-verify station boundaries against the ENCODED file (its timing drifts ±2s from the master).
