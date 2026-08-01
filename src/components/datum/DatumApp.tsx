'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import s from '@/app/prototype/datum/datum.module.css';
import { audit, type AuditResult, type Observation, type Status } from '@/lib/datum/audit';
import {
  BARRED_PAIRS,
  GROUPS,
  LEGAL_PAIRS,
  RULE_INDEX,
  SPEC,
  tokenByName,
  type GroupId,
} from '@/lib/datum/spec';
import { contrastRatio, hexToRgb, isHex, rgbDistance } from '@/lib/datum/color';
import { stamp } from './candidates/content';
import { CW01Harbour } from './candidates/CW01Harbour';
import { CW02BrightDeck } from './candidates/CW02BrightDeck';
import { CW03Sunbreak } from './candidates/CW03Sunbreak';
import { CW04Tidewater } from './candidates/CW04Tidewater';

/* ------------------------------------------------------------------ setup */

interface Candidate {
  key: string;
  code: string;
  name: string;
  route: string;
  Component: () => ReactElement;
  seed: { accent: string; display: number; rhythm: number };
}

const CANDIDATES: Candidate[] = [
  {
    key: 'A',
    code: 'CW-01',
    name: 'Harbour Line',
    route: 'A',
    Component: CW01Harbour,
    seed: { accent: '#C43C1B', display: 46, rhythm: 48 },
  },
  {
    key: 'B',
    code: 'CW-02',
    name: 'Bright Deck',
    route: 'B',
    Component: CW02BrightDeck,
    seed: { accent: '#B83C1B', display: 42, rhythm: 30 },
  },
  {
    key: 'C',
    code: 'CW-03',
    name: 'Sunbreak',
    route: 'C',
    Component: CW03Sunbreak,
    seed: { accent: '#F2762F', display: 52, rhythm: 42 },
  },
  {
    key: 'D',
    code: 'CW-04',
    name: 'Tidewater',
    route: 'D',
    Component: CW04Tidewater,
    seed: { accent: '#C43C1B', display: 62, rhythm: 48 },
  },
];

const DISPLAY_MIN = 34;
const DISPLAY_MAX = 70;
const RHYTHM_MIN = 8;
const RHYTHM_MAX = 56;

// Every number the panel prints comes off the book, so editing the book moves
// the display with it.
const SPACING_MAX = Math.max(...SPEC.spacing.steps);
const WEIGHT_MAX = Math.max(...Object.values(SPEC.weights));
const CONTRAST_FLOORS = RULE_INDEX.filter((r) => r.group === 'contrast').length;
const RHYTHM_TICKS = SPEC.spacing.steps.filter((v) => v >= RHYTHM_MIN && v <= RHYTHM_MAX);

const DIMENSIONS: { id: string; label: string; groups: GroupId[] }[] = [
  { id: 'alignment', label: 'Alignment', groups: ['alignment'] },
  { id: 'palette', label: 'Palette', groups: ['paletteExactness', 'paletteRoles'] },
  { id: 'typography', label: 'Typography', groups: ['typography'] },
  { id: 'spacing', label: 'Spacing', groups: ['spacing'] },
  { id: 'contrast', label: 'Contrast', groups: ['contrast'] },
  { id: 'radius', label: 'Radius', groups: ['radius'] },
  { id: 'motion', label: 'Motion', groups: ['motion'] },
];

const ROUTED = [
  {
    id: 'style-fit',
    label: 'Style fit',
    question: 'Does this feel like Coastwise at the ferry gate on a Tuesday?',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    question: 'Would we have thought of this?',
  },
];

// The FLIP that lifts failing rows has to read layout before paint, but this
// component still renders on the server, where useLayoutEffect is a no-op and
// React says so out loud.
const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const GLYPH: Record<Status, string> = { pass: '✓', drift: '~', fail: '×' };
const WORD: Record<Status, string> = { pass: 'PASS', drift: 'DRIFT', fail: 'FAIL' };

/* ---------------------------------------------------------------- helpers */

const fmt = (n: number) => n.toFixed(1);

const COUNT_WORDS = [
  'Nothing',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

const countWord = (n: number) => (n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n));

function signed(n: number): string {
  if (Math.abs(n) < 0.05) return '0.0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
}

function toneOf(score: number): Status {
  if (score >= 99.95) return 'pass';
  if (score >= 70) return 'drift';
  return 'fail';
}

function nearestStep(steps: readonly number[], value: number) {
  let step = steps[0];
  let delta = Infinity;
  for (const candidate of steps) {
    const d = Math.abs(value - candidate);
    if (d < delta) {
      delta = d;
      step = candidate;
    }
  }
  return { step, delta };
}

interface DigestRow {
  key: string;
  property: string;
  value: string;
  nearest: string;
  distance: number | null;
  status: Status;
  count: number;
}

function digest(list: Observation[]): DigestRow[] {
  const map = new Map<string, DigestRow>();
  for (const o of list) {
    const key = `${o.property}|${o.value}|${o.nearest}`;
    const found = map.get(key);
    if (found) {
      found.count += 1;
      continue;
    }
    map.set(key, {
      key,
      property: o.property,
      value: o.value,
      nearest: o.nearest,
      distance: o.distance,
      status: o.status,
      count: 1,
    });
  }
  const rank: Record<Status, number> = { fail: 0, drift: 1, pass: 2 };
  return [...map.values()].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.count - a.count,
  );
}

interface Box {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: Status;
  n: number;
}

function boxesFor(root: HTMLElement, list: Observation[], limit: number): Box[] {
  const rootRect = root.getBoundingClientRect();
  const seen = new Map<HTMLElement, Box>();
  for (const o of list) {
    if (seen.has(o.element)) {
      if (o.status === 'fail') seen.get(o.element)!.tone = 'fail';
      continue;
    }
    const r = o.element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    seen.set(o.element, {
      key: `${seen.size}`,
      x: r.left - rootRect.left,
      y: r.top - rootRect.top,
      w: r.width,
      h: r.height,
      tone: o.status,
      n: seen.size + 1,
    });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/* -------------------------------------------------------------------- app */

export function DatumApp() {
  const [index, setIndex] = useState(0);
  const candidate = CANDIDATES[index];

  const [accent, setAccent] = useState(candidate.seed.accent);
  const [hexDraft, setHexDraft] = useState(candidate.seed.accent);
  const [displaySize, setDisplaySize] = useState(candidate.seed.display);
  const [rhythm, setRhythm] = useState(candidate.seed.rhythm);

  const [result, setResult] = useState<AuditResult | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [sweep, setSweep] = useState(0);
  const [pins, setPins] = useState<Box[]>([]);
  const [showPins, setShowPins] = useState(true);
  const [highlight, setHighlight] = useState<Box[]>([]);
  const [ledger, setLedger] = useState<{ id: number; text: string }[]>([]);
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [narrow, setNarrow] = useState(false);
  const [announce, setAnnounce] = useState('');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevRef = useRef<AuditResult | null>(null);
  const pendingRef = useRef<{ label: string; from: string; to: string; group: GroupId | null } | null>(
    null,
  );
  const ledgerId = useRef(0);
  const announceTimer = useRef<number | null>(null);

  /* --- measurement ---------------------------------------------------- */

  const run = useCallback(() => {
    const root = stageRef.current;
    if (!root) return;
    const next = audit(root, SPEC);
    const prev = prevRef.current;
    prevRef.current = next;

    setResult(next);
    setDelta(prev ? next.overall - prev.overall : null);
    setSweep((k) => k + 1);
    setPins(
      boxesFor(
        root,
        next.groups.flatMap((g) => g.observations).filter((o) => o.credit < 1),
        14,
      ),
    );
    setHighlight([]);

    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && prev) {
      const groupPart = pending.group
        ? ` · ${next.byId[pending.group].mono} ${fmt(prev.byId[pending.group].score)} → ${fmt(
            next.byId[pending.group].score,
          )}`
        : '';
      ledgerId.current += 1;
      const entry = {
        id: ledgerId.current,
        text: `${pending.label} ${pending.from} → ${pending.to}${groupPart} · TOTAL ${signed(
          next.overall - prev.overall,
        )}`,
      };
      setLedger((l) => [entry, ...l].slice(0, 5));
    }

    if (announceTimer.current !== null) window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      setAnnounce(`Adherence ${fmt(next.overall)}, ${next.verdict.toLowerCase()}`);
    }, 700);
  }, []);

  // Two frames, so style and paint have both committed and the engine reads
  // what the browser actually drew rather than what React last said.
  const schedule = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        run();
      });
    });
  }, [run]);

  useEffect(() => {
    schedule();
  }, [index, accent, displaySize, rhythm, schedule]);

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => schedule());
    ro.observe(root);
    return () => ro.disconnect();
  }, [schedule]);

  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    return () => {
      alive = false;
    };
  }, [schedule]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (announceTimer.current !== null) window.clearTimeout(announceTimer.current);
    },
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1040px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* --- interaction ---------------------------------------------------- */

  const selectCandidate = useCallback(
    (next: number) => {
      if (next === index) return;
      pendingRef.current = {
        label: 'ROUTE',
        from: CANDIDATES[index].route,
        to: CANDIDATES[next].route,
        group: null,
      };
      const seed = CANDIDATES[next].seed;
      setIndex(next);
      setAccent(seed.accent);
      setHexDraft(seed.accent);
      setDisplaySize(seed.display);
      setRhythm(seed.rhythm);
    },
    [index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= CANDIDATES.length) selectCandidate(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectCandidate]);

  const applyAccent = (next: string) => {
    if (next.toUpperCase() === accent.toUpperCase()) return;
    pendingRef.current = {
      label: 'ACCENT',
      from: accent.toUpperCase(),
      to: next.toUpperCase(),
      group: 'paletteExactness',
    };
    setAccent(next.toUpperCase());
    setHexDraft(next.toUpperCase());
  };

  const applyDisplay = (next: number) => {
    if (next === displaySize) return;
    pendingRef.current = {
      label: 'DISPLAY',
      from: `${displaySize}`,
      to: `${next}`,
      group: 'typography',
    };
    setDisplaySize(next);
  };

  const applyRhythm = (next: number) => {
    if (next === rhythm) return;
    pendingRef.current = { label: 'RHYTHM', from: `${rhythm}`, to: `${next}`, group: 'spacing' };
    setRhythm(next);
  };

  const putItBack = () => {
    const seed = candidate.seed;
    if (
      seed.accent === accent &&
      seed.display === displaySize &&
      seed.rhythm === rhythm
    )
      return;
    pendingRef.current = { label: 'RESTORED', from: 'EDITED', to: candidate.code, group: null };
    setAccent(seed.accent);
    setHexDraft(seed.accent);
    setDisplaySize(seed.display);
    setRhythm(seed.rhythm);
  };

  const hoverGroup = (id: GroupId | null) => {
    const root = stageRef.current;
    if (!root || !result || !id) {
      setHighlight([]);
      return;
    }
    setHighlight(boxesFor(root, result.byId[id].observations.filter((o) => o.credit < 1), 24));
  };

  /* --- derived -------------------------------------------------------- */

  const orderedGroups = useMemo(() => {
    if (!result) return [];
    return [...result.groups].sort((a, b) => {
      const af = a.sampled && a.score < 99.95 ? 0 : 1;
      const bf = b.sampled && b.score < 99.95 ? 0 : 1;
      if (af !== bf) return af - bf;
      if (af === 0) return a.score - b.score;
      return GROUPS.findIndex((g) => g.id === a.id) - GROUPS.findIndex((g) => g.id === b.id);
    });
  }, [result]);

  const { accentNearest, accentRatio } = useMemo(() => {
    const rgb = hexToRgb(accent);
    let best = SPEC.palette.tokens[0];
    let bestD = Infinity;
    for (const t of SPEC.palette.tokens) {
      const d = rgbDistance(rgb, t.rgb);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return {
      accentNearest: { token: best, distance: bestD },
      accentRatio: contrastRatio(tokenByName('paper').rgb, rgb),
    };
  }, [accent]);

  const displayStep = nearestStep(SPEC.type.sizes, displaySize);
  const rhythmStep = nearestStep(SPEC.spacing.steps, rhythm);

  const verdictTone: Status = result ? result.verdictTone : 'drift';
  const deltaTone: Status = delta === null || Math.abs(delta) < 0.05 ? 'drift' : delta > 0 ? 'pass' : 'fail';

  const Composition = candidate.Component;

  /* --- flip: failing rows travel to the top --------------------------- */

  const rowRefs = useRef(new Map<string, HTMLElement>());
  const rowPos = useRef(new Map<string, number>());
  useMeasureEffect(() => {
    const next = new Map<string, number>();
    rowRefs.current.forEach((el, id) => next.set(id, el.getBoundingClientRect().top));
    rowPos.current.forEach((was, id) => {
      const el = rowRefs.current.get(id);
      const now = next.get(id);
      if (!el || now === undefined) return;
      const shift = was - now;
      if (Math.abs(shift) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${shift}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transform = '';
      });
    });
    rowPos.current = next;
  }, [orderedGroups]);

  /* ------------------------------------------------------------ render */

  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <div className={s.barMark}>
          <strong>DATUM</strong>
          <span>Brand adherence, measured</span>
        </div>

        <p className={s.barMeta}>
          <span>CLIENT / {SPEC.client}</span>
          <span aria-hidden="true">·</span>
          <span>{SPEC.book}</span>
          <span aria-hidden="true">·</span>
          <span>{RULE_INDEX.length} RULES</span>
        </p>

        <div className={s.barScore}>
          <div className={s.barFigure}>
            <strong data-tone={verdictTone}>{result ? fmt(result.overall) : '·'}</strong>
            <span className={s.barDelta} data-tone={deltaTone}>
              {delta === null ? 'FIRST READ' : signed(delta)}
            </span>
          </div>
          <p className={s.barVerdict} data-tone={verdictTone}>
            {result ? result.verdict : 'READING'}
          </p>
          <p className={s.barStamp}>
            {result
              ? `${result.measurements} measurements · ${result.nodes} nodes · ${result.elapsedMs.toFixed(1)} ms`
              : 'WAITING FOR PAINT'}
          </p>
        </div>
      </header>

      {/* ----------------------------------------------------------- stage */}
      <main className={s.stageCol}>
        <div className={s.stageHead}>
          <p className={s.tag}>STAGE</p>
          <h1 className={s.stageTitle}>Measured against the book</h1>
          <p className={s.stageSub}>
            Coastwise&apos;s brand is written down. Every edit on the stage is measured against it
            before you let go.
          </p>
        </div>

        <div className={s.switcher} role="group" aria-label="Compositions on file">
          {CANDIDATES.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={i === index}
              className={s.switchTab}
              data-on={i === index || undefined}
              onClick={() => selectCandidate(i)}
            >
              <span>{c.key}</span>
              {c.name}
            </button>
          ))}
        </div>

        <div className={s.ruler} data-off={rhythmStep.delta > 0 || undefined}>
          {RHYTHM_TICKS.map((step) => (
            <span
              key={step}
              className={s.rulerTick}
              style={{ left: `${((step - RHYTHM_MIN) / (RHYTHM_MAX - RHYTHM_MIN)) * 100}%` }}
              data-on={Math.abs(step - rhythm) <= 0.5 || undefined}
            >
              <b>{step}</b>
            </span>
          ))}
          <span
            className={s.rulerHead}
            style={{ left: `${((rhythm - RHYTHM_MIN) / (RHYTHM_MAX - RHYTHM_MIN)) * 100}%` }}
          />
        </div>

        <div className={s.frame}>
          <span className={s.tick} data-corner="tl" />
          <span className={s.tick} data-corner="tr" />
          <span className={s.tick} data-corner="bl" />
          <span className={s.tick} data-corner="br" />
          <span className={s.sweep} key={sweep} aria-hidden="true" />

          <div className={s.stageWrap}>
            <div
              ref={stageRef}
              data-stage-root=""
              className={s.stageRoot}
              style={
                {
                  '--cw-accent': accent,
                  '--cw-display': `${displaySize}px`,
                  '--cw-rhythm': `${rhythm}px`,
                } as CSSProperties
              }
            >
              <Composition />
            </div>

            <div className={s.overlay} aria-hidden="true">
              {showPins &&
                pins.map((p) => (
                  <span
                    key={`pin-${p.key}`}
                    className={s.pin}
                    data-tone={p.tone}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                  >
                    <b>{p.n}</b>
                  </span>
                ))}
              {highlight.map((p) => (
                <span
                  key={`hl-${p.key}`}
                  className={s.beam}
                  data-tone={p.tone}
                  style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={s.caption}>
          <span>
            {candidate.code} {candidate.name.toUpperCase()}
          </span>
          <span>{stamp(candidate.route)}</span>
          <span>{result ? `${result.nodes} NODES READ` : 'READING'}</span>
          <label className={s.pinToggle}>
            <input
              type="checkbox"
              checked={showPins}
              onChange={(e) => setShowPins(e.target.checked)}
            />
            MEASUREMENT PINS
          </label>
        </div>

        {/* --------------------------------------------------------- controls */}
        <section className={s.controls}>
          <div className={s.controlsHead}>
            <p className={s.tag}>CONTROL</p>
            <h2>Change it and the score moves</h2>
            <button type="button" className={s.reset} onClick={putItBack}>
              Put it back
            </button>
          </div>

          <div className={s.controlGrid}>
            <div className={s.control} data-wide="">
              <p className={s.controlLabel}>Accent</p>
              <div className={s.swatches}>
                {SPEC.palette.tokens.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    className={s.swatch}
                    style={{ background: t.hex }}
                    data-on={t.hex.toUpperCase() === accent.toUpperCase() || undefined}
                    aria-label={`Accent ${t.name} ${t.hex}`}
                    onClick={() => applyAccent(t.hex)}
                  />
                ))}
                <input
                  type="color"
                  className={s.colorInput}
                  value={accent}
                  aria-label="Accent, colour picker"
                  onChange={(e) => applyAccent(e.target.value)}
                />
                <input
                  type="text"
                  className={s.hexInput}
                  value={hexDraft}
                  spellCheck={false}
                  aria-label="Accent, hex value"
                  onChange={(e) => {
                    const v = e.target.value;
                    setHexDraft(v);
                    if (isHex(v)) applyAccent(v);
                  }}
                />
              </div>
              <p className={s.readout}>
                <span data-tone={accentNearest.distance <= SPEC.palette.matchMax ? 'pass' : accentNearest.distance <= SPEC.palette.driftMax ? 'drift' : 'fail'}>
                  d {accentNearest.distance.toFixed(1)} FROM {accentNearest.token.name.toUpperCase()}
                </span>
                <span data-tone={accentRatio >= SPEC.contrast.small ? 'pass' : 'fail'}>
                  PAPER ON ACCENT {accentRatio.toFixed(2)}:1
                </span>
              </p>
            </div>

            <div className={s.control}>
              <p className={s.controlLabel}>Display size</p>
              <div className={s.slider}>
                <div className={s.notches} aria-hidden="true">
                  {SPEC.type.sizes
                    .filter((v) => v >= DISPLAY_MIN && v <= DISPLAY_MAX)
                    .map((v) => (
                      <span
                        key={v}
                        style={{
                          left: `calc(9px + ${(v - DISPLAY_MIN) / (DISPLAY_MAX - DISPLAY_MIN)} * (100% - 18px))`,
                        }}
                        data-on={v === displaySize || undefined}
                      />
                    ))}
                </div>
                <input
                  type="range"
                  min={DISPLAY_MIN}
                  max={DISPLAY_MAX}
                  step={1}
                  value={displaySize}
                  aria-label="Display size in pixels"
                  aria-valuetext={
                    displayStep.delta === 0
                      ? `${displaySize} pixels, on the scale`
                      : `${displaySize} pixels, ${displayStep.delta} off the ${displayStep.step} step`
                  }
                  onChange={(e) => applyDisplay(Number(e.target.value))}
                />
              </div>
              <p className={s.readout}>
                <span
                  data-tone={
                    displayStep.delta === 0
                      ? 'pass'
                      : displayStep.delta <= SPEC.type.halfTolerance
                        ? 'drift'
                        : 'fail'
                  }
                >
                  {displaySize}px · d {displayStep.delta} FROM {displayStep.step}
                </span>
              </p>
            </div>

            <div className={s.control}>
              <p className={s.controlLabel}>Section rhythm</p>
              <div className={s.slider}>
                <div className={s.notches} aria-hidden="true">
                  {SPEC.spacing.steps
                    .filter((v) => v >= RHYTHM_MIN && v <= RHYTHM_MAX)
                    .map((v) => (
                      <span
                        key={v}
                        style={{
                          left: `calc(9px + ${(v - RHYTHM_MIN) / (RHYTHM_MAX - RHYTHM_MIN)} * (100% - 18px))`,
                        }}
                        data-on={v === rhythm || undefined}
                      />
                    ))}
                </div>
                <input
                  type="range"
                  min={RHYTHM_MIN}
                  max={RHYTHM_MAX}
                  step={1}
                  value={rhythm}
                  aria-label="Section rhythm in pixels"
                  aria-valuetext={
                    rhythmStep.delta === 0
                      ? `${rhythm} pixels, on the scale`
                      : `${rhythm} pixels, ${rhythmStep.delta} off the ${rhythmStep.step} step`
                  }
                  onChange={(e) => applyRhythm(Number(e.target.value))}
                />
              </div>
              <p className={s.readout}>
                <span
                  data-tone={
                    rhythmStep.delta === 0
                      ? 'pass'
                      : rhythmStep.delta <= SPEC.spacing.halfTolerance
                        ? 'drift'
                        : 'fail'
                  }
                >
                  {rhythm}px · d {rhythmStep.delta} FROM {rhythmStep.step}
                </span>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------- right rail */}
      <aside className={s.rightCol}>
        <section className={s.panel}>
          <p className={s.tag}>LEDGER</p>
          <ul className={s.ledger}>
            {ledger.length === 0 ? (
              <li className={s.ledgerEmpty}>No changes yet</li>
            ) : (
              ledger.map((e) => <li key={e.id}>{e.text}</li>)
            )}
          </ul>
        </section>

        <section className={s.panel}>
          <p className={s.tag}>CHECKS</p>
          <h2 className={s.panelTitle}>What the instrument can see</h2>
          <p className={s.prose}>{result ? result.summary : 'Reading the stage'}</p>

          <ul className={s.checks}>
            {orderedGroups.map((g, i) => {
              const tone = g.sampled ? toneOf(g.score) : 'drift';
              return (
                <li
                  key={g.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(g.id, el);
                    else rowRefs.current.delete(g.id);
                  }}
                  className={s.check}
                  onMouseEnter={() => hoverGroup(g.id)}
                  onMouseLeave={() => hoverGroup(null)}
                  onFocus={() => hoverGroup(g.id)}
                  onBlur={() => hoverGroup(null)}
                >
                  <span
                    className={s.checkFlash}
                    key={sweep}
                    style={{ animationDelay: `${i * 18}ms` }}
                    aria-hidden="true"
                  />
                  <details>
                    <summary>
                      <span className={s.checkName}>{g.label}</span>
                      <span className={s.checkScore} data-tone={tone}>
                        {g.sampled ? fmt(g.score) : 'NO SAMPLES'}
                      </span>
                      <span className={s.meter} aria-hidden="true">
                        <b data-tone={tone} style={{ width: `${g.sampled ? g.score : 0}%` }} />
                      </span>
                      <span className={s.checkCount}>
                        {g.sampled
                          ? `${g.count - g.failing} / ${g.count}`
                          : `WEIGHT ${g.weight} REDISTRIBUTED`}
                      </span>
                    </summary>
                    <ul className={s.detail}>
                      {g.sampled ? (
                        digest(g.observations).map((row) => (
                          <li key={row.key} data-tone={row.status}>
                            <span aria-hidden="true">{GLYPH[row.status]}</span>
                            {row.property} {row.value} · nearest {row.nearest}
                            {row.distance !== null && row.distance > 0 ? ` · d ${row.distance}` : ''}
                            {` · ${row.count} ${row.count === 1 ? 'node' : 'nodes'}`}
                          </li>
                        ))
                      ) : (
                        <li data-tone="drift">
                          Nothing on the stage declares one, so its weight of {g.weight} spreads
                          across the groups that did report.
                        </li>
                      )}
                    </ul>
                  </details>
                </li>
              );
            })}
            {orderedGroups.length === 0 ? (
              <li className={s.ledgerEmpty}>Taking the first reading</li>
            ) : null}
          </ul>
        </section>

        <div className={s.divide} />

        <section className={s.panel} data-human="">
          <p className={s.tag} data-human="">
            ROUTING
          </p>
          <h2 className={s.panelTitle}>What a person has to see</h2>
          <p className={s.prose}>
            {countWord(DIMENSIONS.length)} of these have an answer in the book.{' '}
            {countWord(ROUTED.length)} do not, so they go to a person instead of getting a number.
          </p>

          <div className={s.spectrum}>
            <div className={s.spectrumTrack}>
              {DIMENSIONS.map((d) => {
                const members = result ? d.groups.map((id) => result.byId[id]).filter((g) => g.sampled) : [];
                const w = members.reduce((a, g) => a + g.weight, 0);
                const score = w > 0 ? members.reduce((a, g) => a + g.weight * g.score, 0) / w : null;
                const tone: Status = score === null ? 'drift' : toneOf(score);
                return (
                  <div key={d.id} className={s.dim} data-tone={tone}>
                    <span className={s.dot} data-tone={tone} />
                    <span className={s.dimLabel}>{d.label}</span>
                    <span className={s.dimScore}>{score === null ? '·' : fmt(score)}</span>
                    <span className={s.chip} data-tone={tone}>
                      {GLYPH[tone]} {WORD[tone]}
                    </span>
                  </div>
                );
              })}

              <span className={s.spectrumBreak} aria-hidden="true" />

              {ROUTED.map((r) => (
                <div key={r.id} className={s.dim} data-human="">
                  <span className={s.dot} data-human="" />
                  <span className={s.dimLabel}>{r.label}</span>
                  <span className={s.dimRule} aria-label="no score" />
                  <span className={s.chip} data-human="">
                    ◇ ROUTED
                  </span>
                </div>
              ))}
            </div>

            <p className={s.axis}>
              <span>OBJECTIVE</span>
              <span>SUBJECTIVE</span>
            </p>
          </div>

          <div className={s.routedCards}>
            {ROUTED.map((r) => (
              <div key={r.id} className={s.routed}>
                <p className={s.routedHead}>
                  <span>{r.label}</span>
                  <span className={s.chip} data-human="">
                    {queued[r.id] ? '◆ QUEUED FOR REVIEW' : '◇ ROUTED'}
                  </span>
                </p>
                <p className={s.routedQuestion}>{r.question}</p>
                <label className={s.send}>
                  <input
                    type="checkbox"
                    checked={!!queued[r.id]}
                    onChange={(e) => setQueued((q) => ({ ...q, [r.id]: e.target.checked }))}
                  />
                  Send to a person
                </label>
                <label className={s.note}>
                  <span>Note</span>
                  <input
                    type="text"
                    value={notes[r.id] ?? ''}
                    placeholder="What you saw"
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                </label>
              </div>
            ))}
          </div>

          <p className={s.routedFoot}>{ROUTED.length} dimensions wait for a person</p>
        </section>
      </aside>

      {/* -------------------------------------------------------- spec rail */}
      <aside className={s.specCol}>
        <p className={s.tag}>SPEC</p>
        <h2 className={s.panelTitle}>The Coastwise book</h2>

        <details className={s.specGroup} open={!narrow}>
          <summary>Palette · {SPEC.palette.tokens.length} tokens</summary>
          <ul className={s.tokens}>
            {SPEC.palette.tokens.map((t) => (
              <li key={t.name} data-lit={result?.touched.palette.includes(t.name) || undefined}>
                <span className={s.chipSwatch} style={{ background: t.hex }} />
                <b>{t.name}</b>
                <i>{t.hex}</i>
                <em>{t.role}</em>
                <span>{t.usage}</span>
              </li>
            ))}
          </ul>
          <p className={s.specNote}>
            Match at d ≤ {SPEC.palette.matchMax}, drift to d {SPEC.palette.driftMax}, then nothing.
          </p>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Roles · {SPEC.roles.rules.length + 1} rules</summary>
          <ul className={s.lines}>
            {SPEC.roles.rules.map((r) => (
              <li key={r.id}>
                <b>{r.id}</b>
                {r.line}
              </li>
            ))}
            <li>
              <b>R5</b>
              {SPEC.roles.fillQuota.line}
            </li>
          </ul>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Type · {SPEC.type.sizes.length} steps</summary>
          <ul className={s.typeScale}>
            {SPEC.type.sizes.map((size) => (
              <li key={size} data-lit={result?.touched.sizes.includes(size) || undefined}>
                <span style={{ fontSize: `${Math.min(size, SPEC.type.boldFloor)}px` }}>Aa</span>
                <b>{size}</b>
                <i>{size >= SPEC.type.boldFloor ? '700 only' : SPEC.type.weights.join(' / ')}</i>
                <em>{SPEC.type.monoSizes.includes(size) ? 'mono legal' : 'display'}</em>
              </li>
            ))}
          </ul>
          <p className={s.specNote}>{SPEC.type.note}</p>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Spacing · {SPEC.spacing.steps.length} steps</summary>
          <ul className={s.bars}>
            {SPEC.spacing.steps.map((step) => (
              <li key={step} data-lit={result?.touched.spacing.includes(step) || undefined}>
                <b>{step}</b>
                <span style={{ width: `${(step / SPACING_MAX) * 100}%` }} />
              </li>
            ))}
          </ul>
          <p className={s.specNote}>{SPEC.spacing.note}</p>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Radius · {SPEC.radius.allowed.length + 1} values</summary>
          <ul className={s.radii}>
            {[...SPEC.radius.allowed.map((r) => `${r}`), 'pill'].map((r) => (
              <li key={r} data-lit={result?.touched.radius.includes(r === 'pill' ? 'pill' : `${r}px`) || undefined}>
                <span
                  style={{
                    borderTopLeftRadius: r === 'pill' ? '999px' : `${r}px`,
                    borderBottomLeftRadius: r === 'pill' ? '999px' : `${r}px`,
                  }}
                />
                <b>{r}</b>
              </li>
            ))}
          </ul>
          <p className={s.specNote}>{SPEC.radius.line}</p>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Contrast · {CONTRAST_FLOORS} floors</summary>
          <ul className={s.lines}>
            <li>
              <b>{SPEC.contrast.small.toFixed(1)}</b>under {SPEC.contrast.largeFloorSize}px
            </li>
            <li>
              <b>{SPEC.contrast.large.toFixed(1)}</b>at {SPEC.contrast.largeFloorSize}px and above
            </li>
          </ul>
          <ul className={s.pairs}>
            {LEGAL_PAIRS.map((p) => (
              <li key={`${p.fg}-${p.bg}`}>
                <span
                  style={{ background: tokenByName(p.bg).hex, color: tokenByName(p.fg).hex }}
                >
                  Aa
                </span>
                {p.fg} on {p.bg}
                <b>{p.ratio.toFixed(2)}</b>
              </li>
            ))}
          </ul>
          <p className={s.specNote}>The role rules exist because these do not clear the floor:</p>
          <ul className={s.pairs} data-barred="">
            {BARRED_PAIRS.map((p) => (
              <li key={`${p.fg}-${p.bg}`}>
                <span
                  style={{ background: tokenByName(p.bg).hex, color: tokenByName(p.fg).hex }}
                >
                  Aa
                </span>
                {p.fg} on {p.bg}
                <b>{p.ratio.toFixed(2)}</b>
              </li>
            ))}
          </ul>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>
            Motion · {RULE_INDEX.filter((r) => r.group === 'motion').length} rules
          </summary>
          <div className={s.durations}>
            {SPEC.motion.durations.map((d) => (
              <span key={d} data-lit={result?.touched.durations.includes(d) || undefined}>
                {d}ms
              </span>
            ))}
          </div>
          <div className={s.curve}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path d="M0 100 L100 100 M0 100 L0 0" className={s.curveAxis} />
              <path
                d={`M0 100 C ${SPEC.motion.curve.points[0] * 100} ${100 - SPEC.motion.curve.points[1] * 100} ${SPEC.motion.curve.points[2] * 100} ${100 - SPEC.motion.curve.points[3] * 100} 100 0`}
                className={s.curveLine}
              />
            </svg>
            <p>
              <b>{SPEC.motion.curve.name}</b>
              cubic-bezier({SPEC.motion.curve.points.join(', ')})
            </p>
          </div>
          <ul className={s.lines}>
            <li>
              <b>M3</b>
              {SPEC.motion.properties.join(' and ')} only
            </li>
            <li>
              <b>M2</b>linear is allowed when {SPEC.motion.linearOnly} is the only property
            </li>
          </ul>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Alignment</summary>
          <p className={s.specNote}>{SPEC.alignment.line}</p>
          <ul className={s.lines}>
            <li>
              <b>{SPEC.alignment.edgeWeight}</b>share of blocks sitting on a line
            </li>
            <li>
              <b>{SPEC.alignment.gapWeight}</b>share of gaps between lines on the spacing scale
            </li>
          </ul>
        </details>

        <details className={s.specGroup} open={!narrow}>
          <summary>Weights · sum 100</summary>
          <ul className={s.bars} data-weights="">
            {GROUPS.map((g) => (
              <li key={g.id}>
                <b>{SPEC.weights[g.id]}</b>
                <span style={{ width: `${(SPEC.weights[g.id] / WEIGHT_MAX) * 100}%` }} />
                <i>{g.label}</i>
              </li>
            ))}
          </ul>
          <p className={s.specNote}>
            Any group with no samples drops out and its weight spreads across the rest, so a
            composition never earns a free hundred for a rule it never touched.
          </p>
        </details>
      </aside>

      {/* ------------------------------------------------------ mobile dock */}
      <div className={s.dock}>
        <div className={s.dockScore}>
          <strong data-tone={verdictTone}>{result ? fmt(result.overall) : '·'}</strong>
          <span data-tone={verdictTone}>{result ? result.verdict : 'READING'}</span>
        </div>
        <div className={s.dockControls}>
          <label>
            <span>ACCENT</span>
            <input
              type="color"
              value={accent}
              aria-label="Accent, colour picker"
              onChange={(e) => applyAccent(e.target.value)}
            />
          </label>
          <label>
            <span>SIZE {displaySize}</span>
            <input
              type="range"
              min={DISPLAY_MIN}
              max={DISPLAY_MAX}
              step={1}
              value={displaySize}
              aria-label="Display size in pixels"
              aria-valuetext={
                displayStep.delta === 0
                  ? `${displaySize} pixels, on the scale`
                  : `${displaySize} pixels, ${displayStep.delta} off the ${displayStep.step} step`
              }
              onChange={(e) => applyDisplay(Number(e.target.value))}
            />
          </label>
          <label>
            <span>RHYTHM {rhythm}</span>
            <input
              type="range"
              min={RHYTHM_MIN}
              max={RHYTHM_MAX}
              step={1}
              value={rhythm}
              aria-label="Section rhythm in pixels"
              aria-valuetext={
                rhythmStep.delta === 0
                  ? `${rhythm} pixels, on the scale`
                  : `${rhythm} pixels, ${rhythmStep.delta} off the ${rhythmStep.step} step`
              }
              onChange={(e) => applyRhythm(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={putItBack}>
            Put it back
          </button>
        </div>
      </div>

      <p className={s.live} role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
