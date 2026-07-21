function normalizeIndex(stages, target) {
  if (typeof target === "string") return stages.findIndex(({ id }) => id === target);
  if (!Number.isFinite(target)) return -1;
  return Math.trunc(target);
}

export function createStageMachine({
  stages,
  deploymentVerified = false,
  reducedMotion = false,
  initialIndex = 0,
  onChange = () => {},
} = {}) {
  if (!Array.isArray(stages) || stages.length === 0) throw new TypeError("stages must be a nonempty array");

  let active = true;
  let currentIndex = Math.min(stages.length - 1, Math.max(0, Math.trunc(initialIndex)));
  let previousIndex = currentIndex;

  const snapshot = () => Object.freeze({
    id: stages[currentIndex].id,
    index: currentIndex,
    fromIndex: previousIndex,
    toIndex: currentIndex,
    progress: 1,
    locked: Boolean(stages[currentIndex].locked && !deploymentVerified),
    reducedMotion: Boolean(reducedMotion),
  });

  const set = (target) => {
    if (!active) return false;
    const nextIndex = normalizeIndex(stages, target);
    if (nextIndex < 0 || nextIndex >= stages.length || nextIndex === currentIndex) return false;
    if (stages[nextIndex].locked && !deploymentVerified) return false;

    previousIndex = currentIndex;
    currentIndex = nextIndex;
    onChange(snapshot());
    return true;
  };

  const next = () => set(currentIndex + 1);
  const previous = () => set(currentIndex - 1);
  const handleKey = (input) => {
    const key = typeof input === "string" ? input : input?.key;
    if (key === "ArrowRight" || key === "ArrowDown") return next();
    if (key === "ArrowLeft" || key === "ArrowUp") return previous();
    if (key === "Home") return set(0);
    if (key === "End") return set(stages.length - 1);
    return false;
  };

  return Object.freeze({
    set,
    next,
    previous,
    handleKey,
    getState: snapshot,
    destroy() {
      active = false;
    },
  });
}
