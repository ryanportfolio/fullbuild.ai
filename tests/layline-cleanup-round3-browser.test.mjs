import assert from "node:assert/strict";
import test from "node:test";

import { launchPlacedChrome } from "../scripts/lib/launch-chrome.mjs";

const baseUrl = process.env.LAYLINE_BROWSER_TEST_URL;

test(
  "Method Enter and Space toggle the disclosure without releasing the race brief",
  { skip: baseUrl ? false : "set LAYLINE_BROWSER_TEST_URL to a running local app" },
  async () => {
    const browser = await launchPlacedChrome();

    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        const page = await context.newPage();

        await page.goto(`${baseUrl}/prototype/layline/races`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.body.textContent?.includes("Layline race library"));
        await page.locator('[data-brief-switch="performance"]').click();
        await page.waitForFunction(
          () => document.querySelector('[data-brief-view]')?.getAttribute("data-brief-view") === "performance",
        );

        const summary = page.locator('[data-brief-view="performance"] summary');
        const details = page.locator('[data-brief-view="performance"] details');
        const gateIsSet = () =>
          page.evaluate(() => document.querySelector('[data-analysis-flow="viewer"]')?.hasAttribute("data-gate"));

        await summary.focus();
        assert.equal(await details.getAttribute("open"), null, `${viewport.width}px Method did not start closed`);
        assert.equal(await gateIsSet(), true, `${viewport.width}px brief started released`);

        await summary.press("Space");
        assert.equal(await details.getAttribute("open"), "", `${viewport.width}px Space did not open Method`);
        assert.equal(await gateIsSet(), true, `${viewport.width}px Space released the brief`);

        await summary.press("Enter");
        assert.equal(await details.getAttribute("open"), null, `${viewport.width}px Enter did not close Method`);
        assert.equal(await gateIsSet(), true, `${viewport.width}px Enter released the brief`);

        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
