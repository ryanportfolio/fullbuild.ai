import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const HARNESS_TEMPLATE_OWNER = 'ryanportfolio';
export const HARNESS_TEMPLATE_REPO = 'Harness-Firmware';
export const HARNESS_TEMPLATE_GENERATE_URL = `https://github.com/${HARNESS_TEMPLATE_OWNER}/${HARNESS_TEMPLATE_REPO}/generate`;
export const HARNESS_SESSION_COOKIE = 'harness_github_session';
export const HARNESS_STATE_COOKIE = 'harness_github_state';
export const HARNESS_OAUTH_COOKIE = 'harness_github_oauth';
export const HARNESS_CANDIDATES_COOKIE = 'harness_github_candidates';
export const HARNESS_COOKIE_PATH = '/api/harness/github';
export const HARNESS_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type HarnessSession = {
  installationId: number;
  owner: string;
  issuedAt: number;
} & HarnessUserCredentials;

export type HarnessInstallState = {
  nonce: string;
  issuedAt: number;
};

export type HarnessInstallationCandidate = {
  installationId: number;
  owner: string;
};

export type HarnessInstallationCandidates = {
  issuedAt: number;
} & HarnessUserCredentials;

export type HarnessUserCredentials = {
  accessToken: string;
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
};

export type HarnessOauthBridge = HarnessUserCredentials & {
  issuedAt: number;
};

export function githubAppConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    environment.GITHUB_APP_ID
      && environment.GITHUB_APP_SLUG
      && environment.GITHUB_APP_CLIENT_ID
      && environment.GITHUB_APP_CLIENT_SECRET
      && environment.HARNESS_SESSION_SECRET,
  );
}

export function isValidRepositoryName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 100
    && /^[A-Za-z0-9._-]+$/.test(value)
    && !/^\.+$/.test(value);
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function signHarnessPayload<T extends object>(payload: T, secret: string): string {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyHarnessPayload<T extends object>(value: string, secret: string): T | null {
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function harnessEncryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptHarnessPayload<T extends object>(payload: T, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', harnessEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptHarnessPayload<T extends object>(value: string, secret: string): T | null {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      harnessEncryptionKey(secret),
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function createPkceVerifier(nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(`harness-pkce:${nonce}`).digest('base64url');
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

type GithubOauthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function requestGithubUserCredentials(
  parameters: Record<string, string>,
  now = Date.now(),
): Promise<HarnessUserCredentials> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_APP_CLIENT_ID!,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET!,
      ...parameters,
    }),
    cache: 'no-store',
  });
  const result = await response.json() as GithubOauthTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new GithubApiError(
      result.error_description || result.error || 'GitHub authorization failed',
      response.ok ? 401 : response.status,
    );
  }
  return {
    accessToken: result.access_token,
    accessTokenExpiresAt: Number.isFinite(result.expires_in)
      ? now + Number(result.expires_in) * 1000
      : null,
    refreshToken: result.refresh_token || null,
    refreshTokenExpiresAt: Number.isFinite(result.refresh_token_expires_in)
      ? now + Number(result.refresh_token_expires_in) * 1000
      : null,
  };
}

export class GithubApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
  }
}

export async function githubApi<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fullbuild-harness-creator',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string };
    throw new GithubApiError(detail.message || `GitHub request failed with ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

type UserInstallationsResponse = {
  installations?: Array<{
    id?: number;
    app_id?: number;
    account?: { login?: string };
  }>;
};

export async function listHarnessInstallations(
  accessToken: string,
): Promise<HarnessInstallationCandidate[]> {
  const appId = Number(process.env.GITHUB_APP_ID);
  const allInstallations: NonNullable<UserInstallationsResponse['installations']> = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await githubApi<UserInstallationsResponse>(
      `/user/installations?per_page=100&page=${page}`,
      {},
      accessToken,
    );
    const pageInstallations = result.installations || [];
    allInstallations.push(...pageInstallations);
    if (pageInstallations.length < 100) break;
  }
  return allInstallations.flatMap((installation) => {
    const installationId = Number(installation.id);
    const owner = installation.account?.login;
    if (installation.app_id !== appId || !Number.isSafeInteger(installationId) || !owner) return [];
    return [{ installationId, owner }];
  });
}

export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
