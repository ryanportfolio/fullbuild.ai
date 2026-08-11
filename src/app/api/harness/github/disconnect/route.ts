import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  HARNESS_CANDIDATES_COOKIE,
  HARNESS_COOKIE_PATH,
  HARNESS_OAUTH_COOKIE,
  HARNESS_SESSION_COOKIE,
  HARNESS_STATE_COOKIE,
  sameOriginRequest,
} from '@/lib/harness-github';

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.set(HARNESS_SESSION_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  cookieStore.set(HARNESS_STATE_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  cookieStore.set(HARNESS_OAUTH_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  cookieStore.set(HARNESS_CANDIDATES_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
