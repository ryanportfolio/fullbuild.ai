// quench · reveal.mjs
// Owns only: html.has-js, html.js-anim, and one-shot .rv reveals.
// No scroll listeners, no canvas awareness.

const root = document.documentElement;
root.classList.add("has-js");

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduced) root.classList.add("js-anim");

const targets = document.querySelectorAll(".rv");

if (reduced || !("IntersectionObserver" in window)) {
  for (const el of targets) el.classList.add("is-in");
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -12%", threshold: 0.12 }
  );
  for (const el of targets) io.observe(el);
}
