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

test("the plan lists only real campaigns: live rows link, planned rows do not", () => {
  const live = [...page.matchAll(/<a class="campaign-row" data-status="live" href="([^"]+)"/g)];
  assert.deepEqual(live.map((m) => m[1]), ["/prototype/foredge", "/prototype/foxglove"]);
  const planned = [...page.matchAll(/<div class="campaign-row" data-status="planned"/g)];
  assert.ok(planned.length >= 1, "the plan should show what comes next");
  assert.ok(!/data-status="planned"[^>]*href/.test(page), "a planned campaign must not link anywhere");
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

  const previews = [...page.matchAll(/src="\/prototype\/marketing\/img\/((?:send|tile)-[a-z0-9-]+\.jpg)"/g)].map((m) => m[1]);
  assert.equal(previews.filter((p) => p.startsWith("send-")).length, 4, "the email plate shows a render of each send");
  assert.equal(previews.filter((p) => p.startsWith("tile-")).length, 4, "the campaign plate shows four tile renders");
  for (const p of previews) {
    const f = await stat(new URL(`../public/prototype/marketing/img/${p}`, import.meta.url));
    assert.ok(f.size > 10000, `${p} missing or truncated`);
  }

  const tileLinks = [...page.matchAll(/href="\/prototype\/foxglove\/tiles\/([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  const tileFiles = (await readdir(new URL("../public/prototype/foxglove/tiles/", import.meta.url))).filter((f) => f.endsWith(".html"));
  for (const t of new Set(tileLinks)) {
    assert.ok(tileFiles.includes(t), `plate links ${t} but the file does not exist`);
  }
});
