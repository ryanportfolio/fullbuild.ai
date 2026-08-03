import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const file = (path) => new URL(`../${path}`, import.meta.url);

test('Maranatha ships one complete progressive-enhancement experience', async () => {
  const [page, styles, script, config] = await Promise.all([
    read('public/prototype/maranatha/index.html'),
    read('public/prototype/maranatha/src/styles.css'),
    read('public/prototype/maranatha/src/app.mjs'),
    read('next.config.mjs'),
  ]);

  for (const section of ['surface', 'mycelium', 'root', 'canopy', 'table']) {
    assert.match(page, new RegExp(`data-section="${section}"`));
  }
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1');
  assert.match(page, /<h1>Our Story<\/h1>/);
  assert.match(page, /<video[^>]+id="farm-film"[^>]+muted[^>]+playsinline[^>]+preload="metadata"[^>]+poster="\/prototype\/maranatha\/assets\/poster\.jpg"/s);
  assert.match(page, /src="\/prototype\/maranatha\/assets\/farm1-48-scrub\.mp4"/);
  assert.match(page, /class="skip-link"/);
  assert.match(page, /<svg[^>]+class="exchange-map"[^>]+aria-label=/s);
  assert.match(page, /class="visually-hidden"/);
  assert.match(page, /https:\/\/maranatha\.farm\/pages\/our-story/);
  assert.match(page, /https:\/\/maranatha\.farm\/collections\/all/);
  assert.match(page, /Healthy food<br>that is delicious/);
  assert.match(page, /We are what we eat ate/);
  assert.match(page, /<cite>Wendell Berry<\/cite>/);
  assert.match(page, /Michele and her family moved to the Somerset Hills of New Jersey/);
  assert.match(page, /She felt a calling to combine her love for food with healing the land/);
  assert.match(page, /unsuccessful successionary forest, invasive plants, and eroding soil/);
  assert.match(page, /pastured in rotation as multi-species flocks/);
  assert.match(page, /Farmers are compensated fairly/);
  assert.match(page, /<canvas class="exchange-loop" aria-hidden="true">/);
  assert.match(page, /<canvas class="fallow-line" aria-hidden="true">/);
  assert.equal((page.match(/class="exchange-reading"/g) ?? []).length, 2, 'both drawings are described in text');
  assert.match(page, /even if they live in an apartment/);
  assert.doesNotMatch(page, /Healing the land<br>one season at a time/);
  assert.match(page, /“Maranatha” means<br>Come, O Lord/);
  assert.match(page, /The first Christian prayer\. We honor God in all things\./);
  assert.doesNotMatch(page, /Follow the exchange|One drop|Surface water|Independent concept|Built by fullbuild\.ai/i);
  assert.match(page, /<noscript>/);
  assert.doesNotMatch(page, /\u2014/);
  for (const match of page.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gs)) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(!text.endsWith('.'), `heading ends with a period: ${text}`);
  }

  assert.match(styles, /^\/\*\nMARANATHA \/ THE LIVING EXCHANGE CONTRACT/m);
  assert.match(styles, /@font-face[\s\S]+newsreader-latin\.woff2/);
  assert.match(styles, /@font-face[\s\S]+archivo-narrow-latin\.woff2/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /font-size: clamp\(1\.22rem, 2\.05vw, 1\.8rem\)/, 'body copy holds its enlarged scale');
  assert.match(styles, /@media \(min-width: 1200px\)/, 'the break stands beside the land copy on wide screens');
  assert.match(styles, /min-height: 180svh/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /@import|fonts\.googleapis|backdrop-filter|filter:\s*blur/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|conic-gradient/);

  assert.match(script, /loadedmetadata/);
  assert.match(script, /video\.duration/);
  assert.match(script, /Math\.exp/);
  assert.match(script, /const holdRadius = gap \* 0\.3/);
  assert.match(script, /const CHAPTER_ANCHORS = \[0, 0\.27, 0\.5, 0\.75, 1\]/);
  assert.match(script, /video\.seeking/);
  assert.match(script, /seeked/);
  assert.match(script, /requestVideoFrameCallback/);
  assert.match(script, /window\.__maranathaCapture/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /saveData/);
  assert.match(script, /const LOOP_NODES = \['soil', 'flock', 'gardens', 'terraces', 'mushroom yards', 'silvopastures', 'your home'\]/);
  assert.match(script, /drawExchangeLoop\(elapsed\)/);
  assert.match(script, /drawFallowLine\(elapsed\)/);
  assert.match(script, /BREAK_AT: 0\.37/);
  assert.equal((script.match(/requestAnimationFrame\(/g) ?? []).length, 1, 'one rAF authority');
  assert.doesNotMatch(script, /Math\.random|setInterval/);

  assert.match(
    config,
    /\{ source: '\/prototype\/maranatha', destination: '\/prototype\/maranatha\/index\.html' \}/,
  );
});

test('Maranatha ships the supplied film and local type assets', async () => {
  for (const path of [
    'public/prototype/maranatha/assets/farm1.mp4',
    'public/prototype/maranatha/assets/farm1-48-scrub.mp4',
    'public/prototype/maranatha/assets/poster.jpg',
    'public/prototype/maranatha/assets/fonts/newsreader-latin.woff2',
    'public/prototype/maranatha/assets/fonts/newsreader-italic-latin.woff2',
    'public/prototype/maranatha/assets/fonts/archivo-narrow-latin.woff2',
    'public/prototype/maranatha/assets/favicon.svg',
  ]) {
    await access(file(path));
  }
  const video = await stat(file('public/prototype/maranatha/assets/farm1.mp4'));
  assert.equal(video.size, 37_416_199, 'the supplied film is copied byte-for-byte');
  const scrubVideo = await stat(file('public/prototype/maranatha/assets/farm1-48-scrub.mp4'));
  assert.ok(scrubVideo.size > 5_000_000, 'the scrub encode is unexpectedly small');
  assert.ok(scrubVideo.size < video.size, 'the scrub encode should be lighter than the source');
});
