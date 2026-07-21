# Commands

> Build / dev / test / deploy commands for this project.

_(no app scripts yet — record the project's npm scripts / make targets / CLI invocations here)_

## Visual devtooling — `tools/visual/` (Playwright)

Isolated harness (NOT app deps) for cross-browser screenshots, visual-diff
regression, and motion capture. Engines: chromium / webkit / firefox / mobile-safari.
Point `BASE_URL` at a running dev server or deployed preview.

```bash
cd tools/visual
npm install && npm run browsers      # one-time (browsers = engine binaries)
BASE_URL=http://localhost:3000 npm run diff          # cross-browser + visual diff
BASE_URL=http://localhost:3000 npm run diff:update   # accept current as baseline
BASE_URL=http://localhost:3000 npm run capture       # motion capture (video)
npm run report                                        # open last HTML report
```

Patterns + selectors to adapt: `tools/visual/tests/example.spec.ts`. Full notes:
`tools/visual/README.md`. Baselines in `__snapshots__/` (committed); video/report/
traces gitignored. Firefox needs its own firewall allow for outbound
(`ms-playwright/firefox-*/firefox/firefox.exe`).

## Figma (plugin: `figma`)

Official Figma Claude Code plugin — installed per-machine (not repo config), OAuth
to figma.com. Authorize once via `/mcp` in an interactive session. Account: Dev seat,
Pro tier. Tools: `get_design_context` (specs/measurements from a node), `get_variable_defs`
(design tokens), `get_screenshot`, `use_figma` (write/build in a file), `get_metadata`,
`search_design_system`, Code Connect (`get_code_connect_map` etc.), `generate_diagram`.
Bundled skills load on demand — e.g. `figma-design-to-code` (mandatory before
`get_design_context` for a full design→code build), `figma-use` (before any `use_figma`).
Pull tokens/specs straight from the design source instead of eyeballing screenshots.

Note: the plugin supersedes the old hand-rolled Dev Mode local-server `.mcp.json`
(removed) — no `127.0.0.1:3845` config needed.
