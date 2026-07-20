import { GIT } from '@/lib/git';
import u from './unconformity.module.css';

/**
 * The Unconformity — the honesty sheet. A drafter's revision log, drawn in
 * GRAPHITE (never red — red is quarantined to live-in-prod), that admits the
 * drawing set logs its own construction. The current revision is bound to the
 * REAL deployed commit. Contact is an extractable field-specimen tag; unknown
 * fields render as honest empty witness lines, never invented.
 */
const REVISIONS: [string, string, string][] = [
  ['A', 'First pass — graphite sketch, unresolved', 'idea'],
  ['B', 'Dimensioned, spec-locked', 'design'],
  ['C', 'Framed — load-bearing structure', 'eng'],
  ['D', 'Poured — live in production', 'shipped'],
];

export default function SheetUnconformity() {
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
              A drawing that hides its revisions is hiding something. This set
              logs its own — each state is a revision of the one before it, and
              the current revision is the exact commit this page was built from.
            </p>

            <div className={u.revTable} role="table">
              {REVISIONS.map(([tag, desc, when], i) => {
                const current = i === REVISIONS.length - 1;
                return (
                  <div className={u.revRow} role="row" key={tag} data-current={current ? 'true' : undefined}>
                    <span className={u.revTag}>{tag}</span>
                    <span className={u.revDesc}>{desc}</span>
                    <span className={u.revWhen}>{when}</span>
                  </div>
                );
              })}
            </div>
            <p className={u.cloudNote}>
              ↑ clouded row = current revision · rev {GIT.rev} @ {GIT.sha}
            </p>
          </div>

          <aside className={u.specimen}>
            <div className={u.specimenHead}>Title block · contact</div>
            <ContactRow k="Drawn by" v={null} />
            <ContactRow k="Email" v={null} />
            <ContactRow k="Based" v={null} />
            <ContactRow k="Status" v={null} />
            <ContactRow k="Résumé" v={null} />
          </aside>
        </div>
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
