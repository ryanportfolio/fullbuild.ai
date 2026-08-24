import type { Metadata } from 'next';
import TapePlayer from './TapePlayer';
import { REEL, timecode } from './reel';
import styles from './layline-vid.module.css';

export const metadata: Metadata = {
  title: 'layline · E-02',
  description:
    'One screen-captured tape of Layline, the race replay build, in operation: four minutes seventeen at 1080p60, played on a strip-chart transport drawn from the recording itself.',
};

/**
 * EXHIBIT E-02, numbered the way the set numbers its adjunct sheets (E-01 is
 * the demonstration reel). The rest of the set draws the work; this sheet
 * plays one build of it.
 * Server-rendered floor: the video ships with native controls, so no-JS and
 * reduced-motion readers get the full record. TapePlayer hydrates the
 * strip-chart transport over that floor.
 * The sheet's copy is deliberately bare for now: a later pass writes the
 * annotation, and a caption nobody has verified would be a claim this set
 * does not make.
 */
export default function LaylineVidPage() {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        {/* The sheet's title lives in the head band beside its number, the way
            a drawing is named on its own title line rather than in a masthead
            above it. It stays the page's single h1. */}
        <header className={styles.head}>
          <span className={`${styles.headNo} u-mono`}>EXHIBIT E-02</span>
          <h1 className={`${styles.headFacts} u-mono`}>
            LAYLINE · {timecode(REEL.duration)}
          </h1>
        </header>

        <TapePlayer />
      </div>
    </main>
  );
}
