import s from '@/app/prototype/datum/datum.module.css';
import { CW, DEPARTURES, stamp } from './content';

/**
 * CW-03 SUNBREAK. Confidently made and wearing a different brand: a cream
 * ground, an orange that is nobody's accent, a violet badge, centred blocks
 * that each own their own left edge, and a transition on colour and width.
 */
export function CW03Sunbreak() {
  return (
    <section className={s.cw03}>
      <div className={s.cw03Bar} />

      <p className={s.cw03Badge}>{CW.status}</p>
      <p className={s.cw03Eyebrow}>{CW.eyebrow}</p>
      <h2 className={s.cw03Headline}>{CW.headline}</h2>
      <p className={s.cw03Lede}>{CW.lede}</p>

      <p className={s.cw03Actions}>
        <span className={s.cw03Primary}>{CW.primary}</span>
        <span className={s.cw03Secondary}>{CW.secondary}</span>
      </p>

      <div className={s.cw03Card}>
        <div className={s.cw03Strip} />
        <p className={s.cw03Caption}>{CW.board}</p>
        <div className={s.cw03Rows}>
          {DEPARTURES.map((d) => (
            <div key={d.time} className={s.cw03Row}>
              <span className={s.cw03CellTime}>{d.time}</span>
              <span className={s.cw03CellTo}>{d.to}</span>
              <span className={s.cw03CellNote}>{d.note}</span>
            </div>
          ))}
        </div>
      </div>

      <p className={s.cw03Facts}>{CW.facts.join(' · ')}</p>
      <p className={s.cw03Stamp}>{stamp('C')}</p>
    </section>
  );
}
