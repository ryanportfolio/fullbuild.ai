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

  // The island renders inside a reserved band cell beside the rail (the Margin
  // Law); below 1024px there is no room for that cell, the sheets stack to one
  // column, and the static SVG floor stands in for the frame. Progressive
  // enhancement, not content — matching the reduced-motion path.
  if (window.matchMedia?.('(max-width: 1023px)').matches) {
    return false;
  }

  // Real WebGL context probe.
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    if (!gl) return false;

    // A context that exists but rasterizes on the CPU (SwiftShader, llvmpipe,
    // Microsoft Basic Render) can't hold the frame budget — the static sheets
    // are strictly better than a single-digit-fps pour. Fail open when the
    // extension is masked (privacy builds): an absent string is not evidence
    // of a software renderer.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String(
        gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '',
      );
      if (/swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer)) {
        return false;
      }
    }
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
