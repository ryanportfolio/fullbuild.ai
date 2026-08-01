import s from '@/app/prototype/datum/datum.module.css';
import { CW, stamp } from './content';

/**
 * CW-04 TIDEWATER. Nothing about it resembles the other three: a full bleed
 * tide panel, a vertical index rail, a stacked lockup at the top step, and a
 * ruled ledger carrying the actions on its baseline. Every value in it is a
 * value out of the book, which is the only reason it scores.
 */
export function CW04Tidewater() {
  return (
    <section className={s.cw04}>
      <p className={s.cw04Rail}>{CW.rail}</p>

      <div className={s.cw04Col}>
        <p className={s.cw04Eyebrow}>{CW.eyebrow}</p>

        <div className={s.cw04Lockup}>
          {CW.headlineLines.map((line) => (
            <span key={line} className={s.cw04Line}>
              {line}
            </span>
          ))}
        </div>

        <p className={s.cw04Lede}>{CW.lede}</p>

        <div className={s.cw04Ledger}>
          <p className={s.cw04LedgerLabel}>{CW.ledger}</p>
          <p className={s.cw04LedgerRow}>
            <span className={s.cw04Lead}>{CW.lead}</span>
            <span className={s.cw04LeadNote}>{CW.leadNote}</span>
            <span className={s.cw04Facts}>{CW.facts.join(' · ')}</span>
          </p>
          <p className={s.cw04Actions}>
            <span className={s.cw04Primary}>{CW.primary}</span>
            <span className={s.cw04Secondary}>{CW.secondary}</span>
            <span className={s.cw04Status}>{CW.status}</span>
          </p>
        </div>

        <p className={s.cw04Stamp}>{stamp('D')}</p>
      </div>
    </section>
  );
}
