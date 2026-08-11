import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPkceChallenge,
  createPkceVerifier,
  decryptHarnessPayload,
  encryptHarnessPayload,
  githubAppConfigured,
  isValidRepositoryName,
  listHarnessInstallations,
  requestGithubUserCredentials,
  sameOriginRequest,
  signHarnessPayload,
  verifyHarnessPayload,
} from '../src/lib/harness-github.ts';

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
