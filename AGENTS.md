# fullbuild.ai Codex Operating Guide

## Mission

Build `fullbuild.ai` as a portfolio showcase for complete product creation.

Official tagline: **idea → design → engineering → shipped**

## Default communication

- Use Caveman Ultra for prose from the first reply.
- Keep code, commands, identifiers, errors, commits, PR text, and file contents normal.
- Use plain prose for security warnings, irreversible confirmations, ambiguous multi-step decisions, or user confusion; then resume Ultra.

## Project memory

`AGENTS.md` is the thin, always-loaded kernel. Durable topical knowledge lives under `.agents/reference/` and loads only when relevant.

### Reference index

| Area | File | Covers |
|---|---|---|
| Product | `.agents/reference/product/vision.md` | Purpose, audience, outcomes, non-goals |
| Product | `.agents/reference/product/brand.md` | Name, tagline, voice, visual identity |
| Product | `.agents/reference/product/roadmap.md` | Milestones and current priorities |
| Engineering | `.agents/reference/engineering/architecture.md` | System flow, boundaries, state, data |
| Engineering | `.agents/reference/engineering/commands.md` | Build, development, test, and utility commands |
| Engineering | `.agents/reference/engineering/tech-stack.md` | Technology choices and rationale |
| Operations | `.agents/reference/operations/deployment.md` | Host, build output, publishing, rollback |
| Operations | `.agents/reference/operations/secrets.md` | Environment variable names and purposes; never values |
| Memory | `.agents/reference/memory/decisions.md` | Durable product and engineering decisions |
| Memory | `.agents/reference/memory/pitfalls.md` | Dated symptoms, causes, and fixes |

### Retrieval protocol

Before non-trivial work in an unfamiliar area:

1. Match the request to the reference index.
2. Read only the relevant files.
3. If routing is unclear, search `.agents/reference/` by keyword.
4. Verify important claims against current code, configuration, or command output; reference memory can become stale.
5. Cite the memory or source file when reporting project facts.
6. If knowledge is absent, say so. Never fabricate an entry or infer a settled decision.

Use the `recall` skill for project-memory lookup or capture.

### Capture protocol

- Save only durable project knowledge: confirmed decisions, architecture constraints, commands, deployment facts, and recurring pitfalls.
- Put detail in the narrowest matching reference file; keep cross-cutting safety and process rules here.
- Add new topic files only when no current topic fits, then update the reference index.
- Record learnings under `### YYYY-MM-DD: <title>` in 1–5 sentences. Include symptom and resolution for pitfalls.
- Replace stale facts instead of accumulating contradictions.
- Never store secret values, tokens, private keys, or credentials.
- Memory capture does not authorize a commit, push, PR, deployment, or other external action.

## Working rules

- Inspect repository truth before asking questions that files can answer.
- Resolve material ambiguity before implementation; tolerate harmless uncertainty.
- Keep scope tight. No unrequested features, refactors, abstractions, or dependency changes.
- Preserve unrelated user changes in a dirty worktree.
- Use `apply_patch` for manual file edits.
- Use the relevant local skill whenever its trigger matches the task.
- Inspect actual tool exposure before subagent, browser, connector, or interactive-input workflows.
- Never claim independent review unless a fresh independent agent performed it.

## RTK

- When installed, prefer `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git show`, `rtk rg`, and `rtk read` for noisy supported reads.
- Use `rtk test <command>` for failure-focused output; preserve its exit code.
- Rerun verification natively when complete success output is required as evidence.
- Use native commands for mutations, interactivity, exact parsing, unsupported syntax, and diagnosis when filtering hides detail.

## Verification

- Inspect logs, run relevant checks, and read resulting output before claiming success.
- Never claim visual or UI verification unless it was actually performed against the current checkout.
- For local previews, verify the serving process and working directory, then confirm a change-specific sentinel in rendered page text.
- If the authoritative check cannot run here, report the exact verification gap and residual risk.
- Project-specific commands and authoritative signals belong in `.agents/reference/engineering/commands.md` once selected.

## Safety and Git

- Caveman Ultra never authorizes side effects.
- Do not install runtime dependencies, migrate data, deploy, publish, or modify external checkouts without explicit approval.
- Do not commit, push, open a PR, merge, or delete branches/worktrees unless the current request includes that action.
- Never push to `main`, force-push, or use destructive Git/filesystem commands without explicit authorization.
- Stage explicit paths only; never blanket-stage unrelated changes.

## Environment and deployment

Hosting, runtime, dependency-install policy, and authoritative verification remain unconfigured. Read `.agents/reference/operations/deployment.md` before deployment-related work and ask before any consequential action not already authorized.
