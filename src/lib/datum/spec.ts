/**
 * The Coastwise book: one frozen object that is the only ground truth in the
 * system. Every number the engine compares against, and every number the spec
 * panel prints, is read from here. Nothing about any particular composition
 * appears in this file, and nothing in this file knows a composition exists.
 */

import { contrastRatio, hexToRgb, type Rgb } from './color';

export type GroupId =
  | 'contrast'
  | 'typography'
  | 'paletteExactness'
  | 'spacing'
  | 'paletteRoles'
  | 'alignment'
  | 'radius'
  | 'motion';

export interface PaletteToken {
  name: string;
  hex: string;
  rgb: Rgb;
  role: string;
  usage: string;
  isAccent: boolean;
}

export interface RoleRule {
  id: string;
  tokens: string[];
  /** Where the rule looks: text colours only, or text and border colours. */
  scope: 'text' | 'text-or-border';
  /** forbid: the token may never appear here. require-bg / forbid-bg gate on the ground behind it. */
  mode: 'forbid' | 'require-bg' | 'forbid-bg';
  backgrounds: string[];
  line: string;
}

export interface Spec {
  client: string;
  book: string;
  palette: {
    tokens: PaletteToken[];
    matchMax: number;
    driftMax: number;
  };
  roles: {
    rules: RoleRule[];
    fillQuota: { role: string; max: number; line: string };
  };
  type: {
    sizes: number[];
    weights: number[];
    monoSizes: number[];
    boldFloor: number;
    exactTolerance: number;
    halfTolerance: number;
    families: { display: string; mono: string };
    note: string;
  };
  spacing: {
    steps: number[];
    exactTolerance: number;
    halfTolerance: number;
    note: string;
  };
  radius: {
    allowed: number[];
    pillFloor: number;
    line: string;
  };
  contrast: {
    small: number;
    large: number;
    largeFloorSize: number;
  };
  motion: {
    durations: number[];
    curve: { name: string; points: [number, number, number, number] };
    properties: string[];
    linearOnly: string;
    tolerance: number;
  };
  alignment: {
    clusterTolerance: number;
    gridClusters: number;
    edgeWeight: number;
    gapWeight: number;
    line: string;
  };
  weights: Record<GroupId, number>;
  bands: { floor: number; word: string; tone: 'pass' | 'drift' | 'fail' }[];
}

const token = (
  name: string,
  hex: string,
  role: string,
  usage: string,
  isAccent = false,
): PaletteToken => ({ name, hex, rgb: hexToRgb(hex), role, usage, isAccent });

const BOOK: Spec = {
  client: 'COASTWISE',
  book: 'BOOK v1',
  palette: {
    tokens: [
      token('tide', '#0C3A3F', 'ink', 'text on light surfaces, dark surface fill'),
      token('slate', '#52706F', 'muted', 'secondary text on chalk or paper, hairlines'),
      token('chalk', '#F2EFE6', 'ground', 'page background only'),
      token('paper', '#FCFAF4', 'surface', 'cards and raised panels, text on tide or signal'),
      token('signal', '#C43C1B', 'accent, light', 'primary action fill, rules and marks', true),
      token('beacon', '#E39A5C', 'accent, dark', 'text, border and marks on tide only', true),
      token('haze', '#D8D3C6', 'rule', 'borders and dividers only, never text'),
      token('mist', '#A7BFBD', 'muted, inverted', 'captions and labels on tide only'),
    ],
    matchMax: 2,
    driftMax: 24,
  },
  roles: {
    rules: [
      {
        id: 'R1',
        tokens: ['haze'],
        scope: 'text',
        mode: 'forbid',
        backgrounds: [],
        line: 'haze may never be a text colour',
      },
      {
        id: 'R2',
        tokens: ['mist', 'beacon'],
        scope: 'text-or-border',
        mode: 'require-bg',
        backgrounds: ['tide'],
        line: 'mist and beacon carry text or border only on tide',
      },
      {
        id: 'R3',
        tokens: ['slate'],
        scope: 'text',
        mode: 'require-bg',
        backgrounds: ['chalk', 'paper'],
        line: 'slate carries text only on chalk or paper',
      },
      {
        id: 'R4',
        tokens: ['signal'],
        scope: 'text',
        mode: 'forbid-bg',
        backgrounds: ['tide'],
        line: 'signal never carries text on tide',
      },
    ],
    fillQuota: { role: 'accent', max: 1, line: 'an accent fills at most one element' },
  },
  type: {
    sizes: [12, 14, 16, 20, 26, 34, 46, 62],
    weights: [400, 500, 700],
    monoSizes: [12, 14],
    boldFloor: 34,
    exactTolerance: 0.5,
    halfTolerance: 2,
    families: { display: 'Archivo', mono: 'Martian Mono' },
    note: 'Every size is a discrete token. Narrow widths step down to a lower member of this set, never to a value between them.',
  },
  spacing: {
    steps: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
    exactTolerance: 0,
    halfTolerance: 4,
    note: 'Padding, gap and margin. Border widths sit outside the scale, so a 2px hairline is never counted against it.',
  },
  radius: {
    allowed: [0, 2, 10],
    pillFloor: 500,
    line: 'surfaces are 10, structure is 0, controls are 2 or pill',
  },
  contrast: {
    small: 4.5,
    large: 3,
    largeFloorSize: 26,
  },
  motion: {
    durations: [120, 220, 400],
    curve: { name: 'arrive', points: [0.2, 0, 0, 1] },
    properties: ['transform', 'opacity'],
    linearOnly: 'opacity',
    tolerance: 0.005,
  },
  alignment: {
    clusterTolerance: 1,
    gridClusters: 3,
    edgeWeight: 0.7,
    gapWeight: 0.3,
    line: 'Left edges cluster into three lines, and the distance between them is a spacing step.',
  },
  weights: {
    contrast: 18,
    typography: 18,
    paletteExactness: 16,
    spacing: 16,
    paletteRoles: 10,
    alignment: 10,
    radius: 6,
    motion: 6,
  },
  bands: [
    { floor: 95, word: 'IN THE SYSTEM', tone: 'pass' },
    { floor: 80, word: 'CLOSE, WITH A NOTE', tone: 'drift' },
    { floor: 60, word: 'DRIFTING', tone: 'drift' },
    { floor: 0, word: 'OFF THE BRAND', tone: 'fail' },
  ],
};

/** Freeze the whole tree, so the book cannot be edited between runs. */
function deepFreeze<T>(value: T): T {
  if (value && (typeof value === 'object' || typeof value === 'function')) {
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze((value as Record<string, unknown>)[key]);
    });
    Object.freeze(value);
  }
  return value;
}

export const SPEC: Spec = deepFreeze(BOOK);

export const GROUPS: { id: GroupId; label: string; mono: string }[] = [
  { id: 'contrast', label: 'Contrast', mono: 'CONTRAST' },
  { id: 'typography', label: 'Typography', mono: 'TYPOGRAPHY' },
  { id: 'paletteExactness', label: 'Palette exactness', mono: 'PALETTE EXACT' },
  { id: 'spacing', label: 'Spacing', mono: 'SPACING' },
  { id: 'paletteRoles', label: 'Palette roles', mono: 'PALETTE ROLES' },
  { id: 'alignment', label: 'Alignment', mono: 'ALIGNMENT' },
  { id: 'radius', label: 'Radius', mono: 'RADIUS' },
  { id: 'motion', label: 'Motion', mono: 'MOTION' },
];

/**
 * One row per rule the engine can actually evaluate. The status bar counts this
 * array rather than carrying a number, so adding a rule updates the readout.
 */
export const RULE_INDEX: { id: string; group: GroupId; line: string }[] = [
  { id: 'P1', group: 'paletteExactness', line: 'every colour resolves to a book token' },
  ...SPEC.roles.rules.map((r) => ({ id: r.id, group: 'paletteRoles' as GroupId, line: r.line })),
  {
    id: 'R5',
    group: 'paletteRoles',
    line: SPEC.roles.fillQuota.line,
  },
  { id: 'T-SIZE', group: 'typography', line: 'every size is a step on the scale' },
  { id: 'T-WEIGHT', group: 'typography', line: 'every weight is 400, 500 or 700' },
  { id: 'T-FAMILY', group: 'typography', line: 'two families, no third' },
  { id: 'T1', group: 'typography', line: 'Martian Mono only at 12 and 14' },
  { id: 'T2', group: 'typography', line: '34 and above is always 700' },
  { id: 'S1', group: 'spacing', line: 'padding, gap and margin land on the scale' },
  { id: 'D1', group: 'radius', line: SPEC.radius.line },
  { id: 'C1', group: 'contrast', line: '4.5:1 under 26px' },
  { id: 'C2', group: 'contrast', line: '3.0:1 at 26px and above' },
  { id: 'M1', group: 'motion', line: 'duration is 120, 220 or 400' },
  { id: 'M2', group: 'motion', line: 'the curve is arrive' },
  { id: 'M3', group: 'motion', line: 'only transform and opacity transition' },
  { id: 'A1', group: 'alignment', line: SPEC.alignment.line },
];

/** Contrast pairs the book declares legal, computed rather than asserted. */
export const LEGAL_PAIRS: { fg: string; bg: string; ratio: number }[] = [
  ['tide', 'chalk'],
  ['tide', 'paper'],
  ['slate', 'chalk'],
  ['slate', 'paper'],
  ['signal', 'chalk'],
  ['paper', 'signal'],
  ['paper', 'tide'],
  ['mist', 'tide'],
  ['beacon', 'tide'],
  ['tide', 'haze'],
].map(([fg, bg]) => ({
  fg,
  bg,
  ratio: contrastRatio(tokenByName(fg).rgb, tokenByName(bg).rgb),
}));

/** The pairs the role rules exist to prevent, computed the same way. */
export const BARRED_PAIRS: { fg: string; bg: string; ratio: number }[] = [
  ['haze', 'chalk'],
  ['mist', 'chalk'],
  ['beacon', 'chalk'],
  ['signal', 'tide'],
].map(([fg, bg]) => ({
  fg,
  bg,
  ratio: contrastRatio(tokenByName(fg).rgb, tokenByName(bg).rgb),
}));

export function tokenByName(name: string): PaletteToken {
  const found = SPEC.palette.tokens.find((t) => t.name === name);
  if (!found) throw new Error(`Unknown Coastwise token: ${name}`);
  return found;
}

export function verdictFor(overall: number): { word: string; tone: 'pass' | 'drift' | 'fail' } {
  for (const band of SPEC.bands) {
    if (overall >= band.floor) return { word: band.word, tone: band.tone };
  }
  return { word: SPEC.bands[SPEC.bands.length - 1].word, tone: 'fail' };
}
