// Quench field model. Pure math, zero DOM references, unit-testable in node.
// Owns: per-sculpt set caps, viewport-center proximity shaping (NOT ratcheted,
// the metal relaxes as sections leave), the hero scroll/breathe curve,
// critically damped smoothing, active-pair selection, and the cursor state
// (real pointer with damping, autonomous wander attractor after 3s idle).

export const CAPS = {
  tagline: 0.90,
  orb: 0.78,
  lens: 0.85,
  ingot: 1.00,
  ghost: 0.68,
  device: 0.92,
  pools: 0.40,
  mirror: 1.00
};

// 0 sculpt, 2 pools, 3 mirror, 4 device, 5 disc (a lifecycle pool),
// 6 disc that refuses to set
export const MODES = {
  tagline: 0,
  orb: 5,
  lens: 5,
  ingot: 5,
  ghost: 6,
  pools: 2,
  mirror: 3,
  device: 4
};

// How much a disc pool holds its shape: 0 churns like fresh melt, 1 holds
// like set chrome. Hover and focus pull a disc toward stillness.
// Shipped sits high because its surface does hold: what fails is the body,
// which sways forever, and the rim, which never closes. That break lives in
// mode 6 rather than here, so its stillness reads as "almost set"
export const STILL = {
  orb: 0.08,
  lens: 0.46,
  ingot: 0.94,
  ghost: 0.62
};

export const ZERO_RECT = { x: 0, y: 0, w: 0, h: 0 };

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep01(x) {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}

// Critically damped approach factor, frame-rate independent
export function smoothK(dt, base = 0.86) {
  return 1 - Math.pow(base, Math.max(0, dt) * 60);
}

// Raw viewport-center proximity for a section, 1 at center, 0 at 0.6vh away
export function proximity(sectionCenterY, viewportH) {
  const vh = Math.max(1, viewportH);
  return clamp01(1 - Math.abs(sectionCenterY - vh / 2) / (vh * 0.6));
}

// Hero set target: an AUTONOMOUS crest while near the top, scroll-driven crest
// after, then a full release so the word melts back to liquid before the stages.
//
// Autonomous cycle: with no scroll the metal slowly crests into the formed
// headline and melts back to molten, forever (the "refuses to set" concept),
// so the transformation plays itself, no click/drag required. It fades out as
// the reader scrolls into the hero (heroT rises), handing the crest to
// scrollSet with no discontinuity. Long eased holds at each end keep it calm.
const AUTO_PERIOD = 13; // seconds per molten -> formed -> molten cycle

// The trough is a floor, not zero. Melting the headline all the way out left
// the hero with no headline at all for a third of every cycle, and the flat
// DOM fallback that used to cover that gap read as word art. The metal now
// softens toward liquid and comes back without ever giving up the letterforms
const CREST_TROUGH = 0.42;

export function heroCrest(t) {
  const p = ((t % AUTO_PERIOD) + AUTO_PERIOD) % AUTO_PERIOD / AUTO_PERIOD; // 0..1
  const span = 1 - CREST_TROUGH;
  if (p < 0.35) return CREST_TROUGH + span * smoothstep01(p / 0.35);            // rise into formed
  if (p < 0.55) return 1;                                                        // hold formed
  if (p < 0.9) return CREST_TROUGH + span * (1 - smoothstep01((p - 0.55) / 0.35)); // soften back
  return CREST_TROUGH;                                                           // hold molten
}

export function heroTarget(scrollY, heroHeight, t, autoOn = true) {
  const hh = Math.max(1, heroHeight);
  const heroT = clamp01(scrollY / (hh * 0.85));
  const release = 1 - smoothstep01((heroT - 0.7) / 0.3);
  const scrollSet = smoothstep01((heroT - 0.05) / 0.5) * 0.9 * release;
  // Active only near the top; smoothly yields to scrollSet as the reader scrolls in.
  const autoActive = autoOn ? 1 - smoothstep01((heroT - 0.12) / 0.2) : 0;
  const autoSet = (0.12 + 0.74 * heroCrest(t)) * autoActive * release;
  return Math.max(autoSet, scrollSet);
}

function zeroPair() {
  return { sculptId: null, texIndex: 0, anchorRectPx: ZERO_RECT, set: 0, mode: 0 };
}

// defs: [{ id, texIndex }] where id is a data-sculpt key
export function createField(defs = []) {
  const state = defs
    .filter((d) => d && typeof d.id === "string")
    .map((d) => ({
      id: d.id,
      texIndex: d.texIndex | 0,
      cap: CAPS[d.id] !== undefined ? CAPS[d.id] : 0.5,
      mode: MODES[d.id] !== undefined ? MODES[d.id] : 0,
      still: STILL[d.id] !== undefined ? STILL[d.id] : -1,
      set: 0,
      proxy: 0,
      hover: 0,
      rect: ZERO_RECT
    }));

  const cursor = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    strength: 0,
    held: false,
    realX: 0,
    realY: 0,
    lastReal: -1e9,
    init: false
  };

  function pointerMove(x, y, t) {
    cursor.realX = x;
    cursor.realY = y;
    cursor.lastReal = t;
  }

  function setHeld(held) {
    cursor.held = !!held;
  }

  function toPair(s) {
    if (!s || s.set < 0.02) return zeroPair();
    const pair = {
      sculptId: s.id,
      texIndex: s.texIndex,
      anchorRectPx: s.rect,
      set: s.set,
      mode: s.mode
    };
    // Hover and focus pull the pool toward stillness, so the disc tightens
    // under the hand while the field around it keeps yielding to the cursor
    if (s.still >= 0) pair.gain = s.still + (1 - s.still) * s.hover;
    return pair;
  }

  function update(dt, input) {
    const inp = input || {};
    const entries = inp.entries || [];
    const scrollY = inp.scrollY || 0;
    const viewportW = Math.max(1, inp.viewportW || 1);
    const viewportH = Math.max(1, inp.viewportH || 1);
    const heroHeight = inp.heroHeight || viewportH;
    const t = inp.t || 0;
    const bootFloor = inp.bootFloor || 0;
    const breatheOn = inp.breatheOn !== false;

    const byId = new Map();
    for (const e of entries) {
      if (e && typeof e.id === "string") byId.set(e.id, e);
    }

    const k = smoothK(dt);
    const hk = smoothK(dt, 0.82);
    let heroSet = 0;

    for (const s of state) {
      const e = byId.get(s.id);
      let target = 0;
      let proxy = 0;
      s.hover += ((e && e.hover ? 1 : 0) - s.hover) * hk;
      if (e) {
        if (e.anchorRect) s.rect = e.anchorRect;
        if (s.id === "tagline") {
          const ht = heroTarget(scrollY, heroHeight, t, breatheOn);
          target = Math.min(s.cap, Math.max(ht, bootFloor));
          proxy = target;
        } else {
          const shaped = smoothstep01(proximity(e.sectionCenterY, viewportH));
          target = shaped * s.cap;
          proxy = shaped;
        }
      }
      s.proxy = proxy;
      s.set += (target - s.set) * k;
      if (s.id === "tagline") heroSet = s.set;
    }

    // Active pair: the two entries with the highest shaped proximity, hero
    // participating with its set target as proximity proxy
    let a = null;
    let b = null;
    for (const s of state) {
      if (!a || s.proxy > a.proxy) {
        b = a;
        a = s;
      } else if (!b || s.proxy > b.proxy) {
        b = s;
      }
    }

    // Cursor: wander attractor when no real pointer for 3s, else damped chase.
    // Wander strength decays to zero over ~4s of idle so the spike beads read
    // as a reaction to the visitor, never a baked-on stain
    const idle = t - cursor.lastReal;
    const wandering = idle > 3;
    let tx;
    let ty;
    let strengthTarget;
    if (wandering) {
      tx = (0.5 + 0.28 * Math.sin(t * 0.13)) * viewportW;
      ty = (0.35 + 0.22 * Math.sin(t * 0.171 + 1.3)) * viewportH;
      strengthTarget = 0.35 * clamp01(1 - (idle - 3) / 4);
    } else {
      tx = cursor.realX;
      ty = cursor.realY;
      strengthTarget = cursor.held ? Math.min(1, 0.7 * 1.6) : 0.7;
    }
    if (!cursor.init) {
      cursor.x = tx;
      cursor.y = ty;
      cursor.init = true;
    }
    const ck = smoothK(dt, 0.80);
    const px = cursor.x;
    const py = cursor.y;
    cursor.x += (tx - cursor.x) * ck;
    cursor.y += (ty - cursor.y) * ck;
    const idt = dt > 1e-4 ? dt : 1e-4;
    cursor.vx = (cursor.x - px) / idt;
    cursor.vy = (cursor.y - py) / idt;
    cursor.speed = Math.hypot(cursor.vx, cursor.vy);
    cursor.strength += (strengthTarget - cursor.strength) * ck;

    return {
      pairA: toPair(a),
      pairB: toPair(b),
      heroSet,
      cursor: {
        x: cursor.x,
        y: cursor.y,
        vx: cursor.vx,
        vy: cursor.vy,
        speed: cursor.speed,
        strength: cursor.strength,
        held: cursor.held
      }
    };
  }

  return {
    update,
    pointerMove,
    setHeld,
    get entries() {
      return state;
    }
  };
}
