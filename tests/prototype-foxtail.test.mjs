import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const base = new URL("../public/prototype/foxtail/", import.meta.url);
const page = await readFile(new URL("index.html", base), "utf8");
const css = await readFile(new URL("css/site.css", base), "utf8");

const ADS = {
  "billboard-970x250.html": [970, 250],
  "mpu-300x250.html": [300, 250],
  "halfpage-300x600.html": [300, 600],
  "skyscraper-160x600.html": [160, 600],
  "leaderboard-price-728x90.html": [728, 90],
  "leaderboard-date-728x90.html": [728, 90],
  "social-1080x1080.html": [1080, 1080],
  "story-1080x1920.html": [1080, 1920],
};

test("the campaign ships exactly eight units at exact export sizes with zero JavaScript", async () => {
  const files = (await readdir(new URL("ads/", base))).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(files, Object.keys(ADS).sort());

  for (const [f, [w, h]] of Object.entries(ADS)) {
    const ad = await readFile(new URL(`ads/${f}`, base), "utf8");
    assert.equal((ad.match(/<script/gi) ?? []).length, 0, `${f} carries a script tag`);
    assert.ok(new RegExp(`width:\\s*${w}px`).test(ad), `${f} does not fix its artboard width to ${w}px`);
    assert.ok(new RegExp(`height:\\s*${h}px`).test(ad), `${f} does not fix its artboard height to ${h}px`);
    assert.ok(/overflow:\s*auto/.test(ad), `${f} must let a small viewport scroll to the whole artboard`);
    const sizes = [...ad.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const below = sizes.filter((s) => s > 1 && s < 16);
    assert.equal(below.length, 0, `${f} sets ${below.join(",")}px type under the 16px floor`);
    assert.ok(!/[\u2014\u2013\u2026\u2018\u2019\u201C\u201D\u00A0\u200B]/.test(ad), `${f} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(ad), `${f} uses a gradient or shadow`);
  }
});

test("the case page links every unit, uses root-absolute paths, and holds the character contract", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  for (const f of Object.keys(ADS)) {
    assert.ok(page.includes(`/prototype/foxtail/ads/${f}`), `case page does not reference ${f}`);
  }
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#"),
      `${ref} must be root-absolute: the rewrite serves /prototype/foxtail without a trailing slash`
    );
  }
  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!/[\u2014\u2013\u2026\u2018\u2019\u201C\u201D\u00A0\u200B]/.test(text), `${name} carries a banned character`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the case page sets type under the 16px floor");
});

test("fonts and the illustration exist and are real files", async () => {
  for (const font of ["anton-latin.woff2", "playfair-display-latin.woff2", "inter-latin.woff2"]) {
    const f = await stat(new URL(`fonts/${font}`, base));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }
  const car = await stat(new URL("img/car.png", base));
  assert.ok(car.size > 10000, "car.png missing or truncated");
});

test("no platform claims: the page states the price once and invents no performance data", () => {
  assert.ok(!/impressions|engagement rate|followers|reach\b|\bCTR\b|click-through|\bCPM\b|conversion rate/i.test(page),
    "the campaign never ran; the page must not imply performance data");
  assert.equal((page.match(/\$45/g) ?? []).length, 1, "the case page states the $45 pass exactly once");
});
