# Codex Skill Compatibility

`.claude/skills/` is Claude's source; `.agents/skills/` holds Codex's own maintained versions. Every skill has a native Codex version or is disabled; there are no generated adapters. A Codex skill exposes a workflow; it does not prove every runtime capability exists.

`.agents/skill-modes.json` declares `native` or `disabled` for every skill; `adapter` is no
longer valid, and an unregistered Claude skill fails the sync check. Maintain native skills directly in `.agents/skills/<name>/`;
they do not load Claude workflow bodies. Sync preserves native content and validates
metadata and local references. Legacy `skillOverrides: off` remains disabled. Move a
maintained skill outside discovery explicitly before disabling it. Ownership is separate
from the capability classifications below. `writing-skills` and `unslop` entrypoints are
retired in both runtimes. Use `addskill` for create/import/update/install; it uses built-in
`skill-creator` as the Codex authoring mechanism.

Personal installations are explicit copies of these sources. See `docs/codex-skills.md`
for comparison, backup, reconciliation, and discovery checks.

- **Native**: direct mapping.
- **Adapted**: Codex paths, approvals, or UI substitutions.
- **Capability-gated**: requires a currently exposed tool.
- **Claude-only**: no faithful Codex implementation.
- **Dangerous**: explicit authorization required for Git, deploy, migration, publish, or persistent side effects.

| Status | Skills |
|---|---|
| Native | `addskill`, `babysit-ci`, `brainstorming`, `bro`, `caveman`, `dsh-plugin-permanent`, `enhance-prompt`, `external-review`, `fable-mode`, `forge-repo-ui-skill`, `handoff-audit`, `next-round`, `recall`, `refine`, `servers`, `session-hub`, `showpiece`, `wrapup`, `writing`, `writing-plans` |
| Adapted | `astra-review`, `claude-review`, `codex-review`, `init-project`, `lab`, `optimize-context`, `opus-fullreview`, `sync-starter` |
| Capability-gated | `advocate`, `arena`, `dare`, `design-fullbuild-surfaces`, `impartial-review`, `long-horizon`, `perf-loop`, `reference-site-prototyping`, `showcase-register`, `why`, `wow-loop` |
| Dangerous | `adopt-repo`, `ship-layline` |
| Claude-only | `astra-fullreview`, `codex-fullreview`, `compact-review`, `long-horizon-workflows`, `merge` |

`advocate`, `arena`, `dare`, `impartial-review`, `long-horizon`, and `why` require fresh independent context; do not replace them with self-review and call it equivalent. `wow-loop` is maintained as a native Codex skill with durable review state and fresh-context critics; its capability-gated classification remains unchanged. It additionally requires screenshot capture for visual work; without it, say so rather than substituting a code read for a visual verdict. `claude-review` and `opus-fullreview` are cross-vendor only from Codex; `opus-fullreview` runs the Claude `impartial-review` as Manager through Claude CLI and is Codex-only, since a Claude session uses `impartial-review` directly; it must fail closed unless Claude CLI proves subscription routing and it never opts into paid usage. `codex-review` and `astra-review` from the Codex runtime lose their cross-vendor property (reviewer shares the author's vendor); it still provides fresh context, but say so instead of claiming vendor independence. `impartial-review` dispatched from Codex has the same limit; when that session exposes no agent tools, separate read-only `codex exec` processes with bounded concurrency are the fallback that keeps reviewer context fresh, and self-review is not; read its gate as agent tools or an authenticated Codex CLI. Those child processes are leaf reviewers and must not dispatch a review of their own. `external-review` is a Codex-only, single-context leaf review invoked explicitly by the `codex-review` and `astra-review` launchers in both runtimes; it needs no agent tools, and one reviewer's fresh context is its designed coverage, not a gap. `codex-fullreview` and `astra-fullreview` are Claude launchers that run `impartial-review` inside `codex exec`; Claude-only rows are disabled for Codex and need no port, so from Codex use `impartial-review` directly. `merge` is Claude-only because its first review round runs `codex-fullreview`. Current system, developer, sandbox, approval, and user instructions win. Resolve resources from the Codex skill directory and never claim a gated workflow ran unless its tools were used.

`perf-loop` is a standalone Codex skill requiring fresh independent measurement and regression reviewers, plus a working measurement path for each performance claim. Benchmarks and competing resource-heavy work run serially on shared hardware. Missing capabilities permit scoped progress but leave the full verification gate incomplete.

`design-fullbuild-surfaces` needs headless Playwright for its verification half; without it, design and audit still run, but report the visual check as unverified rather than substituting a preview pane or a CDP screenshot. `reference-site-prototyping` needs an exposed browser-control tool to inspect and capture the live reference; clone tooling such as Ditto is optional, and without browser control the evidence and comparison stages cannot run and must be reported as unverified. `showcase-register` needs headless browser control to capture the card and to reach the finale behind the showcase entry gate, plus ffmpeg for the grade; without them the file edits still land, but the thumbnail and the rendered check must be reported as not done rather than assumed. `ship-layline` merges to the default branch of two repositories and needs `gh` authenticated for both `ryanportfolio/fullbuild.ai` and `ryanportfolio/layline`; run it only on an explicit merge request, and without that access do the checks and open the pull requests rather than reporting a merge that did not happen.

`node .claude/scripts/test-codex-contract.mjs` verifies that every active skill has exactly one classification and that Codex routing metadata stays within its context budget.

`unslop` and `writing-skills` are retired from both discovery catalogs. Route cleanup to
Caveman/Writing and authoring to addskill. Legacy licensed writing-skills resources remain.
`node .claude/scripts/sync-codex-skills.mjs --check` warns when a retired name regains a
`SKILL.md`.
