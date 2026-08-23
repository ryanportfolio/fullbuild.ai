# Codex Instructions

This is the Codex boundary for repositories using the AI Operating System starter. Claude Code keeps using `CLAUDE.md` and `.claude/` unchanged.

## Defaults

- Use Caveman Ultra for prose from the first reply, without asking or requiring `$caveman`. Keep code, commands, identifiers, errors, commits, PR text, and files normal.
- Use plain prose for security warnings, irreversible confirmations, and ambiguous multi-step decisions, then resume Ultra. A new session restores Ultra after the user temporarily disables it.
- Read only `CLAUDE.md`'s Verification and Environment & Deploy Target sections for configured project facts. Use `.claude/reference/` for architecture, commands, deployment, and pitfalls. Other `CLAUDE.md` workflow rules are not Codex instructions.
- Never execute `.claude/hooks/session-start.sh` in Codex.

## Capabilities

- Inspect tools exposed in the current session before using subagents, browser control, connectors, or interactive input. Config flags alone are not proof.
- For local web UI testing in Codex, use the in-app Codex Browser first. Use standalone Playwright only when Codex Browser cannot perform a necessary check or the user explicitly requests Playwright. This rule is Codex-only and does not change Claude Code's verification workflow.
- Serial fallback is valid only when independence is not part of the deliverable. `impartial-review`, `advocate`, and `why` require fresh independent context; if unavailable, report the gap.
- Claude `Workflow` programs are not Codex programs. Recreate their intent with exposed Codex agents or flag them blocked.
- Keep critical Codex rules here rather than in project hooks, which require separate trust and can be disabled.

## RTK

- When installed, prefer `rtk` for noisy supported reads: `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git show`, `rtk rg`, and `rtk read`.
- Use `rtk test <command>` for failure-focused output; preserve its exit code and rerun natively when full success output is required as evidence.
- Use native commands for mutations, interactivity, unsupported syntax, exact-output parsing, and diagnosis when filtering hides detail.
- Codex has no Claude RTK rewrite hook here. Invoke `rtk` explicitly.

## Gates under a review sandbox

- The gates are `npm run typecheck`, `npm run lint`, and `npm test` (`test:mjs` for the node suites, `test:ts` for the TypeScript ones, both from `node_modules`, no network fetch).
- `codex exec review` runs workspace-write over the workdir and temp only. Anything writing outside that fails there, `npm` and `npx` first, because their cache is under `%LOCALAPPDATA%` or `~/.npm`. A gate that comes back as a permission error under review is an artefact of the sandbox, not a defect in the diff: read the gate results stated in the request instead.
- Repo-wide `npm run lint` carries pre-existing `@next/next/no-html-link-for-pages` and `no-img-element` errors in the threadline, showcase, morrow and prediction-lab prototypes. They predate any current branch; scope lint findings to the files the diff touches.

## Safety

- Caveman Ultra is a communication default, not side-effect authorization. Auto-merge and other persistent side-effect modes require explicit current-session intent.
- Do not inherit Claude auto-commit, push, PR, or merge. Ship only when the request includes shipping.
- Never push to `main`, force-push, merge, delete branches/worktrees, migrate, deploy, install runtime dependencies, or modify external checkouts without explicit approval.
- Stage explicit paths, preserve unrelated changes, and verify before claiming completion.

## Shared Assets

- `.claude/skills/` is canonical; `.agents/skills/` contains Codex adapters. Treat `$ARGUMENTS` as invocation input.
- Read relevant `.claude/reference/` material before unfamiliar work and `.agents/CODEX-SKILL-COMPATIBILITY.md` before adapted, gated, or dangerous skills.
- After canonical skill changes run `node .claude/scripts/sync-codex-skills.mjs --write`.
- Tool mapping: `.claude/skills/using-superpowers/references/codex-tools.md`.

## Starter Maintenance

Only in the canonical `claude-starter` template repository: keep `bootstrap/` PowerShell 5.1 files ASCII-only and shell scripts LF. Claude gets its hooks and slash skills; Codex gets `AGENTS.md` and `.agents/skills/`. Keep private paths, tokens, and maintainer-only workflow out of defaults.
