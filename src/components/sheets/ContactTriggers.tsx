'use client';

import type { MouseEvent } from 'react';
import u from './unconformity.module.css';

/**
 * The two live witness lines in the appendix title block: EMAIL now carries
 * the address, and CHECKED BY (still visually the set's one deliberate null)
 * is the hook into THE COUNTERSIGN. With JS, both glide the reader down to
 * T-01 on Lenis; without it they degrade honestly — EMAIL to
 * mailto:hi@fullbuild.ai, CHECKED BY to the in-page #t-01 anchor (or the
 * standalone /contact form, which serves the same sheet).
 */
function glideToT01(e: MouseEvent<HTMLAnchorElement>) {
  const el = document.getElementById('t-01');
  if (!el) return; // standalone appendix render — let the href do its work
  e.preventDefault();
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function EmailRow() {
  return (
    <div className={`${u.fieldRow} ${u.fieldStack}`}>
      <span className={u.fieldKey}>Email</span>
      <span className={u.fieldVal}>
        <a href="mailto:hi@fullbuild.ai" onClick={glideToT01} aria-label="Contact, open the transmittal sheet">
          hi@fullbuild.ai
        </a>
      </span>
    </div>
  );
}

export function CheckedByRow() {
  return (
    <div className={u.fieldRow}>
      <span className={u.fieldKey}>Checked by</span>
      <span className={u.fieldVal}>
        <a
          className={u.checkedBy}
          href="#t-01"
          onClick={glideToT01}
          aria-label="Checked by is unsigned, countersign the set on sheet T-01"
        />
      </span>
    </div>
  );
}
