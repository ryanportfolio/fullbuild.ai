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
  act = false,
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
  /** An ACT sheet holds the stage on a sticky holder while the reader's scroll
      crews its drawing (DrawingSet owns the scrub). The extra travel is armed
      by JS only, so no-JS and reduced-motion readers keep a one-viewport sheet. */
  act?: boolean;
}) {
  const frame = (
    <div className={styles.frame} data-side={drawingSide} data-cover={masthead ? 'true' : undefined}>
      <header className={styles.head}>
        <span className={`${styles.stateNo} u-mono`}>STAGE&nbsp;{n}</span>
        <span className={`${styles.stateName} u-label`}>{state}</span>
        <span className={`${styles.sheetNo} u-mono`}>S-{n} / 04</span>
      </header>

      {masthead ? <div className={styles.masthead}>{masthead}</div> : null}

      <div className={styles.body}>
        {/* NOT aria-hidden: the cover's drawing slot carries the SHEET INDEX,
            a real list of links to every shipped project, and each plate's
            root <svg> already carries role="img" + a described aria-label.
            Hiding the figure stranded those links — tabbable, unannounced. */}
        <figure className={styles.drawing}>{drawing}</figure>
        <div className={styles.copy}>{children}</div>
      </div>
    </div>
  );
  return (
    <section
      id={`state-${n}`}
      data-state={n}
      data-ink={ink}
      data-negative={negative ? 'true' : undefined}
      data-act={act ? '' : undefined}
      className={styles.sheet}
      aria-label={`Sheet ${n} of 4 · ${state}`}
    >
      {act ? <div className={styles.holder}>{frame}</div> : frame}
    </section>
  );
}
