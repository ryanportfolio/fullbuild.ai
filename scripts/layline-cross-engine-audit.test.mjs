import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function audit(args, seedCount) {
  const result = spawnSync(
    process.execPath,
    ["scripts/layline-cross-engine-audit.mjs", ...args],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, new RegExp(`All ${seedCount} seeds read the same in Node and in Chromium`));
  const summaryLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("AUDIT_SUMMARY "));
  assert.ok(summaryLine, output);
  const summary = JSON.parse(summaryLine.slice("AUDIT_SUMMARY ".length));
  assert.deepEqual({
    seedCount: summary.seedCount,
    failed: summary.failed,
    maxElapsedDrift: summary.maxElapsedDrift,
    maxGapDrift: summary.maxGapDrift,
    maxFixChannelDrift: summary.maxFixChannelDrift,
    maxSimulationFixDrift: summary.maxSimulationFixDrift,
    gapTextDiffs: summary.gapTextDiffs,
    standingsOrderDiffs: summary.standingsOrderDiffs,
    leaderTimelineDiffs: summary.leaderTimelineDiffs,
    finishOrderDiffs: summary.finishOrderDiffs,
    worstSwap: summary.worstSwap,
    strictVectorClosureFailures: summary.strictVectorClosureFailures,
    maxVectorClosureResidual: summary.maxVectorClosureResidual,
  }, {
    seedCount,
    failed: 0,
    maxElapsedDrift: 0,
    maxGapDrift: 0,
    maxFixChannelDrift: 0,
    maxSimulationFixDrift: 0,
    gapTextDiffs: 0,
    standingsOrderDiffs: 0,
    leaderTimelineDiffs: 0,
    finishOrderDiffs: 0,
    worstSwap: 0,
    strictVectorClosureFailures: 0,
    maxVectorClosureResidual: 0,
  });
}

test("known defects and deterministic repair corpus are exactly stable across Node and Chromium", () => {
  audit(["--known", "--corpus", "repair"], 105);
});

test("the deterministic development corpus is exactly stable across Node and Chromium", () => {
  audit(["--corpus", "development"], 100);
});

test("the distinct holdout corpus is exactly stable across Node and Chromium", () => {
  audit(["--corpus", "holdout"], 100);
});

test("all shipped races are exactly stable across Node and Chromium", () => {
  audit(["--shipped"], 3);
});
