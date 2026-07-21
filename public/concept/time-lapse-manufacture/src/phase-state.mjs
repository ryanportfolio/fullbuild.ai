export const PHASE_TOKENS = Object.freeze([
  Object.freeze({
    id: "idea",
    index: 0,
    width: 145,
    weight: 700,
    depth: 0,
    scatter: 0.45,
    heat: 0,
    silhouette: "vapor",
  }),
  Object.freeze({
    id: "design",
    index: 1,
    width: 112,
    weight: 680,
    depth: 0.34,
    scatter: 0.28,
    heat: 0.15,
    silhouette: "blueprint",
  }),
  Object.freeze({
    id: "engineering",
    index: 2,
    width: 74,
    weight: 640,
    depth: 0.67,
    scatter: 0.02,
    heat: 0.35,
    silhouette: "machine",
  }),
  Object.freeze({
    id: "shipped",
    index: 3,
    width: 96,
    weight: 720,
    depth: 1,
    scatter: 0,
    heat: 0.12,
    silhouette: "fused",
  }),
]);

const NUMERIC_KEYS = ["index", "width", "weight", "depth", "scatter", "heat"];

export function resolvePhase(target) {
  if (typeof target === "string") {
    return PHASE_TOKENS.find((phase) => phase.id === target) ?? PHASE_TOKENS[0];
  }

  const index = Number.isFinite(target)
    ? Math.min(PHASE_TOKENS.length - 1, Math.max(0, Math.round(target)))
    : 0;

  return PHASE_TOKENS[index];
}

export function interpolatePhase(from, to, progress) {
  const start = resolvePhase(from);
  const end = resolvePhase(to);
  const amount = Math.min(1, Math.max(0, Number(progress) || 0));

  if (amount === 0) return start;
  if (amount === 1) return end;

  const next = {
    id: end.id,
    silhouette: end.silhouette,
  };

  for (const key of NUMERIC_KEYS) {
    next[key] = start[key] + (end[key] - start[key]) * amount;
  }

  return Object.freeze(next);
}
