import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url);

const IMPLEMENTATION_DEPENDENT_MATH = Object.freeze([
  "acos",
  "atan2",
  "cos",
  "exp",
  "hypot",
  "log",
  "sin",
  "sqrt",
]);

const SOURCE_MODULE = "src/lib/layline/simulation-math.ts";
const SIMULATOR_GRAPH = Object.freeze([
  "src/lib/layline/sim.ts",
  "src/lib/layline/current.ts",
  "src/lib/layline/laylines.ts",
  "src/lib/layline/velocity.ts",
  SOURCE_MODULE,
]);

const ALLOWED_DIRECT_SITES = Object.freeze({
  "src/lib/layline/current.ts": Object.freeze([]),
  "src/lib/layline/laylines.ts": Object.freeze([
    "hypot", "hypot", "hypot", "hypot", "sqrt", "hypot",
  ]),
  "src/lib/layline/sim.ts": Object.freeze([]),
  "src/lib/layline/simulation-math.ts": Object.freeze([
    "acos", "atan2", "exp", "hypot", "log", "sqrt",
  ]),
  "src/lib/layline/velocity.ts": Object.freeze([
    "atan2", "cos", "hypot", "hypot", "hypot", "hypot", "sin",
  ]),
});

const ALLOWED_MATH_MEMBERS = Object.freeze({
  "src/lib/layline/current.ts": Object.freeze([
    "PI", "PI", "PI", "PI", "PI",
    "abs", "abs", "abs", "abs", "abs", "abs", "abs", "abs", "abs",
    "max", "max", "max", "max",
  ]),
  "src/lib/layline/laylines.ts": Object.freeze([
    "abs", "abs", "hypot", "hypot", "hypot", "hypot", "hypot",
    "max", "min", "min", "sqrt",
  ]),
  "src/lib/layline/sim.ts": Object.freeze([
    "PI", "PI", "PI", "PI",
    ...Array(25).fill("abs"),
    "ceil", "ceil", "floor", "floor", "imul", "imul", "imul",
    ...Array(17).fill("max"),
    "min", "min", "min", "min", "min",
    "round", "round", "round", "sign", "sign",
  ]),
  "src/lib/layline/simulation-math.ts": Object.freeze([
    "PI", "PI", "PI", "acos", "atan2", "exp", "hypot", "log",
    "round", "round", "sqrt",
  ]),
  "src/lib/layline/velocity.ts": Object.freeze([
    "PI", "abs", "atan2", "cos", "hypot", "hypot", "hypot", "hypot", "sin",
  ]),
});

function directMathSources(source) {
  const names = [];
  const pattern = /Math\.(acos|atan2|cos|exp|hypot|log|sin|sqrt)\s*\(/g;
  for (const match of source.matchAll(pattern)) names.push(match[1]);
  return names.sort();
}

function mathMembers(source) {
  return [...source.matchAll(/Math\.([A-Za-z0-9_]+)/g)].map((match) => match[1]).sort();
}

test("simulator determinism has one auditable source boundary and no recurrence scatter", async () => {
  const sources = Object.fromEntries(await Promise.all(SIMULATOR_GRAPH.map(async (path) => [
    path,
    await readFile(new URL(path, ROOT), "utf8"),
  ])));

  assert.match(sources[SOURCE_MODULE], /export function simulationExp\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationLog\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationSqrt\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationAcos\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationAtan2\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationHypot\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationSin\(/);
  assert.match(sources[SOURCE_MODULE], /export function simulationCos\(/);

  for (const [path, expected] of Object.entries(ALLOWED_DIRECT_SITES)) {
    assert.deepEqual(directMathSources(sources[path]), [...expected].sort(), path);
    assert.deepEqual(mathMembers(sources[path]), [...ALLOWED_MATH_MEMBERS[path]].sort(), `${path}: Math.* classification`);
  }

  const tacticalStart = sources["src/lib/layline/laylines.ts"].indexOf("function buildTacticalLaylineGuidance");
  const tacticalEnd = sources["src/lib/layline/laylines.ts"].indexOf("function finalizeTrace", tacticalStart);
  assert.ok(tacticalStart >= 0 && tacticalEnd > tacticalStart);
  assert.deepEqual(directMathSources(sources["src/lib/layline/laylines.ts"].slice(tacticalStart, tacticalEnd)), []);

  assert.match(sources["src/lib/layline/sim.ts"], /from "\.\/simulation-math"/);
  assert.equal((sources["src/lib/layline/sim.ts"].match(/\bmulberry32\s*\(/g) ?? []).length, 4);
  assert.equal((sources["src/lib/layline/current.ts"].match(/\bseededUnit\s*\(/g) ?? []).length, 2);

  const scatteredNames = [
    "stableSimulationNumber",
    "stabilize",
    "NumericStabilizer",
  ];
  for (const path of SIMULATOR_GRAPH) {
    if (path === SOURCE_MODULE) continue;
    for (const name of scatteredNames) {
      assert.doesNotMatch(sources[path], new RegExp(`\\b${name}\\b`), `${path}: ${name}`);
    }
  }

  for (const name of IMPLEMENTATION_DEPENDENT_MATH) {
    const wrapper = `simulation${name[0].toUpperCase()}${name.slice(1)}`;
    assert.match(sources[SOURCE_MODULE], new RegExp(`export function ${wrapper}\\(`));
  }
});
