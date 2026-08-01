/**
 * Colour arithmetic for the Datum engine.
 *
 * Everything here is pure and browser-agnostic. The engine feeds it strings
 * straight out of getComputedStyle, and browsers keep modern colour syntax in
 * computed values, so `rgb(12 58 63 / 50%)`, `oklch(...)`, `lab(...)` and
 * `color(display-p3 ...)` all have to resolve to the same sRGB triple.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FN = /^([a-z][a-z0-9-]*)\(([\s\S]*)\)$/i;

/* ------------------------------------------------------ value tokenising */

function channel(token: string, pctScale: number): number {
  if (token === 'none') return 0;
  if (token.endsWith('%')) return (parseFloat(token) / 100) * pctScale;
  return parseFloat(token);
}

function angle(token: string): number {
  if (token === 'none') return 0;
  const v = parseFloat(token);
  if (Number.isNaN(v)) return NaN;
  if (token.endsWith('turn')) return v * 360;
  if (token.endsWith('grad')) return v * 0.9;
  if (token.endsWith('rad')) return (v * 180) / Math.PI;
  return v;
}

/** Split a function body into channel tokens plus an optional slash alpha. */
function tokenise(body: string): { parts: string[]; alpha: string | null } {
  const slash = body.indexOf('/');
  const head = slash >= 0 ? body.slice(0, slash) : body;
  const tail = slash >= 0 ? body.slice(slash + 1).trim() : '';
  const parts = head
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  return { parts, alpha: slash >= 0 ? tail || null : null };
}

/* ---------------------------------------------------- colour space maths */

type M3 = readonly (readonly [number, number, number])[];

function apply(m: M3, v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

const XYZ65_TO_LRGB: M3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const D50_TO_D65: M3 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

const LP3_TO_XYZ65: M3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.045113381858902575, 1.0439443689009757],
];

const OKLAB_TO_LMS: M3 = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];

const LMS_TO_LRGB: M3 = [
  [4.0767416360759583, -3.3077115392580629, 0.2309699031821043],
  [-1.2684379732850315, 2.6097573492876882, -0.3413193760026573],
  [-0.0041960761386756, -0.7034186179359362, 1.7076147009309444],
];

const D50_WHITE: [number, number, number] = [
  0.3457 / 0.3585,
  1,
  (1 - 0.3457 - 0.3585) / 0.3585,
];

function gammaEncode(v: number): number {
  const a = Math.abs(v);
  const s = a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
  return v < 0 ? -s : s;
}

function gammaDecode(v: number): number {
  const a = Math.abs(v);
  const s = a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
  return v < 0 ? -s : s;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

/** Gamut-clip a linear sRGB triple into the 0-255 byte space the book uses. */
function fromLinearSrgb(lin: [number, number, number], a: number): Rgb | null {
  if (lin.some((n) => !Number.isFinite(n)) || !Number.isFinite(a)) return null;
  return {
    r: clamp255(gammaEncode(lin[0]) * 255),
    g: clamp255(gammaEncode(lin[1]) * 255),
    b: clamp255(gammaEncode(lin[2]) * 255),
    a,
  };
}

function fromXyz65(xyz: [number, number, number], a: number): Rgb | null {
  return fromLinearSrgb(apply(XYZ65_TO_LRGB, xyz), a);
}

function labToXyz50(L: number, a: number, b: number): [number, number, number] {
  const E = 216 / 24389;
  const K = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = fx ** 3 > E ? fx ** 3 : (116 * fx - 16) / K;
  const y = L > K * E ? fy ** 3 : L / K;
  const z = fz ** 3 > E ? fz ** 3 : (116 * fz - 16) / K;
  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]];
}

function hslToRgb(h: number, s: number, l: number, a: number): Rgb | null {
  if ([h, s, l, a].some((n) => Number.isNaN(n))) return null;
  const sat = Math.max(0, Math.min(1, s));
  const lig = Math.max(0, Math.min(1, l));
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = sat * Math.min(lig, 1 - lig);
    return lig - c * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a };
}

/* -------------------------------------------------------------- parsing */

export function parseColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = HEX.exec(raw);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const v = h.split('').map((c) => parseInt(c + c, 16));
      return { r: v[0], g: v[1], b: v[2], a: h.length === 4 ? v[3] / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const v: number[] = [];
      for (let i = 0; i < h.length; i += 2) v.push(parseInt(h.slice(i, i + 2), 16));
      return { r: v[0], g: v[1], b: v[2], a: h.length === 8 ? v[3] / 255 : 1 };
    }
    return null;
  }

  const fn = FN.exec(lower);
  if (!fn) return null;
  const name = fn[1];
  const { parts, alpha } = tokenise(fn[2]);
  if (parts.length < 3) return null;

  const alphaToken = alpha ?? (name === 'color' ? parts[4] : parts[3]) ?? null;
  const a = alphaToken == null ? 1 : channel(alphaToken, 1);
  if (Number.isNaN(a)) return null;

  if (name === 'rgb' || name === 'rgba') {
    const r = channel(parts[0], 255);
    const g = channel(parts[1], 255);
    const b = channel(parts[2], 255);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }

  if (name === 'hsl' || name === 'hsla') {
    return hslToRgb(angle(parts[0]), channel(parts[1], 1), channel(parts[2], 1), a);
  }

  if (name === 'hwb') {
    const h = angle(parts[0]);
    let w = channel(parts[1], 1);
    let b = channel(parts[2], 1);
    if ([h, w, b].some((n) => Number.isNaN(n))) return null;
    if (w + b >= 1) {
      const grey = (w / (w + b)) * 255;
      return { r: grey, g: grey, b: grey, a };
    }
    w = Math.max(0, w);
    b = Math.max(0, b);
    const base = hslToRgb(h, 1, 0.5, 1);
    if (!base) return null;
    const mix = (v: number) => (v / 255) * (1 - w - b) * 255 + w * 255;
    return { r: mix(base.r), g: mix(base.g), b: mix(base.b), a };
  }

  if (name === 'lab' || name === 'lch') {
    const L = channel(parts[0], 100);
    let A: number;
    let B: number;
    if (name === 'lab') {
      A = channel(parts[1], 125);
      B = channel(parts[2], 125);
    } else {
      const c = channel(parts[1], 150);
      const h = angle(parts[2]);
      if (Number.isNaN(c) || Number.isNaN(h)) return null;
      A = c * Math.cos((h * Math.PI) / 180);
      B = c * Math.sin((h * Math.PI) / 180);
    }
    if ([L, A, B].some((n) => Number.isNaN(n))) return null;
    return fromXyz65(apply(D50_TO_D65, labToXyz50(L, A, B)), a);
  }

  if (name === 'oklab' || name === 'oklch') {
    const L = channel(parts[0], 1);
    let A: number;
    let B: number;
    if (name === 'oklab') {
      A = channel(parts[1], 0.4);
      B = channel(parts[2], 0.4);
    } else {
      const c = channel(parts[1], 0.4);
      const h = angle(parts[2]);
      if (Number.isNaN(c) || Number.isNaN(h)) return null;
      A = c * Math.cos((h * Math.PI) / 180);
      B = c * Math.sin((h * Math.PI) / 180);
    }
    if ([L, A, B].some((n) => Number.isNaN(n))) return null;
    const lms = apply(OKLAB_TO_LMS, [L, A, B]);
    return fromLinearSrgb(apply(LMS_TO_LRGB, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]), a);
  }

  if (name === 'color') {
    const space = parts[0];
    const v: [number, number, number] = [
      channel(parts[1], 1),
      channel(parts[2], 1),
      channel(parts[3], 1),
    ];
    if (v.some((n) => Number.isNaN(n))) return null;
    if (space === 'srgb') {
      return { r: clamp255(v[0] * 255), g: clamp255(v[1] * 255), b: clamp255(v[2] * 255), a };
    }
    if (space === 'srgb-linear') return fromLinearSrgb(v, a);
    if (space === 'display-p3') {
      const lin: [number, number, number] = [
        gammaDecode(v[0]),
        gammaDecode(v[1]),
        gammaDecode(v[2]),
      ];
      return fromXyz65(apply(LP3_TO_XYZ65, lin), a);
    }
    if (space === 'xyz' || space === 'xyz-d65') return fromXyz65(v, a);
    if (space === 'xyz-d50') return fromXyz65(apply(D50_TO_D65, v), a);
    return null;
  }

  return null;
}

const COLOUR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const BARE_HEX = /#[0-9a-f]{3,8}\b/gi;

/**
 * Pull every colour out of a compound value such as a gradient, so a ground
 * painted with background-image is measured rather than ignored.
 */
export function extractColors(value: string): Rgb[] {
  if (!value || value === 'none') return [];
  const out: Rgb[] = [];
  COLOUR_FN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOUR_FN.exec(value)) !== null) {
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < value.length; i += 1) {
      if (value[i] === '(') depth += 1;
      else if (value[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    const parsed = parseColor(value.slice(m.index, end + 1));
    if (parsed) out.push(parsed);
    COLOUR_FN.lastIndex = end;
  }
  BARE_HEX.lastIndex = 0;
  let h: RegExpExecArray | null;
  while ((h = BARE_HEX.exec(value)) !== null) {
    const parsed = parseColor(h[0]);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function isHex(value: string): boolean {
  return /^#([0-9a-f]{6})$/i.test(value.trim());
}

export function toHex(c: Rgb): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`.toUpperCase();
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG 2.1 contrast ratio, always >= 1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Straight Euclidean distance in RGB. Crude on purpose: it is the metric the book states. */
export function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Source-over composite of a translucent colour on an opaque one. */
export function composite(fg: Rgb, bg: Rgb): Rgb {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

export function hexToRgb(hex: string): Rgb {
  return parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
}
