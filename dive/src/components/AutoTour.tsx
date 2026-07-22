import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { getMaxScroll, getScrollTop, scrollToPosition } from './scrollBus'

/** Full-page tour durations in seconds, normalized to document height. */
const TOUR_DURATION_1X = 20
const TOUR_DURATION_2X = 10

type TourState = 'idle' | 'running' | 'paused' | 'done'

/**
 * Minimal fixed Auto Tour control.
 * - A single linear GSAP tween drives the Lenis scrolling API.
 * - Any manual scroll intent (wheel, touch, drag outside the control,
 *   scroll keys) pauses the tour. Escape stops it in place.
 * - Progress updates avoid React re-renders: percentage is written
 *   directly to a DOM node and a CSS custom property via refs.
 */
export default function AutoTour() {
  const [state, setState] = useState<TourState>('idle')
  const [speed, setSpeed] = useState<1 | 2>(1)
  const [started, setStarted] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const liveRef = useRef<HTMLSpanElement>(null)
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const proxyRef = useRef({ p: 0 })
  const stateRef = useRef<TourState>('idle')
  const speedRef = useRef<1 | 2>(1)
  stateRef.current = state
  speedRef.current = speed

  const writeProgress = (p: number) => {
    const pct = Math.round(p * 100)
    if (pctRef.current) pctRef.current.textContent = `${pct}%`
    rootRef.current?.style.setProperty('--tour-p', String(p))
    // React bails out when the value is unchanged, so this cannot
    // trigger a re-render on every frame.
    setStarted(p > 0.02)
  }

  const killTween = () => {
    tweenRef.current?.kill()
    tweenRef.current = null
  }

  const launch = (fromP: number) => {
    killTween()
    const max = getMaxScroll()
    const total = speedRef.current === 1 ? TOUR_DURATION_1X : TOUR_DURATION_2X
    proxyRef.current.p = fromP
    tweenRef.current = gsap.to(proxyRef.current, {
      p: 1,
      duration: total * (1 - fromP),
      ease: 'none',
      onUpdate: () => {
        scrollToPosition(proxyRef.current.p * max, { immediate: true })
        writeProgress(proxyRef.current.p)
      },
      onComplete: () => {
        setState('done')
        if (liveRef.current) liveRef.current.textContent = 'Tour complete'
      },
    })
    setState('running')
    if (liveRef.current) liveRef.current.textContent = 'Tour running'
  }

  const currentP = () => {
    const max = getMaxScroll()
    return max > 0 ? Math.min(1, getScrollTop() / max) : 0
  }

  const onMain = () => {
    if (stateRef.current === 'running') {
      killTween()
      setState('paused')
      if (liveRef.current) liveRef.current.textContent = 'Tour paused'
    } else if (stateRef.current === 'done') {
      scrollToPosition(0, { immediate: true })
      writeProgress(0)
      launch(0)
    } else {
      launch(stateRef.current === 'paused' ? currentP() : 0)
    }
  }

  const onRestart = () => {
    scrollToPosition(0, { immediate: true })
    writeProgress(0)
    launch(0)
  }

  const onSpeed = (s: 1 | 2) => {
    setSpeed(s)
    speedRef.current = s
    if (stateRef.current === 'running') launch(currentP())
  }

  /* Manual input pauses; Escape stops without resetting position. */
  useEffect(() => {
    const pause = () => {
      if (stateRef.current !== 'running') return
      killTween()
      setState('paused')
      if (liveRef.current) liveRef.current.textContent = 'Tour paused'
    }
    const onWheel = () => pause()
    const onTouch = () => pause()
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      pause()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stateRef.current === 'running' || stateRef.current === 'paused') {
          killTween()
          setState('idle')
          if (liveRef.current) liveRef.current.textContent = 'Tour stopped'
        }
        return
      }
      const scrollKeys = [
        'PageUp',
        'PageDown',
        'Home',
        'End',
        ' ',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ]
      if (scrollKeys.includes(e.key)) pause()
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
      killTween() // route changes kill all active tweens
    }
  }, [])

  const mainLabel =
    state === 'running' ? 'Pause' : state === 'paused' ? 'Resume' : state === 'done' ? 'Replay' : 'Start Tour'
  const MainIcon = state === 'running' ? Pause : Play

  return (
    <div
      ref={rootRef}
      className="fixed right-4 bottom-4 z-40 flex items-center gap-1 rounded-full border border-white/10 bg-void/70 px-2 py-1.5 font-mono text-[11px] tracking-wider text-bone backdrop-blur-sm select-none"
      role="group"
      aria-label="Auto tour"
    >
      <span ref={liveRef} className="sr-only" aria-live="polite" />
      <button
        type="button"
        onClick={onMain}
        className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors hover:bg-white/10"
        aria-label={mainLabel}
      >
        <MainIcon size={11} aria-hidden="true" />
        {mainLabel}
      </button>
      <span ref={pctRef} className="w-9 text-center text-dim" aria-hidden="true">
        0%
      </span>
      {started && (
        <button
          type="button"
          onClick={onRestart}
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-dim transition-colors hover:bg-white/10 hover:text-bone"
          aria-label="Restart tour"
        >
          <RotateCcw size={11} aria-hidden="true" />
        </button>
      )}
      <div className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={() => onSpeed(speed === 1 ? 2 : 1)}
        className="cursor-pointer rounded-full px-2 py-1 transition-colors hover:bg-white/10"
        aria-label={`Playback speed ${speed}x, press to switch`}
        aria-pressed={speed === 2}
      >
        {speed}x
      </button>
    </div>
  )
}
