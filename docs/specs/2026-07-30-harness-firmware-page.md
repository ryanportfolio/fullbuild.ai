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
   seeded `0x5224beb` : the measured git rev. No gradients, no blur, no
   box/text shadows (test-enforced). Halos are dot-density falloff.
3. **Type.** Unbounded (OFL, self-hosted variable TTF) for display: hero
   `clamp(56px, 15vw, 230px)`, headings to 104px, data numerals to 280px.
   Prose = system sans 18–20px, ≤38ch, minimal. Mono rationed to readouts,
   commands, micro-labels. Nothing below 11px (test-enforced). Headings
   never end with a period (test-enforced).
4. **Countable honesty.** Every figure from `facts.json` (git objects @ rev
   `5224beb`). The dither is data: spectrum = 20 bands in real flash-address
   order, **exactly 1 dot per allocated 1,024-B block** (writing-skills 26,
   caveman 4), cap fill = true last-block pad; core-halo green lit-mass is
   binary-search calibrated to 8,317:175,102 (±0.2% : baked at 0.04749 vs
   true 0.047498); ramp head = 4.7% of width; pulse = 2.079 s = tokens/1000.
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
7. **Layout.** Max-width 1200, left-anchored. Ghost numerals 01–06 in
   residue behind headings, Bayer-masked. No horizontal page scroll at
   390px (command slabs may scroll internally).

## Rebuild procedure

```
node scripts/serve-prototype.mjs --port 4823   # static server
node scripts/bake-phosphor.mjs                 # re-bake fallback PNGs
node --test tests/harness-firmware.test.mjs
```

## Locked facts

`public/harness-firmware/facts.json` (single source). Kernel 5,401 B ≈
1,350 tok; index 2,916 B ≈ 729 tok; resident 8,317 B ≈ 2,079 tok/turn
(8.1 KiB); on-demand 175,102 B (171 KiB), 20 skills; lazy 21.1×; resident
4.7%; tiers 6/4/10; tree `97530c9e…`; address marks 0x01519 / 0x0207D /
0x2ABFE; pitfall example 2026-07-18; repo ryanportfolio/Harness-Firmware,
GitHub template, MIT.

## v2.1 additions (user direction, 2026-07-30)

- Copy bans: no em dashes anywhere; "glow" banned as a term (concrete words:
  memory, resident, retained, warm boot). Headline is **BOOTS WARM**.
  Both bans are test-enforced.
- **Recall demo** (section 01): animated console replay of the durable-memory
  loop: session A hits the real pitfall, `/recall save`, commit, session
  killed (blue), session B warm-boots and skips the trap. Transcript quotes
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

- Cross-section mass ledger: 182 latent dots seeded into the s04 ramp tail.
- Footer self-power-off animation on scroll arrival (motion only).
- Spectrum keyboard navigation for the band readout.

## Wit register

- The noise seed is the git rev (`0x5224beb`) : even the grain is versioned.
- Readout pulse every 2.079 s = resident tokens ÷ 1000.
- Leave the tab: title becomes "memory retained · harness firmware"; return: one full beam re-sweep.
- Hover any statistic: flashes blue, decays back green : every figure
  ritually survives its own power-off.
- Zoom the spectrum: caveman = exactly 4 dots = 4 blocks = 3,111 B.
