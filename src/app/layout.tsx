import type { Metadata, Viewport } from 'next';
import { Archivo, Martian_Mono } from 'next/font/google';
import './globals.css';
import TitleBlock from '@/components/chrome/TitleBlock';
import SetEdge from '@/components/chrome/SetEdge';
import PenCarriage from '@/components/motion/PenCarriage';
import VisitorHand from '@/components/motion/VisitorHand';
import { GIT } from '@/lib/git';
import { PROTOTYPE_COUNT } from '@/lib/prototypes';

// Self-hosted at build by Next (no runtime CDN). Archivo carries the width axis
// so the display voice can letter in EXPANDED caps; Martian Mono is the
// measured/dimensioned voice, quarantined to real facts.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const martian = Martian_Mono({
  subsets: ['latin'],
  variable: '--font-martian',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://fullbuild.ai'),
  title: {
    default: 'fullbuild.ai · idea → design → engineering → audit ⟳ shipped',
    template: '%s · fullbuild.ai',
  },
  description:
    'A working drawing set. One hand carries a single idea through design, engineering, and shipping: advance the sheet to watch it build.',
  openGraph: {
    title: 'fullbuild.ai',
    description: 'idea → design → engineering → audit ⟳ shipped',
    url: 'https://fullbuild.ai',
    siteName: 'fullbuild.ai',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9e3d6' },
    { media: '(prefers-color-scheme: dark)', color: '#14181a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Set the ground BEFORE first paint so the drafting table never flashes.
const noFlashTheme = `(function(){try{var t=localStorage.getItem('ws-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

// Hide the hero wordmark BEFORE first paint so a slow hydration never shows the
// finished word only to snap it away when the plot starts. MastheadPlot clears
// the attribute (and this safety timer) once it owns the hide; if hydration
// never arrives the timer restores the text. Reduced motion opts out entirely —
// that path never plots, so the word must stand from the first frame. No-JS
// visitors never run this, so the SSR text stays visible for them.
const noFlashPlot = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.setAttribute('data-plot-pending','');window.__plotGuard=window.setTimeout(function(){d.removeAttribute('data-plot-pending');},3000);}catch(e){}})();`;

// Hide the cover pipeline BEFORE first paint, for exactly the reason above one
// line down: the tagline is SSR-complete, so a slow hydration paints the finished
// line and TaglineFit's layout effect then clips it away to letter it in — a
// visible flash of the finished text. TaglineFit lifts the attribute once its
// effect owns the clip; the timer restores the line if hydration never arrives.
// Same carve-outs: reduced motion never letters, no-JS never runs this.
//
// The guard runs longer than its siblings' 3s deliberately. Measured at 6x CPU
// throttle (a mid-range phone), hydration lands around 5.2s — a 3s guard fires
// FIRST, paints the finished line, and TaglineFit then clips it away: exactly
// the flash this exists to prevent, just moved later. The guard only matters
// when JS runs but React never hydrates, so waiting longer costs a rare visitor
// a few extra seconds of a line that is about to letter itself in anyway.
const noFlashPipeline = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.setAttribute('data-pipeline-pending','');window.__pipelineGuard=window.setTimeout(function(){d.removeAttribute('data-pipeline-pending');},8000);}catch(e){}})();`;

// Zero the depth ratchet BEFORE first paint. --depth defaults to 1 in CSS so
// that a no-JS visitor gets the finished sheet (fully subdivided ground, fully
// ruled rail) — but that means the first frame would otherwise paint the FINISHED
// ground and snap coarse the instant DrawingSet's effect writes 0. Same class of
// flash the two scripts above exist to prevent, and the same carve-outs: reduced
// motion opts out (that path never scrubs, so the finished depth must stand from
// frame one), and no-JS visitors never run this at all.
const noFlashDepth = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.style.setProperty('--depth','0');}catch(e){}})();`;

// Hold the plotted linework BEFORE first paint. The drawings are SSR-complete so
// that no-JS and reduced-motion visitors get the finished sheet, which means the
// first frame would otherwise show every stroke drawn only to have DrawingSet and
// the rail mark hide them at mount and re-draw — the flash the two scripts above
// exist to prevent, one layer down. Each owner stamps data-ws-armed per stroke as
// it takes the hidden state, dropping out of the CSS hold with no frame between;
// the timer restores the linework if hydration never arrives. Same carve-outs:
// reduced motion opts out, no-JS never runs this.
const noFlashDraw = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.setAttribute('data-draw-pending','');window.__drawGuard=window.setTimeout(function(){d.removeAttribute('data-draw-pending');},3000);}catch(e){}})();`;

// Cover the homepage BEFORE first paint so the intro's opening frame is the first thing
// anyone sees, rather than a flash of the finished set that the overlay then covers up.
// The cover is painted in the film's own opening ground, so the handoff from cover to first
// film frame is invisible in either direction and a one-frame overlap costs nothing.
// HomepageIntro clears both the attribute and this timer in the effect that paints that
// first frame. Same carve-outs as its four siblings: reduced motion opts out entirely (that
// path gets no intro at all, so the page must stand from frame one), and no-JS visitors
// never run this, so the SSR page stays visible for them. The guard runs longer than the
// intro's own maximum, so a visitor whose JS runs but whose React never hydrates still gets
// the page back rather than a permanent blank ground.
//
// THE PATH CHECK IS NOT OPTIONAL, and it is the one thing that separates this script from
// its four siblings. They describe states every route has; this one covers the screen for a
// component that only the homepage mounts. Without the check every other route in the site
// (the showcase, every prototype, contact, lab) loads under an opaque vellum sheet with
// nothing behind it to lift the attribute, and sits there until the 4s guard fires.
//
// THE GUARD FIRING IS A DECISION, NOT JUST A TIDY UP, which is why it latches. Measured on a
// 20x throttled CPU over a 50 kB/s link, hydration landed at 12.7s: the guard had lifted the
// cover at 4s, the reader spent eight seconds reading a finished homepage, and only then did
// an overlay arrive to report that the page was loading, followed by a warp. That is the
// flash of the ending before the beginning the cover exists to prevent, inverted and drawn
// out. So the moment the cover comes off, the intro's chance is gone: __introExpired is what
// IntroMount reads to know it arrived too late to be an intro at all.
//
// IT ALSO LATCHES THE ENTRANCE HOLD, in the same breath and under the same
// conditions, because the page has an opening act of its own and that act starts at
// hydration. Left alone it plots the wordmark, letters the pipeline, draws the rail mark
// and works the cover behind the curtain, and the reader arrives at a page that is already
// over. The latch has to exist before any module does, because MastheadPlot plots from a
// layout effect the instant it mounts, so it is set here rather than by the overlay, which
// arrives later. And the guard that lifts the cover lifts the hold with it: if the intro is
// not coming, the page's opening must not be left waiting on it. See src/lib/introHold.ts;
// the event name is spelled out here because this script predates every module.
// THE HOLD CARRIES ITS OWN DEADLINE, on a second timer that nothing in React clears. The
// cover's 4s guard is cleared by HomepageIntro the moment it paints its first frame, which is
// correct for a cover and useless as a backstop for the hold: after that, an overlay that
// somehow never finishes would hold the page's opening for the rest of the session. The
// deadline is set well past the intro's own worst case (a 4.2s film plus a 3.5s cinematic) so
// no real intro ever reaches it, and it releases unconditionally when it fires.
const noFlashIntro = `(function(){try{if(window.location.pathname!=='/')return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;var go=function(){if(window.__introHold){window.__introHold=false;window.dispatchEvent(new Event('ws:intro-entrance'));}};d.setAttribute('data-intro-pending','');window.__introHold=true;window.__introGuard=window.setTimeout(function(){d.removeAttribute('data-intro-pending');window.__introExpired=1;go();},4000);window.setTimeout(go,12000);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${archivo.variable} ${martian.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashPlot }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashPipeline }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashDepth }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashDraw }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashIntro }} />
      </head>
      <body>
        {children}
        {/* One instrument for the whole site: the carriage lives in the chrome
            (not in DrawingSet) so every route has the pen, and the visitor's
            hand feeds it wherever the site itself is not plotting. */}
        <PenCarriage />
        <VisitorHand />
        <TitleBlock rev={GIT.rev} sha={GIT.sha} prototypes={PROTOTYPE_COUNT} />
        {/* The bound edge sits outboard of the rail, so it is mounted after it —
            the set's outermost margin is the last thing drawn on the sheet. */}
        <SetEdge />
      </body>
    </html>
  );
}
