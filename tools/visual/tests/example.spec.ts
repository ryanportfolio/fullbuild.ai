import { test, expect } from '@playwright/test';

/**
 * Three patterns this harness gives you. Point BASE_URL at your page,
 * swap the routes/selectors for real ones.
 */

// 1. VISUAL DIFF + CROSS-BROWSER
// Runs on chromium/webkit/firefox/mobile automatically (see projects).
// First run writes a baseline PNG; later runs fail if pixels drift.
//   npm run diff          -> compare against baseline
//   npm run diff:update   -> accept current as new baseline
test('home matches baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

// 2. MOTION CAPTURE
// Tagged @capture. Records video (see .artifacts/) so you can watch
// scroll/hover/transition/R3F motion I otherwise can't see in a still.
test('hero motion @capture', async ({ page }) => {
  await page.goto('/');
  // Drive whatever the interaction is:
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(1500);
  await page.mouse.move(400, 300);
  await page.waitForTimeout(800);
  // Video lands in tools/visual/.artifacts/**/video.webm
});

// 3. DETERMINISTIC ANIMATION FRAME
// Freeze a mid-animation state for a stable screenshot instead of
// racing a rAF loop (see screenshot-raf-timeout memory).
test('mid-transition frame', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open/i }).click().catch(() => {});
  await page.waitForTimeout(200); // land on the frame you want
  await expect(page).toHaveScreenshot('transition-open.png');
});
