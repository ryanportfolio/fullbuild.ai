import type { Metadata } from 'next';
import ReelPlayer from './ReelPlayer';
import { REEL, timecode } from './reel';
import styles from './examples.module.css';

export const metadata: Metadata = {
  title: 'examples · E-01',
  description:
    'One screen-captured reel of the shipped work in operation: ten stations in just under eleven minutes, played on a strip-chart transport drawn from the recording itself.',
};

/**
 * EXHIBIT E-01, numbered the way the set numbers its adjunct sheets (the
 * transmittal is T-01). The rest of the set draws the work; this sheet plays it.
 * Server-rendered floor: the video ships with native controls and the station
 * log is plain HTML, so no-JS and reduced-motion readers get the full record.
 * ReelPlayer hydrates the strip-chart transport over that floor.
 */
export default function ExamplesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        {/* The sheet's title lives in the head band beside its number, the way
            a drawing is named on its own title line rather than in a masthead
            above it. It stays the page's single h1. */}
        <header className={styles.head}>
          <span className={`${styles.headNo} u-mono`}>EXHIBIT E-01</span>
          <h1 className={`${styles.headFacts} u-mono`}>
            EXAMPLES · {timecode(REEL.duration)}
          </h1>
        </header>

        <ReelPlayer />
      </div>
    </main>
  );
}
