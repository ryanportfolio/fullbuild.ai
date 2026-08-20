import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const base = new URL("../public/prototype/foundry/", import.meta.url);
const page = await readFile(new URL("index.html", base), "utf8");
const css = await readFile(new URL("css/site.css", base), "utf8");
const email = await readFile(new URL("emails/fall-leasing.html", base), "utf8");

test("the send is a real hybrid email: tables, mso wrapper, VML pills, preheader, zero JavaScript, zero images", () => {
  assert.equal((email.match(/<script/gi) ?? []).length, 0, "the email carries a script tag");
  assert.equal((email.match(/<img/gi) ?? []).length, 0, "the send is live text only; an img tag breaks the no-images guarantee");
  assert.ok(/<!--\[if mso\]>/.test(email), "the mso conditional wrapper is missing");
  assert.ok(/v:roundrect/.test(email), "the VML pill for the Word engine is missing");
  assert.ok((email.match(/role="presentation"/g) ?? []).length >= 10, "layout tables must carry role=\"presentation\"");
  assert.ok(/mso-line-height-rule:\s*exactly/.test(email), "crushed leading needs mso-line-height-rule where it matters");
  assert.ok(/display:none; max-height:0; overflow:hidden; mso-hide:all/.test(email), "the hidden preheader div is missing");
  assert.ok(/<html lang="en"/.test(email), "the root must declare its language");
});

test("dark mode is declared both ways and announced to the client", () => {
  assert.ok(/<meta name="color-scheme" content="light dark">/.test(email), "the color-scheme meta is missing");
  assert.ok(/<meta name="supported-color-schemes" content="light dark">/.test(email), "the supported-color-schemes meta is missing");
  assert.ok(/@media \(prefers-color-scheme: dark\)/.test(email), "the standards dark-mode path is missing");
  assert.ok(/\[data-ogsc\]/.test(email) && /\[data-ogsb\]/.test(email), "the Outlook rewriter hooks are missing");
});

test("the send stays under Gmail's clip point and holds the type and character contract", async () => {
  const f = await stat(new URL("emails/fall-leasing.html", base));
  assert.ok(f.size < 102400, `the email is ${f.size} bytes; Gmail clips messages over 102400`);

  const sizes = [...email.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  const below = sizes.filter((s) => s > 1 && s < 16);
  assert.equal(below.length, 0, `the email sets ${below.join(",")}px type under the 16px floor`);
  assert.ok(!/[—–…‘’“” ​]/.test(email), "the email carries a banned character");
  assert.ok(!/linear-gradient|box-shadow/.test(email), "the system is flat; no gradients or shadows");
});

test("the case page links the artifacts, uses root-absolute paths, and holds the same contracts", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  assert.ok(page.includes("/prototype/foundry/emails/fall-leasing.html"), "the case page does not open the send");
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#") || ref === "/",
      `${ref} must be root-absolute: the rewrite serves /prototype/foundry without a trailing slash`
    );
  }
  for (const [name, text] of [["index.html", page], ["site.css", css]]) {
    assert.ok(!/[—–…‘’“” ​]/.test(text), `${name} carries a banned character`);
    assert.ok(!/linear-gradient|box-shadow/.test(text), `${name} breaks the flat contract`);
  }
  const cssSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(cssSizes.filter((s) => s < 16).length, 0, "the case page sets type under the 16px floor");
});

test("the dark-mode proof is real: both renders exist and the fonts are real files", async () => {
  for (const img of ["render-light.jpg", "render-dark.jpg"]) {
    const f = await stat(new URL(`img/${img}`, base));
    assert.ok(f.size > 10000, `${img} missing or truncated`);
  }
  for (const font of ["inter-tight-latin.woff2", "inter-latin.woff2"]) {
    const f = await stat(new URL(`fonts/${font}`, base));
    assert.ok(f.size > 10000, `${font} missing or truncated`);
  }
});

test("no invented performance data, and the colophon holds the owner's line", () => {
  for (const [name, text] of [["index.html", page], ["fall-leasing.html", email]]) {
    assert.ok(
      !/impressions|open rate|click rate|engagement|followers|\bCTR\b|click-through|\bCPM\b|conversion rate|deliverability score/i.test(text),
      `${name} implies performance data; the send never went out`
    );
  }
  assert.ok(page.includes("Spec work by Ryan Allen | all demo concepts"), "the colophon line drifted");
});
