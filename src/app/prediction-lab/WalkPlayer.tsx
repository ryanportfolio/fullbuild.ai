'use client';

/* ============================================================================
   E-02 WALK PLAYER — the strip-chart transport, seated for the walkthrough.

   A page-local adaptation of the E-01 transport (deliberately not a shared
   abstraction: each exhibit owns its instrument). Same machinery contract:
   - The timeline is a strip chart of the recording's measured audio envelope
     (one peak bin per half second, computed offline from the encoded file —
     peaks.json). The pen carriage is GRAPHITE and the chart's only
     full-height stroke; chapter boundaries are short numbered edge ticks.
   - The not-yet-played envelope stands in the RULE token; the played reach
     re-inks to full graphite. No opacity on ink anywhere.
   - The per-frame loop writes DOM imperatively and ships the deterministic
     capture hook the site requires of every rAF loop:
     window.__walk = { freeze, thaw, step }.
   - No JS: the video ships with native controls and the chart chrome stays
     hidden; hydration removes `controls` and takes over in the same frame.
   Where E-01's station log cites external sites, this chapter log cites the
   walkthrough ledger below it: each row names the steps its chapter
   demonstrates, as in-page anchors. Red stays external and lives with the
   evidence links in the ledger, under the registry + probe law.
   ========================================================================= */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { WALK, CHAPTERS, chapterAt, timecode } from './walk';
import peaksData from './peaks.json';
import styles from './prediction-lab.module.css';

/* Chart geometry, viewBox units. One x-unit per peak bin keeps the drawing an
   unresampled plot of the data. */
const BINS = peaksData.peaks.length;
const CHART_H = 96;
const MID = CHART_H / 2;
const TICK_H = 13;
/* Envelope amplitude: headroom so the loudest bin never touches the frame. A
   silent bin still draws a 1-unit center hairline. */
const AMP = (CHART_H / 2 - 6) / 100;

function envelopePath(): string {
  const pts = peaksData.peaks as number[];
  let d = `M 0 ${MID - Math.max(1, pts[0] * AMP)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${i} ${(MID - Math.max(1, pts[i] * AMP)).toFixed(1)}`;
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    d += ` L ${i} ${(MID + Math.max(1, pts[i] * AMP)).toFixed(1)}`;
  }
  return d + ' Z';
}

const TOTAL_TC = timecode(WALK.duration);
const TOTAL_MINUTES = Math.floor(WALK.duration / 60);

export default function WalkPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);

  const [enhanced, setEnhanced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chapterN, setChapterN] = useState(1);
  const [preview, setPreview] = useState<{ x: number; t: number } | null>(null);

  const wavePath = useMemo(envelopePath, []);

  /* One authority for "the transport display shows time t". Called by the rAF
     loop, by seeks, and by the capture hook's step(). */
  const paint = useCallback((t: number) => {
    const x = (t / WALK.duration) * BINS;
    if (penRef.current) penRef.current.setAttribute('transform', `translate(${x} 0)`);
    if (clipRef.current) clipRef.current.setAttribute('width', String(x));
    if (tcRef.current) tcRef.current.textContent = `T+${timecode(t)} / ${TOTAL_TC}`;
    if (frameRef.current) {
      const frame = Math.min(Math.floor(t * 60), WALK.frames);
      frameRef.current.textContent = `FRAME ${frame.toLocaleString('en-US')} / ${WALK.frames.toLocaleString('en-US')}`;
    }
    if (rangeRef.current) {
      rangeRef.current.setAttribute(
        'aria-valuetext',
        `T+${timecode(t)} of ${TOTAL_TC} · chapter ${chapterAt(t).n}`,
      );
      if (document.activeElement !== rangeRef.current) {
        rangeRef.current.value = String(t);
      }
    }
    setChapterN((prev) => {
      const n = chapterAt(t).n;
      return prev === n ? prev : n;
    });
  }, []);

  /* Transport loop + capture hook. */
  useEffect(() => {
    setEnhanced(true);
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let frozen = false;

    const tick = () => {
      if (!frozen) {
        paint(video.currentTime);
        if (!video.paused && !video.ended) raf = requestAnimationFrame(tick);
        else raf = 0;
      }
    };
    const start = () => {
      setPlaying(true);
      if (!raf && !frozen) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      setPlaying(false);
      paint(video.currentTime);
    };
    const onSeek = () => paint(video.currentTime);

    video.addEventListener('play', start);
    video.addEventListener('pause', stop);
    video.addEventListener('ended', stop);
    video.addEventListener('seeked', onSeek);
    video.addEventListener('loadedmetadata', onSeek);

    window.__walk = {
      freeze: () => {
        frozen = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        video.pause();
      },
      thaw: () => {
        frozen = false;
        if (!video.paused) raf = requestAnimationFrame(tick);
      },
      step: (t: number) => {
        video.currentTime = t;
        paint(t);
      },
    };

    return () => {
      if (raf) cancelAnimationFrame(raf);
      video.removeEventListener('play', start);
      video.removeEventListener('pause', stop);
      video.removeEventListener('ended', stop);
      video.removeEventListener('seeked', onSeek);
      video.removeEventListener('loadedmetadata', onSeek);
      delete window.__walk;
    };
  }, [paint]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.min(Math.max(t, 0), WALK.duration - 0.05);
      paint(v.currentTime);
    },
    [paint],
  );

  const seekBy = useCallback(
    (d: number) => {
      const v = videoRef.current;
      if (v) seekTo(v.currentTime + d);
    },
    [seekTo],
  );

  const playChapter = useCallback(
    (n: number) => {
      const c = CHAPTERS.find((x) => x.n === n);
      if (!c) return;
      seekTo(c.at);
      void videoRef.current?.play();
    },
    [seekTo],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFull = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.();
  }, []);

  /* Bench keys, scoped to the player region; digits ride the chapter numbers
     (0 = chapter 10). Every key doubles a drawn control or a log row. */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'A') return;
      const onSlider = el === rangeRef.current;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          if (!onSlider) seekBy(-5);
          break;
        case 'ArrowRight':
          if (!onSlider) seekBy(5);
          break;
        case 'j':
          seekBy(-10);
          break;
        case 'l':
          seekBy(10);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFull();
          break;
        default: {
          if (/^[0-9]$/.test(e.key)) playChapter(e.key === '0' ? 10 : Number(e.key));
        }
      }
    },
    [toggle, seekBy, toggleMute, toggleFull, playChapter],
  );

  /* Scrub preview: pointer position -> time -> sprite tile. One real frame per
     2 s of the encode; the math is position, not guess. */
  const onChartMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    if (!chart || e.pointerType === 'touch') return;
    const rect = chart.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setPreview({ x: frac * rect.width, t: frac * WALK.duration });
  }, []);
  const onChartLeave = useCallback(() => setPreview(null), []);

  const previewChapter = preview ? chapterAt(preview.t) : null;
  const spriteIndex = preview
    ? Math.min(Math.floor(preview.t / WALK.spriteEvery), WALK.spriteCount - 1)
    : 0;

  return (
    <section
      ref={rootRef}
      className={styles.player}
      data-enhanced={enhanced ? 'true' : undefined}
      aria-label="Walkthrough reel · ten chapters"
      onKeyDown={onKeyDown}
    >
      <figure className={styles.stage}>
        <video
          ref={videoRef}
          className={styles.video}
          src={WALK.src}
          poster={WALK.poster}
          preload="metadata"
          playsInline
          controls={!enhanced}
          muted={muted}
          onClick={enhanced ? toggle : undefined}
          aria-label="Prediction Lab demonstration reel, ten chapters, 2 minutes 33 seconds"
        >
          The reel could not be embedded here. It is a plain MP4:{' '}
          <a href={WALK.src}>download prediction-lab-demo-1080p.mp4</a>
        </video>
        {enhanced && !playing ? (
          <span className={`${styles.playChip} u-mono`} aria-hidden="true">
            ▸ PLAY
          </span>
        ) : null}
        <figcaption className={`${styles.plate} u-mono`}>
          <span className={styles.plateSeg}>FIG 1</span>{' '}
          <span className={styles.plateSeg}>· SCREEN CAPTURE</span>{' '}
          <span className={styles.plateSeg}>
            · {WALK.width}×{WALK.height}
          </span>{' '}
          <span className={styles.plateSeg}>· {WALK.fps} FPS</span>{' '}
          <span className={styles.plateSeg}>
            · {WALK.frames.toLocaleString('en-US')} FRAMES
          </span>
        </figcaption>
      </figure>

      <div className={styles.chrome}>
        <div className={styles.deck}>
          <button
            type="button"
            className={styles.transport}
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {playing ? (
                <g fill="currentColor">
                  <rect x="4" y="3" width="4" height="14" />
                  <rect x="12" y="3" width="4" height="14" />
                </g>
              ) : (
                <path d="M5 3 L17 10 L5 17 Z" fill="currentColor" />
              )}
            </svg>
          </button>
          <span ref={tcRef} className={`${styles.timecode} u-mono`} aria-hidden="true">
            T+00:00 / {TOTAL_TC}
          </span>
          <span className={`${styles.chapterReadout} u-mono`}>
            CH {String(chapterN).padStart(2, '0')} ·{' '}
            {CHAPTERS[chapterN - 1].title.toUpperCase()}
          </span>
          <span ref={frameRef} className={`${styles.frameCount} u-mono`} aria-hidden="true">
            FRAME 0 / {WALK.frames.toLocaleString('en-US')}
          </span>
          <button
            type="button"
            className={styles.transport}
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 8 H7 L12 4 V16 L7 12 H3 Z" fill="currentColor" />
              {muted ? (
                <path d="M14 7 L18 13 M18 7 L14 13" stroke="currentColor" strokeWidth="1.6" />
              ) : (
                <path
                  d="M14 7 C15.8 8.5 15.8 11.5 14 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              )}
            </svg>
          </button>
          <button
            type="button"
            className={styles.transport}
            onClick={toggleFull}
            aria-label="Toggle fullscreen"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 7 V3 H7 M13 3 H17 V7 M17 13 V17 H13 M7 17 H3 V13" />
            </svg>
          </button>
        </div>

        <div className={styles.chartBlock}>
          <div className={styles.chapterRow}>
            {CHAPTERS.map((c, i) => (
              <button
                key={c.n}
                type="button"
                className={`${styles.chapterBtn} u-mono`}
                style={{ left: `${(c.at / WALK.duration) * 100}%` }}
                data-current={enhanced && chapterN === c.n ? 'true' : undefined}
                /* A callout whose boundary crowds the previous one drops to a
                   second ruling line, the way a drafter staggers dimension
                   text instead of overprinting it. Data-driven: under 4% of
                   the reel apart = crowded. */
                data-row={
                  i > 0 && (c.at - CHAPTERS[i - 1].at) / WALK.duration < 0.04 ? '1' : undefined
                }
                onClick={() => playChapter(c.n)}
                aria-label={`Play chapter ${c.n}, ${c.title}, at ${timecode(c.at)}`}
              >
                {String(c.n).padStart(2, '0')}
              </button>
            ))}
          </div>

          <div
            ref={chartRef}
            className={styles.chart}
            onPointerMove={onChartMove}
            onPointerLeave={onChartLeave}
          >
            <svg
              className={styles.wave}
              viewBox={`0 0 ${BINS} ${CHART_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <clipPath id="walk-played">
                  <rect ref={clipRef} x="0" y="0" width="0" height={CHART_H} />
                </clipPath>
              </defs>
              <line x1="0" y1={MID} x2={BINS} y2={MID} className={styles.waveBase} />
              <path d={wavePath} className={styles.waveRest} />
              <path d={wavePath} className={styles.waveInked} clipPath="url(#walk-played)" />
              {CHAPTERS.slice(1).map((c) => {
                const x = (c.at / WALK.duration) * BINS;
                return (
                  <line
                    key={c.n}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={TICK_H}
                    className={styles.chapterTick}
                  />
                );
              })}
              <g ref={penRef} className={styles.pen}>
                <line x1="0" y1="0" x2="0" y2={CHART_H} />
              </g>
            </svg>

            <input
              ref={rangeRef}
              type="range"
              className={styles.scrub}
              min="0"
              max={WALK.duration}
              step="1"
              defaultValue="0"
              aria-label="Seek"
              onInput={(e) => seekTo(Number(e.currentTarget.value))}
            />

            {preview && previewChapter ? (
              <div
                className={styles.previewCard}
                style={{ left: preview.x }}
                aria-hidden="true"
              >
                <div
                  className={styles.previewThumb}
                  style={{
                    backgroundImage: `url(${WALK.sprites})`,
                    backgroundPosition: `-${(spriteIndex % WALK.spriteCols) * WALK.spriteW}px -${
                      Math.floor(spriteIndex / WALK.spriteCols) * WALK.spriteH
                    }px`,
                  }}
                />
                <span className="u-mono">
                  T+{timecode(preview.t)} · CH {String(previewChapter.n).padStart(2, '0')}
                </span>
              </div>
            ) : null}
          </div>

          <div className={styles.ruler} aria-hidden="true">
            {Array.from({ length: TOTAL_MINUTES }, (_, i) => i + 1).map((m) => (
              <span
                key={m}
                className={styles.rulerTick}
                data-labeled="true"
                style={{ left: `${((m * 60) / WALK.duration) * 100}%` }}
              >
                T+{String(m).padStart(2, '0')}
              </span>
            ))}
          </div>
          <p className={`${styles.rulerScale} u-mono`} aria-hidden="true">
            AUDIO PEAK · 0.5 SEC / BIN
          </p>
        </div>
      </div>

      <details className={styles.logFold} open>
        <summary className={`${styles.logSummary} u-mono`}>CHAPTER LOG</summary>
        <ol className={styles.log} aria-label="Chapter log">
          {CHAPTERS.map((c) => (
            <li
              key={c.n}
              className={styles.logRow}
              data-current={enhanced && chapterN === c.n ? 'true' : undefined}
            >
              <span className={`${styles.logN} u-mono`}>{String(c.n).padStart(2, '0')}</span>
              <button
                type="button"
                className={styles.logSeek}
                onClick={() => {
                  rootRef.current?.scrollIntoView({ block: 'start' });
                  playChapter(c.n);
                }}
                aria-label={`Play chapter ${c.n}, ${c.title}, at ${timecode(c.at)}`}
              >
                <span className="u-mono">T+{timecode(c.at)}</span>
                <span className={styles.logTitle}>{c.title}</span>
              </button>
              <span className={styles.logCites}>
                {c.steps.map((id) => (
                  <a key={id} className={`${styles.logCite} u-mono`} href={`#${id.toLowerCase()}`}>
                    {id}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ol>
        <p className={`${styles.logNote} u-mono`}>
          EACH ROW CITES THE LEDGER STEPS ITS CHAPTER DEMONSTRATES
        </p>
      </details>
    </section>
  );
}

declare global {
  interface Window {
    __walk?: {
      freeze: () => void;
      thaw: () => void;
      step: (t: number) => void;
    };
  }
}
