import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  decryptHarnessPayload,
  githubAppConfigured,
  HARNESS_CANDIDATES_COOKIE,
  HARNESS_COOKIE_PATH,
  HARNESS_SESSION_COOKIE,
  HARNESS_SESSION_MAX_AGE_MS,
  HARNESS_TEMPLATE_GENERATE_URL,
  listHarnessInstallations,
  type HarnessInstallationCandidates,
  type HarnessInstallationCandidate,
  type HarnessSession,
} from '@/lib/harness-github';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const available = githubAppConfigured();
  const secret = process.env.HARNESS_SESSION_SECRET;
  const cookieStore = await cookies();
  const value = cookieStore.get(HARNESS_SESSION_COOKIE)?.value;
  const verifiedSession = available && secret && value
    ? decryptHarnessPayload<HarnessSession>(value, secret)
    : null;
  const session = verifiedSession && Date.now() - verifiedSession.issuedAt <= HARNESS_SESSION_MAX_AGE_MS
    ? verifiedSession
    : null;
  const candidateValue = cookieStore.get(HARNESS_CANDIDATES_COOKIE)?.value;
  const candidates = available && secret && candidateValue
    ? decryptHarnessPayload<HarnessInstallationCandidates>(candidateValue, secret)
    : null;
  let accounts: HarnessInstallationCandidate[] = [];
  if (candidates && Date.now() - candidates.issuedAt <= 10 * 60 * 1000) {
    try {
      accounts = await listHarnessInstallations(candidates.accessToken);
    } catch {
      cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    }
  } else if (candidateValue) {
    cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  }
  if (verifiedSession && !session) {
    cookieStore.set(HARNESS_SESSION_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  }

  return NextResponse.json({
    available,
    connected: Boolean(session),
    owner: session?.owner || null,
    accounts,
    fallbackUrl: HARNESS_TEMPLATE_GENERATE_URL,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
