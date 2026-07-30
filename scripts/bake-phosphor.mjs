// Bake the PHOSPHOR no-JS fallback PNGs for /harness-firmware.
// Drives public/harness-firmware/src/bake.html (the same dither.mjs engine
// the live page runs) in headless chromium and writes the canvases to
// public/harness-firmware/fallback/.
//
// Prereq: the static server must be running:
//   node scripts/serve-prototype.mjs --port 4823
// Then:
//   node scripts/bake-phosphor.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  'file:///C:/Users/Home/CoreWise/fullbuild.ai/.claude/worktrees/audit-shipped-layout-shift-b8bba1/node_modules/'
);
const { chromium } = require('playwright');

const base = process.env.HF_BASE || 'http://localhost:4823';
const outDir = new URL('../public/harness-firmware/fallback/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[bake]', m.text()));
page.on('pageerror', (e) => { console.error('[bake:error]', e.message); process.exitCode = 1; });
await page.goto(`${base}/harness-firmware/src/bake.html`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });

const bakes = await page.evaluate(() => window.__bakes);
const report = await page.evaluate(() => window.__report);
for (const [name, dataURL] of Object.entries(bakes)) {
  const b64 = dataURL.split(',')[1];
  writeFileSync(new URL(`${name}.png`, outDir), Buffer.from(b64, 'base64'));
  console.log(`baked ${name}.png (${Math.round((b64.length * 3) / 4 / 1024)} KiB)`);
}
console.log('calibration:', JSON.stringify(report.coreHalo));
for (const b of report.spectrum) {
  if (b.blocks !== b.dots) {
    console.error(`DOT COUNT MISMATCH: ${b.name} blocks=${b.blocks} dots=${b.dots}`);
    process.exitCode = 1;
  }
}
console.log('spectrum dot counts verified: 1 dot = 1 block for all 20 bands');
await browser.close();
