import styles from "@/app/prototype/relay/relay.module.css";

/* The annex below the demo. Every row is a piece of Relay that exists a few
   feet up the page, named beside its equivalent in the platforms this
   category actually ships on. Mono is reserved for literal identifiers, the
   same rule the console pane follows. */

type MappingRow = {
  relay: React.ReactNode;
  cognigy: string;
  cxone: string;
  client: string;
};

function Mono({ children }: { children: React.ReactNode }) {
  return <span className={styles.annexMono}>{children}</span>;
}

const ROWS: MappingRow[] = [
  {
    relay: (
      <>
        Event ledger arms <Mono>EV-2231</Mono>, fires, assistant dials out
      </>
    ),
    cognigy: "API call into an Endpoint kicks off the flow",
    cxone: "Proactive AI Agent campaign · Personal Connection outbound",
    client:
      "Wire the client's event source (billing, outage, CRM) to the trigger",
  },
  {
    relay: (
      <>
        Flow reducer: <Mono>TRIGGER → DIAL OUT → LISTEN → ANSWER → HANDOVER →
        WRAP UP</Mono>
      </>
    ),
    cognigy: "Flow canvas: Say, Question, Logic, Code nodes",
    cxone: "Studio script routes the interaction",
    client:
      "Build flows on the canvas, drop to Code Nodes when logic outgrows drag and drop",
  },
  {
    relay: (
      <>
        Keyword scorer, confidence <Mono>0</Mono> to <Mono>0.97</Mono>,
        threshold <Mono>0.45</Mono>
      </>
    ),
    cognigy:
      "Intents trained on example sentences, confidence threshold plus reconfirmation band",
    cxone: "Omilia side: deepNLU inside miniApps",
    client:
      "Write example sentences, tune thresholds, review what missed in the transcripts",
  },
  {
    relay: "Entity extractors: phone, time, equipment terms",
    cognigy: "Slots and lexicons attached to intents",
    cxone: "Omilia miniApps each collect one thing: address, card, date",
    client:
      "Define lexicons for the client's vocabulary, attach slot fillers to questions",
  },
  {
    relay: (
      <>
        <Mono>expect: optin_confirm</Mono>, so yes or no answers the open
        question instead of re-classifying
      </>
    ),
    cognigy:
      "Question node holds the expected answer type, session Context carries state",
    cxone: "Studio variables carry state across the script",
    client:
      "Design questions so answers land in context, and confirm before acting on them",
  },
  {
    relay: "Escalation rules: medical device, two misses, ask for a person",
    cognigy: "Handover conditions on the flow",
    cxone: "Route to an ACD skill and queue",
    client:
      "Encode the client's escalation policy. Vulnerable-customer rules are policy, never model judgment",
  },
  {
    relay: "Handover packet: summary lines, slots, intents seen",
    cognigy: "Handover to Agent node passes conversation and context",
    cxone: "Screen pop on the agent desktop · Agent SDK",
    client:
      "Decide exactly what the human sees, so the customer never repeats themselves",
  },
  {
    relay: "Suggested replies at the desk, built from session state",
    cognigy: "Agent Copilot",
    cxone: "Agent Assist hub",
    client:
      "Templates from context first, generative drafting only where the client accepts the risk",
  },
  {
    relay: "Chat pane re-skins to SMS mid-conversation",
    cognigy: "One flow, many Endpoints (webchat, SMS, voice)",
    cxone: "Digital channels on one routing layer",
    client: "Same flow logic per channel, channel-specific rendering and consent",
  },
  {
    relay: "Wrap card: computed disposition, mean confidence, sentiment",
    cognigy: "Insights: transcripts and analytics",
    cxone: "Disposition and wrap-up codes on the ACD",
    client:
      "Define dispositions with ops so they can measure containment, the conversations the assistant finishes without a human",
  },
  {
    relay: (
      <>
        <Mono>15</Mono> behavioral tests on the engine, run with{" "}
        <Mono>node --test</Mono>
      </>
    ),
    cognigy: "Playbooks: scripted conversations asserting outcomes",
    cxone: "QA cycle in the release process",
    client:
      "Write conversation tests before release, fix what the QA cycle finds",
  },
  {
    relay: "Engine and scenario live in git, deterministic",
    cognigy: "Snapshots, pulled and pushed with cognigy-cli",
    cxone: "Tenant promotion dev, test, prod",
    client:
      "Keep agents in version control, promote snapshots, never hand-edit prod",
  },
];

const PROJECT_STEPS = [
  "Discovery: map the client's triggers, channels, escalation policy, and the disposition list ops actually reports on",
  "Build flows on the canvas, Code Nodes where the logic gets real",
  "Integrations: REST lookups into the client's systems from inside the flow, for account, order, outage",
  "Tune the NLU: seed example sentences, read live transcripts, fix missed intents, adjust thresholds. This loop is most of the ongoing work",
  "Wire the handover: ACD skills and queues, plus what the agent desktop shows on arrival",
  "Test with scripted conversations that assert outcomes, then fix what QA finds",
  "Ship a snapshot dev to test to prod. Production support afterward is mostly reading dialog logs, which is the same work as step 4",
];

const GLOSSARY = [
  ["ACD", "the router that hands conversations to human agents, by skill and queue"],
  [
    "NLU",
    "the layer that reads what the customer wrote, works out what they want, and pulls the details out of it",
  ],
  ["MCP", "the standard that lets an outside AI call a platform's functions as tools"],
];

export function StackMap() {
  return (
    <section className={styles.annex} aria-labelledby="annex-heading">
      <h2 id="annex-heading" className={styles.annexHeading}>
        What Relay maps to in Cognigy and CXone
      </h2>
      <p className={styles.annexLede}>
        Every piece above was built by hand, and every piece has a name in
        Cognigy, CXone and Omilia. Same row, same idea, three vocabularies.
      </p>

      <div className={styles.annexTableWrap}>
        <table className={styles.annexTable}>
          <thead>
            <tr>
              <th scope="col">In Relay</th>
              <th scope="col">Cognigy</th>
              <th scope="col">NICE CXone</th>
              <th scope="col">On a client project</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, index) => (
              <tr key={index}>
                <th scope="row" data-label="In Relay">
                  {row.relay}
                </th>
                <td data-label="Cognigy">{row.cognigy}</td>
                <td data-label="NICE CXone">{row.cxone}</td>
                <td data-label="On a client project">{row.client}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className={styles.glossary}>
        {GLOSSARY.map(([term, meaning]) => (
          <div key={term} className={styles.glossaryRow}>
            <dt>{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.annexColumns}>
        <div>
          <h3 className={styles.annexSubheading}>How a client project runs</h3>
          <ol className={styles.annexSteps}>
            {PROJECT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className={styles.annexSubheading}>
            Where this is heading, July 2026
          </h3>
          <ul className={styles.annexNotes}>
            <li>
              NiCE bought Cognigy, closing in 2025. NICE Proactive AI Agent and
              Cognigy are one platform family now, Omilia stands on its own
            </li>
            <li>
              All three expose MCP surfaces: the Cognigy MCP Server took OAuth
              in release 2026.12, CXone 26.2 connects agents to MCP servers
              without manual schema setup, and Omilia publishes MCP servers on
              GitHub
            </li>
            <li>
              The Cognigy CLI pulls a whole agent down to JSON in git. Agents
              plus config as code is how I already work every day, and the
              platforms are converging on it
            </li>
          </ul>
        </div>
      </div>

      <div className={styles.annexProof}>
        <h3 className={styles.annexSubheading}>The Cognigy column runs for real</h3>
        <p className={styles.annexProofBody}>
          This same scenario now exists as a working Cognigy agent: the flow
          built through the REST API, the eight intents trained, the medical
          lexicon filling its slot, and eight native Playbooks asserting
          intent, slot and reply text, all green. The whole tenant is
          snapshotted to a public repo you can read or restore.
        </p>
        <div className={styles.annexProofRow}>
          <a
            className={styles.annexProofLink}
            href="https://github.com/ryanportfolio/cx-lab"
            target="_blank"
            rel="noreferrer"
          >
            Read the build on GitHub
          </a>
          <span className={styles.annexProofFacts}>
            ryanportfolio/cx-lab · 8 playbooks · 8 of 8 green · 2026-08-02
          </span>
        </div>
      </div>
    </section>
  );
}
