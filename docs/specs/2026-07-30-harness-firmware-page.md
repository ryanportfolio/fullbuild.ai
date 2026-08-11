# Harness Firmware page : PHOSPHOR : conceit + constraint contract

Showpiece method, Full tier, v2.1 (v1 "firmware boot log" design was rejected:
too basic, too much text, text too small). v2 designed by a 3-direction
Fable design competition + judge synthesis; built as the site centerpiece.

Standalone static page at `/harness-firmware`, self-contained under
`public/harness-firmware/`.

## Conceit

**The page is a sheet of black glass coated in P7 phosphor** : the
long-persistence radar phosphor that flashes blue under the beam and keeps
glowing green after the beam is gone. That is literally what Harness
Firmware does: the session (the beam) dies at power-off, but what was
written to the repo keeps glowing : the agent boots warm because the
phosphor never went fully dark.

## Constraint contract (violation = bug)

1. **The color law, no exceptions.**
   - Ground `#070B0C` (black glass), bone `#E8F4EA` (text).
   - Blue `#5FD9FF` = **volatile** : the live session. Flashes, always
     decays. Never appears on anything that persists.
   - Green `#A6FF5E` = **persistent** : committed bytes, the only steady
     light. All figures, the CTA border, burn-in text.
   - Residue `#22352A` = spent phosphor : latent mass, ghost numerals,
     watermark.
   - No other hues (test-enforced). `::selection` = green on glass.
2. **Light exists only as dots or type.** All glow is real dithering: 8×8
   Bayer (standard recurrence) and a 64×64 void-and-cluster blue-noise tile
   seeded `0xd9cd99f5` : the measured git rev. No gradients, no blur, no
   box/text shadows (test-enforced). Halos are dot-density falloff.
3. **Type.** Unbounded (OFL, self-hosted variable TTF) for display: hero
   `clamp(56px, 15vw, 230px)`, headings to 104px, data numerals to 280px.
   Prose = system sans 18–20px, ≤38ch, minimal. Mono rationed to readouts,
   commands, micro-labels. Nothing below 11px (test-enforced). Headings
   never end with a period (test-enforced).
4. **Countable honesty.** Every figure from `facts.json` (git objects @ commit
   `d9cd99f5d6126d58918e117b584369dd610f4f59`). The dither is data: spectrum = 23 bands in real flash-address
   order, **exactly 1 dot per allocated 1,024-B block** (writing-skills 26,
   caveman 4), cap fill = true last-block pad. Spectrum sizes count only the
   23 canonical `.claude/skills/*/SKILL.md` entry files; referenced support
   files and generated Codex adapters are disclosed separately. Core-halo
   green lit-mass is binary-search calibrated to the maximum Claude resident
   footprint against those canonical entries, 9,355:188,216 (±0.2% : true
   ratio 0.049704); ramp head = 5% of width; pulse = 2.339 s =
   the maximum estimated resident tokens / 1000.
   `tests/harness-firmware.test.mjs` imports the engine and recounts.
5. **One engine.** `src/dither.mjs` is shared verbatim by the browser
   runtime (`src/phosphor.js`) and the baker
   (`scripts/bake-phosphor.mjs` → `src/bake.html` → `fallback/*.png`).
   Same seed, same dots, live or baked.
6. **Progressive enhancement.** Page complete without JS (baked PNGs +
   real HTML text). JS adds: boot beam sweep (headline resolves out of the
   decay), ambient drift, live spectrum with per-band excitation + readout,
   burn-in flash, blur/focus wit. `prefers-reduced-motion` ⇒ single steady
   frame, no loop. Reveal fade-in kept from v1 (user-liked).
7. **Layout.** Max-width 1200, left-anchored. Ghost numerals 01–07 in
   residue behind headings, Bayer-masked. No horizontal page scroll at
   390px (command slabs may scroll internally).

## Rebuild procedure

```
node scripts/serve-prototype.mjs --port 4823   # static server
node scripts/bake-phosphor.mjs                 # re-bake fallback PNGs
node --test tests/harness-firmware.test.mjs
```

## Locked facts

`public/harness-firmware/facts.json` (single source). The routing index counts
245 B of skill names plus 3,709 B of resolved descriptions. Claude: rules
5,401 B ≈ 1,350 tok; index 3,954 B ≈ 989 tok; resident 9,355 B ≈ 2,339
tok/turn (9.1 KiB). Codex under the same accounting: rules 3,252 B ≈ 813 tok;
index 3,954 B ≈ 989 tok; resident 7,206 B ≈ 1,802 tok/turn (7.0 KiB). The 23
canonical `SKILL.md` entry files total 188,216 B (184 KiB); 162,181 B of
per-skill support files and 31,801 B of generated Codex adapter entry files
are excluded from that chart and named where it appears. The maximum-resident
/ canonical-entry comparison is 20.1× and 5%; tiers 7/5/11; canonical tree
`503356de…`; Codex tree `a137de9f…`; address marks 0x01519 / 0x0248B /
0x00CB4 / 0x01C26 / 0x2DF38; pitfall example 2026-07-18; repo
ryanportfolio/Harness-Firmware, GitHub template, MIT.

## v2.2 copy and measurement refresh (2026-08-11)

- Updated all repo figures to Harness Firmware rev `d9cd99f5` and regenerated
  the deterministic grain from that revision.
- Corrected the recall story: project knowledge is selected on demand and
  cited from the relevant reference file, not loaded wholesale at startup.
- Reduced the visible catalog to eight defining operating-layer workflows
  while keeping the spectrum and screen-reader inventory countable across all
  23 skills.
- Replaced generic architecture language with seven connected mechanisms:
  committed knowledge, evidence-backed recall, reversible refine edits,
  fact-driven initialization, generated adapters, selective sync, and
  capability-gated independent evidence.
- Qualified token figures as approximate file-based conversions. They do not
  claim model billing, tool-catalog cost, or runtime parity.
- Added direct links to GitHub's template generator and Windows launcher ZIP.

## v2.1 additions (user direction, 2026-07-30)

- Copy bans: no em dashes anywhere; "glow" banned as a term (concrete words:
  memory, resident, retained, warm boot). Headline is **BOOTS WARM**.
  Both bans are test-enforced.
- **Recall demo** (section 01): animated console replay of the durable-memory
  loop: session A hits the real pitfall, `/recall save`, reviewable repo
  change, session killed (blue), and a later matching task routes to and cites
  the saved reference. The flow is labelled illustrative. Transcript quotes
  the real pitfalls.md entry ("Local preview servers: stale or wrong site
  (2026-07-18)", now a facts.json field). Latent-transcript replay: all lines
  pre-rendered in residue, brightened to their true state as the cursor
  passes; the line being read is beam-blue. Static/no-JS: fully lit.
- **Spin-up demo** (section 05): animated replay of the real
  `New-ClaudeProject-UI.cmd` generator flow (lines taken from
  bootstrap/NewProjectCore.psm1: gh mode line, gh repo create from template,
  strip + push, DONE).
- Footer performs the thesis: "power-off · context cleared" frozen in blue,
  "memory retained · next boot warm" steady green.

## Deepenings logged, not built (closing pass)

- Cross-section mass ledger: 197 latent dots seeded into the s04 ramp tail.
- Footer self-power-off animation on scroll arrival (motion only).
- Spectrum keyboard navigation for the band readout.

## Wit register

- The noise seed is the git rev (`0xd9cd99f5`) : even the grain is versioned.
- Readout pulse every 2.339 s = maximum resident tokens ÷ 1000.
- Leave the tab: title becomes "memory retained · harness firmware"; return: one full beam re-sweep.
- Hover any statistic: flashes blue, decays back green : every figure
  ritually survives its own power-off.
- Zoom the spectrum: caveman = exactly 4 dots = 4 blocks = 3,111 B.
