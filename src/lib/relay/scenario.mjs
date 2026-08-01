/**
 * Relay scenario: Hollowell Power & Light, planned outage on feeder BR-7.
 * All customer-facing copy is the brand's human voice (voice.md: no em
 * dashes, no periods on headings or display strings). Machine strings that
 * render in the console are mono facts and stay clipped.
 *
 * @typedef {ReturnType<typeof createScenario>} Scenario
 */

export function createScenario() {
  const customer = {
    name: "Sam Reyes",
    account: "A-30177",
    address: "41 Brindle Row",
    phoneTail: "4417",
  };

  const event = {
    id: "EV-2231",
    feeder: "BR-7",
    kind: "Planned outage",
    day: "Tue Aug 11",
    window: "Tue Aug 11 · 09:00 to 13:00",
  };

  const ledger = [
    { id: "EV-2214", kind: "Payment reminder cycle", state: "idle" },
    { id: "EV-2231", kind: "Planned outage BR-7", state: "armed" },
    { id: "EV-2240", kind: "Storm watch digest", state: "idle" },
  ];

  const intents = [
    {
      id: "ask_duration",
      keywords: {
        long: 0.45, when: 0.35, hours: 0.4, back: 0.3, restore: 0.5,
        restored: 0.5, window: 0.35, until: 0.3, start: 0.25, end: 0.3,
      },
      phrases: [{ text: "how long", bonus: 0.3 }],
    },
    {
      id: "ask_reason",
      keywords: {
        why: 0.55, reason: 0.5, cause: 0.45, happening: 0.35, work: 0.25,
        replacing: 0.3, wrong: 0.3, point: 0.25,
      },
    },
    {
      id: "sms_optin",
      keywords: {
        text: 0.5, sms: 0.6, remind: 0.5, reminder: 0.5, reminders: 0.5,
        message: 0.35, notify: 0.4, alert: 0.4, alerts: 0.4, phone: 0.25,
      },
      phrases: [{ text: "text me", bonus: 0.25 }],
    },
    {
      id: "medical_equipment",
      keywords: {
        oxygen: 0.6, concentrator: 0.5, cpap: 0.6, bipap: 0.6, ventilator: 0.6,
        dialysis: 0.6, nebulizer: 0.55, medical: 0.5, equipment: 0.35,
        machine: 0.3, breathing: 0.4, medication: 0.45, insulin: 0.5,
        powered: 0.2,
      },
    },
    {
      id: "agent_request",
      keywords: {
        human: 0.6, person: 0.55, agent: 0.55, representative: 0.6,
        someone: 0.35, real: 0.3, speak: 0.3, talk: 0.3, manager: 0.5,
      },
    },
    {
      id: "ask_compensation",
      keywords: {
        credit: 0.55, refund: 0.55, compensation: 0.6, bill: 0.45,
        discount: 0.5, pay: 0.3, money: 0.35, compensated: 0.6,
      },
    },
    {
      id: "thanks_done",
      keywords: {
        thanks: 0.6, thank: 0.6, bye: 0.5, done: 0.5, sorted: 0.4,
        cheers: 0.55, appreciate: 0.55, great: 0.35, perfect: 0.4,
        helpful: 0.4,
      },
      phrases: [{ text: "that's all", bonus: 0.5 }],
    },
    {
      id: "greeting",
      keywords: { hi: 0.5, hello: 0.55, hey: 0.5, who: 0.4 },
      phrases: [{ text: "who is this", bonus: 0.3 }],
    },
  ];

  const answers = {
    ask_duration: [
      "The window is 9:00 to 13:00 on Tuesday August 11. Crews usually land closer to three hours than four, and if it runs past 13:00 you'll hear from us, not silence.",
    ],
    ask_reason: [
      "We're replacing the transformer that feeds Brindle Row. It's forty years old and it has started dropping voltage on cold mornings, so we're swapping it before it decides the timing for us.",
    ],
    ask_compensation: [
      "A planned outage under four hours doesn't carry a bill credit on its own. If we run long past the window, credits apply to your account automatically, no claim needed.",
    ],
    greeting: [
      "Hi, I'm Wren, Hollowell's automated assistant. I'm reaching out about planned work on Tuesday August 11 that will touch the power at 41 Brindle Row.",
    ],
  };

  const copy = {
    dialNotice: "Proactive outreach opened · event EV-2231 · channel CHAT",
    announce: [
      "Hi Sam, I'm Wren, the Hollowell Power & Light assistant. Planned work is coming to your block and we wanted you to hear it from us first, not from a dark kitchen.",
      "We're replacing the transformer that feeds Brindle Row on Tuesday August 11, so power at 41 Brindle Row will be off between 9:00 and 13:00. Reply here and I can help with timing, reminders, or anything the outage complicates.",
    ],
    optinAsk: [
      "Happy to. I have the mobile ending 4417 on your account. Want your reminders there?",
    ],
    optinYes: [
      "Done. I'll nudge you the evening before and again the moment power is back at your address.",
    ],
    optinNo: [
      "No problem, I'll keep everything right here in this thread.",
    ],
    channelNotice: "Channel moved to SMS · mobile on file ···· 4417",
    medical: [
      "That matters, and thank you for telling me. Equipment like that changes how we handle your address, and it's a decision for a person, not for me. I'm bringing a Hollowell agent into this conversation now, with everything you've told me.",
    ],
    agentRequest: [
      "Of course. Give me a moment to bring a person on, and I'll hand over everything so you don't repeat yourself.",
    ],
    fallbackClarify: [
      "I may have missed that. I can help with the outage window, why the work is happening, reminders by text, or anything medical the outage would affect.",
    ],
    fallbackHandover: [
      "I'd rather hand you to a person than guess twice. One moment.",
    ],
    closing: [
      "Anytime. I'll be in touch the evening before the work starts, and if anything changes at your end, reply here and I'll pick it up.",
    ],
  };

  /**
   * Deterministic agent-assist suggestions composed from session state.
   * @param {{ flags: {vulnerable: boolean, agentRequested: boolean}, slots: {equipment?: string, smsOptIn?: boolean} }} session
   */
  function buildSuggestedReplies(session) {
    if (session.flags.vulnerable) {
      const equipment = session.slots.equipment ?? "your medical equipment";
      return [
        `Hi Sam, this is Priya, I have Wren's notes. First thing: I'm adding the ${equipment} to our medical support register right now, so your address is flagged before any crew opens a switch.`,
        "For the window itself, most people keep a charged backup supply ready. If that's not an option for you, I can book a welfare callback before Tuesday to talk it through.",
        session.slots.smsOptIn
          ? "Your SMS alerts are already set, so you'll get a text the moment power is back at 41 Brindle Row."
          : "I can also set an SMS alert for the moment power is back at 41 Brindle Row, so you're not testing outlets.",
      ];
    }
    return [
      "Hi Sam, this is Priya, I have the whole conversation from Wren so you don't need to repeat anything. What can I take care of?",
      "The work at Brindle Row runs 9:00 to 13:00 on Tuesday August 11, and I can walk you through anything the assistant couldn't.",
      "If it helps, I can set a reminder by text for the evening before and a note the moment power is back.",
    ];
  }

  const escalations = {
    vulnerable:
      "Vulnerable customer policy: powered medical equipment at the service address",
    requested: "Customer asked for a person",
    lowConfidence: "Assistant confidence under threshold twice in a row",
  };

  return {
    brand: "Hollowell Power & Light",
    escalations,
    assistantName: "Wren",
    agentName: "Priya",
    customer,
    event,
    ledger,
    intents,
    answers,
    copy,
    buildSuggestedReplies,
  };
}

/**
 * Quick-reply chips for the phone pane, contextual to session state so the
 * demo never dead-ends. Free text always stays live beside them.
 * @param {{ mode: string, expect: string | null, answered: string[], flags: {vulnerable: boolean} }} session
 */
export function getChips(session) {
  if (session.mode === "wrapped") return [];
  if (session.mode === "human") {
    return [
      { text: "Thank you, that's a relief", intent: "thanks_done" },
      { text: "What should I do during the outage", intent: null },
    ];
  }
  if (session.expect === "optin_confirm") {
    return [
      { text: "Yes please", intent: "confirm_yes" },
      { text: "No, keep it here", intent: "confirm_no" },
    ];
  }
  const pool = [
    { text: "How long will it be out", intent: "ask_duration" },
    { text: "Why is this happening", intent: "ask_reason" },
    { text: "Can you text me a reminder", intent: "sms_optin" },
    { text: "There's an oxygen concentrator at home", intent: "medical_equipment" },
    { text: "Will I get a credit on my bill", intent: "ask_compensation" },
    { text: "Thanks, that's all I needed", intent: "thanks_done" },
  ];
  return pool
    .filter(
      (chip) => chip.intent === null || !session.answered.includes(chip.intent),
    )
    .slice(0, 4);
}

/**
 * Flow map for the console graph. Static structure; the session lights it.
 * Grid coordinates are consumed by FlowGraph.tsx.
 */
export const FLOW_NODES = [
  { id: "trigger", label: "TRIGGER", col: 0, row: 0 },
  { id: "notify", label: "DIAL OUT", col: 1, row: 0 },
  { id: "listen", label: "LISTEN", col: 2, row: 0 },
  { id: "answer", label: "ANSWER", col: 3, row: 0 },
  { id: "optin", label: "OPT IN", col: 3, row: 1 },
  { id: "policy", label: "POLICY", col: 2, row: 1 },
  { id: "handover", label: "HANDOVER", col: 1, row: 1 },
  { id: "wrap", label: "WRAP UP", col: 0, row: 1 },
];

export const FLOW_EDGES = [
  ["trigger", "notify"],
  ["notify", "listen"],
  ["listen", "answer"],
  ["answer", "listen"],
  ["listen", "optin"],
  ["optin", "listen"],
  ["listen", "policy"],
  ["policy", "handover"],
  ["listen", "handover"],
  ["handover", "wrap"],
  ["listen", "wrap"],
];
