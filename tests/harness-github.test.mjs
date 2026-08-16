import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyRepositorySkillSelection,
  createPkceChallenge,
  createPkceVerifier,
  decryptHarnessPayload,
  encryptHarnessPayload,
  githubAppConfigured,
  isValidRepositoryName,
  listHarnessInstallations,
  mergeSkillOverrides,
  normalizeDisabledSkills,
  requestGithubUserCredentials,
  sameOriginRequest,
  signHarnessPayload,
  verifyHarnessPayload,
} from '../src/lib/harness-github.ts';

test('skill selection accepts only unique optional catalog entries', () => {
  assert.deepEqual(normalizeDisabledSkills(['lab', 'merge']), ['merge', 'lab']);
  assert.deepEqual(normalizeDisabledSkills([]), []);
  assert.equal(normalizeDisabledSkills(['init-project']), null);
  assert.equal(normalizeDisabledSkills(['lab', 'lab']), null);
  assert.equal(normalizeDisabledSkills(['unknown-skill']), null);
  assert.equal(normalizeDisabledSkills('lab'), null);
});

test('skill overrides merge without disturbing repository settings', () => {
  const settings = JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'safe-command' }] }] },
    permissions: { allow: ['Bash(git status)'] },
    skillOverrides: {
      humanizer: 'off',
      merge: 'on',
      'team-local-skill': 'off',
    },
  });

  const merged = JSON.parse(mergeSkillOverrides(settings, ['merge', 'lab']));
  assert.deepEqual(merged.hooks, {
    SessionStart: [{ hooks: [{ type: 'command', command: 'safe-command' }] }],
  });
  assert.deepEqual(merged.permissions, { allow: ['Bash(git status)'] });
  assert.deepEqual(merged.skillOverrides, {
    merge: 'off',
    'team-local-skill': 'off',
    lab: 'off',
  });
  assert.ok(mergeSkillOverrides(settings, ['merge', 'lab']).endsWith('\n'));
});

test('repository skill selection atomically updates settings and Codex adapters', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  const initialSettings = JSON.stringify({ permissions: { allow: ['Bash(git status)'] } });

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const requestUrl = String(url);
    if (requestUrl.includes('/contents/.claude/settings.json')) {
      return Response.json({
        content: Buffer.from(initialSettings).toString('base64'),
        encoding: 'base64',
        sha: 'settings-blob-sha',
      });
    }
    if (requestUrl.endsWith('/git/blobs')) return Response.json({ sha: 'new-settings-blob-sha' });
    if (requestUrl.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'head-commit-sha' } });
    if (requestUrl.endsWith('/git/commits/head-commit-sha')) {
      return Response.json({ tree: { sha: 'base-tree-sha' } });
    }
    if (requestUrl.endsWith('/git/trees')) return Response.json({ sha: 'new-tree-sha' });
    if (requestUrl.endsWith('/git/commits')) return Response.json({ sha: 'new-commit-sha' });
    if (requestUrl.endsWith('/git/refs/heads/main')) return Response.json({ object: { sha: 'new-commit-sha' } });
    return Response.json({ message: 'unexpected request' }, { status: 500 });
  };

  await applyRepositorySkillSelection({
    owner: 'octocat',
    repository: 'new-project',
    branch: 'main',
    disabledSkills: ['lab', 'merge'],
    token: 'ghu_user',
  });

  assert.equal(requests.length, 7);
  assert.match(requests[0].url, /\/repos\/octocat\/new-project\/contents\/\.claude\/settings\.json\?ref=main$/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ghu_user');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  const blob = JSON.parse(requests[1].options.body);
  const writtenSettings = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
  assert.deepEqual(writtenSettings.permissions, { allow: ['Bash(git status)'] });
  assert.deepEqual(writtenSettings.skillOverrides, { merge: 'off', lab: 'off' });
  const tree = JSON.parse(requests[4].options.body);
  assert.equal(tree.base_tree, 'base-tree-sha');
  assert.deepEqual(tree.tree, [
    { path: '.claude/settings.json', mode: '100644', type: 'blob', sha: 'new-settings-blob-sha' },
    { path: '.agents/skills/merge/SKILL.md', mode: '100644', type: 'blob', sha: null },
    { path: '.agents/skills/lab/SKILL.md', mode: '100644', type: 'blob', sha: null },
  ]);
  const commit = JSON.parse(requests[5].options.body);
  assert.deepEqual(commit, {
    message: 'Configure Harness skills',
    tree: 'new-tree-sha',
    parents: ['head-commit-sha'],
  });
  const refUpdate = JSON.parse(requests[6].options.body);
  assert.deepEqual(refUpdate, { sha: 'new-commit-sha', force: false });
});

test('repository skill selection waits for asynchronous template contents', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const delays = [];
  let settingsReads = 0;
  const initialSettings = JSON.stringify({ permissions: { allow: [] } });

  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/contents/.claude/settings.json')) {
      settingsReads += 1;
      if (settingsReads <= 5) {
        return Response.json({ message: 'This repository is empty.' }, { status: 404 });
      }
      return Response.json({
        content: Buffer.from(initialSettings).toString('base64'),
        encoding: 'base64',
        sha: 'settings-blob-sha',
      });
    }
    if (requestUrl.endsWith('/git/blobs')) return Response.json({ sha: 'new-settings-blob-sha' });
    if (requestUrl.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'head-commit-sha' } });
    if (requestUrl.endsWith('/git/commits/head-commit-sha')) {
      return Response.json({ tree: { sha: 'base-tree-sha' } });
    }
    if (requestUrl.endsWith('/git/trees')) return Response.json({ sha: 'new-tree-sha' });
    if (requestUrl.endsWith('/git/commits')) return Response.json({ sha: 'new-commit-sha' });
    if (requestUrl.endsWith('/git/refs/heads/main')) return Response.json({ object: { sha: 'new-commit-sha' } });
    return Response.json({ message: 'unexpected request' }, { status: 500 });
  };

  await applyRepositorySkillSelection({
    owner: 'octocat',
    repository: 'new-project',
    branch: 'main',
    disabledSkills: ['lab'],
    token: 'ghu_user',
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.equal(settingsReads, 6);
  assert.deepEqual(delays, [250, 500, 1000, 1500, 2000]);
});

test('repository skill selection preserves the final readiness error', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const delays = [];
  let settingsReads = 0;

  globalThis.fetch = async () => {
    settingsReads += 1;
    return Response.json({ message: 'This repository is empty.' }, { status: 404 });
  };

  await assert.rejects(
    applyRepositorySkillSelection({
      owner: 'octocat',
      repository: 'new-project',
      branch: 'main',
      disabledSkills: ['lab'],
      token: 'ghu_user',
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    }),
    (error) => error?.status === 404 && error.message === 'This repository is empty.',
  );

  assert.equal(settingsReads, 11);
  assert.deepEqual(delays, [250, 500, 1000, 1500, 2000, 2500, 3000, 3000, 3000, 3000]);
});

test('GitHub App mode requires every server secret', () => {
  assert.equal(githubAppConfigured({}), false);
  assert.equal(githubAppConfigured({
    GITHUB_APP_ID: '1',
    GITHUB_APP_SLUG: 'harness',
    HARNESS_SESSION_SECRET: 'secret',
  }), false);
  assert.equal(githubAppConfigured({
    GITHUB_APP_ID: '1',
    GITHUB_APP_SLUG: 'harness',
    GITHUB_APP_CLIENT_ID: 'client-id',
    GITHUB_APP_CLIENT_SECRET: 'client-secret',
    HARNESS_SESSION_SECRET: 'secret',
  }), true);
});

test('signed OAuth state payloads reject tampering', () => {
  const signed = signHarnessPayload({ owner: 'octocat', installationId: 42 }, 'secret');
  assert.deepEqual(verifyHarnessPayload(signed, 'secret'), { owner: 'octocat', installationId: 42 });
  assert.equal(verifyHarnessPayload(`${signed}x`, 'secret'), null);
  assert.equal(verifyHarnessPayload(signed, 'wrong-secret'), null);
});

test('encrypted OAuth bridge payloads reject disclosure and tampering', () => {
  const payload = { accessToken: 'github-user-token', issuedAt: 123 };
  const encrypted = encryptHarnessPayload(payload, 'secret');
  assert.ok(!encrypted.includes(payload.accessToken));
  assert.deepEqual(decryptHarnessPayload(encrypted, 'secret'), payload);
  assert.equal(decryptHarnessPayload(`${encrypted}x`, 'secret'), null);
  assert.equal(decryptHarnessPayload(encrypted, 'wrong-secret'), null);
});

test('repository names reject paths and all-dot values', () => {
  assert.equal(isValidRepositoryName('good-project_2.0'), true);
  assert.equal(isValidRepositoryName('../escape'), false);
  assert.equal(isValidRepositoryName('...'), false);
  assert.equal(isValidRepositoryName('has spaces'), false);
});

test('PKCE verifier is secret-bound and produces an S256 challenge', () => {
  const verifier = createPkceVerifier('nonce', 'secret');
  assert.equal(verifier.length, 43);
  assert.notEqual(verifier, createPkceVerifier('nonce', 'other-secret'));
  assert.equal(createPkceChallenge(verifier).length, 43);
});

test('OAuth exchange preserves expiring user credentials and installation filtering', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.GITHUB_APP_CLIENT_ID;
  const originalClientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const originalAppId = process.env.GITHUB_APP_ID;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.GITHUB_APP_CLIENT_ID;
    else process.env.GITHUB_APP_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.GITHUB_APP_CLIENT_SECRET;
    else process.env.GITHUB_APP_CLIENT_SECRET = originalClientSecret;
    if (originalAppId === undefined) delete process.env.GITHUB_APP_ID;
    else process.env.GITHUB_APP_ID = originalAppId;
  });
  process.env.GITHUB_APP_CLIENT_ID = 'client';
  process.env.GITHUB_APP_CLIENT_SECRET = 'secret';
  process.env.GITHUB_APP_ID = '42';

  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/login/oauth/access_token')) {
      return Response.json({
        access_token: 'ghu_user',
        expires_in: 28800,
        refresh_token: 'ghr_refresh',
        refresh_token_expires_in: 15897600,
      });
    }
    return Response.json({
      installations: [
        { id: 7, app_id: 42, account: { login: 'allowed' } },
        { id: 8, app_id: 99, account: { login: 'other-app' } },
      ],
    });
  };

  const now = Date.UTC(2026, 7, 11, 12, 0, 0);
  const credentials = await requestGithubUserCredentials({ code: 'oauth-code' }, now);
  assert.deepEqual(credentials, {
    accessToken: 'ghu_user',
    accessTokenExpiresAt: now + 28800 * 1000,
    refreshToken: 'ghr_refresh',
    refreshTokenExpiresAt: now + 15897600 * 1000,
  });
  assert.match(String(requests[0].options.body), /client_secret=secret/);
  assert.deepEqual(await listHarnessInstallations(credentials.accessToken), [
    { installationId: 7, owner: 'allowed' },
  ]);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer ghu_user');
});

test('failed token refresh reports authorization expiry', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ error: 'bad_refresh_token' });
  await assert.rejects(
    requestGithubUserCredentials({ grant_type: 'refresh_token', refresh_token: 'expired' }),
    (error) => error?.status === 401 && /bad_refresh_token/.test(error.message),
  );
});

test('write requests require an exact same origin', () => {
  const request = new Request('https://fullbuild.ai/api/harness/github/create', {
    method: 'POST',
    headers: { Origin: 'https://fullbuild.ai' },
  });
  assert.equal(sameOriginRequest(request), true);
  const crossOrigin = new Request(request.url, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(sameOriginRequest(crossOrigin), false);
});
