/**
 * Capability + perf gate for the WebGL island. The 3D is progressive
 * enhancement over a complete 2D drawing set — so we only load it where it can
 * hold the frame budget, and render nothing (not a broken canvas) otherwise.
 */
export function canRunExperience(): boolean {
  if (typeof window === 'undefined') return false;

  // Respect reduced motion — the static sheets ARE the reduced-motion spec.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }

  // Real WebGL context probe.
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return false;
  } catch {
    return false;
  }

  // Low-memory / low-core heuristics — protect mid-range mobile.
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return false;
  if (
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency < 4
  ) {
    return false;
  }

  return true;
}
