// Flomasters system drawing generator.
//
// The site's centerpiece is a cutaway of a Hampton Roads house drawn the way a
// master plumber sees it: the water system behind the walls, in trade line
// semantics (cold solid, hot solid copper, drain dashed, vent dot-dash), with
// every offered service tagged at the exact point in the system where that
// work happens. This module holds the house and the system as data, computes
// the pipe routes (drains actually slope), and emits the SVG that gets
// injected into the pages between marker comments.
//
//   node scripts/flomasters-system.mjs --write   inject into the HTML pages
//   node scripts/flomasters-system.mjs           print the home variant
//
// The test suite imports render() and asserts the committed HTML matches the
// generated output, and that the tag count equals the service count.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------- geometry --

export const VIEW = { w: 1200, h: 660 };

const GRADE = 488;          // ground line
const SEWER_Y = 575;        // city sewer depth
const MAIN_Y = 545;         // city water main depth
const SERVICE_Y = 525;      // service line run depth
const LATERAL_FALL = 55;    // drop from house exit to the street sewer

const HOUSE = {
  left: 420,
  right: 1040,
  floor1: 430,   // first finished floor
  ceil1: 300,
  floor2: 300,
  ceil2: 180,
  peak: [730, 48],
  eaveL: [400, 180],
  eaveR: [1060, 180],
};

const CRAWL = { coldY: 444, hotY: 452, drainRight: 950, drainYRight: 462, drainYLeft: 470 };

// Drain slope between two x positions inside the crawl main run
const drainY = (x) => {
  const t = (CRAWL.drainRight - x) / (CRAWL.drainRight - HOUSE.left);
  return CRAWL.drainYRight + t * (CRAWL.drainYLeft - CRAWL.drainYRight);
};

// Lateral from the foundation exit to the street sewer
const LATERAL = { from: [HOUSE.left, CRAWL.drainYLeft + 45], to: [100, 570] };
const lateralAt = (x) => {
  const [x1, y1] = LATERAL.from;
  const [x2, y2] = LATERAL.to;
  return y1 + ((x1 - x) / (x1 - x2)) * (y2 - y1);
};

// Roof line on the left slope, for the vent exit
const roofYAt = (x) => {
  const [px, py] = HOUSE.peak;
  const [ex, ey] = HOUSE.eaveL;
  return py + ((px - x) / (px - ex)) * (ey - py);
};

const FIX = {
  meter: { x: 122, y: MAIN_Y },
  shutoff: { x: 450, y: 500 },
  kitchen: { sink: 500, counter: 392, trapDrop: 512 },
  laundry: { x: 715, top: 386 },
  bath: { toilet: 570, tub: [630, 740], sink: 480, stack: 592, supply: 616 },
  heater: { x: 930, w: 46, top: 364, bottom: 430 },
  spigot: { branch: 1005, y: 405 },
  cleanout: { x: 330 },
  tree: { x: 80 },
};

// ---------------------------------------------------------------- services --

// Every entry draws one tag on the system. The order and names mirror the
// service list on the home page; the test counts them against each other.
export const SERVICES = [
  {
    id: 'drain-cleaning', name: 'DRAIN CLEANING', price: 'FROM $149',
    href: '/prototype/flomasters/services/drain-cleaning',
    tag: [438, 330], anchor: [489, 428],
  },
  {
    id: 'main-sewer', name: 'MAIN SEWER LINE', price: 'FROM $249',
    href: '/prototype/flomasters/services/drain-cleaning',
    tag: [110, 600], anchor: [200, lateralAt(200)],
  },
  {
    id: 'camera', name: 'SEWER CAMERA', price: '$189, FREE WITH MAIN',
    href: '/prototype/flomasters/services/drain-cleaning',
    tag: [150, 634], anchor: [FIX.cleanout.x, 520],
  },
  {
    id: 'water-heater', name: 'WATER HEATERS', price: 'FROM $129',
    href: '/prototype/flomasters/services/water-heaters',
    tag: [750, 318], anchor: [905, 390],
  },
  {
    id: 'leak', name: 'LEAK REPAIR', price: 'FROM $189',
    href: '/prototype/flomasters/services',
    tag: [790, 226], anchor: [FIX.bath.supply + 8, 282],
  },
  {
    id: 'fixtures', name: 'TOILETS AND FAUCETS', price: 'FROM $119',
    href: '/prototype/flomasters/services',
    tag: [438, 210], anchor: [FIX.bath.toilet, 272],
  },
  {
    id: 'repipe', name: 'REPIPES', price: 'WRITTEN QUOTE',
    href: '/prototype/flomasters/services',
    tag: [740, 540], anchor: [880, CRAWL.coldY + 4],
  },
  {
    id: 'crawl', name: 'CRAWL SPACE REPAIR', price: 'FROM $189',
    href: '/prototype/flomasters/services',
    tag: [840, 586], anchor: [850, 466],
  },
];

// Tap zones on the booking page. The set matches the booking form's job list,
// and the prices match the pricing page's ranges.
export const SPOTS = [
  { job: 'kitchen', short: 'Kitchen', label: 'Kitchen sink or disposal', price: 'usually $149 to $325', at: [505, 362], textPos: 'above' },
  { job: 'bath', short: 'Bath', label: 'Toilet, tub or shower', price: 'usually $119 to $325', at: [640, 248], textPos: 'above' },
  { job: 'water-heater', short: 'Water heater', label: 'Water heater', price: 'repair from $129, tank replacement $1,450 to $2,400', at: [953, 346], textPos: 'above' },
  { job: 'crawl', short: 'Crawl space', label: 'Crawl space leak or pipe', price: 'from $189', at: [745, 462], textPos: 'below' },
  { job: 'yard', short: 'Yard line', label: 'Main sewer or yard line', price: 'clearing from $249, camera $189', at: [240, 548], textPos: 'below' },
  { job: 'spigot', short: 'Spigot', label: 'Outdoor spigot', price: 'from $99', at: [1062, 406], textPos: 'below' },
];

// ----------------------------------------------------------------- helpers --

const r1 = (n) => Math.round(n * 10) / 10;
const pts = (list) => 'M' + list.map(([x, y], i) => `${i ? 'L' : ''}${r1(x)} ${r1(y)}`).join(' ');

const pipe = (cls, list, opts = {}) => {
  const len = opts.norm === false ? '' : ' pathLength="1"';
  return `<path class="pipe ${cls}"${len} d="${pts(list)}"/>`;
};

const line = (cls, x1, y1, x2, y2) => `<path class="${cls}" d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}"/>`;

const label = (x, y, text, anchor = 'start') =>
  `<text class="sys-label" x="${r1(x)}" y="${r1(y)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${text}</text>`;

// Tag box width from its text: Archivo caps at 11px runs ~6.5px per glyph
const tagW = (text) => Math.round(20 + text.length * 6.55);

// ------------------------------------------------------------------ layers --

function shell() {
  const H = HOUSE;
  const parts = [];
  // Roof
  parts.push(`<path class="shell" d="${pts([H.eaveL, H.peak, H.eaveR])}"/>`);
  // Walls, from eave to grade (foundation continues below the floor line)
  parts.push(line('shell', H.left, H.ceil2, H.left, GRADE + 16));
  parts.push(line('shell', H.right, H.ceil2, H.right, GRADE + 16));
  // Floors and ceilings
  parts.push(line('shell shell--faint', H.left, H.ceil2, H.right, H.ceil2));
  parts.push(line('shell', H.left, H.floor2, H.right, H.floor2));
  parts.push(line('shell', H.left, H.floor1, H.right, H.floor1));
  // Grade line: street, yard, and under the house
  parts.push(line('shell', 0, GRADE, H.left, GRADE));
  parts.push(line('shell', H.right, GRADE, VIEW.w, GRADE));
  // Piers in the crawl space
  for (const px of [520, 620, 720, 820, 920]) {
    parts.push(`<rect class="shell shell--faint" x="${px - 7}" y="${GRADE - 26}" width="14" height="26"/>`);
  }
  // Street curb tick
  parts.push(line('shell shell--faint', 170, GRADE, 170, GRADE - 6));
  return parts.join('\n    ');
}

function tree() {
  const x = FIX.tree.x;
  const canopy = [
    `<path class="shell shell--faint" d="M${x - 34} ${GRADE - 74} q10 -34 34 -30 q6 -26 30 -20 q24 4 22 30 q20 8 8 30 q-8 18 -30 14 q-18 12 -34 0 q-24 4 -30 -24z"/>`,
  ];
  const trunk = line('shell', x, GRADE, x, GRADE - 64);
  // Roots reach for the lateral joints: the region's most ordinary failure
  const roots = `<path class="root" d="M${x - 6} ${GRADE} q-8 26 4 44 q8 14 26 20 M${x + 6} ${GRADE} q14 20 34 28 q22 10 40 8 M${x} ${GRADE} q2 34 18 52"/>`;
  return [trunk, ...canopy, roots].join('\n    ');
}

function fixtures() {
  const parts = [];
  const K = FIX.kitchen;
  // Interior partitions, so risers read as in-wall runs
  parts.push(line('shell shell--faint', 620, HOUSE.ceil1, 620, HOUSE.floor1));
  parts.push(line('shell shell--faint', 780, HOUSE.ceil2, 780, HOUSE.floor2));
  // Kitchen: counter, basin, faucet
  parts.push(line('glyph', 452, K.counter, 590, K.counter));
  parts.push(line('glyph glyph--faint', 452, K.counter, 452, HOUSE.floor1));
  parts.push(line('glyph glyph--faint', 590, K.counter, 590, HOUSE.floor1));
  parts.push(`<path class="glyph" d="M478 ${K.counter}v10q0 6 6 6h32q6 0 6 -6v-10"/>`);
  parts.push(`<path class="glyph" d="M508 ${K.counter}v-12q0 -8 -8 -8h-6v6"/>`);
  // Laundry box with dial
  const L = FIX.laundry;
  parts.push(`<rect class="glyph" x="${L.x}" y="${L.top}" width="44" height="${HOUSE.floor1 - L.top}" rx="3"/>`);
  parts.push(`<circle class="glyph" cx="${L.x + 22}" cy="${L.top + 24}" r="12"/>`);
  // Bath: toilet, basin on a pedestal, tub with a spout
  const B = FIX.bath;
  parts.push(`<path class="glyph" d="M${B.toilet - 12} ${HOUSE.floor2}v-24h10v14"/>`);
  parts.push(`<path class="glyph" d="M${B.toilet - 2} ${HOUSE.floor2 - 12}h16q7 0 6 8q-1 6 -9 6"/>`);
  parts.push(`<path class="glyph" d="M${B.sink - 16} ${HOUSE.floor2 - 24}h30l-5 8h-20z M${B.sink - 1} ${HOUSE.floor2 - 16}v16"/>`);
  parts.push(`<path class="glyph" d="M${B.tub[0]} ${HOUSE.floor2 - 22}q-6 22 8 22h${B.tub[1] - B.tub[0] - 22}q14 0 8 -22z"/>`);
  parts.push(`<path class="glyph" d="M${B.tub[1] - 10} ${HOUSE.floor2 - 22}v-8h-10"/>`);
  // Water heater: cylinder, burner tick in copper (the one hot appliance)
  const W = FIX.heater;
  parts.push(`<rect class="glyph" x="${W.x - W.w / 2}" y="${W.top}" width="${W.w}" height="${W.bottom - W.top}" rx="10"/>`);
  parts.push(line('glyph glyph--faint', W.x - W.w / 2, W.top + 12, W.x + W.w / 2, W.top + 12));
  parts.push(`<path class="p-hot pipe-thin" d="M${W.x - 8} ${W.bottom - 6}q8 -8 16 0"/>`);
  // Outdoor spigot
  const S = FIX.spigot;
  parts.push(`<path class="glyph" d="M${HOUSE.right} ${S.y}h14v8m0 -8h4"/>`);
  return parts.join('\n    ');
}

function coldRuns() {
  const runs = [];
  // City main under the street
  runs.push(pipe('p-cold', [[8, MAIN_Y], [FIX.meter.x - 12, MAIN_Y]]));
  // Meter to the house: rise to service depth, run, hop the lateral, rise inside
  runs.push(pipe('p-cold', [
    [FIX.meter.x + 12, MAIN_Y], [170, MAIN_Y], [170, SERVICE_Y], [352, SERVICE_Y],
  ]));
  runs.push(pipe('p-cold', [
    [376, SERVICE_Y], [FIX.shutoff.x, SERVICE_Y], [FIX.shutoff.x, CRAWL.coldY],
  ]));
  // The hop where the service crosses the lateral
  runs.push(`<path class="pipe p-cold" pathLength="1" d="M352 ${SERVICE_Y} a12 12 0 0 1 24 0"/>`);
  // Cold trunk across the crawl
  runs.push(pipe('p-cold', [[FIX.shutoff.x, CRAWL.coldY], [FIX.spigot.branch, CRAWL.coldY]]));
  // Risers with stop ticks: kitchen, bath, laundry, heater, spigot
  runs.push(pipe('p-cold', [[512, CRAWL.coldY], [512, FIX.kitchen.counter + 20]]));
  runs.push(pipe('p-cold', [[FIX.bath.supply, CRAWL.coldY], [FIX.bath.supply, 282]]));
  runs.push(pipe('p-cold', [[FIX.laundry.x - 16, CRAWL.coldY], [FIX.laundry.x - 16, FIX.laundry.top + 10], [FIX.laundry.x - 4, FIX.laundry.top + 10]]));
  runs.push(pipe('p-cold', [[FIX.heater.x - 10, CRAWL.coldY], [FIX.heater.x - 10, FIX.heater.top]]));
  runs.push(pipe('p-cold', [[FIX.spigot.branch, CRAWL.coldY], [FIX.spigot.branch, FIX.spigot.y], [HOUSE.right, FIX.spigot.y]]));
  // Main shutoff valve on the riser, clear of the drain main
  const v = FIX.shutoff;
  runs.push(`<path class="glyph valve" d="M${v.x - 6} ${v.y - 5}l12 10m0 -10l-12 10"/>`);
  return runs.join('\n    ');
}

function hotRuns() {
  const runs = [];
  const W = FIX.heater;
  // Out of the tank, over the side, down to the crawl, left parallel to cold
  runs.push(pipe('p-hot', [
    [W.x + 10, W.top], [W.x + 10, W.top - 14], [W.x + 41, W.top - 14],
    [W.x + 41, CRAWL.hotY], [520, CRAWL.hotY],
  ]));
  // Risers: kitchen, laundry, bath
  runs.push(pipe('p-hot', [[520, CRAWL.hotY], [520, FIX.kitchen.counter + 20]]));
  runs.push(pipe('p-hot', [[FIX.laundry.x - 26, CRAWL.hotY], [FIX.laundry.x - 26, FIX.laundry.top + 22], [FIX.laundry.x - 4, FIX.laundry.top + 22]]));
  runs.push(pipe('p-hot', [[FIX.bath.supply + 10, CRAWL.hotY], [FIX.bath.supply + 10, 282]]));
  return runs.join('\n    ');
}

function drainRuns() {
  const runs = [];
  const K = FIX.kitchen;
  // Kitchen P-trap, the most recognizable glyph in the trade, then the drop
  runs.push(`<path class="pipe p-drain" d="M496 ${K.counter + 16}v14a7 7 0 0 1 -14 0v-5h-4v${drainY(478) - K.counter - 25}"/>`);
  // Laundry standpipe behind the washer
  runs.push(pipe('p-drain', [[FIX.laundry.x - 36, FIX.laundry.top + 2], [FIX.laundry.x - 36, drainY(FIX.laundry.x - 36)]], { norm: false }));
  // Bath stack from the second floor
  runs.push(pipe('p-drain', [[FIX.bath.stack, HOUSE.floor2], [FIX.bath.stack, drainY(FIX.bath.stack)]], { norm: false }));
  // Crawl main, sloping the way a real one must
  runs.push(pipe('p-drain p-drain--main', [
    [CRAWL.drainRight, CRAWL.drainYRight], [HOUSE.left, CRAWL.drainYLeft], LATERAL.from,
  ], { norm: false }));
  // Lateral to the street, cleanout riser at grade
  runs.push(pipe('p-drain p-drain--main', [LATERAL.from, LATERAL.to], { norm: false }));
  runs.push(pipe('p-drain', [[FIX.cleanout.x, lateralAt(FIX.cleanout.x)], [FIX.cleanout.x, GRADE - 2]], { norm: false }));
  runs.push(line('glyph', FIX.cleanout.x - 6, GRADE - 2, FIX.cleanout.x + 6, GRADE - 2));
  // City sewer
  runs.push(pipe('p-drain p-drain--main', [[8, SEWER_Y], [96, SEWER_Y]], { norm: false }));
  return runs.join('\n    ');
}

function ventRun() {
  const x = FIX.bath.stack;
  const exit = roofYAt(x);
  return [
    pipe('p-vent', [[x, HOUSE.floor2], [x, exit - 14]], { norm: false }),
    line('glyph glyph--faint', x - 5, exit - 14, x + 5, exit - 14),
  ].join('\n    ');
}

function waterTable() {
  const y = 636;
  let d = `M8 ${y}`;
  for (let x = 8; x < VIEW.w - 16; x += 48) d += ` q12 -7 24 0 q12 7 24 0`;
  return `<path class="water-table" d="${d}"/>`;
}

function systemLabels(variant) {
  return [
    label(14, MAIN_Y - 10, 'CITY MAIN'),
    label(14, SEWER_Y + 18, 'CITY SEWER'),
    label(FIX.meter.x, MAIN_Y - 21, 'METER', 'middle'),
    label(FIX.cleanout.x - 92, GRADE - 20, 'CLEANOUT'),
    label(FIX.bath.stack + 10, roofYAt(FIX.bath.stack) - 20, 'VENT'),
    label(VIEW.w - 14, 630, 'WATER TABLE, HIGH AND BRACKISH', 'end'),
    // The one note allowed to editorialize; the book overlay needs the room
    label(FIX.shutoff.x + 16, 512, variant === 'book' ? 'MAIN SHUTOFF' : 'MAIN SHUTOFF, FIND YOURS BEFORE YOU NEED IT'),
  ].join('\n    ');
}

function meterGlyph() {
  const m = FIX.meter;
  return [
    `<rect class="glyph" x="${m.x - 12}" y="${m.y - 9}" width="24" height="18" rx="2"/>`,
    `<circle class="glyph glyph--faint" cx="${m.x}" cy="${m.y}" r="5"/>`,
  ].join('\n    ');
}

function serviceTags() {
  return SERVICES.map((s) => {
    const text = `${s.name} · ${s.price}`;
    const w = tagW(text);
    const [tx, ty] = s.tag;
    const [ax, ay] = s.anchor;
    // Leader leaves the nearest tag edge
    const fromX = ax < tx ? tx : ax > tx + w ? tx + w : ax;
    const fromY = ay < ty ? ty : ty + 20;
    const leader = `<path class="leader" d="M${r1(fromX)} ${r1(fromY)}L${r1(ax)} ${r1(ay)}"/><circle class="leader-dot" cx="${r1(ax)}" cy="${r1(ay)}" r="2.6"/>`;
    const box = [
      `<rect class="tag-box" x="${tx}" y="${ty}" width="${w}" height="20" rx="2"/>`,
      `<circle class="tag-hole" cx="${tx + 8}" cy="${ty + 10}" r="2.4"/>`,
      `<text class="tag-text" x="${tx + 16}" y="${ty + 14}">${text}</text>`,
    ].join('');
    return `<g class="sys-tag" data-service="${s.id}">${leader}<a href="${s.href}" aria-label="${s.name.toLowerCase()}, ${s.price.toLowerCase()}">${box}</a></g>`;
  }).join('\n    ');
}

function bookSpots() {
  return SPOTS.map((s) => {
    const [x, y] = s.at;
    return [
      `<g class="house-spot" role="button" tabindex="0" data-job="${s.job}" data-label="${s.label}" data-price="${s.price}" aria-pressed="false" aria-label="${s.label}, ${s.price}">`,
      `<circle class="pad" cx="${x}" cy="${y}" r="44"/>`,
      `<circle class="pin" cx="${x}" cy="${y}" r="9"/>`,
      `<circle class="pin-ring" cx="${x}" cy="${y}" r="18"/>`,
      `<text x="${x}" y="${s.textPos === 'above' ? y - 26 : y + 36}" text-anchor="middle">${s.short}</text>`,
      `</g>`,
    ].join('');
  }).join('\n    ');
}

// ------------------------------------------------------------------- riser --
// The same system, projected vertically for small screens: one legible stack
// from the roof vent down to the city sewer, every service tag at full size at
// its true height in the house. The dashed spine IS the drain, load-bearing.

const R = {
  w: 460, h: 940,
  cold: 64, hot: 78, stack: 112,
  floors: { bath: 180, kitchen: 340, utility: 500 },
  grade: 580,
  heater: { x: 155, w: 46, top: 400, bottom: 500 },
  cleanout: { x: 184 },
  sewerY: 800, mainY: 860,
};

// Riser tag rows, right-aligned to one edge; each points at its true spot
const RISER_TAGS = [
  { id: 'fixtures', y: 84, anchor: [148, 158] },
  { id: 'leak', y: 128, anchor: [R.hot + 4, 150] },
  { id: 'drain-cleaning', y: 246, anchor: [176, 316] },
  { id: 'water-heater', y: 414, anchor: [R.heater.x + R.heater.w / 2, 430] },
  { id: 'repipe', y: 530, anchor: [R.cold + 7, 502] },
  { id: 'crawl', y: 610, anchor: [300, 552] },
  { id: 'main-sewer', y: 700, anchor: [236, 726] },
  { id: 'camera', y: 742, anchor: [R.cleanout.x, 600] },
];

function riserLateralAt(x) {
  // Lateral from the stack foot to the city sewer
  const [x1, y1] = [R.stack, R.grade + 24];
  const [x2, y2] = [330, R.sewerY];
  return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
}

function riser() {
  const parts = [];
  const T = 'riser';
  // Floor lines and grade
  for (const y of [R.floors.bath, R.floors.kitchen, R.floors.utility]) {
    parts.push(line('shell shell--faint', 40, y, 440, y));
  }
  parts.push(line('shell', 12, R.grade, 448, R.grade));
  // Piers in the crawl
  for (const px of [240, 330, 420]) {
    parts.push(`<rect class="shell shell--faint" x="${px - 6}" y="${R.grade - 22}" width="12" height="22"/>`);
  }
  // Vent out the top of the stack
  parts.push(pipe('p-vent', [[R.stack, 120], [R.stack, 34]], { norm: false }));
  parts.push(line('glyph glyph--faint', R.stack - 5, 34, R.stack + 5, 34));
  // The drain stack, then the lateral, then the city sewer
  parts.push(pipe('p-drain p-drain--main', [[R.stack, 120], [R.stack, R.grade + 24], [330, R.sewerY]], { norm: false }));
  parts.push(pipe('p-drain p-drain--main', [[330, R.sewerY], [448, R.sewerY]], { norm: false }));
  // Cleanout riser to grade
  parts.push(pipe('p-drain', [[R.cleanout.x, riserLateralAt(R.cleanout.x)], [R.cleanout.x, R.grade - 2]], { norm: false }));
  parts.push(line('glyph', R.cleanout.x - 6, R.grade - 2, R.cleanout.x + 6, R.grade - 2));
  // Branch drains into the stack: bath, kitchen
  parts.push(pipe('p-drain', [[148, 168], [R.stack, 168]], { norm: false }));
  parts.push(pipe('p-drain', [[176, 300], [176, 328], [R.stack, 328]], { norm: false }));
  // Cold: city main up the whole house
  parts.push(pipe('p-cold', [[40, R.mainY], [R.cold, R.mainY], [R.cold, 96], [120, 96], [120, 152]]));
  parts.push(pipe('p-cold', [[R.cold, 452], [140, 452], [140, R.heater.top]]));
  parts.push(pipe('p-cold', [[R.cold, 268], [160, 268], [160, 288]]));
  // City main line and meter
  parts.push(pipe('p-cold', [[12, R.mainY], [26, R.mainY]]));
  parts.push(`<rect class="glyph" x="${26}" y="${R.mainY - 9}" width="24" height="18" rx="2"/>`);
  // Main shutoff on the riser below grade entry
  parts.push(`<path class="glyph valve" d="M${R.cold - 6} ${540}l12 10m0 -10l-12 10"/>`);
  // Hot: from the heater top, up alongside the cold
  parts.push(pipe('p-hot', [[R.heater.x + 12, R.heater.top], [R.heater.x + 12, R.heater.top - 18], [R.hot, R.heater.top - 18], [R.hot, 110], [132, 110], [132, 152]]));
  parts.push(pipe('p-hot', [[R.hot, 282], [148, 282], [148, 288]]));
  // Bath fixtures on their floor
  parts.push(`<path class="glyph" d="M136 ${R.floors.bath}v-20h9v12"/>`);
  parts.push(`<path class="glyph" d="M145 ${R.floors.bath - 10}h14q6 0 5 7q-1 5 -8 5"/>`);
  parts.push(`<path class="glyph" d="M196 ${R.floors.bath - 20}q-5 20 7 20h64q12 0 7 -20z"/>`);
  parts.push(`<path class="glyph" d="M266 ${R.floors.bath - 20}v-7h-9"/>`);
  // Kitchen counter, sink and trap
  parts.push(line('glyph', 130, 288, 250, 288));
  parts.push(`<path class="glyph" d="M154 288v8q0 5 5 5h26q5 0 5 -5v-8"/>`);
  parts.push(`<path class="pipe p-drain" d="M176 292v12a6 6 0 0 1 -12 0v-4"/>`);
  // Water heater with its burner
  parts.push(`<rect class="glyph" x="${R.heater.x - R.heater.w / 2}" y="${R.heater.top}" width="${R.heater.w}" height="${R.heater.bottom - R.heater.top}" rx="10"/>`);
  parts.push(line('glyph glyph--faint', R.heater.x - R.heater.w / 2, R.heater.top + 12, R.heater.x + R.heater.w / 2, R.heater.top + 12));
  parts.push(`<path class="p-hot pipe-thin" d="M${R.heater.x - 8} ${R.heater.bottom - 8}q8 -8 16 0"/>`);
  // Water table
  let wt = `M12 ${910}`;
  for (let x = 12; x < R.w - 24; x += 48) wt += ` q12 -7 24 0 q12 7 24 0`;
  parts.push(`<path class="water-table" d="${wt}"/>`);
  // Labels
  const labels = [
    label(R.stack + 12, 48, 'VENT'),
    label(38, R.mainY + 24, 'CITY MAIN AND METER'),
    label(R.w - 14, R.sewerY - 12, 'CITY SEWER', 'end'),
    label(R.cold + 16, 546, 'MAIN SHUTOFF'),
    label(R.cleanout.x + 12, R.grade - 10, 'CLEANOUT'),
    label(R.w - 14, 934, 'WATER TABLE', 'end'),
  ].join('\n    ');
  // Tags: right-aligned edge, leaders back to the point of work
  const tags = RISER_TAGS.map((rt) => {
    const s = SERVICES.find((sv) => sv.id === rt.id);
    const text = `${s.name} · ${s.price}`;
    const w = tagW(text);
    const tx = R.w - 26 - w;
    const ty = rt.y;
    const [ax, ay] = rt.anchor;
    const fromY = ay < ty ? ty : ay > ty + 20 ? ty + 20 : ay;
    const leader = `<path class="leader" d="M${r1(tx)} ${r1(fromY)}L${r1(ax)} ${r1(ay)}"/><circle class="leader-dot" cx="${r1(ax)}" cy="${r1(ay)}" r="3"/>`;
    const box = [
      `<rect class="tag-box" x="${tx}" y="${ty}" width="${w}" height="20" rx="2"/>`,
      `<circle class="tag-hole" cx="${tx + 8}" cy="${ty + 10}" r="2.4"/>`,
      `<text class="tag-text" x="${tx + 16}" y="${ty + 14}">${text}</text>`,
    ].join('');
    return `<g class="sys-tag" data-service="${s.id}">${leader}<a href="${s.href}" aria-label="${s.name.toLowerCase()}, ${s.price.toLowerCase()}">${box}</a></g>`;
  }).join('\n    ');
  return `<svg class="system system--riser" viewBox="0 0 ${R.w} ${R.h}" role="img" aria-label="The same plumbing system drawn as a vertical riser, from the roof vent down to the city sewer, each service tagged with its price">
    ${parts.join('\n    ')}
    <g class="sys-labels">${labels}</g>
    <g class="sys-overlay">${tags}</g>
  </svg>`;
}

// ------------------------------------------------------------------ render --

export function render(variant) {
  if (variant === 'riser') return riser();
  const overlay = variant === 'book' ? bookSpots() : serviceTags();
  const title = variant === 'book'
    ? 'Cutaway of a house showing the plumbing system, with six tappable problem areas'
    : 'Cutaway of a Hampton Roads house showing the whole plumbing system, each service tagged with its price at the point where the work happens';
  return `<svg class="system system--house" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${title}">
    ${shell()}
    ${tree()}
    ${fixtures()}
    ${meterGlyph()}
    ${drainRuns()}
    ${ventRun()}
    ${coldRuns()}
    ${hotRuns()}
    ${waterTable()}
    <g class="sys-labels">${systemLabels(variant)}</g>
    <g class="sys-overlay">${overlay}</g>
  </svg>`;
}

// ------------------------------------------------------------------ inject --

const MARK = (name) => [`<!-- flomasters:system:${name} -->`, `<!-- /flomasters:system:${name} -->`];

export function inject(html, name, svg) {
  const [open, close] = MARK(name);
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start === -1 || end === -1) throw new Error(`markers for ${name} not found`);
  return html.slice(0, start + open.length) + '\n' + svg + '\n' + html.slice(end);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const TARGETS = [
  { file: 'public/prototype/flomasters/index.html', name: 'home' },
  { file: 'public/prototype/flomasters/index.html', name: 'riser' },
  { file: 'public/prototype/flomasters/book/index.html', name: 'book' },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--write')) {
    for (const t of TARGETS) {
      const p = path.join(ROOT, t.file);
      const html = readFileSync(p, 'utf8');
      writeFileSync(p, inject(html, t.name, render(t.name)));
      console.log(`injected ${t.name} system into ${t.file}`);
    }
  } else {
    console.log(render('home'));
  }
}
