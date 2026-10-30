/* ============================================================================
   THE LAYLINE TAPE, locked facts for the E-02 record of demonstration.

   Every number here was measured from the encoded deliverable, not asserted:
   - duration / frames / fps / dimensions: ffprobe on tape-1080p60.mp4
     (x264 CRF 29, preset slow, 2 s GOP, faststart) cut from the 1080p60
     master. The master ran 16.9 Mbps; the deliverable runs 1.54 Mbps, so the
     file the reader streams is 47.3 MB against the master's 525.7 MB, at
     SSIM Y 0.994 against the master over a 15 s window at T+01:30.
   - The scrub sheet holds one real frame per 2 s of that same file, so a
     preview tile is a position lookup rather than a guess.
   - peaks.json is the deliverable's own audio, one peak bin per half second.
     scripts/reel-peaks.mjs cuts it, and carries the rest of the pipeline
     (encode, probe, poster, scrub sheet) in its header so every figure below
     can be measured again.

   THE TAPE IS SERVED FROM VERCEL BLOB, and the reason is a header. It shipped
   first as a GitHub release asset, which is free hosting with range requests
   intact and works in any browser that sniffs what it was handed. Measured,
   that response carries `Content-Type: application/octet-stream` and
   `Content-Disposition: attachment`: it is a download, not a video, and an
   engine that takes the declared type at its word has nothing to decode. The
   tape did nothing when tapped on a phone. It then lived in public/, which
   played, but every deployment stored its own 49.6 MB copy and production
   deployments are kept for days, so it ate the team's Deployment Storage.
   The Blob store `fullbuild-media` serves the same bytes (sha256 checked) as
   `Content-Type: video/mp4`, `Content-Disposition: inline`, with
   `206 Partial Content` on a range request and
   `Access-Control-Allow-Origin: *`. The player never reads pixels from the
   video, so a cross-origin source needs no crossorigin attribute.

   The sheet prints no station log yet: the tape's copy pass is a separate
   job, and a boundary nobody has read frame by frame would be a number on a
   drawing that nobody re-derived. tests/layline-vid.test.mjs holds every
   claim here to the data.
   ========================================================================= */

export const REEL = {
  /** Vercel Blob, which declares video/mp4 and serves ranges. See above. */
  src: 'https://p5kn0bl2lyy7d3zt.public.blob.vercel-storage.com/layline-vid/tape-1080p60-hObE2VxcrEzxmAbXo9tH554DP2BAtv.mp4',
  poster: '/layline-vid/poster.jpg',
  /** One 160x90 thumb per 2 s, 12 per row, cut from the deliverable. */
  sprites: '/layline-vid/scrub-sprites.jpg',
  spriteEvery: 2,
  spriteCols: 12,
  spriteCount: 129,
  spriteW: 160,
  spriteH: 90,
  /** ffprobe, container duration of the encoded file, seconds. */
  duration: 257.53,
  /** ffprobe, video stream frame count. */
  frames: 15450,
  /** Exactly 60/1, printed the way instruments print it. */
  fps: '60.00',
  width: 1920,
  height: 1080,
} as const;

/** Mono timecode, MM:SS. The tape is minutes long by design. */
export function timecode(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
