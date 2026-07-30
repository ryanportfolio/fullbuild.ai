import type { Metadata } from "next";
import Link from "next/link";
import { ConceptShell } from "@/components/tawkify/ConceptShell";
import { Plate, ProofNumber, ConstraintRows, StageTimeline } from "@/components/tawkify/Shared";
import {
  arrowsLadder,
  constraints,
  criticsBlock,
  disclosureTerms,
  ledgerSteps,
  matchDefinition,
  matchmakers,
  platformRatings,
  poolDisclosure,
  pricingTiers,
  proofStats,
  receiptsRow,
  screeningSpec,
  stories,
} from "@/lib/tawkify/data";
import styles from "./tawkify.module.css";

export const metadata: Metadata = {
  title: "Tawkify modernization concept",
  description:
    "Unofficial redesign concept for tawkify.com: a faithful refresh of the real brand with the receipts, price, terms, and screening on the page.",
};

type BandProps = {
  folio: string;
  ground: "cream-light" | "cream" | "cream-deep" | "ink";
  tier: "xs" | "s" | "m" | "l";
  children: React.ReactNode;
};

function Band({ folio, ground, tier, children }: BandProps) {
  return (
    <section className={`${styles.band} ${ground === "ink" ? styles.onInk : ""}`} data-ground={ground} data-tier={tier}>
      <span className={styles.folio} aria-hidden="true">
        {folio}
      </span>
      <div className={styles.bandInner}>{children}</div>
    </section>
  );
}

function SectionHead({ eyebrow, title, deck }: { eyebrow: string; title: string; deck?: string }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.rule} data-reveal="rule" />
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={styles.h2}>{title}</h2>
      {deck ? <p className={styles.deck}>{deck}</p> : null}
    </div>
  );
}

export default function TawkifyStoryPage() {
  return (
    <ConceptShell>
      {/* 1 · Hero, the commitment ground, with the receipts row */}
      <Band folio="01 · HERO" ground="cream-deep" tier="l">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 className={styles.h1} data-reveal="settle">
              Your person is out there, let us introduce you
            </h1>
            <p className={styles.deck} data-reveal="settle" style={{ "--stagger": 1 } as React.CSSProperties}>
              A matchmaker who has actually talked to you, screening one
              person at a time. You never swipe
            </p>
            <div className={styles.heroActions} data-reveal="settle" style={{ "--stagger": 2 } as React.CSSProperties}>
              <a href="#pricing" className={styles.pillPrimary}>
                See pricing
              </a>
              <a href="#matchmakers" className={styles.pillSecondary}>
                Book a 30 minute call, no card required
              </a>
            </div>
            <div className={styles.receipts} data-reveal="settle" style={{ "--stagger": 3 } as React.CSSProperties}>
              {receiptsRow.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <Plate id="p1" />
        </div>
      </Band>

      {/* 2 · The incentive argument, first ink promise */}
      <Band folio="02 · THE ARGUMENT" ground="ink" tier="m">
        <div className={styles.incentiveGrid}>
          <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
            <span className={styles.rule} data-reveal="rule" />
            <p className={styles.eyebrow}>Why a matchmaker</p>
            <h2 className={styles.h2}>Apps earn when you stay single, we earn when you leave</h2>
            <div className={styles.incentiveBody}>
              <p>
                Every swipe app is paid by your attention, so its best outcome
                is you, back tomorrow. Our contract ends when your search does.
              </p>
              <p>
                That single difference decides everything downstream: who reads
                your file, who plans the date, and who has to answer for a bad
                introduction by name.
              </p>
            </div>
          </div>
          <Plate id="p2" />
        </div>
      </Band>

      {/* 3 · Matchmakers, the product's actual subject */}
      <Band folio="03 · MATCHMAKERS" ground="cream-light" tier="l">
        <div id="matchmakers">
          <SectionHead
            eyebrow="The people doing the work"
            title="Meet your matchmakers"
            deck="Named, tenured, and accountable to your debrief"
          />
          <div className={styles.makerGrid}>
            {matchmakers.map((maker, index) => (
              <article key={maker.name} className={styles.makerCard} data-reveal="settle" style={{ "--stagger": index } as React.CSSProperties}>
                <Plate id={maker.plate as "p3"} />
                <div className={styles.makerMeta}>
                  <h3 className={styles.h3}>{maker.name}</h3>
                  <span className={styles.fact}>
                    {maker.years} YRS MATCHMAKING · {maker.cities.toUpperCase()}
                  </span>
                  <span className={styles.eyebrow}>{maker.specialty}</span>
                </div>
                <p className={styles.makerLine}>{maker.line}</p>
              </article>
            ))}
          </div>
          <p className={styles.continuityNote}>
            One named matchmaker for your whole engagement. If that ever
            breaks, you get a briefed handoff and an additional match at no
            cost, in writing.
          </p>
        </div>
      </Band>

      {/* 4 · The four steps, names verbatim */}
      <Band folio="04 · PROCESS" ground="cream" tier="m">
        <SectionHead eyebrow="What to expect" title="Four steps, in the order they happen" />
        <div className={styles.stepGrid}>
          {ledgerSteps.map((step, index) => (
            <article key={step.id} className={styles.step} data-reveal="settle" style={{ "--stagger": index } as React.CSSProperties}>
              <span className={styles.numeral}>{step.id}</span>
              <h3 className={styles.h3} style={{ fontSize: "1.15rem" }}>
                {step.title}
              </h3>
              <p className={styles.stepBody}>{step.body}</p>
            </article>
          ))}
        </div>
      </Band>

      {/* 5 · Pricing plus disclosure, the second commitment ground */}
      <Band folio="05 · PRICING" ground="cream-deep" tier="l">
        <div id="pricing">
          <SectionHead
            eyebrow="What it costs"
            title="The price is part of the introduction"
            deck="Published here because learning it on a sales call is the first bad date"
          />
          <div className={styles.priceScroll}>
            <table className={styles.priceTable}>
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">Price</th>
                <th scope="col">Matches</th>
                <th scope="col">Includes</th>
              </tr>
            </thead>
            <tbody>
              {pricingTiers.map((tier) => (
                <tr key={tier.name}>
                  <td className={styles.priceName}>{tier.name}</td>
                  <td className={styles.priceValue}>{tier.price}</td>
                  <td className={styles.priceValue}>{tier.matches}</td>
                  <td className={styles.muted}>{tier.includes}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <p className={styles.matchDefinition}>
            <strong>What counts as a match.</strong> {matchDefinition}
          </p>
          <div className={styles.disclosure}>
            <span className={styles.fact}>TERMS, IN PLAIN LANGUAGE · RECONSTRUCTED FROM PUBLIC REPORTING</span>
            {disclosureTerms.map((term) => (
              <p key={term.slice(0, 24)}>{term}</p>
            ))}
          </div>
        </div>
      </Band>

      {/* 6 · Screening as procedure, no seals */}
      <Band folio="06 · SCREENING" ground="cream-light" tier="s">
        <div className={styles.specGrid}>
          <div>
            <SectionHead
              eyebrow="How we screen"
              title="Safety is a procedure, not a badge"
            />
            <dl className={styles.specList}>
              {screeningSpec.map((item) => (
                <div key={item.label} className={styles.specRow}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <Plate id="p9" />
            <div>
              <h3 className={styles.h3} style={{ fontSize: "1.15rem", marginBottom: "0.6rem" }}>
                Your file is a contract, and we check it
              </h3>
              <p className={styles.muted} style={{ fontSize: "0.95rem", marginBottom: "1rem" }}>
                Every introduction is checked against your stated
                non-negotiables, with the computed values shown. This is the
                same component your matchmaker uses.
              </p>
              <ConstraintRows rows={constraints.slice(0, 3)} />
            </div>
          </div>
        </div>
      </Band>

      {/* 7 · Pool disclosure, pre-purchase */}
      <Band folio="07 · THE POOL" ground="cream-light" tier="xs">
        <div className={styles.criticsBlock}>
          <span className={styles.rule} data-reveal="rule" />
          <h3 className={styles.h3}>{poolDisclosure.heading}</h3>
          <p>{poolDisclosure.body}</p>
        </div>
      </Band>

      {/* 8 + 9 · Stories and claims, one continuous ink field */}
      <Band folio="08 · INTRODUCTIONS" ground="ink" tier="l">
        <div className={styles.storyLede}>
          <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
            <span className={styles.rule} data-reveal="rule" />
            <p className={styles.eyebrow}>Real introductions</p>
            <h2 className={styles.h2}>The dates these plates stand for</h2>
          </div>
          <p className={styles.deck}>
            Three couples, three cities, captions with the parts that usually
            get cropped out
          </p>
        </div>
        <div data-reveal="settle">
          <Plate id="p6" />
          <figure className={styles.storyCaption}>
            <blockquote className={styles.storyQuote}>&ldquo;{stories[0].quote}&rdquo;</blockquote>
            <div className={styles.storyFacts}>
              <span className={styles.fact}>{stories[0].city.toUpperCase()} · {stories[0].month.toUpperCase()}</span>
              <span className={styles.fact}>{stories[0].together.toUpperCase()}</span>
            </div>
            <figcaption className={styles.muted} style={{ fontSize: "0.92rem" }}>
              First date: {stories[0].firstDate}
            </figcaption>
          </figure>
        </div>
        <div className={styles.storyPair}>
          {stories.slice(1).map((story, index) => (
            <div key={story.names} data-reveal="settle" style={{ "--stagger": index } as React.CSSProperties}>
              <Plate id={story.plate as "p7"} />
              <figure className={styles.storyCaption}>
                <blockquote className={styles.pullQuote} style={{ fontSize: "1.25rem", marginLeft: "0.45em" }}>
                  &ldquo;{story.quote}&rdquo;
                </blockquote>
                <div className={styles.storyFacts}>
                  <span className={styles.fact}>{story.city.toUpperCase()} · {story.month.toUpperCase()}</span>
                  <span className={styles.fact}>{story.together.toUpperCase()}</span>
                </div>
                <figcaption className={styles.muted} style={{ fontSize: "0.92rem" }}>
                  First date: {story.firstDate}
                </figcaption>
              </figure>
            </div>
          ))}
        </div>

        <div className={styles.inkDivider} />

        <div className={styles.proofGrid}>
          {proofStats.map((stat) => (
            <ProofNumber key={stat.value} value={stat.value} label={stat.label} footnote={stat.footnote} />
          ))}
        </div>
      </Band>

      {/* 10 · The full ratings row, including the bad ones */}
      <Band folio="10 · IN PUBLIC" ground="cream-light" tier="s">
        <SectionHead eyebrow="What everyone says" title="All of our ratings, not just the good one" />
        <div className={styles.ratingsRow}>
          {platformRatings.map((rating) => (
            <div key={rating.platform} className={styles.rating}>
              <span className={styles.eyebrow}>{rating.platform}</span>
              <span className={styles.ratingValue}>{rating.rating}</span>
              <span className={styles.factSmall}>{rating.count.toUpperCase()} · READ JUL 2026</span>
            </div>
          ))}
        </div>
        <div className={styles.criticsBlock}>
          <h3 className={styles.h3} style={{ fontSize: "1.15rem" }}>
            {criticsBlock.heading}
          </h3>
          <p>{criticsBlock.body}</p>
        </div>
      </Band>

      {/* 11 · Start smaller, the Arrows ladder */}
      <Band folio="11 · START SMALLER" ground="cream" tier="xs">
        <SectionHead
          eyebrow="Not ready for the full search"
          title="Three rungs, you choose where to step on"
        />
        <div className={styles.ladder}>
          {arrowsLadder.map((rung, index) => (
            <div key={rung.stage} className={styles.ladderRung} data-reveal="settle" style={{ "--stagger": index } as React.CSSProperties}>
              <span className={styles.ladderIndex}>RUNG {index + 1}</span>
              <h3 className={styles.h3} style={{ fontSize: "1.15rem" }}>
                {rung.stage}
              </h3>
              <p className={styles.stepBody}>{rung.detail}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "2rem" }}>
          <StageTimeline current={0} note="MOST CLIENTS ENTER AT RUNG 1 · THE LADDER IS THE FUNNEL" />
        </div>
      </Band>

      {/* 12 · Final CTA, bookend of the hero */}
      <Band folio="12 · BOOKEND" ground="cream-deep" tier="l">
        <div className={styles.heroCopy}>
          <h2 className={styles.h2} data-reveal="settle">
            Let&rsquo;s see if you&rsquo;re a match
          </h2>
          <p className={styles.deck} data-reveal="settle" style={{ "--stagger": 1 } as React.CSSProperties}>
            A 30 minute call with a matchmaker, no card required. What happens
            next is band 04, in order
          </p>
          <div className={styles.heroActions} data-reveal="settle" style={{ "--stagger": 2 } as React.CSSProperties}>
            <Link href="/prototype/tawkify/match" className={styles.pillPrimary}>
              See what a client receives
            </Link>
            <Link href="/prototype/tawkify/desk" className={styles.pillGhost}>
              Or sit at the matchmaker desk
            </Link>
          </div>
        </div>
      </Band>
    </ConceptShell>
  );
}
