import assert from "node:assert/strict";
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

const { analysisFocusWindow, createAnalysisState, transitionAnalysisState } = await import(
  "../src/lib/layline/analysis-state.ts"
);
const { generateRace } = await import("../src/lib/layline/sim.ts");
const { RACE_SEED } = await import("../src/lib/layline/types.ts");

const race = generateRace(RACE_SEED);

test("initial intent is whole-race, unpinned, and fleet referenced", () => {
  const state = createAnalysisState(race, 12);
  assert.equal(state.focusSpanSeconds, null);
  assert.equal(state.focusCenterSeconds, 12);
  assert.deepEqual([state.selectedRange.from, state.selectedRange.to], [race.tMin, race.tMax]);
  assert.equal(state.rangePinned, false);
  assert.deepEqual(state.reference, {
    kind: "fleet-median",
    boatIds: race.boats.map((boat) => boat.id),
  });
});

test("focus changes never mutate the selected analysis range", () => {
  const initial = transitionAnalysisState(race, createAnalysisState(race, 12), {
    type: "set-range",
    from: 2,
    to: 7,
  });
  const focused = transitionAnalysisState(race, initial, {
    type: "set-focus",
    spanSeconds: 10,
    centerSeconds: 20,
  });
  assert.deepEqual(focused.selectedRange, initial.selectedRange);
  assert.equal(focused.rangePinned, true);
  assert.deepEqual(analysisFocusWindow(race, focused), { from: 15, to: 25, span: 10 });
});

test("recenter changes only focus center and clamps at race edges", () => {
  const focused = transitionAnalysisState(race, createAnalysisState(race, 0), {
    type: "set-focus",
    spanSeconds: 30,
  });
  const moved = transitionAnalysisState(race, focused, {
    type: "recenter-focus",
    centerSeconds: race.tMax + 100,
  });
  const window = analysisFocusWindow(race, moved);
  assert.equal(window.to, race.tMax);
  assert.equal(window.span, 30);
  assert.deepEqual(moved.selectedRange, focused.selectedRange);
  assert.deepEqual(moved.reference, focused.reference);
});

test("set IN and OUT normalize, clamp, and pin without changing focus", () => {
  const initial = createAnalysisState(race, 11);
  const inside = transitionAnalysisState(race, initial, { type: "set-range-in", at: 5.125 });
  assert.equal(inside.selectedRange.from, 5.125);
  assert.equal(inside.selectedRange.to, race.tMax);
  assert.equal(inside.rangePinned, true);
  assert.equal(inside.focusCenterSeconds, initial.focusCenterSeconds);

  const outside = transitionAnalysisState(race, inside, { type: "set-range-out", at: 18.25 });
  assert.deepEqual([outside.selectedRange.from, outside.selectedRange.to], [5.125, 18.25]);
  assert.equal(outside.focusCenterSeconds, initial.focusCenterSeconds);
});

test("Use focus copies the viewport once; later focus moves do not drag the range", () => {
  let state = createAnalysisState(race, 20);
  state = transitionAnalysisState(race, state, { type: "set-focus", spanSeconds: 10 });
  state = transitionAnalysisState(race, state, { type: "use-focus" });
  assert.deepEqual([state.selectedRange.from, state.selectedRange.to], [15, 25]);
  const pinned = state.selectedRange;
  state = transitionAnalysisState(race, state, { type: "recenter-focus", centerSeconds: 30 });
  assert.deepEqual(state.selectedRange, pinned);
  assert.deepEqual(analysisFocusWindow(race, state), { from: 25, to: 35, span: 10 });
});

test("reference transition clones fleet IDs and changes no range or focus intent", () => {
  const ids = [race.boats[2].id, race.boats[0].id];
  const initial = createAnalysisState(race, 12);
  const changed = transitionAnalysisState(race, initial, {
    type: "set-reference",
    reference: { kind: "fleet-median", boatIds: ids },
  });
  ids.push("mutation");
  assert.deepEqual(changed.reference, {
    kind: "fleet-median",
    boatIds: [race.boats[2].id, race.boats[0].id],
  });
  assert.deepEqual(changed.selectedRange, initial.selectedRange);
  assert.equal(changed.focusCenterSeconds, initial.focusCenterSeconds);
});

test("reset restores whole range but preserves focus and comparison reference", () => {
  let state = createAnalysisState(race, 12, { kind: "boat", boatId: race.boats[1].id });
  state = transitionAnalysisState(race, state, { type: "set-focus", spanSeconds: 30 });
  state = transitionAnalysisState(race, state, { type: "set-range", from: 3, to: 9 });
  const reset = transitionAnalysisState(race, state, { type: "reset-range" });
  assert.deepEqual([reset.selectedRange.from, reset.selectedRange.to], [race.tMin, race.tMax]);
  assert.equal(reset.rangePinned, false);
  assert.equal(reset.focusSpanSeconds, 30);
  assert.deepEqual(reset.reference, { kind: "boat", boatId: race.boats[1].id });
});

test("invalid pure transition inputs are inert", () => {
  const state = createAnalysisState(race, 12);
  assert.equal(
    transitionAnalysisState(race, state, { type: "set-focus", spanSeconds: 0 }),
    state,
  );
  assert.equal(
    transitionAnalysisState(race, state, { type: "set-range", from: Number.NaN, to: 2 }),
    state,
  );
  assert.equal(
    transitionAnalysisState(race, state, { type: "recenter-focus", centerSeconds: Infinity }),
    state,
  );
});
