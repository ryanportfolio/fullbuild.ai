"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeDelay,
  createSession,
  ingest,
  openingEvents,
} from "@/lib/relay/engine.mjs";
import { createScenario, getChips } from "@/lib/relay/scenario.mjs";
import { PhonePane, type Message } from "@/components/relay/PhonePane";
import { ConsolePane } from "@/components/relay/ConsolePane";
import { StackMap } from "@/components/relay/StackMap";
import styles from "@/app/prototype/relay/relay.module.css";

type Session = ReturnType<typeof createSession>;
type EngineEvent = ReturnType<typeof ingest>["events"][number];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

let messageSeq = 0;
const nextId = () => `m${++messageSeq}`;

export function RelayApp() {
  const [scenario] = useState(() => createScenario());
  const [session, setSession] = useState<Session>(() =>
    createSession(scenario),
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eventFired, setEventFired] = useState(false);
  // Channel, handover and wrapup exist on the session the instant ingest
  // returns; these mirrors advance only when playback reaches the event, so
  // the console never spoils a beat the phone has not received yet.
  const [uiChannel, setUiChannel] = useState<"chat" | "sms">("chat");
  const [uiHandover, setUiHandover] = useState<Session["handover"]>(null);
  const [uiWrapup, setUiWrapup] = useState<Session["wrapup"]>(null);
  const [visited, setVisited] = useState<string[]>(["trigger"]);
  const [pulseKey, setPulseKey] = useState(0);
  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const mounted = useRef(true);
  const reduced = useRef(false);

  useEffect(() => {
    mounted.current = true;
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (uiWrapup) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [uiWrapup]);

  useEffect(() => {
    setVisited((prior) => {
      // The medical branch passes through POLICY and lands on HANDOVER in
      // one ingest; light the intermediate node too.
      const additions = [session.nodeId];
      if (session.flags.vulnerable) additions.push("policy");
      const fresh = additions.filter((node) => !prior.includes(node));
      return fresh.length ? [...prior, ...fresh] : prior;
    });
  }, [session.nodeId, session.flags.vulnerable]);

  const addMessage = useCallback((message: Omit<Message, "id">) => {
    setMessages((prior) => [...prior, { ...message, id: nextId() }]);
  }, []);

  const playEvents = useCallback(
    async (events: EngineEvent[]) => {
      setBusy(true);
      for (const event of events) {
        if (!mounted.current) return;
        if (event.type === "reply") {
          setTyping(true);
          await sleep(reduced.current ? 60 : event.delayMs);
          if (!mounted.current) return;
          setTyping(false);
          setPulseKey((value) => value + 1);
          addMessage({ from: "assistant", text: event.text });
        } else if (event.type === "system") {
          addMessage({ from: "system", text: event.text });
        } else if (event.type === "channel") {
          setUiChannel(event.to);
        } else if (event.type === "handover") {
          setUiHandover(event.packet);
          addMessage({
            from: "system",
            text: `${scenario.agentName} joined the conversation · person`,
          });
        } else if (event.type === "wrapup") {
          setUiWrapup(event.wrapup);
        }
      }
      if (mounted.current) setBusy(false);
    },
    [addMessage, scenario.agentName],
  );

  // The proactive beat: the armed ledger event fires, then the assistant
  // dials out. Reduced motion collapses the waits, never the content.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(reduced.current ? 60 : 900);
      if (cancelled || !mounted.current) return;
      setEventFired(true);
      setSession((prior) => ({ ...prior, nodeId: "notify" }));
      await sleep(reduced.current ? 60 : 500);
      if (cancelled || !mounted.current) return;
      await playEvents(openingEvents(scenario));
      if (cancelled || !mounted.current) return;
      setSession((prior) => ({ ...prior, nodeId: "listen" }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCustomer = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || sessionRef.current.mode === "wrapped") return;
      setPulseKey((value) => value + 1);
      addMessage({ from: "customer", text: trimmed });
      const { session: next, events } = ingest(sessionRef.current, trimmed);
      setSession(next);
      void playEvents(events);
    },
    [addMessage, busy, playEvents],
  );

  const sendAgent = useCallback(
    async (text: string) => {
      if (busy || !uiHandover) return;
      setUsedSuggestions((prior) => [...prior, text]);
      setBusy(true);
      setTyping(true);
      await sleep(reduced.current ? 60 : computeDelay(text));
      if (!mounted.current) return;
      setTyping(false);
      setPulseKey((value) => value + 1);
      addMessage({ from: "agent", text });
      setBusy(false);
    },
    [addMessage, busy, uiHandover],
  );

  const lastRead = session.reads.length
    ? session.reads[session.reads.length - 1]
    : null;
  const outboundCount = messages.filter(
    (message) => message.from === "assistant" || message.from === "agent",
  ).length;
  const meanConfidence = session.reads.length
    ? session.reads.reduce((sum, read) => sum + read.top.confidence, 0) /
      session.reads.length
    : null;

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#relay-composer">
        Skip to the reply box
      </a>
      <div className={styles.prototypeBar}>
        <strong>Contact center prototype</strong>
        <span>Fictional utility // deterministic NLU, no LLM calls</span>
        <a href="/">fullbuild.ai ↗</a>
      </div>

      <header className={styles.masthead}>
        <span className={styles.wordmark}>Relay</span>
        <span className={styles.mastheadSub}>
          Proactive outreach, both ends of the wire
        </span>
      </header>

      <main className={styles.duplex}>
        <PhonePane
          brand={scenario.brand}
          phoneTail={scenario.customer.phoneTail}
          channel={uiChannel}
          messages={messages}
          typing={typing}
          wrapped={session.mode === "wrapped" || Boolean(uiWrapup)}
          chips={busy || uiWrapup ? [] : getChips(session)}
          onSend={sendCustomer}
        />

        <div className={styles.wire} aria-hidden="true">
          {pulseKey > 0 ? <span key={pulseKey} className={styles.pulse} /> : null}
        </div>

        <ConsolePane
          scenario={scenario}
          eventFired={eventFired}
          activeNode={session.nodeId}
          visited={visited}
          lastRead={lastRead}
          channel={uiChannel}
          mode={session.mode}
          handover={uiHandover}
          wrapup={uiWrapup}
          usedSuggestions={usedSuggestions}
          onSendAgent={sendAgent}
          inboundCount={session.reads.length}
          outboundCount={outboundCount}
          meanConfidence={meanConfidence}
          elapsed={elapsed}
        />
      </main>

      <StackMap />
    </div>
  );
}
