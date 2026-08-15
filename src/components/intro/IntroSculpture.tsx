"use client";

import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  MathUtils,
  Shape,
  type Group,
} from "three";
import {
  INTRO_BASELINE_STROKES,
  INTRO_BODY_DEPTH,
  INTRO_HATCH_STROKES,
  INTRO_JAMB_COURSE,
  INTRO_JAMB_FAR,
  INTRO_JAMB_NEAR,
  INTRO_LINE_FRONT,
  INTRO_OUTLINE_STROKES,
  INTRO_PANEL_FRONT,
  INTRO_PANEL_LAYOUT,
  INTRO_POURED_DEPTH,
  INTRO_POURED_SILHOUETTE,
  INTRO_POURED_STROKES,
  INTRO_REST_POSE,
  INTRO_TICK_STROKES,
  introLogoX,
  introLogoY,
  introViewportScale,
  makeIntroLineWork,
} from "./introGeometry";
import {
  REVEAL_TURN_END,
  REVEAL_TURN_START,
  progressBetween,
  smoothstep,
} from "./introTiming";

/*
 * NO CHASE. The artifact holds the film's registration for the whole act: the film's mark is
 * ruled at a fixed place on the sheet (--mark-unit, --mark-cy, derived from the REST pose and
 * nothing else), and the object it becomes stands exactly there until the camera commits. The
 * pointer never moves it, so the doorway the camera latches onto has never moved either.
 */

/*
 * THE BUILD, AS A MOVE. The rest pose is the film's own last frame, so it is where the
 * object has to be standing at tPost 0 or the handover stops being a handover. From there it
 * turns, once, into a three quarter view: the extrusion swings out from behind the front
 * face, the pour picks up a lit side, and the thing the reader watched being drawn is
 * demonstrably a solid rather than a second drawing.
 *
 * It is a pure function of tPost, which is what keeps a pinned beat reproducible. The idle
 * sines still ride on top of it; they say alive, this says built.
 */
const TURN_YAW = 0.4;
const TURN_PITCH = -0.075;
const TURN_ROLL = 0.018;

/*
 * THE WALL, AT ARM'S LENGTH. See the note over INTRO_JAMB_COURSE for the measurement: the
 * jamb that fills the right of the crossing frame renders as one flat value because a
 * near black metal has no specular tint to return and the only term left standing is a
 * constant emissive.
 *
 * The fix is put on the emissive rather than on the light, because the emissive is the term
 * that is wrong: it is the same number from every angle and every distance, and glass is
 * not. Two things ride on it and both are gated on how near the lens actually is, so the
 * reveal beat, where the mark is four and a half units away and read as a drawing, is
 * arithmetically untouched.
 *
 *   THE RAKE. The further the surface turns off the lens the more it returns, which is the
 *   one thing every view dependent term in this material was unable to say. Across the
 *   crossing frame it runs from the deep end of the jamb, the end the doorway's own light is
 *   coming out of, to the near edge at the frame's border.
 *
 *   THE COURSES. The reveal is ruled on the wall's rows, one lane wide at any distance
 *   because the width is taken from the derivative rather than from a constant, and lit by
 *   the same rake, so they come up as the light crosses them rather than sitting there.
 *
 * There is no randomness here. The shader is a pure function of object position and view
 * direction, so a pinned beat renders the same bytes it rendered last time.
 */
const PANEL_SHADER_PARS = /* glsl */ `
  varying vec3 vIntroLocal;
  varying float vIntroFace;
`;

/*
 * THE TOOTH. Hashed on the object's own coordinates rather than drawn from a texture or a
 * generator: it is a pure function of where you are on the wall, so it is stable under the
 * pin, it costs no memory, and it cannot decorrelate between two captures of the same beat.
 * All three axes go in, because the jamb is a plane of constant object x and a hash of xy
 * alone would rule it in stripes.
 */
const PANEL_SHADER_TOOTH = /* glsl */ `
  float introTooth( vec3 cell ) {
    return fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
  }
`;

const PANEL_SHADER_VERTEX = /* glsl */ `
  vIntroLocal = position;
  vIntroFace = abs( objectNormal.z );
`;

const PANEL_SHADER_FRAGMENT = /* glsl */ `
  float introRange = 1.0 - smoothstep( ${INTRO_JAMB_NEAR}, ${INTRO_JAMB_FAR}, length( vViewPosition ) );
  if ( introRange > 0.0 ) {
    float introRake = 1.0 - clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 );
    float introRim = pow( introRake, 1.2 ) * 5.0;
    // Jambs only. On the face the mark is drawn on this term is zero, at every distance.
    float introSide = 1.0 - smoothstep( 0.35, 0.75, vIntroFace );
    float introRun = vIntroLocal.y / ${INTRO_JAMB_COURSE};
    float introOff = abs( fract( introRun - 0.5 ) - 0.5 );
    float introLane = max( fwidth( introRun ), 1e-4 ) * 1.7;
    float introCourse = ( 1.0 - smoothstep( 0.0, introLane, introOff ) ) * introSide * ( 0.45 + 0.55 * introRake );
    /* The cell is sized off the derivative rather than off the object, so the tooth stays a
       couple of pixels wide wherever the lens happens to be and never resolves into a
       lattice on the way past. */
    float introCell = max( fwidth( vIntroLocal.y ), 1e-6 ) * 2.4;
    float introGrit = introTooth( floor( vIntroLocal / introCell ) ) - 0.5;
    totalEmissiveRadiance += emissive * introRange * ( introRim + introCourse * 1.15 + introGrit * 0.34 );
  }
`;

function introPanelShader(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${PANEL_SHADER_PARS}`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${PANEL_SHADER_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PANEL_SHADER_PARS}\n${PANEL_SHADER_TOOTH}`)
    /* Injected here and nowhere earlier: this is the first chunk in the physical shader that
       runs after the view space normal has been resolved, and the rake needs that normal. */
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${PANEL_SHADER_FRAGMENT}`);
}

/*
 * THE MARK AS A VOLUME. The same drawing the film hands over, standing up: a nine panel
 * glass wall under three gable pieces, a poured half as one solid body, and the strokes the
 * icon actually carries laid over both.
 *
 * PURITY. This component never reads clock.elapsedTime and never reads the pointer at all.
 * Time arrives as a ref the owner writes, which is the whole reason a beat can be captured:
 * under a freeze the owner pins timeRef to the beat's own tPost, and every idle sine and
 * every damped pose lands on the same number it landed on last time. Reading the render
 * clock here would put a second, uncapturable clock in the scene.
 *
 * Deliberately absent, compared with the showcase's entry artifact: the media crop skin and
 * its texture, the foreground shard curtain, and the whole freeze/flare/burst shatter. This
 * artifact is flown through, not shattered, and dropping the skin takes an image dependency
 * off the homepage entirely.
 */
export default function IntroSculpture({
  groupRef,
  timeRef,
  tPostRef,
  pinnedRef,
}: {
  groupRef: MutableRefObject<Group | null>;
  timeRef: MutableRefObject<number>;
  tPostRef: MutableRefObject<number>;
  /*
   * A PINNED BEAT DOES NOT GET TO SETTLE. Every pose below is damped, and damping converges
   * asymptotically from wherever the last frame left it, so a beat captured the instant it
   * was pinned photographed a pose still on its way to the target: re-pinning the same beat
   * moved the mark a pixel or two and the capture hook's byte-for-byte promise was not one.
   * Under a pin the damp is skipped and every target is taken outright, so the first frame
   * after the pin is already the settled frame.
   */
  pinnedRef: MutableRefObject<boolean>;
}) {
  /*
   * THE DRAWING IS ONE DRAWING. Every stroke the mark carries is laid down once, on the
   * front plane, at full weight. Tracing the same strokes on the back plane at the same
   * weight turns every roofline into two parallel rails as soon as any yaw is on the piece.
   */
  const drawnLineWork = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(makeIntroLineWork([
      { strokes: INTRO_OUTLINE_STROKES, planes: [INTRO_LINE_FRONT], weight: 3 },
      { strokes: INTRO_BASELINE_STROKES, planes: [INTRO_LINE_FRONT], weight: 3 },
      { strokes: INTRO_HATCH_STROKES, planes: [INTRO_LINE_FRONT], weight: 2 },
      { strokes: INTRO_TICK_STROKES, planes: [INTRO_LINE_FRONT], weight: 2 },
    ]), 3));
    return geometry;
  }, []);

  /*
   * The pour's own silhouette, a lane wider than the drawing that bounds the other half.
   * Three lanes carried at half opacity over a near-black field leave runs of rows where
   * the edge simply drops out; a fourth lane puts it on every row without making this half
   * the drawn half's equal.
   */
  const pouredLineWork = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(makeIntroLineWork([
      { strokes: INTRO_POURED_STROKES, planes: [INTRO_LINE_FRONT], weight: 4 },
    ]), 3));
    return geometry;
  }, []);

  /*
   * THE EXTRUSION, DRAWN. The back outline and the rails that join it to the front are what
   * say thickness, and at 0.085 they said it to nobody: measured against the film's own last
   * frame, which rules extrusion on both gables and a ground in perspective, the object had
   * visibly less depth in it than the drawing did. They stay a single lane and stay below the
   * front strokes, so the drawing still reads as one drawing rather than two.
   */
  const depthLineWork = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(makeIntroLineWork([
      {
        strokes: INTRO_OUTLINE_STROKES,
        planes: [INTRO_LINE_FRONT, INTRO_PANEL_FRONT - INTRO_BODY_DEPTH],
        rails: true,
        weight: 1,
      },
      {
        strokes: INTRO_POURED_STROKES,
        planes: [INTRO_LINE_FRONT, INTRO_PANEL_FRONT - INTRO_BODY_DEPTH],
        rails: true,
        weight: 1,
      },
    ]), 3));
    return geometry;
  }, []);

  /* One prism per panel plus its silhouette edges. A wireframe would draw the triangulation
     across every gable face, and the mark has no diagonals except the two it draws by hand. */
  const panelParts = useMemo(() => INTRO_PANEL_LAYOUT.map(({ outline, size: [, , depth] }) => {
    const shape = new Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let index = 1; index < outline.length; index += 1) {
      shape.lineTo(outline[index][0], outline[index][1]);
    }
    shape.closePath();

    const prism = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    // Front face pinned, body behind it. Centring the extrusion instead would push the face
    // in front of the stroke plane and put the drawing inside the wall it bounds.
    prism.translate(0, 0, INTRO_PANEL_FRONT - depth);
    const edges = new EdgesGeometry(prism);

    return { prism, edges };
  }), []);

  /*
   * The pour, as one body. Extruded straight off the mark's own poured path so its
   * silhouette is the strokes and nothing wider, and so the wall inside it carries one
   * normal and one value instead of twelve tiles trading the depth buffer at every join.
   */
  const pouredBody = useMemo(() => {
    const shape = new Shape();
    const world = INTRO_POURED_SILHOUETTE.map(([x, y]) => [introLogoX(x), introLogoY(y)] as const);
    shape.moveTo(world[0][0], world[0][1]);
    for (let index = 1; index < world.length; index += 1) shape.lineTo(world[index][0], world[index][1]);
    shape.closePath();
    const prism = new ExtrudeGeometry(shape, {
      depth: INTRO_POURED_DEPTH,
      bevelEnabled: false,
      curveSegments: 1,
    });
    prism.translate(0, 0, INTRO_PANEL_FRONT - INTRO_POURED_DEPTH);
    return prism;
  }, []);

  // Every buffer this component allocates is handed back when the intro unmounts, which on
  // this page is after a few seconds rather than at navigation: leaking them would leave a
  // scene's worth of GPU memory parked behind a homepage that no longer has a canvas.
  useEffect(() => () => {
    drawnLineWork.dispose();
    pouredLineWork.dispose();
    depthLineWork.dispose();
    pouredBody.dispose();
    panelParts.forEach(({ prism, edges }) => {
      prism.dispose();
      edges.dispose();
    });
  }, [drawnLineWork, pouredLineWork, depthLineWork, pouredBody, panelParts]);

  useFrame(({ size }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // The owner's clock, never the renderer's. See the purity note at the top of this file.
    const time = timeRef.current;
    const step = Math.min(0.034, delta);

    const tPost = tPostRef.current;
    const viewportScale = introViewportScale(size.width);
    const pulse = Math.sin(time * 1.7) * 0.025;

    /*
     * THE TURN. Zero while the film is still opaque over it, so the object the film fades off
     * is the object the film drew, then eased to a three quarter view across the rest of the
     * breath. Driven by tPost rather than by the render clock, so pinning a beat pins the
     * pose exactly.
     */
    const turn = smoothstep(progressBetween(tPost, REVEAL_TURN_START, REVEAL_TURN_END));
    const settled = pinnedRef.current;
    const damp = (current: number, target: number, lambda: number) =>
      settled ? target : MathUtils.damp(current, target, lambda, step);

    group.position.x = damp(group.position.x, INTRO_REST_POSE[0], 5.2);
    group.position.y = damp(group.position.y, INTRO_REST_POSE[1], 5.2);
    group.position.z = damp(group.position.z, INTRO_REST_POSE[2], 6);
    group.scale.setScalar(viewportScale * (1 + pulse));

    /*
     * The piece rests near face-on and the idle sines supply the tilt that shows it is a
     * solid. The swings are small on purpose: given a corner's worth of roll the two gables
     * come level with each other and the mark stops being the mark, because the step between
     * those two gables is its identity. The tilt only says solid; the piece itself holds
     * the center.
     */
    group.rotation.x = damp(
      group.rotation.x,
      0.05 + TURN_PITCH * turn + Math.sin(time * 0.32) * 0.028,
      4.6,
    );
    group.rotation.y = damp(
      group.rotation.y,
      0.06 + TURN_YAW * turn + Math.sin(time * 0.27 + 0.8) * 0.036,
      4.6,
    );
    group.rotation.z = damp(
      group.rotation.z,
      TURN_ROLL * turn + Math.sin(time * 0.42) * 0.018,
      4.6,
    );
  });

  /*
   * Mounted at the rest pose rather than at the origin. The frame loop damps toward
   * (0, 0.12, 0.1), so mounting at zero would have the artifact rise and grow a couple of
   * per cent while the film is still opaque, and the flat plate the film hands over would be
   * registered against a pose the artifact had not reached yet. The first painted frame is
   * the film's last frame.
   */
  return (
    <group ref={groupRef} position={[INTRO_REST_POSE[0], INTRO_REST_POSE[1], INTRO_REST_POSE[2]]}>
      <group>
        <lineSegments geometry={drawnLineWork}>
          <lineBasicMaterial color="#eef2ff" transparent opacity={0.92} depthWrite={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={pouredLineWork}>
          <lineBasicMaterial color="#c6d5ff" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={depthLineWork}>
          <lineBasicMaterial color="#8ea6e8" transparent opacity={0.34} depthWrite={false} toneMapped={false} />
        </lineSegments>
      </group>

      {/*
        * THE POUR, WHOLE. One extrusion of the mark's own poured path: one silhouette the
        * strokes bound exactly, one normal, one value. Twelve coplanar prisms could hold
        * none of the three, and every boundary between them read as a seam on a wall that
        * is meant to have none.
        */}
      {/*
        * DARKER THAN THE SHOWCASE'S POUR, AND MEASURED THAT WAY. The showcase carries
        * #0b1442 emissive #0c1866 at 0.52 because its pour stands beside a drawn half lit
        * by a media skin, and at any lower level it would vanish next to it. This artifact
        * has no skin, so the same numbers put both halves at the same value and the
        * glass/poured split disappears: the one distinction the film spends five seconds
        * establishing.
        *
        * Sampled at 1440x900, the film's last frame carries the pour at blue 22 and the
        * glass at 178. At the showcase's level the artifact answered with blue 99, so the
        * handover jumped the pour four and a half times brighter on the frame it was meant
        * to be indistinguishable. These values are chosen against that measurement.
        */}
      <mesh geometry={pouredBody}>
        <meshPhysicalMaterial
          color="#05091f"
          emissive="#0c1866"
          emissiveIntensity={0.06}
          metalness={0.14}
          roughness={0.58}
          clearcoat={0.24}
          clearcoatRoughness={0.42}
        />
      </mesh>

      {INTRO_PANEL_LAYOUT.map(({ position, rotation, poured }, index) => (
        <group key={`intro-panel-${index}`} position={position} rotation={rotation}>
          {/*
            * The material split is the whole mark: the drawn half is glass over a blue lift,
            * the poured half is a near-black mass with only a clearcoat on it. Both carry a
            * lift they own outright rather than one the key lends them, because emissive is
            * view independent and the value has to survive the tilt.
            *
            * The prism loses every contest it has with the line work riding on it, so the
            * depth offset settles it once, for every join, at every angle.
            */}
          <mesh geometry={panelParts[index].prism} visible={!poured}>
            <meshPhysicalMaterial
              color="#020619"
              emissive="#0c1e74"
              /* Lifted from the showcase's 0.72 for the same measured reason the pour is
                 cut: with no media skin on this half, 0.72 lands the glass at blue 121
                 against the film's 178 and the drawing dims as it becomes the object. */
              emissiveIntensity={1.35}
              metalness={0.94}
              roughness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.06}
              polygonOffset
              polygonOffsetFactor={2}
              polygonOffsetUnits={2}
              onBeforeCompile={introPanelShader}
            />
          </mesh>
          {/*
            * EDGES ON THE DRAWN HALF ONLY. The pour is one body precisely so that it has no
            * grid in it, and drawing its cell edges puts the grid straight back: a lit 3x3
            * lattice on a wall whose whole character is that it is poured, not built.
            */}
          {poured ? null : (
            <lineSegments geometry={panelParts[index].edges}>
              <lineBasicMaterial
                color="#dce7ff"
                transparent
                opacity={0.26}
                depthWrite={false}
                toneMapped={false}
              />
            </lineSegments>
          )}
        </group>
      ))}
    </group>
  );
}
