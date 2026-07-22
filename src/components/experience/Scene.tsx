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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  Line,
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
import { LIVE_PROJECTS, PROJECTS } from '@/lib/projects';
import { buildFrame, type Frame, type Member } from '@/lib/pour/frame';
import { buildVines, type Vine } from '@/lib/vines';
import { PocheMaterial, type PocheColors } from './pour/PocheMaterial';

// --- tuning ----------------------------------------------------------------
const BLOOM_LAYER = 11;
const STAGGER_SPAN = 0.7; // vertical lag (world units) between first + last member
const DAMP_TIME = 0.12;
const CAM_AZ = (28 * Math.PI) / 180; // axonometric azimuth
const CAM_TILT = (18 * Math.PI) / 180; // axonometric tilt (sectioned axon)
const FRAME_MARGIN = 1.22; // fill the band cell, clearing the sheet header rules
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
  // Concrete-as-material (decoupled from concrete-as-text-ink) so the pour
  // reads as ONE material family under both grounds.
  const concrete = read('--pour-concrete', dark ? '#5d574d' : '#7a7263');
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
  /** Hollow outline — the "not in service" state, rhyming with the index dots. */
  edge: LineSegments;
  material: MeshBasicMaterial;
  edgeMaterial: LineBasicMaterial;
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
  // NB: do NOT translate this group to reposition the frame on screen — the pour
  // clip planes are world-space and would desync from the geometry. Framing/pan is
  // done on the camera (CameraRig), which keeps world coords (and the cut) intact.
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

    // Graphite wireframe (EdgesGeometry of the swept tube), consumed from
    // beneath. Non-structural linework (ties/purlins/girts) draws as a single
    // clean segment instead of a boxed tube — a drafted tick, not a member.
    //
    // Clip side differs by kind. Clad members keep their wireframe ABOVE the cut
    // (concrete takes over below). Non-clad binders have NO concrete, so clipping
    // them above the cut left a thin line floating over the structure that thinned
    // out and vanished as the pour rose (and, being diagonal, could strand an
    // isolated segment). Clip them BELOW the cut instead — the same side the
    // concrete builds on: hidden until the pour reaches their level, then revealed
    // as built linework and kept, never floating above.
    const wireMat = track(
      new LineBasicMaterial({
        color: pal.graphite.clone(),
        clippingPlanes: [member.clad ? planeWire : planeSolid],
      }),
    );
    let wire: LineSegments;
    if (member.clad) {
      wire = new LineSegments(edgesGeo, wireMat);
      wire.position.copy(tmpMid);
      wire.quaternion.setFromUnitVectors(zAxis, dir);
      wire.scale.set(member.thickness, member.thickness, len);
    } else {
      const seg = track(new BufferGeometry());
      seg.setAttribute(
        'position',
        new Float32BufferAttribute([...member.p0, ...member.p1], 3),
      );
      wire = new LineSegments(seg, wireMat);
    }
    // Members start unbuilt: the erection sequence reveals them in authored
    // order as STATE 03 arrives (Pour drives visibility per frame).
    wire.visible = false;
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
  const octaEdges = track(new EdgesGeometry(octaGeo));
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
    mesh.visible = false; // revealed by the erection sequence
    // Bloom-layer membership is toggled per frame by ignition strength (below),
    // so a graphite (not-yet-lit / health-failed) diamond is never on the layer.
    group.add(mesh);

    // Hollow outline twin: an unlit keystone reads as an EMPTY diamond (same
    // vocabulary as the sheet-index dots), never as a solid dark mass.
    const edgeMaterial = track(
      new LineBasicMaterial({
        color: pal.graphite.clone(),
        depthTest: false,
        depthWrite: false,
      }),
    );
    const edge = new LineSegments(octaEdges, edgeMaterial);
    edge.position.copy(mesh.position);
    edge.renderOrder = 10;
    edge.visible = false;
    group.add(edge);

    return {
      mesh,
      edge,
      material,
      edgeMaterial,
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

    // Exact fit: project the 8 bounding-box corners into camera space and take
    // the max extents. (The old hypot-based bound over-shot badly for the long
    // multi-bent shed and rendered it tiny in its cell.)
    const { min, max } = frame.bounds;
    const c = frame.bounds.center;
    const center = new Vector3(c[0], c[1], c[2]);
    const dir = new Vector3(
      Math.sin(CAM_AZ) * Math.cos(CAM_TILT),
      Math.sin(CAM_TILT),
      Math.cos(CAM_AZ) * Math.cos(CAM_TILT),
    );
    const right = new Vector3().crossVectors(dir, UP).normalize();
    const camUp = new Vector3().crossVectors(right, dir).normalize();
    let needW = 0;
    let needH = 0;
    const corner = new Vector3();
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          corner.set(x, y, z).sub(center);
          needW = Math.max(needW, Math.abs(corner.dot(right)));
          needH = Math.max(needH, Math.abs(corner.dot(camUp)));
        }
    needW *= FRAME_MARGIN;
    needH *= FRAME_MARGIN;
    // Respect the canvas aspect: widen whichever axis is slack.
    let halfW = needW;
    let halfH = needH;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;

    // Camera-space pan: the canvas IS the band cell now (Margin Law), so the
    // frame owns its room — just a hair of downward bias so the ridge clears the
    // sheet header line. Panning the frustum (not the model) keeps world coords —
    // and the world-space pour clip planes — intact.
    const panY = 0.06 * halfH; // +down on screen
    const panX = 0;
    cam.left = -halfW + panX;
    cam.right = halfW + panX;
    cam.top = halfH + panY;
    cam.bottom = -halfH + panY;
    cam.near = 0.1;
    cam.far = 500;
    cam.zoom = 1;

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
  // Erection clock: 0 = bare site, 1 = fully framed. Rises when STATE 03
  // arrives; members become visible in authored order along the way.
  const erectRef = useRef(0);

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
      for (const d of built.diamonds) {
        d.material.color.copy(pal.graphite);
        d.edgeMaterial.color.copy(pal.graphite);
      }
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
    // IDLE GUARD: STATE 03/04 off-screen and nothing built -> do nothing at all.
    // (Ensure the bloom pass is torn down if we idle while it was still lit.)
    if (s.state < 3 && s.pour === 0 && erectRef.current === 0) {
      if (litRef.current) {
        litRef.current = false;
        onLitChange(false);
      }
      return;
    }

    // ERECTION — the frame assembles member by member (authored order) as
    // STATE 03 arrives, and strikes if the visitor scrolls back above it.
    const erectTarget = s.state >= 3 || s.pour > 0 ? 1 : 0;
    const erecting = damp(erectRef, 'current', erectTarget, 0.45, dt);
    const e = erectRef.current;
    for (const mv of built.members) {
      mv.wire.visible = e > mv.member.stagger * 0.96;
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
      const erected = e > (d.bias / STAGGER_SPAN) * 0.96 || e > 0.96;
      const effApex = h - d.bias;
      const igniteT = smoothstep(d.ridgeY - 0.22, d.ridgeY + 0.02, effApex);
      const gate = s.health[d.href]?.up === false ? 0 : 1; // missing => assume live
      const strength = igniteT * gate;
      // Unlit / health-failed keystone = hollow outline; ignition fills it.
      d.edge.visible = erected;
      d.mesh.visible = erected && strength > 0.15;
      litColor.copy(pal.graphite).lerp(pal.live, strength);
      if (strength > 0) litColor.multiplyScalar(1 + strength * 1.6); // HDR for bloom
      d.material.color.copy(litColor);
      d.edgeMaterial.color.copy(strength > 0.15 ? litColor : pal.graphite);
      if (strength >= BLOOM_IN) d.mesh.layers.enable(BLOOM_LAYER);
      else d.mesh.layers.disable(BLOOM_LAYER);
      if (strength > maxStrength) maxStrength = strength;
    }

    const litNow = litRef.current ? maxStrength > LIT_OFF : maxStrength > LIT_ON;
    if (litNow !== litRef.current) {
      litRef.current = litNow;
      onLitChange(litNow);
    }

    // Keep the demand loop alive only while something is still settling.
    if (animating || erecting || Math.abs(h - target) > 1e-4) invalidate();
  });

  // Ensure clipping is live even if the gl prop was not honoured.
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  return <primitive object={built.group} />;
}

// ---------------------------------------------------------------------------
// L-101 OVERGROWTH — twelve vines climbing the erected frame.
//
// One vine per schedule entry (12), spread across the 8 bents: helices wrap
// the real columns and continue along rafters / eave girts / the ridge purlin,
// leaves budding behind the growth tip, a flower closing each path. Growth is
// a tip-first drawRange reveal driven by scroll progress THROUGH STATE 04
// (store.grow), staggered per vine, monotonic (the vine only ever adds), with
// a short catch-up damp so a fast scroll still grows instead of snapping.
// Graphite linework, depth-tested — wraps genuinely pass behind poured
// members. The bloom-center dot is the only mark allowed to spend red, gated
// EXACTLY like the schedule diamonds: live AND probe-passing AND growth past
// the ignition threshold.
// ---------------------------------------------------------------------------
const GROW_WINDOW = 1.35; // stagger window: 3-4 vines mid-growth at once
const GROW_DAMP = 0.28; // catch-up damp toward the scroll target
const LEAF_LAG = 0.05; // leaves sprout this far behind the growth tip
const IGNITE_AT = 0.85; // same growth threshold as the 2D bed's bloom dots

interface VineViz {
  vine: Vine;
  stemGeo: BufferGeometry;
  leafGeo: BufferGeometry;
  flower: Group;
  dot: Mesh;
  dotMat: MeshBasicMaterial;
  pointCount: number;
  segCount: number;
  leafCursor: number;
  lastStemCount: number;
}

interface OvergrowthBuilt {
  group: Group;
  vines: VineViz[];
  stemMat: LineBasicMaterial;
  dispose: () => void;
}

function buildOvergrowth(vines: Vine[], pal: Palette): OvergrowthBuilt {
  const group = new Group();
  group.visible = false;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // One graphite ink for every stem, leaf, and petal — the same drawn voice
  // as the wireframe. Depth test stays ON (default): the concrete solids
  // occlude the far side of every wrap.
  const stemMat = track(new LineBasicMaterial({ color: pal.graphite.clone() }));
  const dotGeo = track(new OctahedronGeometry(0.07, 0));

  const viz: VineViz[] = vines.map((vine) => {
    const stemGeo = track(new BufferGeometry());
    stemGeo.setAttribute('position', new Float32BufferAttribute(vine.points, 3));
    stemGeo.setDrawRange(0, 0);
    const stem = new Line(stemGeo, stemMat);
    stem.frustumCulled = false; // drawRange animates; skip bounds churn
    group.add(stem);

    const leafGeo = track(new BufferGeometry());
    leafGeo.setAttribute('position', new Float32BufferAttribute(vine.leafSegs, 3));
    leafGeo.setDrawRange(0, 0);
    const leaves = new LineSegments(leafGeo, stemMat);
    leaves.frustumCulled = false;
    group.add(leaves);

    // Flower group at the stem's end; scale animates the opening.
    const flower = new Group();
    flower.position.set(vine.center[0], vine.center[1], vine.center[2]);
    flower.visible = false;
    flower.scale.setScalar(1e-4);
    const petalGeo = track(new BufferGeometry());
    petalGeo.setAttribute('position', new Float32BufferAttribute(vine.petalSegs, 3));
    const petals = new LineSegments(petalGeo, stemMat);
    petals.frustumCulled = false;
    flower.add(petals);
    const dotMat = track(
      new MeshBasicMaterial({ color: pal.graphite.clone(), toneMapped: false }),
    );
    const dot = new Mesh(dotGeo, dotMat);
    dot.visible = false;
    flower.add(dot);
    group.add(flower);

    return {
      vine,
      stemGeo,
      leafGeo,
      flower,
      dot,
      dotMat,
      pointCount: vine.points.length / 3,
      segCount: vine.leafSpawn.length,
      leafCursor: 0,
      lastStemCount: 0,
    };
  });

  return {
    group,
    vines: viz,
    stemMat,
    dispose: () => {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

function Overgrowth({ frame }: { frame: Frame }) {
  const { invalidate } = useThree();
  const paletteRef = useRef<Palette>(readPalette());
  const vines = useMemo(
    () =>
      buildVines(
        frame,
        PROJECTS.map((p) => ({ id: p.id, href: p.href, live: p.live })),
      ),
    [frame],
  );
  const built = useMemo(() => buildOvergrowth(vines, paletteRef.current), [vines]);
  // Monotonic scroll target + the damped front chasing it.
  const targetRef = useRef(0);
  const frontRef = useRef(0);
  const litColor = useRef(new Color()).current;

  // Wake the demand loop when the growth clock (or anything the vines read)
  // moves. Same doctrine as Pour: never subscribe to whole-set progress.
  useEffect(() => {
    return useWorkingSet.subscribe((s, p) => {
      if (
        s.grow !== p.grow ||
        s.health !== p.health ||
        s.state !== p.state ||
        s.pour !== p.pour
      ) {
        invalidate();
      }
    });
  }, [invalidate]);

  // Theme: recolor the shared ink on data-theme change (dots recolor per frame).
  useEffect(() => {
    const applyTheme = () => {
      const pal = readPalette();
      paletteRef.current = pal;
      built.stemMat.color.copy(pal.graphite);
      invalidate();
    };
    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, [built, invalidate]);

  useEffect(() => {
    // Dev-only handle so automated verification can read the growth front.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __grow?: unknown }).__grow = {
        front: () => frontRef.current,
        target: () => targetRef.current,
      };
    }
    return () => {
      if (process.env.NODE_ENV !== 'production') {
        delete (window as unknown as { __grow?: unknown }).__grow;
      }
      built.dispose();
    };
  }, [built]);

  useFrame((_, dt) => {
    const s = useWorkingSet.getState();
    // MONOTONIC: the pencil only adds. Scrolling back up never un-grows.
    if (s.grow > targetRef.current) targetRef.current = s.grow;
    const target = targetRef.current;
    // The overgrowth exists only while its structure does — if the reader
    // scrolls all the way back and the frame strikes, the vines go with it
    // (growth itself is preserved and returns fully grown).
    const show = (s.state >= 3 || s.pour > 0) && target > 0.0005;
    if (built.group.visible !== show) {
      built.group.visible = show;
      invalidate();
    }
    if (!show) return;

    // FAST-SCROLL CATCH-UP: a jump lands the target far ahead; the front
    // tweens toward it instead of snapping, so the growth is always seen.
    const settling = damp(frontRef, 'current', target, GROW_DAMP, dt);
    const front = frontRef.current;
    const pal = paletteRef.current;
    const n = built.vines.length;

    for (let i = 0; i < n; i++) {
      const v = built.vines[i];
      // Staggered per-vine growth; vine n-1 reaches 1 exactly at front 1.
      const g = clamp01((front * (n - 1 + GROW_WINDOW) - i) / GROW_WINDOW);

      // Tip-first stem reveal.
      const stemCount = g <= 0 ? 0 : Math.max(2, Math.round(g * v.pointCount));
      if (stemCount !== v.lastStemCount) {
        v.lastStemCount = stemCount;
        v.stemGeo.setDrawRange(0, stemCount);
      }

      // Leaves sprout behind the tip (cursor is monotonic like the growth).
      const lg = g - LEAF_LAG;
      while (v.leafCursor < v.segCount && v.vine.leafSpawn[v.leafCursor] <= lg) {
        v.leafCursor++;
      }
      v.leafGeo.setDrawRange(0, v.leafCursor * 2);

      // Flower opens over the last reach of the vine.
      const open = smoothstep(0.86, 1, g);
      v.flower.visible = open > 0.001;
      if (v.flower.visible) v.flower.scale.setScalar(Math.max(open, 1e-4));

      // Bloom-center ignition — the diamonds' exact gate: red ONLY when the
      // project is live AND the probe passes AND this vine's growth is past
      // the threshold. Everything else stays graphite. Red never lies.
      const ignite = smoothstep(IGNITE_AT, IGNITE_AT + 0.1, g);
      v.dot.visible = ignite > 0.02;
      const gate =
        v.vine.live &&
        (v.vine.href ? s.health[v.vine.href]?.up !== false : false);
      if (gate) litColor.copy(pal.graphite).lerp(pal.live, ignite);
      else litColor.copy(pal.graphite);
      v.dotMat.color.copy(litColor);
    }

    if (settling) invalidate();
  });

  return <primitive object={built.group} />;
}

// ---------------------------------------------------------------------------
// Adaptive resolution — the recovery path the capability gate can't provide.
// The gate reads cores/RAM but not the GPU, so an integrated-graphics desktop
// passes and then drowns in fill rate (dpr 1.75 + MSAA + bloom). Measure real
// frame times and step the dpr ceiling down 1.75 → 1.5 → 1.25 → 1, one-way:
// a machine holding budget never demotes, so fidelity there is untouched.
//
// Hand-rolled instead of drei's <PerformanceMonitor>: frameloop="demand"
// leaves long idle gaps between invalidation bursts, and a wall-clock fps
// monitor reads each gap as dropped frames — demoting healthy machines.
// Filtering on per-frame delta samples only frames rendered back-to-back.
// (A genuine frame slower than IDLE_GAP is indistinguishable from a gap and
// never sampled; hardware that slow is a software renderer, culled at the gate.)
// ---------------------------------------------------------------------------
const DPR_MAX = 1.75;
const DPR_FLOOR = 1;
const DPR_STEP = 0.25;
const FRAME_BUDGET = 1 / 36; // demote when the sustained average is worse than ~36fps
const SAMPLE_FRAMES = 60; // ~1-2s of continuous animation per verdict
const IDLE_GAP = 0.25; // deltas above this are demand-loop gaps, not frame cost

function AdaptiveDpr({ demote }: { demote: () => void }) {
  const acc = useRef({ time: 0, frames: 0 });
  useFrame((_, dt) => {
    if (dt <= 0 || dt > IDLE_GAP) return;
    const a = acc.current;
    a.time += dt;
    a.frames += 1;
    if (a.frames < SAMPLE_FRAMES) return;
    const avg = a.time / a.frames;
    a.time = 0;
    a.frames = 0;
    if (avg > FRAME_BUDGET) demote();
  });
  return null;
}

// ---------------------------------------------------------------------------
// Scene root — Canvas + fixed camera + pour + gated selective bloom.
// ---------------------------------------------------------------------------
export default function Scene() {
  const [lit, setLit] = useState(false);
  const [dprMax, setDprMax] = useState(DPR_MAX);
  const demote = useCallback(
    () => setDprMax((d) => Math.max(DPR_FLOOR, d - DPR_STEP)),
    [],
  );
  const frame = useMemo(
    () => buildFrame(LIVE_PROJECTS.map((p) => ({ id: p.id, href: p.href }))),
    [],
  );

  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={[1, dprMax]}
      gl={{
        localClippingEnabled: true,
        antialias: true,
        // On hybrid laptops this requests the discrete adapter; a no-op on
        // single-GPU machines. Zero visual change either way.
        powerPreference: 'high-performance',
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {dprMax > DPR_FLOOR && <AdaptiveDpr demote={demote} />}
      <CameraRig frame={frame} />
      <Pour frame={frame} onLitChange={setLit} />
      <Overgrowth frame={frame} />
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
