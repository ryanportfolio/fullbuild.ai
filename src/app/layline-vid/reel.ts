/* ============================================================================
   THE LAYLINE TAPE, locked facts for the E-02 record of demonstration.

   Every number here was measured from the encoded deliverable, not asserted:
   - duration / frames / fps / dimensions: ffprobe on layline-1080p.mp4
     (x264 CRF 22, preset slow, 2 s GOP, faststart) cut from the 1080p60
     master. The master ran 16.9 Mbps; the deliverable runs 2.98 Mbps, so the
     file the reader streams is 91.5 MB against the master's 525.7 MB.
   - The scrub sheet holds one real frame per 2 s of that same file, so a
     preview tile is a position lookup rather than a guess.
   - peaks.json is the deliverable's own audio, one peak bin per half second.
     scripts/reel-peaks.mjs cuts it, and carries the rest of the pipeline
     (encode, probe, poster, scrub sheet) in its header so every figure below
     can be measured again.

   The sheet prints no station log yet: the tape's copy pass is a separate
   job, and a boundary nobody has read frame by frame would be a number on a
   drawing that nobody re-derived. tests/layline-vid.test.mjs holds every
   claim here to the data.
   ========================================================================= */

export const REEL = {
  /** Served as a GitHub release asset: free range-request hosting, no new infra. */
  src: 'https://github.com/ryanportfolio/fullbuild.ai/releases/download/media-layline-v1/layline-1080p.mp4',
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
