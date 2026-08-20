import { execSync } from 'node:child_process';

/**
 * The title-block REV field and the appendix revision ledger are TRUE readouts
 * of the repository, not decorative numbers — the sheet revision IS the repo
 * revision. Read once at build/server time. Falls back gracefully when git is
 * unavailable (e.g. a detached deploy tarball) so the build never breaks on it:
 * the ledger renders honest empty witness rows instead of an invented history.
 *
 * SHALLOW CLONES: Vercel clones at depth 10, so `git rev-list --count HEAD`
 * reads 10 there no matter how deep the history really is — a wrong number,
 * which on this sheet is worse than none. When the clone is shallow the true
 * count is asked of the GitHub commits API instead (the Link header's last
 * page at per_page=1 IS the count); if that fails, REV renders the honest
 * empty witness value and the gap row is dropped rather than shown wrong.
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

/**
 * True commit count reachable from `sha`, from the GitHub API. Returns null on
 * any failure — the caller renders the witness value, never a guess.
 */
async function githubCount(sha: string): Promise<number | null> {
  const owner = process.env.VERCEL_GIT_REPO_OWNER ?? 'ryanportfolio';
  const repo = process.env.VERCEL_GIT_REPO_SLUG ?? 'fullbuild.ai';
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${sha}&per_page=1`,
      {
        headers: { accept: 'application/vnd.github+json' },
        // No cache option: Next patches fetch during static prerender, and an
        // explicit 'no-store' there throws DynamicServerError — which would
        // silently land every build in the witness fallback.
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    // per_page=1 makes the last page number equal the commit count.
    const last = res.headers.get('link')?.match(/[?&]page=(\d+)>;\s*rel="last"/);
    if (last) return Number(last[1]);
    // No Link header: the whole history fits one page.
    const body = (await res.json()) as unknown[];
    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}

async function readGit(): Promise<{
  sha: string;
  rev: string;
  log: Revision[];
  /**
   * Every revision the ledger does not list individually. The visible rows plus
   * this number must always equal `rev` — the appendix shows its own arithmetic,
   * so this is the one field that keeps it honest. 0 whenever `rev` is not a
   * real count, so no arithmetic is claimed that cannot be shown.
   */
  gap: number;
}> {
  try {
    const sha = run('git rev-parse --short HEAD');
    // Unit separator (0x1f) keeps subjects with any punctuation intact.
    const parse = (raw: string): Revision[] =>
      raw
        .split('\n')
        .map((line) => line.split('\x1f'))
        .filter((p) => p.length === 3)
        .map(([h, s, d]) => ({ sha: h, subject: s, date: d }));
    const log = parse(run('git log -n 5 --format=%h%x1f%s%x1f%as'));

    const shallow = run('git rev-parse --is-shallow-repository') === 'true';
    const count = shallow
      ? await githubCount(run('git rev-parse HEAD'))
      : Number(run('git rev-list --count HEAD'));
    if (count === null || Number.isNaN(count)) {
      // Shallow with the API out of reach: the rows are still real commits,
      // but the total is unknowable here. Witness value, no gap row.
      return { sha, rev: '·', log, gap: 0 };
    }
    // The initial commit is no longer pulled out as its own row, so the gap
    // absorbs it: visible rows + gap === rev, still.
    const gap = Math.max(0, count - log.length);
    return { sha, rev: String(count), log, gap };
  } catch {
    // Vercel exposes the SHA via env when git isn't present in the runtime.
    const envSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    return { sha: envSha ?? '0000000', rev: '·', log: [], gap: 0 };
  }
}

export const GIT = await readGit();
