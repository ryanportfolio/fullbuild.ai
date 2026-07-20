---
name: recall
description: Use when entering an unfamiliar project area, when asked what this project knows or its pitfalls, or when asked to remember or capture durable project knowledge.
---

# Recall Project Memory

Treat `.agents/reference/` as durable, retrieval-on-demand project memory. Treat `AGENTS.md` as its thin kernel and topic index.

## Lookup

1. Read the reference index in `AGENTS.md`.
2. Match the request to the narrowest relevant file or files.
3. If the topic is unclear, list the reference tree and search it by keyword with `rtk rg` when available.
4. Read only matched references; inspect current code or configuration when freshness matters.
5. Summarize relevant knowledge with `file:line` citations.
6. If nothing relevant exists, say so plainly. Never fabricate project knowledge or present an inference as a recorded decision.

## Capture

1. Choose the narrowest existing topic file.
2. Create a new topic only when the knowledge is durable and no current topic fits; update the `AGENTS.md` index in the same change.
3. Record a dated entry:

```markdown
### YYYY-MM-DD: Short title

One to five sentences. For a pitfall, include the symptom, cause, and resolution. Link to current code when useful.
```

4. Replace stale facts instead of appending contradictory versions.
5. Store environment variable names and purposes only. Never store secret values, credentials, tokens, or private keys.
6. Report the files changed. Do not commit, push, publish, deploy, or stage files unless the user explicitly requests that action.

## Boundaries

- Keep cross-cutting safety and process rules in `AGENTS.md`.
- Keep product, engineering, operations, decisions, and pitfalls in `.agents/reference/`.
- Keep entries terse and factual. Memory is a retrieval flag, not a tutorial.
- Split a topic that exceeds about 200 lines, then update the index.
- Do not duplicate the same fact across multiple topic files unless one entry is a short pointer to the canonical source.
