"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";

const surfaces = [
  { href: "/prototype/tawkify", index: "01", label: "Story" },
  { href: "/prototype/tawkify/match", index: "02", label: "Your introduction" },
  { href: "/prototype/tawkify/desk", index: "03", label: "Matchmaker desk" },
];

// The emerald infinity mark, redrawn as two linked loops.
function Mark() {
  return (
    <svg viewBox="0 0 36 20" aria-hidden="true">
      <path
        d="M10 2.5 C 3 2.5, 3 17.5, 10 17.5 C 15 17.5, 16 10, 18 10 C 20 10, 21 2.5, 26 2.5 C 33 2.5, 33 17.5, 26 17.5 C 21 17.5, 20 10, 18 10 C 16 10, 15 2.5, 10 2.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function ConceptShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);

  // Progressive reveal: default render is the finished page; script marks the
  // shell, then one-shot intersection flags drive SETTLE and RULE.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.dataset.js = "true";
    const targets = Array.from(shell.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.in = "true";
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((target) => io.observe(target));
    return () => io.disconnect();
  }, [pathname]);

  return (
    <div ref={shellRef} className={styles.shell}>
      <a href="#tawkify-main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={`${styles.header} ${styles.onInk}`}>
        <div className={styles.headerInner}>
          <Link href="/prototype/tawkify" className={styles.wordmark}>
            <Mark />
            tawkify
          </Link>
          <span className={styles.conceptTag}>UNOFFICIAL CONCEPT</span>
          <nav className={styles.surfaceNav} aria-label="Concept surfaces">
            {surfaces.map((surface) => (
              <Link
                key={surface.href}
                href={surface.href}
                className={styles.surfaceLink}
                aria-current={pathname === surface.href ? "page" : undefined}
              >
                <span className={styles.surfaceIndex}>{surface.index}</span>
                {surface.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="tawkify-main">{children}</main>
      <footer className={`${styles.band} ${styles.onInk}`} data-ground="ink" data-tier="s">
        <div className={`${styles.bandInner} ${styles.footer}`}>
          <p className={styles.footerLine}>
            We only accept candidates we believe we can match.
          </p>
          <p className={styles.footerDisclaimer}>
            Unofficial modernization concept by{" "}
            <a href="https://fullbuild.ai">fullbuild.ai</a>, built as a job
            application artifact. Not affiliated with or endorsed by Tawkify;
            the real service lives at{" "}
            <a href="https://tawkify.com">tawkify.com</a>. Prices and contract
            terms shown are reconstructed from public reporting and are this
            concept&apos;s proposal, not Tawkify&apos;s offer. Photo plates
            mark slots for illustrative AI-generated imagery. Every person,
            file, and conversation on the client and desk surfaces is
            invented.
          </p>
        </div>
      </footer>
    </div>
  );
}
