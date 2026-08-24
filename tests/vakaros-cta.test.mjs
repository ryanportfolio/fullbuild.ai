import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/* The E-02 sheet trades the set's title block for one address: the Vakaros
   wordmark, drawn, over a link to the Layline prototype. These hold the parts
   a rewrite could quietly break: the route the swap is scoped to, the letter
   that draws first, and the floor a reader gets with no JS or reduced
   motion. */

test('the title block stands down on the tape sheet, and only there', async () => {
  const block = await read('src/components/chrome/TitleBlock.tsx');

  assert.match(block, /const onLaylineVid = pathname === '\/layline-vid';/);
  assert.match(block, /\{onLaylineVid \? \(\s*<VakarosCta \/>/);
  // the swap is a branch, not a deletion: the set's own block still ships
  assert.match(block, /className=\{styles\.block\}/);
  assert.match(block, /IN SERVICE/);
  assert.match(block, /REV \{rev\}/);
});

test('the CTA points at the race replay and says what it is', async () => {
  const cta = await read('src/components/chrome/VakarosCta.tsx');

  assert.match(cta, /export const CTA_HREF = 'https:\/\/fullbuild\.ai\/prototype\/layline\/races';/);
  assert.match(cta, /href=\{CTA_HREF\}/);
  assert.match(cta, /layline prototype/);
  // the mark is the link's picture, so the link carries the accessible name
  assert.match(cta, /aria-label="vakaros: the Layline prototype race replay"/);
  assert.match(cta, /aria-hidden="true"[\s\S]{0,80}data-draw-hold/);
});

test('the k draws first, alone, and the word follows it', async () => {
  const mark = await read('src/components/chrome/vakarosMark.ts');
  const cta = await read('src/components/chrome/VakarosCta.tsx');

  const ids = [...mark.matchAll(/id: '([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['k', 'v', 'a1', 'a2', 'r', 'o', 's'], 'k leads the draw order');

  // the first group is drawn on its own beat, the rest start after it pours
  assert.match(cta, /const \[k, \.\.\.rest\] = groups;/);
  assert.match(cta, /draw\(k, 0, K_DRAW, K_POUR\);/);
  assert.match(cta, /const restAt = K_DRAW \+ K_POUR \+ K_HOLD;/);
  assert.match(cta, /rest\.forEach\(\(g, i\) => draw\(g, restAt \+ i \* REST_STAGGER/);
  // and the caption lands only once the whole word has poured
  assert.match(cta, /const WORD_DONE =/);
});

test('the traced letterforms are closed contours inside their own box', async () => {
  const mark = await read('src/components/chrome/vakarosMark.ts');

  const vb = mark.match(/MARK_VIEWBOX = \{ w: ([\d.]+), h: ([\d.]+) \}/);
  const [w, h] = [Number(vb[1]), Number(vb[2])];
  assert.equal(h, 100, 'cap height normalizes to 100 units');
  assert.ok(w > 400 && w < 500, 'the word keeps the artwork proportion');

  const paths = [...mark.matchAll(/'(M[-\d.LZ ]+)'/g)].map((m) => m[1]);
  assert.equal(paths.length, 10, 'seven letters, three of them carrying a counter');
  for (const d of paths) {
    assert.ok(d.endsWith(' Z'), 'every contour closes');
    const nums = d.match(/-?[\d.]+/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      assert.ok(nums[i] >= -0.5 && nums[i] <= w + 0.5, `x ${nums[i]} inside the box`);
      assert.ok(nums[i + 1] >= -0.5 && nums[i + 1] <= h + 0.5, `y ${nums[i + 1]} inside the box`);
    }
  }
  // provenance: the file names the artwork it was traced from and the check
  assert.match(mark, /vakaros-logo-white\.png/);
  assert.match(mark, /IoU 0\.994/);
  assert.match(mark, /scripts\/trace-mark\.mjs/);
});

test('no-JS and reduced motion get the finished word', async () => {
  const cta = await read('src/components/chrome/VakarosCta.tsx');
  const css = await read('src/components/chrome/VakarosCta.module.css');

  // reduced motion never arms the hidden state
  assert.match(cta, /prefers-reduced-motion: reduce/);
  assert.match(cta, /if \(reduce\) return;/);
  // the hidden state is armed in JS only, so the SSR markup is the drawn mark
  assert.ok(!css.includes('stroke-dashoffset'), 'no CSS hides the mark before hydration');
  assert.match(cta, /svg\.setAttribute\('data-ws-armed', ''\)/);
  // teardown mid-draw leaves a plain path, never a half-drawn word
  assert.match(cta, /return \(\) => \{[\s\S]*settle\(g\)/);

  const visible = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!visible(cta).includes('—'), 'no em dash in CTA output');
});
