# Design contract: <reference site> to <prototype>

Fill before implementation. Every fact must trace to evidence: a screenshot filename, a computed style, an animation-sample dump, a shader file, or a clone-report entry confirmed in the browser.

## Source

- Reference URL:
- Capture date:
- Rights basis: reconstruction by default; literal port only with recorded owner authorization

## Tokens

- Colors (background, surface, text, accent, border):
- Type scale (families, weights, sizes, line-heights, letter-spacing; font files observed):
- Spacing scale, radii, shadows:
- Published timing tokens from :root or bundle (durations, easings):

## Layout geometry

- Container max-widths and gutters:
- Grid or column system:
- Breakpoints observed, and what transforms at each:

## Section sequence

| # | Section | Desktop layout | Mobile transform | Notes |
|---|---------|----------------|------------------|-------|

## Motion and interaction spec

One row per effect. "Scroll linkage" is trigger-vs-scrub plus offsets (e.g. "top 80%") and pin duration; write "time" for clock-driven and "pointer" for cursor-driven.

| Element | Trigger | Properties animated | Behavior | Duration | Easing | Stagger/delay | Iteration | Scroll linkage | Reduced-motion fallback |
|---------|---------|---------------------|----------|----------|--------|---------------|-----------|----------------|--------------------------|

## State matrix

Enumerate every interactive element. Include custom cursors, magnetic buttons, label rolls, tilts, and image reveals.

| Element | Hover | Focus | Active | Disabled | Notes |
|---------|-------|-------|--------|----------|-------|

## Scroll physics

- Smooth-scroll library and config (lerp / duration / easing):
- Measured wheel-tick curve (scrollY samples):
- Native scroll hijacked (yes/no); custom scrollbar behavior:
- Scroll-driven effects inventory (what changes, trigger vs scrub, pin):

## Page transitions

- Mechanism (router transition, overlay wipe, View Transitions API):
- Out/in choreography, duration, easing, overlay description:
- First-load entry sequence (order of reveals):
- Text-reveal treatment (e.g. per-line split masks) and where it runs:

## Canvas / WebGL system

- Context type, renderer string, canvas CSS (position, z-index, pointer-events):
- Scene inventory (meshes, materials, render targets, ping-pong buffers):
- Extracted shader files (paths) and what each does:
- Uniform map (name → what it drives: scroll, clock, pointer, texture):
- Time-driven vs scroll-driven vs pointer-driven behavior:
- Fallback when WebGL is unavailable:

## Assets

| Asset | Source status | Keep or replace | Replacement |
|-------|---------------|-----------------|-------------|

## Accessibility observations

- Reduced-motion support observed (emulated pass result):
- no-JS content visibility:
- Keyboard reachability of interactions:

## Known deviations

-
