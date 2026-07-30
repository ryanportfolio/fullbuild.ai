import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { test } from "node:test";
import { spectrumGeometry, blueNoise64, BAYER8, SEED } from "../public/harness-firmware/src/dither.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => access(new URL(`../${path}`, import.meta.url)).then(() => true, () => false);
const fmt = (n) => n.toLocaleString("en-US");
const hex = (n) => "0x" + n.toString(16).toUpperCase().padStart(5, "0");

test("facts.json is internally consistent (recomputed, not trusted)", async () => {
  const facts = JSON.parse(await read("public/harness-firmware/facts.json"));

  assert.equal(facts.skills.length, facts.skillCount);
  assert.equal(facts.skillCount, 20);

  const sum = facts.skills.reduce((a, s) => a + s.bytes, 0);
  assert.equal(sum, facts.onDemandBytes);
  assert.equal(facts.residentBytes, facts.kernelBytes + facts.descIndexBytes);
  assert.equal(facts.kernelTokens, Math.round(facts.kernelBytes / 4));
  assert.equal(facts.residentTokens, Math.round(facts.residentBytes / 4));
  assert.equal(facts.lazyRatio, Math.round((facts.onDemandBytes / facts.residentBytes) * 10) / 10);
  assert.equal(
    facts.residentPctOfOnDemand,
    Math.round((facts.residentBytes / facts.onDemandBytes) * 1000) / 10,
  );

  const tally = { core: 0, discipline: 0, extras: 0 };
  for (const s of facts.skills) tally[s.tier] += 1;
  assert.deepEqual(tally, facts.tierCounts);
  assert.deepEqual(facts.tierCounts, { core: 6, discipline: 4, extras: 10 });

  assert.equal(facts.blockBytes, 1024);
  let offset = 0;
  let prev = Infinity;
  for (const s of facts.skills) {
    assert.equal(s.hexOffset, hex(offset), s.name);
    assert.equal(s.blocks, Math.ceil(s.bytes / facts.blockBytes), s.name);
    const rem = s.bytes % facts.blockBytes;
    assert.equal(
      s.padFillPct,
      rem === 0 ? 100 : Math.round((rem / facts.blockBytes) * 1000) / 10,
      `${s.name} pad fill`,
    );
    assert.ok(s.bytes <= prev, `size-ordered: ${s.name}`);
    offset += s.bytes;
    prev = s.bytes;
  }
  assert.equal(
    facts.allocatedBlocks,
    facts.skills.reduce((a, s) => a + s.blocks, 0),
    "allocated blocks = sum of per-skill whole blocks",
  );
  assert.equal(facts.residentKiB, Math.round((facts.residentBytes / 1024) * 10) / 10);
  assert.match(facts.skillsTreeHash, /^[0-9a-f]{40}$/);
  assert.equal(facts.residentEndHex, hex(facts.residentBytes));
  assert.equal(facts.onDemandEndHex, hex(facts.onDemandBytes));
});

test("dither engine: countable honesty is computed, deterministic, and versioned", async () => {
  const facts = JSON.parse(await read("public/harness-firmware/facts.json"));

  // the noise seed IS the measured template revision
  assert.equal(SEED, parseInt(facts.templateRev, 16));

  // spectrum: exactly one dot per allocated 1,024-B flash block, per skill,
  // bands in real flash-address order
  const { bands } = spectrumGeometry(facts, 1200, 520);
  assert.equal(bands.length, 20);
  bands.forEach((b, i) => {
    assert.equal(b.name, facts.skills[i].name, `band order ${i}`);
    assert.equal(b.dots.length, b.blocks, `${b.name}: 1 dot = 1 block`);
    assert.equal(b.blocks, Math.ceil(b.bytes / 1024), `${b.name} block count`);
    assert.equal(b.hexOffset, facts.skills[i].hexOffset, `${b.name} address`);
  });

  // determinism: same seed, same dots
  const again = spectrumGeometry(facts, 1200, 520);
  assert.deepEqual(again.bands[0].dots, bands[0].dots);

  // Bayer 8x8 holds every threshold (v+0.5)/64 exactly once
  const seen = new Set([...BAYER8].map((t) => Math.round(t * 64 - 0.5)));
  assert.equal(seen.size, 64);

  // blue-noise tile is a permutation of ranks (every threshold distinct)
  const tile = blueNoise64(SEED);
  assert.equal(new Set([...tile]).size, 64 * 64);
});

test("every figure rendered on the page matches facts.json", async () => {
  const [html, facts] = await Promise.all([
    read("public/harness-firmware/index.html"),
    read("public/harness-firmware/facts.json").then(JSON.parse),
  ]);

  const biggest = facts.skills[0];
  const smallest = facts.skills[facts.skills.length - 1];
  for (const s of [
    `${fmt(facts.residentBytes)} B`,
    `&approx;${fmt(facts.residentTokens)} tok/turn`,
    `${fmt(facts.kernelBytes)} B`,
    `${fmt(facts.descIndexBytes)} B`,
    `${fmt(facts.onDemandBytes)} B`,
    `${facts.residentKiB} KiB`,
    `${fmt(facts.onDemandKiB)} KiB`,
    `${facts.lazyRatio}&times;`,
    `${facts.residentPctOfOnDemand}%`,
    facts.residentEndHex,
    facts.onDemandEndHex,
    `rev ${facts.templateRev}`,
    facts.skillsTreeHash.slice(0, 8),
    facts.pitfallExampleDate,
    facts.measuredOn,
    `${fmt(biggest.bytes)} B`,
    `${biggest.blocks} blocks`,
    `${fmt(smallest.bytes)} B`,
    `${smallest.blocks} dots`,
    `${biggest.blocks} dots`,
    `${facts.allocatedBlocks} blocks`,
    "github.com/ryanportfolio/Harness-Firmware",
  ]) {
    assert.ok(html.includes(s), `page carries: ${s}`);
  }

  // resident tokens appear consistently (hero readout, section 02, meta)
  const tokRe = new RegExp(fmt(facts.residentTokens), "g");
  assert.ok((html.match(tokRe) ?? []).length >= 3);

  // em dashes are banned page-wide; "glow" is banned as a copy term
  assert.ok(!html.includes("&mdash;") && !html.includes("—"), "no em dashes");
  const visibleText = html.replace(/<[^>]+>/g, " ");
  assert.ok(!/glow/i.test(visibleText), "concrete language: no 'glow' in copy");

  // headings never end with a period
  for (const m of html.matchAll(/<h[123][^>]*>(.*?)<\/h[123]>/gs)) {
    const text = m[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();
    assert.ok(!text.endsWith("."), `heading ends with period: ${text}`);
  }
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, "exactly one h1");

  // every baked visual has real alt text
  for (const m of html.matchAll(/<img class="bake"[^>]*>/g)) {
    assert.match(m[0], /alt="[^"]{40,}"/, `bake img needs descriptive alt: ${m[0].slice(0, 80)}`);
  }
  assert.ok(html.includes('class="skip-link"'), "skip link present");
});

test("constraint contract holds in the stylesheet", async () => {
  const css = await read("public/harness-firmware/src/phosphor.css");

  // the phosphor law: declared hues only
  const declared = new Set(["#070B0C", "#5FD9FF", "#A6FF5E", "#22352A", "#E8F4EA"]);
  for (const m of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    assert.ok(declared.has(m), `undeclared hue: ${m}`);
  }
  assert.ok(!css.includes("linear-gradient"), "light exists only as dots — no gradients");
  assert.ok(!css.includes("radial-gradient"), "no gradients");
  assert.ok(!css.includes("backdrop-filter"), "no glassmorphism");
  assert.ok(!css.includes("box-shadow"), "halos are dot density, not shadows");
  assert.ok(!css.includes("text-shadow"), "glow is dithered, never blurred");
  assert.ok(!/@import|fonts\.googleapis/.test(css), "fonts self-hosted only");
  assert.ok(css.includes('url("/harness-firmware/fonts/Unbounded'), "Unbounded self-hosted");
  assert.ok(css.includes("prefers-reduced-motion"), "reduced motion honored");
  assert.ok(css.includes("2.079s"), "the pulse is a measurement (2,079 tok / 1000)");

  // one easing curve
  assert.equal((css.match(/cubic-bezier/g) ?? []).length, 1, "single easing definition");

  // type floor: no declared size below 11px
  for (const m of css.matchAll(/font-size:\s*(?:clamp\(\s*)?([0-9.]+)px/g)) {
    assert.ok(parseFloat(m[1]) >= 11, `type below 11px floor: ${m[0]}`);
  }
});

test("page is routed, self-contained, and complete without JS", async () => {
  const [config, html] = await Promise.all([
    read("next.config.mjs"),
    read("public/harness-firmware/index.html"),
  ]);
  assert.ok(
    config.includes("{ source: '/harness-firmware', destination: '/harness-firmware/index.html' }"),
    "clean URL rewrite present",
  );
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const r of refs) {
    assert.ok(
      r.startsWith("/") || r.startsWith("#") || r.startsWith("https://github.com/ryanportfolio/"),
      `unexpected external reference: ${r}`,
    );
  }

  // no-JS completeness: baked fallbacks + font + license actually shipped
  for (const f of [
    "public/harness-firmware/fallback/hero.png",
    "public/harness-firmware/fallback/hero@2x.png",
    "public/harness-firmware/fallback/core-halo.png",
    "public/harness-firmware/fallback/spectrum.png",
    "public/harness-firmware/fallback/ramp.png",
    "public/harness-firmware/fallback/tubes.png",
    "public/harness-firmware/fonts/Unbounded[wght].ttf",
    "public/harness-firmware/fonts/OFL.txt",
    "public/harness-firmware/assets/favicon.svg",
  ]) {
    assert.ok(await exists(f), `missing shipped asset: ${f}`);
  }
  assert.ok(html.includes('class="no-js"'), "no-js class present for fallback styling");
});
