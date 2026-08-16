import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('hosted creator remains useful before GitHub App configuration', async () => {
  const [html, js, config] = await Promise.all([
    read('public/harness-firmware/new/index.html'),
    read('public/harness-firmware/new/new-project.js'),
    read('next.config.mjs'),
  ]);

  assert.match(config, /source: '\/harness-firmware\/new'/);
  assert.match(html, /Harness-Firmware\/generate/);
  assert.match(html, /<noscript>[\s\S]*Open GitHub template/);
  assert.match(js, /GitHub template ready/);
  assert.match(js, /Create on GitHub/);
  assert.match(js, /\/api\/harness\/github\/status/);
  assert.match(js, /\/api\/harness\/github\/create/);
  assert.match(js, /disabledSkills/);
  assert.match(js, /\/api\/harness\/github\/disconnect/);
  assert.doesNotMatch(html + js, /GITHUB_APP_PRIVATE_KEY|HARNESS_SESSION_SECRET/);
});

test('creator copy and skill links follow the product contract', async () => {
  const html = await read('public/harness-firmware/new/index.html');
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  for (const match of html.matchAll(/<h[123][^>]*>(.*?)<\/h[123]>/gs)) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(!text.endsWith('.'), `heading ends with a period: ${text}`);
  }
  assert.ok(!html.includes('&mdash;') && !html.includes('—'));
  assert.match(
    html,
    /<strong><a class="skill-ref" href="[^"]+\/\.claude\/skills\/init-project\/SKILL\.md">init-project<\/a><\/strong>/,
  );
  assert.match(html, /Repo memory system/);
  assert.match(html, /Windows \/ macOS setup/);
  assert.match(html, /<p>Local Launcher<\/p>/);
  assert.match(html, /Add your framework or first project files/);
  assert.match(html, /then run/);
  assert.doesNotMatch(html, /Prefer a local launcher/i);
});

test('creator exposes an accessible reversible skill selector', async () => {
  const [html, css, js, catalog, facts] = await Promise.all([
    read('public/harness-firmware/new/index.html'),
    read('public/harness-firmware/new/new-project.css'),
    read('public/harness-firmware/new/new-project.js'),
    import('../public/harness-firmware/new/skill-catalog.js'),
    read('public/harness-firmware/facts.json').then(JSON.parse),
  ]);

  assert.equal(catalog.HARNESS_SKILL_CATALOG.length, 23);
  assert.deepEqual(
    catalog.HARNESS_SKILL_CATALOG.map((skill) => skill.name).toSorted(),
    facts.skills.map((skill) => skill.name).toSorted(),
  );
  assert.deepEqual(
    catalog.HARNESS_SKILL_CATALOG.filter((skill) => skill.required).map((skill) => skill.name),
    ['init-project'],
  );
  assert.match(html, /<button[^>]+id="skill-trigger"[^>]+aria-controls="skill-picker"[^>]+aria-expanded="false"/);
  assert.match(html, /<dialog[^>]+id="skill-picker"[^>]+aria-labelledby="skill-picker-title"/);
  assert.match(html, /<output[^>]+id="skill-count"[^>]+aria-live="polite"/);
  assert.match(html, /id="skills-enable-all"/);
  assert.match(html, /id="skills-clear-optional"/);
  assert.match(html, /id="skills-done"/);
  assert.match(js, /HARNESS_SKILL_CATALOG/);
  assert.match(js, /showModal\(\)/);
  assert.match(js, /event\.key !== 'Escape'/);
  assert.match(js, /disabledSkills/);
  assert.match(css, /#skill-trigger:focus-visible/);
  assert.match(css, /\.skill-option:focus-within/);
  for (const match of css.matchAll(/border-radius\s*:\s*([^;]+)/g)) {
    assert.equal(match[1].trim(), '0');
  }
});

test('creator motion has static and reduced-motion meaning', async () => {
  const [html, css] = await Promise.all([
    read('public/harness-firmware/new/index.html'),
    read('public/harness-firmware/new/new-project.css'),
  ]);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.packet-a\s*\{\s*transform:/);
  assert.match(css, /\.install-line\s*\{\s*opacity:\s*1/);
  assert.equal((html.match(/class="input-shell"/g) ?? []).length, 2);
  assert.equal((html.match(/class="type-cue" aria-hidden="true">TYPE/g) ?? []).length, 2);
  assert.match(css, /@keyframes input-caret/);
  assert.match(css, /\.input-shell:focus-within input[\s\S]*?outline:\s*1px solid var\(--blue\)/);
  assert.match(css, /\.input-shell input:not\(:placeholder-shown\) \+ \.type-cue\s*\{\s*opacity:\s*0/);
  assert.ok(!css.includes('linear-gradient'));
  assert.ok(!css.includes('radial-gradient'));
  assert.ok(!css.includes('backdrop-filter'));
});

test('creator desktop grid flips the right column and fits the available viewport', async () => {
  const [html, css] = await Promise.all([
    read('public/harness-firmware/new/index.html'),
    read('public/harness-firmware/new/new-project.css'),
  ]);

  assert.match(css, /grid-template-areas:\s*"intro creator"\s*"intro machine"/);
  assert.match(css, /grid-template-rows:\s*minmax\(300px, \.82fr\)\s*minmax\(0, 1\.18fr\)/);
  assert.match(css, /height:\s*calc\(100vh - 164px\)/);
  assert.match(css, /\.creator-panel\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:/);
  assert.match(css, /#github-form\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?grid-template-areas:\s*"intro"\s*"machine"\s*"creator"/);
  assert.match(css, /\.skip:focus-visible/);
  assert.doesNotMatch(css, /\.skip:focus\s*\{/);
  assert.equal((html.match(/class="field"/g) ?? []).length, 2);
});

test('creator reserves one stable auth panel while status loads', async () => {
  const [html, css, js] = await Promise.all([
    read('public/harness-firmware/new/index.html'),
    read('public/harness-firmware/new/new-project.css'),
    read('public/harness-firmware/new/new-project.js'),
  ]);

  assert.match(html, /<section class="creator-panel is-loading"/);
  assert.match(html, /class="creator-state-stack"/);
  assert.match(html, /class="creator-skeleton"/);
  assert.match(css, /\.creator-state-stack\s*\{[^}]*min-height:/s);
  assert.match(css, /\.creator-panel\.is-loading\s+\.creator-state-stack/);
  assert.match(css, /\.creator-panel\.is-loading\s+\.creator-skeleton\s*\{\s*display:\s*grid/);
  assert.match(css, /font-display:\s*optional/, 'slow font loads never cause a late swap');
  assert.match(html, /rel="preload"[^>]+as="font"/, 'display font starts loading from the document head');
  assert.match(js, /creatorPanel\.classList\.remove\('is-loading'\)/);
});

test('GitHub routes verify installations and encrypted user sessions', async () => {
  const [createRoute, disconnectRoute, connectRoute, callbackRoute, selectRoute] = await Promise.all([
    read('src/app/api/harness/github/create/route.ts'),
    read('src/app/api/harness/github/disconnect/route.ts'),
    read('src/app/api/harness/github/connect/route.ts'),
    read('src/app/api/harness/github/callback/route.ts'),
    read('src/app/api/harness/github/select/route.ts'),
  ]);
  assert.match(createRoute, /sameOriginRequest\(request\)/);
  assert.match(disconnectRoute, /sameOriginRequest\(request\)/);
  assert.match(createRoute, /decryptHarnessPayload<HarnessSession>/);
  assert.match(createRoute, /currentUserCredentials\(session\)/);
  assert.match(createRoute, /normalizeDisabledSkills/);
  assert.match(createRoute, /applyRepositorySkillSelection/);
  assert.match(createRoute, /customizationWarning/);
  assert.doesNotMatch(createRoute, /\/access_tokens|createGithubAppJwt/);
  assert.match(createRoute, /\/generate/);
  assert.match(connectRoute, /httpOnly:\s*true/);
  assert.match(connectRoute, /sameSite:\s*'lax'/);
  assert.match(connectRoute, /login\/oauth\/authorize/);
  assert.match(connectRoute, /code_challenge_method', 'S256'/);
  assert.match(connectRoute, /prompt', 'select_account'/);
  assert.match(callbackRoute, /listHarnessInstallations\(credentials\.accessToken\)/);
  assert.match(callbackRoute, /suppliedInstallationId === null \? null/);
  assert.match(callbackRoute, /suppliedInstallationId !== null/);
  assert.match(callbackRoute, /installation\.installationId === installationId/);
  assert.match(callbackRoute, /encryptHarnessPayload<HarnessOauthBridge>/);
  assert.match(selectRoute, /sameOriginRequest\(request\)/);
  assert.match(selectRoute, /decryptHarnessPayload<HarnessInstallationCandidates>/);
  assert.match(selectRoute, /listHarnessInstallations\(candidates\.accessToken\)/);
  assert.match(createRoute, /HARNESS_SESSION_MAX_AGE_MS/);
  assert.match(callbackRoute + selectRoute + createRoute, /HARNESS_COOKIE_PATH/);
  assert.doesNotMatch(callbackRoute + selectRoute + createRoute, /path:\s*['"]\/['"]/);
});
