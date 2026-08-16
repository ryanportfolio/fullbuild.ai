import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { HARNESS_SKILL_CATALOG } from '../../public/harness-firmware/new/skill-catalog.js';

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

const HARNESS_SKILL_NAMES = new Set(HARNESS_SKILL_CATALOG.map((skill) => skill.name));
const REQUIRED_HARNESS_SKILLS = new Set(
  HARNESS_SKILL_CATALOG
    .filter((skill) => 'required' in skill && skill.required === true)
    .map((skill) => skill.name),
);

export function normalizeDisabledSkills(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const supplied = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== 'string'
      || !HARNESS_SKILL_NAMES.has(item)
      || REQUIRED_HARNESS_SKILLS.has(item)
      || supplied.has(item)
    ) {
      return null;
    }
    supplied.add(item);
  }
  return HARNESS_SKILL_CATALOG
    .filter((skill) => supplied.has(skill.name))
    .map((skill) => skill.name);
}

export function mergeSkillOverrides(settingsText: string, disabledSkills: string[]): string {
  const parsed = JSON.parse(settingsText) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Harness settings must contain a JSON object');
  }

  const settings = { ...parsed } as Record<string, unknown>;
  const current = settings.skillOverrides;
  const overrides = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...current } as Record<string, unknown>
    : {};
  const disabled = new Set(disabledSkills);

  for (const skill of HARNESS_SKILL_CATALOG) {
    if (disabled.has(skill.name)) overrides[skill.name] = 'off';
    else if (overrides[skill.name] === 'off') delete overrides[skill.name];
  }

  if (Object.keys(overrides).length > 0) settings.skillOverrides = overrides;
  else delete settings.skillOverrides;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

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
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

type RepositorySettingsFile = {
  content?: string;
  encoding?: string;
  sha?: string;
};

type GitObjectSha = { sha?: string };
type GitReference = { object?: GitObjectSha };
type GitCommit = { sha?: string; tree?: GitObjectSha };

export async function applyRepositorySkillSelection({
  owner,
  repository,
  branch,
  disabledSkills,
  token,
}: {
  owner: string;
  repository: string;
  branch: string;
  disabledSkills: string[];
  token: string;
}): Promise<void> {
  const selectedSkills = normalizeDisabledSkills(disabledSkills);
  if (!selectedSkills) throw new Error('Harness skill selection is invalid');
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const settingsPath = `${repositoryPath}/contents/.claude/settings.json`;
  let file: RepositorySettingsFile | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      file = await githubApi<RepositorySettingsFile>(
        `${settingsPath}?ref=${encodeURIComponent(branch)}`,
        {},
        token,
      );
      break;
    } catch (error) {
      if (!(error instanceof GithubApiError) || error.status !== 404 || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt)));
    }
  }

  if (!file?.content || file.encoding !== 'base64' || !file.sha) {
    throw new Error('Harness settings were not available in the generated repository');
  }

  const currentSettings = Buffer.from(file.content.replaceAll(/\s/g, ''), 'base64').toString('utf8');
  const updatedSettings = mergeSkillOverrides(currentSettings, selectedSkills);
  const settingsBlob = await githubApi<GitObjectSha>(
    `${repositoryPath}/git/blobs`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(updatedSettings, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    },
    token,
  );
  if (!settingsBlob.sha) throw new Error('GitHub did not create the Harness settings blob');

  const encodedBranch = encodeURIComponent(branch);
  const reference = await githubApi<GitReference>(
    `${repositoryPath}/git/ref/heads/${encodedBranch}`,
    {},
    token,
  );
  const headCommitSha = reference.object?.sha;
  if (!headCommitSha) throw new Error('GitHub did not return the generated repository head');

  const headCommit = await githubApi<GitCommit>(
    `${repositoryPath}/git/commits/${encodeURIComponent(headCommitSha)}`,
    {},
    token,
  );
  if (!headCommit.tree?.sha) throw new Error('GitHub did not return the generated repository tree');

  const tree = await githubApi<GitObjectSha>(
    `${repositoryPath}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: headCommit.tree.sha,
        tree: [
          {
            path: '.claude/settings.json',
            mode: '100644',
            type: 'blob',
            sha: settingsBlob.sha,
          },
          ...selectedSkills.map((skill) => ({
            path: `.agents/skills/${skill}/SKILL.md`,
            mode: '100644',
            type: 'blob',
            sha: null,
          })),
        ],
      }),
    },
    token,
  );
  if (!tree.sha) throw new Error('GitHub did not create the customized repository tree');

  const commit = await githubApi<GitCommit>(
    `${repositoryPath}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'Configure Harness skills',
        tree: tree.sha,
        parents: [headCommitSha],
      }),
    },
    token,
  );
  if (!commit.sha) throw new Error('GitHub did not create the Harness configuration commit');

  await githubApi(
    `${repositoryPath}/git/refs/heads/${encodedBranch}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
    token,
  );
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
