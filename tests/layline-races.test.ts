/**
 * The race library: the sanity audit every shipped seed has to pass, the
 * registry contract, the analyst route's race binding, and the store swap.
 * Run: npx --yes tsx --test tests/layline-races.test.ts
 *
 * The audit below is the merged version of the three seed hunts that picked
 * these seeds, run here over every race in the registry including the shipped
 * one. `generateRace` is deterministic, so every number is safe to pin: if one
 * of these moves without a change to sim.ts, something upstream broke.
 *
 * Gates 1 to 8 fail the test. Measure 9 is recorded and never fails: a tack
 * away from an offset windward mark raises straight-line range to that mark
 * honestly, and the worst run in the hunt belongs to the shipped race.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateRace, polarFrac } from "../src/lib/layline/sim";
import {
  briefFacts,
  prestartFrame,
  prestartTracks,
  prestartTwdSeries,
  scaleStep,
  twdSwing,
  twdBand,
  windReading,
  windReadingAt,
} from "../src/lib/layline/brief";
import { startLineOf, startReadingAt } from "../src/lib/layline/analytics";
import { poseAt, windAt } from "../src/lib/layline/interpolate";
import { startReport } from "../src/lib/layline/analyst/tools";
import { clock } from "../src/lib/layline/format";
import { DEFAULT_RACE_ID, RACES, isRaceId, raceMeta } from "../src/lib/layline/races";
import { SUGGESTED_QUESTIONS, parseChips } from "../src/lib/layline/analyst/protocol";
import { FIX_HZ, PROGRESS_HZ, RACE_SEED } from "../src/lib/layline/types";
import type { Fix, LegName, ProgressSample, RaceData } from "../src/lib/layline/types";
import { POST } from "../src/app/api/layline/analyst/route";
import {
  ANALYST_MAX,
  RAIL_MIN,
  clampPaneWidth,
  parseWorkspacePreferences,
  raceMatchesSearch,
  sortPinnedRows,
} from "../src/app/prototype/layline/races/workspaceState";
import {
  AUTOPLAY_FROM,
  OPEN_AT,
  pointAtRace,
  raceData,
  useReplay,
} from "../src/components/layline/store";

/* ------------------------------------------------------------------ */
/* Audit thresholds                                                    */

/* The winner's own elapsed, not race.tMax: tMax is the replay window and runs
 * past the last finisher, 63.25 s on the shipped seed against a 51.52 s win.
 * The registry lands at 47.30, 51.38 and 51.52. */
const WIN_MIN_S = 45;
const WIN_MAX_S = 60;
/* Registry observed 4.35 to 8.21 s. */
const SPREAD_MIN_S = 2;
const SPREAD_MAX_S = 35;
/* Worst continuous loss of ground observed anywhere in the hunt is 1.0 s. */
const BACKWARDS_MAX_S = 8;
/* The sim caps sog at 11.3 m/s, so 1/FIX_HZ can never cover more than 2.83 m.
 * Worst observed is 2.34 m. */
const FIX_STEP_MAX_M = 4;
/* Median absolute TWA on the beat, which doubled is the tacking angle. */
const BEAT_TWA_MIN_DEG = 30;
const BEAT_TWA_MAX_DEG = 60;

/* ------------------------------------------------------------------ */
/* Audit helpers                                                       */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Longest continuous stretch, in seconds, over which a sampled value only
 * rises. `keep` drops samples that should not be judged at all, and dropping
 * one breaks the run rather than joining what sits either side of it.
 */
function longestRise(values: number[], keep: (index: number) => boolean, hz: number): number {
  let best = 0;
  let run = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (!keep(i) || !keep(i - 1)) {
      run = 0;
      continue;
    }
    if (values[i] > values[i - 1] + 1e-9) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best / hz;
}

interface LeaderSegment {
  boatId: string;
  sail: string;
  from: number;
  to: number;
  leg: LegName;
}

/**
 * The leader timeline, collapsed into segments. Rank 1 in the progress feed is
 * the smallest distance to finish at every sample where anyone is still racing,
 * which the audit asserts below, so this is the lead the standings dock shows.
 *
 * t = 0 is excluded: that sample still carries entry order per the
 * ProgressSample doc comment, so counting it manufactures a change at t = 0.5
 * in every seed. Prestart samples are excluded for the same reason.
 */
function leaderSegments(race: RaceData): LeaderSegment[] {
  const leading: { t: number; boatId: string; sail: string; leg: LegName }[] = [];
  for (const boat of race.boats) {
    for (const sample of race.progress[boat.id] ?? []) {
      if (sample.t <= 0 || sample.rank !== 1 || sample.leg === "prestart") continue;
      leading.push({ t: sample.t, boatId: boat.id, sail: boat.sail, leg: sample.leg });
    }
  }
  leading.sort((a, b) => a.t - b.t);

  const segments: LeaderSegment[] = [];
  for (const entry of leading) {
    const open = segments[segments.length - 1];
    if (open !== undefined && open.boatId === entry.boatId) {
      open.to = entry.t;
      continue;
    }
    segments.push({ boatId: entry.boatId, sail: entry.sail, from: entry.t, to: entry.t, leg: entry.leg });
  }
  return segments;
}

function sailOf(race: RaceData, boatId: string): string {
  return race.boats.find((boat) => boat.id === boatId)?.sail ?? boatId;
}

/* ------------------------------------------------------------------ */
/* Gates 1 to 8, plus the recorded measures                            */

function auditRace(race: RaceData): {
  record: string[];
  worstGeomRiseSeconds: number;
  worstGeomRiseBoat: string;
} {
  const record: string[] = [];

  /* 1. Fleet completeness. */
  const byRank = [...race.results].sort((a, b) => a.rank - b.rank);
  assert.equal(race.results.length, race.boats.length, "one result per boat");
  assert.deepEqual(
    byRank.map((result) => result.rank),
    race.boats.map((_, index) => index + 1),
    "ranks run 1 to the fleet size with no gap and no tie",
  );
  for (const boat of race.boats) {
    assert.ok(
      race.results.some((result) => result.boatId === boat.id),
      `no result for ${boat.sail}`,
    );
    assert.equal(
      race.events.filter((event) => event.kind === "rounding" && event.boatId === boat.id).length,
      1,
      `${boat.sail} does not have exactly one rounding event`,
    );
    assert.equal(
      race.events.filter((event) => event.kind === "finish" && event.boatId === boat.id).length,
      1,
      `${boat.sail} does not have exactly one finish event`,
    );
  }

  /* 2 and 3. Winning elapsed and finish spread. */
  const winner = byRank[0];
  const last = byRank[byRank.length - 1];
  const spread = last.elapsed - winner.elapsed;
  assert.ok(
    winner.elapsed >= WIN_MIN_S && winner.elapsed <= WIN_MAX_S,
    `winning elapsed ${winner.elapsed.toFixed(2)}s outside ${WIN_MIN_S} to ${WIN_MAX_S}`,
  );
  assert.ok(
    spread >= SPREAD_MIN_S && spread <= SPREAD_MAX_S,
    `finish spread ${spread.toFixed(2)}s outside ${SPREAD_MIN_S} to ${SPREAD_MAX_S}`,
  );

  const roundingTimes = new Map<string, number>();
  for (const event of race.events) {
    if (event.kind === "rounding" && event.boatId !== undefined) {
      roundingTimes.set(event.boatId, event.t);
    }
  }

  const mark = race.course.windward;
  const gateX = (race.course.startPin.x + race.course.startBoat.x) / 2;
  const gateY = (race.course.startPin.y + race.course.startBoat.y) / 2;

  let worstBackSeconds = 0;
  let worstBackBoat = "";
  let worstStepMeters = 0;
  let worstStepBoat = "";
  let worstGeomRiseSeconds = 0;
  let worstGeomRiseBoat = "";
  const beatTwa: number[] = [];
  const perBoatBeatTwa: string[] = [];

  for (const boat of race.boats) {
    const fixes: Fix[] = race.fixes[boat.id] ?? [];
    const progress: ProgressSample[] = race.progress[boat.id] ?? [];
    assert.ok(fixes.length > 0, `${boat.sail} has no fixes`);
    assert.ok(progress.length > 0, `${boat.sail} has no progress samples`);

    const finishAt = race.results.find((result) => result.boatId === boat.id)!.elapsed;
    const roundAt = roundingTimes.get(boat.id) ?? Infinity;

    /* 4. Backwards, published measure. dtf is the number the standings dock
     * counts down, so a sustained rise is a boat losing ground on screen. The
     * last second before a boat's own finish is skipped: dtf pins to zero
     * there. */
    const back = longestRise(
      progress.map((sample) => sample.dtf),
      (index) => {
        const sample = progress[index];
        return sample.t >= 0 && sample.leg !== "prestart" && sample.t < finishAt - 1;
      },
      PROGRESS_HZ,
    );
    if (back > worstBackSeconds) {
      worstBackSeconds = back;
      worstBackBoat = boat.sail;
    }

    /* 5, 6 and 7 over the fix stream. */
    let sawPrestartSide = false;
    let sawCourseSide = false;
    for (let i = 0; i < fixes.length; i += 1) {
      const fix = fixes[i];
      for (const [field, value] of Object.entries(fix)) {
        assert.ok(
          Number.isFinite(value),
          `${boat.sail} fix at index ${i} has a non finite ${field}`,
        );
      }
      if (fix.t < 0 && fix.y < 0) sawPrestartSide = true;
      if (fix.t >= 0 && fix.y > 0) sawCourseSide = true;
      if (i === 0) continue;
      const previous = fixes[i - 1];
      const step = Math.hypot(fix.x - previous.x, fix.y - previous.y);
      if (step > worstStepMeters) {
        worstStepMeters = step;
        worstStepBoat = boat.sail;
      }
    }
    assert.ok(sawPrestartSide, `${boat.sail} never sits on the prestart side before the gun`);
    assert.ok(sawCourseSide, `${boat.sail} never crosses onto the course side after the gun`);

    for (const sample of progress) {
      assert.ok(Number.isFinite(sample.t), `${boat.sail} progress has a non finite t`);
      assert.ok(Number.isFinite(sample.dtf), `${boat.sail} progress has a non finite dtf`);
      assert.ok(Number.isFinite(sample.rank), `${boat.sail} progress has a non finite rank`);
    }

    /* 8. Layline believability. Median absolute TWA over the beat, taken from
     * the whole fleet's beat fixes: the median of one boat's beat can sit wide
     * while the fleet's tacking angle reads normal. The first 2 s and the last
     * 3 s before the boat's own rounding are dropped, where a boat is still
     * accelerating off the line or already easing into the mark. */
    const ownBeat = fixes
      .filter((fix) => fix.t > 2 && fix.t < roundAt - 3)
      .map((fix) => Math.abs(fix.twa));
    if (ownBeat.length > 0) {
      beatTwa.push(...ownBeat);
      perBoatBeatTwa.push(`${boat.sail} ${median(ownBeat).toFixed(1)}`);
    }

    /* 9. Backwards, geometric measure. Recorded, never failed. */
    const range = progress.map((sample) => {
      const fix = fixes.reduce((best, current) =>
        Math.abs(current.t - sample.t) < Math.abs(best.t - sample.t) ? current : best,
      );
      const onBeat = sample.leg === "beat";
      return Math.hypot(fix.x - (onBeat ? mark.x : gateX), fix.y - (onBeat ? mark.y : gateY));
    });
    const geom = longestRise(
      range,
      (index) => {
        const sample = progress[index];
        if (sample.t < 1) return false;
        if (sample.leg === "prestart" || sample.leg === "finished") return false;
        if (Math.abs(sample.t - roundAt) <= 3) return false;
        return sample.t <= finishAt - 0.5;
      },
      PROGRESS_HZ,
    );
    if (geom > worstGeomRiseSeconds) {
      worstGeomRiseSeconds = geom;
      worstGeomRiseBoat = boat.sail;
    }
  }

  assert.ok(
    worstBackSeconds <= BACKWARDS_MAX_S,
    `${worstBackBoat} loses ground for ${worstBackSeconds.toFixed(2)}s straight`,
  );
  assert.ok(
    worstStepMeters < FIX_STEP_MAX_M,
    `${worstStepBoat} moves ${worstStepMeters.toFixed(2)}m between fixes at ${FIX_HZ} Hz`,
  );

  const medianBeatTwa = median(beatTwa);
  assert.ok(
    medianBeatTwa >= BEAT_TWA_MIN_DEG && medianBeatTwa <= BEAT_TWA_MAX_DEG,
    `median beat TWA ${medianBeatTwa.toFixed(1)} deg is a ${(medianBeatTwa * 2).toFixed(1)} deg tacking angle`,
  );

  /* 6, the rest of the sweep. */
  for (const sample of race.wind) {
    assert.ok(
      Number.isFinite(sample.t) && Number.isFinite(sample.twd) && Number.isFinite(sample.tws),
      `non finite wind sample at t=${sample.t}`,
    );
  }
  for (const result of race.results) {
    assert.ok(Number.isFinite(result.elapsed), `${result.boatId} has a non finite elapsed`);
  }
  for (const event of race.events) {
    assert.ok(Number.isFinite(event.t), `${event.kind} event has a non finite t`);
  }
  assert.ok(Number.isFinite(race.tMin) && Number.isFinite(race.tMax), "tMin and tMax are finite");
  assert.ok(race.tMax > race.tMin, "tMax runs after tMin");

  /* Rank 1 is the smallest distance to finish at every sample where anyone is
   * still racing, which is what lets the leader timeline read off rank alone.
   * Boats that have finished all sit at dtf 0 and tie there, so they are out. */
  const samplesByTime = new Map<number, { boatId: string; rank: number; dtf: number; leg: LegName }[]>();
  for (const boat of race.boats) {
    for (const sample of race.progress[boat.id] ?? []) {
      if (sample.t <= 0 || sample.leg === "prestart" || sample.leg === "finished") continue;
      const row = samplesByTime.get(sample.t) ?? [];
      row.push({ boatId: boat.id, rank: sample.rank, dtf: sample.dtf, leg: sample.leg });
      samplesByTime.set(sample.t, row);
    }
  }
  for (const [t, rows] of samplesByTime) {
    const leader = rows.find((row) => row.rank === 1);
    if (leader === undefined) continue;
    const closest = rows.reduce((best, row) => (row.dtf < best.dtf ? row : best));
    assert.equal(
      leader.boatId,
      closest.boatId,
      `at t=${t} rank 1 is ${leader.boatId} but ${closest.boatId} is closer to the finish`,
    );
  }

  /* Recorded for the record, gated on nothing. */
  const roundings = race.events.filter((event) => event.kind === "rounding").map((event) => event.t);
  const gaps = byRank.slice(1).map((result, index) => (result.elapsed - byRank[index].elapsed).toFixed(2));
  record.push(
    `order ${byRank.map((r) => `${r.rank}.${sailOf(race, r.boatId)} ${r.elapsed.toFixed(2)}`).join(" | ")}`,
    `margin ${(byRank[1].elapsed - winner.elapsed).toFixed(2)}s  gaps ${gaps.join(" ")}  spread ${spread.toFixed(2)}s  tMax ${race.tMax}`,
    `roundingSpread ${(Math.max(...roundings) - Math.min(...roundings)).toFixed(2)}s  tws ${Math.min(...race.wind.map((w) => w.tws)).toFixed(2)} to ${Math.max(...race.wind.map((w) => w.tws)).toFixed(2)} m/s  twd ${Math.min(...race.wind.map((w) => w.twd)).toFixed(2)} to ${Math.max(...race.wind.map((w) => w.twd)).toFixed(2)} deg`,
    `worstBackwards ${worstBackSeconds.toFixed(2)}s ${worstBackBoat}  maxFixStep ${worstStepMeters.toFixed(2)}m ${worstStepBoat}`,
    `beatTwa median ${medianBeatTwa.toFixed(1)} deg, tacking angle ${(medianBeatTwa * 2).toFixed(1)} deg, per boat ${perBoatBeatTwa.join(", ")}`,
    `geometricRise ${worstGeomRiseSeconds.toFixed(2)}s ${worstGeomRiseBoat} (recorded, never gated)`,
    `leaders ${leaderSegments(race).map((s) => `${s.sail} ${s.from} to ${s.to} on the ${s.leg}`).join(" > ")}`,
  );

  return { record, worstGeomRiseSeconds, worstGeomRiseBoat };
}

/* ------------------------------------------------------------------ */
/* The audit, over every seed in the registry                          */

for (const meta of RACES) {
  test(`race ${meta.id} passes the sanity audit`, () => {
    const race = generateRace(meta.seed);
    assert.equal(race.seed, meta.seed);
    const { record, worstGeomRiseSeconds, worstGeomRiseBoat } = auditRace(race);
    console.log(`\n${meta.id} seed ${meta.seed}\n  ${record.join("\n  ")}`);
    /* Recorded, not gated: a tack away from an offset windward mark raises
     * straight-line range honestly, and the shipped race owns the worst run in
     * the hunt at 6.50 s. Printed so a regression is visible in the log. */
    if (worstGeomRiseSeconds > BACKWARDS_MAX_S) {
      console.log(
        `  warning: ${worstGeomRiseBoat} range to the mark rose for ${worstGeomRiseSeconds.toFixed(2)}s`,
      );
    }
  });
}

test("two runs of the same registry seed are byte-identical", () => {
  for (const meta of RACES) {
    assert.equal(
      JSON.stringify(generateRace(meta.seed)),
      JSON.stringify(generateRace(meta.seed)),
      `${meta.id} is not deterministic`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Registry contract                                                   */

test("the registry ships three races with the shipped race first", () => {
  assert.equal(RACES.length, 3);
  assert.equal(RACES[0].seed, RACE_SEED);
  assert.equal(DEFAULT_RACE_ID, RACES[0].id);
  const ids = RACES.map((meta) => meta.id);
  assert.equal(new Set(ids).size, ids.length, "race ids are unique");
  const seeds = RACES.map((meta) => meta.seed);
  assert.equal(new Set(seeds).size, seeds.length, "race seeds are unique");
  for (const id of ids) {
    assert.equal(isRaceId(id), true);
    assert.equal(raceMeta(id)?.id, id);
  }
  assert.equal(isRaceId("no-such-race"), false);
  assert.equal(isRaceId(String(RACE_SEED)), false, "a raw seed is not a race id");
  assert.equal(raceMeta("no-such-race"), undefined);
});

test("race workspace preferences filter stale ids and clamp stored widths", () => {
  const validIds = new Set(RACES.map((race) => race.id));
  const preferences = parseWorkspacePreferences(
    JSON.stringify({
      pinned: ["sable-reach", "retired-race", "sable-reach"],
      archived: ["kestrel-sound", "retired-race"],
      railWidth: 20,
      analystWidth: 900,
      railSide: "right",
      railCollapsed: true,
    }),
    validIds,
  );

  assert.deepEqual(preferences.pinned, ["sable-reach"]);
  assert.deepEqual(preferences.archived, ["kestrel-sound"]);
  assert.equal(preferences.railWidth, RAIL_MIN);
  assert.equal(preferences.analystWidth, ANALYST_MAX);
  assert.equal(preferences.railSide, "right");
  assert.equal(preferences.railCollapsed, true);
});

test("search is only a view and pinned rows sort ahead of registry order", () => {
  const selectedId = "long-beach";
  const rows = RACES.map(({ id, name, venue, dateLabel }) => ({ id, name, venue, dateLabel }));
  const visible = rows.filter((row) => raceMatchesSearch(row, "13 nov"));
  assert.deepEqual(visible.map((row) => row.id), ["kestrel-sound"]);
  assert.equal(selectedId, "long-beach", "filtering changed the loaded race");

  const sorted = sortPinnedRows(rows, new Set(["sable-reach"]));
  assert.deepEqual(sorted.map((row) => row.id), ["sable-reach", "long-beach", "kestrel-sound"]);
});

test("a resized boundary clamps to pane and viewer limits", () => {
  assert.equal(
    clampPaneWidth({
      pane: "rail",
      requested: 999,
      workspaceWidth: 1176,
      otherWidth: 340,
    }),
    252,
  );
  assert.equal(
    clampPaneWidth({
      pane: "analyst",
      requested: 10,
      workspaceWidth: 1568,
      otherWidth: 280,
    }),
    320,
  );
});

test("every race carries three suggested questions written for its own fleet", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    assert.equal(meta.suggestedQuestions.length, 3, `${meta.id} does not offer three questions`);
    for (const question of meta.suggestedQuestions) {
      assert.ok(question.trim().length > 0, `${meta.id} has an empty question`);
      assert.doesNotMatch(question, /[.—–]/, `${meta.id} question breaks the copy rules: ${question}`);
      /* Any sail number in a question has to belong to this race's fleet. */
      for (const sail of question.match(/[A-Z]{3} \d+/g) ?? []) {
        assert.ok(
          race.boats.some((boat) => boat.sail === sail),
          `${meta.id} asks about ${sail}, which is not in its fleet`,
        );
      }
    }
    assert.equal(
      new Set(meta.suggestedQuestions).size,
      3,
      `${meta.id} repeats a suggested question`,
    );

    /* The second question is the one the mock answers from the lead change, so
     * the boat it names has to be the boat that actually went through last. */
    const named = meta.suggestedQuestions[1].match(/[A-Z]{3} \d+/g) ?? [];
    if (named.length > 0) {
      const segments = leaderSegments(race);
      assert.equal(
        named[0],
        segments[segments.length - 1].sail,
        `${meta.id} credits the lead to a boat that did not take it last`,
      );
    }
  }
});

test("the story page's three questions are the shipped race's three", () => {
  assert.deepEqual([...RACES[0].suggestedQuestions], [...SUGGESTED_QUESTIONS]);
});

/* ------------------------------------------------------------------ */
/* The reading both engines have to agree on                           */

/* The replay simulates in the browser while the analyst and the finish table
 * simulate on the server, and Math.sin, exp, log and atan2 are implementation
 * defined, so the same seed can put a different boat fourth in Node and in
 * Chromium. Seed 20281016 did: 0.95 s apart on FRA 12, with the two finish
 * clocks a second apart on one page.
 *
 * `node scripts/layline-cross-engine-audit.mjs` is the gate a seed passes
 * before it joins the registry, and it needs a browser, so it does not run
 * here. What runs here is the reading it agreed on, pinned so that changing a
 * seed fails this test and sends whoever changed it back through the audit. */
const FINISH_CLOCKS: Record<string, string[]> = {
  "long-beach": ["USA 4 0:51", "JPN 18 0:52", "GBR 21 0:55", "NZL 7 0:56", "AUS 33 0:57", "FRA 12 0:57"],
  "kestrel-sound": ["GBR 21 0:47", "FRA 12 0:51", "USA 4 0:53", "AUS 33 0:53", "JPN 18 0:55", "NZL 7 0:55"],
  "sable-reach": ["FRA 12 0:51", "AUS 33 0:51", "USA 4 0:52", "NZL 7 0:53", "JPN 18 0:55", "GBR 21 0:55"],
};

test("every race finishes in the order the cross engine audit cleared", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const byRank = [...race.results].sort((a, b) => a.rank - b.rank);
    assert.deepEqual(
      byRank.map((result) => `${sailOf(race, result.boatId)} ${clock(result.elapsed)}`),
      FINISH_CLOCKS[meta.id],
      `${meta.id} finish order or clock moved, so rerun scripts/layline-cross-engine-audit.mjs`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Lead changes, the input mockLeadChange has to agree with            */

const LEAD_CHANGES: Record<string, { changes: number; sail: string; t: number; leg: LegName }> = {
  "long-beach": { changes: 5, sail: "USA 4", t: 28, leg: "beat" },
  "kestrel-sound": { changes: 7, sail: "GBR 21", t: 18, leg: "beat" },
  "sable-reach": { changes: 3, sail: "FRA 12", t: 36.5, leg: "run" },
};

test("each race's leader timeline holds its pinned changes and decisive pass", () => {
  for (const meta of RACES) {
    const expected = LEAD_CHANGES[meta.id];
    assert.ok(expected !== undefined, `no pinned leader timeline for ${meta.id}`);
    const segments = leaderSegments(generateRace(meta.seed));
    assert.equal(segments.length - 1, expected.changes, `${meta.id} lead change count moved`);
    const decisive = segments[segments.length - 1];
    assert.equal(decisive.sail, expected.sail, `${meta.id} decisive leader moved`);
    assert.equal(decisive.from, expected.t, `${meta.id} decisive pass time moved`);
    assert.equal(decisive.leg, expected.leg, `${meta.id} decisive pass leg moved`);
    /* The initial leader is not a change, and a segment can be one sample: the
     * count includes sub second flickers on purpose, which is why the decisive
     * pass is read off the last segment rather than the first change. */
    assert.ok(segments.length >= 1);
  }
});

test("kestrel sound keeps its single sample lead", () => {
  const segments = leaderSegments(generateRace(raceMeta("kestrel-sound")!.seed));
  const flicker = segments.find((segment) => segment.from === segment.to);
  assert.ok(flicker !== undefined, "expected a one sample segment");
  assert.equal(flicker.sail, "JPN 18");
  assert.equal(flicker.from, 9);
});

/* ------------------------------------------------------------------ */
/* The analyst route's race binding                                    */

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/layline/analyst", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

async function answerOf(res: Response): Promise<string> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line.includes('"text"'))
    .map((line) => (JSON.parse(line.slice(6)) as { text: string }).text)
    .join("");
}

test("the route refuses a raceId outside the registry", async () => {
  process.env.LAYLINE_ANALYST_MOCK = "1";
  for (const bad of ["no-such-race", "", String(RACE_SEED), "long-beach "]) {
    const res = await post({ messages: [{ role: "user", content: "Who won the start" }], raceId: bad });
    assert.equal(res.status, 400, `raceId ${JSON.stringify(bad)} was not refused`);
    assert.equal((await res.json()).error, "no such race");
  }
});

test("the route refuses a raceId that is not a string", async () => {
  process.env.LAYLINE_ANALYST_MOCK = "1";
  for (const bad of [RACE_SEED, null, { id: "long-beach" }, ["long-beach"]]) {
    const res = await post({ messages: [{ role: "user", content: "Who won the start" }], raceId: bad });
    assert.equal(res.status, 400, `raceId ${JSON.stringify(bad)} was not refused`);
    assert.equal((await res.json()).error, "raceId must be a string");
  }
});

test("a request with no raceId still answers about the shipped race", async () => {
  process.env.LAYLINE_ANALYST_MOCK = "1";
  const res = await post({
    messages: [{ role: "user", content: RACES[0].suggestedQuestions[1] }],
  });
  assert.equal(res.status, 200);
  const answer = await answerOf(res);
  assert.match(answer, /USA 4/);
  assert.ok(
    parseChips(answer).some((segment) => segment.kind === "chip" && segment.t === 28),
    `expected the shipped race's decisive pass at 0:28 in: ${answer}`,
  );
});

test("the route accepts every registry id and answers about that race", async () => {
  process.env.LAYLINE_ANALYST_MOCK = "1";
  for (const meta of RACES) {
    const expected = LEAD_CHANGES[meta.id];
    const res = await post({
      messages: [{ role: "user", content: meta.suggestedQuestions[1] }],
      raceId: meta.id,
    });
    assert.equal(res.status, 200, `${meta.id} was refused`);
    assert.ok(res.headers.get("content-type")?.startsWith("text/event-stream"));

    const answer = await answerOf(res);
    /* The generalized mockLeadChange has to land on the same pass the audit
     * found, at the same second, rather than the shipped race's t=20 and t=30. */
    assert.match(answer, new RegExp(expected.sail), `${meta.id} answer never names ${expected.sail}: ${answer}`);
    assert.ok(
      parseChips(answer).some(
        (segment) => segment.kind === "chip" && segment.t === expected.t,
      ),
      `${meta.id} answer has no chip at the decisive pass ${expected.t}: ${answer}`,
    );
    /* Sable Reach is the one race decided downwind, and the answer has to say
     * so rather than narrate a pass on the beat. */
    if (expected.leg === "run") {
      assert.match(answer, /downwind/, `${meta.id} narrates a beat pass for a run pass: ${answer}`);
    }
  }
});

test("the start question reads each race's own first crossing", async () => {
  process.env.LAYLINE_ANALYST_MOCK = "1";
  for (const meta of RACES) {
    const res = await post({
      messages: [{ role: "user", content: meta.suggestedQuestions[0] }],
      raceId: meta.id,
    });
    assert.equal(res.status, 200);
    const answer = await answerOf(res);
    const race = generateRace(meta.seed);
    assert.ok(
      race.boats.some((boat) => answer.includes(boat.sail)),
      `${meta.id} start answer names no boat in its fleet: ${answer}`,
    );
    assert.ok(
      parseChips(answer).some((segment) => segment.kind === "chip"),
      `${meta.id} start answer carries no seekable moment: ${answer}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* The client store's race swap                                        */

test("selectRace swaps the race and resets everything that belongs to it", () => {
  const store = useReplay.getState();
  assert.equal(store.raceId, DEFAULT_RACE_ID);
  assert.equal(raceData().seed, RACE_SEED);

  /* Leave the console mid-race, following another boat, on another camera, in
   * chart mode, playing. */
  store.seek(40);
  store.follow("usa");
  store.setRig("chase");
  store.setChart2d(true);
  useReplay.setState({ playing: true });

  useReplay.getState().selectRace("kestrel-sound");
  const after = useReplay.getState();
  assert.equal(after.raceId, "kestrel-sound");
  assert.equal(raceData().seed, 20281113, "raceData still returns the old race");
  assert.equal(after.t, OPEN_AT, "the clock did not go back to the opening moment");
  assert.equal(after.playing, false, "playback carried over the swap");
  assert.equal(after.followId, "nzl", "the followed boat carried over the swap");
  assert.equal(after.rig, "tv", "the camera rig carried over the swap");
  assert.equal(after.chart2d, false, "chart mode carried over the swap");

  /* The viewer remounts on raceId, so the clock clamps read the new race. */
  useReplay.getState().seek(1e9);
  assert.equal(useReplay.getState().t, raceData().tMax);

  useReplay.getState().selectRace(DEFAULT_RACE_ID);
  assert.equal(raceData().seed, RACE_SEED);
  assert.equal(useReplay.getState().raceId, DEFAULT_RACE_ID);
});

test("selectRace ignores an id that never shipped", () => {
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
  useReplay.getState().seek(30);
  useReplay.getState().selectRace("no-such-race");
  assert.equal(useReplay.getState().raceId, DEFAULT_RACE_ID);
  assert.equal(useReplay.getState().t, 30, "a refused race still reset the clock");
  assert.equal(raceData().seed, RACE_SEED);
});

test("selecting the loaded race again changes nothing", () => {
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
  useReplay.getState().seek(12);
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
  assert.equal(useReplay.getState().t, 12);
});

test("each registry race is built once and handed back on every later read", () => {
  for (const meta of RACES) {
    useReplay.getState().selectRace(meta.id);
    const first = raceData();
    assert.equal(first.seed, meta.seed);
    assert.equal(raceData(), first, `${meta.id} is rebuilt on every read`);
  }
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
});

test("the server and the client build the same race for an id", async () => {
  const { raceFor } = await import("../src/lib/layline/analyst/data");
  for (const meta of RACES) {
    useReplay.getState().selectRace(meta.id);
    assert.equal(JSON.stringify(raceFor(meta.id)), JSON.stringify(raceData()), `${meta.id} differs`);
  }
  assert.equal(raceFor("no-such-race"), null);
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
});

/* ------------------------------------------------------------------ */
/* The story page stays on the shipped race                            */

/* The loaded race is module state, and the client router keeps a module across
 * a navigation between the two pages. A visitor who selects a race in the
 * library and then follows the "Race story" link would land on a page whose
 * copy, chart and finish table are the shipped race's, running somebody
 * else's telemetry, unless the story page points the store back itself. */

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the story page's binding puts the shipped race back after a library visit", () => {
  useReplay.getState().selectRace("kestrel-sound");
  useReplay.getState().seek(40);
  assert.equal(raceData().seed, 20281113);

  /* Step one, in the story page's first render: every read while that render
   * runs, the intro's drawing and the viewer's among them, is already the
   * shipped race. */
  pointAtRace(DEFAULT_RACE_ID);
  assert.equal(raceData().seed, RACE_SEED, "the story page rendered the library's race");

  /* Step two, in the effect after it. */
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
  assert.equal(useReplay.getState().raceId, DEFAULT_RACE_ID);
  assert.equal(raceData().seed, RACE_SEED);
  assert.equal(useReplay.getState().t, OPEN_AT, "the library's clock carried over");
});

test("pointing at a race that never shipped leaves the loaded one alone", () => {
  useReplay.getState().selectRace("sable-reach");
  pointAtRace("no-such-race");
  assert.equal(raceData().seed, 20281024);
  useReplay.getState().selectRace(DEFAULT_RACE_ID);
});

test("the story page runs that binding before anything that reads the race", () => {
  const binder = source("src/app/prototype/layline/BindShippedRace.tsx");
  assert.ok(
    binder.includes("pointAtRace(DEFAULT_RACE_ID)"),
    "the binder does not point the module at the shipped race",
  );
  assert.ok(
    binder.includes("selectRace(DEFAULT_RACE_ID)"),
    "the binder does not bring the store to the shipped race",
  );

  /* Render order is the whole of it: every reader below memoises the race on
   * its first render, so a binding placed after one of them is too late. */
  const page = source("src/app/prototype/layline/page.tsx");
  const bound = page.indexOf("<BindShippedRace />");
  assert.ok(bound > 0, "the story page does not render the binding");
  for (const reader of ["<PageGround", "<IntroOverlay", "<LaylineApp", "<AnalystSection"]) {
    assert.ok(page.indexOf(reader) > bound, `${reader} renders before the race is bound`);
  }
});

test("the story page's analyst asks about the shipped race, not the store's", () => {
  const section = source("src/components/layline/analyst/AnalystSection.tsx");
  assert.ok(
    section.includes("rail ? useReplay.getState().raceId : DEFAULT_RACE_ID"),
    "the story variant posts whichever race the store holds",
  );
});

test("the library starts playback on its own mount, never on the story's intro latch", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  assert.ok(
    workspace.includes('autoplay="immediate"'),
    "the library viewer waits on something other than its own mount",
  );

  const app = source("src/components/layline/LaylineApp.tsx");
  /* Immediate autoplay never waits on introDone, the latch that survives a
     navigation: it waits on the brief in front of it, or on nothing. */
  assert.ok(
    app.includes('autoplay === "immediate" ? (briefed ? "brief" : null) : "intro"'),
    "immediate autoplay no longer picks its own gate",
  );
  assert.ok(
    app.includes('if (gate === "brief" && replay.briefDone)'),
    "the briefed library no longer starts on the brief's release",
  );
  assert.ok(
    app.includes("if (autoplay === false) return;"),
    "the viewer lost its way to opt out of autoplay entirely",
  );
  /* Reduced motion outranks all three modes: it returns before any of them can
     seek to the prestart and play. */
  const reduced = app.indexOf("if (reduced) {");
  const starts = app.indexOf("if (autoplay === false) return;");
  assert.ok(reduced > 0 && starts > reduced, "an autoplay mode is read before reduced motion is");
});


/* ------------------------------------------------------------------ */
/* The boot cover's race brief                                         */

test("the library covers the renderer's boot with the sea, the story page with its intro", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  assert.ok(
    workspace.includes('boot="sea"'),
    "the library stopped covering the renderer's boot",
  );

  const app = source("src/components/layline/LaylineApp.tsx");
  assert.ok(app.includes('boot = "intro"'), "the story page lost its default boot cover");
  assert.ok(app.includes("data-boot={boot}"), "the stage no longer states which cover to draw");
  /* The cover has to outlive the first rendered frame, else the two fades leave
     a gap with neither picture in it. */
  assert.ok(
    app.includes('setCover("gone"), 1100'),
    "the sea cover unmounts before its own fade has finished",
  );

  const css = source("src/app/prototype/layline/layline.module.css");
  assert.ok(
    css.includes('.stage[data-boot="sea"] .canvasLayer'),
    "the scene fades instead of the cover",
  );
  assert.ok(css.includes('.stage[data-boot="sea"] .dockLeft'), "the docks still pop in");
  /* The chart is the no-WebGL answer, so it must still arrive on its own when
     no renderer ever does. */
  assert.match(
    css,
    /\.stage\[data-boot="sea"\] \.fallbackLayer \{\s*visibility: hidden;\s*animation: fallbackReveal 0s linear 2\.4s forwards;/,
  );

  /* The cover is a picture of the sea, in its own module so it is free to be
     tuned without arguing with the console's stylesheet. What matters to the
     dissolve is that it paints a sky and a water, and that only its own
     opacity moves. */
  const cover = source("src/components/layline/bootSea.module.css");
  assert.match(cover, /linear-gradient/);
  assert.ok(cover.includes("container-type: inline-size"), "the brief stopped sizing to the pane");
  assert.match(cover, /transition:\s*opacity 900ms/);
  assert.match(cover, /\.out \{\s*opacity: 0;/);
});

test("the sea cover briefs the race it is loading", () => {
  const workspace = source("src/app/prototype/layline/races/RaceWorkspace.tsx");
  /* What the registry knows and a simulation cannot: the name, the venue and
     the date. Everything else on the brief is read off the RaceData. */
  assert.ok(
    workspace.includes("{ name: meta.name, venue: meta.venue, dateLabel: meta.dateLabel }"),
    "the cover stopped briefing the race the rail names",
  );

  const brief = source("src/components/layline/RaceBrief.tsx");
  const cover = source("src/components/layline/bootSea.module.css");

  /* The title card face, still preloaded by the page for the same reason: the
     face is font-display: block and the brief is what fills the wait. */
  assert.ok(cover.includes("var(--font-pangram)"), "the race name left the display face");
  assert.ok(cover.includes("font-weight: 400"), "the race name left the display face's book weight");
  assert.ok(cover.includes("letter-spacing: -0.025em"), "the race name lost its tracking");
  /* The console divides its three faces by job, and says why: "a number set in
     Archivo is a number nobody measured, and a button set in mono is a lie
     about where the data is". So Martian is quarantined to measured values,
     Archivo carries the labels and the button, and every numeral is tabular so
     a countdown never reflows the row it sits in. */
  assert.ok(cover.includes("var(--font-martian), monospace"), "the brief left the console's mono");
  assert.ok(cover.includes("var(--font-archivo), sans-serif"), "the brief left the console's sans");
  const goBtn = cover.slice(cover.indexOf(".goBtn {"), cover.indexOf(".goArrow {"));
  assert.ok(goBtn.includes("var(--brief-sans)"), "the way through went back to mono");
  assert.ok(!goBtn.includes("var(--brief-mono)"), "the way through went back to mono");
  for (const measured of [
    ".readValue {",
    ".fleetRow {",
    ".panelCount {",
    ".stripValue {",
    ".favored {",
    ".plotFig {",
    ".plotSail {",
  ]) {
    const block = cover.slice(cover.indexOf(measured));
    assert.ok(
      block.slice(0, block.indexOf("}")).includes("var(--brief-mono)"),
      `${measured} stopped setting its figures in the measured face`,
    );
  }
  assert.ok(
    cover.includes("font-variant-numeric: tabular-nums"),
    "the brief's numerals stopped being tabular",
  );
  /* The console's standing bans. A 1px dim rule does what a shadow would. */
  assert.ok(!cover.includes("box-shadow"), "a drop shadow arrived on the cover");
  /* Exactly one accent, stated once and reaching exactly three things, all of
     them the favored end: the mark over it, the seconds it is worth, and the
     fill on the status hairline. Anything else on this layer taking it makes
     the mark stop meaning anything. The focus ring is not one of them: the
     console rings its own focusable things and this layer does not offer a
     second opinion. */
  assert.ok(
    cover.includes("--brief-accent: var(--wind);"),
    "the accent left the console's own wind token for a hex of this layer's own",
  );
  assert.equal((cover.match(/#ffd166/g) ?? []).length, 0, "the invented accent hex came back");
  /* Ten users, and every one of them is the wind or what the wind decides: the
     ladder rungs and the wedge of water the favored end has already won; the
     arrow lying across the course, its head and the direction it carries; the
     start line itself, which the contract names as one of the things amber
     means before the gun; the mark over the end that line favors and the
     seconds it is worth; and the direction trace under the drawing with the
     dot running along it. The status hairline is a wait, not weather, and does
     not take it. Neither does a boat, a rule or a label. */
  const accentUsers = [
    ".rung",
    ".wedge",
    ".windStroke",
    ".windFill",
    ".windTag",
    ".plotLine",
    ".favMark",
    ".favSec",
    ".stripTrace",
    ".stripDot",
  ];
  assert.equal(
    (cover.match(/var\(--brief-accent\)/g) ?? []).length,
    accentUsers.length,
    "something that is not the wind took the wind's colour",
  );
  for (const rule of accentUsers) {
    assert.ok(cover.includes(rule), `${rule} left the cover, so the accent's users moved`);
  }
  const statusFill = cover.slice(cover.indexOf(".statusFill {"));
  assert.ok(
    !statusFill.slice(0, statusFill.indexOf("}")).includes("--brief-accent"),
    "the status hairline went back to borrowing the wind's colour",
  );

  /* Nothing on this layer is rounded. The console's registration box states
     border-radius: 0 on whatever it rings (layline.module.css), so a rounded
     control here was a control that changed shape the moment it took focus,
     which is the class of pop the boot cover exists to prevent. */
  const coverRules = cover.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!coverRules.includes("border-radius"), "a rounded corner came back to the cover");
  assert.ok(!brief.includes('rx="'), "a rounded corner came back to the brief's drawings");

  /* The race name owns its own line. Sharing the header row with the meta line
     left its width budget swinging with the viewport, so no stated size fit
     every case and the measured fit had to correct the server's guess after
     hydration, in full view. */
  /* Matched line by line rather than across the break: this repo checks out
     CRLF, so a pattern pinning a bare newline against source text fails on a
     fresh clone while passing here. */
  const head = cover.slice(cover.indexOf(".briefHead {"), cover.indexOf(".raceName {"));
  assert.ok(head.includes("flex-direction: column;"), "the race name shares its row again");
  assert.ok(head.includes("align-items: flex-start;"), "the header stopped ranging its two lines left");
  assert.ok(!head.includes("align-items: baseline;"), "the header went back to a baseline row");

  const racesPage = source("src/app/prototype/layline/races/page.tsx");
  assert.ok(
    racesPage.includes('href="/assets/fonts/pangram-display.woff2"'),
    "the library stopped preloading the face its brief is set in",
  );

  /* The name is capped at two line boxes by measurement, because what overflows
     is the number of words and container units cannot see that. */
  assert.ok(
    brief.includes("node.scrollHeight <= Math.ceil(2 * size * 1.02) + 2"),
    "the two-line cap left",
  );
  assert.ok(brief.includes("size > 9"), "the fit lost its floor");

  /* The motion switch a test can drive, and the state the cover publishes. */
  assert.ok(brief.includes("if (reduced) {"), "the brief lost its static path");
  const app = source("src/components/layline/LaylineApp.tsx");
  assert.ok(
    app.includes('data-brief-motion={briefed ? (reducedMotion ? "off" : "on") : undefined}'),
    "the cover stopped stating whether the brief is moving",
  );
  /* The capture hold stops this layer's entrance as well as the replay clock.
     Two screenshots of the same stated race time a tenth of a second apart
     otherwise catch the plates at two points of one 420ms fade, which is what
     check 1 of .tmp/verify.mjs measures. */
  assert.ok(
    app.includes('data-brief-still={briefed && frozen ? "" : undefined}'),
    "the cover stopped publishing the capture hold",
  );
  assert.match(cover, /\[data-brief-still\] \.panel,\s*\[data-brief-still\] \.briefFoot \{\s*animation: none;/);
  /* The footer's three moving parts stop too. They are the one part of this
     layer driven by wall time rather than by the replay clock, so left easing
     they caught two captures of the same stated time at two points of one
     crossfade and differed by 1,510 pixels. */
  for (const part of [".statusFill", ".statusBar", ".statusStack span"]) {
    assert.ok(
      cover.includes(`[data-brief-still] ${part}`),
      `${part} kept easing under the capture hold`,
    );
  }

  /* The drawing scales its stroke widths by a measured metres-per-pixel rather
     than reaching for vector-effect, because Chrome then reads
     stroke-dasharray in device pixels too and the dash that reveals how far a
     boat has sailed repeats down its own track instead of drawing one prefix
     of it. */
  assert.ok(brief.includes('{ "--plot-px": mpx.toFixed(5) }'), "the drawing lost its one scale factor");
  assert.ok(
    !cover.replace(/\/\*[\s\S]*?\*\//g, "").includes("vector-effect"),
    "the track reveal went back to a device-pixel dash",
  );
  assert.ok(
    (cover.match(/var\(--plot-px\)/g) ?? []).length >= 5,
    "the drawing's stroke widths stopped scaling with the chart",
  );
  /* Briefed, the cover carries the only control on the layer, so it cannot be
     hidden from a screen reader the way the bare sea was. */
  assert.ok(
    app.includes('aria-hidden={briefed ? undefined : "true"}'),
    "the briefed cover is hidden from a screen reader",
  );
});

test("the brief reads its fleet, its line and its first crossing off the race", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const facts = briefFacts(race);

    /* The line comes from the course endpoints, never from a literal. */
    assert.equal(
      facts.lineLength,
      Math.hypot(
        race.course.startBoat.x - race.course.startPin.x,
        race.course.startBoat.y - race.course.startPin.y,
      ),
      `${meta.id} line length stopped coming off the course`,
    );
    assert.equal(facts.lineHalf, facts.lineLength / 2);
    assert.equal(facts.tMin, race.tMin);

    /* One row per boat, in the order the rail and the docks use, and each
       hull's place on the line is its own fix nearest the gun. */
    assert.deepEqual(
      facts.boats.map((boat) => boat.id),
      race.boats.map((boat) => boat.id),
      `${meta.id} fleet order left race.boats order`,
    );
    for (const boat of facts.boats) {
      const fixes = race.fixes[boat.id];
      const nearest = fixes.reduce((best, fix) => (Math.abs(fix.t) < Math.abs(best.t) ? fix : best));
      assert.equal(boat.gunX, nearest.x, `${meta.id} ${boat.sail} is not at its own gun fix`);
      assert.ok(
        Math.abs(boat.gunX) <= facts.lineHalf + 6,
        `${meta.id} ${boat.sail} sits off the end of its own line`,
      );
    }

    /* The fleet's tacking half-angle, measured off the beat rather than
       repeated from sim.ts. */
    assert.ok(
      facts.beatTwa >= BEAT_TWA_MIN_DEG && facts.beatTwa <= BEAT_TWA_MAX_DEG,
      `${meta.id} beat angle ${facts.beatTwa.toFixed(1)} outside the audited band`,
    );

    /* The first hull to the line after the gun, and the same one the analyst's
       start report names: two surfaces, one crossing. */
    const report = startReport(race);
    const leader = report.rows[0];
    const first = facts.first;
    assert.ok(first !== null, `${meta.id} has no first crossing`);
    assert.equal(first.sail, leader.sail, `${meta.id} brief and analyst name different hulls`);
    assert.ok(
      Math.abs(first.t - (leader.crossedAfterGunSeconds ?? Number.NaN)) < 0.005,
      `${meta.id} brief and analyst disagree on when ${leader.sail} crossed`,
    );
    assert.ok(first.t > 0, `${meta.id} first crossing is not after the gun`);
  }
});

test("the brief's wind is the replay's wind, and the favored end is the one nearer the breeze", () => {
  const race = generateRace(RACE_SEED);
  const facts = briefFacts(race);
  const read = windReading();
  const sample = { t: 0, twd: 0, tws: 0 };

  let sawPin = false;
  let sawBoat = false;

  for (let step = 0; step <= 40; step += 1) {
    const t = race.tMin + (step / 40) * (0 - race.tMin);
    windReadingAt(race, facts, t, read);
    windAt(race, t, sample);

    /* Same series, same interpolation: the dial can only differ from the
       instrument dock by being asked about a different instant. */
    const signedTwd = ((((sample.twd % 360) + 360) % 360) + 180) % 360 - 180;
    assert.ok(
      Math.abs(read.twd - signedTwd) < 1e-9,
      `the brief's twd left windAt at t=${t.toFixed(2)}`,
    );
    assert.equal(read.tws, sample.tws, `the brief's tws left windAt at t=${t.toFixed(2)}`);

    /* Bias in seconds: the line's length across the wind over the speed the
       fleet makes at its own beat angle, off the sim's own polar. */
    const beatSpeed = polarFrac(facts.beatTwa) * read.tws;
    const expected = (facts.lineLength * Math.sin(Math.abs(read.twd) * (Math.PI / 180))) / beatSpeed;
    assert.ok(
      Math.abs(read.biasSeconds - expected) < 1e-9,
      `the bias formula moved at t=${t.toFixed(2)}`,
    );
    assert.ok(read.biasSeconds >= 0, "a favored end can never be worth negative time");

    /* Favored is the end sitting closer to the wind, which is the shorter road
       up the beat (knowledge.ts, start-bias). Course angles grow clockwise
       from +y, so upwind is (sin twd, cos twd) and the projection settles it.
       The pin is the port end at -x, the committee boat the starboard end. */
    const upwindX = Math.sin(read.twd * (Math.PI / 180));
    const pinGain = race.course.startPin.x * upwindX;
    const boatGain = race.course.startBoat.x * upwindX;
    if (read.favored === "pin") {
      sawPin = true;
      assert.ok(pinGain > boatGain, `pin called favored while it sits downwind at t=${t.toFixed(2)}`);
      assert.ok(read.twd < 0, "the pin is favored by a wind off the port side of the course");
    } else if (read.favored === "boat") {
      sawBoat = true;
      assert.ok(
        boatGain > pinGain,
        `committee boat called favored while it sits downwind at t=${t.toFixed(2)}`,
      );
      assert.ok(read.twd > 0, "the committee boat is favored by a wind off the starboard side");
    } else {
      assert.ok(Math.abs(read.twd) <= 0.05, "a square line has to actually be square");
    }
  }

  /* The shipped prestart swings through the axis, so both ends come up: a
     brief that only ever named one end would pass the checks above while
     saying nothing. */
  assert.ok(sawPin && sawBoat, "the shipped prestart no longer shows both ends favored");

  /* It also passes through square, which is why the sentence has to be able to
     stop at the end rather than trailing a "by" with nothing after it. Two of
     the three seeds reach it; sable-reach never does. */
  let squares = 0;
  for (let step = 0; step <= 4000; step += 1) {
    const t = race.tMin + (step / 4000) * (0 - race.tMin);
    windReadingAt(race, facts, t, read);
    if (read.favored === "square") squares += 1;
  }
  assert.ok(squares > 0, "the shipped prestart no longer passes through a square line");
  const brief = source("src/components/layline/RaceBrief.tsx");
  assert.ok(
    brief.includes('display: seed.favored === "square" ? "none" : undefined'),
    "a square line leaves the favored sentence open on a dangling by",
  );
  assert.ok(
    brief.includes('const by = read.favored === "square" ? "none" : "";'),
    "the live loop stopped closing the favored sentence on a square line",
  );

  /* The strip under the drawing plots direction, not speed, because direction
     is where the movement is: the same series windAt hands the replay, sampled
     across the prestart, ending on the gun, and inside its own stated window
     so the trace fills the band and never leaves it. */
  const series = prestartTwdSeries(race, 60);
  assert.equal(series.length, 61);
  assert.equal(series[0].t, race.tMin);
  assert.equal(series[60].t, 0);
  const band = twdBand(series);
  for (const point of series) {
    windAt(race, point.t, sample);
    const signedTwd = (((((sample.twd % 360) + 360) % 360) + 180) % 360) - 180;
    assert.ok(
      Math.abs(point.twd - signedTwd) < 1e-9,
      `the strip left windAt at t=${point.t.toFixed(2)}`,
    );
    assert.ok(
      point.twd >= band.lo && point.twd <= band.hi,
      "the trace left the band it is drawn in",
    );
  }
  /* The swing is what the strip labels, and it is the movement the whole
     drawing is about: the breeze goes right through the prestart on every
     shipped seed and takes the favored end with it on two of the three. */
  assert.ok(twdSwing(series) > 1, "the shipped prestart stopped shifting");
});

test("the brief's chart is fitted to the race and drawn at a stated scale", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const tracks = prestartTracks(race, 0.25);

    /* One track per boat, in race.boats order, opening on the first fix and
       ending exactly on the gun however the step divides the prestart. */
    assert.deepEqual(
      tracks.map((track) => track.boat.id),
      race.boats.map((boat) => boat.id),
      `${meta.id} lost a boat off the drawing`,
    );
    const pose = { x: 0, y: 0, hdg: 0, heel: 0, twa: 0, sog: 0, cog: 0, kite: 0 };
    for (const track of tracks) {
      assert.equal(track.times[0], race.tMin);
      assert.equal(track.times[track.times.length - 1], 0);
      assert.equal(track.points.length, track.times.length * 2);
      /* Metres off poseAt with y negated for the screen, the same frame
         chartFrame.ts draws the whole race in, so the two drawings cannot be
         the same course at two scales. */
      poseAt(race, track.boat.id, 0, "smooth", pose);
      assert.ok(Math.abs(track.points[track.points.length - 2] - pose.x) < 1e-9);
      assert.ok(Math.abs(track.points[track.points.length - 1] + pose.y) < 1e-9);
      assert.ok(Math.abs(track.gunHdg - pose.hdg) < 1e-9);
      /* Arc length rises along the very polyline the path is built from, which
         is what lets a dash reveal exactly the water already sailed. */
      assert.equal(track.lengths[0], 0);
      for (let i = 1; i < track.lengths.length; i += 1) {
        assert.ok(track.lengths[i] >= track.lengths[i - 1], "the arc length went backwards");
      }
      assert.equal(track.total, track.lengths[track.lengths.length - 1]);
      assert.ok(track.total > 40, `${meta.id} ${track.boat.sail} sailed nowhere`);
    }

    /* The window holds every sampled fix and both ends of the line, and it is
       isotropic: the box's aspect is spent on the frame, never on stretching
       one axis, which is the only reason the scale bar can be honest. */
    for (const aspect of [3.44, 1.8, 1]) {
      const frame = prestartFrame(race, tracks, aspect);
      assert.ok(Math.abs(frame.w / frame.h - aspect) < 1e-6, "the frame left the box's aspect");
      assert.ok(frame.x <= race.course.startPin.x, "the pin fell off the drawing");
      assert.ok(frame.x + frame.w >= race.course.startBoat.x, "the boat end fell off the drawing");
      for (const track of tracks) {
        for (let i = 0; i < track.points.length; i += 2) {
          assert.ok(track.points[i] >= frame.x && track.points[i] <= frame.x + frame.w);
          assert.ok(track.points[i + 1] >= frame.y && track.points[i + 1] <= frame.y + frame.h);
        }
      }
      /* The bar is a round step near a fifth of the drawing, so a reader never
         has to do arithmetic against it. */
      const step = scaleStep(frame.w);
      assert.ok([10, 20, 50, 100].includes(step), "the scale bar took an unreadable step");
      assert.ok(step <= frame.w, "the scale bar is wider than the water it measures");
    }
  }
});

test("the brief's ledger reads each hull's distance off the line the console's own way", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const facts = briefFacts(race);
    const line = startLineOf(race.course);
    const pose = { x: 0, y: 0, hdg: 0, heel: 0, twa: 0, sog: 0, cog: 0, kite: 0 };
    const out = { distance: 0, closing: 0, toLine: 0, early: false };
    for (const boat of facts.boats) {
      poseAt(race, boat.id, 0, "smooth", pose);
      startReadingAt(line, pose, 0, out);
      assert.equal(
        boat.offLine,
        out.distance,
        `${meta.id} ${boat.sail} off-the-line reading left startReadingAt`,
      );
      /* Nobody is over at the gun on these seeds, and nobody is a boat length
         from a line they spent ten seconds lining up on. */
      assert.ok(
        boat.offLine > 0 && boat.offLine < 8,
        `${meta.id} ${boat.sail} is ${boat.offLine.toFixed(1)} m off its own line`,
      );
    }
  }
});

test("the brief gates the replay, and re-arms with the race", () => {
  pointAtRace(DEFAULT_RACE_ID);
  const store = useReplay;
  store.setState({ raceId: DEFAULT_RACE_ID, briefDone: false, playing: false, t: OPEN_AT });

  assert.equal(store.getState().briefDone, false, "the brief opens already released");
  store.getState().releaseBrief();
  assert.equal(store.getState().briefDone, true, "releasing the brief did not latch");

  /* One way only: a second press of a button already fading out must not
     restart what the first one triggered. */
  store.setState({ playing: true });
  store.getState().releaseBrief();
  assert.equal(store.getState().playing, true, "a second release reset the replay");

  /* A rail selection is a new race, so it is a new brief. */
  store.getState().selectRace(RACES[1].id);
  assert.equal(store.getState().briefDone, false, "the brief did not re-arm with the race");
  assert.equal(store.getState().t, OPEN_AT, "selecting a race left the clock where it was");

  pointAtRace(DEFAULT_RACE_ID);
  store.setState({ raceId: DEFAULT_RACE_ID, briefDone: false, playing: false, t: OPEN_AT });

  /* The brief hands the clock back inside the prestart, which is where the
     library's autoplay expects to find it, and back to the mid-beat moment for
     a viewer who asked for less motion and gets no autoplay at all. */
  const brief = source("src/components/layline/RaceBrief.tsx");
  assert.ok(
    brief.includes("state.seek(state.reducedMotion ? OPEN_AT : AUTOPLAY_FROM)"),
    "the brief stopped handing the clock back where the replay wants it",
  );
  assert.ok(AUTOPLAY_FROM < 0, "the autoplay no longer starts inside the prestart");
  assert.ok(OPEN_AT > 0, "the reduced-motion open moved out of the race");

  /* Enter releases it, except while a viewer is typing: the analyst's composer
     is one Tab away. */
  assert.ok(brief.includes('event.key !== "Enter"'), "Enter stopped releasing the brief");
  assert.ok(
    brief.includes('tag === "INPUT" || tag === "TEXTAREA"'),
    "Enter now fires from inside the analyst's composer",
  );
  assert.ok(brief.includes("isContentEditable"), "Enter fires from a rich text field");
  assert.ok(
    brief.includes("button.current?.focus({ preventScroll: true })"),
    "the brief stopped taking focus when it mounts",
  );
  /* The label is the whole promise of the button. */
  assert.ok(brief.includes("Start the race"), "the way through changed its words");
});

test("a gated console is one screen tall, and Continue clears the composer", () => {
  const app = source("src/components/layline/LaylineApp.tsx");
  /* The gate is the stage's business as well as the cover's: stacked, the
     console is a column of docks about 1300px tall, and a brief held to one
     screen left 500-odd px of empty water under the button. The attribute goes
     up while the brief is unread and comes off the moment it is released, so
     the column is back to full height under a cover that has not faded yet. */
  assert.ok(
    app.includes('data-gate={briefed && !briefDone ? "brief" : undefined}'),
    "the stage stopped saying when it is gated",
  );

  const css = source("src/app/prototype/layline/layline.module.css");
  const stacked = css.slice(css.indexOf("@media (max-width: 900px) {"));
  assert.ok(stacked.includes('.stage[data-gate="brief"] {'), "the gated console stopped being capped");
  assert.ok(
    stacked.includes("max-height: calc(100svh - var(--composer-bar, 59px) - env(safe-area-inset-bottom));"),
    "the cap stopped agreeing with the height the brief is held to",
  );
  /* Nothing under the cover may resize while it is up: the canvas states its
     own 48vh here and the docks are pinned to their natural height, so the cap
     clips rather than squeezes and releasing it costs no reflow. */
  assert.ok(stacked.includes('.stage[data-gate="brief"] > * {'), "the docks went back to shrinking under the cap");

  const cover = source("src/components/layline/bootSea.module.css");
  /* The composer pins over the foot of the viewport below 1199px. The cap
     above only holds while the brief is pinned; scrolled to where the gate is
     simply fully in view, its bottom edge lands on the viewport foot, and a
     footer flush with that edge lands under the composer. */
  assert.ok(cover.includes("--brief-foot-gap: 0px;"), "the footer gap stopped being stated at full width");
  assert.ok(
    cover.includes("--brief-foot-gap: calc(var(--composer-bar, 59px) + env(safe-area-inset-bottom));"),
    "the footer stopped being held off the composer's band",
  );
  assert.ok(
    cover.includes("padding: 3cqw 3.2cqw calc(2.2cqw + var(--brief-foot-gap));"),
    "the brief stopped spending the gap",
  );
  assert.ok(
    cover.includes("padding: 16px 16px calc(16px + var(--brief-foot-gap));"),
    "the stacked brief stopped spending the gap",
  );
});
