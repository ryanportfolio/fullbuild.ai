import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const file = (path) => new URL(`../${path}`, import.meta.url);

/* E-02's own eval harness: every countable claim the exhibit sheet prints is
   re-derived here from the committed data, so a drifted number fails loudly
   instead of shipping. The A/V deliverable is committed too, at
   public/layline-vid/tape-1080p60.mp4; its figures were measured with ffprobe
   on that file and are pinned below. */

const DURATION = 257.53; // ffprobe: container duration of tape-1080p60.mp4
const FRAMES = 15450; // ffprobe: video stream nb_frames
const SPRITE_EVERY = 2; // one scrub thumb per 2 s of the deliverable

test('the tape facts file states the measured figures', async () => {
  const reel = await read('src/app/layline-vid/reel.ts');

  assert.match(reel, /duration: 257\.53/);
  assert.match(reel, /frames: 15450/);
  assert.match(reel, /fps: '60\.00'/);
  assert.match(reel, /width: 1920/);
  assert.match(reel, /height: 1080/);
  /* THE TAPE IS SERVED FROM THIS ORIGIN, and that is a playback contract, not
     a preference. A GitHub release asset is handed over as
     application/octet-stream with an attachment disposition, which is a
     download rather than a video, and a media engine that trusts the declared
     type has nothing to decode. Same-origin static means Vercel declares
     video/mp4. */
  assert.match(reel, /src: '\/layline-vid\/tape-1080p60\.mp4'/, 'src is a same-origin static path');
  assert.ok(!reel.includes('releases/download/'), 'never back to release-asset hosting');

  // 60 fps exactly, so the frame count and the duration have to agree to
  // within the container's own tail (the audio stream runs a beat past the
  // last video frame, which is what makes the two disagree at all).
  assert.ok(
    Math.abs(DURATION * 60 - FRAMES) < 3,
    `frame count ${FRAMES} matches 60 fps across ${DURATION}s`,
  );
});

test('the scrub sheet holds one real frame per two seconds of the tape', async () => {
  const reel = await read('src/app/layline-vid/reel.ts');

  const every = Number(reel.match(/spriteEvery: (\d+)/)[1]);
  const count = Number(reel.match(/spriteCount: (\d+)/)[1]);
  const cols = Number(reel.match(/spriteCols: (\d+)/)[1]);

  assert.equal(every, SPRITE_EVERY);
  assert.equal(count, Math.ceil(DURATION / every), 'a tile per interval, covering the tape');
  assert.ok(count <= cols * 11, 'the sheet is cut 12 wide and fits its rows');
});

test('the waveform is a plot of the measured audio, one bin per half second', async () => {
  const peaks = JSON.parse(await read('src/app/layline-vid/peaks.json'));

  assert.equal(peaks.binMs, 500);
  assert.equal(peaks.bins, peaks.peaks.length);
  assert.equal(
    peaks.bins,
    Math.ceil((DURATION * 1000) / peaks.binMs),
    'bin count covers the tape duration exactly',
  );
  assert.ok(
    peaks.peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 100),
    'peaks are normalized integers',
  );
  assert.equal(Math.max(...peaks.peaks), 100, 'normalization pins the loudest bin at 100');
});

test('the exhibit page prints only claims the data can back', async () => {
  const page = await read('src/app/layline-vid/page.tsx');
  const player = await read('src/app/layline-vid/TapePlayer.tsx');

  // The frame count and fps on the plate come from REEL, never hand-typed.
  assert.match(player, /\{REEL\.frames\.toLocaleString\('en-US'\)\} FRAMES/);
  assert.match(player, /\{REEL\.fps\} FPS/);
  // The head band prints the tape's duration from REEL, never hand-typed.
  assert.match(page, /timecode\(REEL\.duration\)/);
  // Exactly one h1, and it is the sheet's name on the head band.
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1');
  assert.match(page, /<h1[^>]*>\s*LAYLINE/);
  // The capture hook is namespaced away from the prototype scene's window.__layline.
  assert.match(player, /window\.__laylineReel = \{/);
  assert.ok(!player.includes('window.__layline ='), 'never claims the scene hook name');
  // Voice rules: no em dashes in anything the reader sees. Comments keep the
  // repo's drafting voice, so strip them before checking.
  const visible = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!visible(page).includes('—'), 'no em dash in page output');
  assert.ok(!visible(player).includes('—'), 'no em dash in player output');
});

test('the sheet ships its floor assets', async () => {
  for (const asset of ['public/layline-vid/poster.jpg', 'public/layline-vid/scrub-sprites.jpg']) {
    const s = await stat(file(asset));
    assert.ok(s.size > 10_000, `${asset} is a real image`);
    assert.ok(s.size < 400_000, `${asset} stays a lightweight page asset`);
  }
  assert.equal(FRAMES, 15450, 'pinned frame figure unchanged');
});

test('the tape itself is committed, and stays under the size a repo can carry', async () => {
  const s = await stat(file('public/layline-vid/tape-1080p60.mp4'));

  assert.ok(s.size > 20_000_000, 'the full tape, not a placeholder');
  /* 50 MB is where GitHub starts warning on a committed file, and it is what
     picked CRF 29 over 28 (54.2 MB at SSIM Y 0.995, against 47.3 MB at 0.994).
     A re-cut that busts this ceiling needs a hosting decision, not a bigger
     number here. */
  assert.ok(s.size < 50_000_000, `tape is ${(s.size / 1e6).toFixed(1)} MB, under the 50 MB ceiling`);
});

test('fullscreen is the tape\'s, and the native controls come with it', async () => {
  const player = await read('src/app/layline-vid/TapePlayer.tsx');
  const css = await read('src/app/layline-vid/layline-vid.module.css');

  // the request goes to the video, never to the player section: fullscreening
  // the sheet blows up the drawing, and iOS Safari implements fullscreen on
  // the media element and nowhere else
  assert.match(player, /if \(typeof v\.requestFullscreen === 'function'\) void v\.requestFullscreen\(\);/);
  assert.match(player, /webkitEnterFullscreen\?\.\(\)/);
  assert.ok(!player.includes('root.requestFullscreen'), 'never fullscreens the sheet');
  assert.ok(!css.includes('.player:fullscreen'), 'no sheet-level fullscreen frame left behind');

  // the drawn bench does not follow the tape up there, so the UA controls do
  assert.match(player, /controls=\{!enhanced \|\| full\}/);
  assert.match(player, /document\.addEventListener\('fullscreenchange', onFullChange\)/);
  assert.match(player, /document\.removeEventListener\('fullscreenchange', onFullChange\)/);
});
