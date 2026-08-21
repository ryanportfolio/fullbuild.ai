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

  assert.equal(facts.templateCommit, "2094fa7b0aef3aaa92b70db5c7c296f5bfbecbdc");
  assert.equal(facts.templateRev, facts.templateCommit.slice(0, 8));
  assert.equal(facts.claudeRulesBlobHash, "2339b2234a1a282d88828ffac71a0722ea1d2308");
  assert.equal(facts.codexRulesBlobHash, "17e15e0e76b0c76722d92ebaf6350a617d3d6777");
  assert.equal(facts.skillsTreeHash, "7d68e369b735a40fe4ee5878abbe488d59728289");
  assert.equal(facts.codexSkillsTreeHash, "5a6240931aec813dd4c751d98cb299eff790e0d1");
  assert.equal(facts.skills.length, facts.skillCount);
  assert.equal(facts.skillCount, 30);
  assert.deepEqual(facts.runtimes, ["Claude Code", "Codex"]);
  assert.equal(facts.runtimeCount, facts.runtimes.length);

  const sum = facts.skills.reduce((a, s) => a + s.bytes, 0);
  assert.equal(sum, facts.onDemandBytes);
  assert.equal(facts.residentBytes, facts.kernelBytes + facts.descIndexBytes);
  assert.equal(facts.codexResidentBytes, facts.codexKernelBytes + facts.codexDescIndexBytes);
  assert.equal(facts.descIndexBytes, facts.skillNameIndexBytes + facts.descriptionValueBytes);
  assert.equal(facts.codexDescIndexBytes, facts.descIndexBytes);
  assert.equal(facts.tokenEstimateCharactersPerToken, 4);
  assert.equal(facts.kernelTokens, Math.round(facts.kernelBytes / facts.tokenEstimateCharactersPerToken));
  assert.equal(facts.residentTokens, Math.round(facts.residentBytes / facts.tokenEstimateCharactersPerToken));
  assert.equal(facts.codexKernelTokens, Math.round(facts.codexKernelBytes / facts.tokenEstimateCharactersPerToken));
  assert.equal(facts.codexDescIndexTokens, Math.round(facts.codexDescIndexBytes / facts.tokenEstimateCharactersPerToken));
  assert.equal(facts.codexResidentTokens, Math.round(facts.codexResidentBytes / facts.tokenEstimateCharactersPerToken));
  assert.equal(facts.lazyRatio, Math.round((facts.onDemandBytes / facts.residentBytes) * 10) / 10);
  assert.equal(facts.lazyRatioBasis, "canonical skill entry bytes / maximum resident bytes");
  assert.equal(
    facts.residentPctOfOnDemand,
    Math.round((facts.residentBytes / facts.onDemandBytes) * 1000) / 10,
  );

  const tally = { core: 0, discipline: 0, extras: 0 };
  for (const s of facts.skills) tally[s.tier] += 1;
  assert.deepEqual(tally, facts.tierCounts);
  assert.deepEqual(facts.tierCounts, { core: 8, discipline: 8, extras: 14 });

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
  assert.equal(facts.codexResidentKiB, Math.round((facts.codexResidentBytes / 1024) * 10) / 10);
  assert.equal(facts.canonicalSkillDirectoryBytes, facts.onDemandBytes + facts.canonicalSkillSupportBytes);
  assert.equal(facts.skillTreeBytes, facts.canonicalSkillDirectoryBytes + facts.skillProvenanceBytes);
  assert.equal(facts.combinedCanonicalAndAdapterEntryBytes, facts.onDemandBytes + facts.codexAdapterSkillEntryBytes);
  assert.match(facts.onDemandScope, /30 canonical \.claude\/skills\/\*\/SKILL\.md git blobs/);
  assert.match(facts.skillsTreeHash, /^[0-9a-f]{40}$/);
  assert.equal(facts.residentEndHex, hex(facts.residentBytes));
  assert.equal(facts.codexResidentEndHex, hex(facts.codexResidentBytes));
  assert.equal(facts.codexKernelEndHex, hex(facts.codexKernelBytes));
  assert.equal(facts.onDemandEndHex, hex(facts.onDemandBytes));
});

test("dither engine: countable honesty is computed, deterministic, and versioned", async () => {
  const facts = JSON.parse(await read("public/harness-firmware/facts.json"));

  // the noise seed IS the measured template revision
  assert.equal(SEED, parseInt(facts.templateRev, 16));

  // spectrum: exactly one dot per allocated 1,024-B flash block, per skill,
  // bands in real flash-address order
  const { bands } = spectrumGeometry(facts, 1200, 520);
  assert.equal(bands.length, facts.skillCount);
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
  const [html, css, facts] = await Promise.all([
    read("public/harness-firmware/index.html"),
    read("public/harness-firmware/src/phosphor.css"),
    read("public/harness-firmware/facts.json").then(JSON.parse),
  ]);

  const biggest = facts.skills[0];
  const smallest = facts.skills[facts.skills.length - 1];
  for (const s of [
    `${fmt(facts.residentBytes)} B`,
    `&approx;${fmt(facts.residentTokens)} tok/turn`,
    `${fmt(facts.kernelBytes)} B`,
    `${fmt(facts.descIndexBytes)} B`,
    `${fmt(facts.codexKernelBytes)} B`,
    `${fmt(facts.codexDescIndexBytes)} B`,
    `${fmt(facts.codexResidentBytes)} B`,
    `&approx;${fmt(facts.codexResidentTokens)} tok/turn`,
    `${fmt(facts.onDemandBytes)} B`,
    `${fmt(facts.canonicalSkillSupportBytes)} B`,
    `${fmt(facts.codexAdapterSkillEntryBytes)} B`,
    `${facts.residentKiB} KiB`,
    `${fmt(facts.onDemandKiB)} KiB`,
    `rev ${facts.templateRev}`,
    facts.skillsTreeHash.slice(0, 8),
    facts.codexSkillsTreeHash.slice(0, 8),
    facts.pitfallExampleDate,
    facts.measuredOn,
    `${fmt(biggest.bytes)} B`,
    `${fmt(smallest.bytes)} B`,
    "github.com/ryanportfolio/Harness-Firmware",
  ]) {
    assert.ok(html.includes(s), `page carries: ${s}`);
  }

  // resident tokens appear consistently in supporting proof, not the hero pitch
  const tokRe = new RegExp(fmt(facts.residentTokens), "g");
  assert.ok((html.match(tokRe) ?? []).length >= 2);

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

  assert.ok(html.includes("project lessons survive the chat"), "proof rail leads with the memory outcome");
  assert.ok(!html.includes("MEASURED FIRMWARE FACTS"), "page does not lead with footprint metrics");
  assert.ok(html.includes("token figures use an approximate four-character conversion"), "token estimates are disclosed");
  assert.ok(!html.includes("context difference"), "byte ratio is not presented as measured context");
  assert.ok(!html.includes("every figure here is measured from the repo, not estimated"), "footer does not overstate estimated figures");
  assert.ok(html.includes("30 main SKILL.md files"), "main-file scope is explicit");
  assert.ok(html.includes("support files are separate"), "support-file separation is disclosed");
  assert.ok(!html.includes("full on-demand skill payload"), "entry-file sum is not called the full payload");
  assert.ok(!html.includes("space each takes on disk"), "entry-file sizes are not called full on-disk sizes");
  assert.ok(!html.includes("9.1 KiB resident every turn"), "runtime maximum is not presented as universal");
  assert.ok(html.includes("Built for Claude Code and Codex"), "runtime heading names the supported agents directly");
  assert.ok(html.includes('href="https://savetokens.tips"'), "context proof links to SaveTokens guidance");
  assert.ok(!html.includes("SCROLL &middot; THE BEAM FOLLOWS"), "hero does not explain its scroll effect");
  assert.ok(!html.includes("green = written to the repo") && !html.includes("blue = only in the live session"), "hero omits the colour decoder");
  assert.match(
    html,
    /<a class="hero-reference mono" href="#context-architecture"><strong>REFERENCES<\/strong> &middot; repo facts read when needed &rarr;<\/a>/,
    "hero explains references in one linked line",
  );
  const newSkills = ["arena", "automate-me", "babysit-ci", "bro", "codex-review", "unslop", "verify-this"];
  assert.match(html, /<h2 class="reveal">Seven new workflows, ready on demand<\/h2>/);
  for (const skill of newSkills) {
    assert.ok(
      html.includes(`/.claude/skills/${skill}/SKILL.md`),
      `new workflow links to canonical source: ${skill}`,
    );
  }
  assert.match(
    html,
    /<a class="chrome-home" href="\/" aria-label="fullbuild\.ai home">\s*<svg class="chrome-home-mark"/,
    "house mark is the accessible fullbuild.ai home link",
  );
  assert.doesNotMatch(html, /<a class="chrome-home"[^>]*>\s*fullbuild\.ai\s*<\/a>/);

  assert.ok(html.includes("ILLUSTRATIVE MEMORY FLOW"), "hypothetical replay is labelled illustrative");
  assert.ok(
    html.indexOf('class="copy reveal">Save a lesson once') < html.indexOf('class="memory-sequence reveal"'),
    "memory benefit precedes the detailed evidence in linear reading order",
  );
  assert.match(
    css,
    /#action \.sec-body\s*\{[\s\S]*?"title sequence"[\s\S]*?"copy sequence"/,
    "memory evidence enters beside the claim instead of below the first view",
  );
  assert.match(
    css,
    /@media \(min-width: 981px\)[\s\S]*?#action \.memory-sequence\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    "desktop memory evidence becomes a compact vertical sequence",
  );
  assert.ok(!html.includes("Every session after that reads it at startup"), "memory loading is not overstated");
  assert.ok(!html.includes("SESSION LOG"), "illustrative replay is not presented as an observed log");
  assert.ok(!html.includes("trap skipped"), "unverified avoided outcome is not claimed");

  // every baked visual has real alt text
  for (const m of html.matchAll(/<img class="bake"[^>]*>/g)) {
    assert.match(m[0], /alt="[^"]{40,}"/, `bake img needs descriptive alt: ${m[0].slice(0, 80)}`);
  }
  assert.ok(html.includes('class="skip-link"'), "skip link present");
  assert.ok(html.includes('href="/harness-firmware/new/">CREATE A PROJECT'), "primary CTA opens the hosted creator");
  assert.ok(html.includes('href="https://github.com/ryanportfolio/Harness-Firmware/generate"'), "GitHub template remains a safe fallback");
  assert.ok(html.includes('<link rel="canonical" href="https://fullbuild.ai/harness-firmware">'), "canonical route is explicit");
  assert.ok(html.includes('<meta property="og:url" content="https://fullbuild.ai/harness-firmware">'), "Open Graph route is explicit");
  assert.ok(html.includes('<meta name="twitter:image" content="https://fullbuild.ai/harness-firmware/assets/og.png">'), "Twitter card image is explicit");

  const inventory = html.match(/<ul class="sr-only" id="spectrum-inventory">([\s\S]*?)<\/ul>/)?.[1] ?? "";
  assert.ok(inventory, "full spectrum has a screen-reader inventory");
  const inventoryText = inventory.replace(/<[^>]+>/g, "");
  for (const skill of facts.skills) {
    assert.ok(
      inventoryText.includes(`${skill.name}: ${fmt(skill.bytes)} B main instruction file, ${skill.tier}`),
      `accessible spectrum entry: ${skill.name}`,
    );
    assert.ok(
      inventory.includes(`/.claude/skills/${skill.name}/SKILL.md`),
      `spectrum entry links to canonical source: ${skill.name}`,
    );
  }

  const skillRefs = [...html.matchAll(/<a\b(?=[^>]*\bclass="skill-ref")(?=[^>]*\bhref="([^"]+\/\.claude\/skills\/([^/]+)\/SKILL\.md)")[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(skillRefs.length >= facts.skillCount, "skill references link to canonical source files");
  for (const ref of skillRefs) {
    const before = html.slice(Math.max(0, ref.index - 16), ref.index);
    assert.ok(
      /<(?:strong|b)>\s*$/.test(before) || /<(?:strong|b)>/.test(ref[3]),
      `skill reference is bold: ${ref[2]}`,
    );
  }
});

test("editorial structure keeps proof, navigation, and controls semantic", async () => {
  const [html, facts] = await Promise.all([
    read("public/harness-firmware/index.html"),
    read("public/harness-firmware/facts.json").then(JSON.parse),
  ]);

  const mainStart = html.search(/<main\b(?=[^>]*\bid="main")[^>]*>/);
  const mainEnd = html.indexOf("</main>", mainStart);
  const heroStart = html.search(/<section\b(?=[^>]*\bid="hero")[^>]*>/);
  assert.ok(mainStart >= 0 && heroStart > mainStart && heroStart < mainEnd, "skip target contains hero");

  const status = html.match(/<nav\b(?=[^>]*\bdata-status-rail\b)[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.match(status, /aria-label="Firmware sections"/, "long page has a labelled index");
  assert.ok(status.includes(facts.repo), "status rail carries repository action");
  assert.ok(html.includes('class="chrome-product mono"'), "mobile rail retains product identity");
  for (const id of ["action", "create", "skills", "flash"]) {
    assert.ok(status.includes(`href="#${id}"`), `index links to ${id}`);
    assert.ok(html.includes(`id="${id}"`), `page exposes ${id}`);
  }

  const proof = html.match(/<section\b(?=[^>]*\bdata-proof-rail\b)[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
  const cells = new Map(
    [...proof.matchAll(/<a\b(?=[^>]*\bdata-proof="([^"]+)")[^>]*>[\s\S]*?<\/a>/g)]
      .map((match) => [match[1], match[0]]),
  );
  assert.deepEqual([...cells.keys()].sort(), ["memory", "runtimes", "skills", "source"]);
  for (const [key, value] of new Map([
    ["skills", facts.skillCount],
    ["runtimes", facts.runtimeCount],
  ])) {
    assert.ok(cells.get(key)?.includes(String(value)), `${key} value comes from facts.json`);
  }
  assert.match(cells.get("memory") ?? "", /project lessons survive the chat/);
  assert.match(cells.get("source") ?? "", />MIT</);

  const creatorStart = html.search(/<section\b(?=[^>]*\bid="create")[^>]*>/);
  const creatorEnd = html.indexOf("</section>", creatorStart);
  const creator = creatorStart >= 0 ? html.slice(creatorStart, creatorEnd) : "";
  assert.ok((creator.match(/class="creator-card"/g) ?? []).length === 3, "creator shows the complete three-step flow");
  assert.match(creator, /WEB &middot; WINDOWS &middot; MACOS/, "creator exposes every launch surface");
  assert.match(creator, /existing GH login/i, "creator explains local GitHub reuse");
  assert.match(
    creator,
    /<a class="creator-visual creator-link" href="\/harness-firmware\/new\/"/,
    "launcher illustration opens the hosted project creator",
  );

  const contextStart = html.search(/<section\b(?=[^>]*\bid="context-architecture")[^>]*>/);
  const contextEnd = html.indexOf("</section>", contextStart);
  const contextArchitecture = contextStart >= 0 ? html.slice(contextStart, contextEnd) : "";
  assert.ok(contextArchitecture, "page explains the routed context architecture");
  assert.match(contextArchitecture, />CLAUDE\.md</, "context diagram names the canonical Claude root file");
  assert.match(contextArchitecture, />AGENTS\.md</, "context diagram names the Codex root file");
  assert.match(contextArchitecture, /class="root-file-ref"[^>]+CLAUDE\.md[^>]*><strong>CLAUDE\.md<\/strong>/);
  assert.match(contextArchitecture, /class="root-file-ref"[^>]+AGENTS\.md[^>]*><strong>AGENTS\.md<\/strong>/);
  assert.ok(
    (contextArchitecture.match(/class="context-file/g) ?? []).length >= 8,
    "context diagram exposes root files and focused references",
  );

  const faqStart = html.search(/<section\b(?=[^>]*\bid="faq")[^>]*>/);
  const faqEnd = html.indexOf("</section>", faqStart);
  const faq = faqStart >= 0 ? html.slice(faqStart, faqEnd) : "";
  assert.ok((faq.match(/<details/g) ?? []).length >= 4, "operational FAQ uses native details");

  const spectrum = html.match(/<[^>]+\b(?=[^>]*\bid="spectrum")[^>]*>/)?.[0] ?? "";
  assert.match(spectrum, /\btabindex="0"/, "spectrum is keyboard focusable");
  assert.match(spectrum, /\brole="group"/, "spectrum remains a grouped control");
  assert.match(spectrum, /aria-describedby="[^"]*spectrum-help[^"]*spectrum-readout[^"]*"/);
  const lowerBakes = [...html.matchAll(/<img class="bake"[^>]*>/g)].filter((match) => !match[0].includes("hero"));
  for (const image of lowerBakes) {
    assert.match(image[0], /loading="lazy"/, "every lower raster diagram lazy-loads");
  }
});

test("runtime exposes deterministic and inclusive interaction paths", async () => {
  const [js, css] = await Promise.all([
    read("public/harness-firmware/src/phosphor.js"),
    read("public/harness-firmware/src/phosphor.css"),
  ]);

  assert.match(js, /addEventListener\(\s*['"]keydown['"]/, "spectrum listens for keyboard input");
  assert.match(js, /ArrowLeft|ArrowRight/, "spectrum supports arrow navigation");
  assert.match(js, /preventDefault\(\)/, "handled spectrum keys do not scroll the page");
  assert.match(
    js,
    /const\s+motionQuery\s*=\s*matchMedia\(\s*['"]\(prefers-reduced-motion: reduce\)['"]\s*\)/,
    "runtime retains the MediaQueryList",
  );
  assert.match(
    js,
    /motionQuery\.addEventListener\(\s*['"]change['"]/,
    "reduced-motion preference stays live",
  );
  assert.match(js, /ResizeObserver|addEventListener\(['"]resize['"]/, "hero responds to geometry changes");
  assert.match(js, /window\.__capture\s*=/, "capture can freeze the runtime deterministically");
  assert.match(js, /draw\(beats\[beat\],\s*0\)/, "all named hero beats use fixed drift");
  assert.match(js, /const\s+captureBeats\s*=\s*\[/, "capture beats are validated before the async hero exists");
  assert.match(js, /function\s+settleCapture\s*\(/, "capture has one synchronous settle path");
  assert.match(js, /revealTimers\.clear\(\)/, "capture settles pending reveals");
  assert.match(js, /captureBeat\s*=\s*beat/, "early named beats are queued");
  assert.match(js, /if\s*\(captureFrozen\)\s+hold\(captureBeat\)/, "hero resize preserves a held beat");
  assert.ok((js.match(/controller\.stop\(true\)/g) ?? []).length >= 2, "capture snapshots complete transcripts");
  assert.match(js, /const\s+ensureBandVisible\s*=/, "keyboard selection keeps its band visible");
  assert.match(js, /if\s*\(band\.name\s*===\s*currentName\)/, "same-band pointer movement avoids repainting");
  const replay = js.match(/\/\/ ---------- console replays[\s\S]*?\/\/ ---------- shared engine state/)?.[0] ?? "";
  assert.match(replay, /clear(?:Timeout|Interval)\s*\(/, "offscreen replay work is cancellable");
  assert.ok(!replay.includes(".disconnect()"), "replay observer remains able to stop offscreen work");
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.skill-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, "mobile inventory stays compact in two columns");
  assert.match(css, /\.product-short\s*\{[^}]*display:\s*none/, "status rail has an explicit compact product mark");
  assert.ok(!css.includes('.firmware-index a[href="#kernel"] { display: none; }'), "narrow rail never drops Kernel");
  assert.match(css, /\.slab[^\{]*\{[^}]*min-width:\s*0/, "install slabs can shrink inside the mobile grid");
  assert.match(css, /\.capture-frozen\s+\.reveal\s*\{[^}]*opacity:\s*1/, "capture CSS settles reveal state immediately");
  assert.match(css, /\.capture-frozen\s+\.readout\s+\.tick\s*\{[^}]*animation:\s*none/, "capture CSS freezes the measured pulse");
});

test("constraint contract holds in the stylesheet", async () => {
  const css = await read("public/harness-firmware/src/phosphor.css");

  // the phosphor law: declared hues only
  const declared = new Set(["#070B0C", "#5FD9FF", "#A6FF5E", "#22352A", "#E8F4EA"]);
  for (const m of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    assert.ok(declared.has(m), `undeclared hue: ${m}`);
  }
  assert.ok(!css.includes("linear-gradient"), "light exists only as dots, no gradients");
  assert.ok(!css.includes("radial-gradient"), "no gradients");
  assert.ok(!css.includes("backdrop-filter"), "no glassmorphism");
  assert.ok(!css.includes("box-shadow"), "halos are dot density, not shadows");
  assert.ok(!css.includes("text-shadow"), "glow is dithered, never blurred");
  assert.ok(!/@import|fonts\.googleapis/.test(css), "fonts self-hosted only");
  assert.ok(css.includes('url("/harness-firmware/fonts/Unbounded'), "Unbounded self-hosted");
  assert.ok(css.includes("prefers-reduced-motion"), "reduced motion honored");
  assert.ok(css.includes("3.146s"), "the pulse is a measurement (3,146 tok / 1000)");

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
      r.startsWith("/")
        || r.startsWith("#")
        || r === "https://fullbuild.ai/harness-firmware"
        || r.startsWith("https://github.com/ryanportfolio/")
        || r === "https://savetokens.tips",
      `unexpected external reference: ${r}`,
    );
  }

  // no-JS completeness: baked fallbacks + font + license actually shipped
  for (const f of [
    "public/harness-firmware/fallback/hero.png",
    "public/harness-firmware/fallback/hero@2x.png",
    "public/harness-firmware/fallback/core-halo.png",
    "public/harness-firmware/fallback/spectrum.png",
    "public/harness-firmware/fallback/tubes.png",
    "public/harness-firmware/fonts/Unbounded[wght].ttf",
    "public/harness-firmware/fonts/OFL.txt",
    "public/harness-firmware/assets/favicon.svg",
  ]) {
    assert.ok(await exists(f), `missing shipped asset: ${f}`);
  }
  assert.ok(html.includes('class="no-js"'), "no-js class present for fallback styling");
});
