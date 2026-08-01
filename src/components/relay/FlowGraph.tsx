"use client";

import { FLOW_EDGES, FLOW_NODES } from "@/lib/relay/scenario.mjs";
import styles from "@/app/prototype/relay/relay.module.css";

const NODE_W = 92;
const NODE_H = 30;
const COL_STEP = 112;
const ROW_STEP = 58;
const PAD = 6;

const center = (node: { col: number; row: number }) => ({
  x: PAD + node.col * COL_STEP + NODE_W / 2,
  y: PAD + node.row * ROW_STEP + NODE_H / 2,
});

export function FlowGraph({
  activeNode,
  visited,
}: {
  activeNode: string;
  visited: string[];
}) {
  const byId = new Map(FLOW_NODES.map((node) => [node.id, node]));

  return (
    <svg
      className={styles.flowSvg}
      viewBox={`0 0 ${PAD * 2 + 4 * COL_STEP - (COL_STEP - NODE_W)} ${PAD * 2 + ROW_STEP + NODE_H}`}
      role="img"
      aria-label={`Conversation flow, current node ${activeNode}`}
    >
      {FLOW_EDGES.map(([from, to]) => {
        const a = center(byId.get(from)!);
        const b = center(byId.get(to)!);
        const lit = visited.includes(from) && visited.includes(to);
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={lit ? `${styles.flowEdge} ${styles.flowEdgeLit}` : styles.flowEdge}
          />
        );
      })}
      {FLOW_NODES.map((node) => {
        const active = node.id === activeNode;
        const seen = visited.includes(node.id);
        return (
          <g key={node.id}>
            <rect
              x={PAD + node.col * COL_STEP}
              y={PAD + node.row * ROW_STEP}
              width={NODE_W}
              height={NODE_H}
              rx={3}
              className={[
                styles.flowNode,
                seen ? styles.flowNodeSeen : "",
                active ? styles.flowNodeActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <text
              x={PAD + node.col * COL_STEP + NODE_W / 2}
              y={PAD + node.row * ROW_STEP + NODE_H / 2 + 3.5}
              textAnchor="middle"
              className={
                active
                  ? `${styles.flowLabel} ${styles.flowLabelActive}`
                  : styles.flowLabel
              }
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
