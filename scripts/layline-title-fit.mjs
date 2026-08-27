/* The largest cqw that holds every shipped race name inside two line boxes.
 *
 * Replays RaceBrief's own fits() predicate against the rendered title node, so
 * the number this prints is the one the runtime fit would settle on. A stated
 * size in .raceName above the binding case is a size the fit has to correct
 * after hydration, in full view of the reader; below it the fit never fires
 * and the server's first paint is the final one.
 *
 * Re-run after any change to the title's face, weight or tracking, and after
 * adding a race whose name is longer than the ones in the registry today:
 *
 *   ./node_modules/.bin/next dev -p 44311
 *   node scripts/layline-title-fit.mjs
 *
 * Headed Chrome, never headless: this page renders WebGL, and headless puts it
 * through SwiftShader on the CPU. The window is placed off the operator's
 * display by launchPlacedChrome.
 */
import { launchPlacedChrome } from "./lib/launch-chrome.mjs";

const URL = process.env.LAYLINE_URL ?? "http://localhost:44311/prototype/layline/races";
const NAMES = ["Summer fleet race", "Winter series race 2", "Autumn invitational"];
const WIDTHS = [1920, 1728, 1600, 1440, 1366, 1280, 1180, 1024, 960];

const browser = await launchPlacedChrome();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector('[class*="raceName"]', { timeout: 45000 });
await page
  .waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 25000 })
  .catch(() => {});

const rows = [];
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(350);
  rows.push({
    width,
    ...(await page.evaluate((names) => {
      const node = document.querySelector('[class*="raceName"]');
      const original = node.textContent;
      const originalSize = node.style.fontSize;

      /* The container the cqw resolves against, which is whichever ancestor
         declares a container-type rather than the title's own parent. */
      let container = node.parentElement;
      while (container && getComputedStyle(container).containerType === "normal") {
        container = container.parentElement;
      }
      const cqw = (container ?? document.documentElement).getBoundingClientRect().width / 100;

      const fits = (size) => {
        node.style.fontSize = `${size}px`;
        return node.scrollHeight <= Math.ceil(2 * size * 1.02) + 2;
      };

      const out = {};
      for (const name of names) {
        node.textContent = name;
        let lo = 8;
        let hi = 400;
        while (hi - lo > 0.1) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        out[name] = Number((lo / cqw).toFixed(2));
      }

      node.textContent = original;
      node.style.fontSize = originalSize;
      return out;
    }, NAMES)),
  });
}

const measured = rows.flatMap((row) => NAMES.map((name) => ({ ...row, name, cqw: row[name] })));
const binding = measured.reduce((low, one) => (one.cqw < low.cqw ? one : low));
console.table(rows);
console.log(
  `binding case: "${binding.name}" at ${binding.cqw} cqw, viewport ${binding.width}px.`,
  `\nstate a size at or below it in .raceName.`,
);
await browser.close();
