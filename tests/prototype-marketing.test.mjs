import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const page = await readFile(new URL("../public/prototype/marketing/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/prototype/marketing/css/site.css", import.meta.url), "utf8");
const emailDir = new URL("../public/prototype/foredge/emails/", import.meta.url);

test("the campaigns page ships zero JavaScript and no relative asset paths", () => {
  assert.equal((page.match(/<script/gi) ?? []).length, 0);
  const refs = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(
      ref.startsWith("/prototype") || ref.startsWith("#") || ref === "/",
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

test("each status chip speaks in its own campaign's voice, and every value is that campaign's", async () => {
  // fill "transparent" means the chip sits on the page's paper, like the ghost
  // and outline buttons those campaigns ship
  const chips = {
    foredge: { fill: "transparent", text: "#1a1a17", edge: "#5f5f5d", stroke: "1px", radius: "6px", track: "0.01em", weight: 300, face: "Fraunces", pairing: "--ash" },
    foxglove: { fill: "#fef1ec", text: "#11223f", edge: "#f6bba4", stroke: "1px", radius: "0", track: "0.01em", weight: 300, face: "Cormorant Garamond", pairing: "--peach" },
    foxtail: { fill: "transparent", text: "#006eff", edge: "#006eff", stroke: "1.5px", radius: "999px", track: "-0.01em", weight: 400, face: "Anton", pairing: "--voltage" },
    foundry: { fill: "#23231f", text: "#f4f2ee", stroke: "0", radius: "0", track: "-0.02em", weight: 400, face: "Inter Tight", pairing: "--ink" },
    forecourt: { fill: "#f6b83c", text: "#1e2a1e", stroke: "0", radius: "999px", track: "-0.01em", weight: 400, face: "Lora", pairing: "--marigold" },
  };

  for (const [brand, chip] of Object.entries(chips)) {
    assert.ok(page.includes(`status-pill demo-${brand}`), `row ${brand} lost its branded chip`);
    const rule = css.match(new RegExp(`\\.demo-${brand} \\{[^}]+\\}`))?.[0];
    assert.ok(rule, `.demo-${brand} has no rule`);

    const source = await readFile(new URL(`../public/prototype/${brand}/css/site.css`, import.meta.url), "utf8");

    assert.ok(rule.includes(`border-width: ${chip.stroke}`), `.demo-${brand} must draw its own ${chip.stroke} stroke`);
    assert.ok(rule.includes(`border-radius: ${chip.radius}`), `.demo-${brand} must take its own ${chip.radius} corner`);
    if (chip.radius === "0") {
      // a square corner is the absence of a radius, so prove the campaign draws
      // panels that way rather than letting the check pass by default
      const panels = [...source.matchAll(/\.(chip|render|well|plate|frame)[^{]*\{[^}]+\}/g)].map((m) => m[0]);
      const square = panels.filter((p) => /background|border/.test(p) && !/border-radius/.test(p));
      assert.ok(square.length > 0, `${brand} declares no square-cornered panel, so a 0 radius is not its vocabulary`);
    } else {
      assert.ok(source.includes(`border-radius: ${chip.radius}`), `${chip.radius} is not a ${brand} corner`);
    }

    assert.ok(rule.includes(`--track: ${chip.track}`), `.demo-${brand} must carry its own ${chip.track} tracking`);
    assert.ok(source.includes(`letter-spacing: ${chip.track}`), `${chip.track} is not a ${brand} tracking value`);

    assert.ok(rule.includes(`font-weight: ${chip.weight}`), `.demo-${brand} must be set at ${chip.weight}`);
    assert.ok(source.includes(`font-weight: ${chip.weight}`), `${brand} never sets ${chip.weight}; a chip may not invent a weight for a face its campaign ships`);

    // values checked one at a time let an invented pairing through: Forecourt
    // ships marigold and it ships 24px cards, but never a marigold 24px card.
    // The surface a chip borrows has to exist as one object in the campaign.
    if (chip.fill !== "transparent") {
      const blocks = [...source.matchAll(/\{[^}]+\}/g)].map((m) => m[0]);
      const named = blocks.filter((b) => b.includes(`var(${chip.pairing})`) || b.toLowerCase().includes(chip.fill));
      const together = named.some((b) => {
        if (chip.radius === "0") return !/border-radius/.test(b);
        if (b.includes(`border-radius: ${chip.radius}`)) return true;
        // a fill rule that rides a shape rule, like .pill-go on .pill
        const selector = source.slice(0, source.indexOf(b)).match(/([.#][\w-]+)[^{]*$/)?.[1];
        return Boolean(selector && new RegExp(`\\${selector.slice(0, 5)}[\\w-]*[^{]*\\{[^}]*border-radius: ${chip.radius}`).test(source));
      });
      assert.ok(together, `${brand} never puts ${chip.fill} on a ${chip.radius} surface; the chip is borrowing a pairing its campaign does not draw`);
    }

    assert.ok(rule.includes(`'${chip.face}'`), `.demo-${brand} must be set in ${chip.face}, the face its campaign displays in`);
    assert.ok(source.includes(`'${chip.face}'`), `${chip.face} is not a ${brand} face`);
    const faceRule = css.match(new RegExp(`@font-face \\{[^}]*'${chip.face}'[^}]+\\}`))?.[0] ?? "";
    if (chip.face !== "Fraunces") {
      assert.ok(faceRule.includes(`/prototype/${brand}/fonts/`), `${chip.face} must be served from ${brand}'s own font directory`);
    }
    assert.ok(/font-display: swap/.test(faceRule), `${chip.face} must load with font-display: swap`);

    for (const hex of [chip.text, chip.edge, chip.fill].filter((v) => v && v.startsWith("#"))) {
      assert.ok(rule.includes(hex), `.demo-${brand} does not use ${hex}`);
      assert.ok(source.toLowerCase().includes(hex), `${hex} is not a ${brand} color; a chip may only quote values that campaign already ships`);
    }

    const ground = chip.fill === "transparent" ? "#ffffff" : chip.fill;
    const ratio = contrast(chip.text, ground);
    assert.ok(ratio >= 3, `${brand} chip text is ${ratio.toFixed(2)}:1 on its ground, under the 3:1 floor for large text`);
    if (brand !== "foxtail") {
      assert.ok(ratio >= 4.5, `${brand} chip text is ${ratio.toFixed(2)}:1; only Foxtail is allowed the large-text floor, because its palette holds no darker blue`);
    }
  }

  const foxtailSize = Number(chips.foxtail && css.match(/\.demo-foxtail \{[^}]*font-size: (\d+)px/)[1]);
  assert.ok(foxtailSize >= 24, `Foxtail is ${foxtailSize}px; at 4.49:1 it only clears WCAG as large text, which is 24px at Anton's single weight of 400`);

  let borrowed = 0;
  for (const [file, brand] of [["cormorant-garamond-latin.woff2", "foxglove"], ["anton-latin.woff2", "foxtail"], ["inter-tight-latin.woff2", "foundry"], ["lora-latin.woff2", "forecourt"]]) {
    const f = await stat(new URL(`../public/prototype/${brand}/fonts/${file}`, import.meta.url));
    assert.ok(f.size > 10000, `${file} is missing or truncated`);
    borrowed += f.size;
  }
  assert.ok(borrowed < 130000, `the four borrowed faces total ${borrowed} bytes; the page's stated budget for them is 130000`);
  assert.ok(css.includes(`${Math.round(borrowed / 1024)}KB`), `the stylesheet states a payload that is not ${Math.round(borrowed / 1024)}KB`);

  assert.ok(!/\.status-live|\.status-ghost|status-demo/.test(css + page), "the retired status classes must be gone");
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
