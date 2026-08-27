import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/app/prototype/layline/layline.module.css", "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

test("desktop task panels reserve their owned side from the replay transport", () => {
  const leftPanel = rule('.stage[data-analysis-panel-dock="left"] .dockLeft');
  const leftTransport = rule('.stage[data-analysis-panel-dock="left"] .dockBottom');
  const rightPanel = rule('.stage[data-analysis-panel-dock="right"] .dockRight');
  const rightTransport = rule('.stage[data-analysis-panel-dock="right"] .dockBottom');
  const compareTransport = rule('.stage[data-analysis-workspace="compare"] .dockBottom');

  assert.match(leftPanel, /bottom:\s*8px/);
  assert.match(leftPanel, /overflow-y:\s*auto/);
  assert.match(leftTransport, /left:\s*280px/);
  assert.doesNotMatch(leftTransport, /right\s*:/);
  assert.match(rightPanel, /bottom:\s*8px/);
  assert.match(rightPanel, /overflow-y:\s*auto/);
  assert.match(rightTransport, /right:\s*280px/);
  assert.doesNotMatch(rightTransport, /left\s*:/);
  assert.match(compareTransport, /left:\s*calc\(min\(42%,\s*360px\)\s*\+\s*16px\)/);
  assert.doesNotMatch(compareTransport, /right\s*:/);
});

test("desktop side reservation keeps phone docks in normal document flow", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(
    phone,
    /\.dockLeft,\s*\n\s*\.dockRight,\s*\n\s*\.dockBottom\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*auto;/,
  );
  assert.match(rule(".analysisLayerReset"), /min-height:\s*32px/);
  assert.match(css, /\.analysisLayerReset\s*\{\s*align-self:\s*flex-start;\s*cursor:\s*var\(--house-cursor\);/);
});
