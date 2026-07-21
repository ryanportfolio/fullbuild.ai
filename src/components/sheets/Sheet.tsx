import type { ReactNode } from 'react';
import styles from './Sheet.module.css';

export type SheetInk = 'graphite' | 'cyanotype' | 'concrete' | 'live';

/**
 * The drafting frame every state is drawn inside. Asymmetric by design: the
 * drawing sits on one edge and the lettering on the other, alternating per
 * state so POSITION encodes pipeline order — never a centered, template-symmetric
 * card.
 */
export default function Sheet({
  n,
  state,
  ink,
  drawingSide = 'left',
  drawing,
  masthead,
  children,
  negative = false,
}: {
  n: string;
  state: string;
  ink: SheetInk;
  drawingSide?: 'left' | 'right';
  drawing: ReactNode;
  /** Full-width band between the head rule and the two-column body — the cover
      sheet's drawing TITLE. Nothing else may share its horizontal reach. */
  masthead?: ReactNode;
  children: ReactNode;
  negative?: boolean;
}) {
  return (
    <section
      id={`state-${n}`}
      data-state={n}
      data-ink={ink}
      data-negative={negative ? 'true' : undefined}
      className={styles.sheet}
      aria-label={`Sheet ${n} of 4 — ${state}`}
    >
      <div className={styles.frame} data-side={drawingSide} data-cover={masthead ? 'true' : undefined}>
        <header className={styles.head}>
          <span className={`${styles.stateNo} u-mono`}>STAGE&nbsp;{n}</span>
          <span className={`${styles.stateName} u-label`}>{state}</span>
          <span className={`${styles.sheetNo} u-mono`}>S-{n} / 04</span>
        </header>

        {masthead ? <div className={styles.masthead}>{masthead}</div> : null}

        <div className={styles.body}>
          <figure className={styles.drawing} aria-hidden="true">
            {drawing}
          </figure>
          <div className={styles.copy}>{children}</div>
        </div>
      </div>
    </section>
  );
}
