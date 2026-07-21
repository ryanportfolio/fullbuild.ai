/* Mobile + reduced-motion verification captures. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = '.tmp/modes';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--disable-background-timer-throttling', '--use-gl=angle'] });

// ---- mobile 390x844 ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3117', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__plot && window.__plot.seek(999999));
  const offs = await page.evaluate(() => {
    const o = {};
    for (const id of ['state-02', 'state-03', 'state-04', 'rev']) {
      const el = document.getElementById(id);
      o[id] = el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    }
    o.max = document.body.scrollHeight - innerHeight;
    o.overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    o.canvases = document.querySelectorAll('canvas').length;
    return o;
  });
  console.log('mobile offsets:', offs);
  const freeze = () => page.evaluate(() => window.__capture && window.__capture.freeze());
  const thaw = () => page.evaluate(() => window.__capture && window.__capture.thaw());
  await freeze();
  await page.screenshot({ path: join(outDir, 'mobile-hero.png') });
  await thaw();
  for (const [name, y] of [['mobile-04', offs['state-04']], ['mobile-end', offs.max]]) {
    await page.evaluate(async (target) => {
      const from = scrollY;
      for (let i = 1; i <= 24; i++) {
        (window.__lenis ? window.__lenis.scrollTo(from + ((target - from) * i) / 24, { immediate: true }) : scrollTo(0, from + ((target - from) * i) / 24));
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => setTimeout(r, 20));
      }
    }, y);
    await page.waitForTimeout(1200);
    await freeze();
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    await thaw();
  }
  await page.close();
}

// ---- reduced motion 1440x900 ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3117', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    penVisible: !!document.querySelector('[data-mode]'),
    h1Opacity: getComputedStyle(document.querySelector('h1')).opacity,
    strokesDrawn: (() => {
      const s = document.querySelector('.ws-draw');
      return s ? getComputedStyle(s).strokeDashoffset : 'none';
    })(),
  }));
  console.log('reduced-motion facts:', facts);
  await page.screenshot({ path: join(outDir, 'rm-hero.png') });
  await page.evaluate(() => {
    const el = document.getElementById('state-04');
    el && el.scrollIntoView();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, 'rm-04.png') });
  await page.close();
  await ctx.close();
}

await browser.close();
console.log('done');
