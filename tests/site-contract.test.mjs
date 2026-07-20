import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import site from "../content/site.json" with { type: "json" };
import { resolvePreviewAsset } from "../scripts/server-paths.mjs";

const EXPECTED_TAGLINE = "idea → design → engineering → shipped";
const EXPECTED_STAGES = ["idea", "design", "engineering", "shipped"];

const buildHtml = () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "pipe" });
  return readFileSync("index.html", "utf8");
};

test("canonical content preserves the exact four-stage promise", () => {
  assert.equal(site.brand.name, "fullbuild.ai");
  assert.equal(site.brand.tagline, EXPECTED_TAGLINE);
  assert.deepEqual(site.stages.map(({ id }) => id), EXPECTED_STAGES);
  assert.equal(site.caseStudy.status, "engineering");
  assert.equal(site.deployment.verified, false);
  assert.equal(site.deployment.url, null);
  assert.equal(site.stages.at(-1).locked, true);
});

test("future cases are honest, distinct, first-class placeholders", () => {
  assert.equal(site.placeholders.length, 3);
  assert.deepEqual(site.placeholders.map(({ form }) => form), ["portal", "fold", "stack"]);

  for (const item of site.placeholders) {
    assert.equal(item.placeholder, true);
    assert.match(`${item.title} ${item.missing}`, /pending/i);
    assert.match(item.purpose, /\S/);
    assert.doesNotMatch(JSON.stringify(item), /lorem ipsum/i);
  }

  assert.equal(site.exit.placeholder, true);
  assert.match(site.exit.contact, /pending/i);
  assert.doesNotMatch(JSON.stringify(site), /anti-slop|anti-AI-tell|browser acceptance/i);
});

test("every lifecycle state carries auditable truth", () => {
  for (const stage of site.stages.slice(0, 3)) {
    assert.match(stage.artifact, /\S/);
    assert.match(stage.decision, /\S/);
    assert.match(stage.constraint, /\S/);
    assert.match(stage.verification, /\S/);
    assert.match(stage.evidence, /\S/);
  }

  const shipped = site.stages.at(-1);
  assert.equal(shipped.locked, true);
  assert.equal(shipped.verification, "Production proof pending.");
});

test("generated HTML contains the complete Build Seam experience", () => {
  const html = buildHtml();

  assert.doesNotMatch(html, /[ \t]+$/m);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, new RegExp(EXPECTED_TAGLINE));
  assert.match(html, /data-build-seam/);
  assert.equal((html.match(/data-phase-control=/g) ?? []).length, 4);
  assert.equal((html.match(/data-phase-world=/g) ?? []).length, 4);
  assert.equal((html.match(/data-placeholder-case/g) ?? []).length, 3);
  assert.match(html, /data-placeholder-form="portal"/);
  assert.match(html, /data-placeholder-form="fold"/);
  assert.match(html, /data-placeholder-form="stack"/);
  assert.match(html, /Project title pending/);
  assert.match(html, /Question pending/);
  assert.match(html, /Hypothesis pending/);
  assert.match(html, /production proof pending/i);
  assert.match(html, /channel pending/i);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /href=""/);
  assert.doesNotMatch(html, /\b(?:TODO|TBD|lorem ipsum)\b/i);
  assert.doesNotMatch(html, /data-deployment-verified="true"/);
});

test("the stale proof-lab identity is absent", () => {
  const html = buildHtml();
  const css = readFileSync("src/styles.css", "utf8");

  assert.doesNotMatch(html, /proof-canvas|proof-fallback|proof-lineage|data-proof-viewport/);
  assert.doesNotMatch(html, /proof object/i);
  assert.doesNotMatch(html, /Z = distance from maybe/);
  assert.doesNotMatch(css, /\.proof-stage|\.proof-canvas|\.proof-fallback/);
});

test("lifecycle controls remain truthful and accessible", () => {
  const html = buildHtml();
  const css = readFileSync("src/styles.css", "utf8");

  assert.equal((html.match(/<button\b[^>]*data-phase-control=/g) ?? []).length, 4);
  assert.match(html, /data-phase-control="shipped"[^>]*aria-disabled="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /backdrop-filter\s*:/);
  assert.match(css, /\.is-gated\s+\.phase-readout\s*{[^}]*display:\s*flex/s);
  assert.match(css, /@media\s*\(max-height:\s*600px\)/);
  assert.match(css, /\.skip-link:focus-visible/);
  assert.match(css, /\.future-case--stack\s+\.future-case__copy/);
  assert.match(css, /\.lifecycle-stage--engineering\s+\.lifecycle-stage__heading h3\s*{[^}]*font-variation-settings:\s*"wdth" 70/s);
  assert.match(css, /\.lifecycle-stage__heading h3\s*{[^}]*left:\s*auto/s);
  assert.match(css, /\.future-case__copy h3\s*{[^}]*line-height:\s*0\.92/s);
  assert.match(css, /\.exit__wordmark\s*{[^}]*position:\s*relative/s);
});

test("all local fragment links resolve without JavaScript", () => {
  const html = buildHtml();
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const localTargets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  for (const target of localTargets) assert.ok(ids.has(target), `missing #${target}`);
});

test("inspectable microtype never drops below the 0.72rem floor", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const remSizes = [...css.matchAll(/font-size:\s*(0\.\d+)rem/g)].map((match) => Number(match[1]));

  assert.ok(remSizes.length > 0);
  assert.ok(Math.min(...remSizes) >= 0.72);
});

test("preview server resolves the declared favicon", () => {
  assert.equal(resolvePreviewAsset("/favicon.ico"), "assets/favicon.svg");
  assert.equal(resolvePreviewAsset("/"), "index.html");
  assert.ok(existsSync("assets/favicon.svg"));
});
