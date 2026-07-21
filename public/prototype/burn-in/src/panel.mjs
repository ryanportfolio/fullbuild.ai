// DOM behaviors: knobs, boot readout settle, LED states, reveals, stamp,
// numeric tweens, footer telemetry, and operator-acknowledge spikes.

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function injectStyles() {
  const st = document.createElement("style");
  st.textContent = `
    html.js-anim .rv { opacity: 0; transform: translateY(16px);
      transition: opacity 400ms ${EASE}, transform 400ms ${EASE}; }
    html.js-anim .rv.is-rev { opacity: 1; transform: none; }
    html.js-anim .stamp { opacity: 0;
      transform: translate(-50%, -50%) rotate(-6deg) scale(1.35);
      transition: opacity 320ms ${EASE}, transform 320ms ${EASE}; }
    html.js-anim .stamp.is-stamped { opacity: 1;
      transform: translate(-50%, -50%) rotate(-6deg) scale(1); }
  `;
  document.head.appendChild(st);
}

function tweenReadout(el, finalText, reduced, delay) {
  const m = /^(\d+(?:\.(\d+))?)(.*)$/.exec(finalText);
  if (!m || reduced) { el.textContent = finalText; return; }
  const target = parseFloat(m[1]);
  const decimals = m[2] ? m[2].length : 0;
  const suffix = m[3] || "";
  el.textContent = "--" + suffix;
  const dur = 600;
  let start = 0;
  function frame(now) {
    if (!start) start = now;
    const p = Math.min(1, (now - start) / dur);
    const e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = (target * e).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }
  setTimeout(() => requestAnimationFrame(frame), delay);
}

function setupKnobs(api) {
  const knobEls = document.querySelectorAll("[data-knob]");
  const readouts = {
    trigger: document.querySelector('[data-readout="trigger"]'),
    sweep: document.querySelector('[data-readout="sweep"]')
  };
  const fmt = {
    trigger: (v) => (v / 100).toFixed(2),
    sweep: (v) => (0.8 + (v / 100) * 4).toFixed(1) + " ms"
  };

  knobEls.forEach((el) => {
    const name = el.dataset.knob;
    let value = Number(el.getAttribute("aria-valuenow")) || 50;

    function apply(v, detent) {
      value = Math.min(100, Math.max(0, v));
      if (detent) value = Math.round(value / 5) * 5;
      el.setAttribute("aria-valuenow", String(Math.round(value)));
      if (fmt[name]) el.setAttribute("aria-valuetext", fmt[name](value));
      el.style.setProperty("--knob-rot", (-135 + value * 2.7).toFixed(1) + "deg");
      if (readouts[name] && fmt[name]) readouts[name].textContent = fmt[name](value);
      api.setKnob(name, value / 100);
    }
    apply(value, false);

    let dragging = false;
    let lastX = 0, lastY = 0, touch = false;
    el.addEventListener("pointerdown", (ev) => {
      dragging = true;
      touch = ev.pointerType === "touch";
      lastX = ev.clientX; lastY = ev.clientY;
      el.setPointerCapture(ev.pointerId);
      api.spike("hero");
      ev.preventDefault();
    });
    el.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const dv = (ev.clientX - lastX) * 0.45 + (lastY - ev.clientY) * 0.45;
      lastX = ev.clientX; lastY = ev.clientY;
      apply(value + dv, false);
    });
    el.addEventListener("pointerup", () => {
      if (dragging && touch) apply(value, true);
      dragging = false;
    });
    el.addEventListener("pointercancel", () => { dragging = false; });

    el.addEventListener("keydown", (ev) => {
      const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 20, PageDown: -20 }[ev.key];
      if (step !== undefined) { apply(value + step, true); ev.preventDefault(); return; }
      if (ev.key === "Home") { apply(0, false); ev.preventDefault(); }
      if (ev.key === "End") { apply(100, false); ev.preventDefault(); }
    });
  });
}

function setupReveals(reduced) {
  if (reduced || !("IntersectionObserver" in window)) return;
  // Channels and bays sit still; the GL engine powers their tubes on
  // when they first scroll into view, so fade-sliding the cards too
  // would read as a template effect
  const items = document.querySelectorAll(
    ".sweep-intro, .dut-panel, .dut-side, .standby-intro, .cal-plate, .transmit-panel"
  );
  items.forEach((el) => el.classList.add("rv"));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add("is-rev");
        io.unobserve(en.target);
      }
    }
  }, { threshold: 0.2, rootMargin: "0px 0px -5% 0px" });
  items.forEach((el) => io.observe(el));
}

function setupLeds(reduced) {
  const liveIds = ["ch-idea", "ch-design", "ch-engineering"];
  const stamp = document.querySelector(".channel--shipped .stamp");
  if (reduced || !("IntersectionObserver" in window)) {
    liveIds.forEach((id) => {
      const led = document.querySelector(`[data-led="${id}"]`);
      if (led) led.classList.add("is-live");
    });
    if (stamp) stamp.classList.add("is-stamped");
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const scope = en.target.querySelector("[data-scope]");
      const id = scope ? scope.dataset.scope : "";
      if (liveIds.includes(id)) {
        const led = en.target.querySelector(".led");
        if (led) led.classList.add("is-live");
      }
      if (id === "ch-shipped") {
        const led = en.target.querySelector(".led");
        if (led) led.classList.add("is-armed");
        if (stamp) stamp.classList.add("is-stamped");
      }
      io.unobserve(en.target);
    }
  }, { threshold: 0.55 });
  document.querySelectorAll(".channel").forEach((el) => io.observe(el));
}

function setupSpikes(api) {
  const wire = (el, id) => {
    el.addEventListener("pointerenter", () => api.spike(id));
    el.addEventListener("focusin", () => api.spike(id));
  };
  const transmit = document.querySelector("[data-transmit]");
  if (transmit) {
    wire(transmit, "transmit");
    const refuse = () => { if (!api.reduced) transmit.classList.add("is-refused"); };
    transmit.addEventListener("pointerdown", () => { api.spike("transmit"); refuse(); });
    transmit.addEventListener("animationend", () => transmit.classList.remove("is-refused"));
    transmit.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { api.spike("transmit"); refuse(); ev.preventDefault(); }
    });
  }
  document.querySelectorAll(".site-header a").forEach((a) => wire(a, "hero"));
  document.querySelectorAll(".channel").forEach((ch) => {
    const scope = ch.querySelector("[data-scope]");
    if (scope) wire(ch, scope.dataset.scope);
  });
  const dut = document.querySelector(".dut-panel");
  if (dut) wire(dut, "dut");
}

function setupTelemetry() {
  const elapsedEl = document.querySelector('[data-telemetry="elapsed"]');
  const t0 = Date.now();
  if (elapsedEl) {
    setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      elapsedEl.textContent = mm + ":" + ss;
    }, 1000);
  }
}

export function initPanel(api) {
  const reduced = !!api.reduced;
  injectStyles();
  if (!reduced) document.documentElement.classList.add("js-anim");

  setupKnobs(api);
  setupReveals(reduced);
  setupLeds(reduced);
  setupSpikes(api);
  setupTelemetry();

  // Readout life: capture the printed base values before the boot tween
  // rewrites them; a slow interval below wobbles the last digit while the
  // matching channel trace is locked
  let latestChannels = null;
  const lifeItems = [];
  if (!reduced) {
    [
      { name: "gain-idea", ch: "ch-idea" },
      { name: "gain-design", ch: "ch-design" },
      { name: "rise", ch: "ch-engineering" }
    ].forEach((m, i) => {
      const el = document.querySelector(`[data-readout="${m.name}"]`);
      if (!el) return;
      const parsed = /^(\d+(?:\.(\d+))?)(.*)$/.exec(el.textContent);
      if (!parsed) return;
      lifeItems.push({
        el,
        ch: m.ch,
        base: parseFloat(parsed[1]),
        decimals: parsed[2] ? parsed[2].length : 0,
        suffix: parsed[3] || "",
        seed: 3 + i * 7,
        wobbled: false
      });
    });
  }

  // Boot readout settle, dashes to values, staggered; the hero TRIG and
  // SWEEP wells settle last, then knob interaction overwrites them as usual
  const settle = ["gain-idea", "gain-design", "rise", "trigger", "sweep"];
  settle.forEach((name, i) => {
    const el = document.querySelector(`[data-readout="${name}"]`);
    if (el) tweenReadout(el, el.textContent, reduced, 350 + i * 150);
  });

  if (lifeItems.length) {
    let lifeTick = 0;
    setInterval(() => {
      lifeTick++;
      lifeItems.forEach((it) => {
        const resolve = latestChannels ? (latestChannels[it.ch] || 0) : 0;
        if (resolve <= 0.4) {
          if (it.wobbled) {
            it.el.textContent = it.base.toFixed(it.decimals) + it.suffix;
            it.wobbled = false;
          }
          return;
        }
        // seeded, deterministic wobble around the base, never a drift
        const s = Math.sin(lifeTick * 2.399 + it.seed) * 43758.5453;
        const f = s - Math.floor(s);
        const step = f < 0.33 ? -1 : f > 0.66 ? 1 : 0;
        const v = it.base + step * 0.1;
        const dec = step === 0 ? it.decimals : Math.max(it.decimals, 1);
        it.el.textContent = v.toFixed(dec) + it.suffix;
        it.wobbled = step !== 0;
      });
    }, 2500);
  }

  const sweepsEl = document.querySelector('[data-telemetry="sweeps"]');
  let lastSweeps = -1;
  const ledEls = {};
  const ledLast = {};
  document.querySelectorAll("[data-led]").forEach((el) => {
    ledEls[el.dataset.led] = el;
  });
  return {
    updateStats(stats) {
      if (sweepsEl && stats && stats.sweeps !== lastSweeps) {
        lastSweeps = stats.sweeps;
        sweepsEl.textContent = String(stats.sweeps);
      }
      if (stats && stats.channels) {
        latestChannels = stats.channels;
        for (const id in stats.channels) {
          const el = ledEls[id];
          if (!el) continue;
          const v = stats.channels[id];
          if (ledLast[id] !== undefined && Math.abs(v - ledLast[id]) < 0.05) continue;
          ledLast[id] = v;
          el.style.setProperty("--led-live", v.toFixed(2));
        }
      }
    }
  };
}
