import s from '@/app/prototype/datum/datum.module.css';
import { CW, DEPARTURES, stamp } from './content';

/** CW-01 HARBOUR LINE. Built straight out of the book. */
export function CW01Harbour() {
  return (
    <section className={s.cw01}>
      <header className={s.cw01Head}>
        <p className={s.cw01Eyebrow}>{CW.eyebrow}</p>
        <h2 className={s.cw01Headline}>{CW.headline}</h2>
        <p className={s.cw01Lede}>{CW.lede}</p>
        <p className={s.cw01Actions}>
          <span className={s.cw01Primary}>{CW.primary}</span>
          <span className={s.cw01Secondary}>{CW.secondary}</span>
        </p>
      </header>

      <div className={s.cw01Card}>
        <div className={s.cw01CardHead}>
          <span className={s.cw01Caption}>{CW.board}</span>
          <span className={s.cw01PillWrap}>
            <span className={s.cw01Pill}>{CW.status}</span>
          </span>
        </div>

        <div className={s.cw01Well}>
          <svg viewBox="0 0 320 44" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1="8"
              y1="22"
              x2="312"
              y2="22"
              strokeWidth="2"
              style={{ stroke: 'var(--cw-accent)' }}
            />
            {[8, 46, 84, 122, 160, 198, 236, 274, 312].map((x) => (
              <circle
                key={x}
                cx={x}
                cy="22"
                r="4"
                strokeWidth="2"
                style={{ fill: 'var(--tok-tide)', stroke: 'var(--cw-accent)' }}
              />
            ))}
          </svg>
        </div>

        <div className={s.cw01Rows}>
          {DEPARTURES.map((d) => (
            <div key={d.time} className={s.cw01Row}>
              <span className={s.cw01CellTime}>{d.time}</span>
              <span className={s.cw01CellTo}>{d.to}</span>
              <span className={s.cw01CellPlat}>{d.platform}</span>
              <span className={s.cw01CellNote}>{d.note}</span>
            </div>
          ))}
        </div>
      </div>

      <p className={s.cw01Facts}>{CW.facts.join(' · ')}</p>
      <p className={s.cw01Stamp}>{stamp('A')}</p>
    </section>
  );
}
