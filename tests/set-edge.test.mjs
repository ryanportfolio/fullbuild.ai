import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright';

/* THE BOUND EDGE's own eval harness.

   The edge claims to draw the real sheets of the real document at their real
   proportions, so every one of those claims is re-derived here from layout in a
   live browser and compared against what is actually painted on the strip. A
   band that drifts off its sheet, a grip that does not carry the viewport's true
   share, or an accent that reaches a sheet other than the shipped one all fail
   loudly rather than shipping as "looks about right".

   Needs a dev server, so it is OPT-IN like the other live checks here:
     EDGE_URL=http://localhost:PORT node --test tests/set-edge.test.mjs
   The source contract below that needs no browser runs unconditionally. */

const URL_BASE = process.env.EDGE_URL;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** Reduced motion is this site's own floor spec: no intro overlay, no Lenis, no
 *  hinge. Geometry measured there is the geometry with nothing animating it. */
const VIEW = { width: 1440, height: 900 };

async function withPage(fn, opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    reducedMotion: opts.motion === 'full' ? 'no-preference' : 'reduce',
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/** Everything the strip claims, read back off the live page in one pass. */
const READ_EDGE = () => {
  const edge = document.querySelector('[data-set-edge][data-scrollable]');
  if (!edge) return { present: false };
  const track = edge.getBoundingClientRect();
  const grip = edge.querySelector('[data-grip]');
  const gripBox = grip.getBoundingClientRect();
  const docTop = (el) => {
    let y = 0;
    for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
    return y;
  };
  const docH = document.documentElement.scrollHeight;
  return {
    present: true,
    scrollable: edge.dataset.scrollable,
    suppressed: window.innerWidth === document.documentElement.clientWidth,
    flagged: document.documentElement.hasAttribute('data-set-edge'),
    trackTop: track.top,
    trackH: track.height,
    trackW: track.width,
    gripTop: gripBox.top,
    gripH: gripBox.height,
    gripInk: getComputedStyle(grip).borderTopColor,
    gripMark: grip.textContent.trim(),
    docH,
    viewH: window.innerHeight,
    scrollY: window.scrollY,
    // What the strip actually painted.
    bands: [...edge.querySelectorAll('[class*="band"]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top, height: r.height, ink: getComputedStyle(b).borderTopColor };
    }),
    // What the document actually contains.
    sheets: [...document.querySelectorAll('[data-state]')].map((s) => ({
      state: s.dataset.state,
      top: docTop(s),
      height: s.offsetHeight,
    })),
  };
};

test('the strip is the stack: one band per real sheet, each at its real share', { skip: !URL_BASE }, async () => {
  const r = await withPage(async (page) => {
    await page.goto(`${URL_BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('[data-set-edge][data-scrollable="true"]') !== null,
    );
    return page.evaluate(READ_EDGE);
  });

  assert.equal(r.present, true, 'the edge is mounted');
  assert.equal(r.flagged, true, '<html> carries the flag that stands the platform bar down');
  assert.equal(r.suppressed, true, 'no platform scrollbar is reserving width');
  assert.ok(r.trackW > 8, `the strip has real width (${r.trackW}px)`);

  // COUNTABLE HONESTY. Not "about four" — exactly as many bands as the document
  // has sheets, and the homepage really does carry six.
  assert.ok(r.sheets.length >= 4, `the homepage carries its sheets (${r.sheets.length})`);
  assert.equal(r.bands.length, r.sheets.length, 'one band per sheet, no decorative extras');

  // Every band sits exactly where its sheet sits, scaled by the document.
  r.sheets.forEach((sheet, i) => {
    const expTop = r.trackTop + (sheet.top / r.docH) * r.trackH;
    const expH = (sheet.height / r.docH) * r.trackH;
    assert.ok(
      Math.abs(r.bands[i].top - expTop) < 1.5,
      `band ${i + 1} (sheet ${sheet.state}) starts at its sheet: ${r.bands[i].top.toFixed(2)} vs ${expTop.toFixed(2)}`,
    );
    assert.ok(
      Math.abs(r.bands[i].height - expH) < 1.5,
      `band ${i + 1} (sheet ${sheet.state}) is its sheet's share: ${r.bands[i].height.toFixed(2)} vs ${expH.toFixed(2)}`,
    );
  });

  // The grip is the viewport's true share of the document, not a fixed pill.
  const expGrip = (r.viewH / r.docH) * r.trackH;
  assert.ok(
    Math.abs(r.gripH - expGrip) < 1.5,
    `the grip is the viewport's share: ${r.gripH.toFixed(2)} vs ${expGrip.toFixed(2)}`,
  );
});

test('red reaches the shipped sheet and nothing else on the margin', { skip: !URL_BASE }, async () => {
  const r = await withPage(async (page) => {
    await page.goto(`${URL_BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('[data-set-edge][data-scrollable="true"]') !== null,
    );
    return page.evaluate(READ_EDGE);
  });

  // --accent-live on the day ground, resolved.
  const LIVE = 'rgb(203, 58, 38)';
  const red = r.bands.map((b, i) => ({ i, ink: b.ink })).filter((b) => b.ink === LIVE);
  assert.equal(red.length, 1, `exactly one band is inked red (got ${red.length})`);
  const shippedIndex = r.sheets.findIndex((s) => s.state === '04');
  assert.equal(red[0].i, shippedIndex, 'the red band is sheet 04, the shipped one');
});

test('the grip reaches both ends of the track and reports the sheet it holds', { skip: !URL_BASE }, async () => {
  const out = await withPage(async (page) => {
    await page.goto(`${URL_BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('[data-set-edge][data-scrollable="true"]') !== null,
    );
    const at = async (y) => {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(120);
      return page.evaluate(READ_EDGE);
    };
    const top = await at(0);
    const max = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const bottom = await at(max);
    const middle = await at(Math.round(max * 0.5));
    return { top, bottom, middle, max };
  });

  assert.ok(
    Math.abs(out.top.gripTop - out.top.trackTop) < 1.5,
    'at rest the grip sits at the head of the track',
  );
  const bottomGap = out.bottom.trackTop + out.bottom.trackH - (out.bottom.gripTop + out.bottom.gripH);
  assert.ok(Math.abs(bottomGap) < 1.5, `at the end of the set the grip lands on the foot (${bottomGap.toFixed(2)}px off)`);

  // The mark is a real sheet's mark, not a placeholder.
  const marks = [out.top.gripMark, out.middle.gripMark, out.bottom.gripMark];
  marks.forEach((m) => assert.match(m, /^(0[1-4]|RV|TR)$/, `grip mark "${m}" names a real sheet`));
  assert.notEqual(out.top.gripMark, out.bottom.gripMark, 'the mark changes across the set');
});

test('dragging the grip drives the document, and the two stay locked together', { skip: !URL_BASE }, async () => {
  const out = await withPage(async (page) => {
    await page.goto(`${URL_BASE}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('[data-set-edge][data-scrollable="true"]') !== null,
    );
    const before = await page.evaluate(READ_EDGE);
    const x = VIEW.width - 6; // inside the strip, hard against the page's right edge
    const from = before.gripTop + before.gripH / 2;
    const travel = before.trackH - before.gripH;
    const range = before.docH - before.viewH;
    const drop = 200;
    await page.mouse.move(x, from);
    await page.mouse.down();
    await page.mouse.move(x, from + drop, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(160);
    const after = await page.evaluate(READ_EDGE);
    return { before, after, travel, range, drop };
  });

  const expected = (out.drop / out.travel) * out.range;
  assert.ok(
    Math.abs(out.after.scrollY - expected) < 24,
    `a ${out.drop}px drag moved the set ${out.after.scrollY.toFixed(0)}px, expected ~${expected.toFixed(0)}px`,
  );
  // And the grip is still where that scroll position says it should be.
  const expGripTop = out.after.trackTop + (out.after.scrollY / out.range) * out.travel;
  assert.ok(
    Math.abs(out.after.gripTop - expGripTop) < 2,
    'the grip tracks the position it just set',
  );
});

/* The two tests above run on the reduced-motion floor, where there is no Lenis
   at all — so they prove the geometry and prove nothing about the path a real
   visitor takes. This one runs the set at full motion, waits out the intro (which
   holds Lenis stopped for its whole run and covers the strip while it does), and
   drags the grip through the scroll authority that is actually in charge. */
test('the grip drives the page through Lenis, not around it', { skip: !URL_BASE }, async () => {
  const out = await withPage(
    async (page) => {
      await page.goto(`${URL_BASE}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__lenis !== undefined, null, { timeout: 40000 });
      // Not a sleep: wait until the strip is genuinely the topmost thing at its
      // own coordinates AND the scroll authority is running again.
      await page.waitForFunction(
        () => {
          const el = document.elementFromPoint(window.innerWidth - 6, 40);
          return (
            !window.__lenis.isStopped &&
            el !== null &&
            el.closest('[data-set-edge][data-scrollable="true"]') !== null
          );
        },
        null,
        { timeout: 40000 },
      );
      const before = await page.evaluate(READ_EDGE);
      const x = VIEW.width - 6;
      const from = before.gripTop + before.gripH / 2;
      const travel = before.trackH - before.gripH;
      const range = before.docH - before.viewH;
      const drop = 260;
      await page.mouse.move(x, from);
      await page.mouse.down();
      await page.mouse.move(x, from + drop, { steps: 16 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      return { after: await page.evaluate(READ_EDGE), travel, range, drop };
    },
    { motion: 'full' },
  );

  const expected = (out.drop / out.travel) * out.range;
  assert.ok(
    Math.abs(out.after.scrollY - expected) < 40,
    `with Lenis in charge, a ${out.drop}px drag moved the set ${out.after.scrollY.toFixed(0)}px, expected ~${expected.toFixed(0)}px`,
  );
  assert.match(out.after.gripMark, /^(0[1-4]|RV|TR)$/, 'and the grip still names a real sheet');
});

test('no route is ever left with neither bar', { skip: !URL_BASE }, async () => {
  const r = await withPage(async (page) => {
    // A prototype owns its whole canvas and mounts no chrome: platform bar stays.
    await page.goto(`${URL_BASE}/prototype`, { waitUntil: 'load' });
    const proto = await page.evaluate(() => ({
      flagged: document.documentElement.hasAttribute('data-set-edge'),
      edge: document.querySelector('[data-set-edge][data-scrollable]') !== null,
      // Asked of the style, not of the layout: a gallery that happens to fit the
      // viewport shows no bar either, and that is not the same as being denied
      // one. This is the property the suppression actually sets.
      suppressed: getComputedStyle(document.documentElement).scrollbarWidth === 'none',
    }));
    // THE INVARIANT, asked of every route that carries the flag: the platform
    // bar is only ever stood down where something replaces it. A route with a
    // little scroll counts — the first cut of this used the site log's
    // half-a-viewport floor and left /examples (197px of overhang here) with the
    // native bar suppressed and nothing drawn in its place.
    const routes = ['/', '/contact', '/examples', '/prediction-lab'];
    const rest = [];
    for (const route of routes) {
      await page.goto(`${URL_BASE}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      rest.push({
        route,
        ...(await page.evaluate(() => {
          const el = document.querySelector('[data-set-edge][data-scrollable]');
          return {
            flagged: document.documentElement.hasAttribute('data-set-edge'),
            range: document.documentElement.scrollHeight - window.innerHeight,
            painted: el ? getComputedStyle(el).display !== 'none' : false,
          };
        })),
      });
    }
    return { proto, rest };
  });

  assert.equal(r.proto.edge, false, 'the prototypes mount no edge');
  assert.equal(r.proto.flagged, false, 'and therefore never suppress the platform bar');
  assert.equal(r.proto.suppressed, false, 'the prototype keeps a real scrollbar');

  for (const s of r.rest) {
    if (!s.flagged) continue;
    assert.equal(
      s.range > 1,
      s.painted,
      `${s.route}: ${s.range}px of scroll, edge painted = ${s.painted} — a suppressed platform bar with nothing drawn is the one state this must never reach`,
    );
  }
});

test('the suppression is gated on the replacement, in source', async () => {
  const [globals, edge] = await Promise.all([
    read('src/app/globals.css'),
    read('src/components/chrome/SetEdge.tsx'),
  ]);
  // The platform bar is never hidden unconditionally.
  assert.ok(
    !/^\s*(html|body)\s*\{[^}]*scrollbar-width:\s*none/m.test(globals),
    'no blanket scrollbar suppression',
  );
  assert.match(globals, /html\[data-set-edge\]\s*\{\s*scrollbar-width:\s*none;/);
  assert.match(globals, /html\[data-set-edge\]::-webkit-scrollbar/);
  // And the flag is stamped by the component that draws the replacement.
  assert.match(edge, /html\.dataset\.setEdge = '';/);
  assert.match(edge, /delete html\.dataset\.setEdge;/);
  // The strip stands down only on a genuinely dead range, never on a floor
  // borrowed from an animation's needs.
  assert.match(edge, /const scrollable = range > 1;/);
  // A grabbed scrollbar must never be refused: Lenis' scrollTo returns silently
  // while stopped or locked unless it is forced.
  assert.match(edge, /lenis\.scrollTo\(y, \{ immediate, force: true \}\);/);
  // Geometry comes from layout, never from a transformed rect (the HINGE).
  assert.match(edge, /node\.offsetTop/);
  assert.ok(
    !edge.includes('getBoundingClientRect().top + window.scrollY'),
    'band geometry never reads a transformed rect',
  );
});
