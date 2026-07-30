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

export function ConceptShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);

  // Progressive reveal: mark the shell as JS-capable, then flip one-shot
  // intersection flags. Without this effect the page renders finished.
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
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((target) => io.observe(target));
    return () => io.disconnect();
  }, [pathname]);

  return (
    <div ref={shellRef} className={styles.shell}>
      <a href="#tawkify-main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.topbar}>
        <Link href="/prototype/tawkify" className={styles.wordmark}>
          tawkify
        </Link>
        <span className={`${styles.mono} ${styles.conceptTag}`}>unofficial concept</span>
        <nav className={styles.surfaceNav} aria-label="Concept surfaces">
          {surfaces.map((surface) => (
            <Link
              key={surface.href}
              href={surface.href}
              className={styles.surfaceLink}
              aria-current={pathname === surface.href ? "page" : undefined}
            >
              <span className={styles.mono}>{surface.index}</span>
              {surface.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="tawkify-main">{children}</main>
      <div className={styles.sheet}>
        <footer className={styles.footer}>
          <p className={styles.footerNote}>
            Unofficial modernization concept by{" "}
            <a href="https://fullbuild.ai">fullbuild.ai</a>, built as a job
            application artifact. Not affiliated with or endorsed by Tawkify.
            The real service lives at{" "}
            <a href="https://tawkify.com">tawkify.com</a>. All people, files,
            and conversations on the client and desk surfaces are invented.
          </p>
        </footer>
      </div>
    </div>
  );
}
