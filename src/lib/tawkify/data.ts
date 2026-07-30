// Deterministic mock data for the Tawkify modernization concept.
// Public figures carry their source; everything person-level is invented
// for the prototype and marked as such in the UI copy.

export type LedgerStep = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
};

export const ledgerSteps: LedgerStep[] = [
  {
    id: "01",
    kicker: "Intake",
    title: "A real conversation, not a form",
    body: "You meet your matchmaker one on one. They learn what a good day with you looks like, what ended your last relationship, and what you will not compromise on.",
    note: "45 min video call",
  },
  {
    id: "02",
    kicker: "Curation",
    title: "Your matchmaker screens, you never swipe",
    body: "Every candidate is hand screened against your file. No browsing, no queue of strangers. You hear about one person at a time, with the reasons written down.",
    note: "avg 3 candidates reviewed per match",
  },
  {
    id: "03",
    kicker: "Introduction",
    title: "The date is planned for you",
    body: "Time, place, and reservation handled. You show up and meet a person your matchmaker can vouch for. First names only until you both opt in.",
    note: "logistics handled end to end",
  },
  {
    id: "04",
    kicker: "Debrief",
    title: "Both sides report back",
    body: "After every date your matchmaker collects feedback from both of you. The file gets sharper, and the next introduction gets closer.",
    note: "360 feedback, every date",
  },
];

export type SourcedStat = {
  value: string;
  label: string;
  source: string;
};

// Real public figures from tawkify.com, read July 2026.
export const publicStats: SourcedStat[] = [
  { value: "200,000+", label: "successful connections", source: "tawkify.com, Jul 2026" },
  { value: "4.6 / 5", label: "Trustpilot, 7,834 reviews", source: "trustpilot.com, Jul 2026" },
  { value: "3M+", label: "singles in the network", source: "tawkify.com, Jul 2026" },
  { value: "6.5x", label: "more likely to find your best match than on an app", source: "tawkify.com, Jul 2026" },
];

export type Debrief = {
  id: string;
  quote: string;
  names: string;
  outcome: string;
  dates: number;
};

// Invented composites in the voice of published Tawkify reviews, not real clients.
export const debriefs: Debrief[] = [
  {
    id: "F-2214",
    quote: "I told my matchmaker exactly why the apps burned me out. The first person she introduced me to is now my fiancee.",
    names: "Dana + Priya",
    outcome: "Engaged",
    dates: 4,
  },
  {
    id: "F-1987",
    quote: "Having the date planned for me sounded like a gimmick. Then I walked into a wine bar I had never heard of and met my favorite person.",
    names: "Marcus + Elena",
    outcome: "Together 2 years",
    dates: 6,
  },
  {
    id: "F-2402",
    quote: "The debrief calls are the product. Someone actually listened to what went wrong and fixed it by the next introduction.",
    names: "Jordan + Sam",
    outcome: "Exclusive",
    dates: 3,
  },
];

// Client surface: the prepared introduction.

export type MatchSignal = {
  label: string;
  evidence: string;
};

export type PreparedMatch = {
  fileId: string;
  firstName: string;
  age: number;
  distance: string;
  vocation: string;
  signals: MatchSignal[];
  narrative: string[];
  datePlan: {
    when: string;
    where: string;
    detail: string;
  };
  matchmaker: string;
};

export const preparedMatch: PreparedMatch = {
  fileId: "INT-0847",
  firstName: "Claire",
  age: 34,
  distance: "4 miles from you",
  vocation: "Landscape architect",
  signals: [
    { label: "Wants a slow build", evidence: "Both of you flagged pacing as the reason past relationships failed" },
    { label: "Sunday hiker", evidence: "You listed trail time as non negotiable, she logs a ridge walk most weekends" },
    { label: "Done with apps", evidence: "Deleted them 14 months ago, same as you" },
  ],
  narrative: [
    "Claire is the first candidate from your shortlist that cleared every screen in your file.",
    "You both described the same failure mode, moving too fast and resenting it, so your matchmaker is pacing this one deliberately.",
    "She reads as reserved for the first twenty minutes, then very funny. Ask about the rooftop meadow she is building over a parking garage.",
  ],
  datePlan: {
    when: "Thursday, 7:30 pm",
    where: "Quince Street Wine Bar",
    detail: "Corner table reserved under Tawkify. Quiet enough to talk, forty feet from your train stop.",
  },
  matchmaker: "Renee, your matchmaker since March",
};

// Matchmaker surface: the caseload.

export type CaseFile = {
  id: string;
  client: string;
  stage: "Intake" | "Curating" | "Introduced" | "Debrief";
  nextAction: string;
  due: string;
  heat: "calm" | "attention" | "urgent";
};

export const caseload: CaseFile[] = [
  { id: "C-3311", client: "Alex R.", stage: "Debrief", nextAction: "Collect date 2 feedback, both sides in", due: "today", heat: "urgent" },
  { id: "C-3287", client: "Maya K.", stage: "Curating", nextAction: "Review 3 flagged candidates", due: "today", heat: "attention" },
  { id: "C-3340", client: "Devon P.", stage: "Introduced", nextAction: "Confirm Thursday reservation", due: "tomorrow", heat: "calm" },
  { id: "C-3298", client: "Sarah L.", stage: "Intake", nextAction: "Write intake summary from call notes", due: "tomorrow", heat: "calm" },
  { id: "C-3251", client: "James T.", stage: "Curating", nextAction: "Shortlist stale, 9 days since last candidate", due: "overdue", heat: "urgent" },
];

export type CandidateRow = {
  id: string;
  name: string;
  screensPassed: number;
  screensTotal: number;
  flags: string[];
  standout: string;
};

export const shortlist: CandidateRow[] = [
  {
    id: "N-114",
    name: "Claire M.",
    screensPassed: 7,
    screensTotal: 7,
    flags: [],
    standout: "Same stated failure mode as client, wants deliberate pacing",
  },
  {
    id: "N-097",
    name: "Bianca F.",
    screensPassed: 6,
    screensTotal: 7,
    flags: ["Distance 40 mi, client capped at 25"],
    standout: "Strong values overlap, logistics weak",
  },
  {
    id: "N-121",
    name: "Rosa D.",
    screensPassed: 5,
    screensTotal: 7,
    flags: ["Timeline mismatch", "Wants relocation within a year"],
    standout: "High energy match, wrong season",
  },
];

// Assist drafts are mocked model output. In the real build these come from an
// LLM call with the case file as context, and nothing ships without the
// matchmaker's approval.
export const assistDraft = {
  intro:
    "Alex, meet Claire. You both told me the same story about why your last relationships ended, which almost never happens, and you both guard your Sundays for the same reason. I have booked the corner table at Quince Street for Thursday at 7:30. First names only for now, as always.",
  rationale: [
    "Both files name pacing as the primary past failure mode",
    "Shared non negotiable: outdoor time on weekends",
    "Both off apps for over a year, low novelty seeking",
  ],
};
