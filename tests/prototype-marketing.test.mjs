import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const page = await readFile(new URL("../public/prototype/marketing/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/prototype/marketing/css/site.css", import.meta.url), "utf8");
const emailDir = new URL("../public/prototype/foredge/emails/", import.meta.url);

test("the flight plan ships zero JavaScript and no relative asset paths", () => {
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

test("every number the traffic note claims is reproducible from the shipped files", async () => {
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".html"));
  const claimedFiles = page.match(/(\w+) sends ·/)?.[1];
  assert.equal(claimedFiles, "Four");
  assert.equal(files.length, 4);

  let total = 0;
  for (const f of files) total += (await stat(new URL(f, emailDir))).size;
  const claimedKb = Number(page.match(/(\d+) KB of HTML/)?.[1]);
  const actualKb = Math.round(total / 1024);
  assert.ok(
    Math.abs(claimedKb - actualKb) <= 2,
    `page claims ${claimedKb} KB but the four emails total ${actualKb} KB; update the traffic note`
  );

  for (const f of files) {
    const email = await readFile(new URL(f, emailDir), "utf8");
    assert.equal((email.match(/<script/gi) ?? []).length, 0, `${f} carries a script tag, so "zero JavaScript" is false`);
    const sizes = [...email.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    const below = sizes.filter((s) => s > 1 && s < 16);
    assert.equal(below.length, 0, `${f} sets ${below.join(",")}px type, so "nothing under 16px" is false`);
  }
});

test("the plan lists only real flights: live rows link, planned rows do not", () => {
  const live = [...page.matchAll(/<a class="flight-row" data-status="live" href="([^"]+)"/g)];
  assert.equal(live.length, 1);
  assert.equal(live[0][1], "/prototype/foredge");
  const planned = [...page.matchAll(/<div class="flight-row" data-status="planned"/g)];
  assert.ok(planned.length >= 1, "the plan should show what comes next");
  assert.ok(!/data-status="planned"[^>]*href/.test(page), "a planned flight must not link anywhere");
});

test("the strip opens each mailing and the page holds the type and character contract", async () => {
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".html")).sort();
  const linked = [...page.matchAll(/href="\/prototype\/foredge\/emails\/([a-z-]+\.html)"/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(linked)], files);

  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!/[—–…‘’“”]/.test(text), `${name} carries a banned character`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the page itself sets type under the 16px floor");

  for (const font of ["fraunces-300-latin.woff2", "inter-latin.woff2"]) {
    const f = await stat(new URL(`../public/prototype/foredge/fonts/${font}`, import.meta.url));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }

  const previews = [...page.matchAll(/src="\/prototype\/marketing\/img\/(send-[a-z-]+\.jpg)"/g)].map((m) => m[1]);
  assert.equal(previews.length, 4, "the plate shows a render of each send");
  for (const p of previews) {
    const f = await stat(new URL(`../public/prototype/marketing/img/${p}`, import.meta.url));
    assert.ok(f.size > 10000, `${p} missing or truncated`);
  }
});
