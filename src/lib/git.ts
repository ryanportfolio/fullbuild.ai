import { execSync } from 'node:child_process';

/**
 * The title-block REV field is a TRUE readout of the repository, not a
 * decorative number — the sheet revision IS the repo revision. Read once at
 * build/server time. Falls back gracefully when git is unavailable (e.g. a
 * detached deploy tarball) so the build never breaks on it.
 */
function readGit(): { sha: string; rev: string } {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const count = execSync('git rev-list --count HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return { sha, rev: count };
  } catch {
    // Vercel exposes the SHA via env when git isn't present in the runtime.
    const envSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    return { sha: envSha ?? '0000000', rev: '—' };
  }
}

export const GIT = readGit();
