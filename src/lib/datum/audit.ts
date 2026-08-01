/**
 * The Datum engine.
 *
 * It reads painted reality: every number below comes out of getComputedStyle
 * and getBoundingClientRect on the live nodes inside the stage. It imports the
 * book and the colour maths and nothing else. No composition identity is ever
 * in scope here, and no rule branches on one, which is the whole point: a
 * net-new layout built out of the book has to score as well as the safe one,
 * because the engine cannot tell them apart.
 */

import {
  GROUPS,
  SPEC,
  verdictFor,
  type GroupId,
  type PaletteToken,
  type RoleRule,
  type Spec,
} from './spec';
import {
  composite,
  contrastRatio,
  extractColors,
  parseColor,
  rgbDistance,
  toHex,
  type Rgb,
} from './color';

export type Status = 'pass' | 'drift' | 'fail';

export interface Observation {
  group: GroupId;
  element: HTMLElement;
  property: string;
  value: string;
  nearest: string;
  distance: number | null;
  credit: number;
  status: Status;
  note: string | null;
}

export interface GroupResult {
  id: GroupId;
  label: string;
  mono: string;
  weight: number;
  sampled: boolean;
  count: number;
  creditSum: number;
  score: number;
  failing: number;
  observations: Observation[];
}

export interface Touched {
  palette: string[];
  sizes: number[];
  weights: number[];
  spacing: number[];
  radius: string[];
  durations: number[];
}

export interface AuditResult {
  groups: GroupResult[];
  byId: Record<GroupId, GroupResult>;
  overall: number;
  verdict: string;
  verdictTone: Status;
  summary: string;
  measurements: number;
  nodes: number;
  elapsedMs: number;
  failing: number;
  redistributed: GroupId[];
  touched: Touched;
}

interface Node {
  el: HTMLElement;
  cs: CSSStyleDeclaration;
  rect: DOMRect;
  /** Element opacity multiplied all the way up to the stage root. */
  alpha: number;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SPACING_BOX = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'row-gap',
  'column-gap',
];

/* ---------------------------------------------------------------- helpers */

function statusFor(credit: number): Status {
  if (credit >= 0.9995) return 'pass';
  if (credit > 0) return 'drift';
  return 'fail';
}

function hasOwnText(el: Element): boolean {
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const n = el.childNodes[i];
    if (n.nodeType === 3 && (n.textContent ?? '').trim().length > 0) return true;
  }
  return false;
}

function firstFamily(value: string): string {
  const head = value.split(',')[0] ?? '';
  return head.trim().replace(/^["']|["']$/g, '').toLowerCase();
}

interface Families {
  display: string;
  mono: string;
}

/**
 * next/font emits a hashed family name, so the book's two families have to be
 * resolved off the document element before any node is compared to them.
 */
function resolveFamilies(): Families {
  const cs = getComputedStyle(document.documentElement);
  return {
    display: firstFamily(cs.getPropertyValue('--font-archivo')),
    mono: firstFamily(cs.getPropertyValue('--font-martian')),
  };
}

function classifyFamily(name: string, fams: Families): 'display' | 'mono' | 'other' {
  if (name && fams.mono && name === fams.mono) return 'mono';
  if (name && fams.display && name === fams.display) return 'display';
  if (name.includes('martian')) return 'mono';
  if (name.includes('archivo')) return 'display';
  return 'other';
}

function nearestToken(spec: Spec, rgb: Rgb): { token: PaletteToken; distance: number } {
  let best = spec.palette.tokens[0];
  let bestD = Infinity;
  for (const t of spec.palette.tokens) {
    const d = rgbDistance(rgb, t.rgb);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return { token: best, distance: bestD };
}

function nearestStep(steps: number[], value: number): { step: number; delta: number } {
  let step = steps[0];
  let delta = Infinity;
  for (const s of steps) {
    const d = Math.abs(value - s);
    if (d < delta) {
      delta = d;
      step = s;
    }
  }
  return { step, delta };
}

function opacityOf(cs: CSSStyleDeclaration): number {
  const v = parseFloat(cs.opacity);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** Element opacity multiplied all the way up to the stage root. */
function chainAlpha(el: HTMLElement, root: HTMLElement): number {
  let mult = 1;
  let cur: HTMLElement | null = el;
  while (cur) {
    mult *= opacityOf(getComputedStyle(cur));
    if (mult <= 0) return 0;
    if (cur === root) break;
    cur = cur.parentElement;
  }
  return mult;
}

/**
 * A painted image is a ground like any other, so its stops are averaged by
 * coverage into one layer rather than left invisible to the walk.
 */
function imageLayer(value: string): Rgb | null {
  const stops = extractColors(value);
  if (stops.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let cover = 0;
  for (const c of stops) {
    r += c.r * c.a;
    g += c.g * c.a;
    b += c.b * c.a;
    cover += c.a;
  }
  if (cover <= 0) return null;
  return { r: r / cover, g: g / cover, b: b / cover, a: cover / stops.length };
}

/**
 * Paint the ancestor chain root-first: background colour, painted image and
 * element opacity all decide the ground a text colour actually sits on.
 */
function effectiveBackground(el: HTMLElement, root: HTMLElement, fallback: Rgb): Rgb {
  const chain: CSSStyleDeclaration[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    chain.push(getComputedStyle(cur));
    if (cur === root) break;
    cur = cur.parentElement;
  }
  let ground = fallback;
  let mult = 1;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const cs = chain[i];
    mult *= opacityOf(cs);
    if (mult <= 0) break;
    const bc = parseColor(cs.backgroundColor);
    if (bc && bc.a > 0) ground = composite({ ...bc, a: bc.a * mult }, ground);
    const img = imageLayer(cs.backgroundImage);
    if (img && img.a > 0) ground = composite({ ...img, a: img.a * mult }, ground);
  }
  return ground;
}

/** Split a CSS list on top-level commas, so cubic-bezier(...) survives intact. */
function splitList(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function durationMs(value: string): number {
  const v = value.trim();
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return parseFloat(v);
}

const KEYWORD_CURVES: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function curvePoints(value: string): [number, number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (KEYWORD_CURVES[v]) return KEYWORD_CURVES[v];
  const m = /^cubic-bezier\(([^)]*)\)$/.exec(v);
  if (!m) return null;
  const nums = m[1].split(',').map((p) => parseFloat(p));
  if (nums.length !== 4 || nums.some((n) => Number.isNaN(n))) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

function sameCurve(a: [number, number, number, number], b: [number, number, number, number], tol: number) {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

function resolveRadius(value: string, spec: Spec): { label: string; ok: boolean } {
  const head = value.trim().split(/\s+/)[0] ?? '0px';
  if (head.endsWith('%')) {
    const pct = parseFloat(head);
    return pct >= 50 ? { label: 'pill', ok: true } : { label: head, ok: false };
  }
  const px = parseFloat(head);
  if (Number.isNaN(px)) return { label: head, ok: false };
  if (px >= spec.radius.pillFloor) return { label: 'pill', ok: true };
  const hit = spec.radius.allowed.some((a) => Math.abs(a - px) <= 0.5);
  return { label: `${round(px)}px`, ok: hit };
}

function round(n: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

const WORDS = [
  'Nothing',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

function countWord(n: number): string {
  return n < WORDS.length ? WORDS[n] : String(n);
}

/* ------------------------------------------------------------------ audit */

export function audit(root: HTMLElement, spec: Spec = SPEC): AuditResult {
  const t0 = performance.now();
  const obs: Observation[] = [];
  const fams = resolveFamilies();
  const rootRect = root.getBoundingClientRect();
  const rootBg = parseColor(getComputedStyle(root).backgroundColor);
  const fallbackBg: Rgb =
    rootBg && rootBg.a >= 1 ? rootBg : { r: 255, g: 255, b: 255, a: 1 };

  const touched: Touched = {
    palette: [],
    sizes: [],
    weights: [],
    spacing: [],
    radius: [],
    durations: [],
  };
  const touch = <T,>(list: T[], value: T) => {
    if (!list.includes(value)) list.push(value);
  };

  // Walk the stage only, and only real HTML boxes. SVG marks inside a
  // composition are drawing, not layout, and carry no measurable book value.
  const candidates: HTMLElement[] = [root];
  root.querySelectorAll('*').forEach((el) => {
    if (el instanceof HTMLElement) candidates.push(el);
  });

  const nodes: Node[] = [];
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Opacity is a paint switch, not a style: nothing at zero is on the page.
    const alpha = chainAlpha(el, root);
    if (alpha <= 0) continue;
    nodes.push({ el, cs, rect, alpha });
  }

  const push = (o: Observation) => {
    obs.push(o);
  };

  const pushColour = (el: HTMLElement, property: string, rgb: Rgb) => {
    const { token, distance } = nearestToken(spec, rgb);
    let credit: number;
    if (distance <= spec.palette.matchMax) credit = 1;
    else if (distance <= spec.palette.driftMax) credit = 1 - distance / spec.palette.driftMax;
    else credit = 0;
    if (credit >= 1) touch(touched.palette, token.name);
    push({
      group: 'paletteExactness',
      element: el,
      property,
      value: toHex(rgb),
      nearest: `${token.name} ${token.hex}`,
      distance: round(distance, 1),
      credit,
      status: statusFor(credit),
      note: credit >= 1 ? null : `d ${round(distance, 1)} from ${token.name}`,
    });
  };

  const pushRole = (el: HTMLElement, rule: RoleRule, property: string, tokenName: string, bgToken: string, ok: boolean) => {
    push({
      group: 'paletteRoles',
      element: el,
      property: `${rule.id} ${property}`,
      value: `${tokenName} on ${bgToken}`,
      nearest: rule.line,
      distance: null,
      credit: ok ? 1 : 0,
      status: ok ? 'pass' : 'fail',
      note: ok ? null : rule.line,
    });
  };

  /**
   * A colour the parser cannot read is not a pass and not a silence: it is a
   * value that is provably not one of the eight, so it is scored as one.
   */
  const pushUnreadable = (el: HTMLElement, property: string, raw: string) => {
    push({
      group: 'paletteExactness',
      element: el,
      property,
      value: raw.trim().slice(0, 40),
      nearest: 'a book token',
      distance: null,
      credit: 0,
      status: 'fail',
      note: 'this value does not resolve to a colour the book knows',
    });
  };

  /** True when the string names a colour the engine could not resolve. */
  const unreadable = (raw: string): boolean => {
    const v = raw.trim();
    if (!v || v === 'none' || v === 'currentcolor') return false;
    return parseColor(v) === null;
  };

  let accentFills = 0;
  let accentFillEl: HTMLElement | null = null;

  for (const node of nodes) {
    const { el, cs } = node;

    /* --- fills ------------------------------------------------------- */
    const bg = parseColor(cs.backgroundColor);
    const bgUnreadable = unreadable(cs.backgroundColor);
    const image = cs.backgroundImage;
    const stops = image && image !== 'none' ? extractColors(image) : [];
    let hasFill = (!!bg && bg.a > 0) || bgUnreadable || (!!image && image !== 'none');
    // R5 counts elements, not stops: an element is one accent fill or none.
    let accentHere = false;
    // The quota only counts what the book recognises as its accent, on the same
    // match distance every other role rule uses.
    const countsAsAccent = (c: Rgb) => {
      const near = nearestToken(spec, c);
      return near.distance <= spec.palette.matchMax && near.token.isAccent;
    };

    if (bg && bg.a > 0) {
      pushColour(el, 'background-color', bg);
      if (countsAsAccent(bg)) accentHere = true;
    } else if (bgUnreadable) {
      pushUnreadable(el, 'background-color', cs.backgroundColor);
    }

    // A painted image is a fill too, so every stop is measured against the book.
    if (image && image !== 'none') {
      const seenStops: string[] = [];
      for (const stop of stops) {
        if (stop.a <= 0) continue;
        const key = toHex(stop);
        if (seenStops.includes(key)) continue;
        seenStops.push(key);
        pushColour(el, 'background-image', stop);
        if (countsAsAccent(stop)) accentHere = true;
      }
      if (seenStops.length === 0) {
        pushUnreadable(el, 'background-image', image);
        hasFill = true;
      }
    }

    if (accentHere) {
      accentFills += 1;
      if (!accentFillEl) accentFillEl = el;
    }

    /* --- borders ----------------------------------------------------- */
    const borderColours: string[] = [];
    let hasBorder = false;
    for (const side of SIDES) {
      const w = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      const style = cs.getPropertyValue(`border-${side}-style`);
      if (!(w > 0) || style === 'none' || style === 'hidden') continue;
      hasBorder = true;
      const c = cs.getPropertyValue(`border-${side}-color`);
      if (c && !borderColours.includes(c)) borderColours.push(c);
    }
    const bgForRoles = effectiveBackground(el, root, fallbackBg);
    const bgTokenName = nearestToken(spec, bgForRoles);
    for (const raw of borderColours) {
      const c = parseColor(raw);
      if (!c) {
        if (unreadable(raw)) pushUnreadable(el, 'border-color', raw);
        continue;
      }
      if (c.a <= 0) continue;
      pushColour(el, 'border-color', c);
      const near = nearestToken(spec, c);
      // A role rule fires on anything still recognisable as the token, so
      // nudging a colour off the exact hex cannot buy immunity from it.
      if (near.distance <= spec.palette.driftMax) {
        for (const rule of spec.roles.rules) {
          if (rule.scope !== 'text-or-border') continue;
          if (!rule.tokens.includes(near.token.name)) continue;
          const onListed =
            bgTokenName.distance <= spec.palette.driftMax &&
            rule.backgrounds.includes(bgTokenName.token.name);
          const ok =
            rule.mode === 'forbid' ? false : rule.mode === 'require-bg' ? onListed : !onListed;
          pushRole(el, rule, 'border', near.token.name, bgTokenName.token.name, ok);
        }
      }
    }

    /* --- radius, only where a box is actually drawn ------------------- */
    if (hasFill || hasBorder) {
      const corners = [
        cs.borderTopLeftRadius,
        cs.borderTopRightRadius,
        cs.borderBottomRightRadius,
        cs.borderBottomLeftRadius,
      ].map((v) => resolveRadius(v, spec));
      const bad = corners.find((c) => !c.ok);
      const label = corners.every((c) => c.label === corners[0].label)
        ? corners[0].label
        : corners.map((c) => c.label).join(' ');
      if (!bad) touch(touched.radius, corners[0].label);
      push({
        group: 'radius',
        element: el,
        property: 'border-radius',
        value: label,
        nearest: spec.radius.allowed.map((a) => `${a}`).join(' / ') + ' / pill',
        distance: null,
        credit: bad ? 0 : 1,
        status: bad ? 'fail' : 'pass',
        note: bad ? `${bad.label} is not a book radius` : null,
      });
    }

    /* --- text-scoped rules ------------------------------------------- */
    if (hasOwnText(el)) {
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const family = classifyFamily(firstFamily(cs.fontFamily), fams);
      const colour = parseColor(cs.color);

      if (!colour && unreadable(cs.color)) pushUnreadable(el, 'color', cs.color);

      if (colour && colour.a > 0) {
        pushColour(el, 'color', colour);
        const near = nearestToken(spec, colour);
        if (near.distance <= spec.palette.driftMax) {
          for (const rule of spec.roles.rules) {
            if (!rule.tokens.includes(near.token.name)) continue;
            const onListed =
              bgTokenName.distance <= spec.palette.driftMax &&
              rule.backgrounds.includes(bgTokenName.token.name);
            let ok: boolean;
            if (rule.mode === 'forbid') ok = false;
            else if (rule.mode === 'require-bg') ok = onListed;
            else ok = !onListed;
            pushRole(el, rule, 'text', near.token.name, bgTokenName.token.name, ok);
          }
        }

        const ground = bgForRoles;
        // Element opacity thins the ink as surely as an alpha channel does.
        const painted = colour.a * node.alpha;
        const fg = painted < 1 ? composite({ ...colour, a: painted }, ground) : colour;
        const ratio = contrastRatio(fg, ground);
        const floor = size >= spec.contrast.largeFloorSize ? spec.contrast.large : spec.contrast.small;
        // A ratio can never fall below 1, so credit is measured across the range
        // the floor actually spans. Text at 1:1 is invisible and scores zero.
        const credit = ratio >= floor ? 1 : Math.max(0, (ratio - 1) / (floor - 1));
        push({
          group: 'contrast',
          element: el,
          property: `contrast ${size >= spec.contrast.largeFloorSize ? 'large' : 'small'}`,
          value: `${round(ratio, 2).toFixed(2)}:1`,
          nearest: `${floor.toFixed(1)}:1`,
          distance: round(Math.max(0, floor - ratio), 2),
          credit,
          status: statusFor(credit),
          note: credit >= 1 ? null : `${round(ratio, 2).toFixed(2)}:1 against a ${floor.toFixed(1)} floor`,
        });
      }

      // size
      const { step, delta } = nearestStep(spec.type.sizes, size);
      const sizeCredit =
        delta <= spec.type.exactTolerance ? 1 : delta <= spec.type.halfTolerance ? 0.5 : 0;
      if (sizeCredit >= 1) touch(touched.sizes, step);
      push({
        group: 'typography',
        element: el,
        property: 'font-size',
        value: `${round(size, 1)}px`,
        nearest: `${step}px`,
        distance: round(delta, 1),
        credit: sizeCredit,
        status: statusFor(sizeCredit),
        note: sizeCredit >= 1 ? null : `d ${round(delta, 1)} from ${step}`,
      });

      // weight
      const weightOk = spec.type.weights.includes(weight);
      if (weightOk) touch(touched.weights, weight);
      push({
        group: 'typography',
        element: el,
        property: 'font-weight',
        value: `${weight}`,
        nearest: spec.type.weights.join(' / '),
        distance: null,
        credit: weightOk ? 1 : 0,
        status: weightOk ? 'pass' : 'fail',
        note: weightOk ? null : `${weight} is not a book weight`,
      });

      // family
      push({
        group: 'typography',
        element: el,
        property: 'font-family',
        value:
          family === 'other'
            ? firstFamily(cs.fontFamily) || 'unknown'
            : family === 'mono'
              ? spec.type.families.mono
              : spec.type.families.display,
        nearest: `${spec.type.families.display} / ${spec.type.families.mono}`,
        distance: null,
        credit: family === 'other' ? 0 : 1,
        status: family === 'other' ? 'fail' : 'pass',
        note: family === 'other' ? 'a third family' : null,
      });

      // T1: the mono voice is quarantined to the two smallest steps.
      if (family === 'mono') {
        const ok = spec.type.monoSizes.some((s) => Math.abs(size - s) <= spec.type.exactTolerance);
        push({
          group: 'typography',
          element: el,
          property: 'T1 mono size',
          value: `${round(size, 1)}px`,
          nearest: spec.type.monoSizes.map((s) => `${s}px`).join(' / '),
          distance: null,
          credit: ok ? 1 : 0,
          status: ok ? 'pass' : 'fail',
          note: ok ? null : `${spec.type.families.mono} is not carried at ${round(size, 1)}`,
        });
      }

      // T2: display sizes are always the heavy weight.
      if (size >= spec.type.boldFloor) {
        const ok = weight === 700;
        push({
          group: 'typography',
          element: el,
          property: 'T2 display weight',
          value: `${weight} at ${round(size, 1)}px`,
          nearest: `700 at ${spec.type.boldFloor}px and above`,
          distance: null,
          credit: ok ? 1 : 0,
          status: ok ? 'pass' : 'fail',
          note: ok ? null : `${round(size, 1)}px asks for 700`,
        });
      }
    }

    /* --- spacing ------------------------------------------------------ */
    for (const property of SPACING_BOX) {
      const raw = cs.getPropertyValue(property);
      if (!raw || !raw.endsWith('px')) continue;
      const value = parseFloat(raw);
      if (!Number.isFinite(value) || value === 0) continue;
      const { step, delta } = nearestStep(spec.spacing.steps, Math.abs(value));
      const credit =
        delta <= spec.spacing.exactTolerance ? 1 : delta <= spec.spacing.halfTolerance ? 0.5 : 0;
      if (credit >= 1) touch(touched.spacing, step);
      push({
        group: 'spacing',
        element: el,
        property,
        value: `${round(value, 1)}px`,
        nearest: `${step}px`,
        distance: round(delta, 1),
        credit,
        status: statusFor(credit),
        note: credit >= 1 ? null : `d ${round(delta, 1)} from ${step}`,
      });
    }

    /* --- motion ------------------------------------------------------- */
    const durations = splitList(cs.transitionDuration).map(durationMs);
    if (durations.some((d) => d > 0)) {
      const props = splitList(cs.transitionProperty);
      const curves = splitList(cs.transitionTimingFunction);
      const live = durations
        .map((d, i) => ({ d, i }))
        .filter((entry) => entry.d > 0);

      const badDuration = live.find(
        (entry) => !spec.motion.durations.some((allowed) => Math.abs(allowed - entry.d) < 1),
      );
      if (!badDuration) live.forEach((entry) => touch(touched.durations, Math.round(entry.d)));
      push({
        group: 'motion',
        element: el,
        property: 'M1 duration',
        value: live.map((entry) => `${Math.round(entry.d)}ms`).join(' / '),
        nearest: spec.motion.durations.map((d) => `${d}ms`).join(' / '),
        distance: null,
        credit: badDuration ? 0 : 1,
        status: badDuration ? 'fail' : 'pass',
        note: badDuration ? `${Math.round(badDuration.d)}ms is off the book` : null,
      });

      const propNames = live.map((entry) => props[entry.i] ?? props[0] ?? 'all');
      const badProp = propNames.find((p) => !spec.motion.properties.includes(p));
      push({
        group: 'motion',
        element: el,
        property: 'M3 property',
        value: propNames.join(' / '),
        nearest: spec.motion.properties.join(' / '),
        distance: null,
        credit: badProp ? 0 : 1,
        status: badProp ? 'fail' : 'pass',
        note: badProp ? `${badProp} is not a transitionable property here` : null,
      });

      const onlyOpacity = propNames.every((p) => p === spec.motion.linearOnly);
      const badCurve = live.find((entry) => {
        const pts = curvePoints(curves[entry.i] ?? curves[0] ?? 'ease');
        if (!pts) return true;
        if (sameCurve(pts, spec.motion.curve.points, spec.motion.tolerance)) return false;
        return !(onlyOpacity && sameCurve(pts, KEYWORD_CURVES.linear, spec.motion.tolerance));
      });
      push({
        group: 'motion',
        element: el,
        property: 'M2 curve',
        value: live.map((entry) => curves[entry.i] ?? curves[0] ?? 'ease').join(' / '),
        nearest: spec.motion.curve.name,
        distance: null,
        credit: badCurve ? 0 : 1,
        status: badCurve ? 'fail' : 'pass',
        note: badCurve ? 'not the arrive curve' : null,
      });
    }
  }

  /* --- the accent fill quota, one composition-level observation ------- */
  if (accentFills > 0 && accentFillEl) {
    const ok = accentFills <= spec.roles.fillQuota.max;
    push({
      group: 'paletteRoles',
      element: accentFillEl,
      property: 'R5 accent fills',
      value: `${accentFills}`,
      nearest: `${spec.roles.fillQuota.max}`,
      distance: null,
      credit: ok ? 1 : 0,
      status: ok ? 'pass' : 'fail',
      note: ok ? null : spec.roles.fillQuota.line,
    });
  }

  /* --- alignment: an edge census -------------------------------------- */
  const edges: { el: HTMLElement; x: number }[] = [];
  for (const node of nodes) {
    const display = node.cs.display;
    if (display !== 'block' && display !== 'flex' && display !== 'grid') continue;
    if (node.rect.width <= 0) continue;
    edges.push({ el: node.el, x: node.rect.left - rootRect.left });
  }

  let alignmentScore: number | null = null;
  if (edges.length > 0) {
    const sorted = [...edges].sort((a, b) => a.x - b.x);
    const clusters: { x: number; members: { el: HTMLElement; x: number }[] }[] = [];
    for (const edge of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(edge.x - last.x) <= spec.alignment.clusterTolerance) {
        last.members.push(edge);
        continue;
      }
      clusters.push({ x: edge.x, members: [edge] });
    }
    const grid = [...clusters]
      .sort((a, b) => b.members.length - a.members.length || a.x - b.x)
      .slice(0, spec.alignment.gridClusters)
      .map((c) => c.x)
      .sort((a, b) => a - b);

    let inGrid = 0;
    for (const edge of edges) {
      const hit = grid.some((g) => Math.abs(edge.x - g) <= spec.alignment.clusterTolerance);
      if (hit) inGrid += 1;
      push({
        group: 'alignment',
        element: edge.el,
        property: 'left-edge',
        value: `${round(edge.x)}px`,
        nearest: grid.map((g) => `${round(g)}px`).join(' / '),
        distance: null,
        credit: hit ? 1 : 0,
        status: hit ? 'pass' : 'fail',
        note: hit ? null : 'off the three lines',
      });
    }

    let legalGaps = 0;
    let checkedGaps = 0;
    for (let i = 1; i < grid.length; i += 1) {
      const gap = grid[i] - grid[i - 1];
      checkedGaps += 1;
      const { step, delta } = nearestStep(spec.spacing.steps, gap);
      const ok = delta <= 1;
      if (ok) legalGaps += 1;
      push({
        group: 'alignment',
        element: root,
        property: 'grid-gap',
        value: `${round(gap)}px`,
        nearest: `${step}px`,
        distance: round(delta, 1),
        credit: ok ? 1 : 0,
        status: ok ? 'pass' : 'fail',
        note: ok ? null : `${round(gap)} between lines is not a spacing step`,
      });
    }

    // The rule asks for a set number of lines. A composition that never draws
    // them cannot pass by having nothing to fall outside of, so every line the
    // book expects and does not get is counted as a gap that was never met.
    const missingLines = Math.max(0, spec.alignment.gridClusters - clusters.length);
    if (missingLines > 0) {
      checkedGaps += missingLines;
      push({
        group: 'alignment',
        element: root,
        property: 'grid-lines',
        value: `${clusters.length}`,
        nearest: `${spec.alignment.gridClusters}`,
        distance: null,
        credit: 0,
        status: 'fail',
        note: `${clusters.length} left ${
          clusters.length === 1 ? 'line' : 'lines'
        }, the book asks for ${spec.alignment.gridClusters}`,
      });
    }

    const edgeRatio = inGrid / edges.length;
    const gapRatio = checkedGaps > 0 ? legalGaps / checkedGaps : null;
    alignmentScore =
      gapRatio === null
        ? edgeRatio * 100
        : (spec.alignment.edgeWeight * edgeRatio + spec.alignment.gapWeight * gapRatio) * 100;
  }

  /* --- assemble -------------------------------------------------------- */
  const groups: GroupResult[] = GROUPS.map((g) => {
    const list = obs.filter((o) => o.group === g.id);
    const creditSum = list.reduce((a, o) => a + o.credit, 0);
    const sampled = list.length > 0;
    let score = sampled ? (creditSum / list.length) * 100 : 0;
    if (g.id === 'alignment' && alignmentScore !== null) score = alignmentScore;
    return {
      id: g.id,
      label: g.label,
      mono: g.mono,
      weight: spec.weights[g.id],
      sampled,
      count: list.length,
      creditSum,
      score,
      failing: list.filter((o) => o.credit < 1).length,
      observations: list,
    };
  });

  const byId = groups.reduce(
    (acc, g) => {
      acc[g.id] = g;
      return acc;
    },
    {} as Record<GroupId, GroupResult>,
  );

  const sampledGroups = groups.filter((g) => g.sampled);
  const weightSum = sampledGroups.reduce((a, g) => a + g.weight, 0);
  const overall =
    weightSum > 0 ? sampledGroups.reduce((a, g) => a + g.weight * g.score, 0) / weightSum : 0;
  const { word, tone } = verdictFor(overall);

  const failing = obs.filter((o) => o.credit < 1).length;
  const worst = sampledGroups.reduce<GroupResult | null>(
    (a, g) => (a === null || g.score < a.score ? g : a),
    null,
  );

  const summary =
    failing === 0
      ? 'Nothing sits outside the book, on every dimension the instrument can reach.'
      : `${countWord(failing)} ${failing === 1 ? 'measurement' : 'measurements'} outside the book, the worst of it in ${
          worst ? worst.label.toLowerCase() : 'the composition'
        }.`;

  return {
    groups,
    byId,
    overall,
    verdict: word,
    verdictTone: tone,
    summary,
    measurements: obs.length,
    nodes: nodes.length,
    elapsedMs: performance.now() - t0,
    failing,
    redistributed: groups.filter((g) => !g.sampled).map((g) => g.id),
    touched,
  };
}
