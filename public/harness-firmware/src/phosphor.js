// PHOSPHOR runtime: progressive enhancement only. The page is complete
// without this file (baked PNGs + full static transcripts). This adds CHARGE,
// DECAY, and RETAIN: the boot field, measured spectrum selection, replayable
// consoles, live motion preferences, and deterministic capture states.
import {
  blueNoise64, heroState, renderSpectrum, fieldToRGBA, SEED,
} from './dither.mjs';

document.documentElement.classList.remove('no-js');

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
let captureFrozen = false;
const captureBeats = ['cold', 'charge', 'retained'];
let captureBeat = 'retained';
let heroController = null;
let spectrumController = null;
const replayControllers = [];
const revealTimers = new Set();
const skillSourceBase = 'https://github.com/ryanportfolio/Harness-Firmware/blob/d9cd99f5d6126d58918e117b584369dd610f4f59/.claude/skills';

// ---------- reveal: ordered once, with a complete static floor ----------
const reveals = [...document.querySelectorAll('.reveal')];
const revealOrder = new Map(reveals.map((el, i) => [el, i]));
let revealQueued = 0;
let revealLast = 0;
const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting || entry.target.classList.contains('on')) continue;
    if (reduced || captureFrozen) {
      entry.target.classList.add('on');
      revealObserver.unobserve(entry.target);
      continue;
    }
    const now = performance.now();
    const wait = now - revealLast > 400 ? 0 : (revealQueued += 1) * 70;
    if (now - revealLast > 400) revealQueued = 0;
    revealLast = now;
    const timer = setTimeout(() => {
      entry.target.classList.add('on');
      revealTimers.delete(timer);
    }, wait);
    revealTimers.add(timer);
    revealObserver.unobserve(entry.target);
  }
}, { threshold: 0.15 });

if (reduced) reveals.forEach((el) => el.classList.add('on'));
else reveals.sort((a, b) => revealOrder.get(a) - revealOrder.get(b)).forEach((el) => revealObserver.observe(el));

// ---------- heading charge: blue arrives, persistent green remains ----------
const headingObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting || reduced || captureFrozen) continue;
    entry.target.classList.add('excited');
    const timer = setTimeout(() => {
      entry.target.classList.remove('excited');
      revealTimers.delete(timer);
    }, 260);
    revealTimers.add(timer);
    headingObserver.unobserve(entry.target);
  }
}, { threshold: 0.9 });
document.querySelectorAll('h2').forEach((heading) => headingObserver.observe(heading));

// ---------- console replays: timers exist only while evidence is visible ----------
function createReplay(box) {
  const lines = [...box.querySelectorAll('.ln')];
  let timer = 0;
  let index = 0;
  let visible = false;

  const clear = () => {
    clearTimeout(timer);
    timer = 0;
  };

  const showStatic = () => {
    clear();
    box.classList.remove('js-replay');
    lines.forEach((line) => line.classList.remove('shown', 'cur'));
  };

  const render = () => {
    lines.forEach((line, lineIndex) => {
      line.classList.toggle('shown', lineIndex < index);
      line.classList.toggle('cur', lineIndex === index - 1 && index <= lines.length);
    });
  };

  const step = () => {
    clear();
    if (!visible || reduced || captureFrozen) return;
    render();
    if (index < lines.length) {
      index += 1;
      const next = lines[index - 1];
      timer = setTimeout(step, next?.classList.contains('gap') ? 900 : 460);
    } else {
      lines.forEach((line) => line.classList.remove('cur'));
      index = 0;
      timer = setTimeout(step, 3600);
    }
  };

  const start = () => {
    clear();
    if (!visible || reduced || captureFrozen) {
      if (reduced) showStatic();
      return;
    }
    box.classList.add('js-replay');
    index = 1;
    render();
    timer = setTimeout(step, 460);
  };

  const stop = (complete = false) => {
    clear();
    if (complete) showStatic();
  };

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) start();
    else stop(false);
  }, { threshold: 0.35 });
  observer.observe(box);

  return {
    stop,
    resume: start,
    setReduced(value) {
      if (value) showStatic();
      else if (visible) start();
    },
  };
}

for (const box of document.querySelectorAll('[data-replay]')) {
  replayControllers.push(createReplay(box));
}

// ---------- shared engine state ----------
const tile = blueNoise64(SEED);
const factsP = fetch('/harness-firmware/facts.json').then((response) => {
  if (!response.ok) throw new Error(`facts.json returned ${response.status}`);
  return response.json();
});

// ---------- hero field: one loop, resize-safe, capture-safe ----------
const hero = document.getElementById('hero');
const canvas = document.getElementById('hero-field');
const title = document.getElementById('hero-title');

async function bootHero() {
  try {
    await Promise.race([
      document.fonts.load('900 100px Unbounded'),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch { /* render with the available face */ }

  let ctx = null;
  let mask = null;
  let image = null;
  let width = 0;
  let height = 0;
  let drift = 0;
  let raf = 0;
  let idleTimer = 0;
  let resizeTimer = 0;
  let visible = true;
  let resizeReady = false;
  let visibilityReady = false;
  let startTime = 0;

  const stop = () => {
    cancelAnimationFrame(raf);
    clearInterval(idleTimer);
    raf = 0;
    idleTimer = 0;
  };

  const allocate = () => {
    const dpr = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
    const scale = dpr / 2;
    width = Math.max(64, Math.round(hero.clientWidth * scale));
    height = Math.max(64, Math.round(hero.clientHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');

    const offscreen = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offscreenContext = offscreen.getContext('2d');
    offscreenContext.clearRect(0, 0, width, height);
    offscreenContext.fillStyle = '#fff';
    const heroRect = hero.getBoundingClientRect();
    for (const span of title.querySelectorAll('.hl')) {
      const rect = span.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(span.parentElement).fontSize) * scale;
      offscreenContext.font = `900 ${fontSize}px Unbounded, sans-serif`;
      offscreenContext.textBaseline = 'top';
      offscreenContext.fillText(
        span.textContent,
        (rect.left - heroRect.left) * scale,
        (rect.top - heroRect.top) * scale,
      );
    }

    const alpha = offscreenContext.getImageData(0, 0, width, height).data;
    mask = new Float32Array(width * height);
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = alpha[i * 4 + 3] > 96 ? 1 : 0.25;
    }
    image = ctx.createImageData(width, height);
  };

  const draw = (age, driftFrame = drift) => {
    if (!ctx || !mask || !image) return;
    const sweepSeconds = 0.9;
    const rowAge = (y) => age - (y / height) * sweepSeconds;
    const field = heroState(mask, width, height, tile, rowAge, driftFrame);
    fieldToRGBA(field, image.data);
    ctx.putImageData(image, 0, 0);
  };

  const idle = () => {
    stop();
    if (captureFrozen) {
      hold(captureBeat);
      return;
    }
    title.classList.remove('charging');
    if (reduced || !visible || document.hidden) {
      draw(60, drift);
      return;
    }
    idleTimer = setInterval(() => {
      if (document.hidden || !visible || reduced || captureFrozen) return;
      drift += 1;
      draw(60, drift);
    }, 90);
  };

  const sweepFrame = (now) => {
    const age = (now - startTime) / 1000;
    draw(age, drift);
    if (age < 2.2 && !reduced && !captureFrozen && visible) {
      if (age > 0.75) title.classList.remove('charging');
      raf = requestAnimationFrame(sweepFrame);
    } else {
      idle();
    }
  };

  const sweep = () => {
    stop();
    if (captureFrozen) {
      hold(captureBeat);
      return;
    }
    if (reduced || !visible) {
      title.classList.remove('charging');
      draw(60, drift);
      return;
    }
    title.classList.add('charging');
    startTime = performance.now();
    raf = requestAnimationFrame(sweepFrame);
  };

  const hold = (beat = 'retained') => {
    const beats = { cold: 0.18, charge: 0.82, retained: 60 };
    if (!captureBeats.includes(beat)) throw new Error(`Unknown capture beat: ${beat}`);
    stop();
    title.classList.toggle('charging', beat === 'cold');
    draw(beats[beat], 0);
    return beat;
  };

  const resize = () => {
    stop();
    allocate();
    if (captureFrozen) hold(captureBeat);
    else if (reduced) hold('retained');
    else {
      title.classList.remove('charging');
      draw(60, drift);
      if (visible) idle();
    }
  };

  allocate();
  if (captureFrozen) hold(captureBeat);
  else if (reduced) hold('retained');
  else sweep();

  new ResizeObserver(() => {
    if (!resizeReady) {
      resizeReady = true;
      return;
    }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }).observe(hero);

  new IntersectionObserver((entries) => {
    const nextVisible = entries.some((entry) => entry.isIntersecting);
    if (!visibilityReady) {
      visibilityReady = true;
      visible = nextVisible;
      if (!visible) stop();
      return;
    }
    if (nextVisible === visible) return;
    visible = nextVisible;
    if (visible) {
      if (captureFrozen) hold(captureBeat);
      else if (reduced) hold('retained');
      else idle();
    } else {
      stop();
    }
  }).observe(hero);

  const baseTitle = document.title;
  addEventListener('blur', () => {
    document.title = 'memory retained · harness firmware';
    stop();
  });
  addEventListener('focus', () => {
    if (document.title !== baseTitle) document.title = baseTitle;
    if (visible && !captureFrozen) sweep();
  });

  return {
    stop,
    hold,
    resume() {
      if (reduced) hold('retained');
      else if (visible) idle();
    },
    setReduced(value) {
      if (captureFrozen) hold(captureBeat);
      else if (value) hold('retained');
      else if (!captureFrozen && visible) sweep();
    },
  };
}

if (canvas && hero && title) {
  bootHero().then((controller) => {
    heroController = controller;
    if (captureFrozen) heroController.hold(captureBeat);
  });
}

// ---------- live spectrum: pointer, touch, and keyboard share one model ----------
async function bootSpectrum() {
  const stage = document.getElementById('spectrum');
  const readout = document.getElementById('spectrum-readout');
  if (!stage || !readout) return null;

  const facts = await factsP;
  const width = 1200;
  const height = 420;
  const liveCanvas = document.createElement('canvas');
  liveCanvas.width = width;
  liveCanvas.height = height;
  liveCanvas.setAttribute('aria-hidden', 'true');
  const context = liveCanvas.getContext('2d');
  const image = context.createImageData(width, height);
  let geometry = null;
  let selectedIndex = 0;
  let currentName = null;
  let decayTimer = 0;

  const paint = (excitedName = null) => {
    const rendered = renderSpectrum(facts, width, height, tile, excitedName);
    geometry = rendered.geo;
    fieldToRGBA(rendered.field, image.data);
    context.putImageData(image, 0, 0);
  };

  const clearDecay = () => {
    clearTimeout(decayTimer);
    decayTimer = 0;
  };

  const select = (index, shouldDecay = true) => {
    selectedIndex = Math.max(0, Math.min(geometry.bands.length - 1, index));
    const band = geometry.bands[selectedIndex];
    clearDecay();
    if (band.name === currentName) {
      if (shouldDecay && !reduced && !captureFrozen) {
        decayTimer = setTimeout(() => {
          paint(null);
          currentName = null;
        }, 700);
      }
      return;
    }

    currentName = band.name;
    paint(band.name);
    const name = document.createElement('strong');
    name.textContent = band.name;
    readout.href = `${skillSourceBase}/${band.name}/SKILL.md`;
    readout.replaceChildren(
      name,
      document.createTextNode(` · ${band.bytes.toLocaleString('en-US')} B · main instruction file`),
    );
    if (shouldDecay && !reduced && !captureFrozen) {
      decayTimer = setTimeout(() => {
        paint(null);
        currentName = null;
      }, 700);
    }
  };

  const pickIndex = (clientX) => {
    const rect = liveCanvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    return Math.max(
      0,
      Math.min(geometry.bands.length - 1, Math.floor(x / (geometry.bandW + geometry.gap))),
    );
  };

  const ensureBandVisible = () => {
    const band = geometry.bands[selectedIndex];
    const scale = liveCanvas.getBoundingClientRect().width / width;
    const bandLeft = band.x * scale;
    const bandRight = (band.x + band.w) * scale;
    const gutter = Math.min(24, stage.clientWidth * 0.08);
    const viewLeft = stage.scrollLeft;
    const viewRight = viewLeft + stage.clientWidth;

    if (bandLeft < viewLeft + gutter) {
      stage.scrollLeft = Math.max(0, bandLeft - gutter);
    } else if (bandRight > viewRight - gutter) {
      stage.scrollLeft = Math.min(stage.scrollWidth - stage.clientWidth, bandRight - stage.clientWidth + gutter);
    }
  };

  paint(null);
  const bakedImage = stage.querySelector('img');
  bakedImage.classList.add('hidden');
  bakedImage.after(liveCanvas);

  liveCanvas.addEventListener('pointermove', (event) => select(pickIndex(event.clientX)));
  liveCanvas.addEventListener('pointerdown', (event) => select(pickIndex(event.clientX), false));
  liveCanvas.addEventListener('pointerleave', () => {
    if (document.activeElement === stage) return;
    clearDecay();
    paint(null);
    currentName = null;
  });

  stage.addEventListener('focus', () => {
    select(selectedIndex, false);
    ensureBandVisible();
  });
  stage.addEventListener('keydown', (event) => {
    const next = {
      ArrowLeft: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      Home: 0,
      End: geometry.bands.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, false);
    ensureBandVisible();
  });

  return {
    freeze() { clearDecay(); },
    resume() {
      if (currentName) paint(currentName);
    },
    setReduced(value) {
      clearDecay();
      paint(value && currentName ? currentName : null);
    },
  };
}

bootSpectrum().then((controller) => { spectrumController = controller; });

// ---------- live preference changes ----------
function applyMotionPreference(event) {
  reduced = event.matches;
  document.documentElement.classList.toggle('motion-reduced', reduced);
  if (reduced) {
    for (const timer of revealTimers) clearTimeout(timer);
    revealTimers.clear();
    reveals.forEach((element) => element.classList.add('on'));
    document.querySelectorAll('h2.excited').forEach((heading) => heading.classList.remove('excited'));
  }
  replayControllers.forEach((controller) => controller.setReduced(reduced));
  heroController?.setReduced(reduced);
  spectrumController?.setReduced(reduced);
}
motionQuery.addEventListener('change', applyMotionPreference);

// ---------- deterministic evidence hook ----------
function settleCapture() {
  document.documentElement.classList.add('capture-frozen');
  for (const timer of revealTimers) clearTimeout(timer);
  revealTimers.clear();
  reveals.forEach((element) => element.classList.add('on'));
  document.querySelectorAll('h2.excited').forEach((heading) => heading.classList.remove('excited'));
}

window.__capture = {
  beats: captureBeats,
  freeze() {
    captureBeat = 'retained';
    captureFrozen = true;
    settleCapture();
    heroController?.hold(captureBeat);
    replayControllers.forEach((controller) => controller.stop(true));
    spectrumController?.freeze();
  },
  hold(beat = 'retained') {
    if (!captureBeats.includes(beat)) throw new Error(`Unknown capture beat: ${beat}`);
    captureBeat = beat;
    captureFrozen = true;
    settleCapture();
    replayControllers.forEach((controller) => controller.stop(true));
    spectrumController?.freeze();
    heroController?.hold(captureBeat);
    return captureBeat;
  },
  thaw() {
    captureFrozen = false;
    document.documentElement.classList.remove('capture-frozen');
    replayControllers.forEach((controller) => controller.resume());
    spectrumController?.resume();
    heroController?.resume();
  },
};
