import { defineConfig, devices } from '@playwright/test';

/**
 * Isolated visual/motion/cross-browser harness.
 * BASE_URL points at the dev server or a deployed preview.
 *   BASE_URL=http://localhost:3000 npm run diff
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  snapshotDir: './__snapshots__',
  outputDir: './.artifacts',
  fullyParallel: true,
  reporter: [['html', { outputFolder: './.report', open: 'never' }], ['list']],
  // Deterministic pixels for visual diff: cap animations, small tolerance.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL,
    // Motion capture: video of every run, trace on failure.
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Responsive spot-check.
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
