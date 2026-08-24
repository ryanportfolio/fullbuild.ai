/* ============================================================================
   REEL PEAKS, the audio envelope a strip-chart transport plots.

   One peak bin per half second, measured from the ENCODED deliverable (the
   file the player seeks in, not the master), normalized to 0..100 with the
   loudest bin pinned at 100. The E-02 sheet's chart is an unresampled plot of
   this array, so the file has to be re-derived whenever the deliverable is
   re-cut.

     node scripts/reel-peaks.mjs <encoded.mp4> src/app/layline-vid/peaks.json

   The rest of the deliverable pipeline, for the same reason (every figure the
   sheet prints was measured, and can be measured again):

     # 1. encode: x264 CRF 29, 2 s GOP so scrubbing lands near a keyframe,
     #    faststart so the moov atom precedes the media data
     ffmpeg -i master.mp4 -c:v libx264 -preset slow -crf 29 -profile:v high \
       -level 4.2 -pix_fmt yuv420p -g 120 -keyint_min 60 \
       -c:a aac -b:a 128k -ac 2 -movflags +faststart out.mp4

     # 2. figures the sheet prints
     ffprobe -v error -show_entries format=duration \
       -show_entries stream=width,height,r_frame_rate,nb_frames out.mp4

     # 3. poster, one real frame
     ffmpeg -ss 6 -i out.mp4 -frames:v 1 -q:v 7 public/<sheet>/poster.jpg

     # 4. scrub sheet, one 160x90 thumb per 2 s, 12 per row
     ffmpeg -i out.mp4 -vf "fps=1/2,scale=160:90,tile=12x11" -frames:v 1 \
       -q:v 6 public/<sheet>/scrub-sprites.jpg

   The encoded file is committed to public/, which is what makes the response
   `video/mp4`; a GitHub release asset is served `application/octet-stream` as
   an attachment and a strict media engine will not decode it. That is what
   sets the CRF: a committed file stays under 50 MB, and CRF 29 lands at
   47.3 MB and SSIM Y 0.994 against the master. Re-cutting it means re-running
   steps 2-4 and this script, because every figure the sheet prints comes off
   the file it actually serves.

     ffmpeg -ss 90 -t 15 -i master.mp4 -ss 90 -t 15 -i out.mp4 \
       -lavfi "[0:v][1:v]ssim" -f null -
   ========================================================================= */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/reel-peaks.mjs <encoded.mp4> <peaks.json>');
  process.exit(1);
}

const SR = 8000;
const BIN_MS = 500;

const pcm = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', input, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
  { maxBuffer: 1 << 30 },
);
if (pcm.status !== 0) throw new Error(pcm.stderr.toString());

const buf = pcm.stdout;
const samples = buf.length >> 1;
const perBin = (SR * BIN_MS) / 1000;
const bins = Math.ceil(samples / perBin);
const raw = new Array(bins).fill(0);

for (let i = 0; i < samples; i++) {
  const v = Math.abs(buf.readInt16LE(i * 2));
  const b = Math.floor(i / perBin);
  if (v > raw[b]) raw[b] = v;
}

const maxAbs = Math.max(...raw);
const peaks = raw.map((v) => Math.round((v / maxAbs) * 100));

writeFileSync(output, JSON.stringify({ sr: SR, binMs: BIN_MS, bins, maxAbs, peaks }));
console.log(`bins=${bins} maxAbs=${maxAbs} seconds=${(samples / SR).toFixed(2)}`);
