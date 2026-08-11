import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  decryptHarnessPayload,
  encryptHarnessPayload,
  githubAppConfigured,
  HARNESS_CANDIDATES_COOKIE,
  HARNESS_COOKIE_PATH,
  HARNESS_SESSION_COOKIE,
  listHarnessInstallations,
  sameOriginRequest,
  type HarnessInstallationCandidates,
  type HarnessInstallationCandidate,
  type HarnessSession,
} from '@/lib/harness-github';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  if (!githubAppConfigured()) {
    return NextResponse.json({ error: 'Hosted creator is not configured' }, { status: 503 });
  }
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  let body: { installationId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const installationId = Number(body.installationId);
  const secret = process.env.HARNESS_SESSION_SECRET!;
  const cookieStore = await cookies();
  const signedCandidates = cookieStore.get(HARNESS_CANDIDATES_COOKIE)?.value || '';
  const candidates = decryptHarnessPayload<HarnessInstallationCandidates>(signedCandidates, secret);
  if (!candidates || Date.now() - candidates.issuedAt > 10 * 60 * 1000) {
    cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    return NextResponse.json({ error: 'GitHub account selection expired' }, { status: 401 });
  }

  let installations: HarnessInstallationCandidate[];
  try {
    installations = await listHarnessInstallations(candidates.accessToken);
  } catch {
    cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    return NextResponse.json({ error: 'Reconnect GitHub to choose an account' }, { status: 401 });
  }
  const selected = installations.find(
    (candidate) => candidate.installationId === installationId,
  );
  if (!selected) {
    return NextResponse.json({ error: 'Choose an available GitHub account' }, { status: 422 });
  }

  const session: HarnessSession = {
    installationId: selected.installationId,
    owner: selected.owner,
    accessToken: candidates.accessToken,
    accessTokenExpiresAt: candidates.accessTokenExpiresAt,
    refreshToken: candidates.refreshToken,
    refreshTokenExpiresAt: candidates.refreshTokenExpiresAt,
    issuedAt: Date.now(),
  };
  cookieStore.set(HARNESS_SESSION_COOKIE, encryptHarnessPayload(session, secret), {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: HARNESS_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60,
  });
  cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  return NextResponse.json({ owner: selected.owner });
}
