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
  varying float vFogDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uFill;
  uniform vec3 uHatch;
  uniform float uSpacing;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying float vFogDepth;

  void main() {
    // 45° hatch in world space: constant along (x - z), stepping along (x + z).
    float d = (vWorld.x + vWorld.z) / uSpacing;
    float f = fract(d);
    // Anti-aliased thin line centred on each integer stride.
    float aa = fwidth(d) * 1.2 + 1e-4;
    float edge = min(f, 1.0 - f);
    float line = 1.0 - smoothstep(0.0, aa, edge);
    vec3 col = mix(uFill, uHatch, line * 0.85);
    // Hand-rolled linear fog matching three's own curve: a raw ShaderMaterial
    // gets no fog chunks, and an unfogged cut face on the deepest bent reads
    // as a hole punched through the aerial recession the rest of the set has.
    float fogT = clamp((vFogDepth - uFogNear) / max(uFogFar - uFogNear, 1e-4), 0.0, 1.0);
    gl_FragColor = vec4(mix(col, uFogColor, fogT), 1.0);
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
        uFogColor: { value: new Color(0xffffff) },
        uFogNear: { value: 1 },
        uFogFar: { value: 1e9 }, // inert until the scene sets real fog
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

  /** Mirror the scene's linear fog onto this material's hand-rolled copy. */
  setFog(color: Color, near: number, far: number): void {
    (this.uniforms.uFogColor.value as Color).copy(color);
    this.uniforms.uFogNear.value = near;
    this.uniforms.uFogFar.value = far;
  }
}
