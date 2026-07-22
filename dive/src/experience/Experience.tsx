import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowDown, ArrowUpRight, CornerLeftUp } from 'lucide-react'
import { scrollToElement, scrollToPosition } from '../components/scrollBus'
import './Experience.css'

gsap.registerPlugin(ScrollTrigger)

/* ------------------------------------------------------------------ */
/* Chapter model: one entry per stage of the film                      */
/* ------------------------------------------------------------------ */

const CHAPTERS = [
  { id: 'orbit', label: 'Orbit', exponent: '+4' },
  { id: 'interconnect', label: 'Interconnect', exponent: '-6' },
  { id: 'descent', label: 'Descent', exponent: '-7' },
  { id: 'gate', label: 'Gate', exponent: '-9' },
  { id: 'lattice', label: 'Lattice', exponent: '-10' },
] as const

type ChapterId = (typeof CHAPTERS)[number]['id']

/** Depth readout steps shown in the header as the page scrubs. */
const DEPTH_STEPS = ['+4', '+2', '0', '-3', '-6', '-7', '-8', '-9', '-10']

export default function Experience() {
  const rootRef = useRef<HTMLDivElement>(null)
  const depthRef = useRef<HTMLSpanElement>(null)
  const [chapter, setChapter] = useState<ChapterId>('orbit')
  const [gateMv, setGateMv] = useState(680)
  const [reserved, setReserved] = useState(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const ctx = gsap.context(() => {
      /* Active chapter tracking drives the rail and the accent palette. */
      CHAPTERS.forEach((c) => {
        ScrollTrigger.create({
          trigger: `#${c.id}`,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: (self) => {
            if (self.isActive) setChapter(c.id)
          },
        })
      })

      /* The commercial section keeps the lattice accent, even when an
         instant jump (tour restart, anchor) skips the lattice zone. */
      ScrollTrigger.create({
        trigger: '#reserve',
        start: 'top 55%',
        end: 'bottom top',
        onToggle: (self) => {
          if (self.isActive) setChapter('lattice')
        },
      })

      /* Header depth readout: whole-document progress through log steps. */
      ScrollTrigger.create({
        start: 0,
        end: () => ScrollTrigger.maxScroll(window),
        onUpdate: (self) => {
          const i = Math.min(
            DEPTH_STEPS.length - 1,
            Math.floor(self.progress * DEPTH_STEPS.length),
          )
          if (depthRef.current) {
            depthRef.current.textContent = `10^${DEPTH_STEPS[i]} m`
          }
        },
      })

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        /* Split-line headline reveals */
        gsap.utils.toArray<HTMLElement>('.xp-line > span').forEach((el) => {
          gsap.from(el, {
            yPercent: 110,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%' },
          })
        })

        /* Generic fade-rise reveals */
        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 28,
            autoAlpha: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%' },
          })
        })

        /* Leader lines draw in */
        gsap.utils.toArray<SVGPathElement>('.xp-draw').forEach((path) => {
          const len = path.getTotalLength()
          gsap.fromTo(
            path,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 1.1,
              ease: 'power2.inOut',
              scrollTrigger: { trigger: path, start: 'top 82%' },
            },
          )
        })

        /* Hero exits as the descent begins */
        gsap.to('#hero-inner', {
          autoAlpha: 0,
          y: -60,
          ease: 'none',
          scrollTrigger: { trigger: '#orbit', start: 'top 90%', end: 'top 30%', scrub: true },
        })
      })

      /* Altitude counter (orbit) */
      const alt = { v: 12400 }
      ScrollTrigger.create({
        trigger: '#orbit',
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          alt.v = 12400 - self.progress * 11600
          const el = root.querySelector('[data-altitude]')
          if (el) el.textContent = `${Math.round(alt.v).toLocaleString('en-US')} m`
        },
      })

      /* Metal-stack fill (descent) */
      gsap.fromTo(
        '#stack-fill',
        { scaleY: 0 },
        {
          scaleY: 1,
          transformOrigin: 'top center',
          ease: 'none',
          scrollTrigger: { trigger: '#descent', start: 'top 60%', end: 'bottom 70%', scrub: true },
        },
      )

      /* Layer label counter (descent) */
      ScrollTrigger.create({
        trigger: '#descent',
        start: 'top 60%',
        end: 'bottom 70%',
        onUpdate: (self) => {
          const layer = Math.max(1, Math.min(12, Math.ceil((1 - self.progress) * 12)))
          const el = root.querySelector('[data-layer]')
          if (el) el.textContent = `M${layer}`
        },
      })
    }, root)

    return () => ctx.revert()
  }, [])

  /* Derived, illustrative gate figures for the interactive element. */
  const gateOn = gateMv >= 550
  const switchFj = (gateMv / 1000) ** 2 * 2.1
  const clockGhz = gateOn ? 1.9 + ((gateMv - 550) / 350) * 1.3 : 0

  return (
    <div ref={rootRef} className="xp" data-chapter={chapter}>
      {/* ------------------------------------------------ header */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-4 md:px-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            scrollToPosition(0)
          }}
          className="font-mono text-sm font-semibold tracking-[0.28em] text-bone"
          aria-label="Substrate, return to top"
        >
          SUBSTRATE
        </a>
        <span
          ref={depthRef}
          className="xp-readout hidden text-[11px] tracking-[0.2em] text-dim sm:block"
          aria-hidden="true"
        >
          10^+4 m
        </span>
        <nav className="flex items-center gap-4" aria-label="Site">
          <Link
            to="/prompt"
            className="hidden font-mono text-[11px] tracking-[0.2em] text-dim uppercase transition-colors hover:text-bone sm:block"
          >
            Prompt archive
          </Link>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('reserve')
              if (el) scrollToElement(el)
            }}
            className="cursor-pointer border border-(--accent) px-3.5 py-1.5 font-mono text-[11px] tracking-[0.18em] text-bone uppercase transition-colors hover:bg-(--accent) hover:text-void"
          >
            Reserve capacity
          </button>
        </nav>
      </header>

      {/* ------------------------------------------------ scale rail */}
      <nav className="xp-rail" aria-label="Scale navigation">
        {CHAPTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="xp-rail-node"
            aria-current={chapter === c.id}
            onClick={() => {
              const el = document.getElementById(c.id)
              if (el) scrollToElement(el)
            }}
          >
            <span className="tick" aria-hidden="true" />
            10^{c.exponent}
            <span className="sr-only">metres, {c.label}</span>
          </button>
        ))}
      </nav>

      <main>
        {/* ------------------------------------------------ hero */}
        <section className="relative flex h-svh items-end px-5 pb-24 md:px-8" aria-label="Introduction">
          <div id="hero-inner" className="max-w-4xl">
            <p className="xp-kicker mb-5" data-reveal>
              Substrate / S1 inference cloud
            </p>
            <h1 className="xp-h1 mb-6">
              <span className="xp-line">
                <span>Compute,</span>
              </span>
              <span className="xp-line">
                <span>all the way down</span>
              </span>
            </h1>
            <p className="xp-body mb-8" data-reveal>
              We design inference silicon the way planners light a city: from the
              street grid to the single atom. The film behind this page is one
              continuous descent through the S1 die. Scroll to make the journey.
            </p>
            <div className="flex flex-wrap items-center gap-4" data-reveal>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('orbit')
                  if (el) scrollToElement(el)
                }}
                className="flex cursor-pointer items-center gap-2 bg-bone px-5 py-2.5 font-mono text-[11px] tracking-[0.18em] text-void uppercase transition-colors hover:bg-amber"
              >
                Begin the descent <ArrowDown size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('reserve')
                  if (el) scrollToElement(el)
                }}
                className="cursor-pointer px-2 py-2.5 font-mono text-[11px] tracking-[0.18em] text-dim uppercase transition-colors hover:text-bone"
              >
                Reserve capacity
              </button>
            </div>
          </div>
          <div className="xp-cue absolute bottom-6 left-1/2 -translate-x-1/2 text-dim" aria-hidden="true">
            <ArrowDown size={16} />
          </div>
        </section>

        {/* ------------------------------------------------ 01 orbit */}
        <section id="orbit" className="relative min-h-[140vh] px-5 md:px-8" aria-label="Chapter one, orbit">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 pt-[30vh] lg:grid-cols-2">
            <div>
              <p className="xp-kicker mb-4">01 / Orbit / 10^+4 m</p>
              <h2 className="xp-h2 mb-6">
                <span className="xp-line">
                  <span>Every workload</span>
                </span>
                <span className="xp-line">
                  <span>looks like a city</span>
                </span>
              </h2>
              <p className="xp-body" data-reveal>
                Requests arrive in waves. Heat pools in districts. The cost of
                distance is real. An inference fleet behaves like a night grid,
                and Substrate plans capacity by watching where the load actually
                lives, not where the diagram says it should.
              </p>
            </div>
            <div className="flex items-start justify-end lg:pt-24">
              <div className="xp-card px-5 py-4" data-reveal>
                <p className="font-mono text-[10px] tracking-[0.28em] text-dim uppercase">Altitude</p>
                <p className="xp-readout mt-1 text-2xl text-bone" data-altitude>
                  12,400 m
                </p>
                <svg className="xp-leader mt-3" width="180" height="46" viewBox="0 0 180 46" aria-hidden="true">
                  <path className="xp-draw" d="M2 44 L64 10 H178" fill="none" strokeWidth="1" />
                  <circle cx="2" cy="44" r="2.5" fill="currentColor" stroke="none" />
                </svg>
                <p className="font-mono text-[10px] tracking-[0.18em] text-dim">
                  Grid sector 7: request density 61%
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 02 interconnect */}
        <section id="interconnect" className="relative min-h-[160vh] px-5 md:px-8" aria-label="Chapter two, interconnect">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 pt-[36vh] lg:grid-cols-2">
            <div className="order-2 flex items-start lg:order-1 lg:pt-20">
              <div className="xp-card px-5 py-4" data-reveal>
                <p className="font-mono text-[10px] tracking-[0.28em] text-dim uppercase">Top metal survey</p>
                <svg width="220" height="140" viewBox="0 0 220 140" className="xp-leader mt-3" aria-hidden="true">
                  {[0, 1, 2, 3].map((r) => (
                    <path key={`h${r}`} className="xp-draw" d={`M6 ${18 + r * 34} H214`} fill="none" strokeWidth="1" opacity="0.7" />
                  ))}
                  {[0, 1, 2, 3, 4, 5].map((c) => (
                    <path key={`v${c}`} className="xp-draw" d={`M${14 + c * 38} 6 V134`} fill="none" strokeWidth="1" opacity="0.45" />
                  ))}
                  <circle cx="110" cy="69" r="4" fill="currentColor" stroke="none" />
                </svg>
                <div className="mt-3 flex items-baseline justify-between gap-6">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-dim">Trace pitch</p>
                  <p className="xp-readout text-xl text-bone">28 nm</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="xp-kicker mb-4">02 / Interconnect / 10^-6 m</p>
              <h2 className="xp-h2 mb-6">
                <span className="xp-line">
                  <span>The same geometry,</span>
                </span>
                <span className="xp-line">
                  <span>a million times smaller</span>
                </span>
              </h2>
              <p className="xp-body" data-reveal>
                At street level the metaphor stops being a metaphor. The S1's top
                metal routes power and signal like avenues, districts of SRAM
                where the work sleeps close to the math, and a bright central
                artery that never goes dark. Twelve copper layers, planned like a
                city that refuses to jam.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 03 descent */}
        <section id="descent" className="relative min-h-[160vh] px-5 md:px-8" aria-label="Chapter three, descent">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 pt-[36vh] lg:grid-cols-2">
            <div>
              <p className="xp-kicker mb-4">03 / Descent / 10^-7 m</p>
              <h2 className="xp-h2 mb-6">
                <span className="xp-line">
                  <span>Twelve layers between</span>
                </span>
                <span className="xp-line">
                  <span>thought and charge</span>
                </span>
              </h2>
              <p className="xp-body" data-reveal>
                A request enters at the package ball and falls: through power
                mesh, through signal, through ever finer copper, until wire
                becomes contact and contact becomes silicon. The film is riding
                one via all the way to the bottom of that stack.
              </p>
            </div>
            <div className="flex items-start justify-end lg:pt-10">
              <div className="xp-card px-5 py-4" data-reveal>
                <div className="flex items-baseline justify-between gap-8">
                  <p className="font-mono text-[10px] tracking-[0.28em] text-dim uppercase">Current layer</p>
                  <p className="xp-readout text-xl text-bone" data-layer>
                    M12
                  </p>
                </div>
                <svg width="200" height="230" viewBox="0 0 200 230" className="mt-3" aria-hidden="true">
                  <g>
                    {Array.from({ length: 12 }, (_, i) => (
                      <rect
                        key={i}
                        x="30"
                        y={8 + i * 18}
                        width="140"
                        height="10"
                        fill="none"
                        stroke="color-mix(in srgb, var(--accent) 45%, transparent)"
                        strokeWidth="1"
                      />
                    ))}
                    {/* the via */}
                    <rect x="97" y="8" width="6" height="214" fill="color-mix(in srgb, var(--accent) 25%, transparent)" />
                    <rect id="stack-fill" x="97" y="8" width="6" height="214" fill="var(--accent)" />
                  </g>
                  <text x="8" y="18" fill="var(--color-dim)" fontSize="9" fontFamily="var(--font-mono)">
                    M12
                  </text>
                  <text x="8" y="216" fill="var(--color-dim)" fontSize="9" fontFamily="var(--font-mono)">
                    M1
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 04 gate */}
        <section id="gate" className="relative min-h-[160vh] px-5 md:px-8" aria-label="Chapter four, gate">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 pt-[36vh] lg:grid-cols-2">
            <div>
              <p className="xp-kicker mb-4">04 / Gate / 10^-9 m</p>
              <h2 className="xp-h2 mb-6">
                <span className="xp-line">
                  <span>One gate, four hundred</span>
                </span>
                <span className="xp-line">
                  <span>billion decisions a second</span>
                </span>
              </h2>
              <p className="xp-body" data-reveal>
                Everything above this point is bookkeeping. The decision itself
                happens here, where a whisper of voltage either opens the channel
                or leaves it dark. Drive the gate yourself and watch what one
                more tenth of a volt buys.
              </p>
            </div>
            <div className="flex items-start justify-end lg:pt-16">
              <div className={`xp-card w-full max-w-xs px-5 py-4 ${gateOn ? '' : 'xp-gate-off'}`} data-reveal>
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[10px] tracking-[0.28em] text-dim uppercase">Gate drive</p>
                  <p className="xp-readout text-xl text-bone">{gateMv} mV</p>
                </div>
                <svg width="240" height="80" viewBox="0 0 240 80" className="xp-leader mt-3" aria-hidden="true">
                  <path d="M8 40 H232" fill="none" strokeWidth="1" opacity="0.35" />
                  <rect x="96" y="18" width="48" height="12" fill="none" strokeWidth="1" className="xp-leader" stroke="currentColor" />
                  <text x="103" y="27" fill="var(--color-dim)" fontSize="8" fontFamily="var(--font-mono)">
                    GATE
                  </text>
                  {[0, 1, 2].map((i) => (
                    <circle
                      key={i}
                      className={`xp-electron ${gateOn ? '' : 'slow'}`}
                      style={{ animationDelay: `${i * 0.5}s` }}
                      r="3"
                      fill="var(--accent)"
                      stroke="none"
                    />
                  ))}
                </svg>
                <label htmlFor="gate-drive" className="mt-4 block font-mono text-[10px] tracking-[0.18em] text-dim uppercase">
                  Threshold 550 mV
                </label>
                <input
                  id="gate-drive"
                  type="range"
                  min={400}
                  max={900}
                  step={10}
                  value={gateMv}
                  onChange={(e) => setGateMv(Number(e.target.value))}
                  className="xp-slider mt-2"
                  aria-valuetext={`${gateMv} millivolts`}
                />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.18em] text-dim">Switch energy</p>
                    <p className="xp-readout text-lg text-bone">{switchFj.toFixed(2)} fJ</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.18em] text-dim">Channel</p>
                    <p className="xp-readout text-lg text-bone">
                      {gateOn ? `${clockGhz.toFixed(2)} GHz` : 'closed'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 font-mono text-[9px] tracking-[0.12em] text-dim">
                  Illustrative physics, not a measured device
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 05 lattice */}
        <section id="lattice" className="relative min-h-[160vh] px-5 md:px-8" aria-label="Chapter five, lattice">
          <div className="mx-auto max-w-6xl pt-[40vh]">
            <div className="max-w-2xl">
              <p className="xp-kicker mb-4">05 / Lattice / 10^-10 m</p>
              <h2 className="xp-h2 mb-6">
                <span className="xp-line">
                  <span>Order is</span>
                </span>
                <span className="xp-line">
                  <span>the product</span>
                </span>
              </h2>
              <p className="xp-body mb-6" data-reveal>
                Silicon works because its atoms agree. A crystal is a promise
                kept a quintillion times over, and every figure above rests on
                this grid holding still. Look far into the lattice and the city
                you started from is still there, one warm window burning at
                street level.
              </p>
              <p className="xp-readout text-[11px] tracking-[0.2em] text-dim" data-reveal>
                Lattice constant 0.543 nm / diamond cubic / 99.9999999% pure
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ reserve */}
        <section id="reserve" className="relative min-h-[150vh] px-5 md:px-8" aria-label="Reserve capacity">
          <div className="mx-auto max-w-6xl pt-[38vh]">
            <div className="max-w-3xl">
              <p className="xp-kicker mb-4">Allocation / Q4 2026</p>
              <h2 className="xp-h2 mb-8">
                <span className="xp-line">
                  <span>Reserve capacity on the</span>
                </span>
                <span className="xp-line">
                  <span>S1 inference cloud</span>
                </span>
              </h2>
              <dl className="mb-10 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-3" data-reveal>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">First allocation</dt>
                  <dd className="xp-readout mt-1 text-lg text-bone">Q4 2026</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Access</dt>
                  <dd className="xp-readout mt-1 text-lg text-bone">Dedicated interconnect</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Pricing</dt>
                  <dd className="xp-readout mt-1 text-lg text-bone">Per reserved teratoken</dd>
                </div>
              </dl>

              {reserved ? (
                <p className="xp-card inline-block px-5 py-4 font-mono text-sm text-bone" role="status">
                  Request noted. We answer within two working days.
                </p>
              ) : (
                <form
                  className="flex max-w-xl flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setReserved(true)
                  }}
                  data-reveal
                >
                  <label htmlFor="reserve-email" className="sr-only">
                    Work email
                  </label>
                  <input
                    id="reserve-email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    className="w-full border border-white/20 bg-void/60 px-4 py-3 font-mono text-sm text-bone placeholder:text-dim focus:border-(--accent)"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer bg-(--accent) px-6 py-3 font-mono text-[11px] tracking-[0.18em] text-void uppercase transition-opacity hover:opacity-85"
                  >
                    Request allocation
                  </button>
                </form>
              )}

              <p className="mt-6 max-w-xl font-mono text-[10px] leading-relaxed tracking-[0.08em] text-dim" data-reveal>
                S1 performance figures on this page are design targets, not
                measured results. Substrate is a concept brand built around one
                continuous film.
              </p>
            </div>

            <footer className="mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pb-16 pt-6">
              <p className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">
                Substrate / from the grid to the lattice
              </p>
              <div className="flex items-center gap-6">
                <Link
                  to="/prompt"
                  className="flex items-center gap-1 font-mono text-[11px] tracking-[0.18em] text-dim uppercase transition-colors hover:text-bone"
                >
                  Prompt archive <ArrowUpRight size={11} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => scrollToPosition(0)}
                  className="flex cursor-pointer items-center gap-1 font-mono text-[11px] tracking-[0.18em] text-dim uppercase transition-colors hover:text-bone"
                >
                  <CornerLeftUp size={11} aria-hidden="true" /> Return to the surface
                </button>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  )
}
