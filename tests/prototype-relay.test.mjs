import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONFIDENCE_THRESHOLD,
  classify,
  computeDelay,
  createSession,
  extractEntities,
  ingest,
  openingEvents,
  scoreSentiment,
  tokenize,
} from "../src/lib/relay/engine.mjs";
import { createScenario, getChips } from "../src/lib/relay/scenario.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const scenario = createScenario();

const top = (text) => classify(text, scenario.intents)[0];

test("NLU routes the core utterances to the right intents", () => {
  assert.equal(top("How long will the power be out").id, "ask_duration");
  assert.equal(top("Why is this happening").id, "ask_reason");
  assert.equal(top("Can you text me a reminder").id, "sms_optin");
  assert.equal(top("Get me a real person").id, "agent_request");
  assert.equal(top("Will I get a credit on my bill").id, "ask_compensation");
  assert.equal(top("My mother uses an oxygen concentrator").id, "medical_equipment");
  assert.equal(top("Thanks, that's all I needed").id, "thanks_done");
  for (const text of [
    "How long will the power be out",
    "Can you text me a reminder",
    "My mother uses an oxygen concentrator",
  ]) {
    assert.ok(top(text).confidence >= CONFIDENCE_THRESHOLD, text);
  }
});

test("Confidence is honest arithmetic: gibberish stays under threshold", () => {
  const ranked = classify("purple monkey dishwasher", scenario.intents);
  assert.ok(ranked[0].confidence < CONFIDENCE_THRESHOLD);
});

test("Entity extraction finds equipment, phone, time, and affirmation", () => {
  const entities = extractEntities(
    "yes, call 555 301 4417 tomorrow, the oxygen concentrator matters",
  );
  const byType = Object.fromEntries(entities.map((e) => [e.type, e.value]));
  assert.equal(byType.equipment, "oxygen concentrator");
  assert.equal(byType.phone, "555 301 4417");
  assert.equal(byType.time, "tomorrow");
  assert.equal(byType.affirmation, "yes");
});

test("Sentiment lexicon scores both poles and clamps", () => {
  assert.ok(scoreSentiment("this is ridiculous and unacceptable") < 0);
  assert.ok(scoreSentiment("thank you, that is a relief") > 0);
  assert.equal(scoreSentiment("the transformer hums"), 0);
});

test("Medical equipment trips the vulnerable-customer policy handover", () => {
  let session = createSession(scenario);
  ({ session } = ingest(session, "There's an oxygen concentrator at home"));
  assert.equal(session.mode, "human");
  assert.equal(session.flags.vulnerable, true);
  assert.equal(session.slots.equipment, "oxygen concentrator");
  assert.ok(session.handover);
  assert.match(session.handover.reason, /medical/i);
  assert.ok(
    session.handover.summary.some((line) => line.includes("oxygen concentrator")),
  );
  assert.equal(session.handover.suggestedReplies.length, 3);
  assert.match(session.handover.suggestedReplies[0], /medical support register/);

  // The close in human mode still reaches the WRAP UP node.
  ({ session } = ingest(session, "Thank you, that's a relief"));
  assert.ok(session.wrapup);
  assert.equal(session.nodeId, "wrap");
});

test("Two consecutive low-confidence reads hand the line to a human", () => {
  let session = createSession(scenario);
  let events;
  ({ session, events } = ingest(session, "purple monkey dishwasher"));
  assert.equal(session.mode, "bot");
  assert.ok(events.some((event) => event.type === "reply"));
  ({ session, events } = ingest(session, "quantum spaghetti forever"));
  assert.equal(session.mode, "human");
  assert.match(session.handover.reason, /confidence/i);
});

test("SMS opt-in fills the slot and switches the channel", () => {
  let session = createSession(scenario);
  let events;
  ({ session } = ingest(session, "Can you text me a reminder"));
  assert.equal(session.expect, "optin_confirm");
  ({ session, events } = ingest(session, "Yes please"));
  assert.equal(session.slots.smsOptIn, true);
  assert.equal(session.channel, "sms");
  assert.ok(events.some((event) => event.type === "channel" && event.to === "sms"));
});

test("Policy beats context: naming a device mid opt-in still escalates", () => {
  let session = createSession(scenario);
  ({ session } = ingest(session, "Can you text me a reminder"));
  ({ session } = ingest(session, "Yes, but there's a cpap machine here too"));
  assert.equal(session.mode, "human");
  assert.equal(session.flags.vulnerable, true);
});

test("Thanks in bot mode wraps up with computed, sourced numbers", () => {
  let session = createSession(scenario);
  ({ session } = ingest(session, "How long will the power be out"));
  ({ session } = ingest(session, "Thanks, that's all I needed"));
  assert.equal(session.mode, "wrapped");
  assert.ok(session.wrapup);
  assert.equal(session.wrapup.inboundCount, 2);
  assert.ok(session.wrapup.meanConfidence > 0 && session.wrapup.meanConfidence <= 0.97);
  assert.ok(session.wrapup.disposition.includes("Planned outage notice acknowledged"));
});

test("Handover packet spares the customer from repeating themselves", () => {
  let session = createSession(scenario);
  ({ session } = ingest(session, "How long will the power be out"));
  ({ session } = ingest(session, "Can you text me a reminder"));
  ({ session } = ingest(session, "Yes please"));
  ({ session } = ingest(session, "I want to talk to a human agent"));
  assert.equal(session.mode, "human");
  const summaryText = session.handover.summary.join("\n");
  assert.match(summaryText, /Sam Reyes/);
  assert.match(summaryText, /41 Brindle Row/);
  assert.match(summaryText, /SMS opt-in confirmed/);
  assert.match(summaryText, /ask_duration/);
});

test("Chips never dead-end and drop answered intents", () => {
  let session = createSession(scenario);
  assert.ok(getChips(session).length >= 3);
  ({ session } = ingest(session, "How long will the power be out"));
  assert.ok(!getChips(session).some((chip) => chip.intent === "ask_duration"));
  ({ session } = ingest(session, "There's an oxygen concentrator at home"));
  assert.ok(getChips(session).length > 0); // human mode still offers replies
  session = { ...session, mode: "wrapped" };
  assert.equal(getChips(session).length, 0);
});

test("Opening events dial out with deterministic latency", () => {
  const events = openingEvents(scenario);
  assert.equal(events[0].type, "system");
  const replies = events.filter((event) => event.type === "reply");
  assert.equal(replies.length, 2);
  for (const reply of replies) {
    assert.equal(reply.delayMs, computeDelay(reply.text));
    assert.ok(reply.delayMs <= 1400);
  }
});

test("Tokenizer strips punctuation without eating contractions", () => {
  assert.deepEqual(tokenize("Don't stop, it's 9:00am!"), [
    "don't",
    "stop",
    "it's",
    "9:00am",
  ]);
});

test("Relay is discoverable and ships its contract", async () => {
  const [directory, page, app, styles] = await Promise.all([
    read("public/prototype/index.html"),
    read("src/app/prototype/relay/page.tsx"),
    read("src/components/relay/RelayApp.tsx"),
    read("src/app/prototype/relay/relay.module.css"),
  ]);

  assert.equal((directory.match(/href="\/prototype\/relay"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">11<\/span>[\s\S]*?<h2>Relay<\/h2>/);
  assert.match(page, /Relay/);
  assert.match(app, /createSession/);
  assert.match(styles, /Palette/);
  assert.match(styles, /Motion verbs/);
  assert.match(styles, /Signature/);
});

test("The annex maps every Relay mechanism to its platform equivalent", async () => {
  const [annex, app, styles] = await Promise.all([
    read("src/components/relay/StackMap.tsx"),
    read("src/components/relay/RelayApp.tsx"),
    read("src/app/prototype/relay/relay.module.css"),
  ]);

  assert.match(app, /<StackMap \/>/);
  for (const platform of ["Cognigy", "NICE CXone", "Omilia", "On a client project"]) {
    assert.match(annex, new RegExp(platform));
  }
  // Every mechanism the demo shows has a row, so the annex cannot drift
  // away from the engine it describes.
  for (const mechanism of [
    "Event ledger",
    "Flow reducer",
    "Keyword scorer",
    "Entity extractors",
    "optin_confirm",
    "Escalation rules",
    "Handover packet",
    "Suggested replies",
    "SMS mid-conversation",
    "Wrap card",
  ]) {
    assert.ok(annex.includes(mechanism), `annex is missing ${mechanism}`);
  }
  // The table restacks on a phone instead of scrolling sideways.
  assert.match(annex, /data-label=/);
  assert.match(styles, /content: attr\(data-label\)/);
  assert.match(annex, /<ProofLedger \/>/);
  // Column headings stay readable while the table passes under them, and a
  // collapsed border would not travel with them.
  assert.match(styles, /position: sticky/);
  assert.doesNotMatch(styles, /thead th \{[^}]*border-bottom:/);
});

// Ground truth from playbookRunResults.json in ryanportfolio/cx-lab, the
// 2026-08-02 run of `cognigy run playbooks`. If the ledger on the page ever
// stops reconciling to these, the page is claiming a run that did not happen.
const RUN = { playbooks: 8, steps: 16, asserts: 32, opener: 2 };

test("The proof ledger reconciles to the run it reports", async () => {
  const source = await read("src/components/relay/ProofLedger.tsx");

  const rows = source.match(/\n {4}id: "relay-\d\d",/g) ?? [];
  assert.equal(rows.length, RUN.playbooks, "row count drifted from the run");

  const assertLists = source.match(/asserts: \[[^\]]*\]/g) ?? [];
  assert.equal(assertLists.length, RUN.playbooks);
  const probeAsserts = assertLists.reduce(
    (total, list) => total + (list.match(/"/g) ?? []).length / 2,
    0,
  );

  // Two per opener, because every playbook asserts the announce before it
  // probes its branch. This is the arithmetic the footer prints.
  assert.equal(
    probeAsserts + RUN.playbooks * RUN.opener,
    RUN.asserts,
    "the ledger's assert marks no longer add up to the run's 32",
  );
  assert.equal(RUN.playbooks * 2, RUN.steps);
  assert.match(source, /const OPENER = \{ utterance: "Hi, who is this", asserts: 2 \}/);

  // Every printed total is derived, including the verdict. A hard-coded zero
  // would let the page keep claiming a clean run after a dirty one.
  assert.match(source, /ROWS\.reduce\(/);
  assert.match(source, /const STEPS = ROWS\.length \* 2/);
  assert.match(source, /const FAILED =\r?\n\s+ROWS\.reduce\(/);
  assert.doesNotMatch(source, /<dd>0<\/dd>/);

  // The medical row's offsets are load-bearing: they slice the utterance, so
  // if they drift the wrong words get marked on the page.
  const medical = source.match(
    /utterance: "(There's an oxygen concentrator at home)",\r?\n\s+resolved: "medical_equipment",\r?\n\s+span: \[(\d+), (\d+)\]/,
  );
  assert.ok(medical, "the medical row lost its span");
  const [, utterance, start, end] = medical;
  assert.equal(
    utterance.slice(Number(start), Number(end)),
    "oxygen concentrator",
    "the span no longer cuts the phrase the slot filler caught",
  );
  assert.match(source, /trip: true/);

  // Each row links to its own playbook file, so the id and the file it points
  // at have to agree or the link lands on a 404.
  const pairs = [...source.matchAll(/id: "(relay-\d\d)",\r?\n\s+file: "([^"]+)"/g)];
  assert.equal(pairs.length, RUN.playbooks);
  for (const [, id, file] of pairs) {
    assert.ok(file.startsWith(`${id}-`), `${file} does not belong to ${id}`);
    assert.ok(file.endsWith(".json"), `${file} is not a playbook definition`);
  }

  // The repo root is written once and the def path derives from it.
  assert.equal(
    (source.match(/https:\/\/github\.com\/ryanportfolio\/cx-lab/g) ?? []).length,
    1,
  );
});

// The annex quotes its own test count back to the reader. Counting the suite
// here means the number cannot rot the next time a case is added: this test
// fails until the page is corrected.
test("The annex quotes the real size of this suite", async () => {
  const [annex, suite] = await Promise.all([
    read("src/components/relay/StackMap.tsx"),
    read("tests/prototype-relay.test.mjs"),
  ]);
  const actual = (suite.match(/^test\(/gm) ?? []).length;
  const claimed = Number(
    (annex.match(/<Mono>(\d+)<\/Mono> tests on the engine/) ?? [])[1],
  );
  assert.equal(claimed, actual, `annex says ${claimed} tests, suite has ${actual}`);
});

test("Copy honors the voice bans: no em dashes, no Math.random", async () => {
  const files = await Promise.all([
    read("src/lib/relay/engine.mjs"),
    read("src/lib/relay/scenario.mjs"),
    read("src/components/relay/RelayApp.tsx"),
    read("src/components/relay/PhonePane.tsx"),
    read("src/components/relay/ConsolePane.tsx"),
    read("src/components/relay/FlowGraph.tsx"),
    read("src/components/relay/StackMap.tsx"),
    read("src/components/relay/ProofLedger.tsx"),
    read("src/components/relay/SessionExhibit.tsx"),
  ]);
  for (const content of files) {
    assert.ok(!content.includes("—"), "em dash found");
    assert.ok(!content.includes("Math.random"), "unseeded randomness found");
  }
});

test("The session exhibit ships the file it points at, and stays still", async () => {
  const exhibit = await read("src/components/relay/SessionExhibit.tsx");

  // Both assets have to exist, or the block renders a broken poster over a
  // dead play button and the page's whole closing argument is a 404.
  for (const [, path] of exhibit.matchAll(/"(\/prototype\/relay\/[^"]+)"/g)) {
    await stat(join(process.cwd(), "public", path));
  }

  // The annex carries no motion verb: nothing here may start on its own.
  assert.match(exhibit, /preload="none"/);
  assert.doesNotMatch(exhibit, /\bautoPlay\b/);
  assert.doesNotMatch(exhibit, /\bloop\b/);

  // The stated length has to match the file the reader actually gets.
  const claimed = Number((exhibit.match(/const SECONDS = (\d+)/) ?? [])[1]);
  const probed = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      "public/prototype/relay/session.mp4",
    ],
    { encoding: "utf8" },
  );
  assert.ok(
    Math.abs(Number(probed) - claimed) < 1,
    `exhibit says ${claimed}s, file is ${Number(probed).toFixed(2)}s`,
  );

  // No audio track, which is what the play control promises the reader.
  const streams = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      "public/prototype/relay/session.mp4",
    ],
    { encoding: "utf8" },
  );
  assert.doesNotMatch(streams, /audio/);
});
