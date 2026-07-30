import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
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
  assert.equal(facts.descIndexTokens, Math.round(facts.descIndexBytes / 4));
  assert.equal(facts.residentTokens, Math.round(facts.residentBytes / 4));
  assert.equal(facts.lazyRatio, Math.round((facts.onDemandBytes / facts.residentBytes) * 10) / 10);
  assert.equal(
    facts.residentPctOfOnDemand,
    Math.round((facts.residentBytes / facts.onDemandBytes) * 1000) / 10,
  );

  // tiers: 6 core + 4 discipline + 10 extras = 20
  const tally = { core: 0, discipline: 0, extras: 0 };
  for (const s of facts.skills) tally[s.tier] += 1;
  assert.deepEqual(tally, facts.tierCounts);
  assert.deepEqual(facts.tierCounts, { core: 6, discipline: 4, extras: 10 });
  assert.equal(
    facts.skills.filter((s) => s.tier === "extras").reduce((a, s) => a + s.bytes, 0),
    facts.extrasBytesDropped,
  );

  // hex offsets are real cumulative byte offsets, descending-size order;
  // block counts are ceil(bytes / 1 KiB); slack fill is the true remainder
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
      `${s.name} slack fill`,
    );
    assert.ok(s.bytes <= prev, `region rows must be size-ordered: ${s.name}`);
    offset += s.bytes;
    prev = s.bytes;
  }
  assert.equal(facts.residentKiB, Math.round((facts.residentBytes / 1024) * 10) / 10);
  assert.equal(facts.onDemandKiB, Math.round((facts.onDemandBytes / 1024) * 10) / 10);
  assert.match(facts.skillsTreeHash, /^[0-9a-f]{40}$/);
  assert.equal(facts.kernelEndHex, hex(facts.kernelBytes));
  assert.equal(facts.residentEndHex, hex(facts.residentBytes));
  assert.equal(facts.onDemandEndHex, hex(facts.onDemandBytes));
  assert.equal(facts.referenceFiles.length, facts.referenceFileCount);
});

test("every figure rendered on the page matches facts.json", async () => {
  const [html, facts] = await Promise.all([
    read("public/harness-firmware/index.html"),
    read("public/harness-firmware/facts.json").then(JSON.parse),
  ]);
  const maxBlocks = Math.max(...facts.skills.map((s) => s.blocks));
  const blockPct = Math.round((100 / maxBlocks) * 10000) / 10000;

  // memory-map region: exactly 20 module rows + END row, each with the exact
  // hex offset, byte figure, tier tag, one drawn block per allocated KiB, and
  // an honest slack fill in the final block
  const rows = html.match(/<div class="region-row(?: xtra)?(?: region-end)?">.*?<\/div>\n/gs) ?? [];
  assert.equal(rows.length, facts.skillCount + 1, "20 module rows + END OF IMAGE");
  const tag = { core: "CORE", discipline: "DISC", extras: "XTRA" };
  facts.skills.forEach((s, i) => {
    assert.ok(rows[i].includes(`>${s.name}<`), `row ${i} is ${s.name}`);
    assert.ok(rows[i].includes(s.hexOffset), `${s.name} hex offset`);
    assert.ok(rows[i].includes(`${fmt(s.bytes)} B`), `${s.name} bytes`);
    assert.ok(rows[i].includes(`>${tag[s.tier]}<`), `${s.name} tier tag`);
    assert.equal(s.tier === "extras", rows[i].includes('class="region-row xtra"'), `${s.name} xtra class`);
    // "one block = 1 KiB — count them" must be literally true
    const blocks = rows[i].match(/<i(?: class="pad")? style="width:([0-9.]+)%">/g) ?? [];
    assert.equal(blocks.length, s.blocks, `${s.name} draws ${s.blocks} blocks`);
    for (const b of blocks) {
      assert.ok(b.includes(`width:${blockPct}%`), `${s.name} equal 1 KiB blocks`);
    }
    const pads = rows[i].match(/<i class="pad"[^>]*><b style="width:([0-9.]+)%"><\/b><\/i>/g) ?? [];
    if (s.padFillPct === 100) {
      assert.equal(pads.length, 0, `${s.name} block-aligned, no slack block`);
    } else {
      assert.equal(pads.length, 1, `${s.name} exactly one slack block`);
      assert.ok(pads[0].includes(`width:${s.padFillPct}%`), `${s.name} slack fill is the true remainder`);
    }
  });
  assert.ok(rows[20].includes(facts.onDemandEndHex), "END row hex");
  assert.ok(rows[20].includes(`${fmt(facts.onDemandBytes)} B`), "END row bytes");

  // image checksum is the real skills tree hash, stated with its recompute command
  assert.ok(html.includes(facts.skillsTreeHash.slice(0, 8)), "checksum shown");
  assert.ok(html.includes(`git rev-parse ${facts.templateRev}:.claude/skills`), "checksum recompute command");

  // shared-scale comparison bars
  assert.ok(html.includes(`width:${facts.residentPctOfOnDemand}%`), "resident bar to scale");
  assert.ok(html.includes(`${fmt(facts.residentBytes)} B · ${facts.residentPctOfOnDemand}%`));
  assert.ok(html.includes(`${facts.lazyRatio}&times;`), "lazy ratio stated");

  // POST log offsets are the real resident byte offsets
  for (const h of [hex(0), facts.kernelEndHex, facts.residentEndHex]) {
    assert.ok(html.includes(`>${h}<`), `POST offset ${h}`);
  }

  // headline figures
  for (const s of [
    `${fmt(facts.kernelBytes)} B`,
    `${fmt(facts.descIndexBytes)} B`,
    `${fmt(facts.residentBytes)} B`,
    `${fmt(facts.onDemandBytes)} B`,
    `${fmt(facts.extrasBytesDropped)} B`,
    `${fmt(facts.minimalDescIndexBytes)} B`,
    `${facts.residentKiB.toFixed(1)}&nbsp;KiB`,
    `${fmt(facts.onDemandKiB)}&nbsp;KiB`,
    `&approx;${fmt(facts.residentTokens)} tok/turn`,
    `rev ${facts.templateRev}`,
    facts.measuredOn,
    facts.pitfallExampleDate,
    facts.repo,
  ]) {
    assert.ok(html.includes(s), `page carries: ${s}`);
  }

  // resident tokens appear consistently (pill, POST sum, prose)
  const tokRe = new RegExp(fmt(facts.residentTokens), "g");
  assert.ok((html.match(tokRe) ?? []).length >= 3);
});

test("constraint contract holds in the stylesheet", async () => {
  const css = await read("public/harness-firmware/src/styles.css");
  assert.ok(!css.includes("linear-gradient"), "no gradients");
  assert.ok(!css.includes("radial-gradient"), "no gradients");
  assert.ok(!css.includes("backdrop-filter"), "no glassmorphism");
  assert.ok(!/#(7c3aed|8b5cf6|6366f1|a855f7)/i.test(css), "no AI-purple palette");
  assert.ok(!/@import|fonts\.googleapis|\.woff/.test(css), "system fonts only");
  assert.ok(css.includes("#F0A43C"), "amber persistence accent present");
  assert.ok(css.includes("#E5484D"), "red forgetting accent present");
  assert.ok(css.includes("prefers-reduced-motion"), "reduced motion honored");
  // every hue on the page comes from the declared contract tokens
  const declared = new Set([
    "#0B0D0E", "#121517", "#24292C", "#1B1F22", "#6A665C", "#857F72",
    "#E6E1D6", "#9A958A", "#F0A43C", "#E5484D",
  ]);
  for (const m of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    assert.ok(declared.has(m), `undeclared hue: ${m}`);
  }
  // one easing curve, used exclusively
  assert.equal((css.match(/cubic-bezier/g) ?? []).length, 1, "single easing definition");
  const cssSansVar = css.replaceAll("var(--ease)", "").replaceAll("--ease:", "");
  assert.ok(!/ease-in|ease-out|\bease\b/.test(cssSansVar), "no stray easings");
  assert.ok(!css.includes("overflow-wrap: anywhere"), "no mid-token word breaks");
});

test("page is routed and self-contained", async () => {
  const [config, html] = await Promise.all([
    read("next.config.mjs"),
    read("public/harness-firmware/index.html"),
  ]);
  assert.ok(
    config.includes("{ source: '/harness-firmware', destination: '/harness-firmware/index.html' }"),
    "clean URL rewrite present",
  );
  // no external requests: every href/src is same-origin or the GitHub repo link
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const r of refs) {
    assert.ok(
      r.startsWith("/") || r.startsWith("#") || r.startsWith("https://github.com/ryanportfolio/"),
      `unexpected external reference: ${r}`,
    );
  }
  assert.ok(html.includes('<a class="skip-link"'), "skip link present");
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, "exactly one h1");
  // status vocabulary is closed: OK, READY, ARMED, LOST, SKIP, --
  for (const st of html.match(/<span class="st(?: [a-z-]+)*">([^<]*)</g) ?? []) {
    const word = st.replace(/<span class="st(?: [a-z-]+)*">/, "").replace(/<$/, "");
    assert.ok(["OK", "READY", "ARMED", "LOST", "SKIP", "--"].includes(word), `status word: ${word}`);
  }
});
