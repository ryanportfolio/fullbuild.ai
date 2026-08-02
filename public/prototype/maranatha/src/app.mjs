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
const loopCanvas = document.querySelector('.exchange-loop');
const loopCtx = loopCanvas ? loopCanvas.getContext('2d') : null;
const loopShell = document.querySelector('.system-lens');
const loopNameRow = document.querySelector('.exchange-names');
const fallowCanvas = document.querySelector('.fallow-line');
const fallowCtx = fallowCanvas ? fallowCanvas.getContext('2d') : null;
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
const ROOT_INDEX = 2;
const CANOPY_INDEX = 3;

// The land chapter's broken line, tuned in the lab. The pulse descends, stops
// at the gap, fades, rests, and starts again.
const FALLOW = {
  STRANDS: 6,
  BREAK_AT: 0.37,
  GAP: 0.07,
  FRAY: 0.54,
  CROSS: 1.1,
  DISSOLVE: 0.74,
  SWAY: 0.16,
  SWAY_FREQUENCY: 2.2,
  DRIFT_DEGREES_PER_SECOND: 2.2,
  TILT_DEGREES: 0,
  DEPTH: 4,
  LINE: 1.4,
  FAR_ALPHA: 0.37,
  NEAR_ALPHA: 0.67,
  PULSE_PER_SECOND: 0.34,
  PULSE_LENGTH: 0.14,
  PULSE_WEIGHT: 2.6,
  DIE_SECONDS: 2,
  REST_SECONDS: 1.6,
  LABEL_EM: 0.728,
  LABEL: 'fallow',
};

// The interdependence loop, tuned in the lab. Lengths are pixels except where
// noted; LABEL_EM scales with the page's fluid root so the ring's labels track
// the rest of the type.
const LOOP = {
  RADIUS: 0.485,
  TILT_DEGREES: 29,
  SPIN_DEGREES_PER_SECOND: 0.6,
  WAVE: 0.1,
  WAVE_FREQUENCY: 3,
  DEPTH: 6,
  LINE: 2.6,
  FAR_ALPHA: 0.25,
  NEAR_ALPHA: 0.85,
  PULSE_LENGTH: 0.16,
  PULSE_TURNS_PER_SECOND: 0.06,
  PULSE_WEIGHT: 4,
  NODE_RADIUS: 5,
  LABEL_EM: 0.488,
  LABEL_TRACKING: 0.1,
  LABEL_GAP: 16,
};
const LOOP_NODES = ['soil', 'flock', 'gardens', 'terraces', 'mushroom yards', 'silvopastures', 'your home'];

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

  let nearestIndex = 0;
  for (let index = 1; index < chapters.length; index += 1) {
    if (Math.abs(progress - CHAPTER_ANCHORS[index]) < Math.abs(progress - CHAPTER_ANCHORS[nearestIndex])) {
      nearestIndex = index;
    }
  }

  const states = chapters.map((chapter, index) => {
    const anchor = CHAPTER_ANCHORS[index];
    // Anchors are not evenly spaced, so each chapter's hold and fade scale to
    // its tightest neighbor gap. Otherwise the film beat beside a moved anchor
    // collapses to a fraction of the others.
    const gap = Math.min(
      index > 0 ? anchor - CHAPTER_ANCHORS[index - 1] : Infinity,
      index < lastIndex ? CHAPTER_ANCHORS[index + 1] - anchor : Infinity,
    );
    const holdRadius = gap * 0.3;
    const fadeRadius = gap * 0.4;
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

// ---- interdependence loop -------------------------------------------------
// One closed curve carrying the farm's own parts, projected in perspective and
// depth sorted so the far arc recedes. Drawn from the page's single animation
// loop; it never opens one of its own.
let loopClock = 0;
let loopPresence = 0;
let loopRootSize = 16;
let loopNamesBeside = null;
let loopLitName = -1;

const loopNameSpans = LOOP_NODES.map((name) => {
  const span = document.createElement('span');
  span.textContent = name;
  loopNameRow?.appendChild(span);
  return span;
});

function setLoopNameRow(beside, litIndex) {
  if (!loopShell) return;
  if (beside !== loopNamesBeside) {
    loopNamesBeside = beside;
    loopShell.dataset.names = beside ? 'off' : 'on';
  }
  if (beside || litIndex === loopLitName) return;
  loopLitName = litIndex;
  loopNameSpans.forEach((span, index) => {
    if (index === litIndex) span.dataset.lit = 'true';
    else span.removeAttribute('data-lit');
  });
}

function loopRadius(width, height, labelPx, labelsBeside) {
  loopCtx.font = `700 ${labelPx}px "Archivo Narrow", sans-serif`;
  let widest = 0;
  if (labelsBeside) {
    for (const name of LOOP_NODES) {
      widest = Math.max(widest, loopCtx.measureText(name.toUpperCase()).width);
    }
  }
  const margin = Math.min(widest + LOOP.LABEL_GAP + 6, width * 0.28);
  const tilt = Math.abs(Math.sin((LOOP.TILT_DEGREES * Math.PI) / 180));
  const magnify = LOOP.DEPTH / Math.max(0.15, LOOP.DEPTH - 1);
  const halfHeight = height / 2 - labelPx * 0.8 - 4;
  const vertical = Math.max(0.12, (tilt + LOOP.WAVE) * magnify);
  const fitted = Math.max(
    20,
    Math.min((width / 2 - margin) / magnify, halfHeight / vertical),
  );
  return (LOOP.RADIUS / 0.44) * fitted;
}

function loopPoint(turn, spin, radius, width, height) {
  const angle = turn * Math.PI * 2;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = Math.sin(angle * LOOP.WAVE_FREQUENCY) * LOOP.WAVE * radius;
  const cosSpin = Math.cos(spin);
  const sinSpin = Math.sin(spin);
  const spunX = x * cosSpin + z * sinSpin;
  const spunZ = -x * sinSpin + z * cosSpin;
  const tilt = (LOOP.TILT_DEGREES * Math.PI) / 180;
  const tiltedY = y * Math.cos(tilt) - spunZ * Math.sin(tilt);
  const tiltedZ = y * Math.sin(tilt) + spunZ * Math.cos(tilt);
  const distance = LOOP.DEPTH * radius;
  const scale = distance / (distance + tiltedZ);
  return {
    x: width / 2 + spunX * scale,
    y: height / 2 + tiltedY * scale,
    scale,
    z: tiltedZ,
  };
}

function loopPulse(turn, head) {
  let behind = turn - head;
  behind -= Math.floor(behind);
  if (behind > LOOP.PULSE_LENGTH) return 0;
  const along = 1 - behind / LOOP.PULSE_LENGTH;
  return along * along;
}

function drawExchangeLoop(elapsed) {
  if (!loopCtx) return;
  const presence = Number(chapters[CANOPY_INDEX].style.getPropertyValue('--reveal')) || 0;
  const wasVisible = loopPresence > 0.001;
  loopPresence = presence;
  // Same as the fallow line: no layout reads while the chapter is off screen.
  if (presence <= 0.001) {
    if (wasVisible) loopCtx.clearRect(0, 0, loopCanvas.width, loopCanvas.height);
    return;
  }
  // The stylesheet owns the drawing's box; this only reads it.
  const width = loopCanvas.clientWidth;
  const height = loopCanvas.clientHeight;
  if (!width || !height) return;

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (loopCanvas.width !== Math.round(width * ratio) || loopCanvas.height !== Math.round(height * ratio)) {
    loopCanvas.width = Math.round(width * ratio);
    loopCanvas.height = Math.round(height * ratio);
    loopRootSize = parseFloat(getComputedStyle(root).fontSize) || 16;
  }
  loopCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  loopCtx.clearRect(0, 0, width, height);
  setLoopNameRow(width >= 430, loopLitName);

  const still = reducedMotionQuery.matches;
  if (!still) loopClock += elapsed;
  const spin = ((still ? 0 : loopClock) * LOOP.SPIN_DEGREES_PER_SECOND * Math.PI) / 180;
  const head = still ? 0.82 : (loopClock * LOOP.PULSE_TURNS_PER_SECOND) % 1;

  const labelPx = LOOP.LABEL_EM * loopRootSize;
  // There is only room beside every node on a wide panel; on a phone the names
  // move to their own row and light there as the exchange reaches them.
  const labelsBeside = width >= 430;
  const radius = loopRadius(width, height, labelPx, labelsBeside);
  if (!labelsBeside) {
    const reached = Math.round(head * LOOP_NODES.length) % LOOP_NODES.length;
    setLoopNameRow(false, reached);
  }

  const SEGMENTS = 220;
  const segments = [];
  for (let index = 0; index < SEGMENTS; index += 1) {
    const from = loopPoint(index / SEGMENTS, spin, radius, width, height);
    const to = loopPoint((index + 1) / SEGMENTS, spin, radius, width, height);
    segments.push({ from, to, z: (from.z + to.z) / 2, turn: (index + 0.5) / SEGMENTS });
  }
  segments.sort((a, b) => a.z - b.z);

  const depthAlpha = (z) => {
    const near = (z / radius + 1) / 2;
    return (LOOP.FAR_ALPHA + (LOOP.NEAR_ALPHA - LOOP.FAR_ALPHA) * (1 - near)) * presence;
  };

  loopCtx.lineCap = 'butt';
  // Batched the same way as the fallow line: a handful of paths, not hundreds.
  const ring = new Map();
  const trail = new Map();
  const bucket = (store, alpha, lineWidth, segment) => {
    const key = `${Math.round(alpha * 40)}|${Math.round(lineWidth * 8)}`;
    let batch = store.get(key);
    if (!batch) {
      batch = { alpha: Math.round(alpha * 40) / 40, width: Math.round(lineWidth * 8) / 8, path: new Path2D() };
      store.set(key, batch);
    }
    batch.path.moveTo(segment.from.x, segment.from.y);
    batch.path.lineTo(segment.to.x, segment.to.y);
  };

  for (const segment of segments) {
    const alpha = depthAlpha(segment.z);
    if (alpha > 0.004) bucket(ring, alpha, LOOP.LINE * segment.from.scale, segment);
    const lit = loopPulse(segment.turn, head) * Math.min(1, alpha * 2.4);
    if (lit > 0.004) bucket(trail, lit, LOOP.PULSE_WEIGHT * segment.from.scale, segment);
  }

  const paint = (store, red, green, blue) => {
    const batches = [...store.values()].sort((a, b) => a.alpha - b.alpha);
    for (const batch of batches) {
      loopCtx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${batch.alpha.toFixed(3)})`;
      loopCtx.lineWidth = batch.width;
      loopCtx.stroke(batch.path);
    }
  };
  paint(ring, 170, 199, 193);
  paint(trail, 210, 160, 68);

  const marks = LOOP_NODES
    .map((name, index) => {
      const turn = index / LOOP_NODES.length;
      return { name, turn, point: loopPoint(turn, spin, radius, width, height) };
    })
    .sort((a, b) => a.point.z - b.point.z);

  loopCtx.font = `700 ${labelPx}px "Archivo Narrow", sans-serif`;
  loopCtx.textBaseline = 'middle';
  loopCtx.letterSpacing = `${(LOOP.LABEL_TRACKING * labelPx).toFixed(2)}px`;

  for (const mark of marks) {
    const alpha = depthAlpha(mark.point.z);
    const lit = loopPulse(mark.turn, head);
    loopCtx.beginPath();
    loopCtx.arc(mark.point.x, mark.point.y, LOOP.NODE_RADIUS * mark.point.scale, 0, Math.PI * 2);
    loopCtx.fillStyle = '#17130F';
    loopCtx.fill();
    loopCtx.lineWidth = Math.max(0.6, 1.2 * mark.point.scale);
    loopCtx.strokeStyle = lit > 0.05
      ? `rgba(210, 160, 68, ${Math.min(presence, alpha + lit).toFixed(3)})`
      : `rgba(233, 224, 203, ${alpha.toFixed(3)})`;
    loopCtx.stroke();

    const shown = labelsBeside ? 1 : lit;
    if (shown < 0.04) continue;
    const right = mark.point.x >= width / 2;
    loopCtx.textAlign = right ? 'left' : 'right';
    loopCtx.fillStyle = lit > 0.05
      ? `rgba(210, 160, 68, ${(Math.min(presence, alpha + lit) * shown).toFixed(3)})`
      : `rgba(233, 224, 203, ${(Math.min(presence * 0.92, alpha + 0.12) * shown).toFixed(3)})`;
    loopCtx.fillText(
      mark.name.toUpperCase(),
      mark.point.x + (right ? LOOP.LABEL_GAP : -LOOP.LABEL_GAP) * mark.point.scale,
      mark.point.y,
    );
  }
}

// ---- the fallow break ------------------------------------------------------
// The same living line as the rail and the loop, interrupted. The pulse
// descends, reaches the gap, and dies there; the strands below never rejoin.
let fallowClock = 0;
let fallowPresence = 0;
let fallowRootSize = 16;

function fallowStrandPoint(along, strand, height, reach) {
  const y = (along - 0.5) * height * 0.92;
  const swayX = Math.sin(along * FALLOW.SWAY_FREQUENCY * Math.PI * 2) * FALLOW.SWAY * reach;
  const swayZ = Math.cos(along * FALLOW.SWAY_FREQUENCY * Math.PI * 2) * FALLOW.SWAY * reach * 0.8;
  if (strand < 0) return { x: swayX, y, z: swayZ };

  const resume = FALLOW.BREAK_AT + FALLOW.GAP;
  const below = Math.max(0, (along - resume) / Math.max(0.001, 1 - resume));
  const seed = (strand + 1) * 1.7;
  const side = (strand % 2 ? 1 : -1) * (1 + Math.floor(strand / 2) * 0.7);
  const spread = side * FALLOW.FRAY * reach * below;
  const weave = Math.sin(below * Math.PI * (1.4 + FALLOW.CROSS * 3) + seed) * FALLOW.CROSS * reach * 0.5 * below;
  const weaveZ = Math.cos(below * Math.PI * (1.1 + FALLOW.CROSS * 2) + seed) * FALLOW.CROSS * reach * 0.45 * below;
  return { x: swayX + spread + weave, y, z: swayZ + weaveZ };
}

function fallowProject(point, drift, width, height, reach) {
  const cosDrift = Math.cos(drift);
  const sinDrift = Math.sin(drift);
  const x = point.x * cosDrift + point.z * sinDrift;
  const z = -point.x * sinDrift + point.z * cosDrift;
  const tilt = (FALLOW.TILT_DEGREES * Math.PI) / 180;
  const y = point.y * Math.cos(tilt) - z * Math.sin(tilt);
  const depth = point.y * Math.sin(tilt) + z * Math.cos(tilt);
  const distance = FALLOW.DEPTH * reach;
  const scale = distance / (distance + depth);
  return { x: width / 2 + x * scale, y: height / 2 + y * scale, scale, z: depth };
}

function drawFallowLine(elapsed) {
  if (!fallowCtx) return;
  const presence = Number(chapters[ROOT_INDEX].style.getPropertyValue('--reveal')) || 0;
  const wasVisible = fallowPresence > 0.001;
  fallowPresence = presence;
  // Reading the box forces layout, so stay out of the way entirely while the
  // chapter is off screen; clear once on the way out.
  if (presence <= 0.001) {
    if (wasVisible) fallowCtx.clearRect(0, 0, fallowCanvas.width, fallowCanvas.height);
    return;
  }
  const width = fallowCanvas.clientWidth;
  const height = fallowCanvas.clientHeight;
  if (!width || !height) return;

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (fallowCanvas.width !== Math.round(width * ratio) || fallowCanvas.height !== Math.round(height * ratio)) {
    fallowCanvas.width = Math.round(width * ratio);
    fallowCanvas.height = Math.round(height * ratio);
    fallowRootSize = parseFloat(getComputedStyle(root).fontSize) || 16;
  }
  fallowCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  fallowCtx.clearRect(0, 0, width, height);

  const still = reducedMotionQuery.matches;
  if (!still) fallowClock += elapsed;
  const reach = Math.min(width, height) * 0.42;
  const drift = ((still ? 0 : fallowClock) * FALLOW.DRIFT_DEGREES_PER_SECOND * Math.PI) / 180;

  // Still readers get the moment the pulse has already arrived and stopped.
  let head = FALLOW.BREAK_AT;
  let pulseAlpha = 1;
  if (!still) {
    const travel = FALLOW.BREAK_AT / FALLOW.PULSE_PER_SECOND;
    const cycle = travel + FALLOW.DIE_SECONDS + FALLOW.REST_SECONDS;
    const phase = fallowClock % cycle;
    if (phase < travel) head = phase * FALLOW.PULSE_PER_SECOND;
    else if (phase < travel + FALLOW.DIE_SECONDS) pulseAlpha = 1 - (phase - travel) / FALLOW.DIE_SECONDS;
    else pulseAlpha = 0;
  }

  const depthAlpha = (z, fade) => {
    const near = (z / (reach * 1.6) + 1) / 2;
    return clamp(FALLOW.FAR_ALPHA + (FALLOW.NEAR_ALPHA - FALLOW.FAR_ALPHA) * (1 - near)) * fade * presence;
  };

  const STEPS = 150;
  const segments = [];
  for (let index = 0; index < STEPS; index += 1) {
    const from = (index / STEPS) * FALLOW.BREAK_AT;
    const to = ((index + 1) / STEPS) * FALLOW.BREAK_AT;
    segments.push({
      from: fallowProject(fallowStrandPoint(from, -1, height, reach), drift, width, height, reach),
      to: fallowProject(fallowStrandPoint(to, -1, height, reach), drift, width, height, reach),
      along: from,
      living: true,
      fade: 1,
    });
  }
  const resume = FALLOW.BREAK_AT + FALLOW.GAP;
  for (let strand = 0; strand < FALLOW.STRANDS; strand += 1) {
    for (let index = 0; index < STEPS; index += 1) {
      const from = resume + (index / STEPS) * (1 - resume);
      const to = resume + ((index + 1) / STEPS) * (1 - resume);
      const along = (from - resume) / Math.max(0.001, 1 - resume);
      // A deterministic stipple thins the strands as the soil gives way.
      if (FALLOW.DISSOLVE > 0 && ((index * 7 + strand * 13) % 11) / 11 < FALLOW.DISSOLVE * along * 0.9) continue;
      segments.push({
        from: fallowProject(fallowStrandPoint(from, strand, height, reach), drift, width, height, reach),
        to: fallowProject(fallowStrandPoint(to, strand, height, reach), drift, width, height, reach),
        along: from,
        living: false,
        fade: Math.max(0, 1 - FALLOW.DISSOLVE * along),
      });
    }
  }
  segments.sort((a, b) => a.from.z - b.from.z);

  fallowCtx.lineCap = 'butt';
  // A thousand individual strokes would starve the scrub, so segments are
  // batched into a few paths keyed by rounded alpha and width, then drawn
  // dimmest first to keep the far strands behind the near ones.
  const bed = new Map();
  const pulse = new Map();
  const bucket = (store, alpha, lineWidth, segment) => {
    const key = `${Math.round(alpha * 40)}|${Math.round(lineWidth * 8)}`;
    let batch = store.get(key);
    if (!batch) {
      batch = { alpha: Math.round(alpha * 40) / 40, width: Math.round(lineWidth * 8) / 8, path: new Path2D() };
      store.set(key, batch);
    }
    batch.path.moveTo(segment.from.x, segment.from.y);
    batch.path.lineTo(segment.to.x, segment.to.y);
  };

  for (const segment of segments) {
    const alpha = depthAlpha(segment.from.z, segment.fade);
    if (alpha > 0.004) bucket(bed, alpha, FALLOW.LINE * segment.from.scale, segment);

    if (!segment.living || pulseAlpha <= 0) continue;
    const behind = head - segment.along;
    if (behind < 0 || behind >= FALLOW.PULSE_LENGTH) continue;
    const along = 1 - behind / FALLOW.PULSE_LENGTH;
    const lit = along * along * pulseAlpha * Math.min(1, alpha * 2.6);
    if (lit > 0.004) bucket(pulse, lit, FALLOW.PULSE_WEIGHT * segment.from.scale, segment);
  }

  const paint = (store, red, green, blue) => {
    const batches = [...store.values()].sort((a, b) => a.alpha - b.alpha);
    for (const batch of batches) {
      fallowCtx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${batch.alpha.toFixed(3)})`;
      fallowCtx.lineWidth = batch.width;
      fallowCtx.stroke(batch.path);
    }
  };
  paint(bed, 170, 199, 193);
  paint(pulse, 210, 160, 68);

  const stop = fallowProject(fallowStrandPoint(FALLOW.BREAK_AT, -1, height, reach), drift, width, height, reach);
  const arrived = head >= FALLOW.BREAK_AT - 0.02 ? pulseAlpha : 0;
  fallowCtx.beginPath();
  fallowCtx.arc(stop.x, stop.y, 2.4 * stop.scale, 0, Math.PI * 2);
  fallowCtx.fillStyle = '#17130F';
  fallowCtx.fill();
  fallowCtx.lineWidth = Math.max(0.6, 1.1 * stop.scale);
  fallowCtx.strokeStyle = arrived > 0
    ? `rgba(210, 160, 68, ${Math.min(presence, 0.5 + arrived).toFixed(3)})`
    : `rgba(233, 224, 203, ${depthAlpha(stop.z, 0.7).toFixed(3)})`;
  fallowCtx.stroke();

  const labelPx = FALLOW.LABEL_EM * fallowRootSize;
  fallowCtx.font = `700 ${labelPx}px "Archivo Narrow", sans-serif`;
  fallowCtx.letterSpacing = `${(labelPx * 0.12).toFixed(2)}px`;
  fallowCtx.textBaseline = 'middle';
  fallowCtx.textAlign = 'left';
  fallowCtx.fillStyle = `rgba(233, 224, 203, ${(presence * (0.35 + arrived * 0.5)).toFixed(3)})`;
  fallowCtx.fillText(FALLOW.LABEL.toUpperCase(), stop.x + 12 * stop.scale, stop.y);
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
  // The branches thread outward as the pulse passes each fork node.
  mapBranches[0].style.strokeDashoffset = String(1 - clamp((shownProgress - 0.14) / 0.26));
  mapBranches[1].style.strokeDashoffset = String(1 - clamp((shownProgress - 0.4) / 0.28));

  updateChapterState(shownProgress);
  drawFallowLine(elapsed);
  drawExchangeLoop(elapsed);

  if (metadataReady) {
    const filmProgress = reducedMotionQuery.matches ? 1 : shownProgress;
    requestSeek(filmProgress * videoDuration);
  }
}

function isSettled() {
  // The two drawn chapters keep their own time, so frames continue only while
  // one of them is actually on screen and motion is welcome.
  if (!reducedMotionQuery.matches
    && ((loopCtx && loopPresence > 0.001) || (fallowCtx && fallowPresence > 0.001))) return false;
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
