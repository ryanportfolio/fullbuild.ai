/* ============================================================================
   RAIL SKETCH — the site log. A pencil record living in the rail's middle
   reach, drawn stroke-by-stroke as the reader advances the set (DrawingSet
   scrubs `.ws-scrub` by overall progress, monotonically). It records the build
   the set narrates, as five little panels read left-right, top-bottom:
   survey → excavation → footings → the frame raised → AS BUILT stamp.

   Pure server-renderable SVG. Without JS (and under reduced motion) every
   stroke is fully drawn — the finished record, same floor rule as the sheets.
   Panel groups position/scale authored geometry; strokes keep non-scaling
   widths, so every mark stays pencil-weight.
   ========================================================================= */

function S({ d, w = 1, o }: { d: string; w?: number; o: number }) {
  return (
    <path
      d={d}
      className="ws-scrub"
      data-o={o}
      pathLength={1}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export default function RailSketch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 380"
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
    >
      {/* — survey: benchmark, datum, stakes, sight line — */}
      <g transform="translate(0,-6) scale(0.8)">
        <S d="M10 20 H22" w={0.8} o={0} />
        <S d="M16 14 V26" w={0.8} o={1} />
        <S d="M8 52 H142" w={0.6} o={2} />
        <S d="M30 96 V72 l6 3 l-6 3" w={0.8} o={3} />
        <S d="M75 96 V72 l6 3 l-6 3" w={0.8} o={4} />
        <S d="M120 96 V72 l6 3 l-6 3" w={0.8} o={5} />
        <S d="M16 26 L120 88" w={0.6} o={6} />
      </g>

      {/* — excavation: trench cut + spoil hatch + depth witness — */}
      <g transform="translate(116,-94) scale(0.8)">
        <S d="M12 168 H44 L52 190 H98 L106 168 H138" w={1.1} o={7} />
        <S d="M56 190 l-8 12" w={0.6} o={8} />
        <S d="M70 190 l-8 12" w={0.6} o={9} />
        <S d="M84 190 l-8 12" w={0.6} o={10} />
        <S d="M98 190 l-8 12" w={0.6} o={11} />
        <S d="M142 168 V190" w={0.7} o={12} />
      </g>

      {/* — footings: grade line, three pads, hatch — */}
      <g transform="translate(-3,-43) scale(0.8)">
        <S d="M12 296 H138" w={0.8} o={13} />
        <S d="M20 280 h24 v16 h-24 Z" w={1.1} o={14} />
        <S d="M26 296 l7 -12 M36 296 l7 -12" w={0.6} o={15} />
        <S d="M63 280 h24 v16 h-24 Z" w={1.1} o={16} />
        <S d="M69 296 l7 -12 M79 296 l7 -12" w={0.6} o={17} />
        <S d="M106 280 h24 v16 h-24 Z" w={1.1} o={18} />
        <S d="M112 296 l7 -12 M122 296 l7 -12" w={0.6} o={19} />
      </g>

      {/* — the frame raised: columns, gables, ridge, braces, roof, ground — */}
      <g transform="translate(130,-110) scale(0.65)">
        <S d="M32 540 V420" w={1.2} o={20} />
        <S d="M75 540 V420" w={1.2} o={21} />
        <S d="M118 540 V420" w={1.2} o={22} />
        <S d="M32 420 L53.5 380 L75 420" w={1.1} o={23} />
        <S d="M75 420 L96.5 380 L118 420" w={1.1} o={24} />
        <S d="M53.5 380 H96.5" w={0.9} o={25} />
        <S d="M20 420 H130" w={0.6} o={26} />
        <S d="M53.5 370 l4 4 l-4 4 l-4 -4 Z" w={1} o={27} />
        <S d="M32 470 L52 430" w={0.8} o={28} />
        <S d="M118 470 L98 430" w={0.8} o={29} />
        <S d="M38 410 l8 -5" w={0.6} o={30} />
        <S d="M48 392 l8 -5" w={0.6} o={31} />
        <S d="M82 410 l8 -5" w={0.6} o={32} />
        <S d="M92 392 l8 -5" w={0.6} o={33} />
        <S d="M12 540 H138" w={1.4} o={34} />
        <S d="M28 540 l-8 10" w={0.6} o={35} />
        <S d="M58 540 l-8 10" w={0.6} o={36} />
        <S d="M88 540 l-8 10" w={0.6} o={37} />
        <S d="M118 540 l-8 10" w={0.6} o={38} />
      </g>

      {/* — the record closes: stamp box, plotter-lettered AS BUILT, rule — */}
      <g transform="translate(49,-326) scale(0.95)">
        <S d="M22 640 h106 v60 h-106 Z" w={1.1} o={39} />
        {/* A */}
        <S d="M30 682 L35 666 L40 682" w={0.9} o={40} />
        <S d="M32.5 676 h5" w={0.9} o={41} />
        {/* S */}
        <S d="M54 666 H44 V674 H54 V682 H44" w={0.9} o={42} />
        {/* B */}
        <S d="M62 666 V682" w={0.9} o={43} />
        <S d="M62 666 H70 V674 H62 M62 674 H71 V682 H62" w={0.9} o={44} />
        {/* U */}
        <S d="M76 666 V679 L79 682 H85 L88 679 V666" w={0.9} o={45} />
        {/* I */}
        <S d="M95 666 V682" w={0.9} o={46} />
        {/* L */}
        <S d="M102 666 V682 H111" w={0.9} o={47} />
        {/* T */}
        <S d="M116 666 H126" w={0.9} o={48} />
        <S d="M121 666 V682" w={0.9} o={49} />
        <S d="M30 716 H120" w={0.7} o={50} />
      </g>
    </svg>
  );
}
