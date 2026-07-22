import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy } from 'lucide-react'

const VIDEO_FILENAME = 'dive.mp4'

const CONCEPT = `A single continuous scale dive built as three chained image-to-video segments (Seedance 2.0, first-frame to last-frame): a glowing night city grid seen from above dives down until the street grid seamlessly becomes the copper interconnect grid of a silicon chip; the camera plunges into a via shaft, falling past copper and silicon strata to a single transistor gate gathering violet charge; it then pushes through into the silicon crystal lattice, a cubic grid of atoms receding like city blocks at night, arriving at one atom glowing warm amber like a lone lit window, with blurred city towers visible beyond the lattice so the end rhymes with the beginning. Palette: near-black, amber, cyan, copper, ultraviolet. Photorealistic, constant forward velocity, no cuts.`

const BRAND_BRIEF = `Brand: SUBSTRATE, a vertically integrated inference-silicon company.
Offering: the S1 inference cloud, capacity reserved per teratoken, first allocation Q4 2026.
Conversion goal: qualified allocation requests via a single email field.
Hero: "Compute, all the way down" / subcopy framing the film as one continuous descent through the S1 die / CTA "Reserve capacity".
Chapters: 01 Orbit (10^+4 m, workloads behave like cities), 02 Interconnect (10^-6 m, the metaphor becomes literal), 03 Descent (10^-7 m, twelve metal layers), 04 Gate (10^-9 m, the decision itself, interactive gate-drive slider), 05 Lattice (10^-10 m, order is the product), then the commercial allocation section.
Navigation: a fixed vertical scale ladder of logarithmic depth markers (10^+4 to 10^-10 m) that doubles as chapter navigation, plus a live depth readout in the header.
Palette: void #05070a, bone #e8e4dc, dim #8b93a1, amber #f5a623, ember #ffb84d, copper #c87533, cyan #3ecfdf, violet #8b5cf6. Chapter-scoped accent shifts.
Type: system sans for editorial voice, ui-monospace stack for every instrument, readout and label.
Signature motion: scroll-scrubbed film with damped playhead, split-line headline reveals, SVG leader lines drawing in, live counters (altitude, metal layer, depth exponent), chapter accent palette shifts, via-fill progress in the metal stack diagram, CSS electron pulses in the gate diagram.
Climax: the lattice chapter closes the visual loop (the lone amber atom is the first frame's city window) and hands off to the allocation form.`

const RECONSTRUCTION_PROMPT = `VIDEO_FILENAME: ${VIDEO_FILENAME}

CONCEPT:
${CONCEPT}

You are the sole creative director and senior frontend author for a premium, scroll-driven commercial landing page.

Using the VIDEO_FILENAME and CONCEPT above, design and build one complete production website around the supplied video. Do not ask follow-up questions. Infer an exceptional brand, commercial purpose, visual identity, narrative, copy and interaction system from the concept. The result should feel like an award-winning commercial microsite: highly animated and cinematic, but grounded, legible, commercially plausible and usable. This is ONE website, not a portfolio.

MEDIA
The video exists at /public/media/${VIDEO_FILENAME} and is referenced as /media/${VIDEO_FILENAME}. Do not generate, replace, modify or interpolate it. Read its real duration from loadedmetadata instead of hardcoding a number.

STACK
React 19, TypeScript, Vite, Tailwind CSS v4 via @tailwindcss/vite, GSAP with ScrollTrigger, Lenis smooth scrolling, react-router-dom with BrowserRouter, lucide-react, native HTML video. No canvas-based video rendering.

ROUTES
"/" is the complete experience. "/prompt" is this archive: original filename and concept, the brand and art-direction brief, the video path, this reconstruction prompt, stack and architecture notes, a working Copy Prompt button, and a link back to the experience.

BRAND AND ART DIRECTION (derived, expressed in the implementation)
${BRAND_BRIEF}

SCROLL VIDEO ENGINE (src/components/ScrollVideo.tsx)
Native fixed full-viewport video, object-fit cover, muted, playsInline, preload auto, disablePictureInPicture. Read duration on loadedmetadata. A document-spanning ScrollTrigger writes only a target time. One requestAnimationFrame loop eases an internal playhead toward the target with frame-rate-independent exponential damping (alpha = 1 - exp(-DAMPING * dt), DAMPING 6.5, MIN_SEEK_DELTA 0.02s, SETTLE_EPSILON 0.004s). Never seek while the decoder is seeking; retain only the newest requested target and drain it through seeked; use requestVideoFrameCallback where available to confirm the presented frame before releasing the seeking flag; the pending queue depth is never greater than one, so stale values cannot rewind the film. Restrained loading overlay with buffered progress, graceful error state, StrictMode-safe cleanup that never removes the video src, desktop-only mouse parallax (scale 1.045, max shift 14px) disabled for touch and prefers-reduced-motion. The scrub asset itself is encoded all-intra (every frame a keyframe) so currentTime seeks resolve within a frame.

SMOOTH SCROLLING (src/components/SmoothScroll.tsx)
Lenis with autoRaf false, driven exclusively from GSAP's ticker (no second RAF loop); lenis scroll events forwarded to ScrollTrigger.update; lagSmoothing(0). Under prefers-reduced-motion Lenis is not created and native scrolling remains. Route changes reset scroll to top immediately and refresh ScrollTrigger. A small module (scrollBus.ts) exposes registerLenis, getScrollTop, getMaxScroll, scrollToPosition and scrollToElement as the imperative API shared with Auto Tour and navigation.

AUTO TOUR (src/components/AutoTour.tsx)
Fixed control on "/" only. States: Start Tour, Pause, Resume, Replay, with live percentage, a Restart button once progress exceeds 2%, and a 1x / 2x toggle where 1x completes the page in exactly 20 seconds and 2x in 10, normalized to document height, via a single linear GSAP tween driving the Lenis API with immediate scrolls. Wheel, touch, pointer drags outside the control and the PageUp / PageDown / Home / End / Space / arrow keys pause it; Escape stops it without moving the user; route changes kill the tween. Progress updates write to refs and a CSS custom property, never per-frame React state; aria-live status and visible focus included.

EXPERIENCE (src/experience/Experience.tsx + Experience.css)
Header with wordmark, live depth readout stepping through logarithmic exponents, Prompt archive link, Reserve capacity button. Fixed left scale-ladder navigation (desktop) with active-chapter highlighting, chapter accent palette on a data-chapter attribute, split-line reveals, data-reveal fade-rises, SVG leader lines drawn by strokeDashoffset, an altitude counter (12,400 m to 800 m across Orbit), a twelve-layer metal-stack SVG whose via fills with scroll while a readout counts M12 down to M1, an interactive gate-drive slider (400 to 900 mV, threshold 550 mV) animating CSS electron pulses and updating illustrative switch-energy and channel readouts, a lattice chapter closing the visual loop, and a commercial allocation section with a three-item spec list, an email form that confirms locally, honest fine print, a Prompt archive link and a return-to-top control. All GSAP work is scoped in gsap.context inside useLayoutEffect and reverted on unmount.

QUALITY BARS
Semantic HTML, keyboard-operable controls, visible focus, aria labels, decorative SVG hidden from assistive tech, reduced-motion respected everywhere, no horizontal overflow, no lorem ipsum, no generic SaaS sections, the film remains the primary visual anchor, npm run build passes with zero TypeScript errors.`

export default function PromptArchive() {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(RECONSTRUCTION_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable; selection fallback is manual */
    }
  }

  return (
    <div className="min-h-screen bg-void px-5 py-16 text-bone md:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-12 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-dim uppercase transition-colors hover:text-bone"
        >
          <ArrowLeft size={12} aria-hidden="true" /> Back to the experience
        </Link>

        <p className="font-mono text-[11px] tracking-[0.3em] text-amber uppercase">Substrate / prompt archive</p>
        <h1 className="mt-3 mb-10 text-3xl font-semibold tracking-tight md:text-4xl">
          Reconstruction prompt
        </h1>

        <dl className="mb-10 grid grid-cols-1 gap-x-10 gap-y-4 border-y border-white/10 py-6 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Video file</dt>
            <dd className="mt-1 font-mono text-sm">{VIDEO_FILENAME}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Served from</dt>
            <dd className="mt-1 font-mono text-sm">/media/{VIDEO_FILENAME}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Stack</dt>
            <dd className="mt-1 font-mono text-sm">React 19, Vite, Tailwind v4, GSAP, Lenis</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Routes</dt>
            <dd className="mt-1 font-mono text-sm">/ and /prompt</dd>
          </div>
        </dl>

        <h2 className="mb-3 font-mono text-[11px] tracking-[0.24em] text-dim uppercase">Original concept</h2>
        <p className="mb-10 text-sm leading-relaxed text-bone/80">{CONCEPT}</p>

        <h2 className="mb-3 font-mono text-[11px] tracking-[0.24em] text-dim uppercase">Brand and art direction</h2>
        <pre className="mb-10 overflow-x-auto text-[13px] leading-relaxed whitespace-pre-wrap text-bone/80">
          {BRAND_BRIEF}
        </pre>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] tracking-[0.24em] text-dim uppercase">Complete reconstruction prompt</h2>
          <button
            type="button"
            onClick={onCopy}
            className="flex cursor-pointer items-center gap-2 border border-white/20 px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors hover:border-amber hover:text-amber"
          >
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
        <pre className="overflow-x-auto border border-white/10 bg-ink/60 p-5 text-[12px] leading-relaxed whitespace-pre-wrap text-bone/85">
          {RECONSTRUCTION_PROMPT}
        </pre>

        <Link
          to="/"
          className="mt-12 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-dim uppercase transition-colors hover:text-bone"
        >
          <ArrowLeft size={12} aria-hidden="true" /> Back to the experience
        </Link>
      </div>
    </div>
  )
}
