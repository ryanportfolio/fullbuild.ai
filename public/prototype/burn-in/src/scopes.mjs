// Per-scope state machines and per-frame uniform payloads. Rect reads are
// batched in readRects before any GL write. Continuous quantities move through
// a critically damped smoother, about 0.12 per frame at 60fps.

import { strokeLayout, segmentsForRange, endPoint } from "./strokes.mjs";

// Ghost labels burned into the standby bay phosphor
const BAY_GHOSTS = {
  "bay-product": "BAY I",
  "bay-research": "BAY II",
  "bay-experiment": "BAY III"
};

const CAPS = {
  "ch-idea": 0.32,
  "ch-design": 0.85,
  "ch-engineering": 1.0,
  "ch-shipped": 0.0,
  "dut": 0.55
};
const DECAY = { hero: 0.985, channel: 0.92, dut: 0.92, bay: 0.90 };
const KIND = { hero: 0, channel: 1, dut: 2, bay: 3 };
const WAVE = { noise: 0, envelope: 1, square: 2, hold: 3 };
const HERO_DRAW_SECONDS = 2.1;
const HERO_RETRACE_PAUSE = 6.0;
const MAX_SEGS = 96;

export function createScopes() {
  const scopes = Array.from(document.querySelectorAll("[data-scope]")).map((el) => ({
    id: el.dataset.scope,
    el,
    kind: el.dataset.scopeKind,
    waveIdx: el.dataset.wave ? WAVE[el.dataset.wave] : (el.dataset.scopeKind === "dut" ? WAVE.envelope : WAVE.noise),
    resolve: 0,
    target: 0,
    spike: 0,
    rect: null,
    visible: false
  }));

  const hero = {
    phase: "park",
    t: 0,
    s: 0,
    sPrev: 0,
    holdS: 0,
    holdPrev: 0,
    layout: null,
    selftest: null,
    stacked: false,
    pause: 0
  };
  const knobs = {
    trigger: { v: 0.5, t: 0.5 },
    sweep: { v: 0.4, t: 0.4 }
  };
  const stats = { sweeps: 0 };
  const segBuf = new Float32Array(MAX_SEGS * 4);
  let reduced = false;
  let bootCb = null;
  let sweepAcc = 0;
  let heroLoops = 0;

  function ensureHeroLayout(cssWidth) {
    const stacked = cssWidth < 600;
    if (hero.layout && hero.stacked === stacked) return;
    hero.stacked = stacked;
    hero.layout = strokeLayout(stacked ? "FROM\nMAYBE\nTO MADE" : "FROM MAYBE TO MADE", {
      tracking: 3,
      lineGap: 8
    });
    hero.s = 0;
    hero.sPrev = 0;
    hero.pause = 0;
  }

  function finishBoot() {
    if (hero.phase === "draw") return;
    hero.phase = "draw";
    if (bootCb) { const cb = bootCb; bootCb = null; cb(); }
  }

  function readRects(viewportH) {
    for (const s of scopes) {
      const r = s.el.getBoundingClientRect();
      s.rect = r;
      s.visible = r.bottom > -160 && r.top < viewportH + 160 && r.width > 2 && r.height > 2;
    }
  }

  function update(dt, time, viewportH) {
    const k = reduced ? 1 : Math.min(1, 1 - Math.pow(0.88, dt * 60));
    knobs.trigger.v += (knobs.trigger.t - knobs.trigger.v) * k;
    knobs.sweep.v += (knobs.sweep.t - knobs.sweep.v) * k;
    const sweepMul = 0.5 + knobs.sweep.v * 1.5;
    const trig = (knobs.trigger.v - 0.5) * 0.4;

    let visibleChannels = 0;
    stats.channels = {};
    for (const s of scopes) {
      if (!s.rect) continue;
      if (s.kind === "channel" || s.kind === "dut") {
        const cap = CAPS[s.id] ?? 0.6;
        const c = s.rect.top + s.rect.height / 2;
        const prox = 1 - Math.min(1, Math.abs(c - viewportH / 2) / (viewportH * 0.55));
        const shaped = prox * prox * (3 - 2 * prox);
        s.target = Math.max(s.target, shaped * cap);
        if (s.visible && s.waveIdx !== WAVE.hold) visibleChannels++;
      }
      s.resolve += (s.target - s.resolve) * k;
      s.spike *= Math.exp(-5 * dt);
      if (s.kind === "channel") stats.channels[s.id] = s.id === "ch-shipped" ? 0 : s.resolve;
      // A tube powers on the first time it scrolls into view
      if (s.visible && s.bootT == null) s.bootT = 0;
      if (s.bootT != null && s.bootT < 1) s.bootT = Math.min(1, s.bootT + (reduced ? 1 : dt / 0.45));
    }

    hero.t += dt;
    if (hero.phase === "park" && (reduced || hero.t >= 0.5)) hero.phase = "selftest";
    if (hero.phase === "selftest" && (reduced || hero.t >= 1.6)) finishBoot();
    if (hero.phase === "draw" && hero.layout) {
      const speed = (hero.layout.total / HERO_DRAW_SECONDS) * sweepMul;
      hero.sPrev = hero.s;
      if (hero.s < hero.layout.total) {
        hero.s = Math.min(hero.layout.total, hero.s + speed * dt);
        if (hero.s >= hero.layout.total) {
          heroLoops++;
          hero.holdS = 0;
          hero.holdPrev = 0;
        }
      } else if (!reduced) {
        // Hold: a slow refresh cursor re-excites the finished phrase like a
        // storage scope, keeping the age gradient alive between retraces
        hero.pause += dt;
        hero.holdPrev = hero.holdS;
        hero.holdS = (hero.holdS + (hero.layout.total / 4.0) * dt) % hero.layout.total;
        if (hero.pause > HERO_RETRACE_PAUSE) {
          hero.pause = 0;
          hero.s = 0;
          hero.sPrev = 0;
        }
      }
    }

    sweepAcc += (dt / (2.6 / sweepMul)) * visibleChannels;
    stats.sweeps = Math.floor(sweepAcc) + heroLoops;

    return scopes.map((s) => frameFor(s, sweepMul, trig));
  }

  function frameFor(s, sweepMul, trig) {
    const entry = {
      id: s.id,
      kindIdx: KIND[s.kind] ?? 1,
      waveIdx: s.waveIdx,
      rect: s.rect,
      visible: s.visible,
      runA: reduced || s.visible,
      decay: DECAY[s.kind] ?? 0.92,
      resolve: s.id === "ch-shipped" ? 0 : s.resolve,
      trigger: s.kind === "channel" && s.waveIdx === WAVE.hold ? 0 : trig,
      sweepMul,
      spike: s.spike,
      tint: s.id === "ch-shipped" ? 1 : 0,
      core: 0.013,
      emax: 5.0,
      boot: 1,
      segs: null,
      segCount: 0,
      headGain: 0,
      segGain: 0
    };

    if (s.kind !== "hero") {
      entry.boot = s.bootT == null ? 0.05 : (s.bootT >= 1 ? 1 : Math.max(0.05, s.bootT));
    }

    if (s.kind === "bay" && s.rect) {
      const ghost = ghostFor(s);
      if (ghost) {
        entry.segs = ghost.buf;
        entry.segCount = ghost.count;
        entry.segGain = 0.032;
        entry.core = 0.009;
      }
    }

    if (s.id === "transmit" && s.rect) {
      entry.waveIdx = 4;
      entry.tint = 1;
      if (s.spike > 0.04) {
        const g = safedFor(s);
        entry.segs = g.buf;
        entry.segCount = g.count;
        entry.segGain = 1.5 * s.spike;
        entry.core = 0.010;
      }
    }

    if (s.kind === "hero" && s.rect) {
      ensureHeroLayout(s.rect.width);
      entry.runA = true;
      entry.boot = hero.phase === "park" ? Math.min(0.999, hero.t / 0.5) : 1;
      const L = hero.layout;
      const aspect = s.rect.width / Math.max(1, s.rect.height);
      const sc = Math.min((aspect * 0.84) / L.width, 0.62 / L.height);
      const x0 = (aspect - L.width * sc) / 2;
      const y0 = (1 - L.height * sc) / 2;
      const yOff = trig * 0.55;
      const mapX = (gx) => x0 + gx * sc;
      const mapY = (gy) => 1 - (y0 + gy * sc) - yOff;
      entry.core = hero.stacked ? 0.011 : 0.0085;
      entry.segGain = hero.stacked ? 2.1 : 1.9;
      entry.emax = 2.4;
      // Fast decay while drawing gives the age gradient; the hold phase
      // decays gently while the refresh cursor re-excites the phrase
      entry.decay = hero.layout && hero.s >= hero.layout.total ? 0.995 : 0.985;

      const putSegs = (raw, mx, my) => {
        if (raw.length > MAX_SEGS) raw = raw.slice(raw.length - MAX_SEGS);
        for (let i = 0; i < raw.length; i++) {
          segBuf[i * 4] = mx(raw[i][0]);
          segBuf[i * 4 + 1] = my(raw[i][1]);
          segBuf[i * 4 + 2] = mx(raw[i][2]);
          segBuf[i * 4 + 3] = my(raw[i][3]);
        }
        entry.segs = segBuf;
        entry.segCount = raw.length;
      };

      if (hero.phase === "park") {
        // Beam warms up parked at the left edge before the self test
        entry.headUv = [0.07, 0.5];
        entry.headGain = 0.9 * (0.55 + 0.45 * Math.sin(hero.t * 7));
      } else if (hero.phase === "selftest") {
        // The instrument proves itself in small print before it speaks
        if (!hero.selftest) hero.selftest = strokeLayout("SELF TEST", { tracking: 2.6 });
        const ST = hero.selftest;
        const stc = 0.10 / ST.height;
        const stx = (gx) => 0.10 + gx * stc;
        const sty = (gy) => 1 - (0.78 + gy * stc);
        const stS = Math.min(1, (hero.t - 0.5) / 0.95) * ST.total;
        putSegs(segmentsForRange(ST, 0, stS), stx, sty);
        entry.core = 0.006;
        entry.segGain = 1.5;
        const hp = endPoint(ST, stS);
        entry.headUv = [stx(hp[0]) / aspect, sty(hp[1])];
        entry.headGain = stS < ST.total ? 1.8 : 0.4;
      } else if (hero.phase === "draw") {
        if (hero.s < L.total) {
          putSegs(segmentsForRange(L, hero.sPrev, hero.s), mapX, mapY);
          hero.lastSegCount = entry.segCount;
          const hp = endPoint(L, hero.s);
          entry.headUv = [mapX(hp[0]) / aspect, mapY(hp[1])];
          entry.headGain = 2.6;
        } else {
          // Hold: refresh cursor sweeps the finished phrase
          let raw;
          if (hero.holdS >= hero.holdPrev) {
            raw = segmentsForRange(L, hero.holdPrev, hero.holdS);
          } else {
            raw = segmentsForRange(L, hero.holdPrev, L.total)
              .concat(segmentsForRange(L, 0, hero.holdS));
          }
          putSegs(raw, mapX, mapY);
          entry.segGain = 1.35;
          const hp = endPoint(L, reduced ? L.total : hero.holdS);
          entry.headUv = [mapX(hp[0]) / aspect, mapY(hp[1])];
          entry.headGain = reduced ? 0.5 : 0.7;
        }
      }
    }
    return entry;
  }

  // Static ghost label segments for a standby bay, cached per aspect bucket
  const ghostCache = new Map();
  function ghostFor(s) {
    const text = BAY_GHOSTS[s.id];
    if (!text) return null;
    const aspect = s.rect.width / Math.max(1, s.rect.height);
    const key = s.id + "|" + Math.round(aspect * 20);
    let g = ghostCache.get(key);
    if (g) return g;
    const L = strokeLayout(text, { tracking: 2.4 });
    const sc = 0.22 / L.height;
    const x0 = aspect - L.width * sc - 0.22;
    const yTop = 0.62;
    const buf = new Float32Array(MAX_SEGS * 4);
    let count = 0;
    for (const seg of L.segs) {
      if (count >= MAX_SEGS) break;
      buf[count * 4] = x0 + seg.ax * sc;
      buf[count * 4 + 1] = 1 - (yTop + seg.ay * sc);
      buf[count * 4 + 2] = x0 + seg.bx * sc;
      buf[count * 4 + 3] = 1 - (yTop + seg.by * sc);
      count++;
    }
    g = { buf, count };
    ghostCache.set(key, g);
    return g;
  }

  // SAFED refusal burn for the transmit strip, cached per aspect bucket
  const safedCache = new Map();
  function safedFor(s) {
    const aspect = s.rect.width / Math.max(1, s.rect.height);
    const key = Math.round(aspect * 10);
    let g = safedCache.get(key);
    if (g) return g;
    const L = strokeLayout("SAFED", { tracking: 2.6 });
    const sc = 0.34 / L.height;
    const x0 = (aspect - L.width * sc) / 2;
    const yTop = 0.33;
    const buf = new Float32Array(MAX_SEGS * 4);
    let count = 0;
    for (const seg of L.segs) {
      if (count >= MAX_SEGS) break;
      buf[count * 4] = x0 + seg.ax * sc;
      buf[count * 4 + 1] = 1 - (yTop + seg.ay * sc);
      buf[count * 4 + 2] = x0 + seg.bx * sc;
      buf[count * 4 + 3] = 1 - (yTop + seg.by * sc);
      count++;
    }
    g = { buf, count };
    safedCache.set(key, g);
    return g;
  }

  return {
    scopes,
    stats,
    readRects,
    update,
    setKnob(id, v01) {
      if (knobs[id]) knobs[id].t = Math.min(1, Math.max(0, v01));
    },
    spike(id) {
      const s = scopes.find((x) => x.id === id);
      if (s) s.spike = 1;
    },
    skipBoot: finishBoot,
    debug() {
      return {
        phase: hero.phase, t: hero.t, s: hero.s, sPrev: hero.sPrev,
        total: hero.layout ? hero.layout.total : null,
        lastSegCount: hero.lastSegCount ?? null
      };
    },
    onBoot(cb) {
      if (hero.phase === "draw") cb();
      else bootCb = cb;
    },
    heroComplete() {
      return hero.layout ? hero.s >= hero.layout.total : false;
    },
    setReduced() {
      reduced = true;
      finishBoot();
      for (const s of scopes) {
        s.bootT = 1;
        if (s.kind === "channel" || s.kind === "dut") {
          s.target = CAPS[s.id] ?? 0.6;
          s.resolve = s.target;
        }
      }
    },
    resetHero() {
      hero.s = 0;
      hero.sPrev = 0;
      hero.holdS = 0;
      hero.holdPrev = 0;
      hero.pause = 0;
    }
  };
}
