"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/prototype/relay/relay.module.css";

export type Message = {
  id: string;
  from: "assistant" | "agent" | "customer" | "system";
  text: string;
};

type Chip = { text: string; intent: string | null };

export function PhonePane({
  brand,
  phoneTail,
  channel,
  messages,
  typing,
  wrapped,
  chips,
  onSend,
}: {
  brand: string;
  phoneTail: string;
  channel: "chat" | "sms";
  messages: Message[];
  typing: boolean;
  wrapped: boolean;
  chips: Chip[];
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, typing]);

  const submit = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  let agentIntroduced = false;

  return (
    <section
      className={channel === "sms" ? `${styles.phone} ${styles.phoneSms}` : styles.phone}
      aria-label="Customer phone"
    >
      <header className={styles.phoneHeader}>
        <span className={styles.phoneBrand}>
          {channel === "sms" ? `${brand} · ···· ${phoneTail}` : brand}
        </span>
        <span className={styles.channelChip}>
          {channel === "sms" ? "SMS" : "CHAT"}
        </span>
      </header>

      <div
        ref={threadRef}
        className={styles.thread}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.map((message) => {
          if (message.from === "system") {
            return (
              <p key={message.id} className={styles.systemLine}>
                {message.text}
              </p>
            );
          }
          const showAgentTag = message.from === "agent" && !agentIntroduced;
          if (message.from === "agent") agentIntroduced = true;
          return (
            <div
              key={message.id}
              className={
                message.from === "customer"
                  ? `${styles.bubbleRow} ${styles.bubbleRowOut}`
                  : styles.bubbleRow
              }
            >
              {showAgentTag ? (
                <span className={styles.agentTag}>Person on the line</span>
              ) : null}
              <p
                className={[
                  styles.bubble,
                  message.from === "customer"
                    ? styles.bubbleCustomer
                    : message.from === "agent"
                      ? styles.bubbleAgent
                      : styles.bubbleAssistant,
                ].join(" ")}
              >
                {message.text}
              </p>
            </div>
          );
        })}
        {typing ? (
          <p
            className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.typing}`}
            aria-label="Reply being written"
          >
            <span />
            <span />
            <span />
          </p>
        ) : null}
      </div>

      {chips.length > 0 && !wrapped ? (
        <div className={styles.chipRow} role="group" aria-label="Quick replies">
          {chips.map((chip) => (
            <button
              key={chip.text}
              type="button"
              className={styles.quickChip}
              onClick={() => onSend(chip.text)}
            >
              {chip.text}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          id="relay-composer"
          type="text"
          className={styles.input}
          placeholder={wrapped ? "Conversation closed" : "Write a reply"}
          aria-label="Write a reply"
          value={draft}
          disabled={wrapped}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={wrapped || !draft.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}
