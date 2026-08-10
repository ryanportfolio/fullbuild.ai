import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/* E-02's live checks: every evidence link the ledger prints must answer, and
   the record page must still carry the run it froze. These need the network
   and the product's uptime, so they are OPT-IN: run with PLAB_LIVE=1 (they
   are part of the release checklist, not of CI). The state a link encodes is
   client-rendered, so the automated floor here is response + shell; the full
   state restore was verified by hand in a real browser on 2026-08-10. */

const LIVE = process.env.PLAB_LIVE === '1';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every evidence link answers with the app shell', { skip: !LIVE }, async () => {
  const projects = await read('src/lib/projects.ts');
  const origin = projects.match(/id: 'prediction-lab',[\s\S]*?href: '([^']+)'/)[1];
  const walk = await read('src/app/prediction-lab/walk.ts');
  const params = [...walk.matchAll(/params: '([^']*)'/g)].map((m) => m[1]);

  for (const p of params) {
    const url = p.startsWith('/') ? `${origin}${p}` : `${origin}/${p}`;
    const res = await fetch(url, { redirect: 'follow' });
    assert.equal(res.status, 200, `${url} answers 200`);
    const body = await res.text();
    assert.ok(body.length > 500, `${url} returns a document`);
  }
});

test('the decision record still carries the frozen run', { skip: !LIVE }, async () => {
  const projects = await read('src/lib/projects.ts');
  const origin = projects.match(/id: 'prediction-lab',[\s\S]*?href: '([^']+)'/)[1];
  const res = await fetch(`${origin}/record/234`);
  assert.equal(res.status, 200);
  const body = await res.text();
  // The record is served as a real document, so these read straight out of
  // the response. Headings are uppercased by CSS, so match the source casing.
  for (const claim of ['Run 234', 'Bodily Injury Frequency', 'v13', 'Decision evidence']) {
    assert.ok(body.includes(claim), `record page carries "${claim}"`);
  }
});

test('the release asset streams with range support', { skip: !LIVE }, async () => {
  const walk = await read('src/app/prediction-lab/walk.ts');
  const src = walk.match(/src: '([^']+\.mp4)'/)[1];
  const res = await fetch(src, { headers: { Range: 'bytes=0-1023' }, redirect: 'follow' });
  assert.equal(res.status, 206, 'release asset honors range requests');
});
