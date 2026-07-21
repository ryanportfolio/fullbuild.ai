---
description: Iterative design critique-and-refine loop for an existing page or screen. Screenshots the current state, names concrete defects with root causes, plans and applies fixes, then re-screenshots and compares until the result is verifiably better and more intentional than the starting point, asking "what do I wish this had?" each round. Use when the user says /design-refine, asks to critique or de-slop a page, polish a prototype or draft design, or make a design "look intentional".
---

# Design refine — critique, fix, prove it improved

Turns a rough page into an intentional one through evidence-driven rounds. Every claim of improvement is backed by a before/after screenshot pair. The loop ends only when a full critique round produces no new must-fix items and the wishlist is either implemented or explicitly handed back as recommendations.

`$ARGUMENTS` names the target page or URL; if empty, ask which page to refine.

## Step 0: Baseline capture

Screenshot the CURRENT state before touching anything: full page plus each section, desktop (1440 wide) and mobile (390 wide). These are the reference for every later comparison; never skip them.

If capture times out, the page likely runs a continuous requestAnimationFrame loop (Lenis, GSAP, R3F). Use a Playwright script against the dev server instead of the embedded preview, freeze via the repo's capture handle if one exists (`window.__capture.freeze()`), or starve rAF as a last resort. See `.claude/reference/pitfalls.md` and auto-memory `screenshot-raf-timeout`.

## Step 1: Critique pass

Read the screenshots like a hostile design reviewer. For each defect record: what is wrong (observable, e.g. "vertical rail letters overlap into a glyph pile"), where (file and selector), and the root cause in code (e.g. "line-height 0.7 with letter-spacing -0.13em on vertical-rl text"). Look specifically for:

- Legibility: overlapping glyphs, sub-0.9 line-heights on multi-line display text, extreme negative tracking, low contrast, text lost against busy backgrounds
- Text volume: anything cuttable without losing meaning. Load the writing skill and the repo voice file (`.claude/reference/voice.md`) and apply both. Copy usually shrinks by half or more
- Slop signals: elements colliding without intent, half-hidden labels, dead empty regions, decoration competing with content, inconsistent spacing rhythm
- States: hover, reveal-on-scroll, phase or theme variants. Verify end states with computed styles, not assumptions; a mid-transition screenshot lies, and a specificity conflict can freeze a reveal permanently

When a rendering defies the stylesheet you read, interrogate the live page (computed styles, bounding boxes) before editing.

## Step 2: Plan

Turn the critique into a task list ordered by user-visible impact: legibility first, then text cut, then polish. Note per item the intended fix. Keep scope: refine the existing design's direction; do not redesign it.

## Step 3: Apply

Make targeted edits. Preserve the design's identity moves (its palette, its signature gimmick) while fixing execution. For copy, hard rules from the writing skill and voice file apply to every user-visible string, including UI strings, aria-labels, and meta tags.

## Step 4: Prove improvement

Re-capture the same shots as Step 0 and compare pair by pair:

- Every defect from Step 1 must be visibly gone, or stay on the list
- No regressions: check sections you did not edit too
- The intentionality test: could a stranger tell each element was placed on purpose? Overlaps that remain must read as composition, not accident

Never claim it looks better without having looked. If a check cannot be run, say so plainly.

## Step 5: "What do I wish this had?"

With defects cleared, ask the question outright and answer it: missing affordances, a stronger moment, context a first-time visitor lacks, an interaction the design begs for. Implement the wishes that fit the current scope now. Larger ones go in the final report as concrete recommendations, not vague directions.

## Step 6: Loop until dry

Run Steps 1-5 again on the updated page. Stop only when a full round surfaces no new must-fix defects. Then ship per the repo's git rules and report: defects fixed (with root causes), copy cut, wishes implemented, and remaining recommendations.

## Anti-patterns

- Don't skip the baseline capture; without it "better" is an opinion
- Don't verify from memory of the code; verify from pixels and computed styles
- Don't sand off the design's identity to make critique easier; fix execution, keep the direction
- Don't stop after one round because the big defects are gone; the loop ends when a round comes back clean
- Don't leave wishes as "could be nicer"; either implement them or write an actionable recommendation
- Don't claim visual verification that was not performed
