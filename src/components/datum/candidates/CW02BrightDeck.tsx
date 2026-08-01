import s from '@/app/prototype/datum/datum.module.css';
import { CW, DEPARTURES, stamp } from './content';

/**
 * CW-02 BRIGHT DECK. The same family of layout with real authored drift in it:
 * a cooler accent, a cool card tint, a colder muted text, three sizes and one
 * weight that are not on the scale, and three spacing values between steps.
 */
export function CW02BrightDeck() {
  return (
    <section className={s.cw02}>
      <div className={s.cw02Rule} />

      <header className={s.cw02Head}>
        <p className={s.cw02Eyebrow}>{CW.eyebrow}</p>
        <h2 className={s.cw02Headline}>{CW.headline}</h2>
        <p className={s.cw02Lede}>{CW.lede}</p>
        <p className={s.cw02Actions}>
          <span className={s.cw02Primary}>{CW.primary}</span>
          <span className={s.cw02Secondary}>{CW.secondary}</span>
        </p>
      </header>

      <div className={s.cw02Card}>
        <div className={s.cw02CardHead}>
          <span className={s.cw02Caption}>{CW.board}</span>
          <span className={s.cw02PillWrap}>
            <span className={s.cw02Pill}>{CW.status}</span>
          </span>
        </div>

        <div className={s.cw02Well}>
          <svg viewBox="0 0 320 44" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1="8"
              y1="22"
              x2="312"
              y2="22"
              strokeWidth="2"
              style={{ stroke: 'var(--tok-slate)' }}
            />
            {[8, 46, 84, 122, 160, 198, 236, 274, 312].map((x) => (
              <circle
                key={x}
                cx={x}
                cy="22"
                r="4"
                strokeWidth="2"
                style={{ fill: 'var(--tok-paper)', stroke: 'var(--tok-slate)' }}
              />
            ))}
          </svg>
        </div>

        <div className={s.cw02Rows}>
          {DEPARTURES.map((d) => (
            <div key={d.time} className={s.cw02Row}>
              <span className={s.cw02CellTime}>{d.time}</span>
              <span className={s.cw02CellTo}>{d.to}</span>
              <span className={s.cw02CellPlat}>{d.platform}</span>
              <span className={s.cw02CellNote}>{d.note}</span>
            </div>
          ))}
        </div>
      </div>

      <p className={s.cw02Facts}>{CW.facts.join(' · ')}</p>
      <p className={s.cw02Stamp}>{stamp('B')}</p>
    </section>
  );
}
