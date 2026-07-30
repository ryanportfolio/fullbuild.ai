// PHOSPHOR runtime: progressive enhancement only. The page is complete
// without this file (baked PNGs + full static transcripts). This adds the
// boot beam sweep, ambient drift, the live spectrum, the console replays,
// beam-pass heading flashes, and small wit.
import {
  blueNoise64, heroState, renderSpectrum, fieldToRGBA, SEED,
} from './dither.mjs';

document.documentElement.classList.remove('no-js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- reveal (kept from v1, the smooth staggered fade-in) ----------
const reveals = [...document.querySelectorAll('.reveal')];
if (reduced) {
  reveals.forEach((el) => el.classList.add('on'));
} else {
  const order = new Map(reveals.map((el, i) => [el, i]));
  let queued = 0;
  let last = 0;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || e.target.classList.contains('on')) continue;
      const now = performance.now();
      const wait = now - last > 400 ? 0 : (queued += 1) * 70;
      if (now - last > 400) queued = 0;
      last = now;
      setTimeout(() => e.target.classList.add('on'), wait);
      io.unobserve(e.target);
    }
  }, { threshold: 0.15 });
  reveals.sort((a, b) => order.get(a) - order.get(b)).forEach((el) => io.observe(el));
}

// ---------- the beam passes each heading: blue flash, slow settle ----------
if (!reduced) {
  const h2s = [...document.querySelectorAll('h2')];
  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('excited');
      setTimeout(() => e.target.classList.remove('excited'), 260);
      obs.unobserve(e.target);
    }
  }, { threshold: 0.9 });
  h2s.forEach((h) => io.observe(h));
}

// ---------- console replays (recall demo, spin-up demo) ----------
for (const box of document.querySelectorAll('[data-replay]')) {
  if (reduced) continue; // static full transcript
  box.classList.add('js-replay');
  const lines = [...box.querySelectorAll('.ln')];
  let i = 0;
  const step = () => {
    lines.forEach((l, j) => {
      l.classList.toggle('shown', j < i);
      l.classList.toggle('cur', j === i - 1 && i <= lines.length);
    });
    if (i < lines.length) {
      i += 1;
      const next = lines[i - 1];
      setTimeout(step, next && next.classList.contains('gap') ? 900 : 460);
    } else {
      lines.forEach((l) => l.classList.remove('cur'));
      i = 0;
      setTimeout(step, 3600); // hold the finished transcript, then power cycle
    }
  };
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      obs.disconnect();
      i = 1;
      step();
    }
  }, { threshold: 0.35 }).observe(box);
}

// ---------- shared engine state ----------
const tile = blueNoise64(SEED);
const factsP = fetch('/harness-firmware/facts.json').then((r) => r.json());

// ---------- hero field ----------
const hero = document.getElementById('hero');
const canvas = document.getElementById('hero-field');
const title = document.getElementById('hero-title');

async function bootHero() {
  try {
    await Promise.race([
      document.fonts.load('900 100px Unbounded'),
      new Promise((res) => setTimeout(res, 1200)),
    ]);
  } catch { /* fall back to whatever renders */ }

  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
  const scale = dpr / 2; // field at half CSS resolution
  const w = Math.max(64, Math.round(hero.clientWidth * scale));
  const h = Math.max(64, Math.round(hero.clientHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // excitation mask: headline glyph alpha at field resolution, ambient 0.25
  const off = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  octx.clearRect(0, 0, w, h);
  octx.fillStyle = '#fff';
  const heroRect = hero.getBoundingClientRect();
  for (const span of title.querySelectorAll('.hl')) {
    const r = span.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(span.parentElement).fontSize) * scale;
    octx.font = `900 ${fs}px Unbounded, sans-serif`;
    octx.textBaseline = 'top';
    octx.fillText(span.textContent, (r.left - heroRect.left) * scale, (r.top - heroRect.top) * scale);
  }
  const alpha = octx.getImageData(0, 0, w, h).data;
  const mask = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = alpha[i * 4 + 3] > 96 ? 1 : 0.25;
  }

  const img = ctx.createImageData(w, h);
  const draw = (t, driftT) => {
    const sweep = 0.9; // beam takes 900 ms to cross
    const rowAge = (y) => t - (y / h) * sweep;
    const field = heroState(mask, w, h, tile, rowAge, driftT);
    fieldToRGBA(field, img.data);
    ctx.putImageData(img, 0, 0);
  };

  if (reduced) {
    draw(60, 0); // steady state, single frame, no loop
    return;
  }

  title.classList.add('charging');
  let start = performance.now();
  let driftT = 0;
  let raf = 0;
  let idleTimer = 0;
  let heroVisible = true;

  const sweepFrame = (now) => {
    const t = (now - start) / 1000;
    draw(t, driftT);
    if (t < 2.2) {
      if (t > 0.75) title.classList.remove('charging');
      raf = requestAnimationFrame(sweepFrame);
    } else {
      title.classList.remove('charging');
      idle();
    }
  };
  const idle = () => {
    clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      if (document.hidden || !heroVisible) return;
      driftT += 1;
      draw(60, driftT); // ambient drift only; the burn is steady
    }, 90);
  };
  new IntersectionObserver((entries) => {
    heroVisible = entries.some((e) => e.isIntersecting);
  }).observe(hero);

  const sweep = () => {
    cancelAnimationFrame(raf);
    clearInterval(idleTimer);
    start = performance.now();
    raf = requestAnimationFrame(sweepFrame);
  };
  sweep();

  // leave the tab: memory holds. come back: one full beam sweep
  const baseTitle = document.title;
  addEventListener('blur', () => { document.title = 'memory retained · harness firmware'; });
  addEventListener('focus', () => {
    if (document.title !== baseTitle) {
      document.title = baseTitle;
      sweep();
    }
  });
}
if (canvas && hero && title) bootHero();

// ---------- live spectrum ----------
async function bootSpectrum() {
  const stage = document.getElementById('spectrum');
  const readout = document.getElementById('spectrum-readout');
  if (!stage || !readout) return;
  const facts = await factsP;
  const W = 1200;
  const H = 420;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  let geo;
  const paint = (excited) => {
    const r = renderSpectrum(facts, W, H, tile, excited);
    geo = r.geo;
    fieldToRGBA(r.field, img.data);
    ctx.putImageData(img, 0, 0);
  };
  paint(null);
  const bakeImg = stage.querySelector('img');
  bakeImg.classList.add('hidden');
  bakeImg.after(cv);

  let current = null;
  const pick = (clientX) => {
    const rect = cv.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(geo.bands.length - 1, Math.floor(x / (geo.bandW + geo.gap))));
    return geo.bands[i];
  };
  const excite = (band) => {
    if (!band || band.name === current) return;
    current = band.name;
    paint(reduced ? null : band.name);
    readout.textContent = `${band.name} · ${band.bytes.toLocaleString('en-US')} B · ${band.blocks} blocks · ${band.hexOffset}`;
    if (!reduced) {
      clearTimeout(excite.decay);
      excite.decay = setTimeout(() => { paint(null); current = null; }, 700);
    }
  };
  cv.addEventListener('pointermove', (e) => excite(pick(e.clientX)));
  cv.addEventListener('pointerdown', (e) => excite(pick(e.clientX)));
  cv.addEventListener('pointerleave', () => {
    clearTimeout(excite.decay);
    paint(null);
    current = null;
  });
}
bootSpectrum();
