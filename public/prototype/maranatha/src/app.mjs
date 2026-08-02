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
const root = document.documentElement;

// Decoder and motion constants stay visible because they are the tuning surface.
const SCROLL_DAMPING = 11;
const FLICK_DAMPING_BOOST = 26;
const FLICK_DEADZONE_FRAMES = 8;
const FLICK_SPAN_FRAMES = 15;
const POINTER_DAMPING = 8;
const VIDEO_FRAME_RATE = 48;
const FRAME_DURATION_SECONDS = 1 / VIDEO_FRAME_RATE;
const SEEK_THRESHOLD_SECONDS = FRAME_DURATION_SECONDS * 0.45;
const TARGET_CHANGE_SECONDS = FRAME_DURATION_SECONDS * 0.45;
const SETTLE_THRESHOLD_SECONDS = FRAME_DURATION_SECONDS * 0.6;
const MAX_FRAME_DELTA_SECONDS = 0.05;
const LOAD_STATE_TIMEOUT_MS = 6000;

// Chapter two sits past the quarter mark so its copy holds over the emerging
// green instead of the dark root mass at exactly 25% of the film.
const CHAPTER_ANCHORS = [0, 0.27, 0.5, 0.75, 1];

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
let loopIdle = false;

let seekSequence = 0;
let issuedSequence = 0;
let latestSeek = null;
let pendingSeek = null;
let latestRequestedTime = -1;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const chapterFocusables = chapters.map((chapter) => [...chapter.querySelectorAll('a, button')]);

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
  const fadeRadius = chapterInterval * 0.4;

  let nearestIndex = 0;
  for (let index = 1; index < chapters.length; index += 1) {
    if (Math.abs(progress - CHAPTER_ANCHORS[index]) < Math.abs(progress - CHAPTER_ANCHORS[nearestIndex])) {
      nearestIndex = index;
    }
  }

  const states = chapters.map((chapter, index) => {
    const anchor = CHAPTER_ANCHORS[index];
    const distance = Math.abs(progress - anchor);
    const transition = clamp((distance - holdRadius) / (fadeRadius - holdRadius));
    const signedTransition = Math.sign(progress - anchor) * transition;
    const rawReveal = reducedMotionQuery.matches ? 1 : 1 - transition;
    let reveal = reducedMotionQuery.matches
      ? 1
      : rawReveal * rawReveal * (3 - 2 * rawReveal);
    // Snap the smoothstep tails so a collapsed panel never survives as a
    // sub-pixel band over the film during its clean beats.
    if (reveal < 0.001) reveal = 0;
    else if (reveal > 0.999) reveal = 1;
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
    const visible = String(state.reveal > 0);
    if (chapter.dataset.visible !== visible) {
      chapter.dataset.visible = visible;
      for (const focusable of chapterFocusables[index]) {
        focusable.tabIndex = state.reveal > 0 ? 0 : -1;
      }
    }
  });

  const presence = states[nearestIndex]?.reveal ?? 0;
  const compact = window.innerWidth <= 720;
  const shade = (compact ? 0.28 : 0.12) + presence * (compact ? 0.3 : 0.4);
  filmShade.style.opacity = shade.toFixed(4);

  if (nearestIndex === activeChapter) return;
  // Hysteresis: parking exactly on a boundary must not flicker the rail
  // highlight or chatter aria-current announcements every frame.
  if (activeChapter !== -1) {
    const advantage = Math.abs(progress - CHAPTER_ANCHORS[activeChapter])
      - Math.abs(progress - CHAPTER_ANCHORS[nearestIndex]);
    if (advantage < chapterInterval * 0.04) return;
  }
  activeChapter = nearestIndex;

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

  // Micro-scroll keeps the verified one-frame feel; the boost term only wakes
  // for flick-sized errors so catch-up lands while the gesture still owns it.
  const errorFrames = Math.abs(targetProgress - displayProgress) * videoDuration / FRAME_DURATION_SECONDS;
  const flick = clamp((errorFrames - FLICK_DEADZONE_FRAMES) / FLICK_SPAN_FRAMES);
  const damping = SCROLL_DAMPING + FLICK_DAMPING_BOOST * flick;
  const scrollAlpha = force ? 1 : 1 - Math.exp(-damping * elapsed);
  const pointerAlpha = force ? 1 : 1 - Math.exp(-POINTER_DAMPING * elapsed);
  displayProgress += (targetProgress - displayProgress) * scrollAlpha;
  if (reducedMotionQuery.matches
    || Math.abs(targetProgress - displayProgress) * videoDuration < SETTLE_THRESHOLD_SECONDS) {
    displayProgress = targetProgress;
  }
  pointerX += (targetPointerX - pointerX) * pointerAlpha;
  pointerY += (targetPointerY - pointerY) * pointerAlpha;
  if (Math.abs(targetPointerX - pointerX) < 0.05 && Math.abs(targetPointerY - pointerY) < 0.05) {
    pointerX = targetPointerX;
    pointerY = targetPointerY;
  }

  const shownProgress = reducedMotionQuery.matches ? targetProgress : displayProgress;
  siteHeader.style.setProperty('--scroll-progress', shownProgress.toFixed(5));
  video.style.setProperty('--px', `${pointerX.toFixed(2)}px`);
  video.style.setProperty('--py', `${pointerY.toFixed(2)}px`);

  mapPulse.style.strokeDashoffset = String(1 - shownProgress);

  updateChapterState(shownProgress);

  if (metadataReady) {
    const filmProgress = reducedMotionQuery.matches ? 1 : shownProgress;
    requestSeek(filmProgress * videoDuration);
  }
}

function isSettled() {
  return displayProgress === targetProgress
    && pointerX === targetPointerX
    && pointerY === targetPointerY
    && !pendingSeek
    && !video.seeking;
}

function scheduleFrame() {
  if (!running || frameId) return;
  if (loopIdle) {
    // Waking from idle: restart the clock so the first frame does not consume
    // a stale multi-frame elapsed and overshoot the damping.
    lastFrameTime = performance.now();
    loopIdle = false;
  }
  frameId = requestFrame(tick);
}

function tick(now) {
  frameId = 0;
  renderFrame(now);
  // Idle when converged: the loop stops burning frames while the reader dwells
  // on a chapter; any scroll, pointer, or resize event rearms it.
  if (isSettled()) loopIdle = true;
  else scheduleFrame();
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
  scheduleFrame();
}

function handleMetadata() {
  videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
  metadataReady = videoDuration > 0;
  video.pause();
  updateBufferReadout();
  renderFrame(performance.now(), true);
  scheduleFrame();
}

video.addEventListener('loadedmetadata', handleMetadata);

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

// The film is 17.6MB: fetch it eagerly only when the visitor has not asked to
// save data, and never leave the loading card blocking the story forever.
if (navigator.connection?.saveData) {
  const requestFilm = () => {
    if (video.readyState < 2 && !root.dataset.mediaError) {
      video.preload = 'auto';
      video.load();
    }
  };
  window.addEventListener('wheel', requestFilm, { passive: true, once: true });
  window.addEventListener('touchstart', requestFilm, { passive: true, once: true });
} else if (video.readyState < 2) {
  video.preload = 'auto';
  video.load();
}

window.setTimeout(() => {
  if (!loadState.hidden && root.dataset.mediaError !== 'true') {
    loadState.hidden = true;
  }
}, LOAD_STATE_TIMEOUT_MS);

// A cached film can be ready before this module runs, in which case the media
// events above have already fired and will never re-fire.
if (video.readyState >= 1) handleMetadata();
if (video.readyState >= 2) markFilmReady();

window.addEventListener('scroll', scheduleFrame, { passive: true });

window.addEventListener('resize', () => {
  // A non-forced nudge: iOS URL-bar collapse must not snap the damped film.
  scheduleFrame();
}, { passive: true });

if (finePointerQuery.matches) {
  window.addEventListener('pointermove', (event) => {
    if (reducedMotionQuery.matches) return;
    targetPointerX = (event.clientX / window.innerWidth - 0.5) * -9;
    targetPointerY = (event.clientY / window.innerHeight - 0.5) * -6;
    scheduleFrame();
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    targetPointerX = 0;
    targetPointerY = 0;
    scheduleFrame();
  }, { passive: true });
}

reducedMotionQuery.addEventListener('change', () => {
  targetPointerX = 0;
  targetPointerY = 0;
  renderFrame(performance.now(), true);
  scheduleFrame();
});

// Rail and brand navigation cuts straight to the chapter frame instead of
// whipping the film through every scene in between.
for (const link of document.querySelectorAll('.field-rail a, .brand')) {
  link.addEventListener('click', (event) => {
    const hash = link.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return;
    const section = document.querySelector(hash);
    const index = chapters.indexOf(section);
    if (index === -1) return;
    event.preventDefault();
    setProgress(CHAPTER_ANCHORS[index]);
    history.replaceState(null, '', hash);
    section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
  });
}

window.addEventListener('pagehide', freeze);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) thaw();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) freeze();
  else thaw();
});

if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  window.__maranathaCapture = { freeze, thaw, step, setProgress };
}

document.fonts.ready.then(() => {
  renderFrame(performance.now(), true);
  scheduleFrame();
});
renderFrame(performance.now(), true);
scheduleFrame();
