'use client';

/* ============================================================================
   E-01 REEL PLAYER — the strip-chart transport.

   The reel is played on the bench, so its transport is drawn like the bench's
   own instruments: the timeline is a strip chart of the recording's measured
   audio envelope (one peak bin per half second, computed offline from the
   file itself — peaks.json), the playhead is the pen carriage riding the
   chart, and the stations are numbered top-edge ticks at the verified
   boundaries with a minute ruling below.

   Machinery notes, in contract order:
   - The pen is GRAPHITE, never red, and it is the only full-height stroke on
     the chart — station marks are short numbered edge ticks, so stylus and
     event marks can never read as the same line.
   - Red on this page is spent where the site always spends it: links that are
     live in production right now, gated by the registry `live` flag and
     de-ignited by the same /api/health probe the shipped sheet uses. The log
     prints the probe law so the red column reads as a record, not a theme.
   - The not-yet-played envelope stands in the RULE token (declared line ink,
     knowable contrast) and the played reach re-inks to full graphite. No
     opacity on ink anywhere.
   - The per-frame loop writes DOM imperatively (timecode text, frame counter,
     pen transform, re-ink clip) and ships the deterministic capture hook the
     site requires of every rAF loop: window.__reel = { freeze, thaw, step }.
   - No JS: the video ships with native controls and the chart chrome stays
     hidden; hydration removes `controls` and takes over in the same frame.
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
import { useHealthProbe } from '@/lib/health';
import { useWorkingSet } from '@/lib/store';
import { REEL, STATIONS, stationAt, timecode } from './reel';
import peaksData from './peaks.json';
import styles from './examples.module.css';

/* Chart geometry, viewBox units. One x-unit per peak bin keeps the drawing an
   unresampled plot of the data. */
const BINS = peaksData.peaks.length;
const CHART_H = 96;
const MID = CHART_H / 2;
/* Station boundary marks: short registration ticks at the top edge, NOT
   full-height rules — the pen owns full height alone. */
const TICK_H = 13;
/* Envelope amplitude: leave headroom so the loudest bin never touches the
   frame. A silent bin still draws a 1-unit center hairline (a chart at rest
   shows its baseline; an empty gap would read as missing paper). */
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

const TOTAL_TC = timecode(REEL.duration);
const TOTAL_MINUTES = Math.floor(REEL.duration / 60);

export default function ReelPlayer() {
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
  const [stationN, setStationN] = useState(1);
  const [preview, setPreview] = useState<{ x: number; t: number } | null>(null);

  useHealthProbe();
  const health = useWorkingSet((s) => s.health);

  const wavePath = useMemo(envelopePath, []);

  /* One authority for "the transport display shows time t". Called by the rAF
     loop, by seeks, and by the capture hook's step() — so a frozen frame and a
     live frame are produced by the same code path. */
  const paint = useCallback((t: number) => {
    const x = (t / REEL.duration) * BINS;
    if (penRef.current) penRef.current.setAttribute('transform', `translate(${x} 0)`);
    if (clipRef.current) clipRef.current.setAttribute('width', String(x));
    if (tcRef.current) tcRef.current.textContent = `T+${timecode(t)} / ${TOTAL_TC}`;
    if (frameRef.current) {
      const frame = Math.min(Math.floor((t * 60000) / 1001), REEL.frames);
      frameRef.current.textContent = `FRAME ${frame.toLocaleString('en-US')} / ${REEL.frames.toLocaleString('en-US')}`;
    }
    if (rangeRef.current) {
      rangeRef.current.setAttribute(
        'aria-valuetext',
        `T+${timecode(t)} of ${TOTAL_TC} · station ${stationAt(t).n}`,
      );
      if (document.activeElement !== rangeRef.current) {
        rangeRef.current.value = String(t);
      }
    }
    setStationN((prev) => {
      const n = stationAt(t).n;
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

    window.__reel = {
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
      delete window.__reel;
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
      v.currentTime = Math.min(Math.max(t, 0), REEL.duration - 0.05);
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

  const playStation = useCallback(
    (n: number) => {
      const s = STATIONS.find((x) => x.n === n);
      if (!s) return;
      seekTo(s.at);
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

  /* Bench keys. Scoped to the player region; digits ride the station numbers
     (0 = station 10). Arrow keys are left to the chart slider's native
     handling when it holds focus. */
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
          if (/^[0-9]$/.test(e.key)) playStation(e.key === '0' ? 10 : Number(e.key));
        }
      }
    },
    [toggle, seekBy, toggleMute, toggleFull, playStation],
  );

  /* Scrub preview: pointer position -> time -> sprite tile. The sheet holds
     one real frame per 5 s of the master; the math is position, not guess. */
  const onChartMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    if (!chart || e.pointerType === 'touch') return;
    const rect = chart.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setPreview({ x: frac * rect.width, t: frac * REEL.duration });
  }, []);
  const onChartLeave = useCallback(() => setPreview(null), []);

  const previewStation = preview ? stationAt(preview.t) : null;
  const spriteIndex = preview
    ? Math.min(Math.floor(preview.t / REEL.spriteEvery), REEL.spriteCount - 1)
    : 0;

  /* The red audit: which station rows currently hold an actual probe reading,
     and how many of those read up. Absent readings stay assume-live (the
     probe's own law) but are never counted as confirmations. */
  const probed = STATIONS.filter((s) => health[s.href] !== undefined);
  const probedUp = probed.filter((s) => health[s.href].up);

  return (
    <section
      ref={rootRef}
      className={styles.player}
      data-enhanced={enhanced ? 'true' : undefined}
      aria-label="Reel player · ten stations"
      /* The bench keys are unlabelled on the sheet by choice: every one of
         them has a drawn control or a log row that does the same job, so the
         keyboard is a shortcut over visible affordances, not a hidden API. */
      onKeyDown={onKeyDown}
    >
      <figure className={styles.stage}>
        <video
          ref={videoRef}
          className={styles.video}
          src={REEL.src}
          poster={REEL.poster}
          preload="metadata"
          playsInline
          controls={!enhanced}
          muted={muted}
          onClick={enhanced ? toggle : undefined}
          aria-label="Demonstration reel, ten stations, 10 minutes 58 seconds"
        >
          The reel could not be embedded here. It is a plain MP4:{' '}
          <a href={REEL.src}>download examples-reel-1080p.mp4</a>
        </video>
        {enhanced && !playing ? (
          <span className={`${styles.playChip} u-mono`} aria-hidden="true">
            ▸ PLAY
          </span>
        ) : null}
        <figcaption className={`${styles.plate} u-mono`}>
          {/* each fact is an unbreakable group; the spaces BETWEEN spans are
              the only break opportunities, so a wrap never strands a separator
              or splits a value from its unit */}
          <span className={styles.plateSeg}>FIG 1</span>{' '}
          <span className={styles.plateSeg}>· SCREEN CAPTURE</span>{' '}
          <span className={styles.plateSeg}>
            · {REEL.width}×{REEL.height}
          </span>{' '}
          <span className={styles.plateSeg}>· {REEL.fps} FPS</span>{' '}
          <span className={styles.plateSeg}>
            · {REEL.frames.toLocaleString('en-US')} FRAMES
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
            {/* drawn marks: feed triangle / hold bars */}
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
          <span className={`${styles.stationReadout} u-mono`}>
            STA {String(stationN).padStart(2, '0')} ·{' '}
            {STATIONS[stationN - 1].title.toUpperCase()}
          </span>
          <span ref={frameRef} className={`${styles.frameCount} u-mono`} aria-hidden="true">
            FRAME 0 / {REEL.frames.toLocaleString('en-US')}
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
          {/* Station callouts: the chart's own grid references, one per
              verified boundary, clickable like the log rows they cite. */}
          <div className={styles.stationRow}>
            {STATIONS.map((s) => (
              <button
                key={s.n}
                type="button"
                className={`${styles.stationBtn} u-mono`}
                style={{ left: `${(s.at / REEL.duration) * 100}%` }}
                data-current={enhanced && stationN === s.n ? 'true' : undefined}
                onClick={() => playStation(s.n)}
                aria-label={`Play station ${s.n}, ${s.title}, at ${timecode(s.at)}`}
              >
                {String(s.n).padStart(2, '0')}
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
                <clipPath id="reel-played">
                  <rect ref={clipRef} x="0" y="0" width="0" height={CHART_H} />
                </clipPath>
              </defs>
              {/* the chart's own frame line */}
              <line x1="0" y1={MID} x2={BINS} y2={MID} className={styles.waveBase} />
              {/* full envelope standing in the rule ink, played reach re-inked */}
              <path d={wavePath} className={styles.waveRest} />
              <path d={wavePath} className={styles.waveInked} clipPath="url(#reel-played)" />
              {/* station registration ticks, top edge only — the pen alone
                  runs full height */}
              {STATIONS.slice(1).map((s) => {
                const x = (s.at / REEL.duration) * BINS;
                return (
                  <line
                    key={s.n}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={TICK_H}
                    className={styles.stationTick}
                  />
                );
              })}
              {/* the pen carriage: nib + full-height stroke */}
              <g ref={penRef} className={styles.pen}>
                <line x1="0" y1="0" x2="0" y2={CHART_H} />
              </g>
            </svg>

            <input
              ref={rangeRef}
              type="range"
              className={styles.scrub}
              min="0"
              max={REEL.duration}
              step="1"
              defaultValue="0"
              aria-label="Seek"
              onInput={(e) => seekTo(Number(e.currentTarget.value))}
            />

            {preview && previewStation ? (
              <div
                className={styles.previewCard}
                style={{ left: preview.x }}
                aria-hidden="true"
              >
                <div
                  className={styles.previewThumb}
                  style={{
                    backgroundImage: `url(${REEL.sprites})`,
                    backgroundPosition: `-${(spriteIndex % REEL.spriteCols) * REEL.spriteW}px -${
                      Math.floor(spriteIndex / REEL.spriteCols) * REEL.spriteH
                    }px`,
                  }}
                />
                <span className="u-mono">
                  T+{timecode(preview.t)} · STA {String(previewStation.n).padStart(2, '0')}
                </span>
              </div>
            ) : null}
          </div>

          {/* Minute ruling + the plot's scale, in the measured voice. The
              scale note stands on its own line below the ruling so it can
              never overprint a minute label at any width. */}
          <div className={styles.ruler} aria-hidden="true">
            {Array.from({ length: TOTAL_MINUTES }, (_, i) => i + 1).map((m) => (
              <span
                key={m}
                className={styles.rulerTick}
                data-labeled={m % 2 === 0 ? 'true' : undefined}
                style={{ left: `${((m * 60) / REEL.duration) * 100}%` }}
              >
                {m % 2 === 0 ? `T+${String(m).padStart(2, '0')}` : ''}
              </span>
            ))}
          </div>
          <p className={`${styles.rulerScale} u-mono`} aria-hidden="true">
            AUDIO PEAK · 0.5 SEC / BIN
          </p>
        </div>

      </div>

      <details className={styles.logFold}>
        <summary className={`${styles.logSummary} u-mono`}>STATION LOG</summary>
        <ol className={styles.log} aria-label="Station log">
        {STATIONS.map((s) => {
          const reading = health[s.href];
          const ignited = s.live && (reading ? reading.up : true);
          return (
            <li
              key={s.n}
              className={styles.logRow}
              data-current={enhanced && stationN === s.n ? 'true' : undefined}
            >
              <span className={`${styles.logN} u-mono`}>{String(s.n).padStart(2, '0')}</span>
              <button
                type="button"
                className={styles.logSeek}
                onClick={() => {
                  rootRef.current?.scrollIntoView({ block: 'start' });
                  playStation(s.n);
                }}
                aria-label={`Play station ${s.n}, ${s.title}, at ${timecode(s.at)}`}
              >
                <span className="u-mono">T+{timecode(s.at)}</span>
                <span className={styles.logTitle}>{s.title}</span>
              </button>
              <a
                className={`${styles.logHref} u-mono`}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                data-live={ignited ? 'true' : undefined}
              >
                {s.href.replace(/^https:\/\//, '').replace(/\/$/, '')}
              </a>
            </li>
          );
        })}
        </ol>
        <p className={`${styles.probeNote} u-mono`}>
          RED = LIVE IN PRODUCTION · PROBED EVERY 60 SEC
          {probed.length > 0 ? ` · ${probedUp.length}/${probed.length} CONFIRMED UP` : ''}
        </p>
      </details>
    </section>
  );
}

declare global {
  interface Window {
    __reel?: {
      freeze: () => void;
      thaw: () => void;
      step: (t: number) => void;
    };
  }
}
