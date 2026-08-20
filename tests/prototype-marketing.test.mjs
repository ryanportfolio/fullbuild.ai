import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const page = await readFile(new URL("../public/prototype/marketing/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/prototype/marketing/css/site.css", import.meta.url), "utf8");
const emailDir = new URL("../public/prototype/foredge/emails/", import.meta.url);

test("the campaigns page ships zero JavaScript and no relative asset paths", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#"),
      `${ref} must be root-absolute: the rewrite serves /prototype/marketing without a trailing slash, so relative paths 404`
    );
  }
  const cssUrls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  for (const url of cssUrls) {
    assert.ok(url.startsWith("/prototype/"), `${url} in site.css must be root-absolute`);
  }
});

test("the shipped emails hold the program's guarantees, and the page shows none of the build metadata", async () => {
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".html"));
  assert.equal(files.length, 4);

  for (const f of files) {
    const email = await readFile(new URL(f, emailDir), "utf8");
    assert.equal((email.match(/<script/gi) ?? []).length, 0, `${f} carries a script tag`);
    const sizes = [...email.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const below = sizes.filter((s) => s > 1 && s < 16);
    assert.equal(below.length, 0, `${f} sets ${below.join(",")}px type under the 16px floor`);
  }

  assert.ok(
    !/KB of HTML|zero JavaScript|under 16px|self-hosted/i.test(page),
    "build metadata belongs in this test, not in front of the hiring manager"
  );
});

test("the plan lists only real campaigns: live rows link, and the set stands complete", () => {
  const demo = [...page.matchAll(/<a class="campaign-row" data-status="demo" href="([^"]+)"/g)];
  assert.deepEqual(demo.map((m) => m[1]), ["/prototype/foredge", "/prototype/foxglove", "/prototype/foxtail", "/prototype/foundry", "/prototype/forecourt"]);
  const planned = [...page.matchAll(/data-status="planned"/g)];
  assert.equal(planned.length, 0, "all five campaigns are built; no ghost rows remain");
  assert.equal((page.match(/>Demo Example</g) ?? []).length, 5, "every row must label itself a demo; nothing here ran for a client");
  assert.ok(!/class="plan-head"|class="shipped"/.test(page), "the header row and the shipped column are gone; their markup must go with them");
});

test("the strip opens each mailing and the page holds the type and character contract", async () => {
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".html")).sort();
  const linked = [...page.matchAll(/href="\/prototype\/foredge\/emails\/([a-z-]+\.html)"/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(linked)], files);

  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!/[\u2014\u2013\u2026\u2018\u2019\u201C\u201D\u00A0\u200B]/.test(text), `${name} carries a banned character`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the page itself sets type under the 16px floor");

  for (const font of ["fraunces-300-latin.woff2", "inter-latin.woff2"]) {
    const f = await stat(new URL(`../public/prototype/foredge/fonts/${font}`, import.meta.url));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }

  const previews = [...page.matchAll(/src="\/prototype\/marketing\/img\/((?:send|tile|ad|mail)-[a-z0-9-]+\.jpg)"/g)].map((m) => m[1]);
  const fc = (p) => p.includes("-forecourt-");
  assert.equal(previews.filter((p) => p.startsWith("send-")).length, 4, "the email plate shows a render of each send");
  assert.equal(previews.filter((p) => p.startsWith("tile-") && !fc(p)).length, 4, "the social plate shows four tile renders");
  assert.equal(previews.filter((p) => p.startsWith("ad-") && !fc(p)).length, 4, "the paid-media plate shows four unit renders");
  assert.equal(previews.filter((p) => p.startsWith("mail-") && !fc(p)).length, 4, "the dark-mode plate shows four renderings of the one send");
  assert.deepEqual(
    previews.filter(fc).sort(),
    ["ad-forecourt-halfpage.jpg", "mail-forecourt-light.jpg", "tile-forecourt-announce.jpg", "tile-forecourt-night.jpg"],
    "the integrated plate shows one render per channel plus the night tile"
  );
  assert.ok(page.includes('/prototype/foundry/emails/fall-leasing.html'), "the plate opens the foundry send");
  assert.ok(page.includes('/prototype/forecourt/emails/market-weekend.html'), "the plate opens the forecourt send");
  for (const p of previews) {
    const f = await stat(new URL(`../public/prototype/marketing/img/${p}`, import.meta.url));
    assert.ok(f.size > 10000, `${p} missing or truncated`);
  }

  const tileLinks = [...page.matchAll(/href="\/prototype\/foxglove\/tiles\/([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  const tileFiles = (await readdir(new URL("../public/prototype/foxglove/tiles/", import.meta.url))).filter((f) => f.endsWith(".html"));
  for (const t of new Set(tileLinks)) {
    assert.ok(tileFiles.includes(t), `plate links ${t} but the file does not exist`);
  }

  const adLinks = [...page.matchAll(/href="\/prototype\/foxtail\/ads\/([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  const adFiles = (await readdir(new URL("../public/prototype/foxtail/ads/", import.meta.url))).filter((f) => f.endsWith(".html"));
  for (const a of new Set(adLinks)) {
    assert.ok(adFiles.includes(a), `plate links ${a} but the file does not exist`);
  }

  const fcLinks = [...page.matchAll(/href="\/prototype\/forecourt\/((?:tiles|ads|emails)\/[a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  for (const l of new Set(fcLinks)) {
    const f = await stat(new URL(`../public/prototype/forecourt/${l}`, import.meta.url));
    assert.ok(f.size > 500, `plate links ${l} but the file does not exist`);
  }
});
