import type Lenis from 'lenis'

/**
 * Minimal imperative scroll API shared between SmoothScroll (producer)
 * and consumers such as AutoTour and in-page anchor controls.
 * When Lenis is disabled (reduced motion), falls back to native scrolling.
 */

let lenis: Lenis | null = null

export function registerLenis(instance: Lenis | null) {
  lenis = instance
}

export function getScrollTop(): number {
  return lenis ? lenis.scroll : window.scrollY
}

export function getMaxScroll(): number {
  if (lenis) return lenis.limit
  return document.documentElement.scrollHeight - window.innerHeight
}

/** Jump or glide to an absolute document offset. */
export function scrollToPosition(y: number, opts?: { immediate?: boolean }) {
  if (lenis) {
    lenis.scrollTo(y, { immediate: opts?.immediate ?? false, force: true })
  } else {
    window.scrollTo({ top: y, behavior: opts?.immediate ? 'auto' : 'smooth' })
  }
}

/** Glide to an element (used by chapter navigation). */
export function scrollToElement(el: HTMLElement) {
  if (lenis) {
    lenis.scrollTo(el, { force: true })
  } else {
    el.scrollIntoView({ behavior: 'smooth' })
  }
}
