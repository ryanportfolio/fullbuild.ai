import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The title block's PROTOTYPES field is a TRUE readout of the index, the same
 * way REV is a true readout of the repository (see `git.ts`). It was a literal
 * `04` for long enough to drift to a third of the real figure, which is exactly
 * the failure the rest of this sheet is built to avoid: a number on a drawing
 * that nobody re-derives is a number that is wrong.
 *
 * The gallery at `public/prototype/index.html` is the source of truth, because
 * it is the thing a reader actually navigates. Counting its rows means adding a
 * prototype to the index is the only step: the count follows on the next build
 * and cannot be forgotten separately. Read once at build/server time.
 *
 * Falls back to `null` rather than to a guess when the file cannot be read, so
 * the field renders the same witness dot the revision ledger uses for unknowns
 * instead of inventing a total.
 */

function readPrototypeCount(): number | null {
  try {
    const index = readFileSync(
      path.join(process.cwd(), 'public', 'prototype', 'index.html'),
      'utf8',
    );
    // One `class="row"` per entry: the anchor that makes a row navigable is the
    // same thing that makes it a prototype on file.
    const count = index.match(/class="row"/g)?.length ?? 0;
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}

export const PROTOTYPE_COUNT = readPrototypeCount();
