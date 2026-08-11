import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createPkceVerifier,
  decryptHarnessPayload,
  encryptHarnessPayload,
  githubAppConfigured,
  HARNESS_CANDIDATES_COOKIE,
  HARNESS_COOKIE_PATH,
  HARNESS_OAUTH_COOKIE,
  HARNESS_SESSION_COOKIE,
  HARNESS_STATE_COOKIE,
  HARNESS_TEMPLATE_GENERATE_URL,
  listHarnessInstallations,
  requestGithubUserCredentials,
  type HarnessInstallState,
  type HarnessInstallationCandidates,
  type HarnessOauthBridge,
  type HarnessSession,
  type HarnessUserCredentials,
  verifyHarnessPayload,
} from '@/lib/harness-github';

export const runtime = 'nodejs';

const BRIDGE_MAX_AGE_MS = 10 * 60 * 1000;

function creatorUrl(request: Request, query = ''): URL {
  return new URL(`/harness-firmware/new/${query}`, request.url);
}

function callbackUrl(request: Request): string {
  return new URL('/api/harness/github/callback', request.url).toString();
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!githubAppConfigured()) return NextResponse.redirect(HARNESS_TEMPLATE_GENERATE_URL);

  const url = new URL(request.url);
  const suppliedState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const setupAction = url.searchParams.get('setup_action');
  const suppliedInstallationId = url.searchParams.get('installation_id');
  const installationId = suppliedInstallationId === null ? null : Number(suppliedInstallationId);
  const hasInstallationId = installationId !== null && Number.isSafeInteger(installationId);
  const secret = process.env.HARNESS_SESSION_SECRET!;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(HARNESS_STATE_COOKIE)?.value || '';
  const state = suppliedState && suppliedState === expectedState
    ? verifyHarnessPayload<HarnessInstallState>(suppliedState, secret)
    : null;

  if (!state || Date.now() - state.issuedAt > BRIDGE_MAX_AGE_MS) {
    cookieStore.set(HARNESS_STATE_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    cookieStore.set(HARNESS_OAUTH_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    if (setupAction === 'update') {
      return NextResponse.redirect(creatorUrl(request, '?github-app=updated'));
    }
    return NextResponse.redirect(creatorUrl(request, '?error=github-connection'));
  }

  try {
    let credentials: HarnessUserCredentials;
    if (code) {
      credentials = await requestGithubUserCredentials({
        code,
        redirect_uri: callbackUrl(request),
        code_verifier: createPkceVerifier(state.nonce, secret),
      });
    } else {
      const encryptedBridge = cookieStore.get(HARNESS_OAUTH_COOKIE)?.value || '';
      const bridge = decryptHarnessPayload<HarnessOauthBridge>(encryptedBridge, secret);
      if (!bridge || Date.now() - bridge.issuedAt > BRIDGE_MAX_AGE_MS) {
        throw new Error('GitHub authorization expired');
      }
      credentials = bridge;
    }

    const installations = await listHarnessInstallations(credentials.accessToken);
    const selected = hasInstallationId
      ? installations.find((installation) => installation.installationId === installationId)
      : undefined;

    if (!installations.length) {
      cookieStore.set(
        HARNESS_OAUTH_COOKIE,
        encryptHarnessPayload<HarnessOauthBridge>({ ...credentials, issuedAt: Date.now() }, secret),
        {
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'lax',
          path: HARNESS_COOKIE_PATH,
          maxAge: 10 * 60,
        },
      );
      const installUrl = new URL(`https://github.com/apps/${process.env.GITHUB_APP_SLUG!}/installations/new`);
      installUrl.searchParams.set('state', suppliedState);
      return NextResponse.redirect(installUrl);
    }

    if (suppliedInstallationId !== null && (!hasInstallationId || !selected)) {
      throw new Error('GitHub installation is not available to this user');
    }

    const target = selected || (installations.length === 1 ? installations[0] : undefined);
    cookieStore.set(HARNESS_STATE_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    cookieStore.set(HARNESS_OAUTH_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });

    if (!target) {
      const candidates: HarnessInstallationCandidates = {
        ...credentials,
        issuedAt: Date.now(),
      };
      cookieStore.set(HARNESS_CANDIDATES_COOKIE, encryptHarnessPayload(candidates, secret), {
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'lax',
        path: HARNESS_COOKIE_PATH,
        maxAge: 10 * 60,
      });
      return NextResponse.redirect(creatorUrl(request, '?choose=github-account'));
    }

    const session: HarnessSession = {
      installationId: target.installationId,
      owner: target.owner,
      ...credentials,
      issuedAt: Date.now(),
    };
    cookieStore.set(HARNESS_SESSION_COOKIE, encryptHarnessPayload(session, secret), {
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'lax',
      path: HARNESS_COOKIE_PATH,
      maxAge: 30 * 24 * 60 * 60,
    });
    cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    return NextResponse.redirect(creatorUrl(request, '?connected=1'));
  } catch {
    cookieStore.set(HARNESS_STATE_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    cookieStore.set(HARNESS_OAUTH_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    return NextResponse.redirect(creatorUrl(request, '?error=github-connection'));
  }
}
