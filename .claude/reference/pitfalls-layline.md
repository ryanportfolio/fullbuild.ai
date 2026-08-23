# Layline pitfalls

Gotchas specific to the Layline race replay (scene, render gate, capture
harness, mirror sync). Cross-cutting site traps stay in `pitfalls.md`;
mirror-sync procedure lives in the `ship-layline` skill.

## Pixel comparisons: park the mouse off-canvas first (2026-08-23)

Symptom: two Playwright element screenshots of the Layline canvas taken around
a forced redraw differed by ~350 channel samples (max delta 87) and read as a
render-gate bug. The picture was fine: element screenshots composite every DOM
layer over the element's box, and the pointer left sitting on the water after a
click puts the BoatCursor overlay (and any hover state) into both shots at
slightly different paint states.

Fix: `page.mouse.move()` to a corner outside the canvas box before capturing,
then re-shoot. Control run with the pointer parked showed 0 delta across all
2.76M samples, settled frame vs forced redraw. Applies to any DOM-overlaid
canvas comparison on this site, headed Chrome included.
