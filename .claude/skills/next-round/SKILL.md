---
description: Produce a copy/paste-ready prompt that starts a fresh session on the next round of a multi-round effort. Use when the user says /next-round, asks for a handoff prompt, or just finished a round and wants the next session to continue.
---

# Next-round handoff — brief the next session

Produces ONE self-contained, copy/paste-ready prompt that a brand-new session can run to continue an iterative effort (typically a /reference-site-prototyping recreation driven by /long-horizon rounds). The new session sees nothing from this conversation, so everything it needs must live inside the block. $ARGUMENTS, if present, is a focus instruction to fold into the mission.

## Step 1: Gather from durable state, not memory

Read the effort's state file(s), latest round report(s), and evidence directories. From those plus the working tree, collect: uncommitted changes (exact paths, and the commit command that preserves them), branch/worktree layout, sealed or read-only directories, server/port state, and the effort's done-check. Every path cited in the final block must be absolute and verified to exist.

## Step 2: Extract what only this session knows

- Environment scars this session actually hit, each with the exact workaround on one line (launch flags, load paths, sandbox escalations, known-flaky tooling). Skip scars the next session cannot hit again.
- Standing directives that must not regress (owner rules, rights constraints, scope limits).
- Seed list: confirmed-but-unfixed defects AND method gaps - for each, why earlier rounds missed it - so the next round fixes the class, not just the instance.

## Step 3: Emit the handoff block

Output one fenced block the user can paste into a new session, structured roughly:

1. Slash-skill invocations first (the method skills the next round needs).
2. Mission, including the $ARGUMENTS focus if given.
3. First act: usually commit pending work (exact command) and create the next state file (exact path); state the write contract (contract section frozen before round 1).
4. Read-first paths (absolute): prior reports, state files, design contract, sealed dirs flagged READ-ONLY.
5. Seed list, standing directives, environment facts (one line each), protocol (executor/auditor rounds, round cap, stagnation rule).
6. Done-check as checkboxes, ending with the owner gate (local URL + explicit ask to confirm) if the effort has one.

## Step 4: Self-check before emitting

Re-read the block as the new session would: no references to "this session" or conversation-only facts; every path exists on disk; every acronym expanded; every claim verifiable from the cited files. If anything exists only in this chat, either write it into the block or write it to a file the block cites.

## Anti-patterns

- Don't summarize the finished round's narrative - the next session needs state, not story.
- Don't omit a workaround because it seems obvious - if this session bled on it, the next one will too.
- Don't put secrets, tokens, or credential values in the block.
- Don't start the next round yourself; this skill's output is a prompt, not an execution.