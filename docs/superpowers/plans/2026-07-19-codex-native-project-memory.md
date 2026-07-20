# Codex-Native Project Memory Implementation Plan

> **For agentic workers:** Execute inline in this session. Skill behavior changes require RED/GREEN validation before completion.

**Goal:** Replace the Claude-dependent Codex kernel with a native, nested, retrieval-on-demand project-memory system.

**Architecture:** Keep `AGENTS.md` as the always-loaded thin kernel and topic index. Store durable knowledge under `.agents/reference/` by product, engineering, operations, and memory domains. Make `.agents/skills/recall/SKILL.md` the native lookup/capture workflow; preserve existing `.claude/` files untouched for compatibility.

**Tech Stack:** Markdown, Codex skills, PowerShell verification, Git diff inspection.

---

### Task 1: Baseline current behavior

**Files:**
- Read: `AGENTS.md`
- Read: `.agents/skills/recall/SKILL.md`

- [x] Run fresh-agent retrieval and capture scenarios without the new native skill.
- [x] Record whether current behavior routes through `.claude/` or Claude-only commands.

### Task 2: Build nested reference corpus

**Files:**
- Create: `.agents/reference/product/vision.md`
- Create: `.agents/reference/product/brand.md`
- Create: `.agents/reference/product/roadmap.md`
- Create: `.agents/reference/engineering/architecture.md`
- Create: `.agents/reference/engineering/commands.md`
- Create: `.agents/reference/engineering/tech-stack.md`
- Create: `.agents/reference/operations/deployment.md`
- Create: `.agents/reference/operations/secrets.md`
- Create: `.agents/reference/memory/decisions.md`
- Create: `.agents/reference/memory/pitfalls.md`

- [x] Migrate existing durable knowledge without inventing missing project facts.
- [x] Record the confirmed portfolio purpose and official tagline.

### Task 3: Rewrite the Codex kernel

**Files:**
- Modify: `AGENTS.md`

- [x] Define project mission, retrieval order, topic index, capture rules, verification, tooling, and safety.
- [x] Remove all Claude-specific paths and workflow references from `AGENTS.md`.

### Task 4: Make recall native

**Files:**
- Modify: `.agents/skills/recall/SKILL.md`
- Modify: `.claude/scripts/sync-codex-skills.mjs`

- [x] Replace generated adapter text with a concise Codex-native lookup/capture workflow.
- [x] Require citations, honest missing-knowledge handling, dated terse captures, explicit-path staging, and no automatic Git writes.
- [x] Preserve hand-authored Codex skills when generated adapters are synchronized.

### Task 5: Verify

**Files:**
- Verify: `AGENTS.md`
- Verify: `.agents/reference/**/*.md`
- Verify: `.agents/skills/recall/SKILL.md`

- [x] Validate skill frontmatter and folder structure.
- [x] Assert `AGENTS.md` and native recall contain no Claude references.
- [x] Run fresh-agent retrieval scenarios with the native skill.
- [x] Inspect full diff and preserve unrelated user changes.

No commit, push, or deployment is authorized by this plan.
