export const PHASE_TOKENS = Object.freeze([
  Object.freeze({
    id: "idea",
    index: 0,
    width: 145,
    weight: 760,
    depth: 0,
    seam: 24,
    silhouette: "fluid",
  }),
  Object.freeze({
    id: "design",
    index: 1,
    width: 112,
    weight: 700,
    depth: 0.35,
    seam: 42,
    silhouette: "planar",
  }),
  Object.freeze({
    id: "engineering",
    index: 2,
    width: 72,
    weight: 640,
    depth: 0.72,
    seam: 64,
    silhouette: "articulated",
  }),
  Object.freeze({
    id: "shipped",
    index: 3,
    width: 98,
    weight: 720,
    depth: 1,
    seam: 86,
    silhouette: "fused",
  }),
]);

const NUMERIC_KEYS = ["index", "width", "weight", "depth", "seam"];

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
