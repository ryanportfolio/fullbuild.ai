import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Replay overview keeps the scene controls and compact default docks", async () => {
  const [app, instruments] = await Promise.all([
    read("src/components/layline/LaylineApp.tsx"),
    read("src/components/layline/hud/Instruments.tsx"),
  ]);

  assert.match(
    app,
    /const analysisActive =\s*analysisWorkspace !== null &&\s*analysisWorkspace\.workspaceId !== "overview"/,
  );
  assert.match(app, /live && !analysisActive \? <Standings race=\{race\} \/>/);
  assert.match(app, /live && !analysisActive \? \(\s*<Instruments race=\{race\} \/>/);
  assert.doesNotMatch(app, /dockVector|data-vector-dock|<VectorTriangle/);

  assert.deepEqual(
    [...instruments.matchAll(/data-live="([^"]+)"/g)].map((match) => match[1]),
    ["sail", "name", "vmg", "sog", "twa", "tack"],
  );
  assert.match(instruments, /SOG · GROUND SPEED/);
  assert.doesNotMatch(instruments, /VectorTriangle|HDG|TWS|TWD|STW|CTW|DRIFT|COG/);
});

test("Evidence owns one velocity proof and one method disclosure", async () => {
  const [inspector, triangle] = await Promise.all([
    read("src/components/layline/hud/TruthInspector.tsx"),
    read("src/components/layline/hud/VectorTriangle.tsx"),
  ]);

  assert.match(inspector, />Evidence<\/h2>/);
  for (const heading of ["Measured fixes", "Reconstructed state", "Velocity proof"]) {
    assert.ok(inspector.includes(`>${heading}</h3>`), heading);
  }
  assert.equal((inspector.match(/<VectorTriangle/g) ?? []).length, 1);
  assert.doesNotMatch(inspector, /truthVelocityTable|Velocity by frame of reference/);
  assert.match(triangle, /<details className=\{styles\.vectorMethod\}>/);
  assert.match(triangle, /<summary>Method and sources<\/summary>/);
  assert.match(triangle, /4 Hz/);
  assert.match(triangle, /Water velocity plus current equals ground velocity/);
});

test("mobile replay flows scene to transport without hidden stage overflow", async () => {
  const css = await read("src/app/prototype/layline/layline.module.css");
  const mobile = css.split("@media (max-width: 900px) {")[1] ?? "";

  assert.match(mobile, /\.stage\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow:\s*visible/);
  assert.match(mobile, /\.canvasLayer\s*\{[^}]*order:\s*2/);
  assert.match(mobile, /\.dockBottom\s*\{[^}]*order:\s*3[^}]*margin:\s*8px/);
  assert.match(
    mobile,
    /\.stage\[data-analysis-active="true"\] \.dockLeft,\s*\.stage\[data-analysis-active="true"\] \.dockRight\s*\{[^}]*order:\s*4/,
  );
  assert.match(mobile, /\.dockLeft\s*\{[^}]*order:\s*5/);
  assert.match(mobile, /\.dockRight\s*\{[^}]*order:\s*6/);
  assert.doesNotMatch(mobile, /\.dockVector/);
});
