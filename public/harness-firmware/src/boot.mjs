/* Progressive enhancement only: the page is complete without this file.
   Scroll-reveals the boot-log rows and section heads in document order.
   Contract: one easing (in CSS), reduced-motion honored, no other effects. */

document.body.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = document.querySelectorAll('.rv');

if (reduced || !('IntersectionObserver' in window)) {
  targets.forEach((el) => el.classList.add('on'));
} else {
  // Stagger siblings that arrive in the same frame so log rows print in
  // sequence, like a boot log, instead of popping in as one block.
  let pending = [];
  let flushScheduled = false;
  const flush = () => {
    pending
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .forEach((el, i) => {
        setTimeout(() => el.classList.add('on'), i * 70);
      });
    pending = [];
    flushScheduled = false;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        pending.push(entry.target);
        io.unobserve(entry.target);
      }
      if (pending.length && !flushScheduled) {
        flushScheduled = true;
        requestAnimationFrame(flush);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  targets.forEach((el) => io.observe(el));
}
