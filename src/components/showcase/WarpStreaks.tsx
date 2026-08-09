"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { AdditiveBlending, Color, Group, ShaderMaterial } from "three";
import { makeIntroStreaks } from "../intro/introGeometry";
import { hashSeed, randomBetween, seededRandom } from "./prng";
import type { WarpFrame } from "./warpTiming";
import { WARP_STREAK_STRETCH } from "./warpTiming";

/*
 * THE SHEATH. A band of frost streaks opening around the lens and lengthening with the true
 * speed of travel, and the one thing in the piece that is not the corridor going past faster.
 *
 * WHY IT HAS ITS OWN POPULATION. A world-space layer built from the star arrays dies exactly
 * at the climax: that band ends at z -105, the camera ends at -95.976 and the fog only
 * reaches 38 units, so the last stretch of the run looks out past the end of the field at
 * nothing at all. And StarField is <points> with a pointsMaterial, and a point cannot be
 * stretched, so reusing it would mean a second geometry anyway. A dedicated band costs the
 * same and cannot run out, because it is periodic in z and parented to the camera.
 *
 * WHY POSITION ONLY, NOT THE QUATERNION. FinaleDebris copies both. A sheath that rolls with
 * the camera shows no roll at all, which would throw away the entire reason the run has any:
 * axis aligned, WARP_ROLL_PEAK shears the streaks across the frame. The lens looks straight
 * down its own z for the whole flight because the pointer is pinned, so the alignment is
 * exact rather than approximate.
 */

const WARP_STREAK_COUNT = 900;
/* Halved on a handset. The band is a screen-filling effect, so the count that reads as a
 * sheath scales with the pixels it is drawn into rather than with the world. */
const WARP_STREAK_COMPACT_COUNT = 450;
/* Just under the fog far of 38 (ShowcaseScene.tsx:3935), so the band's own fade is always
 * dead before the wrap seam could be seen. */
const WARP_STREAK_SPAN = 34;
/* Wider than the frustum at any depth the sheath is bright at, so it never shows an edge. */
const WARP_STREAK_HALF_WIDTH = 7.6;
const WARP_STREAK_HALF_HEIGHT = 4.6;
/* The bokeh colour the star field already carries (ShowcaseScene.tsx:988). Additive and well
 * over the Bloom pass's 0.34 luminance threshold, so the nine level mip chain gives the
 * sheath its halo for nothing and no Bloom instance has to be reached into. */
const WARP_STREAK_COLOR = "#bfd4ff";

const WARP_STREAK_VERTEX_SHADER = /* glsl */ `
  attribute float aTail;
  uniform float uStretch;
  uniform float uFeed;
  uniform float uSpan;
  varying float vDepth;

  void main() {
    vec3 p = position;
    // The corridor never runs out. The band is periodic in z, so sliding it by whole periods
    // is invisible and the feed can run forever on one float a frame. GLSL mod is correct
    // for negative arguments, so the charge's backward feed needs no special case.
    p.z = mod(p.z + uFeed, uSpan) - uSpan;
    vDepth = -p.z;
    // One uniform stretches every tail along +z, which is the direction the camera is
    // leaving from. No geometry rebuild and no CPU per frame, at exactly the moment the
    // camera is moving fastest and the main thread has least to spare.
    p.z += aTail * uStretch;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WARP_STREAK_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSpan;
  varying float vDepth;

  void main() {
    // Its own fade, because a ShaderMaterial carries no fog chunk. Tuned so a streak is
    // already dead by the time it reaches the far end of the band and wraps.
    float fade = 1.0 - smoothstep(uSpan * 0.55, uSpan, vDepth);
    gl_FragColor = vec4(uColor * uOpacity * fade, uOpacity * fade);
  }
`;

/* Seeded like everything else in this scene, so the sheath is identical on every load and
 * every capture. The compact band is a prefix of the full one, drawn from the same seed. */
function warpStreakPositions(count: number) {
  const random = seededRandom(hashSeed("showcase-warp-streaks"));
  const values = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    values[index * 3] = randomBetween(random, -WARP_STREAK_HALF_WIDTH, WARP_STREAK_HALF_WIDTH);
    values[index * 3 + 1] = randomBetween(random, -WARP_STREAK_HALF_HEIGHT, WARP_STREAK_HALF_HEIGHT);
    values[index * 3 + 2] = randomBetween(random, -WARP_STREAK_SPAN, 0);
  }

  return values;
}

export function WarpStreaks({
  warpRef,
  compactViewport,
}: {
  warpRef: MutableRefObject<WarpFrame | null>;
  compactViewport: boolean;
}) {
  const groupRef = useRef<Group>(null);
  // R3F copies a uniforms object onto the material rather than adopting it, so every
  // per-frame write has to go through the material itself.
  const materialRef = useRef<ShaderMaterial>(null);

  /* Two vertices per head sharing one position, tagged head or tail on aTail. Imported from
     the intro rather than copied, so what stretches here and what stretches there cannot
     drift apart. Both vertices of a segment carry the same position, so they wrap on the
     same frame and no segment ever straddles the seam. */
  const streaks = useMemo(() => {
    const count = compactViewport ? WARP_STREAK_COMPACT_COUNT : WARP_STREAK_COUNT;
    return makeIntroStreaks([warpStreakPositions(count)]);
  }, [compactViewport]);

  const uniforms = useMemo(() => ({
    uStretch: { value: 0 },
    uFeed: { value: 0 },
    uSpan: { value: WARP_STREAK_SPAN },
    uOpacity: { value: 0 },
    uColor: { value: new Color(WARP_STREAK_COLOR) },
  }), []);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    const material = materialRef.current;
    if (!group || !material) return;

    const frame = warpRef.current;
    const lit = frame !== null && frame.opacity > 0.001;
    group.visible = lit;
    if (!frame || !lit) return;

    group.position.copy(camera.position);
    material.uniforms.uStretch.value = WARP_STREAK_STRETCH * frame.stretch;
    material.uniforms.uFeed.value = frame.feed;
    material.uniforms.uOpacity.value = frame.opacity;
  });

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[streaks.positions, 3]} />
          <bufferAttribute attach="attributes-aTail" args={[streaks.tails, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={WARP_STREAK_VERTEX_SHADER}
          fragmentShader={WARP_STREAK_FRAGMENT_SHADER}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}
