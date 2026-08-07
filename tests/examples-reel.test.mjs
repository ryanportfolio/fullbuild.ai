import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const file = (path) => new URL(`../${path}`, import.meta.url);

/* E-101's own eval harness: every countable claim the exhibit sheet prints is
   re-derived here from the committed data, so a drifted number fails loudly
   instead of shipping. The A/V deliverable itself lives on the release tag;
   its figures were measured with ffprobe and are pinned below. */

const DURATION = 658.31; // ffprobe: container duration of examples-reel-1080p.mp4
const FRAMES = 39457; // ffprobe: video stream nb_frames
const STATION_COUNT = 10;

test('the reel facts file states the measured figures and ten ascending stations', async () => {
  const reel = await read('src/app/examples/reel.ts');

  assert.match(reel, /duration: 658\.31/);
  assert.match(reel, /frames: 39457/);
  assert.match(reel, /fps: '59\.94'/);
  assert.match(
    reel,
    /releases\/download\/media-examples-v1\/examples-reel-1080p\.mp4/,
    'src points at the release asset',
  );

  const ats = [...reel.matchAll(/\{\s*at:\s*([\d.]+),\s*id:/g)].map((m) => Number(m[1]));
  assert.equal(ats.length, STATION_COUNT, 'ten stations');
  for (let i = 1; i < ats.length; i++) {
    assert.ok(ats[i] > ats[i - 1], `station ${i + 1} starts after station ${i}`);
  }
  assert.equal(ats[0], 0, 'the reel opens on station 1');
  assert.ok(ats[ats.length - 1] < DURATION, 'last station starts inside the reel');

  // Every station id must exist in the registry — the import throws at build
  // time too, but a test failure names the id without booting Next.
  const projects = await read('src/lib/projects.ts');
  const ids = [...reel.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);
  for (const id of ids) {
    assert.match(projects, new RegExp(`id: '${id}'`), `registry has ${id}`);
  }
});

test('the waveform is a plot of the measured audio, one bin per half second', async () => {
  const peaks = JSON.parse(await read('src/app/examples/peaks.json'));

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

test('the exhibit page prints only claims the data can back', async () => {
  const page = await read('src/app/examples/page.tsx');
  const player = await read('src/app/examples/ReelPlayer.tsx');

  // The frame count and fps on the plate come from REEL, never hand-typed.
  assert.match(player, /\{REEL\.frames\.toLocaleString\('en-US'\)\} FRAMES/);
  assert.match(player, /\{REEL\.fps\} FPS/);
  // The head band prints the reel's duration from REEL, never hand-typed.
  assert.match(page, /timecode\(REEL\.duration\)/);
  // Exactly one h1, and it is the sheet's name on the head band.
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1');
  assert.match(page, /<h1[^>]*>\s*EXAMPLES/);
  // Voice rules: no em dashes in anything the reader sees. Comments keep the
  // repo's drafting voice, so strip them before checking.
  const visible = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!visible(page).includes('—'), 'no em dash in page output');
  assert.ok(!visible(player).includes('—'), 'no em dash in player output');
});

test('the sheet ships its floor assets', async () => {
  for (const asset of ['public/examples/poster.jpg', 'public/examples/scrub-sprites.jpg']) {
    const s = await stat(file(asset));
    assert.ok(s.size > 10_000, `${asset} is a real image`);
    assert.ok(s.size < 400_000, `${asset} stays a lightweight page asset`);
  }
  assert.equal(FRAMES, 39457, 'pinned frame figure unchanged');
});
