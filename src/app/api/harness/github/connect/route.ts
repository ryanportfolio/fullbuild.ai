import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createPkceChallenge,
  createPkceVerifier,
  githubAppConfigured,
  HARNESS_COOKIE_PATH,
  HARNESS_STATE_COOKIE,
  HARNESS_TEMPLATE_GENERATE_URL,
  signHarnessPayload,
  type HarnessInstallState,
} from '@/lib/harness-github';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  if (!githubAppConfigured()) return NextResponse.redirect(HARNESS_TEMPLATE_GENERATE_URL);

  const secret = process.env.HARNESS_SESSION_SECRET!;
  const state: HarnessInstallState = {
    nonce: randomBytes(24).toString('hex'),
    issuedAt: Date.now(),
  };
  const signedState = signHarnessPayload(state, secret);
  const cookieStore = await cookies();
  cookieStore.set(HARNESS_STATE_COOKIE, signedState, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: HARNESS_COOKIE_PATH,
    maxAge: 10 * 60,
  });

  const callbackUrl = new URL('/api/harness/github/callback', request.url);
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', process.env.GITHUB_APP_CLIENT_ID!);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl.toString());
  authorizeUrl.searchParams.set('state', signedState);
  authorizeUrl.searchParams.set('code_challenge', createPkceChallenge(createPkceVerifier(state.nonce, secret)));
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('prompt', 'select_account');
  return NextResponse.redirect(authorizeUrl);
}
