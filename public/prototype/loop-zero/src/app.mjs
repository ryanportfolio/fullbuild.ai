const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealItems = [...document.querySelectorAll('.reveal')];

const revealAll = () => {
  for (const item of revealItems) item.classList.add('is-visible');
};

let revealObserver;

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.12,
  });

  for (const item of revealItems) revealObserver.observe(item);
} else {
  revealAll();
}

for (const button of document.querySelectorAll('.faq-item button')) {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const answerId = button.getAttribute('aria-controls');
    const answer = answerId ? document.getElementById(answerId) : null;

    button.setAttribute('aria-expanded', String(!expanded));
    if (answer) answer.hidden = expanded;
  });
}

const siteHeader = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');

navToggle?.addEventListener('click', () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!expanded));
  navToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  siteHeader?.classList.toggle('is-open', !expanded);
});

siteHeader?.querySelector('nav')?.addEventListener('click', () => {
  navToggle?.setAttribute('aria-expanded', 'false');
  navToggle?.setAttribute('aria-label', 'Open navigation');
  siteHeader.classList.remove('is-open');
});

const haloCanvas = document.querySelector('#loop-zero-halo');
const gridCanvas = document.querySelector('#loop-zero-grid');
const heroGraphic = document.querySelector('.hero__graphic');
const haloContext = haloCanvas?.getContext('2d');
const gridContext = gridCanvas?.getContext('2d');
let canvasWidth = 0;
let canvasHeight = 0;
let canvasRatio = 1;
let animationFrame = 0;
let heroIsVisible = true;

const resizeCanvas = () => {
  if (!heroGraphic || !haloCanvas || !gridCanvas) return false;

  const bounds = heroGraphic.getBoundingClientRect();
  const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const nextWidth = Math.max(1, Math.round(bounds.width));
  const nextHeight = Math.max(1, Math.round(bounds.height));
  const changed = nextWidth !== canvasWidth || nextHeight !== canvasHeight || nextRatio !== canvasRatio;

  if (!changed) return false;
  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  canvasRatio = nextRatio;

  for (const canvas of [haloCanvas, gridCanvas]) {
    canvas.width = Math.round(canvasWidth * canvasRatio);
    canvas.height = Math.round(canvasHeight * canvasRatio);
  }

  return true;
};

function drawHalo(time = 0) {
  if (!haloContext || !canvasWidth || !canvasHeight) return;

  const context = haloContext;
  const phase = Math.sin(time * 0.00014) * 4;
  const centerX = canvasWidth * 0.5;
  const centerY = (canvasWidth <= 720 ? 210 : 244) + phase;
  const radiusX = Math.min(255, canvasWidth * .46);
  const radiusY = radiusX * .43;

  context.setTransform(canvasRatio, 0, 0, canvasRatio, 0, 0);
  context.clearRect(0, 0, canvasWidth, canvasHeight);

  context.save();
  context.translate(centerX, centerY);
  context.scale(1, .58);
  const aura = context.createRadialGradient(0, 0, radiusX * .6, 0, 0, radiusX * 1.55);
  aura.addColorStop(0, 'rgba(126, 67, 255, .54)');
  aura.addColorStop(.42, 'rgba(45, 73, 255, .34)');
  aura.addColorStop(.7, 'rgba(35, 83, 224, .13)');
  aura.addColorStop(1, 'rgba(16, 17, 20, 0)');
  context.fillStyle = aura;
  context.beginPath();
  context.arc(0, 0, radiusX * 1.55, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.globalCompositeOperation = 'screen';
  const rim = context.createLinearGradient(centerX - radiusX, 0, centerX + radiusX, 0);
  rim.addColorStop(0, 'rgba(53, 98, 255, 0)');
  rim.addColorStop(.22, 'rgba(51, 90, 255, .45)');
  rim.addColorStop(.54, 'rgba(166, 74, 255, .62)');
  rim.addColorStop(.82, 'rgba(41, 102, 255, .34)');
  rim.addColorStop(1, 'rgba(53, 98, 255, 0)');
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, Math.PI, Math.PI * 2);
  context.strokeStyle = rim;
  context.lineWidth = 2;
  context.shadowColor = 'rgba(72, 74, 255, .85)';
  context.shadowBlur = 34;
  context.stroke();
  context.restore();

  context.save();
  context.beginPath();
  context.ellipse(centerX, centerY + 1, radiusX - 2, radiusY - 2, 0, 0, Math.PI * 2);
  context.fillStyle = '#101114';
  context.fill();
  context.restore();

  for (let index = 0; index < 46; index += 1) {
    const x = ((index * 137.5) % canvasWidth);
    const y = 26 + ((index * 67) % 190);
    const flicker = 0.045 + 0.035 * Math.sin(time * 0.001 + index * 1.7);
    context.fillStyle = `rgba(168, 179, 255, ${Math.max(0.015, flicker)})`;
    context.fillRect(x, y, index % 7 === 0 ? 2 : 1, 1);
  }
}

function drawGrid(time = 0) {
  if (!gridContext || !canvasWidth || !canvasHeight) return;

  const context = gridContext;
  const spacing = 147;
  const drift = reducedMotion.matches || root.dataset.capture === 'settled'
    ? 0
    : (time * 0.0014) % spacing;

  context.setTransform(canvasRatio, 0, 0, canvasRatio, 0, 0);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.lineWidth = 1;

  for (let x = (canvasWidth % spacing) / 2; x <= canvasWidth; x += spacing) {
    context.beginPath();
    context.moveTo(Math.round(x) + .5, 0);
    context.lineTo(Math.round(x) + .5, canvasHeight);
    context.strokeStyle = 'rgba(207, 211, 235, 0.035)';
    context.stroke();
  }

  for (let y = -spacing + drift; y <= canvasHeight; y += spacing) {
    context.beginPath();
    context.moveTo(0, Math.round(y) + .5);
    context.lineTo(canvasWidth, Math.round(y) + .5);
    context.strokeStyle = 'rgba(207, 211, 235, 0.032)';
    context.stroke();
  }

  for (let index = 0; index < 24; index += 1) {
    const x = ((index * 293) + 41) % canvasWidth;
    const y = ((index * 131) + drift) % canvasHeight;
    const alpha = 0.06 + ((index % 4) * 0.016);
    context.fillStyle = `rgba(128, 145, 220, ${alpha})`;
    context.fillRect(x, y, index % 3 === 0 ? 11 : 2, 1);
  }
}

const renderFrame = (time = 0) => {
  resizeCanvas();
  drawHalo(time);
  drawGrid(time);
};

const animateHero = (time) => {
  animationFrame = 0;
  renderFrame(time);

  if (!reducedMotion.matches && heroIsVisible && !document.hidden && root.dataset.capture !== 'settled') {
    animationFrame = requestAnimationFrame(animateHero);
  }
};

const requestHeroFrame = () => {
  if (animationFrame || reducedMotion.matches || root.dataset.capture === 'settled') {
    renderFrame(4200);
    return;
  }
  animationFrame = requestAnimationFrame(animateHero);
};

if (heroGraphic && 'IntersectionObserver' in window) {
  const heroObserver = new IntersectionObserver(([entry]) => {
    heroIsVisible = entry.isIntersecting;
    if (heroIsVisible) requestHeroFrame();
    else if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  });
  heroObserver.observe(heroGraphic);
}

new ResizeObserver(() => {
  resizeCanvas();
  renderFrame(4200);
}).observe(heroGraphic);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else if (!document.hidden && heroIsVisible) {
    requestHeroFrame();
  }
});

const planets = [...document.querySelectorAll('.planet')];
let scrollFrame = 0;

const updateParallax = () => {
  scrollFrame = 0;
  if (reducedMotion.matches || root.dataset.capture === 'settled') {
    for (const planet of planets) planet.style.removeProperty('--planet-shift');
    return;
  }

  const viewportCenter = window.innerHeight / 2;
  for (const planet of planets) {
    const bounds = planet.parentElement.getBoundingClientRect();
    const progress = (viewportCenter - (bounds.top + bounds.height / 2)) / window.innerHeight;
    const shift = Math.max(-12, Math.min(34, progress * 45));
    planet.style.setProperty('--planet-shift', `${shift.toFixed(2)}px`);
  }
};

window.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateParallax);
}, { passive: true });

const settle = () => {
  root.dataset.capture = 'settled';
  revealAll();
  revealObserver?.disconnect();
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  renderFrame(4200);
  updateParallax();
};

const release = () => {
  delete root.dataset.capture;
  if (heroIsVisible) requestHeroFrame();
  updateParallax();
};

window.__loopZeroCapture = { settle, release };

window.addEventListener('load', () => {
  renderFrame(4200);
  updateParallax();
  requestAnimationFrame(() => root.classList.add('is-ready'));
}, { once: true });
