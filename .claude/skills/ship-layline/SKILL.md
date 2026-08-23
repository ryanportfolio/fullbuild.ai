---
description: Lands finished Layline work in both repos it lives in, fullbuild.ai and the public mirror ryanportfolio/layline, with the drift and parallel-session checks the split copy needs. Use on /ship-layline or an ask to merge Layline into both.
---

# Ship Layline: land one change in both repos

Layline lives twice: the real app under `src/{components,lib}/layline` and `src/app/prototype/layline` in `fullbuild.ai`, and a standalone copy in `ryanportfolio/layline` that is the public "view source" repo behind the live prototype. A visitor comparing the two must see the same code, so a Layline change is not shipped until both carry it.

This skill is the checklist for that. It exists because the split copy fails in specific, repeatable ways, and every trap below has actually happened.

## Step 0: Confirm the ask covers both repos

Merging is not casually reversible, and the owner's standing rule is to open PRs and not merge without being asked. Run this only when the user has asked to merge or ship. If they asked only for fullbuild, say the mirror will drift and ask whether to sync it too.

## Step 1: Rebase on freshly fetched main, then re-gate

Other sessions merge to `main` while you work. Main moved three times during one Layline change; twice it touched the same files.

- `git fetch origin main` in the fullbuild worktree, then check `git rev-list --count HEAD..origin/main`. Nonzero means rebase and re-run the gate. A gate that ran on a stale base proves nothing about the merged result.
- Re-gate after every rebase: `npx tsc --noEmit`, the layline test files under `tests/` via `npx tsx --test`, `node --test tests/prototype-layline.test.mjs`, `npx eslint` on the files you touched, and `npx next build`. The build is the authoritative one; a bare worktree `tsc` has passed while the build failed.
- Lint the files you touched, not the whole tree: `src/components/relay` and `src/components/threadline` carry pre-existing errors on main that are not yours to fix here.

## Step 2: Read the other open PRs before merging

`gh pr list --state open --json number,title,headRefName` then, for anything that sounds like Layline, `gh pr view <n> --json files`. Compare its file list against `git diff --name-only origin/main..HEAD`.

Overlap does not block you, but it decides who rebases. Say plainly in your report which open PR now needs a rebase and on which file, so that session hears it from you rather than from a conflict. `src/components/layline/store.ts` is the usual collision: it holds the replay store every lane touches.

## Step 3: Prefer syncing the mirror first

The mirror is the stricter gate. Its `tests/layline-page.test.mjs` asserts things fullbuild has no equivalent of, so fullbuild CI cannot catch them:

- no `Math.random`, `Date.now`, `performance.now` or `new Date(` anywhere in the layline tree
- no em dash, en dash, ellipsis or curly quote
- no `linear-gradient`, `radial-gradient` or `backdrop-filter` in `src/app/layline.module.css`; a gradient belongs in a component module instead
- `three` pinned to `^0.171`

A `performance.now()` once reached fullbuild main and was only caught on the sync. Running the mirror sync before the fullbuild merge means a failure costs a branch edit instead of a follow-up PR to main. If the user wants fullbuild merged first, that is fine; say that the mirror may need a follow-up.

## Step 4: Sync the mirror from a fresh worktree

The local mirror checkout at `C:\Users\Home\CoreWise\layline` is routinely far behind; it was 18 commits behind on one sync. Never base the sync on it and never leave it dirty.

```
git -C <mirror> fetch origin
git -C <mirror> worktree add <mirror>-sync-<tag> -b sync/<tag> origin/main
```

Copy from fullbuild's committed `origin/main`, not from your working tree, so what ships is what merged:

```
git archive origin/main src/components/layline src/lib/layline src/app/prototype/layline | tar -x -C <tmp>
```

Path map:

| fullbuild | mirror |
|---|---|
| `src/components/layline/**` | same path, content identical |
| `src/lib/layline/**` | same path, content identical |
| `src/app/prototype/layline/{page.tsx,layline.module.css,scrollbar.css}` | `src/app/` |
| `src/app/prototype/layline/<route>/**` | `src/app/<route>/**` |
| `src/app/api/layline/**` | same path |

Then the rewrites:

- import path `@/app/prototype/layline/` becomes `@/app/`
- home links `href="/"` become `href="https://fullbuild.ai"` (the prototype bar's house mark and the colophon, on every page)
- route links lose the prefix: `/prototype/layline` becomes `/`, `/prototype/layline/<route>` becomes `/<route>`
- relative imports inside a route folder (`../layline.module.css`) resolve unchanged, because the folder depth matches

## Step 5: Check the whole shared surface, not just the two trees

The path map is not the change set. Two things it misses:

- **The API route.** `src/app/api/layline/**` is shared and drifts silently, because it is not under either mirrored tree. Diff it every time.
- **Anything new outside the map.** A new component module, a new route folder, a new file in `src/lib/layline` all travel; a dev script under `scripts/` usually does not, since the mirror has no browser tooling. Decide per file and say which you left behind.

Diff both ways before opening the PR. Line endings will lie to you: fullbuild commits CRLF, the mirror has `* text=auto eol=lf`, so `diff -r` reports whole files as changed and `git status` shows dozens of stat-dirty entries that are not real. Trust `git diff --numstat` inside the mirror worktree, or `diff --strip-trailing-cr`. The real change set is small and every entry in it should be explainable.

## Step 6: Move the mirror's own tests with the code

Tests are per repo and neither copy's test file is a mirror of the other's. When a shared component changes shape, expect the mirror's page contract test to pin the old shape and fail. Update it to pin the new truth in the same way you updated fullbuild's; do not delete the assertion.

`src/app/globals.css`, `src/app/layout.tsx` and `src/app/icon.svg` are mirror-owned and may differ. Font rules live in `globals.css`, so a `@font-face` change like `font-display: block` has to be hand-applied on each side rather than copied.

## Step 7: Gate the mirror, regenerate its README, open the PR

In the mirror worktree: `npm install` if needed, `npx tsc --noEmit`, `npm test`, `npm run build`, then `npm run readme` whenever either shared tree changed. Confirm the build emits the routes you expect.

Open the PR with `gh pr create --repo ryanportfolio/layline`. State in the body which fullbuild commit it was copied from, the rewrites applied, that `sim.ts` and `types.ts` are untouched, and any test you moved. Then wait for its `verify` check; it is stricter than anything you ran locally.

## Step 8: Merge, then check the live site after the fact

Squash-merge both, fullbuild first if that is the order the user chose. Do not block on Vercel's PR checks; merge, then probe the live URLs directly and report the codes:

```
curl -s -o /dev/null -w "%{http_code}\n" https://fullbuild.ai/prototype/layline
```

Probe every route the change adds, not just the one you were thinking about.

## Step 9: Report what a reviewer cannot see

Name the merge commits in both repos, the live probe results, which open PR now needs a rebase and on which file, and anything you deliberately did not carry across.

## Step 1b: Gate the commit, not the working tree

Confirm `git status` is clean before you gate, and read the diff you are about to merge with `git diff --stat origin/main..HEAD`. The source-reading tests here open files from disk, so an unstaged file makes them pass on work that is not in the commit: a title card once merged without the one line that passed it its text, and the same tests went red on main the moment they ran against the committed tree. If `git status` shows anything after the commit, find out why before merging.

## Traps worth knowing

- `npx next build` overwrites `.next` under a running `next dev`, and the dev server then serves 500s for chunks it can no longer find. Restart the dev server after any build, or run the build on a copy.
- The owner's machine keeps `OPENROUTER_API_KEY` in the user environment, so a "keyless" analyst path only tests as keyless when the variable is explicitly cleared for that command.
- Browser verification is headed Chrome, never headless: headless renders this WebGL page through SwiftShader on the CPU and pegs the machine.
- The seeded race is pinned by golden tests in both repos. `src/lib/layline/sim.ts` and `src/lib/layline/types.ts` should show no diff on a sync; if they do, stop and find out why.

## Anti-patterns

- Don't merge without an explicit request, and don't treat one repo's merge as permission for the other.
- Don't sync from your working tree or from the stale local mirror checkout; use fullbuild's `origin/main` and a fresh mirror worktree.
- Don't read a `diff -r` line-ending storm as drift, and don't "fix" it by normalizing files wholesale.
- Don't skip the API route because it is not in the two mirrored trees.
- Don't delete a mirror assertion that fails; pin the new truth instead.
- Don't claim the deploy is live without probing the URLs, and don't wait on Vercel's PR checks to do it.
