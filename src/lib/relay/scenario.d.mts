import type { IntentDef, Session } from "./engine.mjs";

export interface LedgerEntry {
  id: string;
  kind: string;
  state: string;
}

export interface Chip {
  text: string;
  intent: string | null;
}

export interface FlowNode {
  id: string;
  label: string;
  col: number;
  row: number;
}

export interface Scenario {
  brand: string;
  assistantName: string;
  agentName: string;
  escalations: {
    vulnerable: string;
    requested: string;
    lowConfidence: string;
  };
  customer: {
    name: string;
    account: string;
    address: string;
    phoneTail: string;
  };
  event: {
    id: string;
    feeder: string;
    kind: string;
    day: string;
    window: string;
  };
  ledger: LedgerEntry[];
  intents: IntentDef[];
  answers: Record<string, string[]>;
  copy: {
    dialNotice: string;
    announce: string[];
    optinAsk: string[];
    optinYes: string[];
    optinNo: string[];
    channelNotice: string;
    medical: string[];
    agentRequest: string[];
    fallbackClarify: string[];
    fallbackHandover: string[];
    closing: string[];
  };
  buildSuggestedReplies(session: Pick<Session, "flags" | "slots">): string[];
}

export declare function createScenario(): Scenario;
export declare function getChips(
  session: Pick<Session, "mode" | "expect" | "answered" | "flags">,
): Chip[];
export declare const FLOW_NODES: FlowNode[];
export declare const FLOW_EDGES: Array<[string, string]>;
