// Lenis-lite — minimal smooth-scroll stand-in tuned to the measured reference curve
// (design-contract.md, Scroll physics): exponential lerp ~0.07 @60fps puts the measured
// settle trials (1660 / 1290 / 1224 ms) inside the accepted 0.6–1.66 s band.
// Recorded deviation: isolated ticks land exactly on target; continued fast input does
// NOT reproduce the reference's momentum overshoot (comparison-round follow-up).
// Mirrors the consumed surface of Lenis: stop/start/scrollTo/destroy + rAF loop,
// html.lenis-style classes are handled by the caller via menu state.

const KEY_STEPS = { ArrowDown: 80, ArrowUp: -80 };

export class LenisLite {
  constructor({ lerp = 0.07, onFrame = () => {} } = {}) {
    this.lerp = lerp;
    this.onFrame = onFrame;
    this.current = window.scrollY;
    this.target = window.scrollY;
    this.max = 0;
    this.stopped = false;
    this.disposed = false;
    this.lastProgrammatic = 0;
    this.rafId = 0;

    this.handleWheel = (event) => {
      // Swallow the wheel even while stopped (menu-open scroll lock): returning
      // without preventDefault lets the browser scroll natively underneath the
      // overlay (r7 runtime finding: 500px leak).
      event.preventDefault();
      if (this.stopped) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      this.scrollTo(this.target + event.deltaY * unit);
    };
    this.handleKey = (event) => {
      if (this.stopped || event.ctrlKey || event.metaKey || event.altKey) return;
      const small = KEY_STEPS[event.key];
      if (small !== undefined) {
        event.preventDefault();
        this.scrollTo(this.target + small);
      } else if (event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
        event.preventDefault();
        this.scrollTo(this.target + window.innerHeight);
      } else if (event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
        event.preventDefault();
        this.scrollTo(this.target - window.innerHeight);
      } else if (event.key === "Home") {
        event.preventDefault();
        this.scrollTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        this.scrollTo(Number.MAX_SAFE_INTEGER);
      }
    };
    this.handleNativeScroll = () => {
      const now = performance.now();
      if (now - this.lastProgrammatic > 150) {
        // Native scrollbar drag, focus jump, or anchor navigation: adopt position.
        this.current = this.target = window.scrollY;
      } else if (Math.abs(window.scrollY - this.current) > 2) {
        this.current = window.scrollY;
      }
    };
    this.handleResize = () => this.measure();

    window.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("keydown", this.handleKey);
    window.addEventListener("scroll", this.handleNativeScroll, { passive: true });
    window.addEventListener("resize", this.handleResize);
    this.measure();
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  measure() {
    this.max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  scrollTo(y) {
    this.measure();
    this.target = Math.max(0, Math.min(this.max, y));
  }

  stop() { this.stopped = true; }
  start() { this.stopped = false; }

  loop() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.stopped) {
      const diff = this.target - this.current;
      if (Math.abs(diff) > 0.1) {
        this.current += diff * this.lerp;
        this.lastProgrammatic = performance.now();
        window.scrollTo(0, this.current);
      } else if (this.current !== this.target) {
        this.current = this.target;
        this.lastProgrammatic = performance.now();
        window.scrollTo(0, this.current);
      }
    } else {
      this.current = this.target = window.scrollY;
    }
    this.onFrame(this.current, this.max, this.target);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("keydown", this.handleKey);
    window.removeEventListener("scroll", this.handleNativeScroll);
    window.removeEventListener("resize", this.handleResize);
  }
}
