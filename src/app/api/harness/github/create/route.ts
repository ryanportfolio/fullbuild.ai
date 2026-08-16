import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  applyRepositorySkillSelection,
  decryptHarnessPayload,
  encryptHarnessPayload,
  githubApi,
  GithubApiError,
  githubAppConfigured,
  HARNESS_SESSION_COOKIE,
  HARNESS_COOKIE_PATH,
  HARNESS_SESSION_MAX_AGE_MS,
  HARNESS_TEMPLATE_OWNER,
  HARNESS_TEMPLATE_REPO,
  isValidRepositoryName,
  normalizeDisabledSkills,
  requestGithubUserCredentials,
  sameOriginRequest,
  type HarnessSession,
  type HarnessUserCredentials,
} from '@/lib/harness-github';

export const runtime = 'nodejs';

type GeneratedRepository = {
  html_url: string;
  full_name: string;
  private: boolean;
  default_branch?: string;
};
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

async function currentUserCredentials(session: HarnessSession): Promise<HarnessUserCredentials> {
  const now = Date.now();
  if (session.accessTokenExpiresAt === null || session.accessTokenExpiresAt > now + TOKEN_REFRESH_SKEW_MS) {
    return session;
  }
  if (
    !session.refreshToken
    || (session.refreshTokenExpiresAt !== null && session.refreshTokenExpiresAt <= now)
  ) {
    throw new GithubApiError('GitHub authorization expired', 401);
  }
  return requestGithubUserCredentials({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!githubAppConfigured()) {
    return NextResponse.json({ error: 'Hosted creator is not configured' }, { status: 503 });
  }
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const encrypted = cookieStore.get(HARNESS_SESSION_COOKIE)?.value || '';
  const secret = process.env.HARNESS_SESSION_SECRET!;
  const session = decryptHarnessPayload<HarnessSession>(encrypted, secret);
  if (!session || Date.now() - session.issuedAt > HARNESS_SESSION_MAX_AGE_MS) {
    cookieStore.set(HARNESS_SESSION_COOKIE, '', { path: HARNESS_COOKIE_PATH, maxAge: 0 });
    return NextResponse.json({ error: 'Connect GitHub first' }, { status: 401 });
  }

  let body: { name?: unknown; description?: unknown; private?: unknown; disabledSkills?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!isValidRepositoryName(name)) {
    return NextResponse.json({ error: 'Use letters, digits, dot, dash, or underscore' }, { status: 422 });
  }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 350) : '';
  const makePrivate = body.private !== false;
  const disabledSkills = body.disabledSkills === undefined ? [] : normalizeDisabledSkills(body.disabledSkills);
  if (!disabledSkills) {
    return NextResponse.json({ error: 'Choose skills from the available list' }, { status: 422 });
  }

  try {
    const credentials = await currentUserCredentials(session);
    if (credentials.accessToken !== session.accessToken) {
      const refreshedSession: HarnessSession = { ...session, ...credentials };
      cookieStore.set(HARNESS_SESSION_COOKIE, encryptHarnessPayload(refreshedSession, secret), {
        httpOnly: true,
        secure: new URL(request.url).protocol === 'https:',
        sameSite: 'lax',
        path: HARNESS_COOKIE_PATH,
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    const repository = await githubApi<GeneratedRepository>(
      `/repos/${HARNESS_TEMPLATE_OWNER}/${HARNESS_TEMPLATE_REPO}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          owner: session.owner,
          name,
          description,
          private: makePrivate,
          include_all_branches: false,
        }),
      },
      credentials.accessToken,
    );
    let customized = true;
    let customizationWarning: string | null = null;
    if (disabledSkills.length > 0) {
      try {
        await applyRepositorySkillSelection({
          owner: session.owner,
          repository: name,
          branch: repository.default_branch || 'main',
          disabledSkills,
          token: credentials.accessToken,
        });
      } catch (error) {
        customized = false;
        customizationWarning = 'Repository created, but skill choices could not be applied. All skills remain enabled.';
        console.error('Harness skill customization failed after repository creation', {
          repository: repository.full_name,
          status: error instanceof GithubApiError ? error.status : null,
          message: error instanceof Error ? error.message : 'Unknown customization error',
        });
      }
    }
    return NextResponse.json({
      repositoryUrl: repository.html_url,
      fullName: repository.full_name,
      private: repository.private,
      customized,
      disabledSkillCount: customized ? disabledSkills.length : 0,
      customizationWarning,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 401) {
      return NextResponse.json({ error: 'Reconnect GitHub to create a repository' }, { status: 401 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'GitHub could not create the repository',
    }, { status: 502 });
  }
}
