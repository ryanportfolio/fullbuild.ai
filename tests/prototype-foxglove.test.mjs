import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const base = new URL("../public/prototype/foxglove/", import.meta.url);
const page = await readFile(new URL("index.html", base), "utf8");
const css = await readFile(new URL("css/site.css", base), "utf8");
const brand = await readFile(new URL("brand.html", base), "utf8");
const brandCss = await readFile(new URL("css/brand.css", base), "utf8");

const FEEDS = ["feed-launch.html", "feed-deadline.html", "feed-suites.html"];
const CAROUSEL = ["carousel-01.html", "carousel-02.html", "carousel-03.html", "carousel-04.html"];
const STORIES = ["story-teaser.html", "story-poll.html", "story-lastcall.html"];

// The banned characters live here as escapes on purpose: written literally, this
// file would trip the same sweep it enforces.
const BANNED = /[—–…‘’“”]/;

const tiles = {};
for (const f of [...FEEDS, ...CAROUSEL, ...STORIES]) {
  tiles[f] = await readFile(new URL(`tiles/${f}`, base), "utf8");
}
const everyTile = Object.values(tiles).join("\n");

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

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
    assert.ok(!BANNED.test(tile), `${f} carries a banned character`);
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
      ref.startsWith("/prototype") || ref.startsWith("#") || ref === "/",
      `${ref} must be root-absolute: the rewrite serves /prototype/foxglove without a trailing slash`
    );
  }
  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!BANNED.test(text), `${name} carries a banned character`);
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

test("the brand page holds the same hygiene contract as the campaign", () => {
  assert.equal((brand.match(/<script/gi) ?? []).length, 0, "the brand page carries a script tag");
  for (const [name, text] of [["brand.html", brand], ["brand.css", brandCss]]) {
    assert.ok(!BANNED.test(text), `${name} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(text), `${name} uses a gradient or shadow`);
  }
  const refs = [...brand.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#") || ref === "/",
      `${ref} must be root-absolute: the rewrite serves /prototype/foxglove/brand without a trailing slash`
    );
  }
  const sizes = [
    ...[...brand.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])),
    ...[...brandCss.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])),
  ];
  const below = sizes.filter((s) => s < 16);
  assert.equal(below.length, 0, `the brand page sets ${below.join(",")}px type under its own 16px floor`);
  assert.ok(brand.includes("Spec work by Ryan Allen | all demo concepts"), "the colophon line is missing");
});

test("every colour the brand page prints is a colour the campaign already ships", () => {
  const shipped = new Set(
    [...`${css}\n${page}\n${everyTile}`.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase())
  );
  const printed = new Set(
    [...`${brand}\n${brandCss}`.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase())
  );
  assert.ok(printed.size >= 11, "the palette section stopped drawing its swatches from literal hexes");
  for (const hex of printed) {
    assert.ok(shipped.has(hex), `${hex} appears on the brand page but nowhere in the campaign it documents`);
  }
});

test("every contrast ratio the page prints is the ratio of the pair it draws", () => {
  const rows = [...brand.matchAll(/<tr>\s*<th scope="row">([^<]+)<\/th>[\s\S]*?background:(#[0-9a-f]{6});color:(#[0-9a-f]{6})[\s\S]*?class="num">([\d.]+) to 1<\/td>/g)];
  assert.equal(rows.length, 7, "the measured pairings table lost a row");
  for (const [, name, ground, ink, printedRatio] of rows) {
    const measured = contrast(ink, ground);
    assert.equal(
      measured.toFixed(2),
      Number(printedRatio).toFixed(2),
      `${name} prints ${printedRatio} but ${ink} on ${ground} measures ${measured.toFixed(2)}`
    );
    const allowed = /Never type/.test(brand.split(`<th scope="row">${name}</th>`)[1].split("</tr>")[0]);
    assert.equal(
      measured < 4.5,
      allowed,
      `${name} at ${measured.toFixed(2)} to 1 is filed on the wrong side of the 4.5 to 1 bar`
    );
  }
});

test("coral is type only inside a do-not card, and one do-not card really uses it", () => {
  const cards = [...brand.matchAll(/<div class="pair pair-(yes|no)">([\s\S]*?<\/p>)\s*<\/div>/g)];
  assert.ok(cards.length >= 8, "the do and do not cards stopped parsing");
  const misuse = cards.filter(([, kind]) => kind === "no").map(([whole]) => whole);
  const coralType = misuse.filter((c) => /color:\s*#ff5734|demo-coral-type/.test(c));
  assert.ok(coralType.length > 0, "no do-not card demonstrates coral as type, so the ban is only asserted in prose");

  // The measured pairings table also sets coral type, in the swatch that shows
  // the failure. The test above pins each of those rows to its verdict, so the
  // swatches come out here rather than being argued about twice.
  let rest = brand.replace(/<span class="pairswatch"[^>]*>[^<]*<\/span>/g, "");
  for (const card of misuse) rest = rest.replace(card, "");
  assert.ok(
    !/color:\s*#ff5734/.test(rest) && !/demo-coral-type/.test(rest),
    "coral is used as a text colour outside a do-not card, where it measures 2.85 to 1"
  );
  assert.ok(
    !/color:\s*#ff5734/.test(brandCss.replace(/\.demo-coral-type \{[^}]+\}/, "")),
    "brand.css sets coral as a text colour outside the misuse specimen"
  );
});

test("every measurement the brand page states is the measurement the tiles ship", () => {
  for (const [f, tile] of Object.entries(tiles)) {
    assert.ok(/width:\s*88px;\s*\n?\s*height:\s*4px/.test(tile.replace(/\r/g, "")), `${f} does not draw the 88 by 4 rule`);
    assert.ok(/margin-top:\s*32px/.test(tile), `${f} does not sit the rule 32px under the eyebrow`);
  }
  assert.ok(/font-size:\s*30px/.test(everyTile), "the 30px eyebrow left the tiles");
  assert.ok(/letter-spacing:\s*0\.2em/.test(everyTile), "the 0.2em label tracking left the tiles");

  // The ground flip: the last call story is the one coral canvas, and its rule is ink.
  const lastcall = tiles["story-lastcall.html"];
  assert.ok(/background:\s*#ff5734/.test(lastcall), "the last call story is no longer a coral ground");
  assert.ok(/\.rule \{[^}]*background:\s*#11223f/s.test(lastcall), "the last call rule is no longer ink");

  // Safe areas, quoted from the tiles that set them.
  assert.ok(/padding:\s*96px 88px/.test(tiles["feed-deadline.html"]), "the feed inset is not 96px by 88px");
  assert.ok(/left:\s*96px/.test(tiles["story-poll.html"]) && /top:\s*200px/.test(tiles["story-poll.html"]),
    "the story copy inset is not 96px in from the side at 200px down");
  const ctaTop = Number(lastcall.match(/\.cta \{[^}]*top:\s*(\d+)px/s)[1]);
  const ctaHeight = Number(lastcall.match(/\.cta \{[^}]*height:\s*(\d+)px/s)[1]);
  assert.equal(ctaTop + ctaHeight, 1364, "the lowest type in a story moved, so the 1364px figure is stale");

  for (const claim of ["88 by 4", "32px", "30px", "0.2em", "96px", "200px", "1364px", "1080 by 1350", "1080 by 1920", "1200px", "16px"]) {
    assert.ok(brand.includes(claim), `the brand page stopped stating ${claim}`);
  }
});

test("the safe area diagrams are drawn at the real ratios, not eyeballed", () => {
  const pct = (px, edge) => ((px / edge) * 100).toFixed(3);
  const feed = brandCss.match(/\.safe-feed \{([^}]+)\}/)[1];
  assert.ok(feed.includes(`top: ${pct(96, 1350)}%`), `the feed top inset is not ${pct(96, 1350)}% of 1350`);
  assert.ok(feed.includes(`left: ${pct(88, 1080)}%`), `the feed side inset is not ${pct(88, 1080)}% of 1080`);
  assert.ok(feed.includes(`bottom: ${pct(96, 1350)}%`), `the feed foot inset is not ${pct(96, 1350)}% of 1350`);
  const story = brandCss.match(/\.safe-story \{([^}]+)\}/)[1];
  assert.ok(story.includes(`top: ${pct(200, 1920)}%`), `the story top inset is not ${pct(200, 1920)}% of 1920`);
  assert.ok(story.includes(`left: ${pct(96, 1080)}%`), `the story side inset is not ${pct(96, 1080)}% of 1080`);
  // The guide has to end where the page says type ends, not at a mirrored top inset.
  assert.ok(
    story.includes(`bottom: ${pct(1920 - 1364, 1920)}%`),
    `the story guide must stop at 1364px, which is ${pct(1920 - 1364, 1920)}% up from the foot`
  );
  assert.ok(/aspect-ratio:\s*1080 \/ 1350/.test(brandCss) && /aspect-ratio:\s*1080 \/ 1920/.test(brandCss),
    "the diagrams no longer hold the export proportions");
});

test("the brand page is reachable: rewrite, campaign page, and the marketing index all point at it", async () => {
  const config = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.ok(
    config.includes("source: '/prototype/foxglove/brand', destination: '/prototype/foxglove/brand.html'"),
    "the clean URL rewrite for the brand page is missing"
  );
  assert.ok(page.includes('href="/prototype/foxglove/brand"'), "the campaign page does not link its own brand system");
  const index = await readFile(new URL("../public/prototype/marketing/index.html", import.meta.url), "utf8");
  assert.ok(index.includes('href="/prototype/foxglove/brand"'), "the marketing index does not link the brand system");
});

test("no real-platform claims: the page invents no engagement numbers", () => {
  for (const [name, text] of [["index.html", page], ["brand.html", brand]]) {
    assert.ok(!/impressions|engagement rate|followers|reach\b|CTR|click-through/i.test(text),
      `the campaign was never posted; ${name} must not imply performance data`);
  }
});
