import g from './glyphs.module.css';

/**
 * Inline drafting glyphs — small line-icons lettered in the same hand as the
 * sheets, sized to sit on the text baseline (currentColor, so they flip with
 * the ink). Used inside thesis lines where a mark reads better than a word.
 */

/** faster — three forward chevrons, motion. */
export function FasterGlyph() {
  return (
    <svg viewBox="0 0 24 16" className={g.glyph} role="img" aria-label="faster">
      <path
        d="M3 3 L8 8 L3 13 M9.5 3 L14.5 8 L9.5 13 M16 3 L21 8 L16 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** stronger — a structural truss triangle with web bracing. */
export function StrongerGlyph() {
  return (
    <svg viewBox="0 0 24 16" className={g.glyph} role="img" aria-label="stronger">
      <path
        d="M2 14 L12 2 L22 14 Z M2 14 L12 8 M22 14 L12 8 M7 14 L12 8 M17 14 L12 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** secure — a shield with a keyhole. */
export function SecureGlyph() {
  return (
    <svg viewBox="0 0 18 18" className={g.glyph} role="img" aria-label="secure">
      <path
        d="M9 1.4 L15.5 3.9 V9 C15.5 13.1 12.5 15.7 9 16.6 C5.5 15.7 2.5 13.1 2.5 9 V3.9 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7.8" r="1.6" fill="currentColor" />
      <path d="M9 9.2 V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * IGNITION — the imagination machine, running. A cog turning under its own
 * power: eight teeth around a hub, rotating slowly and endlessly. Motion is the
 * whole point of this one (it replaces the words ", on."), so it animates; a
 * reduced-motion reader gets the cog at rest, still legibly a machine.
 */
export function IgnitionGlyph() {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return (
      <line
        key={i}
        x1={12 + Math.cos(a) * 8.5}
        y1={12 + Math.sin(a) * 8.5}
        x2={12 + Math.cos(a) * 11}
        y2={12 + Math.sin(a) * 11}
      />
    );
  });
  return (
    <svg viewBox="0 0 24 24" className={`${g.glyph} ${g.cog}`} role="img" aria-label="running">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        {teeth}
        <circle cx="12" cy="12" r="3" />
      </g>
    </svg>
  );
}
