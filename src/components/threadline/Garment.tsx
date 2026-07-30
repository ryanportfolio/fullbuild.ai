import type { GarmentVariant, StyleStatus } from "@/lib/threadline/domain";

interface GarmentProps {
  variant: GarmentVariant;
  status: StyleStatus;
  name: string;
}

const paths: Record<GarmentVariant, React.ReactNode> = {
  shell: (
    <>
      <path d="M88 50 58 69 36 118l25 15 10-31v96h98v-96l10 31 25-15-22-49-30-19-15 21h-34L88 50Z" />
      <path d="m103 71 17 22 17-22M120 93v105M72 113l-11 20M168 113l11 20M90 157h60" />
      <path d="M106 50c0 11 5 17 14 17s14-6 14-17" />
    </>
  ),
  polo: (
    <>
      <path d="m91 52-39 22 17 48 24-10v88h54v-88l24 10 17-48-39-22-12 12h-34L91 52Z" />
      <path d="m103 64 17 27 17-27M120 91v45M93 115h54M78 77l-9 45M162 77l9 45" />
      <path d="M111 99h18M111 108h18" />
    </>
  ),
  denim: (
    <>
      <path d="M82 48h76l-3 48-9 104h-36l10-90-10 90H74L85 96l-3-48Z" />
      <path d="M85 69h70M120 48v62M86 76c12 1 20-2 24-9M154 76c-12 1-20-2-24-9M74 186h36M130 186h16" />
      <path d="m104 48 4 12h24l4-12" />
    </>
  ),
  bag: (
    <>
      <path d="M58 91h124l-10 100H68L58 91Z" />
      <path d="M83 91c2-32 14-48 37-48s35 16 37 48M58 112h124M81 112l10 55h58l10-55" />
      <path d="M108 125h24v18h-24zM71 91l-13-13M169 91l13-13" />
    </>
  ),
  dress: (
    <>
      <path d="m99 49 21 23 21-23 8 49 36 103H55L91 98l8-49Z" />
      <path d="M99 49c2 19 9 28 21 28s19-9 21-28M91 98c18 8 40 8 58 0M120 77v124" />
      <path d="M69 164h102M78 138h84" />
    </>
  ),
  trouser: (
    <>
      <path d="M82 48h76l7 152h-39l-6-94-6 94H75L82 48Z" />
      <path d="M82 72h76M120 48v58M99 72l11 35M141 72l-11 35M75 184h39M126 184h39" />
      <path d="M88 48v24M152 48v24" />
    </>
  ),
};

export function Garment({ variant, status, name }: GarmentProps) {
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={`${name} technical silhouette`} data-status={status}>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        {paths[variant]}
      </g>
      <path className="garmentMeasure" d="M33 30v180M26 30h14M26 210h14M29 63h8M29 99h8M29 135h8M29 171h8" />
      <text x="30" y="228" className="garmentLabel">
        FRONT / SPEC VIEW
      </text>
    </svg>
  );
}
