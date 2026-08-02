const video = document.querySelector('#farm-film');
const videoSource = video.querySelector('source');
const filmStage = document.querySelector('.film-stage');
const filmShade = document.querySelector('.film-shade');
const siteHeader = document.querySelector('.site-header');
const loadState = document.querySelector('.load-state');
const loadLabel = document.querySelector('.load-state__label');
const loadTrack = document.querySelector('.load-state__track i');
const chapters = [...document.querySelectorAll('[data-chapter-index]')];
const railItems = [...document.querySelectorAll('[data-rail-index]')];
const mapPulse = document.querySelector('.exchange-map__pulse');
const mapBranches = [...document.querySelectorAll('.exchange-map__branch')];
const root = document.documentElement;

// Decoder and motion constants stay visible because they are the tuning surface.
const SCROLL_DAMPING = 11;
const POINTER_DAMPING = 8;
const VIDEO_FRAME_RATE = 48;
const FRAME_DURATION_SECONDS = 1 / VIDEO_FRAME_RATE;
const SEEK_THRESHOLD_SECONDS = FRAME_DURATION_SECONDS * 0.45;
const TARGET_CHANGE_SECONDS = FRAME_DURATION_SECONDS * 0.45;
const MAX_FRAME_DELTA_SECONDS = 0.05;

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(pointer: fine)');
const requestFrame = (callback) => window.requestAnimationFrame(callback);

let videoDuration = 0;
let metadataReady = false;
let targetProgress = 0;
let displayProgress = 0;
let targetPointerX = 0;
let targetPointerY = 0;
let pointerX = 0;
let pointerY = 0;
let activeChapter = -1;
let lastFrameTime = performance.now();
let frameId = 0;
let running = true;

let seekSequence = 0;
let issuedSequence = 0;
let latestSeek = null;
let pendingSeek = null;
let latestRequestedTime = -1;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function readPageProgress() {
  const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return clamp(window.scrollY / maximum);
}

function updateBufferReadout() {
  if (!metadataReady || !videoDuration || !video.buffered.length) return;
  let bufferedEnd = 0;
  for (let index = 0; index < video.buffered.length; index += 1) {
    bufferedEnd = Math.max(bufferedEnd, video.buffered.end(index));
  }
  const buffered = clamp(bufferedEnd / videoDuration);
  loadTrack.style.width = `${Math.round(buffered * 100)}%`;
}

function markFilmReady() {
  filmStage.dataset.frameReady = 'true';
  loadState.hidden = true;
}

function markFilmError() {
  root.dataset.mediaError = 'true';
  loadState.dataset.error = 'true';
  loadLabel.textContent = 'Our Story';
  loadTrack.style.width = '100%';
}

function noteDecodedFrame() {
  if ('requestVideoFrameCallback' in video) {
    video.requestVideoFrameCallback(() => {
      filmStage.dataset.frameReady = 'true';
    });
  }
}

function commitSeek(request) {
  if (!metadataReady || !request || request.id < issuedSequence) return;
  if (latestSeek && request.id < latestSeek.id) return;

  const maxTime = Math.max(0, videoDuration - 0.001);
  const time = clamp(request.time, 0, maxTime);
  if (Math.abs(video.currentTime - time) < SEEK_THRESHOLD_SECONDS) return;

  issuedSequence = request.id;
  try {
    video.currentTime = time;
  } catch {
    pendingSeek = request;
  }
}

function requestSeek(time) {
  if (!metadataReady || !Number.isFinite(time)) return;
  const lastFrame = Math.max(0, videoDuration - FRAME_DURATION_SECONDS);
  const frameTime = clamp(
    Math.round(time * VIDEO_FRAME_RATE) / VIDEO_FRAME_RATE,
    0,
    lastFrame,
  );
  if (Math.abs(frameTime - latestRequestedTime) < TARGET_CHANGE_SECONDS) return;

  latestRequestedTime = frameTime;
  latestSeek = { id: ++seekSequence, time: frameTime };

  if (video.seeking) {
    pendingSeek = latestSeek;
    return;
  }

  commitSeek(latestSeek);
}

function updateChapterState(progress) {
  const lastIndex = Math.max(0, chapters.length - 1);
  const chapterInterval = lastIndex ? 1 / lastIndex : 1;
  const holdRadius = chapterInterval * 0.3;
  const fadeRadius = chapterInterval * 0.5;
  const nearestIndex = Math.min(lastIndex, Math.floor(progress * lastIndex + 0.499999));
  const states = chapters.map((chapter, index) => {
    const anchor = index * chapterInterval;
    const distance = Math.abs(progress - anchor);
    const transition = clamp((distance - holdRadius) / (fadeRadius - holdRadius));
    const signedTransition = Math.sign(progress - anchor) * transition;
    const rawReveal = reducedMotionQuery.matches ? 1 : 1 - transition;
    const reveal = reducedMotionQuery.matches
      ? 1
      : rawReveal * rawReveal * (3 - 2 * rawReveal);
    const hidden = ((1 - reveal) * 100).toFixed(3);
    return {
      reveal,
      clipTop: signedTransition > 0 ? `${hidden}%` : '0%',
      clipBottom: signedTransition < 0 ? `${hidden}%` : '0%',
      shift: reducedMotionQuery.matches ? '0rem' : `${(-signedTransition * 1.6).toFixed(3)}rem`,
    };
  });

  states.forEach((state, index) => {
    const chapter = chapters[index];
    chapter.style.setProperty('--reveal', state.reveal.toFixed(4));
    chapter.style.setProperty('--clip-top', state.clipTop);
    chapter.style.setProperty('--clip-bottom', state.clipBottom);
    chapter.style.setProperty('--shift', state.shift);
  });

  const presence = states[nearestIndex]?.reveal ?? 0;
  const compact = window.innerWidth <= 720;
  const shade = (compact ? 0.28 : 0.12) + presence * (compact ? 0.3 : 0.4);
  filmShade.style.opacity = shade.toFixed(4);

  if (nearestIndex === activeChapter) return;
  activeChapter = nearestIndex;

  chapters.forEach((chapter, index) => {
    chapter.dataset.active = String(index === activeChapter);
  });
  railItems.forEach((item, index) => {
    const active = index === activeChapter;
    item.dataset.active = String(active);
    const link = item.querySelector('a');
    if (active) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  });
}

function renderFrame(now, force = false) {
  const elapsed = clamp((now - lastFrameTime) / 1000, 0, MAX_FRAME_DELTA_SECONDS);
  lastFrameTime = now;
  targetProgress = readPageProgress();

  const scrollAlpha = force ? 1 : 1 - Math.exp(-SCROLL_DAMPING * elapsed);
  const pointerAlpha = force ? 1 : 1 - Math.exp(-POINTER_DAMPING * elapsed);
  displayProgress += (targetProgress - displayProgress) * scrollAlpha;
  pointerX += (targetPointerX - pointerX) * pointerAlpha;
  pointerY += (targetPointerY - pointerY) * pointerAlpha;

  const shownProgress = reducedMotionQuery.matches ? targetProgress : displayProgress;
  siteHeader.style.setProperty('--scroll-progress', shownProgress.toFixed(5));
  video.style.setProperty('--px', `${pointerX.toFixed(2)}px`);
  video.style.setProperty('--py', `${pointerY.toFixed(2)}px`);

  mapPulse.style.strokeDashoffset = String(1 - shownProgress);
  mapBranches[0].style.strokeDashoffset = String(1 - clamp((shownProgress - 0.12) / 0.26));
  mapBranches[1].style.strokeDashoffset = String(1 - clamp((shownProgress - 0.36) / 0.3));

  updateChapterState(shownProgress);

  if (metadataReady) {
    const filmProgress = reducedMotionQuery.matches ? 1 : shownProgress;
    requestSeek(filmProgress * videoDuration);
  }
}

function scheduleFrame() {
  if (!running || frameId) return;
  frameId = requestFrame(tick);
}

function tick(now) {
  frameId = 0;
  renderFrame(now);
  scheduleFrame();
}

function freeze() {
  running = false;
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = 0;
}

function thaw() {
  if (running) return;
  running = true;
  lastFrameTime = performance.now();
  scheduleFrame();
}

function step(milliseconds = 16.67) {
  const now = lastFrameTime + clamp(milliseconds, 0, 1000);
  renderFrame(now, true);
}

function setProgress(value) {
  const progress = clamp(Number(value) || 0);
  const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo(0, maximum * progress);
  targetProgress = progress;
  displayProgress = progress;
  renderFrame(performance.now(), true);
}

video.addEventListener('loadedmetadata', () => {
  videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
  metadataReady = videoDuration > 0;
  video.pause();
  updateBufferReadout();
  renderFrame(performance.now(), true);
});

video.addEventListener('progress', updateBufferReadout);
video.addEventListener('loadeddata', markFilmReady, { once: true });
video.addEventListener('canplay', markFilmReady, { once: true });
video.addEventListener('error', markFilmError, { once: true });
videoSource.addEventListener('error', markFilmError, { once: true });
video.addEventListener('seeked', () => {
  noteDecodedFrame();
  const next = pendingSeek;
  pendingSeek = null;
  if (next && next.id > issuedSequence) commitSeek(next);
});

window.addEventListener('resize', () => {
  renderFrame(performance.now(), true);
}, { passive: true });

if (finePointerQuery.matches) {
  window.addEventListener('pointermove', (event) => {
    if (reducedMotionQuery.matches) return;
    targetPointerX = (event.clientX / window.innerWidth - 0.5) * -9;
    targetPointerY = (event.clientY / window.innerHeight - 0.5) * -6;
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    targetPointerX = 0;
    targetPointerY = 0;
  }, { passive: true });
}

reducedMotionQuery.addEventListener('change', () => {
  targetPointerX = 0;
  targetPointerY = 0;
  renderFrame(performance.now(), true);
});

for (const button of document.querySelectorAll('[data-lens]')) {
  button.addEventListener('click', () => {
    const lens = button.dataset.lens;
    for (const control of document.querySelectorAll('[data-lens]')) {
      control.setAttribute('aria-pressed', String(control === button));
    }
    for (const panel of document.querySelectorAll('[data-lens-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.lensPanel === lens);
    }
  });
}

window.addEventListener('pagehide', freeze);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) thaw();
});

if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  window.__maranathaCapture = { freeze, thaw, step, setProgress };
}

document.fonts.ready.then(() => {
  renderFrame(performance.now(), true);
});
renderFrame(performance.now(), true);
scheduleFrame();
