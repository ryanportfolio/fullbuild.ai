import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Open SaaS reference prototype ships its complete contract', async () => {
  const [config, directory, page, styles, script] = await Promise.all([
    read('next.config.mjs'),
    read('public/prototype/index.html'),
    read('public/prototype/open-saas/index.html'),
    read('public/prototype/open-saas/styles.css'),
    read('public/prototype/open-saas/app.mjs'),
  ]);

  assert.match(config, /source: '\/prototype\/open-saas'/);
  assert.equal((directory.match(/href="\/prototype\/open-saas"/g) ?? []).length, 1);
  assert.match(directory, /<h2>Open Build<\/h2>/);

  for (const section of ['hero', 'customers', 'story', 'features', 'roadmap', 'testimonials', 'faq']) {
    assert.match(page, new RegExp(`data-section="${section}"`));
  }

  assert.match(page, /<script type="module" src="\/prototype\/open-saas\/app\.mjs"><\/script>/);
  assert.match(page, /aria-controls="mobile-drawer"/);
  assert.match(page, /aria-label="Toggle dark mode"/);
  assert.match(page, /<details/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /--accent-brand:/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /localStorage/);
  assert.match(script, /window\.__openBuildCapture/);
  assert.doesNotMatch(page + styles + script, /\u2014/);
});
