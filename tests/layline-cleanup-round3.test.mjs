import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Debrief toggles explicitly, restores toggle focus, and keeps its composer in flow", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const analyst = source("src/components/layline/analyst/AnalystSection.tsx");
  const analystCss = source("src/components/layline/analyst/analyst.module.css");
  const racesCss = source("src/app/prototype/layline/races/races.module.css");
  const briefCss = source("src/components/layline/bootSea.module.css");
  const consoleCss = source("src/app/prototype/layline/layline.module.css");

  assert.match(workspace, /const analystToggleRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(workspace, /const toggleAnalyst = \(\) => \{/);
  assert.match(workspace, /setAnalystReady\(true\);\s*setAnalystOpen\(true\);/);
  assert.match(workspace, /analystToggleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /ref=\{analystToggleRef\}/);
  assert.match(workspace, /onClick=\{toggleAnalyst\}/);
  assert.doesNotMatch(workspace, /setAnalystOpen\(\(open\) => !open\)/);

  const threadAt = analyst.indexOf('<ol className={styles.thread}');
  const composerAt = analyst.indexOf('className={styles.inputRow}');
  assert.ok(threadAt >= 0 && composerAt > threadAt, "composer must follow the bounded thread");
  assert.doesNotMatch(analyst, /conversationRef|scrollIntoView\(\{[\s\S]*block: "start"/);
  assert.match(analystCss, /\.dockConversation \.thread\s*\{[^}]*max-height:\s*360px/s);
  assert.doesNotMatch(analystCss, /\.dock \.inputRow\s*\{[^}]*position:\s*fixed/s);

  for (const [name, css] of [
    ["analyst", analystCss],
    ["race shell", racesCss],
    ["brief", briefCss],
    ["console", consoleCss],
  ]) {
    assert.doesNotMatch(css, /--composer-bar/, `${name} still depends on the fixed composer`);
  }
  assert.doesNotMatch(racesCss, /:has\(\.workspace\[data-analyst-open="true"\]\)/);
});

test("Brief Performance puts existing process copy in one accessible Method disclosure", () => {
  const view = source("src/components/layline/BriefPerformance.tsx");
  const css = source("src/components/layline/bootSea.module.css");
  const method = view.match(/<details className=\{styles\.perfMethod\}>[\s\S]*?<\/details>/)?.[0] ?? "";

  assert.match(method, /<summary>Method<\/summary>/);
  assert.match(method, /Speed scaled to the \$\{meanKn\.toFixed\(1\)\} kn race mean/);
  assert.match(method, /Port tack left, starboard right; dot size is heel/);
  assert.match(method, /\$\{STEADY_WINDOW\} s either side are left out/);
  assert.match(method, /[Aa] sample every \$\{VMG_STEP\} s/);
  assert.match(method, /broken off the legs/);
  assert.match(method, /Breeze ran \$\{lo\} to \$\{hi\} kn/);
  assert.match(method, /\$\{review\.fleet\.steady\} samples at 4 Hz/);

  assert.ok(view.indexOf("styles.polarPlate") < view.indexOf("styles.perfMethod"));
  assert.ok(view.indexOf("styles.perfTable") < view.indexOf("styles.perfMethod"));
  assert.ok(view.indexOf("styles.vmgPlate") < view.indexOf("styles.perfMethod"));
  assert.ok(view.indexOf("styles.reads") < view.indexOf("styles.perfMethod"));
  assert.match(css, /\.perfMethod > summary\s*\{[^}]*min-height:\s*44px/s);
});

test("Method owns Enter without releasing the race brief", () => {
  const brief = source("src/components/layline/RaceBrief.tsx");
  const performance = source("src/components/layline/BriefPerformance.tsx");
  const interactiveGuard = 'target.closest("a, button, input, select, summary, textarea")';

  assert.match(performance, /<summary[^>]*>\s*Method\s*<\/summary>/, "Method stopped being a native disclosure");
  assert.ok(brief.includes('event.key !== "Enter"'), "the brief background lost its Enter shortcut");
  assert.ok(brief.includes("target.closest("), "the brief shortcut stopped checking the key event target");
  assert.ok(brief.includes(interactiveGuard), "Method and standard controls no longer own Enter");
  assert.ok(brief.includes("isContentEditable"), "editable regions no longer own Enter");
  assert.ok(
    brief.indexOf(interactiveGuard) < brief.indexOf("release();"),
    "the interactive guard runs after the race brief releases",
  );
});

test("race selection carries identity and the rail's exclusive live standings", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const css = source("src/app/prototype/layline/races/races.module.css");

  assert.match(workspace, /<RaceSidebarStatus race=\{raceData\(\)\}/);
  assert.match(workspace, /current &&\s*libraryOpen &&\s*briefDone/);
  assert.match(workspace, /showStandingsDock=\{!libraryOpen\}/);
  assert.match(workspace, /row\.name/);
  assert.match(workspace, /row\.venue/);
  assert.match(workspace, /row\.dateLabel/);
  assert.match(workspace, /row\.boats/);
  assert.match(workspace, /row\.elapsed/);
  assert.match(css, /\.rowShell:has\(\.raceStatus\)[\s\S]*width:\s*min\(316px/);
});

test("Round 3 touch controls keep a 44 pixel floor at 900 and below", () => {
  const analystCss = source("src/components/layline/analyst/analyst.module.css");
  const briefCss = source("src/components/layline/bootSea.module.css");
  const consoleCss = source("src/app/prototype/layline/layline.module.css");
  const racesCss = source("src/app/prototype/layline/races/races.module.css");

  const analystMobile = analystCss.slice(analystCss.indexOf("@media (max-width: 900px)"));
  for (const selector of [".dockChip", ".chip", ".input", ".sendButton", ".retryButton"]) {
    assert.match(analystMobile, new RegExp(`${selector.replace(".", "\\.")}[\\s\\S]*min-height:\\s*44px`));
  }

  const racesMobileStart = racesCss.indexOf("@media (max-width: 900px)");
  const racesMobileEnd = racesCss.indexOf("/* ---- laptop", racesMobileStart);
  const racesMobile = racesCss.slice(racesMobileStart, racesMobileEnd);
  for (const selector of [".paneToggle", ".searchField", ".searchClear", ".rowAction", ".archiveSummary"]) {
    assert.match(racesMobile, new RegExp(`${selector.replace(".", "\\.")}[\\s\\S]*min-height:\\s*44px`));
  }

  assert.match(
    briefCss,
    /@media \(max-width: 900px\)\s*\{\s*\.viewBtn\s*\{[^}]*min-height:\s*44px/s,
  );
  assert.match(
    consoleCss,
    /@media \(max-width: 700px\)[\s\S]*\.dockTop \.wordmarkMeta\s*\{[^}]*display:\s*none/s,
  );
});
