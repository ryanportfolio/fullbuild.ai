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

## Figma Dev Mode MCP

Config in repo `.mcp.json` → official server `127.0.0.1:3845/mcp`. Loads
automatically each session. Requires paid Figma plan + Dev seat and Figma desktop
with *Preferences → Enable Dev Mode MCP Server* running. Use it to pull tokens/
specs/measurements straight from the design source instead of eyeballing screenshots.
