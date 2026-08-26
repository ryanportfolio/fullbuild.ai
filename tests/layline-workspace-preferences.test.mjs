import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const {
  DEFAULT_WORKSPACE_PREFERENCES,
  hydrateWorkspacePreferences,
  libraryOpenFromPreferences,
  parseWorkspacePreferences,
  toggleLibraryPreference,
} = await import("../src/app/prototype/layline/races/workspaceState.ts");

const validIds = new Set(["long-beach", "kestrel-sound", "sable-reach"]);

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function stored(overrides = {}) {
  return JSON.stringify({
    ...DEFAULT_WORKSPACE_PREFERENCES,
    ...overrides,
  });
}

test("first visit and persisted second visit both stay replay first", () => {
  const first = hydrateWorkspacePreferences(
    DEFAULT_WORKSPACE_PREFERENCES,
    null,
    validIds,
  );
  assert.equal(first.railCollapsed, true);
  assert.equal(libraryOpenFromPreferences(first), false);

  const cookieOnSecondVisit = parseWorkspacePreferences(JSON.stringify(first), validIds);
  const second = hydrateWorkspacePreferences(cookieOnSecondVisit, null, validIds);
  assert.equal(second.railCollapsed, true);
  assert.equal(libraryOpenFromPreferences(second), false);
});

test("cookie preference survives absent or blocked local storage", () => {
  const cookiePreference = parseWorkspacePreferences(
    stored({ railCollapsed: false }),
    validIds,
  );

  for (const localValue of [null, undefined]) {
    const hydrated = hydrateWorkspacePreferences(cookiePreference, localValue, validIds);
    assert.equal(hydrated.railCollapsed, false);
    assert.equal(libraryOpenFromPreferences(hydrated), true);
  }
});

test("an existing local preference overrides the cookie", () => {
  const cookiePreference = parseWorkspacePreferences(
    stored({ railCollapsed: true }),
    validIds,
  );
  const hydrated = hydrateWorkspacePreferences(
    cookiePreference,
    stored({ railCollapsed: false }),
    validIds,
  );

  assert.equal(hydrated.railCollapsed, false);
  assert.equal(libraryOpenFromPreferences(hydrated), true);
});

test("invalid local storage leaves the cookie preference intact", () => {
  const cookiePreference = parseWorkspacePreferences(
    stored({ railCollapsed: false }),
    validIds,
  );
  const hydrated = hydrateWorkspacePreferences(cookiePreference, "{broken", validIds);

  assert.deepEqual(hydrated, cookiePreference);
  assert.equal(libraryOpenFromPreferences(hydrated), true);
});

test("user toggle changes visible and persisted preference as one transition", () => {
  const first = hydrateWorkspacePreferences(
    DEFAULT_WORKSPACE_PREFERENCES,
    null,
    validIds,
  );
  const opened = toggleLibraryPreference(first);
  assert.equal(opened.railCollapsed, false);
  assert.equal(libraryOpenFromPreferences(opened), true);

  const reloaded = hydrateWorkspacePreferences(
    parseWorkspacePreferences(JSON.stringify(opened), validIds),
    null,
    validIds,
  );
  assert.deepEqual(reloaded, opened);
  assert.equal(libraryOpenFromPreferences(reloaded), true);

  const closed = toggleLibraryPreference(opened);
  assert.equal(closed.railCollapsed, true);
  assert.equal(libraryOpenFromPreferences(closed), false);
});

test("production has one library visibility owner and one accessible control", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");

  assert.match(workspace, /const libraryOpen = libraryOpenFromPreferences\(preferences\)/);
  assert.doesNotMatch(workspace, /setLibraryOpen|const \[libraryOpen/);
  assert.equal((workspace.match(/id="race-list-toggle"/g) ?? []).length, 1);
  assert.equal((workspace.match(/aria-controls="race-library-panel"/g) ?? []).length, 1);
  assert.match(workspace, /aria-expanded=\{libraryOpen\}/);
  assert.match(workspace, /hidden=\{!libraryOpen\}/);
  assert.match(
    workspace,
    /aria-label=\{preferences\.railCollapsed \? "Restore race list" : "Collapse race list"\}/,
  );
});
