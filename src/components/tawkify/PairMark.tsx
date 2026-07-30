import styles from "@/app/prototype/tawkify/tawkify.module.css";

// Authored mark: two lives drawn as open arcs, tied by one coral stroke.
// Three strokes total, well under the contract ceiling of twelve.
export function PairMark() {
  return (
    <svg
      className={styles.pairMark}
      viewBox="0 0 200 120"
      role="img"
      aria-label="Two arcs joined by a single stroke, the introduction mark"
    >
      <path data-stroke="left" d="M 78 24 A 44 44 0 1 0 78 96" />
      <path data-stroke="right" d="M 122 96 A 44 44 0 1 0 122 24" />
      <path data-stroke="tie" d="M 78 60 C 88 48, 112 72, 122 60" />
    </svg>
  );
}
