import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const file = (path) => new URL(`../${path}`, import.meta.url);

/* Read a baseline JPEG's real pixel size out of its SOF marker, so the sizes
   the sheet prints are measured from the files rather than trusted. */
async function jpegSize(url) {
  const buf = await readFile(url);
  let i = 2; // skip SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`not a JPEG segment at ${i}`);
    const marker = buf[i + 1];
    // SOF0..SOF3 and SOF5..SOF15 carry the frame dimensions
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no frame header found');
}

/* E-02's own eval harness: every countable claim the exhibit sheet prints is
   re-derived here from the committed data, so a drifted number fails loudly
   instead of shipping. The A/V deliverable lives on the release tag; its
   figures were measured with ffprobe (2026-08-10) and are pinned below. */

const DURATION = 153.34; // ffprobe: container duration of prediction-lab-demo-1080p.mp4
const FRAMES = 9198; // ffprobe: video stream nb_frames
const CHAPTER_COUNT = 10;
const STEP_COUNT = 9;

/* The full set of URL parameters exercised against the live product on
   2026-08-10. An evidence link may use no others. */
const VERIFIED_PARAMS = new Set(['full', 'tbl', 'exp', 'chart', 'sel', 'mode']);

test('the walk facts file states the measured figures and ten ascending chapters', async () => {
  const walk = await read('src/app/prediction-lab/walk.ts');

  assert.match(walk, /duration: 153\.34/);
  assert.match(walk, /frames: 9198/);
  assert.match(walk, /fps: '60'/);
  assert.match(
    walk,
    /releases\/download\/media-prediction-lab-v1\/prediction-lab-demo-1080p\.mp4/,
    'src points at the release asset',
  );

  const ats = [...walk.matchAll(/\{\s*at:\s*([\d.]+),\s*title:/g)].map((m) => Number(m[1]));
  assert.equal(ats.length, CHAPTER_COUNT, 'ten chapters');
  for (let i = 1; i < ats.length; i++) {
    assert.ok(ats[i] > ats[i - 1], `chapter ${i + 1} starts after chapter ${i}`);
  }
  assert.equal(ats[0], 0, 'the reel opens on chapter 1');
  assert.ok(ats[ats.length - 1] < DURATION, 'last chapter starts inside the reel');

  // The registry must hold the row the walk reads its origin from — the import
  // throws at build time too, but a test failure names the miss without Next.
  const projects = await read('src/lib/projects.ts');
  assert.match(projects, /id: 'prediction-lab'/, 'registry has prediction-lab');
});

test('the sprite arithmetic covers the encoded reel exactly', async () => {
  const walk = await read('src/app/prediction-lab/walk.ts');
  const every = Number(walk.match(/spriteEvery: (\d+)/)[1]);
  const count = Number(walk.match(/spriteCount: (\d+)/)[1]);
  assert.equal(count, Math.ceil(DURATION / every), 'one tile per interval, none missing');
});

test('the waveform is a plot of the measured audio, one bin per half second', async () => {
  const peaks = JSON.parse(await read('src/app/prediction-lab/peaks.json'));

  assert.equal(peaks.binMs, 500);
  assert.equal(peaks.bins, peaks.peaks.length);
  assert.equal(
    peaks.bins,
    Math.ceil((DURATION * 1000) / peaks.binMs),
    'bin count covers the reel duration exactly',
  );
  assert.ok(
    peaks.peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 100),
    'peaks are normalized integers',
  );
  assert.equal(Math.max(...peaks.peaks), 100, 'normalization pins the loudest bin at 100');
});

test('every ledger step is unique, verified-parameter only, and cited coherently', async () => {
  const walk = await read('src/app/prediction-lab/walk.ts');

  const ids = [...walk.matchAll(/id: '(W-\d\d)'/g)].map((m) => m[1]);
  assert.equal(ids.length, STEP_COUNT, 'nine ledger steps');
  assert.equal(new Set(ids).size, ids.length, 'step ids are unique');

  // Evidence params: only query strings from the verified set, or a rooted
  // path into the same product, or null (state that does not ride the URL).
  const params = [...walk.matchAll(/params: (null|'[^']*')/g)].map((m) => m[1]);
  assert.equal(params.length, STEP_COUNT, 'every step declares its params');
  for (const p of params) {
    if (p === 'null') continue;
    const raw = p.slice(1, -1);
    if (raw.startsWith('/')) {
      assert.match(raw, /^\/record\/\d+$/, `rooted path is the record page: ${raw}`);
      continue;
    }
    assert.ok(raw.startsWith('?'), `query params start with ?: ${raw}`);
    for (const pair of raw.slice(1).split('&')) {
      const key = pair.split('=')[0];
      assert.ok(VERIFIED_PARAMS.has(key), `parameter ${key} was exercised live`);
    }
  }

  // Chapters cite only existing steps (the module throws at import too).
  const cited = [...walk.matchAll(/steps: \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'(W-\d\d)'/g)].map((x) => x[1]));
  assert.ok(cited.length > 0, 'chapters cite steps');
  for (const id of cited) {
    assert.ok(ids.includes(id), `chapter cites existing step ${id}`);
  }

  // Chapter titles are one word: the log is a grid reference, not a synopsis.
  const titles = [...walk.matchAll(/at: [\d.]+, title: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(titles.length, CHAPTER_COUNT, 'every chapter is titled');
  for (const t of titles) {
    assert.ok(!/\s/.test(t), `chapter title "${t}" is one word`);
  }

  // Every step names its PR paper trail, as numbers that can be linked.
  const prs = [...walk.matchAll(/prs: \[([^\]]*)\]/g)].map((m) =>
    m[1].split(',').map((n) => Number(n.trim())),
  );
  assert.equal(prs.length, STEP_COUNT, 'every step cites its PRs');
  for (const list of prs) {
    assert.ok(list.length > 0, 'at least one PR per step');
    for (const n of list) {
      assert.ok(Number.isInteger(n) && n >= 35 && n <= 68, `PR #${n} is in the read range`);
    }
  }

  // A step prints a link only when a link can carry its state, so a bare
  // origin never stands in as evidence for a view it cannot reopen.
  const page = await read('src/app/prediction-lab/page.tsx');
  assert.match(
    page,
    /\{s\.params !== null \?[\s\S]*?<LiveLink/,
    'the evidence link renders only for a step whose state rides the URL',
  );
});

test('the exhibit page prints only claims the data can back', async () => {
  const page = await read('src/app/prediction-lab/page.tsx');
  const player = await read('src/app/prediction-lab/WalkPlayer.tsx');

  // The plate and head band come from WALK, never hand-typed.
  assert.match(player, /\{WALK\.frames\.toLocaleString\('en-US'\)\} FRAMES/);
  assert.match(player, /\{WALK\.fps\} FPS/);
  assert.match(page, /timecode\(WALK\.duration\)/);
  // Exactly one h1, and it is the sheet's name on the head band.
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1');
  assert.match(page, /<h1[^>]*>\s*PREDICTION LAB/);
  // The origin of every evidence link is read from the registry, not restated.
  assert.match(page, /stepHref\(s\)/);
  assert.ok(!/web-production-563b7/.test(page), 'page never hand-types the product origin');
  assert.ok(!/web-production-563b7/.test(await read('src/app/prediction-lab/walk.ts')),
    'walk.ts never hand-types the product origin');
  // Voice rules: no em dashes in anything the reader sees.
  const visible = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!visible(page).includes('—'), 'no em dash in page output');
  assert.ok(!visible(player).includes('—'), 'no em dash in player output');
  assert.ok(!visible(await read('src/app/prediction-lab/walk.ts')).includes('—'),
    'no em dash in the walk copy');
});

test('the sheet ships its floor assets', async () => {
  for (const asset of [
    'public/prediction-lab/poster.jpg',
    'public/prediction-lab/scrub-sprites.jpg',
  ]) {
    const s = await stat(file(asset));
    assert.ok(s.size > 10_000, `${asset} is a real image`);
    assert.ok(s.size < 400_000, `${asset} stays a lightweight page asset`);
  }

  // One figure per ledger step, plus the second theme figure W-09 stacks.
  const walk = await read('src/app/prediction-lab/walk.ts');
  const figs = [...walk.matchAll(/fig: '(\/prediction-lab\/[a-z0-9-]+\.jpg)'/g)].map((m) => m[1]);
  assert.equal(figs.length, STEP_COUNT, 'every step declares its figure');
  for (const f of [...figs, '/prediction-lab/fig-w09-night.jpg']) {
    const s = await stat(file(`public${f}`));
    assert.ok(s.size > 20_000, `${f} is a real capture`);
    assert.ok(s.size < 400_000, `${f} stays a page-weight figure`);
  }

  // The dimensions on each img are the file's own, read out of the JPEG
  // headers here, so the reserved box always matches what actually loads and
  // no figure is ever drawn larger than the pixels it holds.
  const declared = [...walk.matchAll(
    /fig: '(\/prediction-lab\/[a-z0-9-]+\.jpg)',\s*\n\s*figW: (\d+),\s*\n\s*figH: (\d+),/g,
  )];
  assert.equal(declared.length, STEP_COUNT, 'every figure declares its size');
  for (const [, path, w, h] of declared) {
    const { width, height } = await jpegSize(file(`public${path}`));
    assert.equal(width, Number(w), `${path} width matches the file`);
    assert.equal(height, Number(h), `${path} height matches the file`);
  }

  assert.equal(FRAMES, 9198, 'pinned frame figure unchanged');
});
