/* Flomasters: the small stuff. No frameworks, no loops, nothing on first paint. */

// Footer year
for (const el of document.querySelectorAll('[data-year]')) {
  el.textContent = String(new Date().getFullYear());
}

// Sticky mobile call bar: hidden while the hero's own call button is on
// screen, shown once it scrolls away. Pages without a hero anchor show it
// immediately.
const callbar = document.querySelector('.callbar');
const anchor = document.querySelector('[data-callbar-anchor]');
if (callbar) {
  if (anchor && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) callbar.removeAttribute('data-show');
      else callbar.setAttribute('data-show', '');
    }).observe(anchor);
  } else {
    callbar.setAttribute('data-show', '');
  }
}

// Booking page: the house diagnostic pre-fills the form, and the form
// resolves to a success state locally (this prototype has no backend).
const form = document.querySelector('[data-request-form]');
if (form) {
  const jobSelect = form.querySelector('#job');
  const hint = document.querySelector('[data-job-hint]');
  // The tappable house spots and the mobile job chips drive the same state
  const spots = document.querySelectorAll('.house-spot, .job-chip');

  const pick = (spot) => {
    for (const other of spots) other.setAttribute('aria-pressed', String(other.dataset.job === spot.dataset.job));
    if (jobSelect) jobSelect.value = spot.dataset.job;
    if (hint) {
      hint.innerHTML = `<strong>${spot.dataset.label}:</strong> ${spot.dataset.price}. Firm price in writing before I start.`;
      hint.hidden = false;
      hint.scrollIntoView({ block: 'nearest' });
    }
  };

  for (const spot of spots) {
    spot.addEventListener('click', () => pick(spot));
    spot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pick(spot);
      }
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.querySelector('.trap input')?.value) return; // honeypot
    const name = form.querySelector('#name')?.value?.trim().split(/\s+/)[0] ?? '';
    const who = document.querySelector('[data-success-name]');
    if (who && name) who.textContent = `Got it, ${name}`;
    document.querySelector('[data-request]')?.setAttribute('data-sent', '');
    document.querySelector('.form-success')?.scrollIntoView({ block: 'center' });
  });
}
