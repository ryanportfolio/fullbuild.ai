import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function assertMechanismProvenance(html, facts) {
  const expectedFacts = { skillCount: String(facts.skillCount), runtimeCount: String(facts.runtimeCount), license: facts.license, templateRev: facts.templateRev };
  for (const [key, value] of Object.entries(expectedFacts)) {
    const matches = [...html.matchAll(new RegExp(`<[^>]+data-fact-key="${key}"[^>]*>([^<]+)<`, "g"))];
    assert.ok(matches.length > 0, `fact key is rendered: ${key}`);
    matches.forEach((match) => {
      const actual = match[1].trim();
      assert.equal(key === "templateRev" ? actual.toLowerCase() : actual, value, `${key} matches facts.json`);
    });
  }

  const sourceTags = [...html.matchAll(/<a\b[^>]*data-mechanism-source[^>]*>/g)];
  assert.ok(sourceTags.length > 0, "mechanism source links are registered");
  sourceTags.forEach((match) => {
    const href = match[0].match(/href="https:\/\/github\.com\/ryanportfolio\/Harness-Firmware\/(?:blob|tree)\/([^/"?#]+)\//);
    assert.ok(href, "registered mechanism source uses a pinned Harness Firmware blob or tree link");
    assert.equal(href[1], facts.templateCommit, "templateCommit matches facts.json");
  });
  const pinnedCommitLinks = [...html.matchAll(new RegExp(`https://github\\.com/ryanportfolio/Harness-Firmware/(?:blob|tree)/${facts.templateCommit}/`, "g"))];
  assert.equal(sourceTags.length, pinnedCommitLinks.length, "every current-snapshot mechanism source link is registered");
}

const normalizeAuthoredText = (value) => value
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&middot;/gi, "·")
  .replace(/&amp;/gi, "&")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

function authoredAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? normalizeAuthoredText(match[1] ?? match[2]) : null;
}

function collectAuthoredHeadings(html) {
  const semantic = [...html.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => ({
    kind: `semantic ${match[1].toLowerCase()}`,
    text: normalizeAuthoredText(match[3]),
    ariaLabel: authoredAttribute(match[2], "aria-label"),
  }));
  const visual = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-visual-subheading\b[^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => ({
    kind: "visual subheading",
    text: normalizeAuthoredText(match[3]),
    ariaLabel: authoredAttribute(match[2], "aria-label"),
  }));
  return { semantic, visual };
}

function assertAuthoredHeadingsHaveNoPeriods(html) {
  const headings = collectAuthoredHeadings(html);
  for (const heading of [...headings.semantic, ...headings.visual]) {
    for (const [channel, value] of [["rendered text", heading.text], ["aria-label", heading.ariaLabel]]) {
      if (value !== null) assert.ok(!value.includes("."), `${heading.kind} ${channel} contains a period: ${value}`);
    }
  }
  return headings;
}

function balancedBodies(source, headerPattern) {
  const flags = headerPattern.flags.includes("g") ? headerPattern.flags : `${headerPattern.flags}g`;
  const pattern = new RegExp(headerPattern.source, flags);
  const bodies = [];
  let match;
  while ((match = pattern.exec(source))) {
    const open = source.indexOf("{", match.index + match[0].length);
    assert.ok(open >= 0, `CSS block opens after ${match[0]}`);
    let depth = 0;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
    assert.ok(close > open, `CSS block closes after ${match[0]}`);
    bodies.push(source.slice(open + 1, close));
    pattern.lastIndex = close + 1;
  }
  return bodies;
}

function assertHorizonFinalVariables(ruleBody, mode) {
  for (const state of ["contract", "execute", "audit", "fail", "changed", "verified"]) {
    assert.match(ruleBody, new RegExp(`--horizon-${state}:\\s*1(?:\\s*!important)?\\s*;`), `${mode} exposes final ${state} state`);
  }
}

test("Harness Firmware copy authority remains repository-owned", async () => {
  const guide = await read(".claude/reference/harness-firmware-copy.md");

  assert.match(guide, /# Harness Firmware copy references/);
  assert.match(guide, /\$claude-starter:unslop/);
  assert.match(guide, /current copy, proposed copy, reason/i);
  assert.match(guide, /Harness Firmware\s{2}\r?\n> makes AI\s{2}\r?\n> better/);
  assert.match(guide, /One task earns release/i);
  assert.ok(!guide.includes("—"), "copy authority contains no em dashes");
});

test("Harness Firmware visual verification stays inside this worktree", async () => {
  const [capture, packageJson] = await Promise.all([
    read("scripts/capture-harness-firmware-concept.mjs"),
    read("package.json"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(capture, /from "playwright"/);
  assert.ok(!/file:\/\/\/|node_modules\/playwright|node_modules\\\\playwright/.test(capture), "capture must not borrow Playwright from another checkout");
  assert.match(capture, /for \(const theme of \["dark", "light"\]\)/, "tablet audit covers both themes");
  assert.match(capture, /const name = `tablet-\$\{theme\}`/);
  for (const target of ['[".equation-section", "heuristic"]', '[".caveman-disclosure", "caveman"]', '[".finale", "finale"]']) {
    assert.ok(capture.includes(target), `tablet capture covers ${target}`);
  }
  assert.match(capture, /async function measureNoJsRoundSeven\(page\)/);
  assert.match(capture, /verifyNoJsRoundSeven\(name, noJs\)/);
  assert.match(capture, /async function settleLoopCompositor\(page\)/);
  assert.match(capture, /async function validateLoopRaster\(page, path, zones, name/);
  assert.match(capture, /captionSignal < 120/);
  assert.match(capture, /mapSignal < 700/);
  assert.match(capture, /repeatProofRasterHashEqual/);
  assert.match(capture, /repeatFullStageRasterHashEqual/);
  assert.match(capture, /saved PNG is missing required SVG labels/);
  assert.match(capture, /saved PNG is missing required.*route/);
  assert.match(capture, /for \(const pixels of \[1500, 3500, 5500\]\)/);
  assert.match(capture, /`audit-natural-commit-\$\{pixels\}`/);
  assert.match(capture, /const dominant = \[\.\.\.activeMap\.querySelectorAll\("\[data-loop-dominant\]"\)\]/);
  assert.match(capture, /copyFinalLineWords < 2/);
  assert.match(capture, /copySingleWordRows\.length/);
  assert.match(capture, /"\.memory-console-body p"/, "Recall terminal rows participate in rendered orphan checks");
  assert.match(capture, /async function freezeMemoryComparison\(page\)/);
  assert.match(capture, /async function captureMemoryDiscipline\(theme, viewport, label\)/);
  for (const name of ["desktop-dark", "desktop-light", "768-dark", "phone-dark", "phone-light"]) assert.ok(capture.includes(`, "${name}"]`), `memory discipline capture covers ${name}`);
  assert.match(capture, /candidate-natural-500px-/);
  assert.match(capture, /one 500px step crossed more than one named band/);
  for (const name of ["review-compact-desktop", "review-compact-tablet", "review-compact-phone", "review-compact-desktop-nojs"]) assert.ok(capture.includes(`"${name}"`), `review capture covers ${name}`);
  assert.match(capture, /async function capturePhaserMatrix\(viewport, label\)/);
  assert.match(capture, /lazy allocation contract failed before intersection/);
  assert.match(capture, /glyph mask has no raster signal/);
  assert.match(capture, /held pixels or PNG hash changed/);
  assert.match(capture, /const sceneTextFloorPx = 11/);
  assert.match(capture, /panel\.minEffectiveSceneTextPx < sceneTextFloorPx/);
  assert.match(capture, /panel\.containedSceneLabelViolations\.length/);
  assert.doesNotMatch(capture, /phone && \(panel\.visibleSceneTextCount < 4 \|\| panel\.minEffectiveSceneTextPx/);
  for (const name of ["768-dark", "768-light", "768-dark-nojs", "768-light-nojs"]) assert.ok(capture.includes(`"${name}"`), `768 capture covers ${name}`);
  for (const name of ["desktop-dark-nojs", "desktop-light-nojs", "tablet-dark-nojs", "phone-dark-nojs", "phone-light-nojs"]) {
    assert.ok(capture.includes(`"${name}"`), `no-JS capture covers ${name}`);
  }
  assert.match(scripts["preview:harness-firmware"], /serve-prototype\.mjs --port 4327/);
  assert.equal(scripts["capture:harness-firmware"], "node scripts/capture-harness-firmware-concept.mjs");
});

test("concept tells the approved story in semantic HTML", async () => {
  const [html, css] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
  ]);
  const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");

  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(visible, /Harness Firmware\s+makes AI\s+better/);
  assert.match(html, /<h1[^>]*data-fit-heading[^>]*data-phaser-title[^>]*>\s*<span data-fit-line>Harness Firmware<\/span>\s*<span data-fit-line>makes AI<\/span>\s*<span data-fit-line data-phaser-mask>better<\/span>\s*<\/h1>/);
  assert.match(html, /<h2 class="loop-title"[^>]*data-fit-heading[^>]*aria-label="Plan, Prove, Ship"[^>]*>\s*<span data-fit-line>Plan<\/span>\s*<span data-fit-line data-phaser-word data-phaser-target="prove">Prove<\/span>\s*<span data-fit-line>Ship<\/span>\s*<\/h2>/);
  assert.match(html, /<section class="loop-section numbered-section" id="loop" data-loop-sequence>\s*<span class="chapter-number" aria-hidden="true">02<\/span>\s*<div class="loop-scroll" data-loop-scroll>\s*<div class="loop-stage" data-loop-stage>/);
  assert.match(html, /<figure class="loop-proof-chamber" data-loop-proof data-state="loop-static" aria-labelledby="loop-proof-copy">\s*<figcaption id="loop-proof-copy"><span class="loop-copy-text">Each step creates something the next step can check\. Failure returns with evidence instead of disappearing behind a <span class="loop-copy-keep">confident answer\.<\/span><\/span><\/figcaption>/);
  assert.equal((html.match(/class="loop-proof-map loop-proof-map-wide" viewBox="0 0 460 540"/g) ?? []).length, 1);
  assert.equal((html.match(/class="loop-proof-map loop-proof-map-phone" viewBox="0 0 350 720"/g) ?? []).length, 1);
  for (const suffix of ["wide", "phone"]) {
    for (const id of ["grid", "failure", "arrow-cyan", "arrow-green", "claim-clip"]) assert.ok(html.includes(`id="loop-${id}-${suffix}"`), `${suffix} proof map owns unique ${id} definition`);
  }
  for (const station of ["plan", "prove", "evidence", "human", "ship"]) assert.equal((html.match(new RegExp(`data-loop-station="${station}"`, "g")) ?? []).length, 2, `${station} exists in both proof topologies`);
  assert.equal((html.match(/data-loop-state-label="loop-(?:plan|advance|check|fail|return|ship|static)"/g) ?? []).length, 14, "seven pre-authored labels exist in each topology");
  assert.match(html, /<section class="finale"[^>]*data-mechanism="finale"[^>]*>[\s\S]*?<h2 data-fit-heading aria-label="Boot the next repo warm"><span data-fit-line>Boot the next<\/span><span data-fit-line>repo warm<\/span><\/h2>[\s\S]*?Better software comes from the conditions/);
  assert.match(visible, /It loads the right project knowledge, bounds each task, checks real evidence, calls fresh reviewers, and keeps recovery paths when a plan fails\. I set the goals, permissions, quality bar, and release decision\./);
  assert.ok(!/AI writes code|makes the work earn trust|The model plans, writes, tests/.test(visible));
  assert.match(visible, /Plan clearly[\s\S]*Build one\s+bounded change[\s\S]*Run it where\s+it matters[\s\S]*Inspect real evidence[\s\S]*Correct, approve,\s+and ship/);
  assert.match(visible, /Plan quality[\s\S]*Executor quality[\s\S]*Verification quality[\s\S]*Output quality/);
  assert.match(visible, /Working heuristic, not measured math/i);
  assert.match(html, /<h2 class="equation-title"[^>]*id="equation-title"[^>]*data-fit-heading[^>]*aria-label="Three things shape the result"[^>]*>\s*<span data-fit-line>Three things<\/span>\s*<span data-fit-line data-phaser-word data-phaser-target="result">shape the result<\/span>\s*<\/h2>/);
  assert.ok(!visible.includes("Code generation is only one term in the equation"));
  assert.match(visible, /Even the independent reviewer has to show its work/);

  for (const stage of ["Define the task", "Load what matters", "Build one bounded change", "Run the software", "Produce proof", "Challenge the result", "Repair or change approach", "Reconcile with latest main", "Return release to a human", "Keep confirmed lessons deliberately"]) {
    assert.ok(visible.includes(stage), `task stage present: ${stage}`);
  }

  for (const skill of ["Recall", "Fable Mode", "Long Horizon", "Verify This", "Impartial Review", "Codex Review", "Refine", "Init Project", "Sync Starter"]) {
    assert.ok(visible.includes(skill), `skill explained: ${skill}`);
  }
  assert.equal((html.match(/<article class="skill-card" data-skill-reveal(?: [^>]*)?>/g) ?? []).length, 7, "every featured skill is a semantic always-open article");
  assert.equal((html.match(/<details class="skill-card"/g) ?? []).length, 0, "featured skills have no collapsed disclosure state");
  assert.equal((html.match(/<header class="skill-head">/g) ?? []).length, 7, "every skill keeps a visible header");
  assert.equal((html.match(/<article class="skill-card" data-skill-reveal data-skill-layout="wide">/g) ?? []).length, 1, "Codex Review intentionally owns the full verification row");
  assert.match(html, /data-skill-layout="wide"[^>]*>\s*<header class="skill-head">[\s\S]*?<strong>Codex Review<\/strong>[\s\S]*?<div class="skill-body">\s*<div class="skill-wide-copy">[\s\S]*?<div class="skill-wide-procedure">/);
  assert.match(html, /<details class="caveman-disclosure" open><summary>Caveman Ultra <span class="disclosure-state mono">OPEN BY DEFAULT<\/span><\/summary>/);
  const loopLines = [...html.matchAll(/<span class="loop-line">([^<]+)<\/span>/g)].map((match) => match[1]);
  assert.equal(loopLines.length, 18, "all five loop steps use authored line groups");
  loopLines.forEach((line) => assert.ok(line.trim().split(/\s+/).length >= 2, `loop line has no orphaned word: ${line}`));
  assert.equal((html.match(/class="finale-action"/g) ?? []).length, 2, "green finale keeps two large actions");

  assert.match(html, /class="[^"]*\bskip-link\b[^"]*"/);
  assert.ok(html.includes("<noscript>"));
  assert.ok(html.includes('viewBox="0 0 600 1320"'));
  assert.match(html, /class="story-title"[^>]*aria-label="Watch the engineering system work"/);
  assert.match(html, /class="engineering-word"[^>]*data-engineering-word/);
  assert.match(html, /class="engineering-plot"[^>]*>engineering<\/text>/);
  assert.match(html, /class="engineering-checked"[^>]*>engineering<\/text>/);
  assert.ok(!visible.includes("Scroll through one task"), "approved redundant story paragraph is removed");
  assert.ok(html.includes('viewBox="0 0 1200 860"'), "desktop story owns a wide camera viewport");
  assert.equal((html.match(/<use href="#system-map" width="600" height="1320"\/>/g) ?? []).length, 2, "symbol instances keep the map's native viewport");
  assert.equal((html.match(/class="[^"]*\bbeat\b[^"]*" data-beat=/g) ?? []).length, 10);
  for (const beat of ["intent", "context", "bounded-work", "execution", "evidence", "review-fork", "repair", "reconcile", "release", "refine"]) {
    assert.ok(html.includes(`data-beat="${beat}"`), `scroll beat present: ${beat}`);
  }
  const panelStarts = [...html.matchAll(/<li class="[^"]*\bbeat\b[^"]*" data-beat="([^"]+)">/g)];
  const panels = panelStarts.map((match, index) => [match[1], html.slice(match.index + match[0].length, panelStarts[index + 1]?.index ?? html.indexOf("</ol>", match.index))]);
  const expectedMechanisms = {
    intent: ["A TASK THAT CAN FAIL", "The model starts with a target it can miss and limits it cannot cross", ["READ LONG HORIZON", "SEE FABLE MODE"]],
    context: ["OPEN ONLY WHAT MATCHES", "The task opens the few files it needs instead of loading every project note", ["INSPECT AGENTS.MD", "READ RECALL"]],
    "bounded-work": ["ONE SLICE · ONE CHECK", "Small slices keep the diff inspectable before later work depends on it", ["READ LONG HORIZON"]],
    execution: ["CODE MEETS REAL CONDITIONS", "The software has to behave outside the explanation that produced it", ["INSPECT VERIFICATION RULES", "SEE FABLE MODE"]],
    evidence: ["BASELINE / TREATMENT / VERDICT", "A matched comparison can return verified, not verified, or inconclusive", ["READ VERIFY THIS"]],
    "review-fork": ["TWO WAYS TO CHALLENGE THE RESULT", "Fresh context checks the work without the builder's explanation; Codex adds a different model without a pasted transcript or copied diff", ["READ IMPARTIAL REVIEW", "READ CODEX REVIEW"]],
    repair: ["DEAD END SAVED · ROUTE CHANGED", "Fresh executors get the confirmed lesson without inheriting the failed conversation", ["READ LONG HORIZON", "SEE FABLE MODE", "INSPECT PITFALLS.MD"]],
    reconcile: ["OLDER BASE ≠ CURRENT MAIN", "Passing evidence can expire when main moves, so the combined state gets checked again", ["INSPECT MERGE RULES"]],
    release: ["PASSING ≠ PERMISSION", "Passing checks show technical readiness; a person still decides what may affect shared systems or users", ["INSPECT AUTHORITY RULES", "READ MERGE"]],
    refine: ["FRICTION → REVIEWED REPO CHANGE", "Only confirmed friction becomes a reviewed repository change that future work can retrieve", ["READ REFINE", "READ RECALL", "READ SYNC STARTER"]],
  };
  assert.equal(panels.length, 10, "all task panels are available for mechanism checks");
  assert.equal((html.match(/<d[ldt]\b/g) ?? []).length, 0, "story taxonomy lists are removed");
  assert.equal((html.match(/data-beat-mechanism="[^"]+"/g) ?? []).length, 10, "every beat owns one mechanism");
  for (const [beat, panel] of panels) {
    const summary = panel.match(/<p class="beat-claim">([\s\S]*?)<\/p>/)?.[1] ?? "";
    const [sceneLabel, why, sourceLabels] = expectedMechanisms[beat];
    assert.match(panel, new RegExp(`class="beat-mechanism" data-beat-mechanism="${beat}"`));
    assert.equal((panel.match(/<svg class="beat-scene" viewBox="0 0 480 230"/g) ?? []).length, 1, `${beat} has one scene`);
    assert.equal((panel.match(/class="scene-mobile"/g) ?? []).length, 1, `${beat} has one authored phone composition`);
    assert.equal((panel.match(/class="mechanism-why"/g) ?? []).length, 1, `${beat} has one why line`);
    assert.equal((panel.match(/class="mechanism-links"/g) ?? []).length, 1, `${beat} has one source navigation`);
    assert.ok(panel.includes(`class="scene-kicker" x="16" y="24">${sceneLabel}</text>`), `${beat} has its exact scene label`);
    assert.ok(panel.includes(`<p class="mechanism-why">${why}</p>`), `${beat} has its exact why line`);
    const actualSources = [...panel.matchAll(/<a data-mechanism-source href="[^"]+">([^<]+)<\/a>/g)].map((match) => match[1]);
    assert.deepEqual(actualSources, sourceLabels, `${beat} has its exact registered source links`);
    for (const text of [summary, sceneLabel, why, ...actualSources]) {
      const visibleText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      assert.ok(!/[.—]/.test(visibleText.replaceAll(".MD", "")), `${beat} panel copy contains banned punctuation: ${visibleText}`);
    }
    for (const step of ["1", "4"]) assert.ok(panel.includes(`data-scene-step="${step}"`), `${beat} includes route and result steps`);
    assert.match(panel, /data-scene-route pathLength="1"/, `${beat} owns a normalized drawn route`);
    const groups = [...summary.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1].trim());
    if (beat === "refine") {
      assert.equal(summary, "", "refinement moves directly from heading to mechanism");
    } else {
      assert.ok(groups.length >= 3, `${beat} summary has authored keep-together groups`);
      groups.forEach((group) => assert.ok(group.split(/\s+/).length >= 2, `${beat} summary group has one word: ${group}`));
    }
  }
  for (const step of ["1", "2", "3", "4"]) assert.ok(html.includes(`data-scene-step="${step}"`), `authored scene step ${step} exists`);
  assert.ok(!visible.includes("Evidence labels"), "removed technical block stays absent");
  assert.ok(!visible.includes("Numbers and provenance"), "removed provenance block stays absent");
  assert.ok(!visible.includes("Documented method or boundary"), "removed evidence block copy stays absent");
  assert.ok(!visible.includes("This concept intentionally omits inventory and token figures"), "removed provenance copy stays absent");
  assert.match(visible, /CLAUDE STARTS\s+CODEX[\s\S]*CODEX READS\s+REPO[\s\S]*CLAUDE CHECKS\s+FINDINGS/);
  const repairPanel = panels.find(([beat]) => beat === "repair")[1];
  assert.match(repairPanel, /M158 194H300V154H334/, "desktop repair route travels below the retained dead end");
  assert.match(repairPanel, /M170 197H316V147H338/, "phone repair route travels below the retained dead end");
  const refinePanel = panels.find(([beat]) => beat === "refine")[1];
  assert.ok((refinePanel.match(/COMMITTED/g) ?? []).length >= 2, "desktop and phone refinement scenes name committed state");
  assert.ok((refinePanel.match(/REVISION/g) ?? []).length >= 2, "desktop and phone refinement scenes name versioned state");
  assert.ok(!html.includes("Gets the goal and workspace without the builder’s explanation"), "removed Fresh context block stays absent");
  assert.ok(!html.includes("fresh review takes another inspection"), "removed Tradeoff block stays absent");
  assert.ok(!visible.includes("Useful friction may become"), "removed refinement summary stays absent");
  assert.match(html, /<h2 class="skills-intro-heading" data-fit-heading aria-label="Load the right context, Small Steps, Check Evidence, Fresh Review, Failure Recovery"><span data-fit-line>Load the right context<\/span><span data-fit-line>Small Steps<\/span><span data-fit-line>Check Evidence<\/span><span data-fit-line>Fresh Review<\/span><span data-fit-line>Failure Recovery<\/span><\/h2>/);
  assert.match(css, /@media \(min-width: 1200px\)[\s\S]*?\.skills-intro-heading\s*\{[\s\S]*?justify-content:\s*space-between;/);
  assert.match(html, /<div class="section-head skills-intro">[\s\S]*?<figure class="skills-intro-system reveal">[\s\S]*?<img src="\/harness-firmware\/concept\/assets\/skills-system-visual\.png" alt=""/);
  assert.match(html, /<figcaption><strong class="skills-capability-heading" data-fit-heading aria-label="The model provides capability"><span data-fit-line>The model provides<\/span><span data-fit-line>capability<\/span><\/strong><span>These skills package methods, checks, stop conditions, and recovery paths for the jobs that need them\.<\/span><\/figcaption>/);
  assert.match(css, /\.skills-capability-heading \[data-fit-line\][^{]*\{[^}]*display:\s*block;[^}]*white-space:\s*nowrap;/);
  assert.match(css, /\.skills-intro-system figcaption > span/);
  assert.ok((html.match(/class="[^"]*\bskill-source\b[^"]*"/g) ?? []).length >= 8);
  assert.ok((visible.match(/Limit:/g) ?? []).length >= 8);
  assert.ok(!visible.includes("—"), "no em dashes");
  assert.ok(!/\b(?:20|30) skills\b/i.test(visible), "no hardcoded inventory count");
  assert.ok(!/gpt-\d|claude-\d/i.test(visible), "no model version claim");
  assert.ok(!/\b\d+(?:\.\d+)?%\b/.test(visible), "no performance percentage");
  assert.ok(!/brain|sparkle|magic/i.test(visible), "no generic AI imagery language");

  for (const match of html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)) {
    const heading = match[1].replace(/<[^>]+>/g, "").trim();
    assert.ok(!heading.endsWith("."), `heading has trailing period: ${heading}`);
  }
});

test("concept memory chapter explains write discipline with the prepared comparison", async () => {
  const [html, css, facts, asset] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
    read("public/harness-firmware/facts.json").then(JSON.parse),
    read("public/harness-firmware/assets/memory-discipline-comparison.svg"),
  ]);
  const sectionStart = html.indexOf('<section class="memory-discipline reveal"');
  const sectionEnd = html.indexOf("      </section>", sectionStart);
  const memoryConsole = html.indexOf('<figure class="memory-console reveal"');
  const skillsStart = html.indexOf('<section class="skills-section grid-field light-surface numbered-section"');
  assert.ok(memoryConsole >= 0 && sectionStart > memoryConsole && sectionEnd > sectionStart && sectionEnd < skillsStart, "memory discipline is the second act of the concept memory chapter");

  const section = html.slice(sectionStart, sectionEnd);
  assert.match(section, /<h3 id="memory-discipline-title"><span>Save what<\/span><span>stays true<\/span><\/h3>/);
  assert.match(section, /A memory system can fill with notes that later sessions never read/);
  assert.match(section, /standing knowledge a person confirmed and the code cannot already explain/);
  assert.match(section, /What this project is/);
  assert.match(section, /<div class="memory-discipline-title">[\s\S]*?<p class="memory-discipline-direction">A short <strong>What this project is<\/strong>/);
  const memoryRightCopy = section.match(/<div class="memory-discipline-copy">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.ok(!memoryRightCopy.includes("What this project is"), "project direction copy lives under the heading, not in the right column");
  assert.match(section, /SANITIZED LOCAL AUDIT OBSERVATION/);
  assert.match(section, /PER-MACHINE FLOOR ESTIMATE/);
  assert.match(section, /ADVISORY ONLY/);
  assert.match(section, new RegExp(`data-memory-rev>${facts.memoryDiscipline.sourceRev.toUpperCase()}<`));

  assert.equal((section.match(/data-memory-comparison/g) ?? []).length, 1, "prepared comparison is inline once");
  assert.ok(!section.includes('<img src="/harness-firmware/assets/memory-discipline-comparison.svg"'), "comparison is not embedded as an image");
  for (const text of ["BAD IMPLEMENTATION", "HARNESS FIRMWARE", "Written three times more often", "Every save passes three tests,", "An audit counts reads and flags", "A direction block: what the product"]) {
    assert.ok(section.includes(text), `inline comparison retains: ${text}`);
  }
  for (const id of ["hfc-grid", "hfc-hatch", "hfc-glow"]) assert.ok(section.includes(`id="${id}"`), `prefixed SVG id retained: ${id}`);
  assert.match(section, /@keyframes hfc-rise/);
  assert.match(section, /@keyframes hfc-draw/);
  assert.match(section, /@keyframes hfc-glowpulse/);
  assert.ok(!/<style>[\s\S]*?\n\s*\.(?:mono|row|body)\s*\{/m.test(section), "inline comparison styles stay inside their SVG");

  const sourceLinks = [...section.matchAll(/href="https:\/\/github\.com\/ryanportfolio\/Harness-Firmware\/blob\/([0-9a-f]{40})\/[^"#]+(?:#[^"]+)?"/g)];
  assert.equal(sourceLinks.length, 5, "copy and source rail expose five pinned memory sources");
  sourceLinks.forEach(([, commit]) => assert.equal(commit, facts.memoryDiscipline.sourceCommit));
  assert.match(css, /\.memory-discipline\s*\{[^}]*width:\s*min\(100%, var\(--measure\)\)/);
  assert.match(css, /\.memory-comparison-scroll\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(section, /<div class="memory-comparison-stage">[\s\S]*?<div class="memory-comparison-sticky" aria-hidden="true">[\s\S]*?BAD IMPLEMENTATION[\s\S]*?HARNESS FIRMWARE/);
  assert.match(css, /\.memory-comparison-sticky\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--rail-h\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.memory-comparison-sticky\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.memory-comparison-scroll > svg\s*\{[^}]*width:\s*760px/);
  const assetText = asset.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(assetText.includes(facts.memoryDiscipline.writeReadClaim), "prepared asset retains the approved sanitized observation");
});

test("skills introduction owns its generated phosphor system visual", async () => {
  const asset = await readFile(new URL("../public/harness-firmware/concept/assets/skills-system-visual.png", import.meta.url));
  assert.ok(asset.length > 100_000, "generated skills visual is present at production size");
  assert.equal(asset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "skills visual is a PNG");
});

test("concept feedback repairs stay explicit in source", async () => {
  const [html, css] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
  ]);

  assert.match(html, /<a class="brand-mark" href="\/" aria-label="fullbuild\.ai home">[\s\S]*?<svg viewBox="0 0 100 100"/);
  assert.match(html, /<a class="brand-name" href="#hero" aria-label="Harness Firmware page top">HARNESS FIRMWARE<\/a>/);
  assert.equal((html.match(/GOAL \+ PROOF BAR/g) ?? []).length, 2, "proof bar appears in both loop topologies");
  assert.ok(!html.includes("GOAL + ACCEPTANCE"));
  assert.match(html, /data-loop-station="plan"><rect x="1" y="48" width="211" height="86"/);
  assert.ok(!/GOAL \+ PROOF BAR<\/text>[^<]*<[^>]+textLength=/.test(html));

  assert.match(css, /\.map-hatch-line\s*\{[^}]*opacity:\s*\.24/);
  assert.match(css, /\.map-node\[data-state="active"\] rect\s*\{[^}]*fill-opacity:\s*\.38/);
  assert.match(css, /\.skill-body\s*\{[^}]*color:\s*var\(--skill-copy\);[^}]*font-size:\s*16px/);
  assert.match(css, /--skill-copy:\s*color-mix\(in srgb, var\(--bone\) 82%, var\(--residue\)\)/);

  assert.match(css, /\.creator-actions \.action\s*\{[^}]*min-height:\s*64px;[^}]*clip-path:\s*none/);
  assert.match(css, /\.creator-actions \.action\.primary\s*\{[^}]*background:\s*var\(--green\);[^}]*color:\s*var\(--glass\)/);
  assert.match(css, /\.creator-actions \.action:hover,[\s\S]*?background:\s*var\(--blue\)/);
});

test("the pre-concept Harness page is preserved as a self-contained reference", async () => {
  const [currentHtml, originalHtml, currentCss, originalCss, currentJs, originalJs, snapshot] = await Promise.all([
    read("public/harness-firmware/index.html"),
    read("public/harness-firmware/original/index.html"),
    read("public/harness-firmware/src/phosphor.css"),
    read("public/harness-firmware/original/src/phosphor.css"),
    read("public/harness-firmware/src/phosphor.js"),
    read("public/harness-firmware/original/src/phosphor.js"),
    read("public/harness-firmware/original/SNAPSHOT.md"),
  ]);
  const restorePrefix = (value) => value
    .replaceAll("/harness-firmware/original/", "/harness-firmware/")
    .replaceAll("\r\n", "\n");

  assert.equal(restorePrefix(originalHtml), restorePrefix(currentHtml), "archived HTML differs only by self-contained route prefixes");
  assert.equal(restorePrefix(originalCss), restorePrefix(currentCss), "archived CSS differs only by self-contained route prefixes");
  assert.equal(restorePrefix(originalJs), restorePrefix(currentJs), "archived JS differs only by self-contained route prefixes");
  assert.match(snapshot, /Captured on 2026-08-25/);
  assert.match(snapshot, /\/harness-firmware\/original\//);
});

test("concept mechanisms stay source-linked and capture-addressable", async () => {
  const [html, js, factsText] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.js"),
    read("public/harness-firmware/facts.json"),
  ]);
  const facts = JSON.parse(factsText);
  assertMechanismProvenance(html, facts);
  const orderedMarkers = [
    'class="hero grid-field"', 'class="fact-strip"', 'class="story-section numbered-section"', 'class="loop-section numbered-section"',
    'class="equation-section grid-field numbered-section"', 'class="quality-section numbered-section"', 'class="horizon-section grid-field mechanism-section numbered-section"', 'class="context-section grid-field mechanism-section numbered-section"',
    'class="memory-section light-surface mechanism-section numbered-section"', 'class="skills-section grid-field light-surface numbered-section"', 'class="runtime-section"',
    'class="creator-section mechanism-section numbered-section"', 'class="technical-section numbered-section"', 'class="finale"',
  ];
  let cursor = -1;
  orderedMarkers.forEach((marker) => {
    const next = html.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `page order includes ${marker}`);
    cursor = next;
  });
  assert.match(html, /ILLUSTRATIVE MEMORY FLOW/);
  assert.doesNotMatch(html, /(?:12,582|8,774) B|MAX RESIDENT|token estimate/i);
  for (const hold of ["context-roots", "context-route", "context-library", "memory-observe", "memory-commit", "memory-retrieve", "memory-replay-complete", "runtime-source", "runtime-adapt", "runtime-fan-out", "creator-name", "creator-assemble", "creator-ready", "finale-ready"]) {
    assert.ok(js.includes(`"${hold}"`), `named hold exists: ${hold}`);
  }
  assert.match(js, /async mechanismHold\(name\)/);
  assert.match(js, /function finishFiniteAnimations\(\)[\s\S]*?Number\.isFinite\(endTime\)[\s\S]*?animation\.finish\(\)/);
  assert.match(js, /mechanismHolds: Object\.keys\(mechanismHoldPhases\)/);
  assert.doesNotMatch(js, /setInterval\(/);
});

test("Long Horizon owns one dedicated source-linked chapter", async () => {
  const [html, js] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.js"),
  ]);
  const chapterMatches = [...html.matchAll(/<section\b[^>]*\bid="long-horizon"[^>]*>[\s\S]*?<\/section>/g)];
  assert.equal(chapterMatches.length, 1, "exactly one Long Horizon chapter exists");
  const chapter = chapterMatches[0][0];
  assert.ok(
    html.indexOf('class="quality-section numbered-section"') < chapterMatches[0].index
      && chapterMatches[0].index < html.indexOf('class="context-section grid-field mechanism-section numbered-section"'),
    "Quality, Long Horizon, and Context stay in narrative order",
  );
  assert.match(chapter, /data-mechanism="horizon" data-mechanism-phase="verified"/, "authored HTML defaults to the verified final state");
  assert.match(chapter, /<p class="kicker mono">LONG HORIZON · VERIFIED ROUNDS<\/p>/);
  assert.match(chapter, /<h2[^>]*aria-label="Long Horizon"[^>]*><span data-fit-line>Long<\/span><span data-fit-line>Horizon<\/span><\/h2>/);
  assert.match(chapter, /<p class="horizon-lead reveal">Large work can outlast one context\. Long Horizon freezes the goal and acceptance checks, then carries verified progress forward in a state file\.<\/p>/);

  const roles = [
    ["MANAGER", "Selects one remaining step from state.md and writes the bounded brief"],
    ["FRESH EXECUTOR", "Builds only that step from a fresh context"],
    ["FRESH AUDITOR", "Rebuilds the evidence from the files without the Executor's report"],
  ];
  for (const [role, copy] of roles) {
    assert.ok(chapter.includes(`<h3>${role}</h3><p>${copy}</p>`), `${role} keeps its exact role copy`);
  }
  for (const field of ["FROZEN CONTRACT", "VERIFIED PROGRESS", "REMAINING", "DEAD ENDS"]) {
    assert.match(chapter, new RegExp(`data-visual-subheading>${field}<`), `ledger field exists: ${field}`);
  }
  assert.match(chapter, /data-visual-subheading>COMPLETE \/ CLEAN \/ ALIGNED</, "pass gate keeps the exact three-part verdict");
  assert.match(chapter, /<p class="horizon-payoff">Only audit-passed work enters verified progress\. Failed approaches stay under dead ends, so the next round changes route instead of repeating them\.<\/p>/);
  assert.match(chapter, /<p class="horizon-limit"><strong>Limit:<\/strong> Fresh inspection costs time\. It still depends on available evidence and real separation between roles\.<\/p>/);

  const sourceUrl = "https://github.com/ryanportfolio/Harness-Firmware/blob/c50c093075e28dacc65dab3fe39067821c672f8c/.claude/skills/long-horizon/SKILL.md";
  const sourceTags = [...html.matchAll(/<a\b[^>]*\bdata-long-horizon-source\b[^>]*>/g)];
  assert.equal(sourceTags.length, 1, "one direct Long Horizon source action exists");
  assert.ok(sourceTags[0][0].includes(`href="${sourceUrl}"`), "the direct action uses the isolated c50c093 source pin");
  assert.doesNotMatch(sourceTags[0][0], /data-mechanism-source/, "the newer direct source stays outside older snapshot provenance");
  assert.equal(html.split(sourceUrl).length - 1, 1, "the pinned direct source URL appears once");
  assert.match(chapter, />READ LONG HORIZON →<\/a>/);

  const skillCards = [...html.matchAll(/<article class="skill-card"[\s\S]*?<\/article>/g)];
  assert.equal(skillCards.length, 7, "seven skill cards remain");
  assert.equal((html.match(/<header class="skill-head">/g) ?? []).length, 7, "seven skill headers remain");
  skillCards.forEach((card) => assert.doesNotMatch(card[0], /Long Horizon/i, "Long Horizon is absent from skill cards"));
  assert.deepEqual(
    [...html.matchAll(/class="chapter-number" aria-hidden="true">(0[1-9]|10)<\/span>/g)].map((match) => match[1]),
    ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
    "chapters run from 01 through 10",
  );

  const holdBlock = js.match(/const mechanismHoldPhases = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? "";
  const horizonHolds = [...holdBlock.matchAll(/^\s*"(horizon-[^"]+)":/gm)].map((match) => match[1]);
  assert.deepEqual(horizonHolds, ["horizon-contract", "horizon-execute", "horizon-audit", "horizon-dead-end", "horizon-verified"], "five deterministic Horizon capture holds exist");
  assert.equal((js.match(/requestAnimationFrame\(/g) ?? []).length, 1, "Long Horizon stays on the one shared animation scheduler");
  assert.equal((js.match(/frame = requestAnimationFrame\(render\)/g) ?? []).length, 1, "the shared scheduler owns the only rAF");
});

test("Long Horizon final states and authored subheadings stay explicit", async () => {
  const [html, css] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
  ]);

  const headings = assertAuthoredHeadingsHaveNoPeriods(html);
  assert.deepEqual(
    headings.visual.map((heading) => heading.text).sort(),
    ["COMPLETE / CLEAN / ALIGNED", "DEAD ENDS", "FROZEN CONTRACT", "REMAINING", "VERIFIED PROGRESS"].sort(),
    "every Long Horizon visual subheading is marked",
  );

  const semanticMutation = html.replace("<span data-fit-line>Long</span>", "<span data-fit-line>Long.</span>");
  assert.notEqual(semanticMutation, html, "semantic-heading mutation applies");
  assert.throws(() => assertAuthoredHeadingsHaveNoPeriods(semanticMutation), /semantic h2 rendered text contains a period/);
  const visualMutation = html.replace("data-visual-subheading>FROZEN CONTRACT<", "data-visual-subheading>FROZEN CONTRACT.<");
  assert.notEqual(visualMutation, html, "visual-subheading mutation applies");
  assert.throws(() => assertAuthoredHeadingsHaveNoPeriods(visualMutation), /visual subheading rendered text contains a period/);

  const fileLabels = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-file-label="state\.md"[^>]*)>([\s\S]*?)<\/\1>/gi)];
  assert.equal(fileLabels.length, 1, "one explicit state.md file label exists");
  assert.equal(normalizeAuthoredText(fileLabels[0][3]), "state.md", "the literal file label retains its period");
  assert.doesNotMatch(fileLabels[0][2], /data-visual-subheading/, "the file label is exempt from visual-subheading rules");
  assert.doesNotThrow(() => assertAuthoredHeadingsHaveNoPeriods(fileLabels[0][0]), "state.md is a valid file-label control");

  const phoneMedia = balancedBodies(css, /@media\s*\(max-width:\s*760px\)\s*/)
    .find((body) => body.includes(".horizon-section"));
  assert.ok(phoneMedia, "phone CSS owns a Long Horizon block");
  const phoneRule = balancedBodies(phoneMedia, /\.horizon-section\s*/)[0];
  assertHorizonFinalVariables(phoneRule, "phone");
  assert.match(phoneMedia, /\.horizon-role \{[^}]*opacity:\s*1\s*!important;[^}]*transform:\s*none\s*!important;/, "phone roles are visible in the final state");
  assert.match(phoneMedia, /\.horizon-verified \{[^}]*border-color:\s*var\(--green\)\s*!important;/, "phone verified proof is green");

  const noJsRule = balancedBodies(css, /\.no-js \[data-mechanism="horizon"\]\s*/)[0];
  assert.ok(noJsRule, "no-JS CSS owns a Long Horizon final-state rule");
  assertHorizonFinalVariables(noJsRule, "no-JS");

  const reducedMedia = balancedBodies(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*/)
    .find((body) => body.includes('[data-mechanism="horizon"]'));
  assert.ok(reducedMedia, "reduced-motion CSS owns a Long Horizon block");
  const reducedRule = balancedBodies(reducedMedia, /\[data-mechanism="horizon"\]\s*/)[0];
  assertHorizonFinalVariables(reducedRule, "reduced motion");
  assert.match(reducedMedia, /\[data-mechanism="horizon"\] \.horizon-role \{[^}]*opacity:\s*1\s*!important;[^}]*transform:\s*none\s*!important;/, "reduced-motion roles are visible");
  assert.match(reducedMedia, /\[data-mechanism="horizon"\] \.horizon-verified \{[^}]*border-color:\s*var\(--green\)\s*!important;/, "reduced-motion verified proof is green");
});

test("concept mechanism provenance rejects label and source-link drift", async () => {
  const [html, factsText] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/facts.json"),
  ]);
  const facts = JSON.parse(factsText);
  const badLabel = html.replace('data-fact-key="templateRev">2094FA7B<', 'data-fact-key="templateRev">DEADBEEF<');
  assert.throws(() => assertMechanismProvenance(badLabel, facts), /templateRev matches facts\.json/);
  const badLink = html.replace(
    `data-mechanism-source href="https://github.com/ryanportfolio/Harness-Firmware/blob/${facts.templateCommit}/`,
    'data-mechanism-source href="https://github.com/ryanportfolio/Harness-Firmware/blob/deadbeef/',
  );
  assert.throws(() => assertMechanismProvenance(badLink, facts), /templateCommit matches facts\.json/);
});

test("concept keeps the phosphor contract and inclusive states", async () => {
  const [html, css, js] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
    read("public/harness-firmware/concept/concept.js"),
  ]);

  for (const token of ["#070B0C", "#5FD9FF", "#A6FF5E", "#22352A", "#E8F4EA"]) assert.ok(css.includes(token));
  assert.match(css, /PHOSPHOR CONCEPT CONTRACT/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.ok(!/linear-gradient|radial-gradient|conic-gradient|backdrop-filter|filter:\s*blur|box-shadow|text-shadow/.test(css));
  assert.ok(!/@import|fonts\.googleapis/.test(css));
  assert.match(css, /\.finale \{[^}]*min-height:\s*92svh/);
  assert.match(css, /\.finale \{[^}]*grid-template-columns:\s*minmax\(0, 1\.1fr\) minmax\(420px, \.9fr\)/);
  assert.match(css, /\.finale-action \{[^}]*min-height:\s*180px/);
  assert.match(css, /\.loop-track strong \{[^}]*font-size:\s*30px/);
  assert.match(css, /\.loop-track small \{[^}]*font-size:\s*18px/);
  assert.match(css, /\.beat-claim \{[^}]*font-size:\s*clamp\(22px,\s*1\.65vw,\s*25px\)/);
  assert.match(css, /\.beat-claim span \{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.beat-scene \{[^}]*height:\s*210px/);
  assert.match(css, /\.beat-scene text \{[^}]*font:\s*650 14px\/1 var\(--mono\)/);
  assert.match(css, /\.beat-scene \.scene-kicker \{[^}]*font-size:\s*14px/);
  assert.match(css, /\.beat-scene \.scene-title \{[^}]*font:\s*680 18px\/1 var\(--display\)/);
  assert.match(css, /\.beat-scene \.scene-small \{[^}]*font-size:\s*14px/);
  assert.match(css, /\.beat\[data-beat="context"\] \.beat-scene > \[data-scene-step="2"\] \.scene-title \{[^}]*font-size:\s*14\.25px/);
  assert.match(css, /\.review-beat \.beat-scene > \[data-scene-step="2"\] \.scene-small \{[^}]*font-size:\s*13\.5px/);
  assert.match(css, /\.mechanism-why \{[^}]*font-size:\s*17px[^}]*line-height:\s*1\.45/);
  assert.match(css, /\.mechanism-links a \{[^}]*min-height:\s*48px/);
  assert.match(css, /\.mechanism-links a:nth-child\(3\):last-child \{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(css, /\[data-scene-route\][^}]*stroke-dasharray:\s*1 1[^}]*stroke-dashoffset:\s*1/);
  for (const [step, delay] of [["1", "0"], ["2", "120"], ["3", "240"], ["4", "360"]]) assert.match(css, new RegExp(`\\[data-scene-step="${step}"\\] \\{[^}]*transition-delay: ${delay}ms`));
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.beat-scene \{ height: 220px; \}[\s\S]*?\.mechanism-why \{ font-size: 18px; line-height: 1\.45; \}[\s\S]*?\.mechanism-links a \{ min-height: 52px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.beat-scene > :not\(\.scene-mobile\) \{ display: none; \}[\s\S]*?\.beat-scene \.scene-mobile \{ display: block; \}/);
  assert.match(css, /\.beat-scene \.scene-mobile text \{ font-size: 16px/);
  assert.doesNotMatch(css, /\.beat dl|\.beat dt|\.beat dd|\.review-explainer|\.codex-flow/, "removed story grid styles stay absent");
  assert.doesNotMatch(css, /\.evidence-list|\.evidence\.unknown/, "removed disclosure styles stay dead-code free");
  assert.doesNotMatch(css, /\.review-cost/, "removed review Tradeoff styles stay absent");
  assert.doesNotMatch(css, /\.no-js\s+\.loop-track\s+(?:strong|small)\s*\{/, "no-JS keeps the responsive loop type scale");
  assert.match(css, /@media \(max-width: 1199px\) and \(min-width: 761px\)[\s\S]*?\.loop-track strong \{ font-size: 24px; \}[\s\S]*?\.loop-track small \{ font-size: 17px; \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.loop-track strong \{ font-size: 22px; \}[\s\S]*?\.loop-track small \{ font-size: 17px; \}/);
  assert.match(css, /\.finale h2 span[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.finale-judgment \{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.loop-copy-keep \{ white-space: nowrap; \}/);
  assert.match(css, /\.loop-copy-text \{ display: block; min-width: 0; width: 100%; \}/);
  assert.match(css, /\.finale-copy > p:last-child \{[^}]*font-size:\s*clamp\(22px,\s*2\.1vw,\s*32px\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.finale-copy > p:last-child \{[^}]*font-size:\s*22px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.finale h2 \{[^}]*font-size:\s*clamp\(58px,\s*18vw,\s*70px\)/);
  for (const match of css.matchAll(/font-size:\s*(?:clamp\([^,]+,\s*)?([0-9.]+)px/g)) {
    assert.ok(Number(match[1]) >= 11, `font below floor: ${match[0]}`);
  }

  assert.match(js, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(js, /import \{ heroState, fieldToRGBA, blueNoise64, SEED \} from "\/harness-firmware\/src\/dither\.mjs"/);
  assert.equal((html.match(/data-phaser-title/g) ?? []).length, 1, "hero owns one full-title phaser target");
  assert.equal((html.match(/data-phaser-word/g) ?? []).length, 3, "three later blue phrases are phaser targets");
  assert.match(css, /h1 span:nth-child\(2\) \{ font-size:/);
  assert.match(css, /h1 span:nth-child\(3\) \{ color: var\(--live\);/);
  assert.match(js, /time = \(now - record\.startedAt\) % 5200/);
  assert.match(js, /time < 1800/);
  assert.match(js, /\(time - 1800\) \/ 600/);
  assert.match(js, /async phaserHold\(target, state\)/);
  assert.match(js, /\["idle", "sweep-mid", "handoff"\]/);
  assert.match(js, /motionQuery\.addEventListener\("change"/);
  assert.equal((js.match(/requestAnimationFrame\(/g) ?? []).length, 1, "one rAF call remains, owned by the main scheduler");
  assert.equal((js.match(/frame = requestAnimationFrame\(render\)/g) ?? []).length, 1, "the main scheduler owns that rAF call");
  assert.doesNotMatch(js, /data\.printState = "queued"|requestAnimationFrame\(\(\) =>/);
  assert.match(js, /function fitHeading\(heading\)/);
  assert.match(js, /function fitLoopLines\(\)/);
  assert.match(js, /line\.style\.setProperty\("--loop-scale", scale\.toFixed\(4\)\)/);
  assert.match(js, /const fittedHeadings = \[\.\.\.document\.querySelectorAll\("\[data-fit-heading\]"\)\]/);
  assert.match(js, /document\.createRange\(\)/);
  assert.match(js, /selectNodeContents\(line\)/);
  assert.match(js, /const firstPassWidths = lines\.map\(textWidth\)/);
  assert.match(js, /new ResizeObserver/);
  assert.match(js, /document\.fonts\.ready\.then/);
  assert.match(js, /invalid = true;\s*schedule\(\);/);
  assert.match(js, /new IntersectionObserver/);
  assert.match(js, /const storyMechanismObserver = "IntersectionObserver" in window/);
  assert.match(js, /rootMargin: "0px 0px -18% 0px"/);
  assert.match(js, /entry\.target\.closest\("\.beat"\)\?\.classList\.add\("is-seen"\)/);
  assert.match(js, /storyMechanismObserver\?\.disconnect\(\)/);
  assert.match(js, /observer\.unobserve\(entry\.target\)/);
  assert.match(js, /function queueSkillReveal\(card\)[\s\S]*?card\.dataset\.printState = "printing";[\s\S]*?setTimeout\(/);
  assert.match(js, /\.skill-body > \*/);
  assert.match(js, /card\.dataset\.printState = motionQuery\.matches \? "complete" : "waiting"/);
  assert.ok(!js.includes("innerHTML"), "reveal decoration does not replace authored content or links");
  assert.match(css, /\.js \.skill-card\[data-print-state="waiting"\] \[data-print-block\]/);
  assert.match(css, /clip-path:\s*inset\(0 100% 0 0\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.js \.skill-card \[data-print-block\][\s\S]*clip-path:\s*inset\(0 0 0 0\)/);
  assert.ok(!/\.skill-card\s+summary|\.skill-card\[open\]|content:\s*"[+−]"/.test(css), "featured cards expose no disclosure affordance");
  assert.match(js, /const beatNames = \["intent", "context", "bounded-work", "execution", "evidence", "review-fork", "repair", "reconcile", "release", "refine"\]/);
  const cameras = [...js.matchAll(/\{ x:\s*([0-9.]+), y:\s*([0-9.]+), scale:\s*([0-9.]+), anchorX:\s*([0-9.]+), anchorY:\s*([0-9.]+) \}/g)]
    .slice(0, 10)
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]), anchorX: Number(match[4]), anchorY: Number(match[5]) }));
  const activeBoxes = [
    { x: 90, y: 30, width: 420, height: 76 },
    { x: 90, y: 144, width: 420, height: 76 },
    { x: 90, y: 258, width: 420, height: 76 },
    { x: 90, y: 372, width: 420, height: 76 },
    { x: 90, y: 486, width: 420, height: 76 },
    { x: 52, y: 600, width: 496, height: 152 },
    { x: 90, y: 800, width: 420, height: 88 },
    { x: 90, y: 936, width: 420, height: 76 },
    { x: 90, y: 1050, width: 420, height: 76 },
    { x: 90, y: 1164, width: 420, height: 88 },
  ];
  assert.equal(cameras.length, activeBoxes.length);
  cameras.forEach((camera, index) => {
    const box = activeBoxes[index];
    const left = camera.anchorX + (box.x - camera.x) * camera.scale;
    const right = left + box.width * camera.scale;
    const top = camera.anchorY + (box.y - camera.y) * camera.scale;
    const bottom = top + box.height * camera.scale;
    assert.ok(left >= 0 && right <= 1200 && top >= 0 && bottom <= 860, `beat ${index + 1} active node stays in frame`);
    assert.ok(box.width * camera.scale >= 1200 * 0.54, `beat ${index + 1} active node fills its side of the frame`);
    if (index % 2 === 0) assert.ok(left >= 500, `beat ${index + 1} active node clears the left panel`);
    else assert.ok(right <= 720, `beat ${index + 1} active node clears the right panel`);
  });
  assert.doesNotMatch(html, /data-theme-choice|theme-control|hf-concept-theme/);
  assert.doesNotMatch(js, /localStorage|dataTheme|dataset\.theme|prefers-color-scheme/);
  assert.deepEqual(
    [...html.matchAll(/class="chapter-number" aria-hidden="true">(0[1-9]|10)<\/span>/g)].map((match) => match[1]),
    ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
    "ten ordered chapters carry the faded-number treatment",
  );
  assert.match(css, /\.light-surface \{[\s\S]*?--ground:\s*var\(--bone\)/);
  assert.match(css, /\.context-section::after \{[\s\S]*?clip-path:\s*polygon\([\s\S]*?--memory-handoff-progress/);
  assert.match(css, /\.memory-section \.chapter-number \{[\s\S]*?--memory-handoff-progress/);
  assert.match(js, /function applyMemoryHandoff\(\)/);
  assert.match(js, /applyEngineeringProgress\(\);\s*applyMemoryHandoff\(\);\s*applyMechanismStates\(\);/);
  assert.doesNotMatch(js, /systemTheme|followSystemTheme/);
  assert.doesNotMatch(css, /:root\[data-theme="light"\]|\.theme-control|@media \(prefers-color-scheme: light\)/);
  assert.match(js, /window\.__capture\s*=/);
  assert.match(js, /const loopHoldProgress = Object\.freeze\(\{\s*"loop-plan": 0\.06,\s*"loop-advance": 0\.20,\s*"loop-check": 0\.355,\s*"loop-fail": 0\.505,\s*"loop-return": 0\.655,\s*"loop-ship": 0\.815,\s*"loop-static": 1,/);
  assert.match(js, /loopBeats: \[\.\.\.loopBeatNames\]/);
  assert.match(js, /async loopHold\(name\)/);
  assert.match(js, /async loopHoldProgress\(progress\)/);
  assert.match(js, /async loopThaw\(\)/);
  assert.match(js, /loop:\s*\{ \.\.\.loopCurrentState, held: loopHeld, beat:/);
  assert.match(js, /clamp\(\(scrollY - loopTop\) \/ Math\.max\(1, loopRange\), 0, 1\)/);
  assert.doesNotMatch(js, /getTotalLength|getPointAtLength|Math\.random/);
  assert.match(js, /planCharge: name === "loop-plan" \? rangeProgress\(local, 0, 0\.55\)/);
  assert.match(js, /checkMove: name === "loop-check" \? rangeProgress\(local, 0, 0\.15\)/);
  assert.match(js, /checkExpand: name === "loop-check" \? rangeProgress\(local, 0\.15, 0\.30\)/);
  assert.match(js, /checkScan: name === "loop-check" \? rangeProgress\(local, 0\.30, 0\.70\)/);
  assert.match(js, /failMove: name === "loop-fail" \? rangeProgress\(local, 0, 0\.25\)/);
  assert.match(js, /failReveal: name === "loop-fail" \? rangeProgress\(local, 0\.20, 0\.35\)/);
  assert.match(js, /failReturn: name === "loop-fail" \? rangeProgress\(local, 0\.25, 0\.75\)/);
  assert.match(js, /shipRetain: name === "loop-ship" \? rangeProgress\(local, 0, 0\.15\)/);
  assert.match(js, /shipKey: name === "loop-ship" \? rangeProgress\(local, 0\.15, 0\.30\)/);
  assert.match(js, /shipGate: name === "loop-ship" \? rangeProgress\(local, 0\.30, 0\.40\)/);
  assert.match(js, /shipPacket: name === "loop-ship" \? rangeProgress\(local, 0\.40, 1\)/);
  assert.match(js, /settleFade: name === "loop-static" \? rangeProgress\(local, 0, 0\.30\)/);
  assert.match(js, /set\("ship", retain < 1 \? "retaining" : "retained", retain\)/);
  assert.match(js, /claim: local < 0\.30 \? "settling" : "retained"/);
  assert.match(css, /\.no-js \.loop-proof-chamber\[data-state="loop-static"\] \.loop-stations > g > rect:first-child/);
  assert.doesNotMatch(html, /<animate(?:Transform|Motion)?\b|<set\b/i, "proof map has no SMIL clock");
  assert.doesNotMatch(css, /@keyframes\s+loop/i, "proof map adds no CSS clock");
  assert.match(css, /\.no-js \.loop-scroll \{ height: auto; \}/);
  assert.match(css, /\.loop-scroll \{ height: calc\(100svh \+ 5600px\); \}/);
  assert.match(js, /loopRange = Math\.max\(1, loopScroll\.offsetHeight - innerHeight\)/);
  assert.match(css, /\.loop-proof-chamber\[data-state="loop-static"\] \.loop-gate-left \{ transform: translateX\(-18px\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.loop-scroll \{ height: auto; \}[\s\S]*?\.loop-stage \{ position: static; height: auto; \}/);
  assert.match(js, /async hold\(beat\)/);
  assert.match(js, /freeze\(\)/);
  assert.match(js, /thaw\(\)/);
  assert.match(js, /step\(index\)/);
  assert.match(js, /state\(\)/);
  assert.ok(!js.includes("Math.random"));

  assert.equal((html.match(/<rect x="90" y="(?:30|144|258|372|486|800|936|1050|1164)" width="420" height="(?:76|88)"\/>/g) ?? []).length, 9, "main SVG nodes use the widened safe box");
  assert.match(html, /<rect x="52" y="600" width="496" height="152"\/>/);
  assert.match(html, /<rect x="70" y="642" width="220" height="82"\/>/);
  assert.match(html, /<rect x="310" y="642" width="220" height="82"\/>/);
});

test("showpiece parity reuses the original observable motion contract", async () => {
  const [html, css, js] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
    read("public/harness-firmware/concept/concept.js"),
  ]);

  assert.match(html, /<canvas class="hero-field" data-hero-field/);
  assert.match(html, /data-system-plate data-plate-phase="retained"/);
  for (const station of ["human", "system", "model", "proof"]) assert.match(html, new RegExp(`data-plate-station="${station}"`));
  for (const route of ["human-system", "system-model", "model-proof"]) assert.match(html, new RegExp(`data-plate-route="${route}"`));
  assert.equal((html.match(/<a class="fact-cell"/g) ?? []).length, 4, "all proof cells remain keyboard-operable links");
  assert.equal((html.match(/class="context-file(?: |")/g) ?? []).length, 9, "context stage keeps two roots and seven routed files");

  assert.match(css, /transition: background-color \.24s var\(--ease\), color \.24s var\(--ease\)/);
  assert.match(css, /transform: scaleX\(\.25\)/);
  assert.match(css, /\.fact-cell:hover::after,[\s\S]*?transform: scaleX\(1\)/);
  assert.match(css, /\.fact-strip \{[\s\S]*?background-color: var\(--ground\);[\s\S]*?background-image: var\(--grid\)/);
  assert.match(css, /\.reveal \{[\s\S]*?transition: opacity \.6s var\(--ease\), transform \.6s var\(--ease\)/);
  assert.doesNotMatch(css, /@keyframes/);

  assert.equal((js.match(/requestAnimationFrame\(/g) ?? []).length, 1, "one shared animation scheduler owns the concept");
  assert.doesNotMatch(js, /setInterval\(/);
  assert.match(js, /cycleProgress\(elapsed, 4800, index \* 550\)/);
  assert.match(js, /\{ cold: \.18, charge: \.82, retained: 60 \}/);
  assert.match(js, /context\.letterSpacing = `\$\{Number\.parseFloat\(style\.letterSpacing\) \* scale\}px`/);
  assert.match(js, /context\.fontKerning = style\.fontKerning/);
  assert.match(js, /cycleProgress\(elapsed, 5800, 350\)/);
  assert.match(js, /progressFor\(5800, index \* 450\)/);
  assert.match(js, /showpieceHolds: \["hero-cold"/);
  assert.match(js, /async showpieceHold\(name\)/);
  assert.match(js, /let running = paintHeroField\(now\);\s*running = renderSystemPlate\(now\) \|\| running;/, "live hero field and system plate both render every frame");
  assert.doesNotMatch(js, /paintHeroField\(now\) \|\| renderSystemPlate\(now\)/, "hero field cannot short-circuit live plate motion");
});

test("concept wheel smoothing shares the existing animation authority", async () => {
  const [html, css, js, lenis, license] = await Promise.all([
    read("public/harness-firmware/concept/index.html"),
    read("public/harness-firmware/concept/concept.css"),
    read("public/harness-firmware/concept/concept.js"),
    read("public/harness-firmware/concept/vendor/lenis.mjs"),
    read("public/harness-firmware/concept/vendor/lenis-LICENSE.txt"),
  ]);

  assert.match(lenis, /version\s*=\s*"1\.3\.25"/);
  assert.match(license, /MIT License/);
  assert.match(js, /import Lenis from "\.\/vendor\/lenis\.mjs"/);
  assert.match(js, /new Lenis\(\{[\s\S]*?autoRaf:\s*false,[\s\S]*?lerp:\s*0\.085,[\s\S]*?smoothWheel:\s*true,[\s\S]*?syncTouch:\s*false,[\s\S]*?wheelMultiplier:\s*0\.85,/);
  assert.match(js, /function advanceSmoothScroll\(now\)[\s\S]*?smoothScroll\.raf\(now\)/);
  assert.match(js, /const scrollRunning = advanceSmoothScroll\(now\)/);
  assert.match(js, /renderOriginalParity\(now\) \|\| phasersRunning \|\| scrollRunning/);
  assert.match(js, /smoothScroll\?\.destroy\(\)/);
  assert.match(js, /smoothScroll\?\.stop\(\)/);
  assert.match(js, /smoothScroll\?\.start\(\)/);
  assert.match(js, /delete window\.__lenis/);
  assert.doesNotMatch(html, /memory-comparison-scroll[^>]*data-lenis-prevent/, "horizontal comparison must not swallow vertical wheel input");
  assert.match(css, /\.lenis\.lenis-smooth\s*\{\s*scroll-behavior:\s*auto !important;/);
});
