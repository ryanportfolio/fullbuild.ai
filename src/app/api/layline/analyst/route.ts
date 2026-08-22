/**
 * The Debrief analyst. POST a short conversation, get an SSE stream back:
 * status lines while tools run, text deltas as the answer arrives, one done
 * or error frame to close. Grounding is the whole point: the model can only
 * quote numbers it read through tools that run against the same seeded race
 * the replay renders.
 *
 * Mock mode (LAYLINE_ANALYST_MOCK=1) streams a deterministic answer computed
 * from the real tools and never touches the network, so dev and tests run
 * without a key. Live mode without a key degrades honestly to a 503.
 */
import Anthropic from "@anthropic-ai/sdk";
import { clock } from "@/lib/layline/format";
import type { RaceData } from "@/lib/layline/types";
import { raceData } from "@/lib/layline/analyst/data";
import { buildSystemPrompt } from "@/lib/layline/analyst/prompt";
import {
  MAX_MESSAGE_CHARS,
  MAX_TURNS,
  SSE_DELTA,
  SSE_DONE,
  SSE_ERROR,
  SSE_STATUS,
  SUGGESTED_QUESTIONS,
  serializeChip,
} from "@/lib/layline/analyst/protocol";
import type { AnalystMessage } from "@/lib/layline/analyst/protocol";
import {
  ANALYST_TOOLS,
  compareBoats,
  runTool,
  standingsAt,
  startReport,
  toolStatusLabel,
} from "@/lib/layline/analyst/tools";
import type { CompareOut, StandingsOut } from "@/lib/layline/analyst/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 4;
const MODEL = "claude-opus-5";

const encoder = new TextEncoder();

function frame(event: string, data: object): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */

function sameOriginRefused(req: Request): boolean {
  const ownHost = new URL(req.url).host;
  for (const header of ["origin", "referer"]) {
    const value = req.headers.get(header);
    if (value === null || value === "") continue;
    try {
      return new URL(value).host !== ownHost;
    } catch {
      return true;
    }
  }
  return false;
}

function validate(payload: unknown): AnalystMessage[] | { status: number; error: string } {
  if (typeof payload !== "object" || payload === null) {
    return { status: 422, error: "expected a JSON object with messages" };
  }
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 422, error: "messages must be a non-empty array" };
  }
  if (messages.length > MAX_TURNS) {
    return { status: 422, error: `at most ${MAX_TURNS} messages per request` };
  }
  const clean: AnalystMessage[] = [];
  for (const entry of messages) {
    if (typeof entry !== "object" || entry === null) {
      return { status: 422, error: "each message needs a role and content" };
    }
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") {
      return { status: 422, error: "message role must be user or assistant" };
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: 422, error: "message content must be a non-empty string" };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return { status: 422, error: `messages are capped at ${MAX_MESSAGE_CHARS} characters` };
    }
    clean.push({ role, content });
  }
  if (clean[clean.length - 1].role !== "user") {
    return { status: 422, error: "the last message must be from the user" };
  }
  return clean;
}

/* ------------------------------------------------------------------ */
/* Mock mode: deterministic answers computed from the real tools       */

interface MockStep {
  kind: "status" | "text";
  value: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[?!.]+$/, "").trim();
}

function matches(question: string, suggestion: string): boolean {
  return normalize(question).startsWith(normalize(suggestion));
}

function endWord(end: "pin" | "boat"): string {
  return end === "pin" ? "pin" : "committee boat";
}

function ordinal(rank: number): string {
  const words = ["first", "second", "third", "fourth", "fifth", "sixth"];
  return words[rank - 1] ?? `${rank}th`;
}

function asCompare(result: CompareOut | { error: string }): CompareOut {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function statusStep(race: RaceData, tool: string, input: object): MockStep {
  return { kind: "status", value: toolStatusLabel(race, tool, input) };
}

function rowFor(standings: StandingsOut, boatId: string) {
  return standings.rows.find((row) => row.boatId === boatId);
}

function mockStart(race: RaceData): MockStep[] {
  const steps: MockStep[] = [statusStep(race, "start_report", {})];
  const report = startReport(race);
  const [first, second] = report.rows;
  const firstChip = serializeChip(first.crossedAfterGunSeconds ?? 0, first.boatId);
  const secondChip = serializeChip(second.crossedAfterGunSeconds ?? 0, second.boatId);
  steps.push({
    kind: "text",
    value:
      `${first.sail} won the start ${firstChip}. At the gun it sat ${first.distanceToLineMeters} meters short of the line with ` +
      `${first.sogAtGunKnots} knots on, off the ${endWord(first.nearerEnd)} end, and it crossed ${first.crossedAfterGunSeconds} seconds ` +
      `after the gun, first in the fleet. ${second.sail} was next across at ${second.crossedAfterGunSeconds} seconds, ` +
      `from the ${endWord(second.nearerEnd)} end ${secondChip}.`,
  });
  return steps;
}

function gapWords(gapSeconds: number): string {
  if (gapSeconds <= 0) return "less than a second";
  return gapSeconds === 1 ? "1 second" : `${gapSeconds} seconds`;
}

function mockLeadChange(race: RaceData): MockStep[] {
  const steps: MockStep[] = [];
  steps.push(statusStep(race, "standings_at", { t: 20 }));
  const early = standingsAt(race, 20);
  steps.push(statusStep(race, "standings_at", { t: 30 }));
  const later = standingsAt(race, 30);
  const earlyLeader = early.rows[0];
  const laterLeader = later.rows[0];
  steps.push(statusStep(race, "compare_boats", { a: laterLeader.boatId, b: earlyLeader.boatId }));
  const cmp = asCompare(compareBoats(race, laterLeader.boatId, earlyLeader.boatId, 20, 30));
  steps.push(statusStep(race, "standings_at", { t: 35 }));
  const afterMark = standingsAt(race, 35);
  const wasBehindBy = rowFor(early, laterLeader.boatId)?.gapSeconds ?? 0;
  const markLeader = afterMark.rows[0];
  const markGap = rowFor(afterMark, earlyLeader.boatId)?.gapSeconds ?? 0;
  const markLine =
    markLeader.boatId === laterLeader.boatId && markLeader.leg !== "beat"
      ? `The pass stuck at the windward mark: ${laterLeader.sail} reached it first and settled onto the run ` +
        `${gapWords(markGap)} clear of ${earlyLeader.sail} ${serializeChip(35, laterLeader.boatId)}, and it led the rest of the way.`
      : `At 0:35 the lead read ${markLeader.sail} ${serializeChip(35, markLeader.boatId)}.`;
  steps.push({
    kind: "text",
    value:
      `At ${early.raceClock} ${earlyLeader.sail} led the beat with ${laterLeader.sail} ${gapWords(wasBehindBy)} back ` +
      `${serializeChip(20, earlyLeader.boatId)}. By ${later.raceClock} ${laterLeader.sail} had its bow in front ` +
      `${serializeChip(30, laterLeader.boatId)}, after averaging ${cmp.a.avgSogKnots} knots over the ground to ` +
      `${cmp.b.avgSogKnots} for ${earlyLeader.sail} through that stretch. ${markLine}`,
  });
  return steps;
}

function mockDownwind(race: RaceData): MockStep[] {
  const steps: MockStep[] = [];

  /* The window where every boat is on the run: from the last rounding boat's
   * first run sample to just before the first finisher. */
  let runFrom = -Infinity;
  for (const boat of race.boats) {
    const first = race.progress[boat.id].find((sample) => sample.leg === "run");
    if (first !== undefined && first.t > runFrom) runFrom = first.t;
  }
  let firstFinish = Infinity;
  for (const result of race.results) if (result.elapsed < firstFinish) firstFinish = result.elapsed;
  const from = Math.ceil(runFrom);
  const to = Math.floor(firstFinish);

  const entries: { boatId: string; sail: string; vmgKnots: string }[] = [];
  for (let i = 0; i + 1 < race.boats.length; i += 2) {
    const a = race.boats[i];
    const b = race.boats[i + 1];
    steps.push(statusStep(race, "compare_boats", { a: a.id, b: b.id }));
    const cmp = asCompare(compareBoats(race, a.id, b.id, from, to));
    entries.push({ boatId: cmp.a.boatId, sail: cmp.a.sail, vmgKnots: cmp.a.avgVmgKnots });
    entries.push({ boatId: cmp.b.boatId, sail: cmp.b.sail, vmgKnots: cmp.b.avgVmgKnots });
  }
  entries.sort(
    (a, b) =>
      Number(b.vmgKnots) - Number(a.vmgKnots) || (a.boatId < b.boatId ? -1 : 1),
  );
  const [top, next] = entries;

  steps.push(statusStep(race, "standings_at", { t: 60 }));
  const final = standingsAt(race, 60);
  const topRank = rowFor(final, top.boatId)?.rank ?? 0;
  const mid = Math.round((from + to) / 2);
  const finish =
    topRank === 1
      ? `It carried that pace all the way to the win.`
      : `The pace was not enough for the win: ${top.sail} finished ${ordinal(topRank)}.`;
  steps.push({
    kind: "text",
    value:
      `${top.sail} was the fastest boat downwind, averaging ${top.vmgKnots} knots of VMG between ${clock(from)} and ${clock(to)}, ` +
      `when the whole fleet was on the run ${serializeChip(mid, top.boatId)}. ${next.sail} was next at ${next.vmgKnots}. ${finish}`,
  });
  return steps;
}

function mockStandings(race: RaceData): MockStep[] {
  const steps: MockStep[] = [statusStep(race, "standings_at", { t: 45 })];
  const mid = standingsAt(race, 45);
  steps.push(statusStep(race, "standings_at", { t: 60 }));
  const final = standingsAt(race, 60);
  const [lead, second, third] = mid.rows;
  const [w1, w2, w3] = final.rows;
  steps.push({
    kind: "text",
    value:
      `The standings tell that one best. At ${mid.raceClock} ${lead.sail} led on the ${lead.leg} ${serializeChip(45, lead.boatId)}, ` +
      `with ${second.sail} ${gapWords(second.gapSeconds)} back and ${third.sail} third at ${gapWords(third.gapSeconds)}. ` +
      `By ${final.raceClock} the race was done: ${w1.sail} first, ${w2.sail} second, ${w3.sail} third ${serializeChip(60)}.`,
  });
  return steps;
}

function mockSteps(race: RaceData, question: string): MockStep[] {
  if (matches(question, SUGGESTED_QUESTIONS[0])) return mockStart(race);
  if (matches(question, SUGGESTED_QUESTIONS[1])) return mockLeadChange(race);
  if (matches(question, SUGGESTED_QUESTIONS[2])) return mockDownwind(race);
  return mockStandings(race);
}

function mockResponse(race: RaceData, question: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const step of mockSteps(race, question)) {
          if (step.kind === "status") {
            controller.enqueue(frame(SSE_STATUS, { label: step.value }));
            await delay(15);
            continue;
          }
          const chunks = step.value.match(/\S+\s*/g) ?? [step.value];
          for (const chunk of chunks) {
            controller.enqueue(frame(SSE_DELTA, { text: chunk }));
            await delay(12);
          }
        }
        controller.enqueue(frame(SSE_DONE, { ok: true }));
        controller.close();
      } catch {
        try {
          controller.close();
        } catch {
          /* stream already gone */
        }
      }
    },
  });
  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Live mode                                                           */

/* Best-effort spend guard for the paid path. Serverless instances each keep
 * their own book, and a cold start empties it, so this bounds casual abuse
 * per warm instance rather than promising a durable quota; the provider
 * spend cap is the real ceiling. Mock mode never reaches it. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const rateBook = new Map<string, { count: number; windowStart: number }>();

function rateLimited(req: Request, now: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const entry = rateBook.get(ip);
  if (entry === undefined || now - entry.windowStart >= RATE_WINDOW_MS) {
    if (rateBook.size > 500) {
      for (const [key, value] of rateBook) {
        if (now - value.windowStart >= RATE_WINDOW_MS) rateBook.delete(key);
      }
    }
    rateBook.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function liveResponse(
  race: RaceData,
  history: AnalystMessage[],
  clientSignal: AbortSignal,
): Response {
  const anthropic = new Anthropic();
  /* One aborter covers both ways a viewer leaves: the request signal firing
   * and the response stream being cancelled. Without it the model keeps
   * generating, and billing, until finalMessage settles. */
  const aborter = new AbortController();
  if (clientSignal.aborted) aborter.abort();
  else clientSignal.addEventListener("abort", () => aborter.abort());
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(race),
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: object): void => {
        controller.enqueue(frame(event, data));
      };
      try {
        let toolRounds = 0;
        for (;;) {
          const modelStream = anthropic.messages.stream(
            {
              model: MODEL,
              max_tokens: 700,
              output_config: { effort: "low" },
              system,
              tools: ANALYST_TOOLS,
              messages,
            },
            { signal: aborter.signal },
          );
          modelStream.on("text", (delta) => send(SSE_DELTA, { text: delta }));
          const message = await modelStream.finalMessage();

          if (message.stop_reason === "refusal") {
            send(SSE_ERROR, { message: "The analyst passed on that one. Ask about the race." });
            controller.close();
            return;
          }
          if (message.stop_reason !== "tool_use") {
            send(SSE_DONE, { ok: true });
            controller.close();
            return;
          }
          if (toolRounds >= MAX_TOOL_ROUNDS) {
            send(SSE_ERROR, { message: "The analyst ran long. Ask a narrower question." });
            controller.close();
            return;
          }
          toolRounds += 1;

          const toolUses = message.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );
          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const use of toolUses) {
            send(SSE_STATUS, { label: toolStatusLabel(race, use.name, use.input) });
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: runTool(race, use.name, use.input),
            });
          }
          /* Every tool_result goes back in one user message. */
          messages.push({ role: "user", content: results });
        }
      } catch (error) {
        if (aborter.signal.aborted || error instanceof Anthropic.APIUserAbortError) {
          /* The viewer left; nobody is reading. Close without an error frame. */
          try {
            controller.close();
          } catch {
            /* stream already gone */
          }
          return;
        }
        const message =
          error instanceof Anthropic.RateLimitError
            ? "The analyst is busy. Give it a minute."
            : error instanceof Anthropic.AuthenticationError
              ? "The analyst is offline right now."
              : "The analyst dropped the connection. Ask again.";
        try {
          controller.enqueue(frame(SSE_ERROR, { message }));
          controller.close();
        } catch {
          /* client already went away */
        }
      }
    },
    cancel() {
      aborter.abort();
    },
  });
  return sseResponse(stream);
}

/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  if (sameOriginRefused(req)) {
    return jsonError(403, "cross-origin request refused");
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "unreadable request body");
  }

  const validated = validate(payload);
  if (!Array.isArray(validated)) {
    return jsonError(validated.status, validated.error);
  }

  const race = raceData();

  if (process.env.LAYLINE_ANALYST_MOCK === "1") {
    return mockResponse(race, validated[validated.length - 1].content);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(503, "analyst offline");
  }

  if (rateLimited(req, Date.now())) {
    return jsonError(429, "too many requests, give it a minute");
  }

  return liveResponse(race, validated, req.signal);
}
