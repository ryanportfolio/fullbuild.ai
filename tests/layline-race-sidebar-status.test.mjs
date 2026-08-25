import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("@/")) {
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
      }
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

function source(path) {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("the selected race owns one released-only status module in every list group", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");

  assert.match(workspace, /const briefDone = useReplay\(\(state\) => state\.briefDone\)/);
  assert.match(workspace, /status=\{[^}]*current[^}]*briefDone/);
  assert.match(workspace, /<RaceSidebarStatus race=\{raceData\(\)\}/);
  assert.equal((workspace.match(/<RaceSidebarStatus/g) ?? []).length, 1);
  assert.match(workspace, /{status}/);
  assert.match(workspace, /pinnedRows\.map\(\(row\) => renderRow\(row\)\)/);
  assert.match(workspace, /regularRows\.map\(\(row\) => renderRow\(row\)\)/);
  assert.match(workspace, /archivedRows\.map\(\(row\) => renderRow\(row, true\)\)/);
});

test("race switching immediately removes status while the existing brief authority re-arms", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  const store = source("src/components/layline/store.ts");

  assert.match(workspace, /const \[pendingRaceId, setPendingRaceId\] = useState<string \| null>\(null\)/);
  assert.match(workspace, /setPendingRaceId\(id\)/);
  assert.match(workspace, /pendingRaceId === null/);
  assert.match(workspace, /storeRaceId === initialRaceId/);
  assert.match(store, /selectRace:[\s\S]*briefDone: false/);
});

test("sidebar status consumes the shared live sample without another moving authority", () => {
  const status = source("src/app/prototype/layline/races/RaceSidebarStatus.tsx");

  assert.match(status, /onLive\(race,/);
  assert.match(status, /sampleLive\(race\)/);
  assert.doesNotMatch(status, /requestAnimationFrame|setInterval|setTimeout|advance\(/);
  assert.match(status, /setText\(clockRef\.current, clock\(live\.t\)\)/);
  assert.match(status, /setText\(phaseRef\.current, racePhaseLabel\(live\.leg\)\)/);
  assert.match(status, /if \(next === orderKey\.current\) return/);
});

test("six compact rows reuse follow and scene-focus behavior with accessible readings", () => {
  const status = source("src/app/prototype/layline/races/RaceSidebarStatus.tsx");

  assert.match(status, /aria-label="Live race standings"/);
  assert.match(status, /aria-pressed=\{followed\}/);
  assert.match(status, /onClick=\{\(\) => follow\(boat\.id\)\}/);
  assert.match(status, /onFocus=\{\(\) => focusLiveBoat\(boat\.id\)\}/);
  assert.match(status, /onBlur=\{\(\) => focusLiveBoat\(null\)\}/);
  assert.match(status, /data-live="sidebar-gap"/);
  assert.match(status, /data-followed=\{followed \? "true" : undefined\}/);
});

test("standings readings and phase labels share one honest display adapter", async () => {
  const { racePhaseLabel, standingsReading } = await import(
    "../src/lib/layline/standings-view.ts"
  );
  const elapsed = new Map([["fin", 51.321]]);

  assert.equal(
    standingsReading(
      { boatId: "ldr", rank: 1, leg: "beat", gapMeters: 0, gapSeconds: 0, finished: false },
      elapsed,
    ),
    "LDR",
  );
  assert.equal(
    standingsReading(
      { boatId: "trail", rank: 2, leg: "beat", gapMeters: 4, gapSeconds: 0.44, finished: false },
      elapsed,
    ),
    "+0.4 s",
  );
  assert.equal(
    standingsReading(
      { boatId: "fin", rank: 1, leg: "finished", gapMeters: 0, gapSeconds: 0, finished: true },
      elapsed,
    ),
    "0:51",
  );
  assert.equal(
    standingsReading(
      { boatId: "missing", rank: 6, leg: "finished", gapMeters: 0, gapSeconds: 0, finished: true },
      elapsed,
    ),
    "-",
  );
  assert.deepEqual(
    ["prestart", "beat", "run", "finished"].map(racePhaseLabel),
    ["Prestart", "Beat", "Run", "Finished"],
  );
});

test("the 220 pixel rail module stays inset, readable, focused and non-scrolling", () => {
  const css = source("src/app/prototype/layline/races/races.module.css");

  assert.match(css, /\.raceStatus\s*\{[^}]*border-top:\s*1px solid var\(--rule\)/s);
  assert.match(css, /\.raceStatusRow\s*\{[^}]*grid-template-columns:\s*16px 10px minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.raceStatusRow\s*\{[^}]*min-height:\s*36px/s);
  assert.match(css, /\.raceStatusSail\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.raceStatusReading\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.raceStatusRow:focus-visible\s*\{/);
  assert.match(css, /\.archive:has\(\.raceStatus\) \.archiveRows\s*\{[^}]*max-height:\s*none[^}]*overflow-y:\s*visible/s);
  assert.doesNotMatch(
    css.match(/\.raceStatus\s*\{([^}]*)\}/)?.[1] ?? "",
    /overflow-y:\s*(?:auto|scroll)/,
  );
});
