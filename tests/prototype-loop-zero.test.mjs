import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Loop Zero is listed and ships its complete progressive-enhancement contract', async () => {
  const [directory, page, styles, script] = await Promise.all([
    read('public/prototype/index.html'),
    read('public/prototype/loop-zero/index.html'),
    read('public/prototype/loop-zero/src/styles.css'),
    read('public/prototype/loop-zero/src/app.mjs'),
  ]);

  assert.equal((directory.match(/href="\/prototype\/loop-zero"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">07<\/span>[\s\S]*?<h2>Loop Zero<\/h2>/);

  for (const contract of [
    'data-section="hero"',
    'data-section="outcomes"',
    'data-section="workflow"',
    'data-section="environments"',
    'data-section="proof"',
    'data-section="faq"',
    '<footer',
  ]) {
    assert.match(page, new RegExp(contract));
  }

  assert.match(page, /<script type="module" src="\/prototype\/loop-zero\/src\/app\.mjs"><\/script>/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /aria-label="Loop Zero home"/);
  assert.match(page, /<canvas id="loop-zero-halo"[^>]*><\/canvas>/);
  assert.match(page, /<canvas id="loop-zero-grid"[^>]*><\/canvas>/);
  assert.doesNotMatch(page, /class="core"/);
  assert.doesNotMatch(page, /class="orbit orbit-/);
  assert.doesNotMatch(page, /\u2014/);

  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.site-header\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(styles, /\.workflow__intro\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(styles, /h1\s*\{[\s\S]*?font-size:\s*58px/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /function drawHalo/);
  assert.match(script, /function drawGrid/);
  assert.match(script, /window\.__loopZeroCapture/);
});
