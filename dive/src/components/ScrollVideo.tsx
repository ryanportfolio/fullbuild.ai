import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ------------------------------------------------------------------ */
/* Tuning constants (documented, all in one place)                     */
/* ------------------------------------------------------------------ */

/** Exponential damping rate for the eased playhead. Higher = snappier.
 *  Applied frame-rate independently: alpha = 1 - exp(-DAMPING * dt). */
const DAMPING = 6.5

/** Minimum difference (seconds) between the eased playhead and the
 *  video's currentTime before a new seek is issued. Prevents flooding
 *  the decoder with sub-frame seeks. One frame at 60fps = 0.0167s. */
const MIN_SEEK_DELTA = 0.02

/** Snap threshold: when the playhead is this close to the target we
 *  stop easing and settle exactly, avoiding endless micro-seeks. */
const SETTLE_EPSILON = 0.004

/** Maximum parallax translation in px at the viewport edge. */
const PARALLAX_SHIFT = 14

/** Scale applied to the video so parallax never reveals edges. */
const PARALLAX_SCALE = 1.045

/* ------------------------------------------------------------------ */

type MediaState = 'loading' | 'ready' | 'error'

/**
 * Production scroll-scrubbed video background.
 *
 * Seek discipline:
 * - ScrollTrigger only writes a target time.
 * - One RAF loop eases an internal playhead toward the target with
 *   frame-rate-independent exponential damping.
 * - A new seek is never issued while the decoder is mid-seek; while
 *   seeking, only the newest requested value is retained and drained
 *   through the `seeked` event. The queue depth is therefore always <= 1,
 *   and stale values can never rewind the film.
 * - requestVideoFrameCallback, where available, confirms the presented
 *   frame before the seeking flag is released, which keeps Safari's
 *   decoder from being re-entered early.
 */
export default function ScrollVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [media, setMedia] = useState<MediaState>('loading')
  const [buffered, setBuffered] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    const frame = frameRef.current
    if (!video || !frame) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let duration = 0
    let target = 0
    let playhead = 0
    let seeking = false
    let pendingSeek: number | null = null
    let rafId = 0
    let lastTs = 0
    let disposed = false

    const hasRVFC = 'requestVideoFrameCallback' in video

    const releaseSeek = () => {
      if (disposed) return
      seeking = false
      if (pendingSeek !== null) {
        const next = pendingSeek
        pendingSeek = null
        issueSeek(next)
      }
    }

    const issueSeek = (t: number) => {
      if (disposed || duration === 0) return
      if (seeking) {
        // Retain only the newest requested target.
        pendingSeek = t
        return
      }
      seeking = true
      video.currentTime = t
      if (hasRVFC) {
        // Confirm the frame actually presented before allowing the next seek.
        ;(video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number
        }).requestVideoFrameCallback(releaseSeek)
      }
    }

    const onSeeked = () => {
      if (!hasRVFC) releaseSeek()
    }

    const onMeta = () => {
      duration = video.duration || 0
      setMedia('ready')
    }
    const onProgress = () => {
      if (!video.duration) return
      const ranges = video.buffered
      if (ranges.length === 0) return
      setBuffered(Math.min(1, ranges.end(ranges.length - 1) / video.duration))
    }
    const onError = () => setMedia('error')

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('progress', onProgress)
    video.addEventListener('error', onError)
    video.addEventListener('seeked', onSeeked)
    if (video.readyState >= 1) onMeta()

    const trigger = ScrollTrigger.create({
      start: 0,
      end: () => ScrollTrigger.maxScroll(window),
      onUpdate: (self) => {
        // Only ever set a target; the RAF loop owns the decoder.
        target = self.progress * duration
      },
    })

    const loop = (ts: number) => {
      rafId = requestAnimationFrame(loop)
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 1 / 60
      lastTs = ts
      if (duration === 0) return

      if (reduced) {
        playhead = target
      } else {
        const alpha = 1 - Math.exp(-DAMPING * dt)
        playhead += (target - playhead) * alpha
        if (Math.abs(target - playhead) < SETTLE_EPSILON) playhead = target
      }

      if (Math.abs(playhead - video.currentTime) > MIN_SEEK_DELTA) {
        issueSeek(playhead)
      }
    }
    rafId = requestAnimationFrame(loop)

    /* Desktop-only mouse parallax; disabled for touch and reduced motion. */
    const fine = window.matchMedia('(pointer: fine)').matches
    let quickX: ((v: number) => void) | null = null
    let quickY: ((v: number) => void) | null = null
    const onPointer = (e: PointerEvent) => {
      if (!quickX || !quickY) return
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      quickX(-nx * PARALLAX_SHIFT)
      quickY(-ny * PARALLAX_SHIFT)
    }
    if (fine && !reduced) {
      gsap.set(frame, { scale: PARALLAX_SCALE })
      quickX = gsap.quickTo(frame, 'x', { duration: 0.9, ease: 'power2.out' })
      quickY = gsap.quickTo(frame, 'y', { duration: 0.9, ease: 'power2.out' })
      window.addEventListener('pointermove', onPointer)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      trigger.kill()
      window.removeEventListener('pointermove', onPointer)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('error', onError)
      video.removeEventListener('seeked', onSeeked)
      // Intentionally do NOT clear video.src: StrictMode remounts reuse
      // the same element and stripping src forces a full re-fetch.
    }
  }, [src])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-void" aria-hidden="true">
      <div ref={frameRef} className="absolute inset-0">
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
        />
      </div>

      {/* Restrained loading overlay with buffered progress */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-void transition-opacity duration-700 ${
          media === 'loading' ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="w-40">
          <p className="mb-3 text-center font-mono text-[10px] tracking-[0.3em] text-dim uppercase">
            Loading film
          </p>
          <div className="h-px w-full bg-white/10">
            <div
              className="h-px bg-amber transition-[width] duration-300"
              style={{ width: `${Math.round(buffered * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {media === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-void">
          <p className="font-mono text-xs tracking-widest text-dim">
            The film failed to load. Refresh to try again.
          </p>
        </div>
      )}
    </div>
  )
}
