import { execSync } from 'node:child_process';

/**
 * The title-block REV field and the appendix revision ledger are TRUE readouts
 * of the repository, not decorative numbers — the sheet revision IS the repo
 * revision. Read once at build/server time. Falls back gracefully when git is
 * unavailable (e.g. a detached deploy tarball) so the build never breaks on it:
 * the ledger renders honest empty witness rows instead of an invented history.
 */

export interface Revision {
  /** Short SHA — the drafter's revision tag. */
  sha: string;
  /** Commit subject, verbatim. */
  subject: string;
  /** ISO date (author date). */
  date: string;
}

function run(cmd: string): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function readGit(): {
  sha: string;
  rev: string;
  log: Revision[];
  first: Revision | null;
  /** Revisions between the visible recent log and the first commit. */
  gap: number;
} {
  try {
    const sha = run('git rev-parse --short HEAD');
    const count = run('git rev-list --count HEAD');
    // Unit separator (0x1f) keeps subjects with any punctuation intact.
    const parse = (raw: string): Revision[] =>
      raw
        .split('\n')
        .map((line) => line.split('\x1f'))
        .filter((p) => p.length === 3)
        .map(([h, s, d]) => ({ sha: h, subject: s, date: d }));
    const log = parse(run('git log -n 5 --format=%h%x1f%s%x1f%as'));
    const first =
      parse(run('git log --max-parents=0 -n 1 --format=%h%x1f%s%x1f%as'))[0] ??
      null;
    const gap = Math.max(0, Number(count) - log.length - (first ? 1 : 0));
    return { sha, rev: count, log, first, gap };
  } catch {
    // Vercel exposes the SHA via env when git isn't present in the runtime.
    const envSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    return { sha: envSha ?? '0000000', rev: '—', log: [], first: null, gap: 0 };
  }
}

export const GIT = readGit();
