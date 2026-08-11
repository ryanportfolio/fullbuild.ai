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
});

test('creator motion has static and reduced-motion meaning', async () => {
  const css = await read('public/harness-firmware/new/new-project.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.packet-a\s*\{\s*transform:/);
  assert.match(css, /\.install-line\s*\{\s*opacity:\s*1/);
  assert.ok(!css.includes('linear-gradient'));
  assert.ok(!css.includes('radial-gradient'));
  assert.ok(!css.includes('backdrop-filter'));
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
