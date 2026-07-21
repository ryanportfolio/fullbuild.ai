import { GIT } from '@/lib/git';
import IfcStamp from './IfcStamp';
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
            <h2 className={u.heading}>Every sheet was redrawn to get here</h2>
            <p className={u.intro}>
              Faster building increases the need for stronger checks; secure,
              sustainable, and aligned with the original intent.
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
              Δ{GIT.rev} = the commit you are reading · {GIT.sha}
            </p>
          </div>

          <aside className={u.sideCol}>
            <div className={u.specimen}>
              <div className={u.specimenHead}>Title block · contact</div>
              <ContactRow k="Drawn by" v={null} />
              <ContactRow k="Email" v={null} />
              <ContactRow k="Based" v={null} />
              <ContactRow k="Résumé" v={null} />
              {/* The one deliberate null: this drawing awaits its checker. */}
              <ContactRow k="Checked by" v={null} />
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

function ContactRow({ k, v }: { k: string; v: string | null }) {
  return (
    <div className={u.fieldRow}>
      <span className={u.fieldKey}>{k}</span>
      <span className={u.fieldVal} data-empty={v === null ? 'true' : undefined}>
        {v}
      </span>
    </div>
  );
}

