# Pass 02 — Craft, typography, and 3D

Date: 2026-07-20
Renderer: installed Google Chrome through a temporary headless/CDP session
Viewports: 1440×900, 1024×768, 390×844; state transitions and fallback included

## Accepted defects

- Lifecycle controls moved the evidence into view while leaving the proof object behind. Desktop evidence now owns a sticky second viewport powered by the same geometry and state machine.
- Uniform topology lines made Engineering noisy. Geometry now exposes deterministic sparse structural ribs; WebGL separates subdued topology from high-contrast structure and uses a lighter 40×20 inspection mesh.
- Mobile could break `engineering` mid-word. Small-screen stage titles now preserve whole words at a bounded responsive size.
- Four oversized evidence panels created unnecessary scan distance. Desktop stage height dropped from 76svh/52rem to 64svh/44rem without removing an artifact, decision, constraint, verification, or source link.
- System labels were visually recessive. The CSS now enforces a tested 0.62rem minimum and raises primary microtype above that floor.

## Rejected finding

The Method anchor was reported as lacking top clearance, but its browser capture retains roughly 160px before the heading. No corrective spacing was added without a reproduced defect.

## Conceit deepening

The sticky workbench makes state changes inspectable beside their evidence. Structural ribs now read as committed topology while the persistent vermilion lineage carries decision accumulation across representations.

## Evidence disposition

Original diagnostics remain under `C:\tmp\fullbuild-pass2\run-20260720\`. Accepted changes require targeted browser rerenders before this pass closes.

## Fix verification

Chrome rerenders under `C:\tmp\fullbuild-pass2-fixed\` and `C:\tmp\fullbuild-pass2-final\` confirm the sticky proof remains visible through a real Idea → Design → Engineering sequence, structural ribs clarify the mesh, mobile Engineering remains whole, and desktop Engineering/Shipped titles no longer split. Computed inspectable microtype now bottoms out at 11.2px. The remaining long-form document height is retained because it represents real evidence rather than decorative whitespace.
