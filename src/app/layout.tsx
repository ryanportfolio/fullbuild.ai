import type { Metadata, Viewport } from 'next';
import { Archivo, Martian_Mono } from 'next/font/google';
import './globals.css';
import TitleBlock from '@/components/chrome/TitleBlock';
import { GIT } from '@/lib/git';

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
    default: 'fullbuild.ai · idea → design → engineering → shipped',
    template: '%s · fullbuild.ai',
  },
  description:
    'A working drawing set. One hand carries a single idea through design, engineering, and shipping: advance the sheet to watch it build.',
  openGraph: {
    title: 'fullbuild.ai',
    description: 'idea → design → engineering → shipped',
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
      </head>
      <body>
        {children}
        <TitleBlock rev={GIT.rev} sha={GIT.sha} />
      </body>
    </html>
  );
}
