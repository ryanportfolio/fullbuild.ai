# visual-tools

Isolated Playwright devtooling — **not** part of the portfolio app. Gives the
agent (and you) cross-browser screenshots, pixel-diff regression baselines, and
motion capture.

## Setup

```bash
cd tools/visual
npm install
npm run browsers   # one-time: chromium + webkit + firefox engines
```

## Use

Point `BASE_URL` at a running dev server or a deployed preview, then:

```bash
BASE_URL=http://localhost:3000 npm run diff          # cross-browser + visual diff
BASE_URL=http://localhost:3000 npm run diff:update   # accept current as baseline
BASE_URL=http://localhost:3000 npm run capture       # motion capture (video)
npm run report                                        # open last HTML report
```

## What each pattern covers (`tests/example.spec.ts`)

| Pattern | Solves |
|---|---|
| `toHaveScreenshot` baseline | Visual regression — catches "what shifted 3px" |
| projects (chromium/webkit/firefox/mobile) | Cross-browser — WebKit/Safari bugs I can't otherwise see |
| `@capture` + `video: on` | Motion — scroll/hover/transition/R3F I can't see in a still |
| `waitForTimeout` frame freeze | Deterministic mid-animation shot vs racing a rAF loop |

Baselines live in `__snapshots__/` (committed). Videos/reports/traces land in
`.artifacts/` `.report/` `test-results/` (gitignored).

Swap the routes/selectors in `tests/example.spec.ts` for real ones once the app exists.
