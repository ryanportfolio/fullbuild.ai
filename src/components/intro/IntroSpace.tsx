"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DataTexture,
  LinearFilter,
  MathUtils,
  RGBAFormat,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from "three";
import {
  INTRO_APERTURE_LOCAL,
  INTRO_THRESHOLD_LOCAL_Z,
  INTRO_DEBRIS_COUNT,
  INTRO_MOTE_COUNT,
  INTRO_STAR_BOKEH_COUNT,
  INTRO_STAR_MID_COUNT,
  INTRO_STAR_PINPOINT_COUNT,
  introDebrisSeeds,
  introMotePositions,
  introStarPositions,
  makeIntroStreaks,
} from "./introGeometry";

/*
 * THE SPACE, DIALLED UP. Five populations, every one of them seeded and fixed in count, so
 * the field is identical on every load and every capture.
 *
 * The near motes are the load-bearing population and must not be cut for budget. Far stars
 * barely move under five units of dolly: only near geometry streaks, so the motes are what
 * makes the warp read as speed at all. Their z band puts them squarely in the path.
 *
 * PURITY, same contract as the sculpture: time arrives as a ref the owner writes, never
 * from the render clock, so a captured beat reproduces exactly.
 */

const STREAK_VERTEX_SHADER = /* glsl */ `
  attribute float aTail;
  uniform float uStretch;

  void main() {
    // One uniform stretches every tail along +z, which is the direction the camera is
    // leaving from. No geometry rebuild, no CPU per frame, at exactly the moment the
    // camera is moving fastest and the main thread has least to spare.
    vec3 p = position + vec3(0.0, 0.0, aTail * uStretch);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const STREAK_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor * uOpacity, uOpacity);
  }
`;

/*
 * The cobalt has to travel with the camera. A fixed world light gets left behind inside a
 * single second of dolly, which is why this is a camera-anchored additive billboard: objects
 * silhouette into it and the corners still fall to black.
 */
const GLOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uAspect;

  varying vec2 vUv;

  void main() {
    // Not a screen-space circle. The wash is wider than it is tall: it reaches the side
    // edges of the frame while the top and bottom corners stay black, so the horizontal
    // axis is only part-compensated for aspect.
    vec2 offset = (vUv - 0.5 - vec2(0.0, 0.05)) * vec2(uAspect * 0.58, 1.0);
    float distance = length(offset) / max(0.0001, uRadius);
    float skirt = exp(-distance * distance * 1.25);
    float halo = exp(-distance * distance * 4.4);
    float core = exp(-distance * distance * 16.0);
    // A gaussian never reaches zero and the sRGB encode turns whatever is left into twenty
    // counts of navy in every corner, so the wash is windowed to a finite extent.
    float reach = 1.0 - smoothstep(0.46, 0.9, distance);
    float amount = (skirt * 0.2 + halo * 0.62 + core * 0.72) * reach * uOpacity;
    gl_FragColor = vec4(uColor * amount, 1.0);
  }
`;

/*
 * THRESHOLD ENERGY. A soft disc parented to the artifact at the aperture, growing as the
 * camera commits. Its r, g and b are sampled at slightly different radii so the rim fringes:
 * chromatic energy confined to the one disc where the metaphor puts it, rather than a
 * full-frame aberration pass that would cost a composer to run.
 */
const THRESHOLD_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFringe;

  varying vec2 vUv;

  float lobe(vec2 uv, float grow) {
    float d = length(uv - 0.5) * 2.0 / max(0.0001, 1.0 + grow);
    return exp(-d * d * 3.2) * (1.0 - smoothstep(0.7, 1.0, d));
  }

  void main() {
    float r = lobe(vUv, uFringe);
    float g = lobe(vUv, 0.0);
    float b = lobe(vUv, -uFringe);
    vec3 amount = vec3(r, g, b) * uColor * uOpacity;
    gl_FragColor = vec4(amount, 1.0);
  }
`;

function usePointSprite() {
  const texture = useMemo(() => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = (y * size + x) * 4;
        const distance = Math.hypot(x - center, y - center) / center;
        const falloff = Math.max(0, 1 - distance);
        const alpha = Math.pow(falloff, 2.1) * 0.82 + Math.pow(falloff, 9) * 0.18;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.round(MathUtils.clamp(alpha, 0, 1) * 255);
      }
    }
    const map = new DataTexture(data, size, size, RGBAFormat);
    map.minFilter = LinearFilter;
    map.magFilter = LinearFilter;
    map.needsUpdate = true;
    return map;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

export default function IntroSpace({
  artifactRef,
  timeRef,
  pointerRef,
  pinnedRef,
  stretchRef,
  glowRef,
  thresholdRef,
}: {
  artifactRef: MutableRefObject<Group | null>;
  timeRef: MutableRefObject<number>;
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  /* Under a pinned beat the drift takes its target outright rather than easing toward it, so
     a captured frame is the settled frame instead of one still on its way there. */
  pinnedRef: MutableRefObject<boolean>;
  /* 0 to 1 across charge and warp. The one number that says how fast we are going. */
  stretchRef: MutableRefObject<number>;
  /* 0 to 1 across the reveal, stepping up at the crossing. */
  glowRef: MutableRefObject<number>;
  /* 0 to 1 across the warp. Drives the disc at the doorway. */
  thresholdRef: MutableRefObject<number>;
}) {
  const sprite = usePointSprite();
  const driftRef = useRef<Group>(null);
  const streakMaterialRef = useRef<ShaderMaterial>(null);
  const glowMeshRef = useRef<Mesh>(null);
  const glowMaterialRef = useRef<ShaderMaterial>(null);
  const thresholdMeshRef = useRef<Mesh>(null);
  const thresholdMaterialRef = useRef<ShaderMaterial>(null);
  const debrisRef = useRef<Group>(null);
  const forward = useMemo(() => new Vector3(), []);
  const thresholdColor = useMemo(() => new Color("#1640ff"), []);
  const thresholdWarm = useMemo(() => new Color("#f1f4ff"), []);
  const thresholdLive = useMemo(() => new Color("#1640ff"), []);

  const pinpoints = useMemo(() => introStarPositions("intro-star-pinpoints", INTRO_STAR_PINPOINT_COUNT, 1), []);
  const mids = useMemo(() => introStarPositions("intro-star-mids", INTRO_STAR_MID_COUNT, 1.05), []);
  const bokeh = useMemo(() => introStarPositions("intro-star-bokeh", INTRO_STAR_BOKEH_COUNT, 1.1), []);
  const motes = useMemo(() => introMotePositions("intro-motes", INTRO_MOTE_COUNT), []);
  const debris = useMemo(() => introDebrisSeeds("intro-debris", INTRO_DEBRIS_COUNT), []);
  /* The streaks share the motes and the pinpoints rather than owning a population of their
     own, so what stretches is exactly what was already in the sky. */
  const streaks = useMemo(() => makeIntroStreaks([motes, pinpoints]), [motes, pinpoints]);

  const streakUniforms = useMemo(() => ({
    uStretch: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new Color("#bfd4ff") },
  }), []);

  const glowUniforms = useMemo(() => ({
    // All but pure blue. Any green in the source colour survives the sRGB encode as a
    // visible grey cast over the whole wash.
    uColor: { value: new Color("#0512ff") },
    uOpacity: { value: 0 },
    /*
     * WIDER THAN THE SHOWCASE'S 0.52, BUT NOT MUCH. Taken to 0.78 the wash stops hugging
     * the object and floods the frame: measured at 1440x900 the billboard is scaled 1.3x
     * the frustum, so the visible corner sits at uv 0.115 and lands at distance 0.72, well
     * inside the shader's 0.46 to 0.9 window. The corners came up navy, the star field
     * washed out, and the piece read as blue fog rather than as space.
     *
     * At 0.58 the same corner lands at 0.97 and the window returns a literal zero, so the
     * corners hold black and the stars have something to be bright against. The space is
     * dialled up by the POPULATIONS, which is the honest lever: five thousand pinpoints, a
     * near field of motes and the streaks that ride them. More space, not more fog.
     */
    uRadius: { value: 0.58 },
    uAspect: { value: 1 },
  }), []);

  const thresholdUniforms = useMemo(() => ({
    uColor: { value: thresholdLive },
    uOpacity: { value: 0 },
    uFringe: { value: 0 },
  }), [thresholdLive]);

  useFrame(({ camera, size }, delta) => {
    const time = timeRef.current;
    const pointer = pointerRef.current;
    const step = Math.min(0.034, delta);
    const stretch = stretchRef.current;

    // The sky leans away from the pointer while the artifact holds the center, which is the
    // parallax that says the mark is nearer than the stars.
    const settled = pinnedRef.current;
    const drift = driftRef.current;
    if (drift) {
      const driftX = pointer.x * -0.22;
      const driftY = pointer.y * -0.12;
      drift.position.x = settled ? driftX : MathUtils.damp(drift.position.x, driftX, 3.4, step);
      drift.position.y = settled ? driftY : MathUtils.damp(drift.position.y, driftY, 3.4, step);
    }

    const debrisGroup = debrisRef.current;
    if (debrisGroup) {
      // One rotation off the owner's clock, applied to the whole field: cheap, and enough
      // to keep the plates from reading as a frozen still.
      debrisGroup.rotation.z = Math.sin(time * 0.08) * 0.04;
    }

    const streakMaterial = streakMaterialRef.current;
    if (streakMaterial) {
      streakMaterial.uniforms.uStretch.value = stretch * 0.9;
      streakMaterial.uniforms.uOpacity.value = stretch * 0.85;
    }

    const glowMesh = glowMeshRef.current;
    const glowMaterial = glowMaterialRef.current;
    if (glowMesh && glowMaterial) {
      const distance = 24;
      const fov = "fov" in camera ? camera.fov : 50;
      const height = 2 * Math.tan(MathUtils.degToRad(fov * 0.5)) * distance;
      const width = height * (size.width / Math.max(1, size.height));
      camera.getWorldDirection(forward);
      glowMesh.position.copy(camera.position).addScaledVector(forward, distance);
      glowMesh.quaternion.copy(camera.quaternion);
      glowMesh.scale.set(width * 1.3, height * 1.3, 1);
      glowMaterial.uniforms.uAspect.value = width / Math.max(0.0001, height);
      glowMaterial.uniforms.uOpacity.value = glowRef.current;
    }

    const thresholdMesh = thresholdMeshRef.current;
    const thresholdMaterial = thresholdMaterialRef.current;
    const artifact = artifactRef.current;
    if (thresholdMesh && thresholdMaterial && artifact) {
      const energy = thresholdRef.current;
      // Parented to nothing, placed on the artifact: the disc has to sit in the doorway
      // wherever the chase left it, but it must not inherit the mark's tilt or it would
      // present its own edge to the lens at exactly the moment it is flown through.
      thresholdMesh.position.set(
        artifact.position.x + artifact.scale.x * INTRO_APERTURE_LOCAL[0],
        artifact.position.y + artifact.scale.y * INTRO_APERTURE_LOCAL[1],
        artifact.position.z + artifact.scale.z * INTRO_THRESHOLD_LOCAL_Z,
      );
      thresholdMesh.quaternion.copy(camera.quaternion);
      // Grows harder than it used to, because it is now the frame's light source at the
      // crossing rather than a highlight beside one, and it keeps growing past the crossing so
      // the burst has something to be the end of.
      const grow = 1 + 5.5 * energy;
      // Bigger base than the showcase's highlight, because it is eight local units down the
      // doorway rather than sitting on it: same apparent size needs more disc at that range.
      thresholdMesh.scale.setScalar(0.9 * artifact.scale.x * grow);
      // The colour lerp is clamped even though the energy is not: past 1 the ramp is about
      // brightness, and an unclamped lerp would run the hue off the end of the palette.
      thresholdColor.copy(thresholdLive).lerp(thresholdWarm, MathUtils.clamp(energy, 0, 1));
      thresholdMaterial.uniforms.uColor.value.copy(thresholdColor);
      thresholdMaterial.uniforms.uOpacity.value = energy * 0.95;
      thresholdMaterial.uniforms.uFringe.value = 0.006 * Math.min(1, energy);
      thresholdMesh.visible = energy > 0.001;
    }
  });

  return (
    <>
      <group ref={driftRef}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[pinpoints, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={sprite}
            color="#fff0d6"
            size={0.026}
            sizeAttenuation
            transparent
            opacity={0.82}
            depthWrite={false}
          />
        </points>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[mids, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={sprite}
            color="#fffaf0"
            size={0.062}
            sizeAttenuation
            transparent
            opacity={0.94}
            depthWrite={false}
          />
        </points>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[bokeh, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={sprite}
            color="#bfd4ff"
            size={0.24}
            sizeAttenuation
            transparent
            opacity={0.3}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </points>
        {/* The near field. This is the population the warp is actually read on. */}
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[motes, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={sprite}
            color="#dce7ff"
            size={0.05}
            sizeAttenuation
            transparent
            opacity={0.62}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </points>

        <lineSegments frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[streaks.positions, 3]} />
            <bufferAttribute attach="attributes-aTail" args={[streaks.tails, 1]} />
          </bufferGeometry>
          <shaderMaterial
            ref={streakMaterialRef}
            uniforms={streakUniforms}
            vertexShader={STREAK_VERTEX_SHADER}
            fragmentShader={STREAK_FRAGMENT_SHADER}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>

        <group ref={debrisRef}>
          {debris.map((seed, index) => (
            <mesh
              key={`intro-debris-${index}`}
              position={seed.position}
              rotation={seed.rotation}
              scale={seed.scale}
            >
              <tetrahedronGeometry args={[1, 0]} />
              {/*
                * LIT, NOT EMISSIVE, AND ADDITIVE, WHICH IS THE PART THAT MATTERS. Carried on
                * a strong emissive the plates render the same flat cobalt whatever way they
                * face and the field reads as confetti thrown over the picture. Taken to
                * metalness 0.86 they went the other way and rendered black: a metal with no
                * environment map has nothing to reflect.
                *
                * Making them dielectric fixed the metal, and did NOT fix the holes. An opaque
                * plate in front of the glow occludes it whatever it is made of, so at the
                * crossing, on the brightest frame in the piece, five black wedges were punched
                * out of the core. Measured over the bright region the plates put 1.1% of it
                * below luminance 14 against a regional mean of 23.
                *
                * Additive with no depth write is the fix that cannot regress: a plate may only
                * ever ADD light to what is behind it. One turned into the key shows, one
                * turned away falls into the field, and neither can subtract.
                */}
              <meshStandardMaterial
                color="#1a2a6e"
                emissive="#0c1866"
                /* Lifted from 0.22, which was below the wash it has to be seen over: at the
                   breath the glow is at 0.85 across most of the frame and the plates simply
                   were not in the picture. It stays low enough that the lit term still leads,
                   which is the property the note above is about: a plate turned into the key
                   shows and a plate turned away falls into the field, and a plate carried on
                   a strong emissive does neither. */
                emissiveIntensity={0.4}
                metalness={0.05}
                roughness={0.52}
                transparent
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      </group>

      <mesh ref={glowMeshRef} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={glowMaterialRef}
          uniforms={glowUniforms}
          vertexShader={GLOW_VERTEX_SHADER}
          fragmentShader={GLOW_FRAGMENT_SHADER}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          /*
           * DEPTH TEST STAYS ON. The billboard sits 24 units behind everything, so the
           * depth buffer is what makes the mark silhouette into the wash. Turned off, the
           * transparent pass paints the glow additively straight over the opaque sculpture
           * that already drew: both halves of the mark came out the same flat cobalt and
           * the glass/poured split, which is the whole read, disappeared.
           */
          toneMapped={false}
        />
      </mesh>

      <mesh ref={thresholdMeshRef} frustumCulled={false} visible={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={thresholdMaterialRef}
          uniforms={thresholdUniforms}
          vertexShader={GLOW_VERTEX_SHADER}
          fragmentShader={THRESHOLD_FRAGMENT_SHADER}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          /*
           * DEPTH TEST OFF, and this one is the opposite call to the wash above it for a
           * reason. The wash sits behind the mark and needs the depth buffer to let the mark
           * silhouette into it. This disc sits BEYOND the wall, and the wall is opaque: tested
           * against depth it is hidden behind the very panel it is supposed to be shining
           * through until the lens is already inside the glass, so the doorway stays dark
           * through the entire approach and then pops. Drawn over, it is light coming through
           * the window, which is the whole read.
           */
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
