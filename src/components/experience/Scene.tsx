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
  Fog,
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
// Erection clock runs LINEARLY (not damped): an exponential approach front-loads
// the clock, flipping most of the stagger thresholds in the first few hundred ms
// so the whole frame pops in at once. A constant-rate clock spends the same wall
// time on every member, so the structure visibly assembles a few lines at a time.
const ERECT_TIME = 2.6; // s, bare site -> fully framed
const STRIKE_TIME = 1.0; // s, fully framed -> bare site (scrolling back up)
// Share of the erection clock each member spends DRAWING its line (grown from its
// start joint), rather than appearing fully formed. Staggers are compressed to
// 1 - DRAW_WINDOW so the last member still finishes drawing exactly at e = 1.
const DRAW_WINDOW = 0.14;
// TEMPORARY WORKS. Concrete is not placed against air: the shutters go up ahead
// of the pour, the pour fills them, and the strike is a SEPARATE operation later.
// Modelling all three gives every clad member four readable states instead of
// two, and — because the strike runs on the growth clock rather than the pour —
// it keeps the structure itself moving through the long stretch after the
// section front has topped out, which until now belonged to the planting alone.
const FORM_LEAD = 0.2; // shutters stand this far above the section front
const FORM_BAND = 0.42; // ...and this far below it before the strike front takes over
const FORM_SWELL = 2.0; // shutter cross-section, as a multiple of the member's
const FORM_RINGS = 7; // panel joints along the shutter, ends included
const STRIKE_END = 0.76; // growth at which the last shutter is off

// The dimension string reads off after the pour, station by station.
const DIM_FROM = 0.34;
const DIM_TO = 0.84;
// Lightest pen on the sheet: dimensions are annotation, not structure, and one-
// pixel WebGL lines leave tonal value as the only weight hierarchy available.
const DIM_PEN = 0.2; // fraction of the way from graphite toward the paper

// The revision cloud is the last mark the sheet takes, and it closes a little
// short of the bottom on purpose. It cannot ride the appendix's ISSUED FOR
// CONSTRUCTION stamp, which is where it belongs by rights: the canvas layer
// fades out across the tail of STATE 04, so by the time that stamp strikes
// there is nothing on screen to draw on. Landing the cloud just before the
// fade keeps the relay — the sheet marks itself, then the record stamps it.
const REVISE_FROM = 0.82;
const REVISE_TO = 0.97;

const CAM_AZ = (28 * Math.PI) / 180; // axonometric azimuth
const CAM_TILT = (18 * Math.PI) / 180; // axonometric tilt (sectioned axon)
// ...and where the axon has turned to by the time the set is poured and grown.
// A sectioned axon under an orthographic camera has NO perspective parallax, so
// a slow turn is the only honest signal that the reader is moving around a real
// object rather than past a flat plate. Kept small: this is a drawing being
// re-pinned on the board, not an orbit.
const CAM_AZ_END = (34 * Math.PI) / 180;
const CAM_TILT_END = (25 * Math.PI) / 180;
const CAM_DRIFT_DAMP = 0.55; // catch-up damp on the turn (s)
const CAM_DIST = 120; // camera standoff along the view axis
const FRAME_MARGIN = 1.22; // fill the band cell, clearing the sheet header rules
const UP = new Vector3(0, 1, 0);

// Aerial recession. The deepest bent fades this far toward the paper — the
// draughtsman's depth cue (far linework laid lighter), not a blur and not a
// gradient. WebGL core lines are always one pixel wide, so tonal value is the
// only line-weight hierarchy available here.
const FOG_MAX = 0.52;

function camDir(az: number, tilt: number, out: Vector3): Vector3 {
  return out.set(
    Math.sin(az) * Math.cos(tilt),
    Math.sin(tilt),
    Math.cos(az) * Math.cos(tilt),
  );
}

// Bloom membership + composer-enable thresholds, measured on the diamond's
// ACTUAL ignition strength (0 = graphite .. 1 = full red), NOT raw pour — so the
// pass runs only while a genuinely red keystone is lit. Hysteresis stops the
// pass flickering while the section front settles.
const BLOOM_IN = 0.5; // strength at which a diamond joins the bloom layer
const LIT_ON = 0.55; // strongest-diamond strength that enables the composer
const LIT_OFF = 0.4; // ...and below which it goes idle again

// ---------------------------------------------------------------------------
// Theme palette resolved from CSS custom properties into three Colors.
// ---------------------------------------------------------------------------
interface Palette {
  graphite: Color;
  concrete: Color;
  poche: PocheColors;
  live: Color; // revision-red
  paper: Color; // the ground the set is drawn on — what depth fades toward
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
  const paper = read('--ground', dark ? '#14181a' : '#e9e3d6');
  // Hatch a hair off the fill: lighter toward vellum on dark, darker toward ink on light.
  const hatch = concrete.clone().lerp(dark ? read('--vellum', '#e9e3d6') : graphite, 0.35);
  return { graphite, concrete, poche: { fill: concrete, hatch }, live, paper, dark };
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
  form: LineSegments | null; // shuttering, clipped to the band between the two below
  formMat: LineBasicMaterial | null;
  planeFormTop: Plane; // y <= effCut + FORM_LEAD  (shutters lead the pour)
  planeFormBot: Plane; // y >= strike front        (…and are struck from below)
  // precomputed
  y0: number;
  y1: number;
  dirY: number;
  axis1: Vector3; // horizontal member direction (cap local X)
  axis2: Vector3; // horizontal perpendicular (cap local Y)
  bias: number; // erection-order lag subtracted from currentH
  // Line-drawing basis for clad wires (null for non-clad single segments, which
  // are pour-revealed via clip planes, not erection-drawn).
  growLen: number;
  growDir: Vector3 | null;
  growP0: Vector3 | null;
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

/**
 * A merged linework stream drawn on by a cursor over its own ascending spawn
 * params — the foundations, the dimension string, and the revision cloud all
 * work this way, so each of them is one draw call however many marks it holds.
 */
interface StreamViz {
  geo: BufferGeometry;
  material: LineBasicMaterial;
  /** Ascending reveal params, one per SEGMENT. */
  spawn: number[];
  /** Two-way cursor over `spawn`; walks back down when its clock reverses. */
  cursor: number;
}

interface Built {
  group: Group;
  members: MemberViz[];
  diamonds: DiamondViz[];
  footings: StreamViz;
  /** Running bent-spacing dimensions at grade, read off on the growth clock. */
  dims: StreamViz;
  /** Revision cloud + delta over the front keystone, the sheet's last mark. */
  revise: StreamViz;
  poche: PocheMaterial;
  dispose: () => void;
}

/**
 * One unit shutter box: four arris lines, panel joints along its length, and
 * tie stubs at alternate joints. Built once at unit scale (x/y are the
 * cross-section, z is the run) and scaled per member like the solid it boxes,
 * so every clad member shares this geometry.
 */
function buildShutterGeometry(): BufferGeometry {
  const v: number[] = [];
  const half = 0.5;
  for (const sx of [-half, half])
    for (const sy of [-half, half]) v.push(sx, sy, -half, sx, sy, half);
  for (let i = 0; i < FORM_RINGS; i++) {
    const z = -half + i / (FORM_RINGS - 1);
    v.push(-half, -half, z, half, -half, z);
    v.push(half, -half, z, half, half, z);
    v.push(half, half, z, -half, half, z);
    v.push(-half, half, z, -half, -half, z);
    // Tie stubs at alternate interior joints — the marks that say temporary works.
    if (i > 0 && i < FORM_RINGS - 1 && i % 2 === 1) {
      const out = 0.78;
      v.push(half, 0, z, out, 0, z);
      v.push(-half, 0, z, -out, 0, z);
      v.push(0, half, z, 0, out, z);
      v.push(0, -half, z, 0, -out, z);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(v, 3));
  return geo;
}

/** Wire up a merged, cursor-drawn linework stream as one scene object. */
function makeStream(
  group: Group,
  segs: number[],
  spawn: number[],
  color: Color,
): { viz: StreamViz; parts: { dispose: () => void }[] } {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(segs, 3));
  geo.setDrawRange(0, 0);
  const material = new LineBasicMaterial({ color: color.clone() });
  const lines = new LineSegments(geo, material);
  lines.frustumCulled = false; // drawRange animates; skip bounds churn
  group.add(lines);
  return {
    viz: { geo, material, spawn, cursor: 0 },
    parts: [geo, material],
  };
}

/** Advance or retreat a stream's cursor to match a 0..1 clock. */
function driveStream(s: StreamViz, t: number): void {
  while (s.cursor < s.spawn.length && s.spawn[s.cursor] <= t) s.cursor++;
  while (s.cursor > 0 && s.spawn[s.cursor - 1] > t) s.cursor--;
  s.geo.setDrawRange(0, s.cursor * 2);
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
  const shutterGeo = track(buildShutterGeometry());
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
    // …and the band the shuttering lives in, between the same two directions.
    const planeFormTop = new Plane(new Vector3(0, -1, 0), 0);
    const planeFormBot = new Plane(new Vector3(0, 1, 0), 0);

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
    let form: LineSegments | null = null;
    let formMat: LineBasicMaterial | null = null;

    // Shuttering, on the members a crew would actually box: columns and rafters.
    // The triangulating brace is drafted linework rather than a formed pour, and
    // boxing it would cost a draw call per bent to say something untrue.
    if (member.clad && (member.role === 'column' || member.role === 'rafter')) {
      formMat = track(
        // Concrete ink, not graphite: temporary works are not the structure, and
        // the lighter value keeps them legible against the frame they surround.
        new LineBasicMaterial({
          color: pal.concrete.clone(),
          clippingPlanes: [planeFormTop, planeFormBot],
        }),
      );
      form = new LineSegments(shutterGeo, formMat);
      form.position.copy(tmpMid);
      form.quaternion.setFromUnitVectors(zAxis, dir);
      form.scale.set(
        member.thickness * FORM_SWELL,
        member.thickness * FORM_SWELL,
        len,
      );
      form.renderOrder = 4;
      form.visible = false;
      group.add(form);
    }

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
      form,
      formMat,
      planeFormTop,
      planeFormBot,
      y0: p0.y,
      y1: p1.y,
      dirY,
      axis1,
      axis2,
      bias: member.stagger * STAGGER_SPAN,
      growLen: len,
      growDir: member.clad ? dir : null,
      growP0: member.clad ? p0.clone() : null,
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
        // Exempt from the aerial recession: a deep bay's keystone is either
        // live or it is not, and fog would read as a half-answer. Red never lies.
        fog: false,
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
        fog: false,
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

  // Three cursor-drawn linework streams, one draw call each however many marks
  // they hold: the foundations laid on the erection clock, the running
  // dimensions read off on the growth clock, and the revision cloud that closes
  // the sheet. Only their clocks differ.
  const footings = makeStream(
    group,
    frame.footingSegs,
    frame.footingSpawn,
    pal.graphite,
  );
  const dims = makeStream(
    group,
    frame.dimSegs,
    frame.dimSpawn,
    pal.graphite.clone().lerp(pal.paper, DIM_PEN),
  );
  const revise = makeStream(
    group,
    frame.reviseSegs,
    frame.reviseSpawn,
    pal.graphite,
  );
  for (const p of [...footings.parts, ...dims.parts, ...revise.parts]) track(p);

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return {
    group,
    members,
    diamonds,
    footings: footings.viz,
    dims: dims.viz,
    revise: revise.viz,
    poche: pocheMat,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Sectioned-axonometric camera. The FRUSTUM is set once + on resize and never
// changes again; only the view direction drifts, and only across the pour and
// growth. Framing is fitted against the WIDEST projection in that drift range,
// so the set turns without breathing in size as it turns — and because the pan
// is on the frustum rather than the model, the world-space pour clip planes
// stay valid throughout. Never orbits under the reader's hand.
// ---------------------------------------------------------------------------
function CameraRig({ frame }: { frame: Frame }) {
  const camRef = useRef<OrthographicCameraImpl>(null);
  const { size, invalidate } = useThree();
  const azRef = useRef(CAM_AZ);
  const center = useMemo(() => {
    const c = frame.bounds.center;
    return new Vector3(c[0], c[1], c[2]);
  }, [frame]);
  const scratch = useRef({
    dir: new Vector3(),
    right: new Vector3(),
    up: new Vector3(),
    corner: new Vector3(),
    need: { w: 0, h: 0 },
  }).current;
  // Frustum half-extents fitted at the START azimuth; the turn holds apparent
  // size with zoom against these rather than by fitting the worst case, which
  // would shrink the set in its cell for the whole of STATE 03.
  const halfRef = useRef({ w: 1, h: 1 });

  /** Half-extents the bounds need at this view direction, margin included. */
  const measure = useCallback(
    (az: number) => {
      const { min, max } = frame.bounds;
      const dir = camDir(az, driftTilt(az), scratch.dir);
      const right = scratch.right.crossVectors(dir, UP).normalize();
      const camUp = scratch.up.crossVectors(right, dir).normalize();
      let w = 0;
      let h = 0;
      for (const x of [min[0], max[0]])
        for (const y of [min[1], max[1]])
          for (const z of [min[2], max[2]]) {
            scratch.corner.set(x, y, z).sub(center);
            w = Math.max(w, Math.abs(scratch.corner.dot(right)));
            h = Math.max(h, Math.abs(scratch.corner.dot(camUp)));
          }
      scratch.need.w = w * FRAME_MARGIN;
      scratch.need.h = h * FRAME_MARGIN;
      return scratch.need;
    },
    [frame, center, scratch],
  );

  useLayoutEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    const aspect = size.width / Math.max(1, size.height);

    // Exact fit: project the 8 bounding-box corners into camera space and take
    // the max extents. (The old hypot-based bound over-shot badly for the long
    // multi-bent shed and rendered it tiny in its cell.)
    const need = measure(CAM_AZ);
    // Respect the canvas aspect: widen whichever axis is slack.
    let halfW = need.w;
    let halfH = need.h;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    halfRef.current = { w: halfW, h: halfH };

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

    cam.position
      .copy(center)
      .addScaledVector(camDir(azRef.current, driftTilt(azRef.current), scratch.dir), CAM_DIST);
    cam.up.copy(UP);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    invalidate();
  }, [frame, size.width, size.height, invalidate, center, scratch, measure]);

  // The turn itself. Driven by pour + growth (never whole-set progress), so it
  // moves only while STATE 03/04 are on screen and the demand loop is already
  // awake for the pour — this adds no wake-ups of its own.
  useFrame((_, dt) => {
    const cam = camRef.current;
    if (!cam) return;
    const s = useWorkingSet.getState();
    const advance = clamp01(s.pour * 0.5 + s.grow * 0.5);
    const target = CAM_AZ + (CAM_AZ_END - CAM_AZ) * easeInOutCubic(advance);
    const settling = damp(azRef, 'current', target, CAM_DRIFT_DAMP, dt);
    const az = azRef.current;
    cam.position
      .copy(center)
      .addScaledVector(camDir(az, driftTilt(az), scratch.dir), CAM_DIST);
    cam.up.copy(UP);
    cam.lookAt(center);
    // A turning axon presents a wider silhouette; scale the frustum to keep the
    // set the same size in its cell, so the drift reads as the drawing turning
    // rather than as the drawing being pushed away. Zoom leaves the world-space
    // pour clip planes untouched (they are camera-independent).
    const { w, h } = measure(az);
    const half = halfRef.current;
    const zoom = Math.min(half.w / w, half.h / h);
    if (Math.abs(zoom - cam.zoom) > 1e-4) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    if (settling) invalidate();
  });

  return (
    <OrthographicCamera ref={camRef} makeDefault manual near={0.1} far={500} />
  );
}

/** Tilt is slaved to azimuth so the drift is one motion, not two. */
function driftTilt(az: number): number {
  const k = (az - CAM_AZ) / (CAM_AZ_END - CAM_AZ);
  return CAM_TILT + (CAM_TILT_END - CAM_TILT) * k;
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
  const { invalidate, gl, scene } = useThree();

  const paletteRef = useRef<Palette>(readPalette());
  const built = useMemo(() => buildScene(frame, paletteRef.current), [frame]);

  // AERIAL RECESSION — linear fog fitted to the set's own depth along the view
  // axis, so the near bent stays full-strength graphite and the deepest one has
  // faded FOG_MAX of the way to the paper. Range is measured once at the middle
  // of the camera drift; a nine-degree turn moves it by well under a percent.
  const fog = useMemo(() => {
    const dir = camDir(
      (CAM_AZ + CAM_AZ_END) / 2,
      (CAM_TILT + CAM_TILT_END) / 2,
      new Vector3(),
    );
    const { min, max, center } = frame.bounds;
    const c = new Vector3(center[0], center[1], center[2]);
    const corner = new Vector3();
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          const d = corner.set(x, y, z).sub(c).dot(dir);
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
    // Camera sits CAM_DIST along +dir from centre, so view depth = CAM_DIST - d.
    const near = CAM_DIST - hi;
    const span = Math.max(hi - lo, 1e-3);
    return new Fog(paletteRef.current.paper.getHex(), near, near + span / FOG_MAX);
  }, [frame]);
  const hRef = useRef(frame.baseY);
  // The de-shuttering front. A second, slower height chasing the section front
  // up the same axis — never above it, because a shutter cannot come off a pour
  // that has not happened.
  const strikeRef = useRef(frame.baseY);
  /** Growth value at which the pour topped out; -1 until it has. */
  const handoffRef = useRef(-1);
  const litRef = useRef(false);
  // Erection clock: 0 = bare site, 1 = fully framed. Rises when STATE 03
  // arrives; members become visible in authored order along the way.
  const erectRef = useRef(0);

  // --- store subscription: wake the demand loop on pour/grow/state/health --
  // NOT progress: progress is the whole-set scroll value and is never read in
  // useFrame, so subscribing to it would re-render the canvas on every scroll
  // tick site-wide (even with STATE 04 far off-screen), defeating frameloop
  // "demand". The lit/ignition decision lives in useFrame, tied to the actual
  // section-front position — not raw pour. Growth joined this list when the
  // strike, the dimensions and the revision cloud started riding it: they are
  // structure and annotation, but their clock is the reader's trip down the
  // shipped sheet, which is the same window `grow` already covers.
  useEffect(() => {
    return useWorkingSet.subscribe((s, p) => {
      if (
        s.pour !== p.pour ||
        s.grow !== p.grow ||
        s.state !== p.state ||
        s.health !== p.health
      ) {
        invalidate();
      }
    });
  }, [invalidate]);

  // --- fog: own it on the scene, and mirror it onto the poché shader -------
  useEffect(() => {
    scene.fog = fog;
    built.poche.setFog(fog.color, fog.near, fog.far);
    invalidate();
    return () => {
      if (scene.fog === fog) scene.fog = null;
    };
  }, [scene, fog, built, invalidate]);

  // --- theme: re-resolve palette + recolor materials on data-theme change --
  useEffect(() => {
    const applyTheme = () => {
      const pal = readPalette();
      paletteRef.current = pal;
      // Depth fades toward whichever ground the set is drawn on.
      fog.color.copy(pal.paper);
      built.poche.setFog(fog.color, fog.near, fog.far);
      built.footings.material.color.copy(pal.graphite);
      built.revise.material.color.copy(pal.graphite);
      built.dims.material.color.copy(pal.graphite).lerp(pal.paper, DIM_PEN);
      for (const mv of built.members) {
        (mv.wire.material as LineBasicMaterial).color.copy(pal.graphite);
        if (mv.formMat) mv.formMat.color.copy(pal.concrete);
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
  }, [built, invalidate, fog]);

  // --- lifecycle: webglActive + full disposal ------------------------------
  useEffect(() => {
    const setWebglActive = useWorkingSet.getState().setWebglActive;
    setWebglActive(true);
    // Dev-only handle so automated verification can read the two fronts and the
    // annotation cursors, rather than inferring them from a screenshot.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __pour?: unknown }).__pour = {
        cut: () => hRef.current,
        strike: () => strikeRef.current,
        shuttered: () =>
          built.members.filter((m) => m.form?.visible).length,
        dims: () => `${built.dims.cursor}/${built.dims.spawn.length}`,
        revise: () => `${built.revise.cursor}/${built.revise.spawn.length}`,
      };
    }
    return () => {
      setWebglActive(false);
      if (process.env.NODE_ENV !== 'production') {
        delete (window as unknown as { __pour?: unknown }).__pour;
      }
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
    // Constant-rate clock, then each clad member DRAWS its line from its start
    // joint across its DRAW_WINDOW slice — no full-frame pop-in.
    const erectTarget = s.state >= 3 || s.pour > 0 ? 1 : 0;
    let e = erectRef.current;
    if (e < erectTarget) e = Math.min(erectTarget, e + dt / ERECT_TIME);
    else if (e > erectTarget) e = Math.max(erectTarget, e - dt / STRIKE_TIME);
    erectRef.current = e;
    const erecting = e !== erectTarget;
    const staggerSpan = 1 - DRAW_WINDOW;

    // Foundations first: pads and setting-out lines are laid just ahead of the
    // columns that stand on them. Two-way cursor, so a strike un-draws the
    // floor in the same order it was set out.
    driveStream(built.footings, staggerSpan > 0 ? e / staggerSpan : e);

    for (const mv of built.members) {
      if (mv.growDir && mv.growP0) {
        const t = clamp01((e - mv.member.stagger * staggerSpan) / DRAW_WINDOW);
        mv.wire.visible = t > 0;
        if (t > 0) {
          const drawn = Math.max(mv.growLen * t, 1e-3);
          mv.wire.scale.z = drawn;
          mv.wire.position.copy(mv.growP0).addScaledVector(mv.growDir, drawn / 2);
        }
      } else {
        mv.wire.visible = e > mv.member.stagger * 0.96;
      }
    }

    const travel = frame.apexY + STAGGER_SPAN - frame.baseY;
    const eased = easeInOutCubic(clamp01(s.pour));
    const target = frame.baseY + travel * eased;
    const animating = damp(hRef, 'current', target, DAMP_TIME, dt);
    const h = hRef.current;

    // THE STRIKE — the floor of the shuttering, trailing the section front while
    // the pour runs and then closing on it once the pour has finished.
    //
    // The handoff between those two phases is LATCHED off the growth clock
    // rather than written as a constant, because where it falls is a property of
    // the reader's viewport: `pour` scrubs across one screen of travel and
    // `grow` across the whole shipped sheet, so the section front tops out
    // somewhere around a fifth of the way down a tall window and much later on a
    // short one. Two shapes that avoid the latch were measured and both fail —
    // a second absolute front ramped from the base sits frozen for a third of
    // the sheet before it overtakes the trail (8 shuttered members, unchanged,
    // from grow 0.25 to 0.60), and a band closed on the cut's own top edge
    // finishes by grow 0.45, because the cut overruns the ridge by STAGGER_SPAN
    // and so clears every member long before the clock runs out.
    if (s.pour >= 1 && handoffRef.current < 0) handoffRef.current = s.grow;
    const handoff = handoffRef.current;
    const trail = target - FORM_BAND;
    const closing =
      handoff < 0
        ? 0
        : clamp01(
            (s.grow - handoff) / Math.max(STRIKE_END - Math.max(handoff, 0), 0.08),
          );
    const strikeTarget = trail + (target + FORM_LEAD - trail) * closing;
    const striking = damp(strikeRef, 'current', strikeTarget, DAMP_TIME, dt);
    const strike = strikeRef.current;

    // Per-member: drive both clip planes + the section cap/lift line.
    for (const mv of built.members) {
      const effCut = h - mv.bias;
      mv.planeSolid.constant = effCut; // y <= effCut  (concrete)
      mv.planeWire.constant = -effCut; // y >= effCut  (wireframe)

      const lo = Math.min(mv.y0, mv.y1);
      const hi = Math.max(mv.y0, mv.y1);

      if (mv.form) {
        // Shutters lead the pour and are struck from below, so the band is
        // open at both ends and a member passes through four readable states:
        // wireframe, boxed, poured, struck.
        const formTop = effCut + FORM_LEAD;
        const effStrike = strike - mv.bias;
        mv.planeFormTop.constant = formTop;
        mv.planeFormBot.constant = -effStrike;
        // Skip the draw entirely when the band misses the member — most of the
        // frame is outside it at any moment, and this is what keeps the
        // shuttering to a handful of extra draw calls instead of one per member.
        mv.form.visible =
          e >= mv.member.stagger * staggerSpan + DRAW_WINDOW * 0.9 &&
          hi > effStrike &&
          lo < formTop;
      }

      if (!mv.cap || !mv.lift) continue;
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
      // Keystone appears once its bay's roof line has finished drawing (the
      // stagger axis is compressed by DRAW_WINDOW, matching the member loop).
      const erected =
        e > (d.bias / STAGGER_SPAN) * (1 - DRAW_WINDOW) + DRAW_WINDOW * 0.9 ||
        e >= 1;
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

    // ANNOTATION — what a draughtsman does to a set that already stands, and so
    // the beats that belong to the back half of the shipped sheet, where the
    // section front has finished and only the planting was still moving.
    //
    // Both ride raw `grow` rather than the overgrowth's monotonic front: these
    // are marks on the sheet, not growth, and a mark can be rubbed out. Scrolling
    // back up walks the same cursors down, exactly as the pour reverses.
    driveStream(built.dims, (s.grow - DIM_FROM) / (DIM_TO - DIM_FROM));
    // The cloud is the last mark the sheet takes, and only a standing sheet can
    // take it — if the reader climbs back above STATE 03 and the frame strikes,
    // the annotation goes with the thing it annotates.
    driveStream(
      built.revise,
      e < 1 ? -1 : (s.grow - REVISE_FROM) / (REVISE_TO - REVISE_FROM),
    );

    // Keep the demand loop alive only while something is still settling.
    if (animating || striking || erecting || Math.abs(h - target) > 1e-4) {
      invalidate();
    }
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
// One vine per schedule entry (12), spread across the 8 bents: a seeded bed of
// tufts plants each column foot, helices wrap the real columns and continue
// along rafters / eave girts / the ridge purlin, leaves budding behind the
// growth tip, secondary blooms opening along the run, a flower closing each
// path. Planting, leaves and secondary blooms all ride ONE spawn-ordered
// segment stream per vine, so the extra flora costs no extra draw call. Growth is
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
      // Unfogged for the same reason as the schedule diamonds: the bloom centre
      // is a live/not-live verdict, and a half-faded red would soften a claim
      // that is binary. The stems and petals around it fade normally.
      new MeshBasicMaterial({
        color: pal.graphite.clone(),
        toneMapped: false,
        fog: false,
      }),
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
      <BloomStack lit={lit} />
    </Canvas>
  );
}

/* ---------------------------------------------------------------------------
   ONE composer for the island's whole life, gated by `enabled` rather than by
   mounting and unmounting it at the ignition threshold.

   Gating by mount was the original design, and it cost twice. The library frees
   nothing on the way out, so every ignite/de-ignite cycle stranded a fresh
   multisampled buffer pair plus the bloom mip chain; the manual disposal added
   to plug that then broke the pass chain outright, because
   EffectComposer.dispose() ends with `this.passes = []`. The wrapper builds its
   RenderPass inside the useMemo that constructs the composer and only ever
   re-adds EFFECT passes afterwards, so a composer that survives a disposal —
   which is exactly what React StrictMode's double-invoked effect produces in
   development — is left holding the bloom pass and no scene pass at all. The
   band cell then renders the blur chain over nothing and reads as empty from
   the moment the first keystone ignites.

   Holding one composer removes the cause rather than the symptom: nothing
   accumulates because nothing is recreated, and no disposal hook is needed.
   When `enabled` is false the wrapper registers its frame callback at priority
   0, which hands rendering back to R3F, so an unlit set takes the same path it
   took before any of this existed. The cost is one idle buffer pair held for
   the island's lifetime, which is bounded, unlike the leak it replaces.
   ------------------------------------------------------------------------ */
function BloomStack({ lit }: { lit: boolean }) {
  return (
    // No `selection` prop: that force-adds every diamond to the bloom layer
    // (and would keep a health-failed keystone glowing at N>=2). Membership
    // is controlled per frame via mesh.layers on BLOOM_LAYER instead.
    <EffectComposer enabled={lit} autoClear={false} multisampling={4}>
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
