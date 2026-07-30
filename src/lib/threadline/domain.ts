export const milestoneOrder = [
  "plm",
  "threeD",
  "materials",
  "costing",
  "compliance",
  "commerce",
] as const;

export type MilestoneKey = (typeof milestoneOrder)[number];
export type MilestoneState = "complete" | "warning" | "blocked" | "pending";
export type StyleStatus = "ready" | "at-risk" | "blocked" | "in-progress";
export type Severity = "critical" | "warning";
export type GarmentVariant = "shell" | "polo" | "denim" | "bag" | "dress" | "trouser";
export type IntegrationState = "healthy" | "processing" | "failed";

export const milestoneLabels: Record<MilestoneKey, string> = {
  plm: "PLM record",
  threeD: "3D sample",
  materials: "Materials",
  costing: "Costing",
  compliance: "Compliance",
  commerce: "Commerce",
};

export interface Blocker {
  id: string;
  styleId: string;
  severity: Severity;
  milestone: MilestoneKey;
  code: string;
  title: string;
  detail: string;
  source: string;
  owner: string;
  ageHours: number;
  resolvableInDemo: boolean;
  resolutionAction: string;
}

export interface StyleSummary {
  id: string;
  styleNumber: string;
  name: string;
  category: string;
  owner: string;
  colorways: number;
  targetMargin: number;
  launchDate: string;
  milestones: Record<MilestoneKey, MilestoneState>;
  blockers: Blocker[];
  updatedAt: string;
  sourceFreshness: Record<"Centric PLM" | "CLO 3D" | "Compliance", string>;
  variant: GarmentVariant;
  swatches: string[];
}

export interface IntegrationEvent {
  id: string;
  styleId: string;
  source: "Centric PLM" | "CLO 3D" | "Compliance" | "Threadline";
  type: string;
  state: IntegrationState;
  occurredAt: string;
  correlationId: string;
  attempt: number;
  detail: string;
}

const completeMilestones = (): Record<MilestoneKey, MilestoneState> => ({
  plm: "complete",
  threeD: "complete",
  materials: "complete",
  costing: "complete",
  compliance: "complete",
  commerce: "complete",
});

export const demoStyles: StyleSummary[] = [
  {
    id: "style-transit-shell",
    styleNumber: "ST-1042",
    name: "Transit shell",
    category: "Outerwear",
    owner: "Maya Chen",
    colorways: 4,
    targetMargin: 64.2,
    launchDate: "Sep 15",
    milestones: { ...completeMilestones(), compliance: "blocked" },
    blockers: [
      {
        id: "block-pfas",
        styleId: "style-transit-shell",
        severity: "critical",
        milestone: "compliance",
        code: "MAT-214",
        title: "Shell finish missing PFAS declaration",
        detail:
          "Supplier certificate covers the base textile but not the water-repellent finish attached to colorway 04.",
        source: "Compliance",
        owner: "Maya Chen",
        ageHours: 18,
        resolvableInDemo: true,
        resolutionAction: "Attach verified finish declaration",
      },
    ],
    updatedAt: "08:41 PT",
    sourceFreshness: { "Centric PLM": "42s", "CLO 3D": "6m", Compliance: "2m" },
    variant: "shell",
    swatches: ["#e85d36", "#253448", "#b9b5a7", "#9db7a0"],
  },
  {
    id: "style-rib-polo",
    styleNumber: "KN-2088",
    name: "Rib column polo",
    category: "Knitwear",
    owner: "Nora Patel",
    colorways: 3,
    targetMargin: 68.9,
    launchDate: "Sep 15",
    milestones: completeMilestones(),
    blockers: [],
    updatedAt: "08:39 PT",
    sourceFreshness: { "Centric PLM": "3m", "CLO 3D": "4m", Compliance: "11m" },
    variant: "polo",
    swatches: ["#b8c7e8", "#682f39", "#e8dfc6"],
  },
  {
    id: "style-wide-jean",
    styleNumber: "DN-3140",
    name: "Wide-leg rinse jean",
    category: "Denim",
    owner: "Leo Martins",
    colorways: 3,
    targetMargin: 61.7,
    launchDate: "Sep 22",
    milestones: { ...completeMilestones(), threeD: "warning" },
    blockers: [
      {
        id: "block-colorway",
        styleId: "style-wide-jean",
        severity: "warning",
        milestone: "threeD",
        code: "3D-088",
        title: "CLO colorway count differs from PLM",
        detail:
          "CLO package contains two approved washes; Centric lists a third wash scheduled for market review.",
        source: "CLO 3D",
        owner: "Leo Martins",
        ageHours: 6,
        resolvableInDemo: true,
        resolutionAction: "Accept latest CLO manifest",
      },
    ],
    updatedAt: "08:37 PT",
    sourceFreshness: { "Centric PLM": "5m", "CLO 3D": "1m", Compliance: "9m" },
    variant: "denim",
    swatches: ["#364c68", "#7891aa", "#1c2633"],
  },
  {
    id: "style-fold-messenger",
    styleNumber: "AC-5012",
    name: "Fold messenger",
    category: "Accessories",
    owner: "Ari Jones",
    colorways: 2,
    targetMargin: 70.4,
    launchDate: "Sep 29",
    milestones: {
      plm: "warning",
      threeD: "complete",
      materials: "complete",
      costing: "complete",
      compliance: "pending",
      commerce: "pending",
    },
    blockers: [
      {
        id: "block-plm-sync",
        styleId: "style-fold-messenger",
        severity: "warning",
        milestone: "plm",
        code: "INT-503",
        title: "Centric delta event exhausted retries",
        detail:
          "Payload is preserved. The third attempt returned a transient upstream 503 and awaits an operator retry.",
        source: "Centric PLM",
        owner: "Platform Ops",
        ageHours: 2,
        resolvableInDemo: false,
        resolutionAction: "Retry preserved event",
      },
    ],
    updatedAt: "06:28 PT",
    sourceFreshness: { "Centric PLM": "2h", "CLO 3D": "14m", Compliance: "pending" },
    variant: "bag",
    swatches: ["#302e2a", "#9b714c"],
  },
  {
    id: "style-bias-dress",
    styleNumber: "DR-1106",
    name: "Bias slip dress",
    category: "Dresses",
    owner: "Samira Okafor",
    colorways: 5,
    targetMargin: 66.1,
    launchDate: "Sep 15",
    milestones: completeMilestones(),
    blockers: [],
    updatedAt: "08:31 PT",
    sourceFreshness: { "Centric PLM": "8m", "CLO 3D": "9m", Compliance: "12m" },
    variant: "dress",
    swatches: ["#d2b0b8", "#141518", "#c98454", "#aab59a", "#dcd3bd"],
  },
  {
    id: "style-utility-trouser",
    styleNumber: "TR-4207",
    name: "Pleated utility trouser",
    category: "Bottoms",
    owner: "Ben Kline",
    colorways: 4,
    targetMargin: 59.8,
    launchDate: "Oct 06",
    milestones: {
      plm: "complete",
      threeD: "complete",
      materials: "complete",
      costing: "pending",
      compliance: "pending",
      commerce: "pending",
    },
    blockers: [],
    updatedAt: "08:20 PT",
    sourceFreshness: { "Centric PLM": "20m", "CLO 3D": "24m", Compliance: "pending" },
    variant: "trouser",
    swatches: ["#707361", "#c9c0a9", "#374047", "#9c6352"],
  },
];

export const demoEvents: IntegrationEvent[] = [
  {
    id: "evt-plm-failed",
    styleId: "style-fold-messenger",
    source: "Centric PLM",
    type: "STYLE_DELTA",
    state: "failed",
    occurredAt: "08:40:02",
    correlationId: "cor_91A7F",
    attempt: 3,
    detail: "Upstream 503 · payload preserved",
  },
  {
    id: "evt-clo-published",
    styleId: "style-wide-jean",
    source: "CLO 3D",
    type: "ASSET_PUBLISHED",
    state: "healthy",
    occurredAt: "08:39:48",
    correlationId: "cor_77CD2",
    attempt: 1,
    detail: "Manifest validated · 18 assets",
  },
  {
    id: "evt-compliance",
    styleId: "style-transit-shell",
    source: "Compliance",
    type: "CERTIFICATE_SCAN",
    state: "healthy",
    occurredAt: "08:38:11",
    correlationId: "cor_0F42B",
    attempt: 1,
    detail: "6 of 7 declarations matched",
  },
  {
    id: "evt-plm-style",
    styleId: "style-rib-polo",
    source: "Centric PLM",
    type: "STYLE_APPROVED",
    state: "healthy",
    occurredAt: "08:35:26",
    correlationId: "cor_55E1A",
    attempt: 1,
    detail: "Version 34 accepted",
  },
];

export function cloneDemoStyles(): StyleSummary[] {
  return demoStyles.map((style) => ({
    ...style,
    blockers: style.blockers.map((blocker) => ({ ...blocker })),
    milestones: { ...style.milestones },
    sourceFreshness: { ...style.sourceFreshness },
    swatches: [...style.swatches],
  }));
}

export function cloneDemoEvents(): IntegrationEvent[] {
  return demoEvents.map((event) => ({ ...event }));
}

export function readinessFor(style: StyleSummary): number {
  const values = Object.values(style.milestones);
  return Math.round((values.filter((state) => state === "complete").length / values.length) * 100);
}

export function statusFor(style: StyleSummary): StyleStatus {
  if (style.blockers.some((blocker) => blocker.severity === "critical")) return "blocked";
  const readiness = readinessFor(style);
  if (readiness === 100) return "ready";
  if (readiness >= 70) return "at-risk";
  return "in-progress";
}
