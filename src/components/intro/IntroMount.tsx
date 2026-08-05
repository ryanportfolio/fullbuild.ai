"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { releaseIntroHold } from "@/lib/introHold";

/*
 * THE GATE. Small on purpose: it decides whether the intro exists at all, and it is the
 * only file on the homepage's server graph that knows the intro is there.
 *
 * It is a client component because ssr: false is unsupported inside a Server Component in
 * the App Router, so the boundary has to be here. That is convenient rather than merely
 * necessary: gating in this file means a visitor who is gated off never downloads the
 * overlay chunk, let alone the scene chunk behind it.
 */
const HomepageIntro = dynamic(() => import("./HomepageIntro"), { ssr: false });

export default function IntroMount() {
  /*
   * Undecided until the effect runs, so the intro never mounts on a frame where the
   * preference has not been read yet.
   */
  const [play, setPlay] = useState(false);
  /*
   * Once the intro has handed the page over it is finished for this load, and finished
   * means gone: the overlay, its canvas, its listeners and its global hook all leave
   * together. This flag is one way on purpose.
   */
  const [done, setDone] = useState(false);
  const onDone = useCallback(() => setDone(true), []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    /*
     * EVERY NO IS ALSO A RELEASE. The pre-paint script latched the page's own opening act
     * behind this component, so the three ways of deciding there will be no intro are also
     * the three ways of leaving the homepage's entrance waiting on a signal that will never
     * be sent. Reduced motion never set the latch (the script skips under the same query) and
     * the guard lifts it on its own, so this is belt and braces for two of them and the whole
     * mechanism for the history-cache restore. Idempotent either way.
     */

    /*
     * REDUCED MOTION GETS NO OVERLAY AT ALL. Not a shortened film, not a static mark that
     * fades: the server-rendered homepage, instantly. A cover that has to fade is a cover
     * that can strand, and for the reader who asked for less motion the plain page is
     * strictly the better outcome. The pre-paint script skips under the same query, so
     * there is no cover to lift either.
     */
    if (query.matches) {
      releaseIntroHold();
      return;
    }

    /*
     * TOO LATE IS ALSO A NO. The pre-paint cover carries a guard that uncovers the page after
     * four seconds so a visitor whose JS runs but whose React never hydrates is not left
     * staring at a blank ground. On a slow enough device that guard fires long before
     * hydration does, and the reader has already read the finished homepage by the time this
     * component exists. Mounting the intro then is worse than not mounting it: a loading film
     * for a page they finished reading, and then a warp away from it.
     *
     * So the guard firing ends it. An intro that missed its own opening is not an intro.
     */
    if ((window as unknown as { __introExpired?: number }).__introExpired) {
      releaseIntroHold();
      return;
    }
    if (!document.documentElement.hasAttribute("data-intro-pending")) {
      releaseIntroHold();
      return;
    }

    /*
     * A RESTORE IS NOT A LOAD. Coming back through the history cache returns a page that is
     * already in memory, fully scrolled and fully drawn; replaying the intro over it would
     * throw away the reader's place to show them something they just watched.
     */
    let restored = false;
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        restored = true;
        setPlay(false);
        releaseIntroHold();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    if (!restored) setPlay(true);

    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (!play || done) return null;

  return <HomepageIntro onDone={onDone} />;
}
