import { GIT } from '@/lib/git';
import IfcStamp from './IfcStamp';
import { FasterGlyph, StrongerGlyph, SecureGlyph } from './SheetGlyphs';
import { EmailRow } from './ContactTriggers';
import u from './unconformity.module.css';

/**
 * The Unconformity — the honesty sheet. The revision ledger is the REAL git
 * history of this repository, read at build time: hashes, subjects, dates,
 * verbatim. The current revision wears a scalloped revision cloud (the
 * drafter's "this was redrawn" convention). Contact is an extractable
 * field-specimen tag; unknown fields render as honest empty witness lines,
 * never invented — CHECKED BY stays the one deliberate null in the set.
 */
export default function SheetUnconformity() {
  const log = GIT.log;

  return (
    <section id="rev" data-state="rev" className={u.sheet} aria-label="Revision log and contact">
      <div className={u.frame}>
        <header className={u.head}>
          <span className={`${u.stateNo} u-mono`}>APPENDIX</span>
          <span className={`${u.stateName} u-label`}>Revision Log</span>
          <span className={`${u.sheetNo} u-mono`}>
            REV&nbsp;{GIT.rev}&nbsp;·&nbsp;{GIT.sha}
          </span>
        </header>

        <div className={u.body}>
          <div>
            <h2 className={u.heading}>Workflows</h2>
            <p className={u.intro}>
              Faster <FasterGlyph /> stronger <StrongerGlyph /> secure{' '}
              <SecureGlyph /> sustainable
            </p>

            {log.length === 0 ? (
              <div className={u.revTable} role="table">
                {/* Honest empty state: git unavailable in this runtime. */}
                {[0, 1, 2].map((i) => (
                  <div className={u.revRow} role="row" key={i}>
                    <span className={u.revTag}>·</span>
                    <span className={`${u.revDesc} ${u.revEmpty}`} />
                    <span className={u.revWhen}>––––</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={u.revTable} role="table">
                {log.map((r, i) => {
                  const current = i === 0;
                  return (
                    <div
                      className={u.revRow}
                      role="row"
                      key={r.sha}
                      data-current={current ? 'true' : undefined}
                    >
                      {current && (
                        // Drafting revision delta: the current issue marker.
                        <svg className={u.delta} viewBox="0 0 18 16" aria-hidden="true">
                          <path d="M9 1.5 L17 14.5 L1 14.5 Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                          <text x="9" y="12.5" textAnchor="middle" fontSize="7.5" fill="currentColor" fontFamily="var(--font-mono)">
                            {GIT.rev}
                          </text>
                        </svg>
                      )}
                      <span className={u.revTag}>{r.sha}</span>
                      <span className={u.revDesc}>{r.subject}</span>
                      <span className={u.revWhen}>{r.date}</span>
                    </div>
                  );
                })}
                {GIT.gap > 0 && (
                  <div className={`${u.revRow} ${u.revGap}`} role="row">
                    <span className={u.revTag}>···</span>
                    <span className={u.revDesc}>
                      {GIT.gap} intermediate revision{GIT.gap === 1 ? '' : 's'}
                    </span>
                    <span className={u.revWhen}>···</span>
                  </div>
                )}
                {GIT.first && (
                  <div className={u.revRow} role="row">
                    <span className={u.revTag}>{GIT.first.sha}</span>
                    <span className={u.revDesc}>{GIT.first.subject}</span>
                    <span className={u.revWhen}>{GIT.first.date}</span>
                  </div>
                )}
              </div>
            )}
            <p className={u.cloudNote}>
              <a
                className={u.repoLink}
                href="https://github.com/ryanportfolio/fullbuild.ai"
                target="_blank"
                rel="noreferrer"
              >
                github.com/ryanportfolio/fullbuild.ai
              </a>
            </p>
          </div>

          <aside className={u.sideCol}>
            <div className={u.specimen}>
              <div className={u.specimenHead}>Title block · contact</div>
              <EmailRow />
              <a
                className={u.linkedin}
                href="https://www.linkedin.com/in/ryan-allen-d/"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn, ryan-allen-d"
              >
                <LinkedInMark />
                <span className={u.linkedinLabel}>LinkedIn</span>
              </a>
            </div>
            <IfcStamp />
          </aside>
        </div>

        <p className={`${u.endOfSet} u-mono`}>
          END OF SET · REV {GIT.rev} · {GIT.sha}
        </p>
      </div>
    </section>
  );
}

/** LinkedIn wordmark glyph, drawn as filled ink to match the set's linework. */
function LinkedInMark() {
  return (
    <svg className={u.linkedinGlyph} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
      />
    </svg>
  );
}

