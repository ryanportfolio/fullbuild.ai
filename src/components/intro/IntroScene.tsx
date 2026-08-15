"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3, type Group, type PerspectiveCamera } from "three";
import {
  BURST_START,
  CHARGE_START,
  SETTLE_START,
  WARP_CROSS_U,
  WARP_END,
  WARP_MS,
  WARP_START,
  clamp01,
  progressBetween,
  smoothstep,
} from "./introTiming";
import { INTRO_APERTURE_LOCAL } from "./introGeometry";
import IntroSculpture from "./IntroSculpture";
import IntroSpace from "./IntroSpace";

/*
 * ACT TWO TO FOUR, AS A CAMERA MOVE. The artifact is alive, the space is lit, and then the
 * lens runs at the one window in the drawn half and goes through it.
 *
 * NO EFFECTCOMPOSER. It is the single largest bundle and per-frame saving available on a
 * page that until now shipped no three.js at load, and at these durations it buys nothing
 * visible: the grain is a DOM tile and the only aberration in the piece is confined to the
 * threshold disc, where the metaphor actually puts it.
 */

/*
 * The camera pulls back a hair before it commits. Anticipation is what makes an
 * acceleration read as a decision rather than as a jump cut.
 */
const CAM_Z_REST = 5;
const CAM_Z_CHARGE = 5.28;
const CHARGE_ROLL = 0.0105;
const WARP_ROLL = 0.055;
const FOV_REST = 50;
const FOV_GAIN = 7;

/*
 * THE OVERSHOOT RATIO, AND WHY IT IS THIS NUMBER. The camera flies from CAM_Z_CHARGE to
 * THROUGH_Z on an accelerating curve e = u ^ WARP_EXPONENT, and it is through the doorway at
 * the instant its z reaches the aperture's z. Solving that instant:
 *
 *   z(u) = Zc + (Za - APPROACH * k - Zc) * e   and   z = Za   =>   e = 1 / (1 + k)
 *
 * So k is not a taste number: it is 1 / WARP_CROSS_U ^ WARP_EXPONENT - 1, and the crossing
 * lands at u = WARP_CROSS_U for every viewport scale, every chase offset and every rest pose
 * the reveal happens to leave the mark in. That is what makes warp-through a fixed beat that
 * can be captured rather than a measured accident.
 *
 * THE EXPONENT CAME DOWN FROM 2.35, and the pairing moved with it. At 2.35 the curve had
 * covered a quarter of the run past halfway through it: the approach the whole doorway read
 * depends on was compressed into the last three hundred milliseconds and the frames before
 * it barely moved. At 1.75 the run still accelerates the whole way, with no ease out, but the
 * wall is coming at the lens for most of the beat rather than arriving all at once.
 */
const WARP_EXPONENT = 1.75;
const THROUGH_OVERSHOOT = 0.329;
/* e at the crossing. Alignment finishes exactly here, so the lens stops steering the moment
   it is in the doorway and flies straight through instead of curving off-axis. */
const CROSS_E = Math.pow(WARP_CROSS_U, WARP_EXPONENT);

function CameraRig({
  artifactRef,
  tPostRef,
  stretchRef,
  glowRef,
  thresholdRef,
  onFirstFrame,
}: {
  artifactRef: MutableRefObject<Group | null>;
  tPostRef: MutableRefObject<number>;
  stretchRef: MutableRefObject<number>;
  glowRef: MutableRefObject<number>;
  thresholdRef: MutableRefObject<number>;
  onFirstFrame: () => void;
}) {
  /*
   * WHERE THE DOORWAY WAS WHEN WE COMMITTED. Latched at the charge beat and held for the
   * whole warp. Chasing a live target through the run would have the camera steering after
   * a doorway that is itself still moving, and the path would curve off it.
   */
  const apertureRef = useRef<Vector3 | null>(null);
  const aperture = useMemo(() => new Vector3(), []);
  const painted = useRef(false);

  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;

    if (!painted.current) {
      painted.current = true;
      onFirstFrame();
    }

    const tPost = tPostRef.current;
    const artifact = artifactRef.current;

    // Act one. The artifact stands at its rest pose under an opaque film, at the exact size
    // and place the film's last frame draws it.
    if (tPost < 0) {
      cam.position.set(0, 0, CAM_Z_REST);
      cam.rotation.z = 0;
      if (cam.fov !== FOV_REST) {
        cam.fov = FOV_REST;
        cam.updateProjectionMatrix();
      }
      stretchRef.current = 0;
      glowRef.current = 0;
      thresholdRef.current = 0;
      apertureRef.current = null;
      return;
    }

    if (tPost < CHARGE_START) {
      // THE BREATH. Nothing moves but the world itself: the chase, the idle rotation, and
      // the light coming up. The reader is being given a second to see what was drawn.
      cam.position.set(0, 0, CAM_Z_REST);
      cam.rotation.z = 0;
      if (cam.fov !== FOV_REST) {
        cam.fov = FOV_REST;
        cam.updateProjectionMatrix();
      }
      stretchRef.current = 0;
      glowRef.current = smoothstep(progressBetween(tPost, 0, CHARGE_START)) * 0.85;
      thresholdRef.current = 0;
      return;
    }

    // From the charge onward the doorway is a fixed point in the world.
    if (!apertureRef.current && artifact) {
      aperture.set(
        artifact.position.x + artifact.scale.x * INTRO_APERTURE_LOCAL[0],
        artifact.position.y + artifact.scale.y * INTRO_APERTURE_LOCAL[1],
        artifact.position.z + artifact.scale.z * INTRO_APERTURE_LOCAL[2],
      );
      apertureRef.current = aperture;
    }
    const target = apertureRef.current ?? aperture;

    if (tPost < WARP_START) {
      const charge = smoothstep(progressBetween(tPost, CHARGE_START, WARP_START));
      cam.position.set(0, 0, CAM_Z_REST + (CAM_Z_CHARGE - CAM_Z_REST) * charge);
      cam.rotation.z = CHARGE_ROLL * charge;
      stretchRef.current = charge * 0.18;
      glowRef.current = 0.85 + 0.1 * charge;
      thresholdRef.current = charge * 0.08;
      return;
    }

    const u = clamp01((tPost - WARP_START) / WARP_MS);
    const e = Math.pow(u, WARP_EXPONENT);
    const approach = CAM_Z_CHARGE - target.z;
    const throughZ = target.z - approach * THROUGH_OVERSHOOT;
    // Alignment completes at the crossing and not before or after, so the run finishes
    // straight rather than still turning as the geometry passes the lens.
    const lateral = Math.min(1, e / CROSS_E);

    cam.position.x = target.x * lateral;
    cam.position.y = target.y * lateral;
    cam.position.z = CAM_Z_CHARGE + (throughZ - CAM_Z_CHARGE) * e;
    cam.rotation.z = CHARGE_ROLL * (1 - e) + WARP_ROLL * e;
    // The widening field is the cheapest honest speed cue there is: it stretches the
    // periphery outward at exactly the rate the near geometry passes.
    cam.fov = FOV_REST + FOV_GAIN * e;
    cam.updateProjectionMatrix();

    stretchRef.current = 0.18 + 0.82 * e;
    /*
     * THE LIGHT CHANGES HANDS. The camera-anchored wash used to be at its brightest exactly
     * at the crossing, which put the frame's whole light source dead centre of the lens and
     * made the doorway indistinguishable from it: the beat named for passing through a window
     * read as generic hyperspace with a glow in the middle. So the wash falls away across the
     * approach while the threshold takes over, and by the crossing the brightness in the
     * frame is coming out of the doorway rather than off the camera.
     */
    const handover = smoothstep(clamp01((u - 0.42) / (WARP_CROSS_U - 0.42)));
    glowRef.current = 0.95 - 0.62 * handover;
    /*
     * AND IT DOES NOT STOP AT THE CROSSING. Capped at 1 the doorway's light was fully grown
     * before the burst began and then simply held while the camera ran on, so the burst got a
     * flat lift over a warp instead of a frame already blowing out. Past the crossing the
     * energy overshoots, which is what hands the DOM flood a white frame to finish rather than
     * a dark one to cover.
     */
    const past = progressBetween(tPost, BURST_START, SETTLE_START);
    thresholdRef.current = 0.08 + 0.92 * clamp01(u / WARP_CROSS_U) + 1.2 * past;

    if (tPost >= WARP_END) stretchRef.current = 1;
  });

  return null;
}

export default function IntroScene({
  timeRef,
  pointerRef,
  tPostRef,
  pinnedRef,
  onFirstFrame,
}: {
  timeRef: MutableRefObject<number>;
  pointerRef: MutableRefObject<{ x: number; y: number }>;
  tPostRef: MutableRefObject<number>;
  /* Set while the capture hook is holding a named beat. Every damped term takes its target
     outright instead of easing toward it, so the first frame after a pin is the settled one. */
  pinnedRef: MutableRefObject<boolean>;
  onFirstFrame: () => void;
}) {
  const artifactRef = useRef<Group | null>(null);
  const stretchRef = useRef(0);
  const glowRef = useRef(0);
  const thresholdRef = useRef(0);

  useEffect(() => () => {
    artifactRef.current = null;
  }, []);

  return (
    <Canvas
      /*
       * near is tightened from the entry scene's 0.05 so the lens can approach the panel
       * plane before it clips; far is the journey canvas's 160 because the star field
       * reaches z -105 and a shorter far plane would cull the sky out of the frame.
       */
      camera={{ position: [0, 0, CAM_Z_REST], fov: FOV_REST, near: 0.02, far: 160 }}
      dpr={[1, 1.5]}
      frameloop="always"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => gl.setClearColor("#000209", 1)}
    >
      {/*
        * Lights copied from the showcase entry scene, values intact. The ambient carries the
        * mark and the key lays the gradient rather than the other way round: a key that
        * exposes owns the poured wall outright and swings it to a neutral grey under any
        * tilt, off a palette the rest of the piece holds to cobalt.
        */}
      <ambientLight intensity={1.15} color="#98aaff" />
      <directionalLight position={[3, 4, 5]} intensity={0.72} color="#f2f4ff" />
      <pointLight position={[-3, -1, 2]} intensity={8.5} distance={20} color="#1640ff" />
      {/* Two low cobalt keys, there to give the poured wall a gradient and nothing else. */}
      <pointLight position={[2.6, -1.9, 2.6]} intensity={9} distance={13} color="#6f8bff" />
      {/* Mirrored and deliberately weaker, so the lift arrives when the tilt turns a wall
          into it rather than sitting on the rest pose. */}
      <pointLight position={[-2.6, -1.9, 2.6]} intensity={6.5} distance={11} color="#8fa4ff" />

      <IntroSpace
        artifactRef={artifactRef}
        timeRef={timeRef}
        pointerRef={pointerRef}
        pinnedRef={pinnedRef}
        stretchRef={stretchRef}
        glowRef={glowRef}
        thresholdRef={thresholdRef}
      />
      <IntroSculpture
        groupRef={artifactRef}
        timeRef={timeRef}
        tPostRef={tPostRef}
        pinnedRef={pinnedRef}
      />
      <CameraRig
        artifactRef={artifactRef}
        tPostRef={tPostRef}
        stretchRef={stretchRef}
        glowRef={glowRef}
        thresholdRef={thresholdRef}
        onFirstFrame={onFirstFrame}
      />
    </Canvas>
  );
}
