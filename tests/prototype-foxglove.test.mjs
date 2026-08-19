import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const base = new URL("../public/prototype/foxglove/", import.meta.url);
const page = await readFile(new URL("index.html", base), "utf8");
const css = await readFile(new URL("css/site.css", base), "utf8");

const FEEDS = ["feed-launch.html", "feed-deadline.html", "feed-suites.html"];
const CAROUSEL = ["carousel-01.html", "carousel-02.html", "carousel-03.html", "carousel-04.html"];
const STORIES = ["story-teaser.html", "story-poll.html", "story-lastcall.html"];

test("the campaign ships exactly ten tiles at exact export sizes with zero JavaScript", async () => {
  const files = (await readdir(new URL("tiles/", base))).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(files, [...CAROUSEL, ...FEEDS, ...STORIES].sort());

  for (const f of files) {
    const tile = await readFile(new URL(`tiles/${f}`, base), "utf8");
    assert.equal((tile.match(/<script/gi) ?? []).length, 0, `${f} carries a script tag`);
    const wantH = f.startsWith("story-") ? 1920 : 1350;
    assert.ok(new RegExp(`width:\\s*1080px`).test(tile), `${f} does not fix its artboard width to 1080px`);
    assert.ok(new RegExp(`height:\\s*${wantH}px`).test(tile), `${f} does not fix its artboard height to ${wantH}px`);
    const sizes = [...tile.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const below = sizes.filter((s) => s > 1 && s < 16);
    assert.equal(below.length, 0, `${f} sets ${below.join(",")}px type under the 16px floor`);
    assert.ok(!/[—–…‘’“”]/.test(tile), `${f} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(tile), `${f} uses a gradient or shadow`);
  }
});

test("the case page links every tile, uses root-absolute paths, and holds the character contract", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  for (const f of [...FEEDS, ...CAROUSEL, ...STORIES]) {
    assert.ok(page.includes(`/prototype/foxglove/tiles/${f}`), `case page does not reference ${f}`);
  }
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#"),
      `${ref} must be root-absolute: the rewrite serves /prototype/foxglove without a trailing slash`
    );
  }
  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!/[—–…‘’“”]/.test(text), `${name} carries a banned character`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the case page sets type under the 16px floor");
});

test("fonts and illustration assets exist and are real files", async () => {
  for (const font of ["cormorant-garamond-latin.woff2", "cormorant-garamond-italic-latin.woff2"]) {
    const f = await stat(new URL(`fonts/${font}`, base));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }
  for (const img of ["foxglove-stem.png", "corner-a.png", "corner-b.png", "sprig.png", "meadow-band.png"]) {
    const f = await stat(new URL(`img/${img}`, base));
    assert.ok(f.size > 10000, `${img} missing or truncated`);
  }
});

test("no real-platform claims: the page invents no engagement numbers", () => {
  assert.ok(!/impressions|engagement rate|followers|reach\b|CTR|click-through/i.test(page),
    "the campaign was never posted; the page must not imply performance data");
});
