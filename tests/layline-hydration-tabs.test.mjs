import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the selected route race owns the server render and first client hydration", () => {
  const page = source("src/app/prototype/layline/races/page.tsx");
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const app = source("src/components/layline/LaylineApp.tsx");

  assert.match(page, /Object\.freeze\(\{ id: selectedId, seed: race\.seed \}\)/);
  assert.match(page, /initialRace=\{initialRace\}/);
  assert.match(workspace, /initialRace: InitialRaceAuthority/);
  assert.match(
    workspace,
    /<LaylineApp[\s\S]*initialRace=\{initialRace\}[\s\S]*useInitialRace=\{!mounted\}/,
  );
  assert.match(app, /initialRace\?: InitialRaceAuthority/);
  assert.match(app, /useInitialRace\?: boolean/);
  assert.match(app, /generateRace\(initialRace\.seed\)/);
  assert.match(app, /initialRaceData \?\? raceData\(\)/);
  assert.doesNotMatch(app, /useMemo\(\(\) => raceData\(\), \[\]\)/);
  assert.match(workspace, /typeof window !== "undefined"\) pointAtRace\(initialRace\.id\)/);
});

test("the 390px Analyze picker uses two task columns without nested overflow", () => {
  const css = source("src/app/prototype/layline/layline.module.css");
  const phone = css.split("@media (max-width: 479px) {")[1] ?? "";

  assert.match(
    phone,
    /\.analysisWorkspaceTabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(phone, /\.analysisTaskPicker\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.analysisWorkspaceTabs[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.analysisWorkspaceTab[^}]*min-width:\s*0[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.analysisWorkspaceTab:focus-visible,[\s\S]*?outline:\s*2px solid/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.analysisWorkspaceTab\s*\{[\s\S]*min-height:\s*44px/);
});
