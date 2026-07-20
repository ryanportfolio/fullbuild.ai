# Pass 04 — External critique round

Date: 2026-07-20
Scope: third-party design critique of the Time-Lapse Manufacture build (post-PR #4), verified by a 7-agent read-only fleet with fresh captures, fixed, then re-reviewed by a 3-agent fresh-eyes fleet.
Method: every claim verified against the live render before any edit. Wrong claims rejected with evidence; confirmed defects fixed the same day.

## Critique verdicts (claim → finding)

| Claim | Verdict | Evidence |
|---|---|---|
| `From maybe` clipped by mesh | **Confirmed** — camera offset + near-black machine base, all three fitView tiers | `wf/arrival-1440.png`, `wf/arrival-1280.png`, `wf/arrival-mobile.png` |
| Dead space above headline | Half-true (19–24% vh band, bottom anchored) — treated | `wf/arrival-1440.png` |
| Low-poly crystal = AI cliché | **Confirmed for t=0/t=1 only**: violet crystal palette + radial spikes; blueprint snap broken (`index % 3` tore planes). Machine/fused already read their stages — "kill it" rejected | `wf/crystal-t0.png`, `wf/crystal-t1.png` vs `wf/crystal-t2.png`, `wf/crystal-t297.png` |
| Fake telemetry (`WORK ORDER 00`, `BUILD TIME 7-0-00`, `MODULE 01`) | Mostly wrong: `MODULE 01` does not exist; `BUILD TIME` clock is scroll-computed (load-bearing). True cosplay = exactly 8 instances | grep + `wf/tel-*.png` |
| Flat rhythm / one-volume page | **Confirmed mid-page**: three sections shared one 61px head; padding ramp 81/90/90/99 imperceptible | `wf/sec-01-case00.png`, `wf/px-04/05.png` |
| Left-heavy, right side empty | **Rejected**: right half is artifact-reserved (fixed canvas) or content; exit emptiness authored ("pedestal empty") | `wf/lh-*.png` |
| Scroll centerpiece renders blank | **Rejected** for t=0.25–2.95 (capture artifact: fixed canvas + JS-activated panels). **Confirmed at exactly t=3**: strict `>` boundary → blank viewport, stale T+2.00 | `wf/t025–t295.png`, `wf/t3.png`, `wf/nojs-full.png` |
| Cream-on-cream contrast | **Confirmed, reframed**: coral/orchid on milk 2.43–2.46:1; 55–60% ink labels 3.85–4.51:1 | computed ratios + `wf/mob-*.png` |
| Mono body readability tax | **Rejected**: body is Anybody wdth 92, 15.85:1 ink-on-milk | code + captures |
| Perf/motion unknown | **Rejected**: render-on-demand only, 0 idle rAF, DPR cap 1.75, 1,280-triangle single draw | code inspection |

Bonus defect found by the fleet (not in critique): `?t=3` / exact track-bottom blank viewport, three agents independently.

## Fixes shipped

- **Camera**: fitView free tiers re-fit — wide `{0.92, 0.06, 0.58}`, mid `{0.55, -1.25, 0.33}`, narrow `{0, -1.15, 0.32}`; renderer default state synced; h1 `max-width: 12ch`; copy block anchored up (`align-self: start`).
- **Boundary**: `inside` / `nearTrack` bottom edge `viewport - 2` tolerance — `?t=3` now renders fused + shipped panel + T+3.00 clock.
- **Cosplay cut (8/8)**: `WORK ORDER` caption (numeral kept, sourced from `caseStudy.id`), duplicate corner line, 3× `rule 0N`, 3× `/ 0N` indexes. Header status, clock, console, stage eyebrows, gate/pending labels kept — they orient or carry the honesty contract.
- **Hierarchy arc**: case-zero h2 → `clamp(2.4rem,5vw,4.6rem)` (#2 statement); principles h2 → `clamp(1.7rem,2.8vw,2.6rem)` valley with "No invented proof" h3 as dominant moment; principles padding short-beat; form-label register letter-spacing 0.08em vs announce 0.2em.
- **Hairlines**: future-case rules re-anchored from article top to copy top (kills 250–300px floating void); three dashed missing-boxes demoted to dashed ticks; scaffold/pedestal keep the dash motif.
- **Contrast**: `--coral-text` (4.68:1) / `--orchid-text` (4.84:1) tokens; applied to GATE em, readout, locked link, idea/shipped h3, idea figure; label alphas 62–68% ink.
- **Anti-cliché geometry**: vapor = clumped cell-hash displacement (soft puffs, no spikes) + matte periwinkle look, wire 0.3; blueprint = dominant-axis planar snap + flat 0.5; fused lerp 1.0. Stage kickers now name materials visibly (`vapor — unformed` …).
- **Grid**: case-zero `00` index spans both rows, vertically centered (fills the one genuinely dead quadrant).

## Evidence

Fix captures: `.kimi/fix/` (arrival 1440/1080/900/390, t=0/1/3). Fresh-eyes fleet review: `.kimi/ev2/` — desktop-craft **clean** (all 6 checks hold), mobile-a11y **minor-issues**, anti-slop **minor-issues**.

## Fleet findings → actions taken

| Finding | Severity | Action |
|---|---|---|
| no-JS static clock (`t+3.00`) strikes through idea fallback SVG; hardcoded value misleading | defect | **Fixed**: `.lifecycle__clock` now `display:none` base, shown only under `.has-js` (styles.css) |
| 900×700 mid-tier: artifact spikes graze lede (~5px clearance) | borderline defect | **Fixed**: short-viewport mid override in fitView (`{0.8, -1.45, 0.29}` when height ≤ 760) |
| Blueprint scatter 0.35: edge shards read torn; tips touch panel divider at t=1 | taste-trade | **Fixed**: design scatter 0.35 → 0.28 (phase-state.mjs) — planes coherent, divider clear |
| Hero rests on near-black machine look (nearest cliché family, first impression) | taste-trade | **Fixed**: machine base → gunmetal `[0.2,0.21,0.26]`, wire 0.8 → 0.6 — milled highlights, not neon-on-black |
| Kicker T+01..04 vs clock T+0..3 | taste-trade | Kept: 1-indexed stage ordinal vs elapsed build time; reads intentional in captures |

Acted-fix evidence: `.kimi/fix2-*.png` (arrival 1440 gunmetal machine, 900×700 clearance, t=1 calmed planes, no-JS full page without clock).

## Outcome

Two consecutive clean verification rounds after acting on every fleet finding (initial fixes → fleet review → 4 acted fixes → re-captured clean). Gates: `npm test` 19/19, `npm run verify` within budgets (HTML+CSS 8,176B/49,152; JS 7,721B/20,480). Stopping per the evidence rule. Remaining noted items are documented taste trades.
