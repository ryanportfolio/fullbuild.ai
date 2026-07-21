/* Capture harness for The Working Set.
   Frame-freeze approach: step-scroll (fires ScrollTrigger), wait for DRAW,
   freeze gsap ticker via dev handle, screenshot, thaw. Both themes.
   Usage: node .tmp/capture.mjs [outDir] [--dark] [--states 0,2,3,4,rev] [--health]
*/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] || '.tmp/shots';
const dark = process.argv.includes('--dark');
const pinHealth = process.argv.includes('--health');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-gl=angle',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
if (dark) {
  await page.addInitScript(() => {
    try { localStorage.setItem('ws-theme', 'dark'); } catch {}
    document.documentElement.dataset.theme = 'dark';
  });
}
await page.goto('http://localhost:3117', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600); // masthead plot + first DRAW

if (pinHealth) {
  await page.evaluate(() => {
    const ws = window.__ws;
    if (ws) {
      const { setHealth } = ws.getState();
      // pin every live project healthy so red can ignite locally
      for (const a of document.querySelectorAll('a[data-live]')) setHealth(a.href, true);
      setHealth('https://fullbuild.ai', true);
      setHealth('https://fullbuild.ai/', true);
    }
  });
}

const theme = dark ? 'dark' : 'light';

async function freeze() { await page.evaluate(() => window.__capture && window.__capture.freeze()); }
async function thaw() { await page.evaluate(() => window.__capture && window.__capture.thaw()); }

async function shot(name) {
  // nudge canvas layers for a fresh compositor commit (pitfalls.md)
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('canvas')) {
      const el = c.parentElement || c;
      el.style.opacity = el.style.opacity === '0.985' ? '0.986' : '0.985';
    }
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(outDir, `${theme}-${name}.png`) });
  console.log('shot', `${theme}-${name}.png`);
}

async function steppedScrollTo(y, steps = 28) {
  await page.evaluate(async (target) => {
    const w = window;
    const from = w.scrollY;
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const yy = from + ((target - from) * i) / steps;
      if (w.__lenis) w.__lenis.scrollTo(yy, { immediate: true });
      else w.scrollTo(0, yy);
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 25));
    }
  }, y);
}

// finish the wordmark plot deterministically
await page.evaluate(() => window.__plot && window.__plot.seek(999999));

const offs = await page.evaluate(() => {
  const o = {};
  for (const id of ['state-01', 'state-02', 'state-03', 'state-04', 'rev']) {
    const el = document.getElementById(id);
    o[id] = el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  }
  o.max = document.body.scrollHeight - innerHeight;
  return o;
});
console.log('offsets', offs);

await freeze();
await shot('01-hero');
await thaw();

const stops = [
  ['02-blueprint', offs['state-02']],
  ['03-frame', offs['state-03']],
  ['04-pour-mid', Math.round((offs['state-03'] + offs['state-04']) / 2)],
  ['04-shipped', offs['state-04']],
  ['04-schedule-deep', offs['state-04'] + 900],
  ['05-appendix', Math.min(offs['rev'], offs.max)],
  ['06-end', offs.max],
];
for (const [name, y] of stops) {
  await steppedScrollTo(y);
  await page.waitForTimeout(1500); // DRAW + damp settle
  await freeze();
  await shot(name);
  await thaw();
}

const errors = await page.evaluate(() => window.__consoleErrors || null);
console.log('console errors handle:', errors);
await browser.close();
