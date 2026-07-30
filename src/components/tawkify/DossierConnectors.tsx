"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/prototype/tawkify/tawkify.module.css";

type Segment = { x1: number; y1: number; x2: number; y2: number };

// Connector keylines between a client's stated non-negotiable and the
// candidate's matching attribute. Renders only at >=1200px; below that the
// paired rows stack and communicate the pairing on their own. No-JS drops
// the SVG entirely. Endpoints are read from getBoundingClientRect in one
// batched pass per resize, then written once.
export function DossierConnectors({ containerId, pairIds }: { containerId: string; pairIds: string[] }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const frame = useRef(0);

  useEffect(() => {
    function measure() {
      const container = document.getElementById(containerId);
      if (!container || window.innerWidth < 1200) {
        setSegments([]);
        return;
      }
      const base = container.getBoundingClientRect();
      const next: Segment[] = [];
      for (const id of pairIds) {
        const left = container.querySelector(`[data-pair-left='${id}']`);
        const right = container.querySelector(`[data-pair-right='${id}']`);
        if (!left || !right) continue;
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        next.push({
          x1: a.right - base.left + 8,
          y1: a.top + a.height / 2 - base.top,
          x2: b.left - base.left - 8,
          y2: b.top + b.height / 2 - base.top,
        });
      }
      setSegments(next);
    }
    function onResize() {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    }
    measure();
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame.current);
    };
  }, [containerId, pairIds]);

  if (!segments.length) return null;
  return (
    <svg className={styles.connectorSvg} aria-hidden="true">
      {segments.map((segment, index) => (
        <line key={index} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} />
      ))}
    </svg>
  );
}
