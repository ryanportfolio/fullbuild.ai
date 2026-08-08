import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/* The rail's site log has exactly one owner at a time, and the carriage dial
   only exists while the instrument does. Both are cross-file contracts, so
   they are asserted here rather than left to a comment. */

test('the site log has one owner, and scrubbing it is earned by having scroll to spend', async () => {
  const [drawingSet, hook, titleBlock] = await Promise.all([
    read('src/components/motion/DrawingSet.tsx'),
    read('src/components/chrome/useRailSketchDraw.ts'),
    read('src/components/chrome/TitleBlock.tsx'),
  ]);

  // The claim is measured, not asserted by markup: a route that cannot scroll
  // (/contact has a scroll range of exactly zero) must not hold a scrubbed log
  // hostage at its first mark.
  assert.match(drawingSet, /const scrollRange = document\.documentElement\.scrollHeight - window\.innerHeight;/);
  assert.match(drawingSet, /const scrubbable = scrollRange > window\.innerHeight \* 0\.5;/);
  assert.match(drawingSet, /const sketch = scrubbable/);
  // The flag is stamped only inside the branch that actually wires the scrub.
  assert.match(drawingSet, /root\.setAttribute\('data-site-log', 'scrubbed'\);/);
  assert.ok(
    !/data-site-log=/.test(drawingSet),
    'the claim is never written as a static JSX attribute',
  );
  // The rail's one-shot draw stands down only against a live claim.
  assert.match(hook, /if \(document\.querySelector\('\[data-site-log="scrubbed"\]'\)\) return;/);
  // And the rail actually calls it.
  assert.match(titleBlock, /useRailSketchDraw\(\);/);
});

test('the draw-in releases the pre-paint hold on every path, including reduced motion', async () => {
  const [hook, globals] = await Promise.all([
    read('src/components/chrome/useRailSketchDraw.ts'),
    read('src/app/globals.css'),
  ]);

  // globals.css hides unarmed scrub strokes while the pre-paint hold stands,
  // so arming is what makes the rail visible at all on these routes.
  assert.match(globals, /\[data-draw-pending\] \.ws-scrub:not\(\[data-ws-armed\]\)/);
  assert.match(hook, /const arm = \(\) => strokes\.forEach/);
  assert.match(hook, /setAttribute\('data-ws-armed', ''\)/);
  // The reduced-motion path arms and returns: finished record, no animation,
  // never a hidden or half-drawn one.
  const reducedBlock = hook.slice(hook.indexOf('if (reduced)'), hook.indexOf('const paintAt'));
  assert.match(reducedBlock, /arm\(\);/);
  assert.match(reducedBlock, /return;/);
  assert.ok(!reducedBlock.includes('requestAnimationFrame'), 'reduced motion never animates');

  // Dash state is written as attributes (pathLength=1), never CSS px lengths.
  assert.match(hook, /setAttribute\('stroke-dasharray', '1 1'\)/);
  assert.ok(!hook.includes('strokeDasharray'), 'no CSS dash writes');

  // A FINISHED STROKE CARRIES NO DASH. Firefox mis-renders a lingering
  // `1 1` dasharray against pathLength=1 on multi-subpath paths even at
  // dashoffset 0 (subpaths fall into dash gaps and the record rearranges),
  // so every dash-draw consumer must strip the rig on completion. Chromium
  // forgiving it is why this regresses silently without a pin.
  const scrub = await read('src/components/motion/DrawingSet.tsx');
  const logo = await read('src/components/chrome/RailLogo.tsx');
  for (const [name, src] of [['useRailSketchDraw', hook], ['DrawingSet sketch scrub', scrub]]) {
    assert.match(
      src,
      /removeAttribute\('stroke-dasharray'\);\s*\r?\n\s*.*removeAttribute\('stroke-dashoffset'\)/,
      `${name} strips the dash rig from finished strokes`,
    );
  }
  assert.match(
    logo,
    /strokeDasharray = '';\s*\r?\n\s*p\.style\.strokeDashoffset = '';/,
    'RailLogo clears its dash styles once the draw settles',
  );
  assert.match(logo, /settleTimer = window\.setTimeout/, 'RailLogo settles on a timer it owns');
  assert.match(logo, /clearTimeout\(settleTimer\)/, 'and clears it on teardown');

  // HIDDEN UNTIL IN FLIGHT — the other half of the same Firefox defect: a
  // stroke PARKED at offset 1 with the rig hung leaks stray subpath fragments
  // on load, so the waiting state is carried by visibility, never by the dash.
  assert.match(scrub, /'stroke-dashoffset': 1, visibility: 'hidden'/, 'sheet + sketch strokes wait hidden');
  assert.match(scrub, /el\.removeAttribute\('visibility'\); \/\/ its turn: nib down/, 'sheet strokes shed the hide in onStart');
  assert.match(hook, /el\.setAttribute\('visibility', 'hidden'\)/, 'one-shot strokes wait hidden');
  assert.match(logo, /p\.style\.visibility = 'hidden'/, 'logo strokes wait hidden');
  assert.match(logo, /visibility 0s \$\{i \* DRAW_STAGGER\}ms/, 'logo nib comes down on its own stagger beat');

  // Deterministic capture hook, and it is cleaned up.
  assert.match(hook, /window\.__railSketch = \{/);
  for (const fn of ['freeze', 'thaw', 'step']) {
    assert.match(hook, new RegExp(`${fn}`), `capture hook exposes ${fn}`);
  }
  assert.match(hook, /cancelAnimationFrame\(raf\)/);
  assert.match(hook, /delete window\.__railSketch/);
});

test('the carriage dial is on the rail only while the instrument reports', async () => {
  const [titleBlock, css, pen] = await Promise.all([
    read('src/components/chrome/TitleBlock.tsx'),
    read('src/components/chrome/TitleBlock.module.css'),
    read('src/components/motion/PenCarriage.tsx'),
  ]);

  // Ships hidden...
  assert.match(titleBlock, /data-carriage="false"/);
  assert.match(css, /\.telemetry\[data-carriage='false'\]/);
  // ...revealed by the pen's first real target, and retired on unmount.
  assert.match(pen, /telPanel\.dataset\.carriage = 'true'/);
  assert.match(pen, /telPanel\.dataset\.carriage = 'false'/);
});
