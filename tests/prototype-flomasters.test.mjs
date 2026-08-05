import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PAGES = [
  'public/prototype/flomasters/index.html',
  'public/prototype/flomasters/book/index.html',
  'public/prototype/flomasters/pricing/index.html',
  'public/prototype/flomasters/about/index.html',
  'public/prototype/flomasters/services/index.html',
  'public/prototype/flomasters/services/drain-cleaning/index.html',
  'public/prototype/flomasters/services/water-heaters/index.html',
  'public/prototype/flomasters/norfolk/index.html',
];

test('every Flomasters page carries the same conversion and trust chassis', async () => {
  for (const path of PAGES) {
    const page = await read(path);
    assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, `${path}: exactly one h1`);
    assert.match(page, /content="width=device-width, initial-scale=1"/, `${path}: viewport`);
    assert.ok((page.match(/href="tel:\+17572776194"/g) ?? []).length >= 3, `${path}: tap-to-call in header, body and callbar`);
    assert.match(page, /VA Tradesman License #2710081569/, `${path}: credential line`);
    assert.match(page, /https:\/\/www\.dpor\.virginia\.gov\/LicenseLookup/, `${path}: DPOR verification link`);
    assert.match(page, /class="skip-link"/, `${path}: skip link`);
    assert.match(page, /class="callbar"/, `${path}: sticky call bar`);
    assert.match(page, /\(757\) 277-6194/, `${path}: display number`);
    assert.doesNotMatch(page, /—/, `${path}: no em dashes (site voice rule)`);
    assert.doesNotMatch(page, /[Ll]icensed and insured/, `${path}: credential is stated precisely, never as the empty phrase`);
    assert.doesNotMatch(page, /stock photo|lorem/i, `${path}: no placeholder rot`);
  }
});

test('the home page is the GBP-ready landing page', async () => {
  const page = await read('public/prototype/flomasters/index.html');
  assert.match(page, /The plumber who quotes it is the plumber who does it/);
  assert.match(page, /"@type": "Plumber"/);
  const jsonLd = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.doesNotMatch(jsonLd, /aggregateRating|"review"/, 'self-serving review schema is ineligible and must not ship');
  for (const city of ['Chesapeake', 'Norfolk', 'Virginia Beach', 'Portsmouth', 'Suffolk', 'Hampton', 'Newport News']) {
    assert.match(page, new RegExp(`"name": "${city}"`), `areaServed includes ${city}`);
  }
  assert.match(page, /hasCredential/);
  assert.match(page, /data-callbar-anchor/, 'hero anchor that hides the sticky bar while its own CTA is visible');
  assert.match(page, /Read every review, good or bad/);
});

test('the booking page diagnostic and form agree on job types', async () => {
  const page = await read('public/prototype/flomasters/book/index.html');
  const spots = [...page.matchAll(/class="house-spot"[^>]*data-job="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(spots, ['kitchen', 'bath', 'water-heater', 'crawl', 'yard', 'spigot'], 'six tappable spots');
  for (const job of spots) {
    assert.match(page, new RegExp(`<option value="${job}"`), `form select covers ${job}`);
  }
  for (const spot of [...page.matchAll(/<g class="house-spot"[^>]*>/g)]) {
    assert.match(spot[0], /role="button"/);
    assert.match(spot[0], /tabindex="0"/);
  }
  assert.match(page, /class="trap"/, 'honeypot instead of a captcha');
  assert.match(page, /type="tel"/, 'phone field switches mobile keyboards');
  assert.match(page, /class="form-success"/);
  assert.match(page, /Skip the form\./, 'emergencies are routed to the phone, not the form');
});

test('the design system enforces the card-derived contrast rules', async () => {
  const styles = await read('public/prototype/flomasters/src/styles.css');
  assert.match(styles, /--cta: #B87333/, 'copper CTA, not blue');
  assert.match(styles, /--navy-800: #0B2545/);
  assert.match(styles, /--cream-50: #FBF8F0/);
  assert.match(styles, /--drop-on-deep: #7EC8E3/);
  assert.match(styles, /--drop-on-light: #1B5E8C/, 'the card light blue never carries text on cream');
  assert.match(styles, /--texture-deep/, 'water-line texture exists');
  assert.doesNotMatch(styles, /body\s*\{[^}]*--texture-deep/, 'texture stays on navy panels, not the page');
  assert.match(styles, /prefers-reduced-motion/);
  const animations = styles.match(/@keyframes/g) ?? [];
  assert.equal(animations.length, 1, 'exactly one motion moment, the hero drop');
});

test('the pages are wired into the app and the prototype index', async () => {
  const [config, index, app] = await Promise.all([
    read('next.config.mjs'),
    read('public/prototype/index.html'),
    read('public/prototype/flomasters/src/app.mjs'),
  ]);
  assert.match(config, /\{ source: '\/prototype\/flomasters', destination: '\/prototype\/flomasters\/index\.html' \}/);
  assert.match(config, /\{ source: '\/prototype\/flomasters\/:path\*', destination: '\/prototype\/flomasters\/:path\*\/index\.html' \}/);
  assert.match(index, /href="\/prototype\/flomasters"/);
  assert.match(index, /<h2>Flomasters<\/h2>/);
  assert.match(app, /IntersectionObserver/);
  assert.match(app, /\.trap input/, 'submit handler honors the honeypot');
});
