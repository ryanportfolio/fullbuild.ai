'use client';

/* ============================================================================
   THE POCHÉ LINE — rising sectioned axonometric. THE POUR made literal.

   The isometric engineered frame from STATE 03 becomes real and gets poured:
   a single damped section level (driven only by store.pour) rises through a real
   portal frame in authored erection order. Above the cut the graphite wireframe
   survives; below it clads into flat concrete; exactly at the cut a hatched 45°
   poché cap and a graphite lift line ride the true fill perimeter. When the cut
   reaches the ridge AND the health probe holds, the one revision-red diamond
   ignites with selective bloom — the only lit thing on the page. Health false
   de-ignites it to graphite within a frame. Red never lies.

   Wiring is fixed (do not redesign): reads pour/progress/state/health from the
   Zustand store, owns no scroll listener, sets webglActive on mount/unmount,
   idles when STATE 04 is off-screen, disposes everything on unmount.
   ========================================================================= */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { EffectComposer, SelectiveBloom } from '@react-three/postprocessing';
import { damp } from 'maath/easing';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Plane,
  Vector3,
  type OrthographicCamera as OrthographicCameraImpl,
} from 'three';

import { useWorkingSet } from '@/lib/store';
import { LIVE_PROJECTS } from '@/lib/projects';
import { buildFrame, type Frame, type Member } from '@/lib/pour/frame';
import { PocheMaterial, type PocheColors } from './pour/PocheMaterial';

// --- tuning ----------------------------------------------------------------
const BLOOM_LAYER = 11;
const STAGGER_SPAN = 0.7; // vertical lag (world units) between first + last member
const DAMP_TIME = 0.12;
const CAM_AZ = (20 * Math.PI) / 180; // axonometric azimuth
const CAM_TILT = (15 * Math.PI) / 180; // axonometric tilt (sectioned axon)
const FRAME_MARGIN = 1.45;
const UP = new Vector3(0, 1, 0);

// Bloom membership + composer-mount thresholds, measured on the diamond's ACTUAL
// ignition strength (0 = graphite .. 1 = full red), NOT raw pour — so the pass
// exists only while a genuinely red keystone is lit. Hysteresis stops the pass
// flickering while the section front settles.
const BLOOM_IN = 0.5; // strength at which a diamond joins the bloom layer
const LIT_ON = 0.55; // strongest-diamond strength that mounts the composer
const LIT_OFF = 0.4; // ...and below which it unmounts

// ---------------------------------------------------------------------------
// Theme palette resolved from CSS custom properties into three Colors.
// ---------------------------------------------------------------------------
interface Palette {
  graphite: Color;
  concrete: Color;
  poche: PocheColors;
  live: Color; // revision-red
  dark: boolean;
}

function readPalette(): Palette {
  const dark =
    typeof document !== 'undefined' &&
    document.documentElement.dataset.theme === 'dark';
  const cs =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;
  const read = (name: string, fallback: string): Color => {
    const raw = cs?.getPropertyValue(name).trim();
    return new Color(raw && raw.length > 0 ? raw : fallback);
  };
  const graphite = read('--ink-graphite', dark ? '#d8d2c4' : '#211f1c');
  const concrete = read('--ink-concrete', dark ? '#8c8579' : '#675f52');
  const live = read('--accent-live', dark ? '#ff5138' : '#cb3a26');
  // Hatch a hair off the fill: lighter toward vellum on dark, darker toward ink on light.
  const hatch = concrete.clone().lerp(dark ? read('--vellum', '#e9e3d6') : graphite, 0.35);
  return { graphite, concrete, poche: { fill: concrete, hatch }, live, dark };
}

// ---------------------------------------------------------------------------
// Per-member GPU objects + the precomputed section maths.
// ---------------------------------------------------------------------------
interface MemberViz {
  member: Member;
  solid: Mesh | null; // concrete fill, clipped BELOW the cut
  wire: LineSegments; // graphite wireframe, clipped ABOVE the cut (consumed)
  outline: LineSegments | null; // graphite outline on the clad solid, BELOW the cut
  planeSolid: Plane; // y <= effCut
  planeWire: Plane; // y >= effCut
  cap: Mesh | null; // section poché, at effCut, only when the span crosses
  lift: LineLoop | null; // graphite lift line around the cap
  // precomputed
  y0: number;
  y1: number;
  dirY: number;
  axis1: Vector3; // horizontal member direction (cap local X)
  axis2: Vector3; // horizontal perpendicular (cap local Y)
  bias: number; // erection-order lag subtracted from currentH
  cross: boolean; // does the span change y (can it ever be cut?)
  capLen1: number;
  capLen2: number;
}

interface DiamondViz {
  mesh: Mesh;
  material: MeshBasicMaterial;
  href: string;
  ridgeY: number;
  bias: number;
}

interface Built {
  group: Group;
  members: MemberViz[];
  diamonds: DiamondViz[];
  dispose: () => void;
}

function buildScene(frame: Frame, pal: Palette): Built {
  const group = new Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // Shared geometries (unit primitives, transformed per member).
  const boxGeo = track(new BoxGeometry(1, 1, 1));
  const edgesGeo = track(new EdgesGeometry(boxGeo));
  const planeGeo = track(new PlaneGeometry(1, 1));
  const octaGeo = track(new OctahedronGeometry(0.16, 0));
  const rectGeo = track(new BufferGeometry());
  rectGeo.setAttribute(
    'position',
    new Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
      3,
    ),
  );

  // Shared, unclipped linework materials.
  const liftMat = track(new LineBasicMaterial({ color: pal.graphite.clone() }));
  // One poché material for every cap — a single continuous world-space hatch.
  const pocheMat = track(new PocheMaterial(pal.poche));

  const tmpDir = new Vector3();
  const tmpMid = new Vector3();
  const zAxis = new Vector3(0, 0, 1);

  const members: MemberViz[] = frame.members.map((member) => {
    const p0 = new Vector3().fromArray(member.p0);
    const p1 = new Vector3().fromArray(member.p1);
    tmpDir.subVectors(p1, p0);
    const len = tmpDir.length();
    const dir = tmpDir.clone().normalize();
    tmpMid.addVectors(p0, p1).multiplyScalar(0.5);

    // Complementary clip planes sharing a single driver (currentH - bias).
    const planeSolid = new Plane(new Vector3(0, -1, 0), 0); // keeps y <= c
    const planeWire = new Plane(new Vector3(0, 1, 0), 0); // keeps y >= c

    // Graphite wireframe (EdgesGeometry of the swept tube), consumed from beneath.
    const wireMat = track(
      new LineBasicMaterial({
        color: pal.graphite.clone(),
        clippingPlanes: [planeWire],
      }),
    );
    const wire = new LineSegments(edgesGeo, wireMat);
    wire.position.copy(tmpMid);
    wire.quaternion.setFromUnitVectors(zAxis, dir);
    wire.scale.set(member.thickness, member.thickness, len);
    group.add(wire);

    let solid: Mesh | null = null;
    let outline: LineSegments | null = null;
    let cap: Mesh | null = null;
    let lift: LineLoop | null = null;

    if (member.clad) {
      const solidMat = track(
        new MeshBasicMaterial({
          color: pal.concrete.clone(),
          side: DoubleSide,
          clippingPlanes: [planeSolid],
        }),
      );
      solid = new Mesh(boxGeo, solidMat);
      solid.position.copy(tmpMid);
      solid.quaternion.copy(wire.quaternion);
      solid.scale.copy(wire.scale);
      solid.renderOrder = 0;
      group.add(solid);

      // Graphite outline on the built volume — clad concrete still reads as
      // inked linework, not shaded mass. Shares the solid's clip plane.
      const outlineMat = track(
        new LineBasicMaterial({
          color: pal.graphite.clone(),
          clippingPlanes: [planeSolid],
        }),
      );
      outline = new LineSegments(edgesGeo, outlineMat);
      outline.position.copy(tmpMid);
      outline.quaternion.copy(wire.quaternion);
      outline.scale.copy(wire.scale);
      outline.renderOrder = 1;
      group.add(outline);

      cap = new Mesh(planeGeo, pocheMat);
      cap.visible = false;
      cap.renderOrder = 2;
      group.add(cap);

      lift = new LineLoop(rectGeo, liftMat);
      lift.visible = false;
      lift.renderOrder = 3;
      group.add(lift);
    }

    // Horizontal cap basis (only meaningful when the member changes height).
    const axis1 = new Vector3(dir.x, 0, dir.z);
    if (axis1.lengthSq() < 1e-6) axis1.set(1, 0, 0);
    axis1.normalize();
    const axis2 = new Vector3().crossVectors(UP, axis1).normalize();
    const dirY = Math.abs(dir.y);
    const capLen1 = Math.min(
      member.thickness / Math.max(dirY, 0.34),
      member.thickness * 3.2,
    );

    return {
      member,
      solid,
      wire,
      outline,
      planeSolid,
      planeWire,
      cap,
      lift,
      y0: p0.y,
      y1: p1.y,
      dirY,
      axis1,
      axis2,
      bias: member.stagger * STAGGER_SPAN,
      cross: Math.abs(p1.y - p0.y) > 1e-4,
      capLen1,
      capLen2: member.thickness,
    };
  });

  // Revision diamonds — one per live bay, at the ridge/keystone node.
  const diamonds: DiamondViz[] = frame.bays.map((bay) => {
    const material = track(
      new MeshBasicMaterial({
        color: pal.graphite.clone(),
        toneMapped: false,
        // The live keystone must always read clearly above the clad concrete that
        // converges at the apex — otherwise the solid rafters occlude it. Draw it
        // on top (no depth test) with a high render order.
        depthTest: false,
        depthWrite: false,
      }),
    );
    const mesh = new Mesh(octaGeo, material);
    // Perch it just proud of the ridge so it sits above the joint, not inside it.
    mesh.position.set(bay.apex[0], bay.apex[1] + 0.12, bay.apex[2]);
    mesh.renderOrder = 10;
    // Bloom-layer membership is toggled per frame by ignition strength (below),
    // so a graphite (not-yet-lit / health-failed) diamond is never on the layer.
    group.add(mesh);
    return {
      mesh,
      material,
      href: bay.href,
      ridgeY: bay.apex[1],
      bias: bay.ridgeStagger * STAGGER_SPAN,
    };
  });

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, members, diamonds, dispose };
}

// ---------------------------------------------------------------------------
// Fixed sectioned-axonometric camera. Set once + on resize; never orbits.
// ---------------------------------------------------------------------------
function CameraRig({ frame }: { frame: Frame }) {
  const camRef = useRef<OrthographicCameraImpl>(null);
  const { size, invalidate } = useThree();

  useLayoutEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    const aspect = size.width / Math.max(1, size.height);
    const [sx, sy, sz] = frame.bounds.size;
    // Conservative half-extent so the axon stays framed at any aspect / N.
    const ext = 0.62 * Math.hypot(sx, sy, sz) * FRAME_MARGIN;
    let halfW = ext;
    let halfH = ext;
    if (aspect >= 1) halfW = ext * aspect;
    else halfH = ext / aspect;

    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 0.1;
    cam.far = 500;
    cam.zoom = 1;

    const c = frame.bounds.center;
    const center = new Vector3(c[0], c[1], c[2]);
    const dir = new Vector3(
      Math.sin(CAM_AZ) * Math.cos(CAM_TILT),
      Math.sin(CAM_TILT),
      Math.cos(CAM_AZ) * Math.cos(CAM_TILT),
    );
    cam.position.copy(center).addScaledVector(dir, 120);
    cam.up.copy(UP);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    invalidate();
  }, [frame, size.width, size.height, invalidate]);

  return (
    <OrthographicCamera ref={camRef} makeDefault manual near={0.1} far={500} />
  );
}

// ---------------------------------------------------------------------------
// The pour itself — geometry, per-frame section maths, ignition, lifecycle.
// ---------------------------------------------------------------------------
function Pour({
  frame,
  onLitChange,
}: {
  frame: Frame;
  onLitChange: (lit: boolean) => void;
}) {
  const { invalidate, gl } = useThree();

  const paletteRef = useRef<Palette>(readPalette());
  const built = useMemo(() => buildScene(frame, paletteRef.current), [frame]);
  const hRef = useRef(frame.baseY);
  const litRef = useRef(false);

  // --- store subscription: wake the demand loop on pour/state/health -------
  // NOT progress: progress is the whole-set scroll value and is never read in
  // useFrame, so subscribing to it would re-render the canvas on every scroll
  // tick site-wide (even with STATE 04 far off-screen), defeating frameloop
  // "demand". The lit/ignition decision lives in useFrame, tied to the actual
  // section-front position — not raw pour.
  useEffect(() => {
    return useWorkingSet.subscribe((s, p) => {
      if (s.pour !== p.pour || s.state !== p.state || s.health !== p.health) {
        invalidate();
      }
    });
  }, [invalidate]);

  // --- theme: re-resolve palette + recolor materials on data-theme change --
  useEffect(() => {
    const applyTheme = () => {
      const pal = readPalette();
      paletteRef.current = pal;
      for (const mv of built.members) {
        (mv.wire.material as LineBasicMaterial).color.copy(pal.graphite);
        if (mv.solid) {
          (mv.solid.material as MeshBasicMaterial).color.copy(pal.concrete);
        }
        if (mv.outline) {
          (mv.outline.material as LineBasicMaterial).color.copy(pal.graphite);
        }
        if (mv.lift) {
          (mv.lift.material as LineBasicMaterial).color.copy(pal.graphite);
        }
        if (mv.cap) (mv.cap.material as PocheMaterial).setColors(pal.poche);
      }
      // Diamond base (unlit) colour follows graphite; ignition recolours per frame.
      for (const d of built.diamonds) d.material.color.copy(pal.graphite);
      invalidate();
    };
    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, [built, invalidate]);

  // --- lifecycle: webglActive + full disposal ------------------------------
  useEffect(() => {
    const setWebglActive = useWorkingSet.getState().setWebglActive;
    setWebglActive(true);
    return () => {
      setWebglActive(false);
      built.dispose();
    };
  }, [built]);

  // Reusable scratch (no per-frame allocation).
  const cp = useRef(new Vector3()).current;
  const basis = useRef(new Matrix4()).current;
  const litColor = useRef(new Color()).current;

  useFrame((_, dt) => {
    const s = useWorkingSet.getState();
    // IDLE GUARD: STATE 04 off-screen and nothing poured -> do nothing at all.
    // (Ensure the bloom pass is torn down if we idle while it was still lit.)
    if (s.state < 3 && s.pour === 0) {
      if (litRef.current) {
        litRef.current = false;
        onLitChange(false);
      }
      return;
    }

    const eased = easeInOutCubic(clamp01(s.pour));
    const target = frame.baseY + (frame.apexY + STAGGER_SPAN - frame.baseY) * eased;
    const animating = damp(hRef, 'current', target, DAMP_TIME, dt);
    const h = hRef.current;

    // Per-member: drive both clip planes + the section cap/lift line.
    for (const mv of built.members) {
      const effCut = h - mv.bias;
      mv.planeSolid.constant = effCut; // y <= effCut  (concrete)
      mv.planeWire.constant = -effCut; // y >= effCut  (wireframe)

      if (!mv.cap || !mv.lift) continue;
      const lo = Math.min(mv.y0, mv.y1);
      const hi = Math.max(mv.y0, mv.y1);
      const crossing = mv.cross && effCut > lo && effCut < hi && mv.dirY > 0.02;
      mv.cap.visible = crossing;
      mv.lift.visible = crossing;
      if (!crossing) continue;

      const t = (effCut - mv.y0) / (mv.y1 - mv.y0);
      cp.set(
        mv.member.p0[0] + (mv.member.p1[0] - mv.member.p0[0]) * t,
        effCut,
        mv.member.p0[2] + (mv.member.p1[2] - mv.member.p0[2]) * t,
      );
      basis.makeBasis(mv.axis1, mv.axis2, UP);
      mv.cap.position.copy(cp);
      mv.cap.quaternion.setFromRotationMatrix(basis);
      mv.cap.scale.set(mv.capLen1, mv.capLen2, 1);
      mv.lift.position.copy(mv.cap.position);
      mv.lift.quaternion.copy(mv.cap.quaternion);
      mv.lift.scale.copy(mv.cap.scale);
    }

    // Ignition: cut reaches the ridge AND health holds -> the one red diamond.
    // Bloom-layer membership is driven by each diamond's ACTUAL red strength, so
    // only a genuinely-lit, health-passing keystone can glow — never a graphite
    // one (not-yet-reached, or health-failed). The composer is mounted on the
    // strongest ignition (hysteretic), decoupled from raw pour.
    const pal = paletteRef.current;
    let maxStrength = 0;
    for (const d of built.diamonds) {
      const effApex = h - d.bias;
      const igniteT = smoothstep(d.ridgeY - 0.22, d.ridgeY + 0.02, effApex);
      const gate = s.health[d.href] === false ? 0 : 1; // missing => assume live
      const strength = igniteT * gate;
      litColor.copy(pal.graphite).lerp(pal.live, strength);
      if (strength > 0) litColor.multiplyScalar(1 + strength * 1.6); // HDR for bloom
      d.material.color.copy(litColor);
      if (strength >= BLOOM_IN) d.mesh.layers.enable(BLOOM_LAYER);
      else d.mesh.layers.disable(BLOOM_LAYER);
      if (strength > maxStrength) maxStrength = strength;
    }

    const litNow = litRef.current ? maxStrength > LIT_OFF : maxStrength > LIT_ON;
    if (litNow !== litRef.current) {
      litRef.current = litNow;
      onLitChange(litNow);
    }

    // Keep the demand loop alive only while the section is still settling.
    if (animating || Math.abs(h - target) > 1e-4) invalidate();
  });

  // Ensure clipping is live even if the gl prop was not honoured.
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  return <primitive object={built.group} />;
}

// ---------------------------------------------------------------------------
// Scene root — Canvas + fixed camera + pour + gated selective bloom.
// ---------------------------------------------------------------------------
export default function Scene() {
  const [lit, setLit] = useState(false);
  const frame = useMemo(
    () => buildFrame(LIVE_PROJECTS.map((p) => ({ id: p.id, href: p.href }))),
    [],
  );

  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={[1, 1.75]}
      gl={{ localClippingEnabled: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <CameraRig frame={frame} />
      <Pour frame={frame} onLitChange={setLit} />
      {lit && (
        // No `selection` prop: that force-adds every diamond to the bloom layer
        // (and would keep a health-failed keystone glowing at N>=2). Membership
        // is controlled per frame via mesh.layers on BLOOM_LAYER instead.
        <EffectComposer autoClear={false} multisampling={4}>
          <SelectiveBloom
            selectionLayer={BLOOM_LAYER}
            lights={[]}
            intensity={1.5}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            mipmapBlur
            radius={0.7}
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}

// --- small pure helpers ----------------------------------------------------
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
