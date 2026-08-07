import { PROJECTS } from '@/lib/projects';

/* ============================================================================
   THE REEL — locked facts for the E-101 record of demonstration.

   Every number here was measured from the file itself, not asserted:
   - duration / frames / fps: ffprobe on the encoded deliverable
     (examples-reel-1080p.mp4, x264 CRF 23 from the 1080p60 master).
   - Station boundaries: read frame-by-frame from the ENCODED deliverable at
     1 s resolution (contact sheets + boundary strips, 2026-08-07), since that
     is the file the player seeks in. Good to ±1 s; each `at` lands on or just
     before the first frame of its station.
   - Titles / hrefs / the red gate: never restated by hand. Each station that
     documents a registry project carries its PROJECTS id, and title, href and
     `live` are READ from that entry, so this file cannot drift from the
     content gate. Stations without their own registry row (the prototype
     gallery, the Approved Works set) state their href locally with the
     registry id whose `live` flag gates their red.
   tests/examples-reel.test.mjs holds these claims to the data.
   ========================================================================= */

export const REEL = {
  /** Served as a GitHub release asset: free range-request hosting, no new infra. */
  src: 'https://github.com/ryanportfolio/fullbuild.ai/releases/download/media-examples-v1/examples-reel-1080p.mp4',
  poster: '/examples/poster.jpg',
  /** One 160x90 thumb per 5 s, 12 per row — generated from the same master. */
  sprites: '/examples/scrub-sprites.jpg',
  spriteEvery: 5,
  spriteCols: 12,
  spriteCount: 132,
  spriteW: 160,
  spriteH: 90,
  /** ffprobe, container duration of the encoded file, seconds. */
  duration: 658.31,
  /** ffprobe, video stream frame count. */
  frames: 39457,
  /** 60000/1001, printed the way instruments print it. */
  fps: '59.94',
  width: 1920,
  height: 1080,
} as const;

export interface ReelStation {
  /** Station number 1..10 — also the digit key that jumps to it. */
  n: number;
  /** Start, seconds into the reel. */
  at: number;
  title: string;
  href: string;
  /** true only when the gating registry entry is live — earns revision-red. */
  live: boolean;
}

interface StationSpec {
  at: number;
  /** PROJECTS id supplying title + href + live. */
  id: string;
  /** Local title/href for stations that are sections rather than registry rows. */
  title?: string;
  href?: string;
}

/* The gating id for a local-href station is the registry row whose liveness
   that section actually depends on: the prototype gallery ships inside
   fullbuild.ai, the Approved Works set inside corewise.academy. */
const SPEC: StationSpec[] = [
  { at: 0, id: 'corewise' },
  { at: 320, id: 'fullbuild-ai', title: 'The Working Set' },
  { at: 352.5, id: 'fullbuild-ai', title: 'Prototypes', href: 'https://fullbuild.ai/prototype' },
  { at: 403, id: 'agent-firmware' },
  { at: 419, id: 'truenote' },
  { at: 460, id: 'savetokens' },
  { at: 474, id: 'willaicite' },
  { at: 493, id: 'kinefractal' },
  { at: 555, id: 'corewise-academy' },
  {
    at: 609,
    id: 'corewise-academy',
    title: 'Approved Works · Set A',
    href: 'https://corewise.academy/how-its-built/',
  },
];

export const STATIONS: ReelStation[] = SPEC.map((s, i) => {
  const p = PROJECTS.find((x) => x.id === s.id);
  if (!p) throw new Error(`reel station references unknown project id: ${s.id}`);
  const href = s.href ?? p.href;
  if (!href) throw new Error(`reel station ${s.id} has no href`);
  return { n: i + 1, at: s.at, title: s.title ?? p.title, href, live: p.live };
});

/** Station under a given playback time. */
export function stationAt(t: number): ReelStation {
  let cur = STATIONS[0];
  for (const s of STATIONS) {
    if (t >= s.at) cur = s;
    else break;
  }
  return cur;
}

/** Mono timecode, MM:SS. The reel is under an hour by design. */
export function timecode(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
