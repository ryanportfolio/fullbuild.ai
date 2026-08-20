import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const base = new URL("../public/prototype/forecourt/", import.meta.url);
const page = await readFile(new URL("index.html", base), "utf8");
const css = await readFile(new URL("css/site.css", base), "utf8");
const email = await readFile(new URL("emails/market-weekend.html", base), "utf8");

const tiles = ["feed-announce", "feed-roster", "feed-night", "story-lastcall"];
const ads = ["billboard-970x250", "halfpage-300x600", "mpu-300x250"];
const units = {};
for (const t of tiles) units[`tiles/${t}.html`] = await readFile(new URL(`tiles/${t}.html`, base), "utf8");
for (const a of ads) units[`ads/${a}.html`] = await readFile(new URL(`ads/${a}.html`, base), "utf8");

const banned = new RegExp("[\\u2014\\u2013\\u2026\\u2018\\u2019\\u201C\\u201D\\u00A0\\u200B]");

test("the send is a real hybrid email: tables, mso wrapper, VML pills, preheader, zero JavaScript, zero images", () => {
  assert.equal((email.match(/<script/gi) ?? []).length, 0, "the email carries a script tag");
  assert.equal((email.match(/<img/gi) ?? []).length, 0, "the send is live text only; an img tag breaks the no-images guarantee");
  assert.ok(/<!--\[if mso\]>/.test(email), "the mso conditional wrapper is missing");
  assert.ok(/v:roundrect/.test(email), "the VML pill for the Word engine is missing");
  assert.ok((email.match(/role="presentation"/g) ?? []).length >= 10, "layout tables must carry role=\"presentation\"");
  assert.ok(/display:none; max-height:0; overflow:hidden; mso-hide:all/.test(email), "the hidden preheader div is missing");
  assert.ok(/<html lang="en"/.test(email), "the root must declare its language");
});

test("dark mode is declared both ways, and the pinned pieces are pinned", () => {
  assert.ok(/<meta name="color-scheme" content="light dark">/.test(email), "the color-scheme meta is missing");
  assert.ok(/<meta name="supported-color-schemes" content="light dark">/.test(email), "the supported-color-schemes meta is missing");
  assert.ok(/@media \(prefers-color-scheme: dark\)/.test(email), "the standards dark-mode path is missing");
  assert.ok(/\[data-ogsc\]/.test(email) && /\[data-ogsb\]/.test(email), "the Outlook rewriter hooks are missing");
  for (const pin of [".band", ".pill-go", ".pill-flip", ".bead-radish", ".bead-cornflower", ".bead-marigold", ".bead-leaf"]) {
    for (const hook of ["data-ogsb", "data-ogsc"]) {
      assert.ok(email.includes(`[${hook}] ${pin}`), `${pin} is not pinned under ${hook}; Outlook has shipped one hook without the other`);
    }
  }
});

test("both pills land on live pages; only the list-management links stay placeholders", () => {
  assert.equal((email.match(/href="https:\/\/fullbuild\.ai\/prototype\/forecourt"/g) ?? []).length, 2, "the market pill must point at the live campaign page in both the VML and the anchor");
  assert.equal((email.match(/href="https:\/\/fullbuild\.ai\/prototype\/foxtail"/g) ?? []).length, 2, "the projector-night pill must point at the live Foxtail page in both the VML and the anchor");
  const placeholders = [...email.matchAll(/https:\/\/forecourt\.example\/([a-z-]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(placeholders)].sort(), ["preferences", "unsubscribe"], "only unsubscribe and preferences may stay on the placeholder domain; every button a reader clicks must resolve");
  const anchors = (email.match(/<a href/g) ?? []).length;
  const blank = (email.match(/target="_blank" rel="noopener"/g) ?? []).length;
  assert.equal(blank, anchors, "every anchor needs target=\"_blank\"; without it a click inside the case-page iframe navigates the iframe itself");
});

test("the send stays under Gmail's clip point and holds the type and character contract", async () => {
  const f = await stat(new URL("emails/market-weekend.html", base));
  assert.ok(f.size < 102400, `the email is ${f.size} bytes; Gmail clips messages over 102400`);

  const sizes = [...email.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const below = sizes.filter((s) => s > 1 && s < 16);
  assert.equal(below.length, 0, `the email sets ${below.join(",")}px type under the 16px floor`);
  assert.ok(!banned.test(email), "the email carries a banned character");
  assert.ok(!/linear-gradient|box-shadow/.test(email), "the system is flat; no gradients or shadows");
});

test("every tile and ad unit is live HTML holding the same system", () => {
  for (const [name, text] of Object.entries(units)) {
    assert.equal((text.match(/<script/gi) ?? []).length, 0, `${name} carries a script tag`);
    assert.ok(!banned.test(text), `${name} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(text), `${name} breaks the flat contract`);
    assert.ok(text.includes("'Lora', Georgia"), `${name} dropped the serif stack`);
    const floor = name.startsWith("tiles/") ? 30 : 16;
    const sizes = [...text.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const below = sizes.filter((s) => s < floor);
    assert.equal(below.length, 0, `${name} sets ${below.join(",")}px type under its ${floor}px floor`);
  }
});

test("one story: the dates, the address, and the vendor names never drift between channels", () => {
  const everywhere = [["email", email], ...Object.entries(units)];
  for (const [name, text] of everywhere) {
    assert.ok(/October 3|This Saturday|Saturday at dusk/.test(text), `${name} lost the date`);
  }
  for (const [name, text] of [["email", email], ["tiles/feed-roster.html", units["tiles/feed-roster.html"]], ["ads/halfpage-300x600.html", units["ads/halfpage-300x600.html"]]]) {
    for (const vendor of ["Foredge Books", "Foxglove Paper", "Foxtail Drive-In"]) {
      assert.ok(text.includes(vendor), `${name} dropped ${vendor}`);
    }
  }
  for (const [name, text] of [["email", email], ["tiles/feed-announce.html", units["tiles/feed-announce.html"]], ["tiles/story-lastcall.html", units["tiles/story-lastcall.html"]]]) {
    assert.ok(text.includes("12 Water Street"), `${name} dropped the address`);
  }
});

test("the case page links every unit, uses root-absolute paths, and holds the contracts", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  assert.ok(page.includes("/prototype/forecourt/emails/market-weekend.html"), "the case page does not open the send");
  for (const t of tiles) assert.ok(page.includes(`/prototype/forecourt/tiles/${t}.html`), `the case page does not open ${t}`);
  for (const a of ads) assert.ok(page.includes(`/prototype/forecourt/ads/${a}.html`), `the case page does not open ${a}`);
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#") || ref === "/",
      `${ref} must be root-absolute: the rewrite serves /prototype/forecourt without a trailing slash`
    );
  }
  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!banned.test(text), `${name} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(text), `${name} breaks the flat contract`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the case page sets type under the 16px floor");
});

test("the fonts are real files and nothing invents performance data", async () => {
  for (const font of ["lora-latin.woff2", "inter-latin.woff2"]) {
    const f = await stat(new URL(`fonts/${font}`, base));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }
  for (const img of ["render-light.jpg", "render-dark.jpg"]) {
    const f = await stat(new URL(`img/${img}`, base));
    assert.ok(f.size > 10000, `${img} missing or truncated`);
  }
  for (const [name, text] of [["index.html", page], ["market-weekend.html", email], ...Object.entries(units)]) {
    assert.ok(
      !/impressions|open rate|click rate|engagement|followers|\bCTR\b|click-through|\bCPM\b|conversion rate|deliverability score/i.test(text),
      `${name} implies performance data; nothing ran`
    );
  }
  assert.ok(page.includes("Spec work by Ryan Allen | all demo concepts"), "the colophon line drifted");
});
