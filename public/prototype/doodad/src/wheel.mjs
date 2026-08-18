// doodad · wheel.mjs
// WHEEL: the showcase carousel. The cards sit on a circle seen almost edge on.
// One angle per card drives everything: sin gives sideways travel and tilt,
// cos gives depth, which becomes scale, opacity and stacking order.
//
// Without JS the same markup is a plain scrollable row of phones, so this file
// only ever upgrades a page that already works.

const stage = document.querySelector("[data-stage]");

if (stage) {
  const root = document.documentElement;
  const cards = [...stage.querySelectorAll("[data-card]")];
  const dots = [...document.querySelectorAll("[data-dot]")];

  const COUNT = cards.length;
  const STEP = 0.6;                 // radians between neighbouring cards
  const CLICK_THRESHOLD = STEP * 0.4;
  const EASE_PER_FRAME = 0.052;     // ~19 frames per turn

  let front = 0;
  let offset = 0;
  let raf = null;

  // Reduced motion and a frozen capture both want the same thing: land on the
  // new card immediately rather than animating there.
  const instant = () =>
    root.getAttribute("data-motion") !== "on" || root.classList.contains("is-frozen");

  const radiusX = () => (window.innerWidth <= 900 ? window.innerWidth * 0.38 : 330);

  const angleOf = (i) => {
    let rel = (i - front + COUNT) % COUNT;
    if (rel > COUNT / 2) rel -= COUNT;
    return rel * STEP + offset;
  };

  const apply = () => {
    const rx = radiusX();

    cards.forEach((card, i) => {
      const a = angleOf(i);
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const absA = Math.abs(a);

      // Full strength across the front third, then a linear fade to nothing.
      const opacity =
        absA > STEP * 1.7
          ? 0
          : absA > STEP * 0.9
            ? (STEP * 1.7 - absA) / (STEP * 1.1)
            : 1;

      card.style.transform =
        "translate(-50%,-50%)" +
        " translateX(" + (sin * rx).toFixed(2) + "px)" +
        " translateY(" + ((1 - cos) * 38).toFixed(2) + "px)" +
        " rotate(" + (sin * 14).toFixed(2) + "deg)" +
        " scale(" + Math.max(0.05, 0.18 + 0.82 * cos).toFixed(4) + ")";
      card.style.opacity = opacity.toFixed(3);
      card.style.zIndex = String(Math.round(cos * 6) + 6);
      card.style.pointerEvents = opacity > 0.05 ? "auto" : "none";
      card.style.cursor = absA > CLICK_THRESHOLD ? "pointer" : "default";
      card.setAttribute("aria-hidden", opacity > 0.05 ? "false" : "true");
    });

    dots.forEach((dot, i) => {
      dot.setAttribute("aria-current", i === front ? "true" : "false");
    });
  };

  // steps > 1 turns several cards on one arc, so a dot always lands on the card
  // its label names instead of nudging the wheel one place along.
  const land = (dir, steps) => ((front + dir * steps) % COUNT + COUNT) % COUNT;

  const go = (dir, steps = 1) => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }

    if (instant()) {
      front = land(dir, steps);
      offset = 0;
      apply();
      return;
    }

    const from = offset;
    const delta = -dir * STEP * steps;
    let progress = 0;

    const turn = () => {
      progress = Math.min(1, progress + EASE_PER_FRAME);
      offset = from + delta * (1 - Math.pow(1 - progress, 3));
      apply();

      if (progress < 1) {
        raf = requestAnimationFrame(turn);
        return;
      }

      // Land clean: the wheel keeps its index, not an accumulated offset.
      offset = 0;
      front = land(dir, steps);
      apply();
      raf = null;
    };

    raf = requestAnimationFrame(turn);
  };

  for (const button of document.querySelectorAll("[data-nav]")) {
    button.addEventListener("click", () => {
      go(button.getAttribute("data-nav") === "next" ? 1 : -1);
    });
  }

  cards.forEach((card, i) => {
    card.addEventListener("click", () => {
      const a = angleOf(i);
      if (a > CLICK_THRESHOLD) go(1);
      else if (a < -CLICK_THRESHOLD) go(-1);
    });
  });

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      if (i === front || raf) return;
      const forward = (i - front + COUNT) % COUNT;
      const back = COUNT - forward;
      if (forward <= back) go(1, forward);
      else go(-1, back);
    });
  });

  // Touch: lock to an axis on the first move so a vertical scroll through the
  // section is never stolen by the carousel.
  let startX = 0;
  let startY = 0;
  let axis = null;

  stage.addEventListener(
    "touchstart",
    (event) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      axis = null;
    },
    { passive: true }
  );

  stage.addEventListener(
    "touchmove",
    (event) => {
      if (!axis) {
        const dx = Math.abs(event.touches[0].clientX - startX);
        const dy = Math.abs(event.touches[0].clientY - startY);
        axis = dx > dy ? "h" : "v";
      }
      if (axis === "h") event.preventDefault();
    },
    { passive: false }
  );

  stage.addEventListener("touchend", (event) => {
    if (axis !== "h") return;
    const moved = event.changedTouches[0].clientX - startX;
    if (Math.abs(moved) > 38) go(moved < 0 ? 1 : -1);
  });

  window.addEventListener("resize", apply, { passive: true });

  apply();
}
