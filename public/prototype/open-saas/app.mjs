const root = document.documentElement;
const body = document.body;
const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const drawer = document.querySelector('[data-mobile-drawer]');
const scrim = document.querySelector('[data-drawer-scrim]');
const themeToggles = [...document.querySelectorAll('[data-theme-toggle]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

root.classList.add('has-js');

function applyTheme(theme, persist = false) {
  root.dataset.theme = theme;
  const isDark = theme === 'dark';
  for (const toggle of themeToggles) toggle.checked = isDark;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#071016' : '#fffdfb');
  if (persist) {
    try { localStorage.setItem('open-build-theme', theme); } catch {}
  }
}

function initialTheme() {
  try {
    const saved = localStorage.getItem('open-build-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return root.dataset.theme === 'dark' ? 'dark' : 'light';
}

applyTheme(initialTheme());

for (const toggle of themeToggles) {
  toggle.addEventListener('change', () => applyTheme(toggle.checked ? 'dark' : 'light', true));
}

function menuLabel(open) {
  const label = menuButton?.querySelector('.sr-only');
  if (label) label.textContent = open ? 'Close main menu' : 'Open main menu';
}

function setMenu(open) {
  if (!menuButton || !drawer || !scrim) return;
  menuButton.setAttribute('aria-expanded', String(open));
  drawer.setAttribute('aria-hidden', String(!open));
  menuLabel(open);
  body.classList.toggle('is-locked', open);

  if (open) {
    scrim.hidden = false;
    requestAnimationFrame(() => {
      drawer.dataset.open = 'true';
      scrim.dataset.open = 'true';
    });
  } else {
    delete drawer.dataset.open;
    delete scrim.dataset.open;
    const finish = () => { scrim.hidden = true; };
    if (reducedMotion.matches) finish();
    else window.setTimeout(finish, 320);
  }
}

menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
scrim?.addEventListener('click', () => setMenu(false));

drawer?.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuButton.focus();
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024 && menuButton?.getAttribute('aria-expanded') === 'true') setMenu(false);
});

let scrolled = false;
function updateHeader() {
  const next = window.scrollY > 110;
  if (next === scrolled) return;
  scrolled = next;
  if (header) header.dataset.scrolled = String(next);
}
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const revealTargets = [...document.querySelectorAll('[data-reveal]')];
let revealObserver;

function revealAll() {
  for (const target of revealTargets) target.classList.add('is-visible');
}

if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  revealAll();
} else {
  revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -18% 0px', threshold: 0.02 });

  for (const target of revealTargets) revealObserver.observe(target);
}

reducedMotion.addEventListener('change', (event) => {
  if (event.matches) {
    revealObserver?.disconnect();
    revealAll();
  }
});

for (const details of document.querySelectorAll('.faq details')) {
  details.addEventListener('toggle', () => {
    if (!details.open || window.innerWidth >= 768) return;
    for (const peer of document.querySelectorAll('.faq details[open]')) {
      if (peer !== details) peer.open = false;
    }
  });
}

window.__openBuildCapture = {
  freeze() {
    root.classList.add('capture-frozen');
    revealAll();
  },
  thaw() {
    root.classList.remove('capture-frozen');
  },
};
