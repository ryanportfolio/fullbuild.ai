/**
 * Relay conversational engine. Deterministic on purpose: a public portfolio
 * page gets no LLM key to abuse, and the mechanics a contact-center platform
 * screens for (intent scoring, entity extraction, slot state, escalation
 * policy, handover context) are exactly the parts worth showing. Plain .mjs so
 * node --test exercises the real module the UI imports.
 *
 * No randomness anywhere: same inputs, same session, same confidences.
 */

export const CONFIDENCE_THRESHOLD = 0.45;
export const CONFIDENCE_CEILING = 0.97;

const WORD_RE = /[a-z0-9':+]+/g;

/** @param {string} text */
export function tokenize(text) {
  return (text.toLowerCase().match(WORD_RE) ?? []).map((word) =>
    word.replace(/^'+|'+$/g, ""),
  );
}

/**
 * Weighted keyword scorer. confidence = clamp(raw / cap), where raw sums the
 * weight of every distinct matched keyword plus a bonus per whole phrase
 * found in the utterance. Honest by construction: the number is reproducible
 * arithmetic, not a vibe.
 *
 * @param {string} text
 * @param {Array<{id: string, cap?: number, keywords: Record<string, number>, phrases?: Array<{text: string, bonus: number}>}>} intents
 * @returns {Array<{id: string, confidence: number, matched: string[]}>} ranked, best first
 */
export function classify(text, intents) {
  const tokens = new Set(tokenize(text));
  const lowered = text.toLowerCase();
  const ranked = intents.map((intent) => {
    let raw = 0;
    const matched = [];
    for (const [keyword, weight] of Object.entries(intent.keywords)) {
      if (tokens.has(keyword)) {
        raw += weight;
        matched.push(keyword);
      }
    }
    for (const phrase of intent.phrases ?? []) {
      if (lowered.includes(phrase.text)) {
        raw += phrase.bonus;
        matched.push(`"${phrase.text}"`);
      }
    }
    const cap = intent.cap ?? 1;
    return {
      id: intent.id,
      confidence: Math.min(CONFIDENCE_CEILING, raw / cap),
      matched,
    };
  });
  ranked.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  return ranked;
}

const EQUIPMENT_TERMS = [
  "oxygen concentrator",
  "oxygen machine",
  "home dialysis",
  "dialysis machine",
  "medication fridge",
  "refrigerated medication",
  "feeding pump",
  "stair lift",
  "oxygen",
  "cpap",
  "bipap",
  "ventilator",
  "dialysis",
  "nebulizer",
  "insulin",
];

const AFFIRM = new Set([
  "yes", "yeah", "yep", "sure", "ok", "okay", "please", "definitely", "absolutely",
]);
const NEGATE = new Set(["no", "nope", "nah", "don't", "dont", "not"]);

const TIME_WORDS = new Set([
  "tomorrow", "tonight", "morning", "afternoon", "evening", "monday", "tuesday",
  "wednesday", "thursday", "friday", "saturday", "sunday", "weekend",
]);

/**
 * @param {string} text
 * @returns {Array<{type: string, value: string}>}
 */
export function extractEntities(text) {
  const lowered = text.toLowerCase();
  const tokens = new Set(tokenize(text));
  const entities = [];

  for (const term of EQUIPMENT_TERMS) {
    if (lowered.includes(term)) {
      entities.push({ type: "equipment", value: term });
      break; // longest term wins; the list is ordered longest first
    }
  }

  const phone = lowered.match(/\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (phone) entities.push({ type: "phone", value: phone[0] });

  const clock = lowered.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/);
  if (clock) entities.push({ type: "time", value: clock[0] });
  for (const token of tokens) {
    if (TIME_WORDS.has(token)) {
      entities.push({ type: "time", value: token });
      break;
    }
  }

  let affirmation = null;
  for (const token of tokens) {
    if (NEGATE.has(token)) affirmation = "no";
  }
  if (affirmation === null) {
    for (const token of tokens) {
      if (AFFIRM.has(token)) affirmation = "yes";
    }
  }
  if (affirmation) entities.push({ type: "affirmation", value: affirmation });

  return entities;
}

const NEGATIVE_WORDS = new Set([
  "angry", "ridiculous", "unacceptable", "worst", "annoyed", "frustrated",
  "scared", "worried", "terrible", "useless", "awful", "furious", "outrage",
]);
const POSITIVE_WORDS = new Set([
  "thanks", "thank", "great", "perfect", "appreciate", "helpful", "good",
  "relief", "wonderful", "brilliant",
]);

/**
 * Lexicon sentiment in [-1, 1]. Zero-vocabulary utterances score 0.
 * @param {string} text
 */
export function scoreSentiment(text) {
  let score = 0;
  for (const token of tokenize(text)) {
    if (NEGATIVE_WORDS.has(token)) score -= 1;
    if (POSITIVE_WORDS.has(token)) score += 1;
  }
  return Math.max(-1, Math.min(1, score / 2));
}

/**
 * Simulated network+compose latency for an outbound message. Deterministic
 * function of length so the typing indicator reflects a real pending state.
 * @param {string} text
 */
export function computeDelay(text) {
  return Math.min(1400, 420 + 14 * text.length);
}

/** @param {import("./scenario.mjs").Scenario} scenario */
export function createSession(scenario) {
  return {
    scenario,
    nodeId: "trigger",
    channel: "chat",
    mode: "bot", // bot | human | wrapped
    expect: null, // contextual slot the next inbound answers, e.g. optin_confirm
    slots: {},
    flags: { vulnerable: false, agentRequested: false },
    consecutiveMisses: 0,
    answered: [], // intent ids the bot already resolved
    reads: [], // one NLU read per inbound message
    handover: null,
    wrapup: null,
  };
}

/**
 * Run one inbound customer message through NLU and the flow. Returns the next
 * session plus ordered events for the UI to play.
 *
 * Event shapes:
 *  { type: "read", read }                       inbound decomposed
 *  { type: "reply", text, delayMs }             bot or agent-assist speech
 *  { type: "system", text }                     wire-level notice
 *  { type: "channel", to }                      channel switch
 *  { type: "handover", packet }                 human takes the line
 *  { type: "wrapup", wrapup }                   disposition ready
 *
 * @param {ReturnType<typeof createSession>} session
 * @param {string} text
 */
export function ingest(session, text) {
  const { scenario } = session;
  const ranked = classify(text, scenario.intents);
  const entities = extractEntities(text);
  const sentiment = scoreSentiment(text);
  const read = {
    text,
    ranked: ranked.slice(0, 3),
    top: ranked[0],
    entities,
    sentiment,
  };

  const next = {
    ...session,
    slots: { ...session.slots },
    flags: { ...session.flags },
    answered: [...session.answered],
    reads: [...session.reads, read],
  };
  const events = [{ type: "read", read }];

  if (next.mode === "wrapped") return { session: next, events };

  if (next.mode === "human") {
    routeHumanMode(next, read, events);
    return { session: next, events };
  }

  const affirmation = entities.find((entity) => entity.type === "affirmation");
  const equipment = entities.find((entity) => entity.type === "equipment");

  // Contextual expectation outranks open intent matching, the way a flow
  // node's own answer slot does in a flow builder. A named medical device
  // still outranks the slot: policy beats context.
  if (next.expect === "optin_confirm" && affirmation && !equipment) {
    read.resolved = affirmation.value === "yes" ? "confirm_yes" : "confirm_no";
    next.expect = null;
    next.consecutiveMisses = 0;
    if (affirmation.value === "yes") {
      next.slots.smsOptIn = true;
      next.channel = "sms";
      pushReplies(events, scenario.copy.optinYes);
      events.push({ type: "channel", to: "sms" });
      events.push({ type: "system", text: scenario.copy.channelNotice });
    } else {
      next.slots.smsOptIn = false;
      pushReplies(events, scenario.copy.optinNo);
    }
    next.nodeId = "listen";
    return { session: next, events };
  }

  // A named medical device is an escalation regardless of intent confidence.
  const topId =
    equipment || read.top.confidence >= CONFIDENCE_THRESHOLD
      ? equipment
        ? "medical_equipment"
        : read.top.id
      : null;

  if (topId === null) {
    next.consecutiveMisses += 1;
    read.resolved = "fallback";
    if (next.consecutiveMisses >= 2) {
      pushReplies(events, scenario.copy.fallbackHandover);
      escalate(next, events, scenario.escalations.lowConfidence);
    } else {
      pushReplies(events, scenario.copy.fallbackClarify);
      next.nodeId = "listen";
    }
    return { session: next, events };
  }

  next.consecutiveMisses = 0;
  read.resolved = topId;

  if (topId === "medical_equipment") {
    next.flags.vulnerable = true;
    if (equipment) next.slots.equipment = equipment.value;
    next.nodeId = "policy";
    pushReplies(events, scenario.copy.medical);
    escalate(next, events, scenario.escalations.vulnerable);
    return { session: next, events };
  }

  if (topId === "agent_request") {
    next.flags.agentRequested = true;
    pushReplies(events, scenario.copy.agentRequest);
    escalate(next, events, scenario.escalations.requested);
    return { session: next, events };
  }

  if (topId === "sms_optin") {
    next.expect = "optin_confirm";
    next.nodeId = "optin";
    next.answered.push(topId);
    pushReplies(events, scenario.copy.optinAsk);
    return { session: next, events };
  }

  if (topId === "thanks_done") {
    next.answered.push(topId);
    pushReplies(events, scenario.copy.closing);
    next.wrapup = buildWrapup(next);
    next.mode = "wrapped";
    next.nodeId = "wrap";
    events.push({ type: "wrapup", wrapup: next.wrapup });
    return { session: next, events };
  }

  const answer = scenario.answers[topId];
  if (answer) {
    next.answered.push(topId);
    next.nodeId = "answer";
    pushReplies(events, answer);
    return { session: next, events };
  }

  // Known intent without a scripted answer behaves as a single miss.
  next.consecutiveMisses += 1;
  read.resolved = "fallback";
  pushReplies(events, scenario.copy.fallbackClarify);
  return { session: next, events };
}

function routeHumanMode(next, read, events) {
  // Agent assist keeps reading after handover; it just stops speaking.
  if (
    read.top.confidence >= CONFIDENCE_THRESHOLD &&
    read.top.id === "thanks_done"
  ) {
    read.resolved = "thanks_done";
    next.wrapup = buildWrapup(next);
    events.push({ type: "wrapup", wrapup: next.wrapup });
  }
}

function pushReplies(events, replies) {
  for (const text of replies) {
    events.push({ type: "reply", text, delayMs: computeDelay(text) });
  }
}

function escalate(next, events, reason) {
  next.mode = "human";
  next.nodeId = "handover";
  next.handover = buildHandoverPacket(next, reason);
  events.push({ type: "handover", packet: next.handover });
}

/**
 * Everything the human needs so the customer never repeats themselves. The
 * whole packet is derived from session state; nothing is invented.
 * @param {ReturnType<typeof createSession>} session
 * @param {string} reason
 */
export function buildHandoverPacket(session, reason) {
  const { scenario } = session;
  const intentsSeen = [
    ...new Set(
      session.reads
        .map((read) => read.resolved ?? read.top.id)
        .filter((id) => id !== "fallback"),
    ),
  ];
  const summary = [
    `Customer ${scenario.customer.name} · account ${scenario.customer.account}`,
    `Service address ${scenario.customer.address}`,
    `Outage ${scenario.event.window}`,
    `Channel ${session.channel.toUpperCase()} · SMS opt-in ${
      session.slots.smsOptIn === undefined
        ? "not raised"
        : session.slots.smsOptIn
          ? "confirmed"
          : "declined"
    }`,
    session.slots.equipment
      ? `Equipment declared: ${session.slots.equipment}`
      : null,
    intentsSeen.length ? `Intents this call: ${intentsSeen.join(", ")}` : null,
  ].filter(Boolean);

  return {
    reason,
    agentName: scenario.agentName,
    summary,
    suggestedReplies: scenario.buildSuggestedReplies(session),
  };
}

/** @param {ReturnType<typeof createSession>} session */
export function buildWrapup(session) {
  const { scenario } = session;
  const reads = session.reads;
  const confidences = reads.map((read) => read.top.confidence);
  const meanConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0;
  const disposition = [];
  disposition.push("Planned outage notice acknowledged");
  if (session.flags.vulnerable) disposition.push("Medical support register updated");
  if (session.slots.smsOptIn) disposition.push("SMS alerts enabled");
  if (session.flags.vulnerable) disposition.push(`Welfare callback before ${scenario.event.day}`);

  return {
    disposition,
    handledBy: session.mode === "human" || session.handover ? "assistant + agent" : "assistant",
    inboundCount: reads.length,
    meanConfidence,
    sentiment:
      reads.reduce((sum, read) => sum + read.sentiment, 0) /
      Math.max(1, reads.length),
  };
}

/**
 * Autoplayed opening: the trigger fires and the assistant dials out.
 * @param {import("./scenario.mjs").Scenario} scenario
 */
export function openingEvents(scenario) {
  return [
    { type: "system", text: scenario.copy.dialNotice },
    ...scenario.copy.announce.map((text) => ({
      type: "reply",
      text,
      delayMs: computeDelay(text),
    })),
  ];
}
