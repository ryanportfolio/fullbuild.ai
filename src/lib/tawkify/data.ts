// Deterministic mock data for the Tawkify modernization concept.
// Public figures carry their source. Prices and terms are reconstructed from
// public reporting and labeled as such in the UI. Every person on the client
// and desk surfaces is invented.

// ---------- Marketing home ----------

export type PlateSpec = {
  slug: string;
  ratio: string; // CSS aspect-ratio value
  tone: "sand" | "creamDeep" | "tan" | "dark";
};

export const plates: Record<string, PlateSpec> = {
  p1: { slug: "PLATE 01 · FIRST DATE, RESTAURANT TABLE · 3:2 · UNGRADED TUNGSTEN", ratio: "3 / 2", tone: "sand" },
  p2: { slug: "PLATE 02 · EMPTY TWO-TOP BEFORE SERVICE · 3:2 · PRACTICALS ONLY", ratio: "3 / 2", tone: "dark" },
  p3: { slug: "PLATE 03 · MATCHMAKER AT DESK · 4:5 · UNGRADED NORTH WINDOW", ratio: "4 / 5", tone: "creamDeep" },
  p4: { slug: "PLATE 04 · MATCHMAKER AT DESK · 4:5 · UNGRADED NORTH WINDOW", ratio: "4 / 5", tone: "sand" },
  p5: { slug: "PLATE 05 · MATCHMAKER AT DESK · 4:5 · UNGRADED NORTH WINDOW", ratio: "4 / 5", tone: "tan" },
  p6: { slug: "PLATE 06 · COUPLE MID-STRIDE, CITY SIDEWALK · 3:2 · OVERCAST DAYLIGHT", ratio: "3 / 2", tone: "dark" },
  p7: { slug: "PLATE 07 · COUPLE, KITCHEN COUNTER · 1:1 · MATCHED DAYLIGHT", ratio: "1 / 1", tone: "dark" },
  p8: { slug: "PLATE 08 · COUPLE, TRAILHEAD · 1:1 · MATCHED DAYLIGHT", ratio: "1 / 1", tone: "dark" },
  p9: { slug: "PLATE 09 · VIDEO INTERVIEW, SCREEN AWAY · 16:9 · COOL ON WARM", ratio: "16 / 9", tone: "sand" },
  p10: { slug: "PLATE 10 · YOUR MATCHMAKER · 1:1 · AS PLATE 03", ratio: "1 / 1", tone: "creamDeep" },
  p11: { slug: "PHOTO WITHHELD · REVEAL AT YOUR CHOICE", ratio: "4 / 5", tone: "creamDeep" },
};

export type Matchmaker = {
  name: string;
  years: number;
  cities: string;
  specialty: string;
  line: string;
  plate: string;
};

export const matchmakers: Matchmaker[] = [
  {
    name: "Dana Reyes",
    years: 9,
    cities: "New York and Hudson Valley",
    specialty: "Second chapters after divorce",
    line: "My clients are done auditioning strangers. My job is to make the next introduction the last first date they dread.",
    plate: "p3",
  },
  {
    name: "Miriam Okafor",
    years: 6,
    cities: "Chicago and Milwaukee",
    specialty: "Faith and family alignment",
    line: "I read the debrief before I read the profile. What went wrong last time is the sharpest signal I have.",
    plate: "p4",
  },
  {
    name: "Claire Fontaine",
    years: 11,
    cities: "San Francisco and Seattle",
    specialty: "Founders and physicians with no time",
    line: "Busy people do not need more options. They need one person worth canceling a meeting for.",
    plate: "p5",
  },
];

export type LedgerStep = { id: string; title: string; body: string };

// Step names preserved verbatim from tawkify.com
export const ledgerSteps: LedgerStep[] = [
  {
    id: "01",
    title: "1-On-1 Matching Process",
    body: "You meet your matchmaker in a real conversation, not a form. They learn what a good day with you looks like and what you will not compromise on.",
  },
  {
    id: "02",
    title: "Date-Night Planning On Us",
    body: "Time, place, and reservation handled. You show up and meet a person your matchmaker can vouch for, first names only until you both opt in.",
  },
  {
    id: "03",
    title: "360-Degree Feedback Loop",
    body: "After every date your matchmaker collects feedback from both sides. Your file gets sharper and the next introduction gets closer.",
  },
  {
    id: "04",
    title: "Coaching And Community",
    body: "Between introductions you get access to coaching and a community of people doing the same deliberate work you are.",
  },
];

export type PricingTier = {
  name: string;
  price: string;
  matches: string;
  includes: string;
};

// Reconstructed from public reporting, labeled as such in the UI.
export const pricingTiers: PricingTier[] = [
  { name: "Starter", price: "$4,900", matches: "3 matches", includes: "Dedicated matchmaker, date planning, 360 debriefs" },
  { name: "Core", price: "$8,000", matches: "6 matches", includes: "Everything in Starter plus coaching sessions" },
  { name: "Extended", price: "$12,000", matches: "9 matches", includes: "Everything in Core plus profile refresh at midpoint" },
  { name: "Committed", price: "$15,000", matches: "12 matches", includes: "Everything in Extended plus priority sourcing" },
  { name: "Premier", price: "from $50,000", matches: "Custom search", includes: "National search, dedicated senior matchmaker, custom screening" },
];

export const matchDefinition =
  "A match is an introduction that respects every one of your non-negotiables, screened personally by your matchmaker against what you told her after your last date. A first date that happens counts. A list of names does not.";

export const disclosureTerms: string[] = [
  "Packages are billed up front and are non-refundable after the rescission window.",
  "Twelve states provide a three business day rescission right on dating service contracts. If you are in one, we tell you which one and how to exercise it, in writing, before you pay.",
  "If you pause, unused matches keep for eighteen months. If your matchmaker leaves, you get a briefed handoff and one additional match at no cost.",
  "These terms are the concept's proposal, reconstructed from public reporting on how contracts like this work.",
];

export type ScreeningItem = { label: string; value: string };

export const screeningSpec: ScreeningItem[] = [
  { label: "Identity", value: "Government ID verified at intake, rechecked if a legal name changes" },
  { label: "Records", value: "National criminal database and sex offender registry, run within 30 days of any introduction" },
  { label: "Disqualifiers", value: "Violent offenses, active protective orders, misrepresented marital status" },
  { label: "Interview", value: "45 minute video interview covering history, intent, and the non-negotiables you set" },
  { label: "First date protocol", value: "Public venue, no contact details exchanged, matchmaker checks in with both sides after" },
];

export const poolDisclosure = {
  heading: "Who is in the pool",
  body: "Two kinds of people, and we tell you which is which before you pay. Clients are paying for a search of their own. Screened members passed the same identity and records checks and a shorter interview. Everyone you meet is labeled with where they came from.",
};

export type Story = {
  quote: string;
  names: string;
  city: string;
  month: string;
  firstDate: string;
  together: string;
  plate: string;
};

// Invented composites in the voice of published reviews, not real clients.
export const stories: Story[] = [
  {
    quote: "I told Dana exactly why the apps burned me out, and the first person she introduced me to is now my fiancee.",
    names: "Priya + Dana's client Alex",
    city: "Brooklyn",
    month: "March 2025",
    firstDate: "A corner table at a wine bar neither of us had been to",
    together: "Engaged, 14 months",
    plate: "p6",
  },
  {
    quote: "The date was planned for us. I walked in skeptical and walked out having forgotten to check my phone for three hours.",
    names: "Marcus + Elena",
    city: "Chicago",
    month: "August 2024",
    firstDate: "Early dinner, then a walk neither of us wanted to end",
    together: "Together 2 years",
    plate: "p7",
  },
  {
    quote: "The debrief calls are the product. Someone listened to what went wrong and fixed it by the next introduction.",
    names: "Jordan + Sam",
    city: "Seattle",
    month: "January 2026",
    firstDate: "Coffee that turned into a trailhead the same weekend",
    together: "Exclusive, 6 months",
    plate: "p8",
  },
];

export type ProofStat = {
  value: string;
  label: string;
  footnote: string;
};

// Claims preserved verbatim from tawkify.com; footnotes are the concept's
// required methodology line, no claim renders without one.
export const proofStats: ProofStat[] = [
  { value: "6.5x", label: "more likely to find your best match than on a dating app", footnote: "Tawkify internal comparison, published on tawkify.com, read Jul 2026" },
  { value: "80%", label: "relationship-ready singles", footnote: "Tawkify network survey, published on tawkify.com, read Jul 2026" },
  { value: "200,000", label: "successful connections", footnote: "Cumulative count published on tawkify.com, read Jul 2026" },
  { value: "#1", label: "matchmaker in America", footnote: "Trustpilot category ranking, dating services, read Jul 2026" },
];

export type PlatformRating = { platform: string; rating: string; count: string };

export const platformRatings: PlatformRating[] = [
  { platform: "Trustpilot", rating: "4.6 / 5", count: "7,834 reviews" },
  { platform: "BBB", rating: "2.68 / 5", count: "customer reviews" },
  { platform: "SiteJabber", rating: "2.2 / 5", count: "customer reviews" },
];

export const criticsBlock = {
  heading: "What our critics say and what we changed",
  body: "The one-star reviews cluster on three things: a price you learn late, refund terms you learn later, and matchmakers who go quiet. So the price now sits at the top of this page, the terms sit next to it in plain language, and nobody goes two weeks without hearing from their matchmaker.",
};

export const arrowsLadder = [
  { stage: "Arrows", detail: "One free video date with someone we vetted. No package, no commitment" },
  { stage: "Starter package", detail: "Three matches with a dedicated matchmaker" },
  { stage: "Full engagement", detail: "The full search, when you have seen how we work" },
];

export const receiptsRow = ["from $4,900", "3 day rescission in 12 states", "30 min call, no card"];

// ---------- Shared product objects ----------

export type ConstraintCheck = {
  label: string;
  required: string;
  actual: string;
  verdict: "pass" | "override" | "fail";
  overrideReason?: string;
};

export const constraints: ConstraintCheck[] = [
  { label: "Max distance", required: "25 mi", actual: "11.4 mi", verdict: "pass" },
  { label: "Age band", required: "31 to 41", actual: "34", verdict: "pass" },
  { label: "Wants kids", required: "Open to kids", actual: "Yes, in 2 to 3 years", verdict: "pass" },
  { label: "Religion", required: "Any, practicing partner ok", actual: "Non-practicing", verdict: "pass" },
  {
    label: "Politics",
    required: "Left of center",
    actual: "Declines to state",
    verdict: "override",
    overrideReason: "Interview notes show aligned values on the three issues you named. I would rather show you my reasoning than hide the gap. Dana",
  },
  { label: "Pets", required: "No cats, allergy", actual: "One dog", verdict: "pass" },
];

export const pipelineStages = ["Sourcing", "Screening", "Interview", "Scheduling", "Introduced", "Debrief"] as const;

export type ApprovalRecord = {
  assist: boolean;
  approver: string;
  role: string;
  timestamp: string;
};

export const matchApproval: ApprovalRecord = {
  assist: true,
  approver: "Dana Reyes",
  role: "Your matchmaker",
  timestamp: "12 Mar, 09:14",
};

// ---------- Client surface, /match ----------

export const clientMatch = {
  fileId: "INT-0847",
  preparedOn: "Tue 12 Mar, 09:14",
  firstName: "Claire",
  age: 34,
  city: "Brooklyn",
  distance: "11.4 mi",
  currentStage: 4, // Introduced
  lastUpdated: "2h ago",
  matchesUsed: "3 of 6",
  nextCheckIn: "Aug 12",
  narrative: [
    "Claire is the first person I have brought you where I did not bend a single one of your rules, and I want you to know why that matters: for your last two introductions I bent one each time, and told you so.",
    "You both described the same thing ending your last relationships, moving too fast and resenting it. So I am pacing this one on purpose, and she knows that too.",
    "She reads as reserved for the first twenty minutes, then very funny. Ask about the rooftop meadow she is building over a parking garage.",
  ],
  pullLine: "The first person I have brought you where I did not bend a single one of your rules",
  screeningRecord: [
    { label: "Records check", value: "Completed 28 Feb 2026" },
    { label: "Identity", value: "Verified 12 Jan 2026" },
    { label: "Video interview", value: "Completed 3 Mar 2026" },
    { label: "Pool source", value: "Screened member" },
  ],
  date: {
    when: "Thursday, 7:30 pm",
    where: "Quince Street Wine Bar, Brooklyn",
    booked: "Corner table reserved under Tawkify",
    notShared: "No numbers exchanged, public venue, Dana checks in with both of you after",
  },
  blindRationale:
    "We withhold photos until you both choose to share them. Clients who opt into blind introductions report the first twenty minutes feel like a conversation instead of a comparison. The choice is yours, at any time.",
};

// ---------- Matchmaker desk, /desk ----------

export const deskCounters = [
  { label: "open files", value: "14" },
  { label: "matches owed this month", value: "6" },
  { label: "past contact SLA", value: "2" },
];

export type RosterRow = {
  id: string;
  client: string;
  monthsWithMe: number;
  daysSinceContact: number;
  nextObligation: string;
};

export const roster: RosterRow[] = [
  { id: "C-3251", client: "James T.", monthsWithMe: 7, daysSinceContact: 16, nextObligation: "Source next candidate" },
  { id: "C-3287", client: "Maya K.", monthsWithMe: 4, daysSinceContact: 15, nextObligation: "Review 3 flagged candidates" },
  { id: "C-3311", client: "Alex R.", monthsWithMe: 11, daysSinceContact: 3, nextObligation: "Collect date 2 debrief" },
  { id: "C-3340", client: "Devon P.", monthsWithMe: 2, daysSinceContact: 1, nextObligation: "Confirm Thursday reservation" },
  { id: "C-3298", client: "Sarah L.", monthsWithMe: 1, daysSinceContact: 0, nextObligation: "Write intake summary" },
];

export const dossierPairs = [
  { id: "pace", client: "Ended last relationship over pacing", candidate: "Names pacing as her own failure mode" },
  { id: "sundays", client: "Sundays outdoors, non-negotiable", candidate: "Logs a ridge walk most weekends" },
  { id: "apps", client: "Off apps 16 months", candidate: "Off apps 14 months" },
];

export type CandidateQueueRow = {
  id: string;
  name: string;
  distance: string;
  age: number;
  lastActive: string;
  source: "Client" | "Member";
  screening: string;
  verdict: "clear" | "flag";
  flagNote?: string;
};

export const candidateQueue: CandidateQueueRow[] = [
  { id: "N-114", name: "Claire M.", distance: "11.4 mi", age: 34, lastActive: "2d", source: "Member", screening: "Complete, 28 Feb", verdict: "clear" },
  { id: "N-097", name: "Bianca F.", distance: "40.2 mi", age: 36, lastActive: "5d", source: "Client", screening: "Complete, 12 Feb", verdict: "flag", flagNote: "Distance exceeds client cap of 25 mi" },
  { id: "N-121", name: "Rosa D.", distance: "8.1 mi", age: 33, lastActive: "1d", source: "Member", screening: "Interview pending", verdict: "flag", flagNote: "Screening incomplete, release blocked" },
];

export const assistDraft = {
  intro:
    "Alex, meet Claire. You both told me the same story about why your last relationships ended, which almost never happens, and you both guard your Sundays for the same reason. I have booked the corner table at Quince Street for Thursday at 7:30. First names only for now, as always.",
  rationale: [
    "Both files name pacing as the primary past failure mode",
    "Shared non-negotiable, outdoor time on weekends",
    "Both off apps for over a year",
  ],
};

export const continuityLedger = [
  { matchmaker: "Dana Reyes", held: "May 2025 to now", handoff: "" },
  { matchmaker: "Tom Osei", held: "Jan to May 2025", handoff: "Handoff brief 2 May, client re-interviewed" },
];

export const auditStrip = [
  "09:14 · Approval written, INT-0847, Dana Reyes",
  "09:11 · Assist draft edited, 2 sentences changed",
  "09:06 · Assist draft generated from files C-3311 + N-114",
  "08:52 · Constraint override logged, politics, reason recorded",
];
