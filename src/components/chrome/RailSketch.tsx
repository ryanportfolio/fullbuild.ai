/* ============================================================================
   RAIL SKETCH — the site log. A pencil record living in the rail's middle
   reach, drawn stroke-by-stroke as the reader advances the set (DrawingSet
   scrubs `.ws-scrub` by overall progress, monotonically). Six little panels,
   read left-right top-bottom, telling the build the set narrates:

     survey → excavation → footings poured → frame raised → clad → AS BUILT

   Each panel is its own SVG with a viewBox cropped to its drawn extent, laid
   out by the .sketch grid (TitleBlock.module.css) — so every vignette scales
   to fill its cell instead of the whole set paying for one tall bounding box.

   Pure server-renderable SVG. Without JS (and under reduced motion) every
   stroke is fully drawn — the finished record, same floor rule as the sheets.
   Each panel sits a degree or two off-square (a hand drew it); strokes keep
   non-scaling widths so every mark stays pencil-weight.
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

/* Correspondence strokes: NOT scroll-scrubbed. The panel stays hidden until a
   transmittal actually leaves the table (SheetTransmittal reveals it and draws
   these in order) — the log never records mail that was never sent. */
function T({ d, w = 1, o }: { d: string; w?: number; o: number }) {
  return (
    <path
      d={d}
      className="ws-post"
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

function Panel({ viewBox, children }: { viewBox: string; children: React.ReactNode }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function RailSketch({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {/* — 1 · survey: benchmark, north arrow, datums, staked line, sights — */}
      <Panel viewBox="0 0 110 110">
        <g transform="rotate(-1 55 55)">
          <S d="M8 10 H20" w={0.8} o={0} />
          <S d="M14 4 V16" w={0.8} o={1} />
          <S d="M17 10 a3 3 0 1 1 -6 0 a3 3 0 1 1 6 0" w={0.6} o={2} />
          <S d="M96 22 V6" w={0.7} o={3} />
          <S d="M92 13 L96 6 L100 13" w={0.7} o={4} />
          <S d="M91 30 V22 L99 30 V22" w={0.6} o={5} />
          <S d="M4 40 H104" w={0.5} o={6} />
          <S d="M10 52 H98" w={0.5} o={7} />
          <S d="M22 92 V66 l7 4 l-7 4" w={0.8} o={8} />
          <S d="M54 92 V66 l7 4 l-7 4" w={0.8} o={9} />
          <S d="M86 92 V66 l7 4 l-7 4" w={0.8} o={10} />
          <S d="M14 16 L86 66" w={0.4} o={11} />
          <S d="M14 16 L52 68" w={0.4} o={12} />
          <S d="M22 102 H86" w={0.5} o={13} />
          <S d="M19 99 l6 6 M83 99 l6 6" w={0.5} o={14} />
        </g>
      </Panel>

      {/* — 2 · excavation: grade, trench cut, spoil mound, ladder, witness — */}
      <Panel viewBox="0 26 110 62">
        <g transform="rotate(1.2 55 57)">
          <S d="M2 46 H106" w={0.8} o={15} />
          <S d="M10 46 H34 L44 74 H72 L82 46 H104" w={1.1} o={16} />
          <S d="M6 40 q11 -12 24 0" w={0.7} o={17} />
          <S d="M12 36 l-4 6 M19 33 l-4 6 M26 36 l-4 6" w={0.5} o={18} />
          <S d="M48 74 l-6 9 M58 74 l-6 9 M68 74 l-6 9" w={0.5} o={19} />
          <S d="M37 50 V72 M42 50 V72" w={0.7} o={20} />
          <S d="M37 55 H42 M37 61 H42 M37 67 H42" w={0.5} o={21} />
          <S d="M96 46 V74" w={0.5} o={22} />
          <S d="M92 60 H100" w={0.5} o={23} />
        </g>
      </Panel>

      {/* — 3 · footings poured: pads, pour hatch, rebar dowels, dim string — */}
      <Panel viewBox="0 40 110 60">
        <g transform="rotate(-0.8 55 70)">
          <S d="M2 78 H106" w={0.8} o={24} />
          <S d="M12 62 h22 v16 h-22 Z" w={1.1} o={25} />
          <S d="M17 78 l7 -13 M26 78 l7 -13" w={0.5} o={26} />
          <S d="M18 62 V50 M28 62 V52" w={0.7} o={27} />
          <S d="M44 62 h22 v16 h-22 Z" w={1.1} o={28} />
          <S d="M49 78 l7 -13 M58 78 l7 -13" w={0.5} o={29} />
          <S d="M50 62 V50 M60 62 V52" w={0.7} o={30} />
          <S d="M76 62 h22 v16 h-22 Z" w={1.1} o={31} />
          <S d="M81 78 l7 -13 M90 78 l7 -13" w={0.5} o={32} />
          <S d="M82 62 V50 M92 62 V52" w={0.7} o={33} />
          <S d="M23 44 V84" w={0.4} o={34} />
          <S d="M87 44 V84" w={0.4} o={35} />
          <S d="M12 92 H98" w={0.5} o={36} />
          <S d="M9 89 l6 6 M95 89 l6 6" w={0.5} o={37} />
        </g>
      </Panel>

      {/* — 4 · frame raised: bents up, ridge, braces, raising line, keystone — */}
      <Panel viewBox="0 4 110 104">
        <g transform="rotate(0.8 55 56)">
          <S d="M2 96 H106" w={0.9} o={38} />
          <S d="M14 96 l-7 9 M40 96 l-7 9 M66 96 l-7 9 M92 96 l-7 9" w={0.5} o={39} />
          <S d="M20 96 V40" w={1.2} o={40} />
          <S d="M54 96 V40" w={1.2} o={41} />
          <S d="M88 96 V40" w={1.2} o={42} />
          <S d="M12 40 H96" w={0.4} o={43} />
          <S d="M20 40 L37 22 L54 40" w={1} o={44} />
          <S d="M54 40 L71 22 L88 40" w={1} o={45} />
          <S d="M37 22 H71" w={0.8} o={46} />
          <S d="M20 62 L34 44" w={0.6} o={47} />
          <S d="M88 62 L74 44" w={0.6} o={48} />
          <S d="M71 22 L98 8" w={0.4} o={49} />
          <S d="M98 8 l-1 5 M98 8 l-5 1" w={0.4} o={50} />
          <S d="M37 16 l4 4 l-4 4 l-4 -4 Z" w={0.9} o={51} />
        </g>
      </Panel>

      {/* — 5 · clad: the finished long shed, door, roof ticks, ground — */}
      <Panel viewBox="0 30 110 70">
        <g transform="rotate(-1 55 65)">
          <S d="M2 88 H106" w={0.9} o={52} />
          <S d="M12 88 l-6 8 M38 88 l-6 8 M64 88 l-6 8 M90 88 l-6 8" w={0.5} o={53} />
          <S d="M14 88 V56" w={1} o={54} />
          <S d="M40 88 V56" w={1} o={55} />
          <S d="M66 88 V56" w={1} o={56} />
          <S d="M92 88 V56" w={1} o={57} />
          <S d="M14 56 L27 42 L40 56 L53 42 L66 56 L79 42 L92 56" w={1} o={58} />
          <S d="M20 52 l6 -5 M46 52 l6 -5 M72 52 l6 -5" w={0.5} o={59} />
          <S d="M48 88 V70 h12 V88" w={0.8} o={60} />
          <S d="M27 36 l3 3 l-3 3 l-3 -3 Z" w={0.8} o={61} />
        </g>
      </Panel>

      {/* — 6 · the record closes: double-border stamp, AS BUILT, date rule — */}
      <Panel viewBox="0 24 110 68">
        <g transform="rotate(-2.5 56 58)">
          <S d="M8 30 h96 v44 h-96 Z" w={1.1} o={62} />
          <S d="M12 34 h88 v36 h-88 Z" w={0.5} o={63} />
          {/* A */}
          <S d="M16 62 L20 48 L24 62" w={0.9} o={64} />
          <S d="M18 57 h4" w={0.9} o={65} />
          {/* S */}
          <S d="M36 48 H28 V55 H36 V62 H28" w={0.9} o={66} />
          {/* B — word gap sits before it: AS · BUILT */}
          <S d="M46 48 V62" w={0.9} o={67} />
          <S d="M46 48 H52 V55 H46 M46 55 H53 V62 H46" w={0.9} o={68} />
          {/* U */}
          <S d="M56 48 V59 L58 62 H62 L64 59 V48" w={0.9} o={69} />
          {/* I */}
          <S d="M70 48 V62" w={0.9} o={70} />
          {/* L */}
          <S d="M76 48 V62 H84" w={0.9} o={71} />
          {/* T */}
          <S d="M88 48 H96" w={0.9} o={72} />
          <S d="M92 48 V62" w={0.9} o={73} />
          <S d="M16 84 H96" w={0.6} o={74} />
          <S d="M20 81 l4 6 M88 81 l4 6" w={0.5} o={75} />
        </g>
      </Panel>

      {/* — 7 · correspondence: an envelope leaves the table. Hidden until the
             visitor's T-01 transmittal is actually lodged. — */}
      <svg
        id="ws-rail-post"
        viewBox="0 22 110 70"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        data-posted="false"
      >
        <g transform="rotate(1.6 55 57)">
          <T d="M12 38 h72 v38 h-72 Z" w={1.1} o={0} />
          <T d="M12 38 L48 62 L84 38" w={0.8} o={1} />
          <T d="M12 76 L38 56 M84 76 L58 56" w={0.5} o={2} />
          <T d="M90 50 l12 0" w={0.8} o={3} />
          <T d="M98 45 l6 5 l-6 5" w={0.8} o={4} />
          <T d="M20 86 H76" w={0.5} o={5} />
        </g>
      </svg>
    </div>
  );
}
