# Commands

Run from the repository root with the bundled Node.js runtime. The site has no package dependencies.

| Command | Authority |
| --- | --- |
| `npm run build` | Regenerate `index.html` from `content/site.json` and `src/template.mjs`. |
| `npm test` | Run the dependency-free content, phase-token, generated-page, and state-machine suites. |
| `npm run verify` | Check generated freshness, factual locks, accessibility hooks, material laws, internal assets, prohibited visual patterns, dependency state, and transfer budgets. |
| `npm run serve -- --port 4173` | Serve a no-cache local preview at `http://127.0.0.1:4173/`; the port is optional. |

Authoritative integrated check: `npm run build; npm test; npm run verify` in PowerShell. All three exited `0` on 2026-07-20 during Build Seam browser refinement.

There is no deployment command. Production shipment remains locked until hosting and release evidence are configured.
