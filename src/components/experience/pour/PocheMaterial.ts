/* ============================================================================
   SECTION POCHÉ — the drafted concrete cut-fill, drawn not rendered.

   A flat, unlit ShaderMaterial that fills a section cap with --ink-concrete and
   overlays a 45° hatch computed from WORLD coordinates, so the hatch is crisp
   and resolution-independent and reads continuously across every cut face at
   the same fill level. Zero emissive, zero specular — it is linework, not light.
   ========================================================================= */

import { ShaderMaterial, Color, DoubleSide } from 'three';

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uFill;
  uniform vec3 uHatch;
  uniform float uSpacing;
  varying vec3 vWorld;

  void main() {
    // 45° hatch in world space: constant along (x - z), stepping along (x + z).
    float d = (vWorld.x + vWorld.z) / uSpacing;
    float f = fract(d);
    // Anti-aliased thin line centred on each integer stride.
    float aa = fwidth(d) * 1.2 + 1e-4;
    float edge = min(f, 1.0 - f);
    float line = 1.0 - smoothstep(0.0, aa, edge);
    vec3 col = mix(uFill, uHatch, line * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface PocheColors {
  fill: Color;
  hatch: Color;
}

export class PocheMaterial extends ShaderMaterial {
  constructor(colors: PocheColors, spacing = 0.14) {
    super({
      uniforms: {
        uFill: { value: colors.fill.clone() },
        uHatch: { value: colors.hatch.clone() },
        uSpacing: { value: spacing },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: DoubleSide,
      toneMapped: true,
    });
  }

  setColors(colors: PocheColors): void {
    (this.uniforms.uFill.value as Color).copy(colors.fill);
    (this.uniforms.uHatch.value as Color).copy(colors.hatch);
  }
}
