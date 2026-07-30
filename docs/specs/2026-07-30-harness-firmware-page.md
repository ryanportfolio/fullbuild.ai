# Harness Firmware page — conceit + constraint contract

Showpiece method, Full tier. Standalone static page at `/harness-firmware`,
built like the prototype artifacts: self-contained under
`public/harness-firmware/`, own CSS/JS, no site-theme coupling.

## Conceit

**The page is a firmware boot.** Derived from the subject's truest facts: the
product is literally named Firmware, it is the layer loaded *before* the work
starts, and its defining property is memory that survives power-off (a session
ending). The page powers on, runs POST, mounts the kernel and memory, and
arms the on-demand payload — using only the template's real, measured bytes.

Explicit guard: firmware, not movie-hacker terminal. Memory maps, POST
checks, status columns — no green rain, no CRT scanlines, no glitch effects.

## Constraint contract (violation = bug)

1. **Color semantics.**
   - Ground `#0B0D0E`, panel `#121517`, ink `#E6E1D6`, dim ink `#9A958A`.
   - Structural neutrals (data structure, never meaning): line `#24292C`,
     hairline `#1B1F22`, trace fill `#6A665C`, trace hover `#857F72` (trace
     chosen ≥3:1 against panel so the map survives dim displays).
   - ONE accent: amber `#F0A43C` = **persistence** (bytes that stay: resident
     figures, memory writes, committed lessons). Also permitted for standard
     a11y affordances only: focus ring, selection, skip link. Never
     decorative — CTAs and hovers use ink, not amber.
   - ONE red `#E5484D` = **the cost of forgetting** (cold-boot column only).
   - No other hues (test-enforced against the declared token list). No green
     (dodges terminal cliché deliberately).
2. **No gradients, no glassmorphism, no blur, no scanlines, no purple-blue
   AI palette.** `linear-gradient`/`backdrop-filter` must not appear in the
   stylesheet (test-enforced).
3. **Typography.** System mono (`ui-monospace` stack) carries all data, logs,
   labels, headings; system sans (`system-ui`) carries prose paragraphs only.
   No webfonts — firmware runs on what the machine already has (stated on
   page as a margin note; this is a conceit-true choice, not a shortcut).
4. **Countable honesty.** Every numeral on the page (except section indices)
   exists in `facts.json` or is a labeled derivation of it. Byte figures are
   **measured from the template's git objects** at rev `5224beb`
   (platform-independent, auditable from GitHub on any OS — not local
   CRLF-inflated file sizes): blob sizes for files, description-value bytes
   for the index, and sums thereof, stated as such. Tokens are estimated at
   4 bytes/token and labeled. Units are binary (KiB) page-wide. The memory
   map allocates whole 1-KiB blocks per row — count of blocks =
   `ceil(bytes/1024)` — and the final block is drawn as an outline with its
   true used fraction filled (internal fragmentation, drawn honestly). The
   END row carries the real git tree hash of `.claude/skills` with the
   command to recompute it. 20 rows = 20 real skills; hex offsets are real
   cumulative byte offsets, 5-digit everywhere.
   `tests/harness-firmware.test.mjs` recomputes all of it and fails on
   mismatch.
5. **Motion.** One easing `cubic-bezier(0.2, 0, 0, 1)`, durations ≤ 600 ms,
   scroll-reveal only. `prefers-reduced-motion` ⇒ fully static. Page is
   complete with JavaScript disabled.
6. **Layout.** Left-anchored grid, max-width 1040 px. Asymmetry is allowed to
   mean something (log gutters, status columns); nothing centered by default
   except nothing. No horizontal scroll at 390 px.
7. **Status vocabulary** (log status column only): `OK`, `READY`, `ARMED`,
   `LOST`, `SKIP`, `--`. No other status words. Every log row carries a
   status; firmware logs do not skip fields.
8. **Wit budget:** ≤ 2 close-reading details per section.
9. **Accessibility floor:** skip link, landmarks, one `h1`, heading order,
   focus-visible styles, alt/aria on schematics.

## Deepening opportunities logged (closing pass, not built)

- Commit a measurement manifest (skill → description bytes, kernel bytes,
  keyed by the skills tree hash) so the page test can recompute the base
  measurements themselves, not just page↔facts agreement.
- Region-row hover/focus surfacing each skill's one-line description with its
  byte/token price.
- Cumulative tok/turn counter summing as POST rows print.
- Mobile POST rows currently drop the addr column; region table keeps
  addresses — consider the same treatment for POST.

## Locked facts

See `public/harness-firmware/facts.json` (single source for the page and its
test). Key figures (git objects @ rev `5224beb`): kernel 5,401 B ≈ 1,350
tok; skill-description index 2,916 B ≈ 729 tok (folded scalars measured as
their folded value); resident total 8,317 B ≈ 2,079 tok/turn; on-demand
playbooks 175,102 B across 20 skills; lazy ratio 21.1×; resident = 4.7% of
on-demand; tiers core 6 / discipline 4 / extras 10; extras total 72,719 B;
minimal-preset index 1,398 B; skills tree hash `97530c9e…`; 6
reference-memory files; pitfall example dated 2026-07-18; repo
`ryanportfolio/Harness-Firmware`, a GitHub template, MIT (LICENSE header
verified verbatim).

## Page spine

POST hero → 01 persistent memory (cold vs warm boot) → 02 memory map
(resident vs on-demand, 20-row region table with KiB blocks and tier tags) →
03 flash procedure (two install paths) → 04 targets (one image, two flash
targets) → exit (source, license, provenance, flash log) → SHUTDOWN log
(the page powers off; committed memory survives; next boot warm).
