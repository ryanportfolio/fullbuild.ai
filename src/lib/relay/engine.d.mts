import type { Scenario } from "./scenario.mjs";

export interface IntentDef {
  id: string;
  cap?: number;
  keywords: Record<string, number>;
  phrases?: Array<{ text: string; bonus: number }>;
}

export interface RankedIntent {
  id: string;
  confidence: number;
  matched: string[];
}

export interface Entity {
  type: string;
  value: string;
}

export interface Read {
  text: string;
  ranked: RankedIntent[];
  top: RankedIntent;
  entities: Entity[];
  sentiment: number;
  resolved?: string;
}

export interface HandoverPacket {
  reason: string;
  agentName: string;
  summary: string[];
  suggestedReplies: string[];
}

export interface Wrapup {
  disposition: string[];
  handledBy: string;
  inboundCount: number;
  meanConfidence: number;
  sentiment: number;
}

export interface Session {
  scenario: Scenario;
  nodeId: string;
  channel: "chat" | "sms";
  mode: "bot" | "human" | "wrapped";
  expect: string | null;
  slots: { smsOptIn?: boolean; equipment?: string };
  flags: { vulnerable: boolean; agentRequested: boolean };
  consecutiveMisses: number;
  answered: string[];
  reads: Read[];
  handover: HandoverPacket | null;
  wrapup: Wrapup | null;
}

export type EngineEvent =
  | { type: "read"; read: Read }
  | { type: "reply"; text: string; delayMs: number }
  | { type: "system"; text: string }
  | { type: "channel"; to: "chat" | "sms" }
  | { type: "handover"; packet: HandoverPacket }
  | { type: "wrapup"; wrapup: Wrapup };

export declare const CONFIDENCE_THRESHOLD: number;
export declare const CONFIDENCE_CEILING: number;
export declare function tokenize(text: string): string[];
export declare function classify(
  text: string,
  intents: IntentDef[],
): RankedIntent[];
export declare function extractEntities(text: string): Entity[];
export declare function scoreSentiment(text: string): number;
export declare function computeDelay(text: string): number;
export declare function createSession(scenario: Scenario): Session;
export declare function ingest(
  session: Session,
  text: string,
): { session: Session; events: EngineEvent[] };
export declare function buildHandoverPacket(
  session: Session,
  reason: string,
): HandoverPacket;
export declare function buildWrapup(session: Session): Wrapup;
export declare function openingEvents(scenario: Scenario): EngineEvent[];
