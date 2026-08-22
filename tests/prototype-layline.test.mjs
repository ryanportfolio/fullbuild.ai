import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const laylineSources = async () => {
  const roots = ['src/components/layline', 'src/lib/layline', 'src/app/prototype/layline'];
  const files = [];
  for (const root of roots) {
    const entries = await readdir(new URL(`../${root}`, import.meta.url), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const dir = entry.parentPath.replaceAll('\\', '/');
      files.push(`${dir.slice(dir.indexOf(root))}/${entry.name}`);
    }
  }
  return files;
};

test('Layline is discoverable and the page keeps its identity', async () => {
  const [directory, page] = await Promise.all([
    read('public/prototype/index.html'),
    read('src/app/prototype/layline/page.tsx'),
  ]);

  assert.equal((directory.match(/href="\/prototype\/layline"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">18<\/span>[\s\S]*?<h2>Layline<\/h2>/);
  assert.match(directory, /Sports telemetry · WebGL/);
  assert.match(directory, /four fixes a second/);

  assert.match(page, /title: "Layline · Race Replay"/);
  assert.match(page, /generateRace\(RACE_SEED\)/);
  assert.match(page, /Skip to the replay console/);
  assert.match(page, /Spec work by Ryan Allen \| all demo concepts/);
});

test('Layline engine identity holds: seed, fix rate, lens, version pin', async () => {
  const [types, pkg] = await Promise.all([read('src/lib/layline/types.ts'), read('package.json')]);

  /* The whole page is two readings of one number: the server chart and the
   * client replay both come from this seed at this fix rate. */
  assert.match(types, /export const RACE_SEED = 20280726;/);
  assert.match(types, /export const FIX_HZ = 4;/);
  assert.match(types, /export type ReplayMode = "smooth" \| "raw";/);

  /* three r181/182 broke slerp extrapolation and WebGPU cannot run the
   * ShaderMaterial water; 0.171 is a pin, not a lag. */
  assert.match(pkg, /"three": "\^0\.171\./);
});

test('Layline sources carry no wall-clock time, no unseeded randomness, no banned marks', async () => {
  const files = await laylineSources();
  assert.ok(files.length >= 30, `expected the full layline tree, saw ${files.length} files`);

  for (const path of files) {
    const source = await read(path);
    assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|new Date\(/, path);
    assert.doesNotMatch(source, /[—–…‘’“”]/, path);
  }
});

test('Layline stylesheet keeps the house rules', async () => {
  const styles = await read('src/app/prototype/layline/layline.module.css');

  assert.match(styles, /--house-cursor: var\(--house-cursor-frost\);/);
  assert.match(styles, /@media \(min-width: 901px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /cursor:\s*pointer/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|backdrop-filter/);
});
