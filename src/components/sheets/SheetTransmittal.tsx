'use client';

/* ============================================================================
   T-01 TRANSMITTAL — THE COUNTERSIGN. The drawing set is unsigned; this sheet
   is where the visitor countersigns it, using the site's own instrument.

   The sheet SSRs as a finished static RFI form (the same floor rule as every
   sheet: no JS or reduced motion = fully drawn, fully usable, native cursor).
   With motion, DrawingSet draws the form's linework under the pen (the sheet
   carries data-state="t01", the set's second crewed sheet), then fires
   ws:t01-drawn and this component takes over:

     1. HANDOFF — the carriage glides to the visitor's cursor and locks on
        (native cursor hidden over the sheet, telemetry reads
        `plotting · visitor`). Coordinates clamp to the frame: the Margin Law
        holds even for the visitor's hand.
     2. ECHO — keystrokes replot beside each field in the masthead's
        module-quantised style.
     3. SGN — pointer strokes lay real SVG polylines; a typed name is the
        fallback mark.
     4. TRANSMIT — POST /api/transmit (stub: validates, logs, issues an RFI
        number), the sheet folds into a drawn envelope, the TRANSMITTED stamp
        lands, the pen docks, and the rail site log gains its correspondence
        panel.
   ========================================================================= */

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import gsap from 'gsap';
import { penBus } from '@/lib/penBus';
import { Line, Path } from '../drafting/Marks';
import s from './transmittal.module.css';

/* --- pen helpers (mirrors DrawingSet's dock geometry) ---------------------- */
function dockPenLocal() {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  if (!rail) {
    hidePenLocal();
    return;
  }
  const r = rail.getBoundingClientRect();
  penBus.set({
    x: r.left + r.width / 2,
    y: Math.min(r.top + 150, window.innerHeight * 0.3),
    ink: 'graphite',
    mode: 'dock',
  });
}
function hidePenLocal() {
  const last = penBus.last;
  if (!last || last.mode === 'hide') return;
  penBus.set({ ...last, mode: 'hide' });
}

/* --- keystroke echo: quantise the typed text into drafting modules --------- */
const ECHO_CELL = 3; // css px, finer than the masthead's 5 (the echo is small)
const ECHO_ALPHA = 64;
function plotEcho(canvas: HTMLCanvasElement | null, text: string) {
  if (!canvas) return;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.ceil(cssW * dpr);
  const h = Math.ceil(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!text) return;

  const cs = getComputedStyle(canvas);
  const master = document.createElement('canvas');
  const mctx = master.getContext('2d');
  if (!mctx) return;
  const font = `${12 * dpr}px ${cs.fontFamily}`;
  mctx.font = font;
  const textW = Math.ceil(mctx.measureText(text).width) + 2;
  master.width = Math.max(1, textW);
  master.height = h;
  mctx.font = font; // canvas resize resets state
  mctx.textBaseline = 'middle';
  mctx.fillStyle = cs.color;
  mctx.fillText(text, 0, h / 2);

  let data: Uint8ClampedArray;
  try {
    data = mctx.getImageData(0, 0, master.width, master.height).data;
  } catch {
    return;
  }
  const cell = Math.max(2, Math.round(ECHO_CELL * dpr));
  // keep the newest characters in frame: slide the master left once it overruns
  const ox = Math.min(0, w - master.width);
  for (let y = 0; y < master.height; y += cell) {
    for (let x = 0; x < master.width; x += cell) {
      const sx = Math.min(master.width - 1, x + (cell >> 1));
      const sy = Math.min(master.height - 1, y + (cell >> 1));
      if (data[(sy * master.width + sx) * 4 + 3] < ECHO_ALPHA) continue;
      const dw = Math.min(cell, master.width - x);
      const dh = Math.min(cell, master.height - y);
      ctx.drawImage(master, x, y, dw, dh, x + ox, y, dw, dh);
    }
  }
}

/* --- the sheet ------------------------------------------------------------- */
const SGN_W = 300;
const SGN_H = 120;

/* Ghost correspondence: sample requests that type themselves onto the message
   block's placeholder, backspace, and try again — shuffled per visit. Killed
   for good the moment the visitor touches the block. */
const GHOST_STATIC = 'state the request in full';
const GHOSTS = [
  'We have one idea and two weeks. Draw it, build it, ship it',
  'Take our napkin sketch through design, engineering, shipped. One hand',
  'Audit our agent pipeline the way tracebench grades yours',
  'Build us a site that proves its own figures',
  'Idea: a drawing set that builds itself as you scroll. Oh. This one',
  'Pitch: replayable evals for our support-bot transcripts',
  'What would an honest metrics sheet for our product look like?',
  'RFI: is the pen ever off duty?',
  'Request: one more sheet in the set',
];

export default function SheetTransmittal() {
  const frameRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const envRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);
  const sgnRef = useRef<SVGSVGElement>(null);
  const livePolyRef = useRef<SVGPolylineElement>(null);
  const echoRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const t0 = useRef(0);
  const phaseRef = useRef<'form' | 'sending' | 'sent'>('form');

  const [hand, setHand] = useState(false);
  const [phase, setPhase] = useState<'form' | 'sending' | 'sent'>('form');
  const [rfi, setRfi] = useState<string | null>(null);
  const [sentOn, setSentOn] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; fault: boolean }>({ text: '', fault: false });
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const drawing = useRef<string[] | null>(null);

  phaseRef.current = phase;

  useEffect(() => {
    t0.current = Date.now();
  }, []);

  /* HANDOFF — engage after DrawingSet finishes the sheet's linework. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supported = () =>
      window.matchMedia('(pointer: fine)').matches &&
      window.matchMedia('(min-width: 901px)').matches;

    let engaged = false;
    let visible = true;
    const pointer = { x: -1, y: -1 };

    const feed = (x: number, y: number) => {
      const r = frame.getBoundingClientRect();
      penBus.set({
        x: Math.max(r.left, Math.min(r.right, x)),
        y: Math.max(r.top, Math.min(r.bottom, y)),
        ink: 'graphite',
        mode: 'draw',
        hand: 'visitor',
      });
    };
    const track = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (engaged && visible && phaseRef.current === 'form') feed(e.clientX, e.clientY);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        // Off-sheet the visitor's pen parks: it must never trail the reader
        // back up the set (the pour and the cover own those reaches).
        if (!visible && engaged && penBus.last?.hand === 'visitor') hidePenLocal();
      },
      { threshold: 0.12 },
    );
    io.observe(frame);

    const onDrawn = () => {
      if (phaseRef.current !== 'form') return;
      if (reduce || !supported()) {
        // No handoff on this device: the instrument simply parks.
        if (window.matchMedia('(min-width: 901px)').matches) dockPenLocal();
        else hidePenLocal();
        return;
      }
      engaged = true;
      setHand(true);
      if (pointer.x >= 0 && visible) feed(pointer.x, pointer.y);
    };
    window.addEventListener('ws:t01-drawn', onDrawn);
    window.addEventListener('pointermove', track);
    return () => {
      window.removeEventListener('ws:t01-drawn', onDrawn);
      window.removeEventListener('pointermove', track);
      io.disconnect();
      if (engaged && penBus.last?.hand === 'visitor') hidePenLocal();
    };
  }, []);

  /* GHOST TYPING — after the form is drawn, sample requests letter themselves
     onto the message block's placeholder: typed, held, backspaced, next, in a
     per-visit shuffle. Runs on gsap's ticker so the dev capture freeze halts
     it with everything else. The first focus or keystroke in the block kills
     the cycle and restores the static prompt. Reduced motion: static only. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ta = document.getElementById('t01-message') as HTMLTextAreaElement | null;
    if (!ta) return;

    const order = [...GHOSTS];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let idx = 0;
    let pos = 0;
    let phase: 'type' | 'hold' | 'del' = 'type';
    let wait = 0;
    let running = false;

    const tick = (time: number) => {
      if (phaseRef.current !== 'form') return stop();
      if (time < wait) return;
      const phrase = order[idx];
      if (phase === 'type') {
        pos++;
        ta.placeholder = phrase.slice(0, pos);
        if (pos >= phrase.length) {
          phase = 'hold';
          wait = time + 1.8;
        } else {
          wait = time + 0.032 + Math.random() * 0.028;
        }
      } else if (phase === 'hold') {
        phase = 'del';
        wait = time;
      } else {
        pos--;
        ta.placeholder = phrase.slice(0, pos);
        if (pos <= 0) {
          idx = (idx + 1) % order.length;
          phase = 'type';
          wait = time + 0.45;
        } else {
          wait = time + 0.014;
        }
      }
    };
    const start = () => {
      if (running) return;
      running = true;
      gsap.ticker.add(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      gsap.ticker.remove(tick);
      ta.placeholder = GHOST_STATIC;
    };
    window.addEventListener('ws:t01-drawn', start);
    ta.addEventListener('focus', stop);
    ta.addEventListener('input', stop);
    return () => {
      window.removeEventListener('ws:t01-drawn', start);
      ta.removeEventListener('focus', stop);
      ta.removeEventListener('input', stop);
      stop();
    };
  }, []);

  /* SGN — pointer strokes lay real polylines. Works with or without the
     handoff: signing is never gated on the pen being in the visitor's hand. */
  const sgnPoint = (e: ReactPointerEvent<SVGSVGElement>): string | null => {
    const svg = sgnRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = ((e.clientX - r.left) / r.width) * SGN_W;
    const y = ((e.clientY - r.top) / r.height) * SGN_H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const onSgnDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (phase !== 'form') return;
    const p = sgnPoint(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = [p];
    livePolyRef.current?.setAttribute('points', p);
  };
  const onSgnMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const p = sgnPoint(e);
    if (!p) return;
    drawing.current.push(p);
    livePolyRef.current?.setAttribute('points', drawing.current.join(' '));
  };
  const onSgnUp = () => {
    if (!drawing.current) return;
    const pts = drawing.current.join(' ');
    if (drawing.current.length > 1) setMarks((m) => [...m, pts]);
    drawing.current = null;
    livePolyRef.current?.setAttribute('points', '');
  };

  /* TRANSMIT ---------------------------------------------------------------- */
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || phase !== 'form') return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const val = (k: string) => String(fd.get(k) ?? '').trim();
    const signed = marks.length ? 'drawn' : typed.trim() ? `typed:${typed.trim()}` : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('from')))
      return setStatus({ text: 'FROM needs a reachable address', fault: true });
    if (!val('message')) return setStatus({ text: 'the message block is empty', fault: true });
    if (!signed) return setStatus({ text: 'countersign the sheet: draw your mark or letter your name', fault: true });

    setBusy(true);
    setStatus({ text: 'transmitting ···', fault: false });
    try {
      const res = await fetch('/api/transmit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: val('from'),
          message: val('message'),
          signed,
          firm: val('firm'),
          elapsed: Date.now() - t0.current,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; rfi?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.rfi) {
        setBusy(false);
        setStatus({ text: `transmission refused: ${data?.error ?? res.status}`, fault: true });
        return;
      }
      setRfi(data.rfi);
      setSentOn(new Date().toISOString().slice(0, 10));
      setStatus({ text: '', fault: false });
      fold();
    } catch {
      setBusy(false);
      setStatus({ text: 'transmission failed: the line is down, try mailto:hi@fullbuild.ai', fault: true });
    }
  };

  /* FOLD — the sheet becomes its own envelope, the stamp lands, the pen
     docks, and the rail site log gains the correspondence panel. */
  const fold = () => {
    setHand(false);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPhase('sending');
    if (reduce) {
      setPhase('sent');
      revealRailPost(true);
      return;
    }
    requestAnimationFrame(() => {
      const formEl = formRef.current;
      const envEl = envRef.current;
      if (!formEl || !envEl) {
        setPhase('sent');
        revealRailPost(true);
        return;
      }
      const strokes = Array.from(envEl.querySelectorAll<SVGElement>('.tx-env')).sort(
        (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
      );
      const lettering = envEl.querySelectorAll('.tx-envtext');
      // Attributes, not CSS — the same px-mis-scale trap the sheet strokes dodge.
      gsap.set(strokes, { attr: { 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 } });
      gsap.set(lettering, { autoAlpha: 0 });
      if (stampRef.current) gsap.set(stampRef.current, { autoAlpha: 0 });
      if (receiptRef.current) gsap.set(receiptRef.current, { autoAlpha: 0 });

      const tl = gsap.timeline({ onComplete: () => setPhase('sent') });
      tl.to(formEl, {
        rotationX: 56,
        yPercent: 10,
        scale: 0.28,
        autoAlpha: 0,
        transformOrigin: '50% 60%',
        duration: 0.9,
        ease: 'power2.inOut',
      });
      strokes.forEach((el, i) => {
        tl.to(
          el,
          { attr: { 'stroke-dashoffset': 0 }, duration: 0.5, ease: 'power2.out' },
          i === 0 ? '-=0.3' : '<0.06',
        );
      });
      tl.to(lettering, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' });
      if (stampRef.current) {
        tl.fromTo(
          stampRef.current,
          { autoAlpha: 0, scale: 1.45, rotation: -1 },
          { autoAlpha: 1, scale: 1, rotation: -3.5, duration: 0.4, ease: 'power3.out' },
          '-=0.15',
        );
      }
      if (receiptRef.current) tl.to(receiptRef.current, { autoAlpha: 1, duration: 0.5 }, '-=0.05');
      tl.call(() => {
        // The dock geometry belongs to the full-height rail; on the collapsed
        // (bottom-overlay) rail the instrument parks off-stage instead.
        if (window.matchMedia('(min-width: 901px)').matches) dockPenLocal();
        else hidePenLocal();
        revealRailPost(false);
      });
    });
  };

  const revealRailPost = (instant: boolean) => {
    const post = document.getElementById('ws-rail-post');
    if (!post) return;
    post.dataset.posted = 'true';
    if (instant) return;
    const strokes = Array.from(post.querySelectorAll<SVGElement>('.ws-post')).sort(
      (a, b) => Number(a.getAttribute('data-o') ?? 0) - Number(b.getAttribute('data-o') ?? 0),
    );
    gsap.set(strokes, { attr: { 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 } });
    const tl = gsap.timeline();
    strokes.forEach((el, i) => {
      tl.to(el, { attr: { 'stroke-dashoffset': 0 }, duration: 0.6, ease: 'power2.out' }, i === 0 ? 0 : '<0.08');
    });
  };

  const echo = (name: string) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.currentTarget.value;
    const tail = name === 'message' ? (v.split('\n').pop() ?? '').slice(-42) : v;
    plotEcho(echoRefs.current[name] ?? null, tail);
  };
  const setEcho = (name: string) => (el: HTMLCanvasElement | null) => {
    echoRefs.current[name] = el;
  };

  return (
    <section
      id="t-01"
      data-state="t01"
      data-ink="graphite"
      className={s.sheet}
      aria-label="Sheet T-01, transmittal, contact"
    >
      <div ref={frameRef} className={s.frame} data-hand={hand ? 'true' : undefined}>
        <header className={s.head}>
          <span className={`${s.stateNo} u-mono`}>T-01</span>
          <span className={`${s.stateName} u-label`}>Transmittal</span>
          <span className={`${s.sheetNo} u-mono`}>{rfi ?? 'RFI ····'}</span>
        </header>

        <h2 className={s.heading}>Plan</h2>

        <div className={s.stage} data-phase={phase}>
          <form ref={formRef} className={s.form} onSubmit={onSubmit} noValidate>
            <div className={s.fields}>
              <div className={s.row}>
                <span className={s.rowLabel} id="t01-to-label">To</span>
                <div className={s.rowField} aria-labelledby="t01-to-label">
                  <span className={`${s.toVal} u-mono`}>fullbuild.ai</span>
                  <svg className={s.rule} viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
                    <Line x1={0} y1={1} x2={100} y2={1} w={1.1} o={0} />
                  </svg>
                </div>
                <span aria-hidden="true" />
              </div>

              <div className={s.row}>
                <label className={s.rowLabel} htmlFor="t01-from">From</label>
                <div className={s.rowField}>
                  <input id="t01-from" name="from" type="email" className={s.input} placeholder="you@practice.tld" maxLength={200} autoComplete="email" onInput={echo('from')} />
                  <svg className={s.rule} viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
                    <Line x1={0} y1={1} x2={100} y2={1} w={1.1} o={1} />
                  </svg>
                </div>
                <canvas ref={setEcho('from')} className={s.echo} aria-hidden="true" />
              </div>

              <div className={`${s.row} ${s.rowTop}`}>
                <label className={s.rowLabel} htmlFor="t01-message">Message</label>
                <div className={`${s.rowField} ${s.msgWrap}`}>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <svg
                      key={n}
                      className={s.msgRule}
                      style={{ top: `calc(var(--msg-lh) * ${n + 1} - 2px)` }}
                      viewBox="0 0 100 2"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <Line x1={0} y1={1} x2={100} y2={1} w={1} o={5 + n} />
                    </svg>
                  ))}
                  <textarea id="t01-message" name="message" className={s.msg} maxLength={4000} placeholder={GHOST_STATIC} onInput={echo('message')} />
                </div>
                <canvas ref={setEcho('message')} className={s.echo} aria-hidden="true" />
              </div>

              <div className={s.sgnRow}>
                <span className={s.rowLabel} id="t01-sgn-label">Sgn</span>
                <div>
                  <svg
                    ref={sgnRef}
                    className={s.sgnBox}
                    viewBox={`0 0 ${SGN_W} ${SGN_H}`}
                    role="img"
                    aria-labelledby="t01-sgn-label"
                    aria-label="Signature box, draw your mark with the pointer"
                    onPointerDown={onSgnDown}
                    onPointerMove={onSgnMove}
                    onPointerUp={onSgnUp}
                    onPointerCancel={onSgnUp}
                  >
                    {/* blank paper must still take the nib: an unpainted svg
                        area is not a hit target, so this rect catches strokes
                        started anywhere inside the box */}
                    <rect width={SGN_W} height={SGN_H} fill="none" pointerEvents="fill" />
                    <Path d={`M1.5 1.5 H${SGN_W - 1.5} V${SGN_H - 1.5} H1.5 Z`} w={1.2} o={11} />
                    <Line x1={16} y1={SGN_H - 26} x2={SGN_W - 16} y2={SGN_H - 26} w={0.9} o={12} dash="2 3" />
                    {marks.map((pts, i) => (
                      <polyline
                        key={i}
                        points={pts}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <polyline
                      ref={livePolyRef}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {!marks.length && typed.trim() ? (
                      <text
                        x={SGN_W / 2}
                        y={SGN_H - 36}
                        textAnchor="middle"
                        fontFamily="var(--font-display)"
                        fontSize={26}
                        fontWeight={600}
                        fill="currentColor"
                      >
                        {typed.trim()}
                      </text>
                    ) : null}
                  </svg>
                  <div className={s.sgnMeta}>
                    <input
                      className={s.sgnTyped}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="or letter your name here"
                      maxLength={140}
                      aria-label="Typed signature fallback"
                    />
                    <button
                      type="button"
                      className={s.sgnClear}
                      onClick={() => {
                        setMarks([]);
                        setTyped('');
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* honeypot: no human ever sees this field */}
              <div className={s.trap} aria-hidden="true">
                <label htmlFor="t01-firm">Firm</label>
                <input id="t01-firm" name="firm" tabIndex={-1} autoComplete="off" />
              </div>

              <div className={s.actions}>
                <button type="submit" className={s.transmit} disabled={busy}>
                  Transmit
                </button>
                <span className={s.status} data-fault={status.fault ? 'true' : undefined} role="status">
                  {status.text}
                </span>
              </div>
            </div>

            <aside className={s.notes} aria-label="General notes">
              <div className={s.notesHead}>General notes</div>
              <ol>
                <li>Print in ink</li>
                <li>One subject per transmittal</li>
              </ol>
            </aside>
          </form>

          <div ref={envRef} className={s.envelope} aria-live="polite">
            <div className={s.envArt}>
              <svg className={s.envSvg} viewBox="0 0 340 210" aria-hidden="true">
                <path className="tx-env" data-o={0} pathLength={1} d="M6 6 H334 V204 H6 Z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={1} pathLength={1} d="M6 6 L170 118 L334 6" fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={2} pathLength={1} d="M6 204 L128 96" fill="none" stroke="currentColor" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={3} pathLength={1} d="M334 204 L212 96" fill="none" stroke="currentColor" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={4} pathLength={1} d="M292 20 h30 v38 h-30 Z" fill="none" stroke="currentColor" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={5} pathLength={1} d="M110 152 H230" fill="none" stroke="currentColor" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
                <path className="tx-env" data-o={6} pathLength={1} d="M124 168 H216" fill="none" stroke="currentColor" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
                <text className="tx-envtext" x={170} y={147} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="currentColor">
                  hi@fullbuild.ai
                </text>
                <text className="tx-envtext" x={307} y={43} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="currentColor">
                  T-01
                </text>
              </svg>
              <div ref={stampRef} className={s.stamp}>
                <span className={s.stampTitle}>Transmitted</span>
                <span className={s.stampNo}>{rfi ?? ''}</span>
              </div>
            </div>
            <p ref={receiptRef} className={s.receipt}>
              <b>{rfi ?? ''}</b> · lodged {sentOn ?? ''}
              <br />
              the response will issue from hi@fullbuild.ai
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
