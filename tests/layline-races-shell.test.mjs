import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the race workspace opens as a replay-first shell with two accessible drawers", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");

  assert.match(workspace, /const libraryOpen = libraryOpenFromPreferences\(preferences\)/);
  assert.doesNotMatch(workspace, /setLibraryOpen|const \[libraryOpen/);
  assert.match(workspace, /const \[analystOpen, setAnalystOpen\] = useState\(false\)/);
  assert.match(workspace, /const \[analystReady, setAnalystReady\] = useState\(false\)/);

  assert.ok(workspace.includes('aria-controls="race-library-panel"'));
  assert.equal((workspace.match(/id="race-list-toggle"/g) ?? []).length, 1);
  assert.ok(workspace.includes("aria-expanded={libraryOpen}"));
  assert.ok(workspace.includes("hidden={!libraryOpen}"));
  assert.ok(workspace.includes('aria-controls="race-debrief-panel"'));
  assert.ok(workspace.includes("aria-expanded={analystOpen}"));
  assert.ok(workspace.includes("hidden={!analystOpen}"));
  assert.ok(
    workspace.includes("mounted && analystReady"),
    "the analyst is not retained after its first open",
  );

  assert.ok(
    workspace.includes('<AnalystSection key={raceId} variant="rail" />'),
    "the existing analyst integration was replaced",
  );
  assert.ok(
    workspace.includes('autoplay="immediate"'),
    "the replay lost its library autoplay contract",
  );
  assert.ok(
    /* Restated 2026-08-30 for the params-preserving select(). */
    workspace.includes("router.replace(`${pathname}?${params.toString()}`, { scroll: false })"),
    "race switching no longer keeps the workspace in place",
  );
});

test("the shell gives desktop width to replay and stacks its drawers around it on smaller screens", () => {
  const css = source("src/app/prototype/layline/races/races.module.css");

  assert.match(
    css,
    /grid-template-columns:\s*var\(--library-track\)\s+12px\s+minmax\(560px,\s*1fr\)\s+12px\s+var\(--analyst-track\)/,
  );
  assert.match(css, /--library-track:\s*52px/);
  assert.match(css, /--analyst-track:\s*52px/);
  assert.match(css, /data-library-open="true"[\s\S]*--library-track:\s*220px/);
  assert.match(css, /data-analyst-open="true"[\s\S]*--analyst-track:\s*340px/);
  assert.match(css, /\.drawerBody\[hidden\]\s*\{\s*display:\s*none/);

  const stacked = css.match(/@media \(max-width: 1199px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(stacked, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(stacked, /\.console\s*\{[\s\S]*height:\s*70vh/);
});

test("phone gives only the live selected card room for two standings columns", () => {
  const css = source("src/app/prototype/layline/races/races.module.css");
  const stacked = css.match(/@media \(max-width: 1199px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(stacked, /\.rowShell\s*\{[\s\S]*width:\s*168px/);
  assert.match(stacked, /\.rowShell:has\(\.raceStatus\)\s*\{[\s\S]*width:\s*min\(316px/);
  assert.match(stacked, /\.raceStatusRows\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(stacked, /\.raceStatusRow\s*\{[\s\S]*min-height:\s*36px/);
});

test("skip links land on controls that stay available while drawers are closed", () => {
  const page = source("src/app/prototype/layline/races/page.tsx");

  assert.ok(page.includes('href="#race-list-toggle"'));
  assert.ok(page.includes('href="#race-analyst-toggle"'));
});
