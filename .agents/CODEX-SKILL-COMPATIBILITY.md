# Codex Skill Compatibility

`.claude/skills/` remains Claude's source. An adapter exposes a workflow; it does not prove every runtime capability exists.

- **Native**: direct mapping.
- **Adapted**: Codex paths, approvals, or UI substitutions.
- **Capability-gated**: requires a currently exposed tool.
- **Claude-only**: no faithful Codex implementation.
- **Dangerous**: explicit authorization required for Git, deploy, migration, publish, or persistent side effects.

| Status | Skills |
|---|---|
| Native | `brainstorming`, `caveman`, `enhance-prompt`, `forge-repo-ui-skill`, `handoff-audit`, `humanizer`, `purposeful-writing`, `recall`, `writing-plans` |
| Adapted | `addskill`, `refine`, `fable-mode`, `init-project`, `lab`, `optimize-context`, `sync-starter`, `writing-skills` |
| Capability-gated | `advocate`, `design-fullbuild-surfaces`, `impartial-review`, `reference-site-prototyping`, `why`, `wow-loop` |
| Dangerous | `merge` |
| Claude-only | None in the starter source set. |

`wow-loop` needs independent subagent contexts for its adversarial verify stage and headless Playwright for screenshot evidence; without them, run the loop sequentially in fresh contexts and report visual checks as unverified rather than substituting self-review. `advocate`, `impartial-review`, and `why` require fresh independent context; do not replace them with self-review and call it equivalent. `design-fullbuild-surfaces` needs headless Playwright for its verification half; without it, design and audit still run, but report the visual check as unverified rather than substituting a preview pane or a CDP screenshot. `reference-site-prototyping` needs an exposed browser-control tool to inspect and capture the live reference; clone tooling such as Ditto is optional, and without browser control the evidence and comparison stages cannot run and must be reported as unverified. `merge` becomes session-wide only after explicit `$merge` or an unambiguous auto-merge request. Current system, developer, sandbox, approval, and user instructions win. Resolve canonical resources from `.claude/skills/<name>/` and never claim a gated workflow ran unless its tools were used.

`node .claude/scripts/test-codex-contract.mjs` verifies that every active skill has exactly one classification and that Codex routing metadata stays within its context budget.
