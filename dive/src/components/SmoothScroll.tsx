import { useLayoutEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { registerLenis, scrollToPosition } from './scrollBus'

gsap.registerPlugin(ScrollTrigger)

/**
 * Global smooth scrolling.
 *
 * - Lenis is driven exclusively by GSAP's ticker (no second RAF loop).
 * - Lenis scroll events are forwarded to ScrollTrigger.update so every
 *   page-specific ScrollTrigger stays synchronized.
 * - Under prefers-reduced-motion Lenis is not created at all; native
 *   scrolling remains and ScrollTrigger listens to it directly.
 * - Keyboard scrolling and anchor navigation stay functional: Lenis
 *   virtualizes wheel and touch only.
 * - StrictMode-safe: setup and teardown are idempotent.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const location = useLocation()

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      registerLenis(null)
      return
    }

    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.12,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    })
    registerLenis(lenis)

    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      registerLenis(null)
    }
  }, [])

  // Reset scroll cleanly on route changes, then let triggers re-measure.
  useLayoutEffect(() => {
    scrollToPosition(0, { immediate: true })
    window.scrollTo(0, 0)
    ScrollTrigger.refresh()
  }, [location.pathname])

  return <>{children}</>
}
