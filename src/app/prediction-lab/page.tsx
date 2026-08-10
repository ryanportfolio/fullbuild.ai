import type { Metadata } from 'next';
import WalkPlayer from './WalkPlayer';
import LiveLink from './LiveLink';
import { WALK, LAB, RUN, HIGHLIGHTS, STEPS, stepHref, timecode } from './walk';
import styles from './prediction-lab.module.css';

export const metadata: Metadata = {
  title: 'prediction lab · E-02',
  description:
    'A walkthrough of Prediction Lab, an insurance actuarial modeling workspace, as a decision record: nine ledger steps with live evidence links, real captures, and the demonstration reel on a strip-chart transport.',
};

/**
 * EXHIBIT E-02, next in the exhibit series after E-01. Where E-01 plays the
 * shipped work, this sheet walks through one product and obeys that product's
 * own law while doing it: every number carries its provenance, every claim
 * carries an evidence link that reopens the live product at the state the
 * claim describes, and the figures are unretouched captures.
 * Server-rendered floor: native video controls, a plain chapter log, plain
 * figures and anchors. WalkPlayer hydrates the strip-chart transport on top.
 */
export default function PredictionLabPage() {
  const figBase = 2; /* FIG 1 is the reel; ledger figures follow in order */
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.head}>
          <span className={`${styles.headNo} u-mono`}>EXHIBIT E-02</span>
          <h1 className={`${styles.headFacts} u-mono`}>
            PREDICTION LAB · {timecode(WALK.duration)}
          </h1>
        </header>

        {/* The sheet's own provenance line: when it was read, and where the
            thing it documents runs. The date governs every figure below. */}
        <p className={`${styles.provenance} u-mono`}>
          <span className={styles.provSeg}>AS OF 8/10/26</span>{' '}
          <span className={styles.provSeg}>
            · DEMO AT{' '}
            <LiveLink href={LAB.href} probeKey={LAB.href} live={LAB.live}>
              {LAB.href.replace(/^https:\/\//, '')}
            </LiveLink>
          </span>
        </p>

        <WalkPlayer />

        {/* ---- highlights: the run the reel records, in its own numbers ---- */}
        <section className={styles.highlights} aria-label="The run in its own numbers">
          <h2 className={styles.sectionTitle}>The run in its own numbers</h2>
          <p className={styles.sectionLede}>
            Prediction Lab is my concept for how insurance pricing work should
            feel, built as a running product. An agent runs bounded modeling
            experiments against a real fitting engine in Rust, every chart it
            draws carries its uncertainty and where the numbers came from, and
            a human signs the result into a record that cannot be redrawn
            later. The reel above is one run of it.
          </p>
          <dl className={styles.highlightRow}>
            {HIGHLIGHTS.map((h) => (
              <div key={h.label} className={styles.highlight}>
                <dt className={`${styles.highlightLabel} u-mono`}>{h.label.toUpperCase()}</dt>
                <dd className={styles.highlightValue}>
                  <strong>{h.value}</strong>
                  <span className={styles.highlightNote}>{h.note}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className={`${styles.highlightSource} u-mono`}>
            SOURCE · RUN {RUN.id} OVERVIEW AND ITS DECISION RECORD · {RUN.baseline} →{' '}
            {RUN.approved} · READ 2026-08-10
          </p>
        </section>

        {/* ---- the ledger: nine steps, each with its evidence link --------- */}
        <section className={styles.ledger} aria-label="Walkthrough ledger">
          <h2 className={styles.sectionTitle}>What changed, and why</h2>
          <p className={styles.sectionLede}>
            Nine steps, drawn from the product&apos;s merged pull requests and
            checked against the live build. Each one links to the running
            product at the state its figure shows, which works because the
            product keeps its view in the URL (step <a href="#w-08">W-08</a>).
            Where a link cannot carry the state, the step says so instead of
            printing a link that would open something else.
          </p>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => {
              const href = stepHref(s);
              return (
                <li key={s.id} id={s.id.toLowerCase()} className={styles.step}>
                  <div className={styles.stepText}>
                    <p className={`${styles.stepNo} u-mono`}>{s.id}</p>
                    <h3 className={styles.stepTitle}>{s.title}</h3>
                    <p className={styles.stepWhy}>{s.why}</p>
                    {/* The paper trail is reachable, not just named. */}
                    <p className={`${styles.stepWitness} u-mono`}>
                      {s.prs.map((n, j) => (
                        <span key={n}>
                          {j > 0 ? ' · ' : ''}
                          <a
                            className={styles.prLink}
                            href={`${LAB.repo}/pull/${n}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PR #{n}
                          </a>
                        </span>
                      ))}
                    </p>
                    {/* The link carries the whole state, or the sheet says what
                        it could not carry. The red is gated either way. */}
                    <p className={`${styles.stepEvidence} u-mono`}>
                      <LiveLink href={href} probeKey={LAB.href} live={LAB.live}>
                        {s.params && s.params.startsWith('?') ? s.params : href.replace(/^https:\/\//, '')}
                      </LiveLink>
                    </p>
                    {s.absent ? (
                      <p className={`${styles.stepAbsent} u-mono`}>NOT IN THE LINK · {s.absent}</p>
                    ) : null}
                    {s.artifact ? (
                      <p className={`${styles.stepArtifact} u-mono`}>{s.artifact}</p>
                    ) : null}
                  </div>
                  <figure className={styles.stepFig}>
                    <img
                      src={s.fig}
                      alt={s.figAlt}
                      width={s.figW}
                      height={s.figH}
                      loading={i < 2 ? undefined : 'lazy'}
                    />
                    {s.id === 'W-09' ? (
                      <img
                        src="/prediction-lab/fig-w09-night.jpg"
                        alt="The same run overview in the night theme: a warm pale ground with terracotta accents"
                        width={1600}
                        height={1000}
                        loading="lazy"
                      />
                    ) : null}
                    <figcaption className={`${styles.stepCaption} u-mono`}>
                      <span className={styles.plateSeg}>
                        FIG {figBase + i}
                        {s.id === 'W-09' ? ` + ${figBase + i + 1}` : ''}
                      </span>{' '}
                      <span className={styles.plateSeg}>· {s.capture.toUpperCase()}</span>{' '}
                      <span className={styles.plateSeg}>
                        ·{' '}
                        {s.figW === 1600 && s.figH === 1000
                          ? '1600×1000, WHOLE VIEWPORT'
                          : `${s.figW}×${s.figH}, CROPPED FROM A 1600×1000 VIEWPORT`}
                        , 2026-08-10
                      </span>
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---- record footer ---------------------------------------------- */}
        <footer className={styles.record}>
          <p className={`${styles.recordLine} u-mono`}>
            SOURCE{' '}
            {LAB.repo ? (
              <a className={`${styles.recordHref} u-mono`} href={LAB.repo} target="_blank" rel="noreferrer">
                {LAB.repo.replace(/^https:\/\//, '')}
              </a>
            ) : null}
          </p>
        </footer>
      </div>
    </main>
  );
}
