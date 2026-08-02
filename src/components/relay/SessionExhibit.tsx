"use client";

import { useRef, useState } from "react";

import styles from "@/app/prototype/relay/relay.module.css";

/* The first of the proof block's two exhibits. The second is the run report
   directly below it, so this footage stops where that table starts: one
   conversation here, all eight branches there.

   It is a still until the reader asks for it. The annex is the author's notes
   and carries no motion verb, so nothing on this block moves on its own. That
   also keeps a 489KB file off the wire for readers who never press play,
   which is what preload="none" is doing. */

const SRC = "/prototype/relay/session.mp4";
const POSTER = "/prototype/relay/session-poster.jpg";
const SECONDS = 35;

/* The four beats the footage actually contains, named the way the tenant
   names them. This is the console reading of what the phone is showing, which
   is the same split the top of the page runs on.

   `decided` is what earns amber. The three intents are the machine resolving
   something; the Once node is a branch the author placed, so it stays quiet
   even though it is just as literal. */
const BEATS: { name: string; what: string; decided: boolean }[] = [
  {
    name: "Once, On First Time",
    what: "the announce, before anything is asked",
    decided: false,
  },
  {
    name: "ask_duration",
    what: "the window, and what happens if crews run past it",
    decided: true,
  },
  {
    name: "sms_optin",
    what: "offers the reminder against the number on file",
    decided: true,
  },
  {
    name: "medical_equipment",
    what: "the equipment slot fills and the flow hands over",
    decided: true,
  },
];

export function SessionExhibit() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function start() {
    setStarted(true);
    video.current?.play();
  }

  return (
    <div className={styles.session}>
      <div className={styles.sessionStage}>
        <video
          ref={video}
          className={styles.sessionVideo}
          src={SRC}
          poster={POSTER}
          preload="none"
          playsInline
          muted
          controls={started}
        />
        {started ? null : (
          <button
            type="button"
            className={styles.sessionPlay}
            onClick={start}
            aria-label="Play the recorded session, 35 seconds, no audio"
          >
            <span className={styles.sessionPlayInner}>
              <svg
                className={styles.sessionPlayMark}
                viewBox="0 0 12 14"
                aria-hidden="true"
              >
                <path d="M0 0 L12 7 L0 14 Z" fill="currentColor" />
              </svg>
              Play
              <span className={styles.sessionPlayMeta}>
                {SECONDS}s, no audio
              </span>
            </span>
          </button>
        )}
      </div>

      <div className={styles.sessionNote}>
        <p>
          The assistant opens before the customer asks. That is the flow&apos;s
          Once node firing on first contact, and every message after it crosses
          the intent switch to exactly one branch.
        </p>
        <p>
          Nothing is mocked. Those replies came back from the tenant while the
          recording ran, which is why the pauses between them are uneven.
        </p>

        <dl className={styles.sessionBeats}>
          {BEATS.map((beat) => (
            <div key={beat.name} className={styles.sessionBeat}>
              <dt className={beat.decided ? undefined : styles.sessionBeatQuiet}>
                {beat.name}
              </dt>
              <dd>{beat.what}</dd>
            </div>
          ))}
        </dl>

        <p className={styles.sessionHandoff}>
          One conversation here. Eight branches below, replayed against the
          same tenant and asserted line by line.
        </p>
      </div>
    </div>
  );
}
