import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("@/")) {
        return nextResolve(new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, context);
      }
      if (!specifier.startsWith(".")) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const {
  compareRange,
  dtfAt,
  integrateTrackRange,
  progressBoundaryStatusAt,
  raceAnalysisValidity,
} = await import("../src/lib/layline/comparison.ts");
const { comparisonViewModel } = await import("../src/lib/layline/comparison-view.ts");
const { compareRangeForAnalyst, runTool } = await import(
  "../src/lib/layline/analyst/tools.ts"
);
const { maneuversOf, polarReview } = await import("../src/lib/layline/analytics.ts");
const { legAt } = await import("../src/lib/layline/interpolate.ts");
const { knots } = await import("../src/lib/layline/format.ts");
const { RACES } = await import("../src/lib/layline/races.ts");
const { generateRace } = await import("../src/lib/layline/sim.ts");

function requestFor(race, kind) {
  return {
    primaryBoatId: race.boats[0].id,
    reference:
      kind === "boat"
        ? { kind: "boat", boatId: race.boats[1].id }
        : { kind: "fleet-median", boatIds: race.boats.map((boat) => boat.id) },
    range: { from: 8.125, to: 9.875 },
  };
}

function toolInput(request) {
  return {
    a: request.primaryBoatId,
    referenceKind: request.reference.kind,
    b: request.reference.kind === "boat" ? request.reference.boatId : null,
    cohortBoatIds:
      request.reference.kind === "fleet-median" ? request.reference.boatIds : [],
    t0: request.range.from,
    t1: request.range.to,
  };
}

function assertFiniteOrNullTree(value, path = "result") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} leaked ${String(value)}`);
    return;
  }
  if (typeof value === "string") {
    assert.doesNotMatch(value, /(?:^|[^a-z])(Infinity|NaN)(?:$|[^a-z])/i, path);
    return;
  }
  if (value === null || value === undefined || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteOrNullTree(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assertFiniteOrNullTree(entry, `${path}.${key}`);
  }
}

function assertPreflightRejection(
  race,
  request,
  expectedValidity,
  expectedBoundary,
  invalidBoatId = request.primaryBoatId,
) {
  const requiredIds =
    request.reference.kind === "boat"
      ? [request.primaryBoatId, request.reference.boatId]
      : request.reference.boatIds;
  const validity = raceAnalysisValidity(race, requiredIds);
  assert.equal(validity.status, expectedValidity);

  const comparison = compareRange(race, request);
  assert.equal(
    comparison.status,
    expectedValidity === "invalid-race" ? "invalid-request" : "missing-boundary-data",
  );
  assert.equal(comparison.boundaryFactsStatus, expectedBoundary);
  assert.equal(comparison.primary, null);
  assert.equal(comparison.referenceFacts, null);
  assert.equal(comparison.startAdvantageMeters, null);
  assert.equal(comparison.endAdvantageMeters, null);
  assert.equal(comparison.progressGainedMeters, null);
  assert.equal(dtfAt(race, invalidBoatId, request.range.from), null);
  assert.equal(
    progressBoundaryStatusAt(race, invalidBoatId, request.range.from),
    "invalid-sample",
  );

  const track = integrateTrackRange(race, invalidBoatId, request.range);
  assert.equal(
    track.status,
    expectedValidity === "invalid-race" ? "invalid-request" : "invalid-sample",
  );
  assert.equal(track.sailedDistanceMeters, null);
  assert.equal(track.meanSogMps, null);
  assert.equal(track.meanVmgMps, null);
  assert.equal(track.vmgCoverageMicros, 0);
  const analyst = compareRangeForAnalyst(race, request);
  assert.ok("error" in analyst);
  assert.deepEqual(JSON.parse(runTool(race, "compare_boats", toolInput(request))), analyst);
  const view = comparisonViewModel(race, comparison);
  assert.equal(view.status, comparison.status);
  assertFiniteOrNullTree(validity, "validity");
  assertFiniteOrNullTree(comparison, "comparison");
  assertFiniteOrNullTree(track, "track");
  assertFiniteOrNullTree(analyst, "analyst");
  assertFiniteOrNullTree(view, "view");
}

function assertPreflightAcceptance(race, request) {
  const requiredIds =
    request.reference.kind === "boat"
      ? [request.primaryBoatId, request.reference.boatId]
      : request.reference.boatIds;
  const validity = raceAnalysisValidity(race, requiredIds);
  assert.equal(validity.status, "valid");

  const comparison = compareRange(race, request);
  assert.equal(comparison.status, "ok");
  assert.equal(comparison.boundaryFactsStatus, "available");
  assert.ok(comparison.primary);
  assert.ok(comparison.referenceFacts);
  assert.ok(Number.isFinite(dtfAt(race, request.primaryBoatId, request.range.from)));
  assert.equal(
    progressBoundaryStatusAt(race, request.primaryBoatId, request.range.from),
    "available",
  );

  const track = integrateTrackRange(race, request.primaryBoatId, request.range);
  assert.equal(track.status, "ok");
  const analyst = compareRangeForAnalyst(race, request);
  assert.ok(!("error" in analyst));
  assert.deepEqual(JSON.parse(runTool(race, "compare_boats", toolInput(request))), analyst);
  const view = comparisonViewModel(race, comparison);
  assert.equal(view.status, comparison.status);
  assertFiniteOrNullTree(validity, "validity");
  assertFiniteOrNullTree(comparison, "comparison");
  assertFiniteOrNullTree(track, "track");
  assertFiniteOrNullTree(analyst, "analyst");
  assertFiniteOrNullTree(view, "view");
}

test("current spec snapshot contract protects every public fact path", () => {
  const canonical = generateRace(RACES[0].seed);
  for (const copyCurrent of [
    (current) => JSON.parse(JSON.stringify(current)),
    (current) => structuredClone(current),
  ]) {
    const race = structuredClone(canonical);
    race.environment.current = copyCurrent(canonical.environment.current);
    for (const kind of ["boat", "fleet-median"]) {
      assertPreflightAcceptance(race, requestFor(race, kind));
    }
  }

  class CurrentFieldRecord {}
  const hostileFactories = [
    (current) => null,
    (current) => [],
    (current) => Object.assign(new CurrentFieldRecord(), current),
    (current) => Object.assign(Object.create({ inherited: true }), current),
    (current) => Object.assign(Object.create(null), current),
    (current) => ({ ...current, extra: 1 }),
    (current) => {
      const candidate = { ...current };
      delete candidate.yTimePeriodSeconds;
      return candidate;
    },
    (current) => {
      const candidate = { ...current };
      candidate.xBaseMps = candidate;
      return candidate;
    },
    (current) => {
      const candidate = { ...current };
      let reads = 0;
      Object.defineProperty(candidate, "xBaseMps", {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          return reads < 2 ? current.xBaseMps : 0.2;
        },
      });
      return candidate;
    },
    (current) => {
      const candidate = { ...current };
      let reads = 0;
      Object.defineProperty(candidate, "xBaseMps", {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          return reads < 3 ? current.xBaseMps : 0.2;
        },
      });
      return candidate;
    },
    (current) => {
      const candidate = { ...current };
      Object.defineProperty(candidate, "xBaseMps", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile current getter");
        },
      });
      return candidate;
    },
    (current) => new Proxy({ ...current }, {
      getPrototypeOf() { throw new Error("hostile current prototype"); },
    }),
    (current) => new Proxy({ ...current }, {
      ownKeys() { throw new Error("hostile current ownKeys"); },
    }),
    (current) => new Proxy({ ...current }, {
      getOwnPropertyDescriptor() { throw new Error("hostile current descriptor"); },
    }),
    (current) => new Proxy({ ...current }, {}),
  ];

  for (const [index, hostileFactory] of hostileFactories.entries()) {
    for (const kind of ["boat", "fleet-median"]) {
      const race = structuredClone(canonical);
      race.environment.current = hostileFactory(canonical.environment.current);
      assert.doesNotThrow(
        () => assertPreflightRejection(
          race,
          requestFor(race, kind),
          "invalid-sample",
          "invalid-sample",
        ),
        `hostile current ${index} ${kind}`,
      );
    }
  }
});

function eventOf(race, kind, boatId) {
  const event = race.events.find(
    (candidate) =>
      candidate.kind === kind && (boatId === undefined || candidate.boatId === boatId),
  );
  assert.ok(event, `${kind} event exists`);
  return event;
}

function sortEvents(race) {
  race.events.sort((left, right) => left.t - right.t);
}

test("converted-equal race bounds reject every Stage 5 public fact path", () => {
  for (const meta of RACES) {
    for (const mutate of [
      (race) => {
        race.tMin = 1;
        race.tMax = 1.0000004;
      },
      (race) => {
        race.tMax = race.tMin;
      },
      (race) => {
        [race.tMin, race.tMax] = [race.tMax, race.tMin];
      },
    ]) {
      for (const kind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        mutate(race);
        assertPreflightRejection(race, requestFor(race, kind), "invalid-race", "unavailable");
      }
    }
  }
});

test("unsafe, equal, reversed, and microsecond-aliased gun/finish clocks reject facts", () => {
  const attacks = [
    ["gun-unsafe", (race) => race.events.find((event) => event.kind === "gun").t = Infinity],
    ["gun-overflow", (race) => race.events.find((event) => event.kind === "gun").t = Number.MAX_VALUE],
    ["gun-missing", (race) => race.events = race.events.filter((event) => event.kind !== "gun")],
    ["gun-equal-finish", (race, boatId) => race.events.find((event) => event.kind === "gun").t = race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t],
    ["gun-reversed-finish", (race, boatId) => race.events.find((event) => event.kind === "gun").t = race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t + 1],
    ["gun-aliased-finish", (race, boatId) => race.events.find((event) => event.kind === "gun").t = race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t - 0.0000004],
    ["finish-invalid", (race, boatId) => race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t = Number.NaN],
    ["finish-unsafe", (race, boatId) => race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t = Number.MAX_VALUE],
    ["finish-equal", (race, boatId) => race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t = 0],
    ["finish-reversed", (race, boatId) => race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t = -1],
    ["finish-aliased", (race, boatId) => race.events.find((event) => event.kind === "finish" && event.boatId === boatId).t = 0.0000004],
  ];
  for (const meta of RACES) {
    for (const [, mutate] of attacks) {
      for (const kind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        mutate(race, race.boats[0].id);
        assertPreflightRejection(race, requestFor(race, kind), "invalid-event", "invalid-sample");
      }
    }
  }
});

test("the complete stored event array gates every Stage 5 fact path", (t) => {
  const attacks = [
    ["reversed-array", (race) => {
      [race.events[1], race.events[2]] = [race.events[2], race.events[1]];
    }],
    ["equal-events", (race) => {
      race.events[2].t = race.events[1].t;
    }],
    ["microsecond-alias", (race) => {
      race.events[2].t = race.events[1].t + 0.0000004;
    }],
    ["nan-rounding", (race) => {
      eventOf(race, "rounding").t = Number.NaN;
    }],
    ["infinite-rounding", (race) => {
      eventOf(race, "rounding").t = Infinity;
    }],
    ["max-rounding", (race) => {
      eventOf(race, "rounding").t = Number.MAX_VALUE;
    }],
    ["gun-before-race", (race) => {
      eventOf(race, "gun").t = race.tMin - 1;
    }],
    ["gun-after-race", (race) => {
      eventOf(race, "gun").t = race.tMax + 1;
    }],
    ["finish-after-race", (race) => {
      eventOf(race, "finish").t = race.tMax + 1;
    }],
    ["finish-before-gun", (race) => {
      eventOf(race, "finish").t = -1;
    }],
    ["finish-equal-gun", (race) => {
      eventOf(race, "finish").t = eventOf(race, "gun").t;
    }],
    ["duplicate-gun", (race) => {
      race.events.splice(1, 0, { kind: "gun", t: 0.5 });
    }],
    ["missing-gun", (race) => {
      race.events = race.events.filter((event) => event.kind !== "gun");
    }],
    ["duplicate-finish", (race) => {
      const first = eventOf(race, "finish");
      const last = [...race.events].reverse().find((event) => event.kind === "finish");
      assert.ok(last);
      race.events = race.events.filter((event) => event !== last);
      race.events.push({ ...first, t: race.tMax, rank: last.rank });
      sortEvents(race);
    }],
    ["unknown-kind", (race) => {
      eventOf(race, "rounding").kind = "penalty";
    }],
    ["invalid-boat-binding", (race) => {
      eventOf(race, "rounding").boatId = "ghost";
    }],
    ["missing-boat-binding", (race) => {
      delete eventOf(race, "finish").boatId;
    }],
    ["forbidden-gun-binding", (race) => {
      eventOf(race, "gun").boatId = race.boats[0].id;
    }],
    ["rounding-before-gun", (race) => {
      const gun = eventOf(race, "gun");
      const rounding = eventOf(race, "rounding");
      gun.t = 1;
      rounding.t = 0.5;
      sortEvents(race);
    }],
    ["rounding-after-finish", (race) => {
      const rounding = eventOf(race, "rounding");
      const finish = eventOf(race, "finish", rounding.boatId);
      rounding.t = finish.t + 0.000001;
      sortEvents(race);
    }],
    ["missing-finish-rank", (race) => {
      delete eventOf(race, "finish").rank;
    }],
    ["invalid-finish-rank", (race) => {
      eventOf(race, "finish").rank = Number.NaN;
    }],
    ["forbidden-rounding-rank", (race) => {
      eventOf(race, "rounding").rank = 1;
    }],
  ];

  let scenarios = 0;
  for (const meta of RACES) {
    for (const [label, mutate] of attacks) {
      for (const kind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        mutate(race);
        assertPreflightRejection(
          race,
          requestFor(race, kind),
          "invalid-event",
          "invalid-sample",
        );
        scenarios++;
      }
    }
  }
  t.diagnostic(`${scenarios} full-event corruptions across all shipped races`);
});

test("per-boat event lifecycle and chronological finish ranks gate every Stage 5 fact path", (t) => {
  const attacks = [
    ["remove-rounding-from-finished", (race) => {
      const finish = eventOf(race, "finish");
      race.events = race.events.filter(
        (event) => !(event.kind === "rounding" && event.boatId === finish.boatId),
      );
    }],
    ["duplicate-rounding", (race) => {
      const rounding = eventOf(race, "rounding");
      race.events.push({ ...rounding, t: rounding.t + 0.000001 });
      sortEvents(race);
    }],
    ["rounding-after-finish", (race) => {
      const finish = [...race.events].reverse().find((event) => event.kind === "finish");
      assert.ok(finish);
      race.events.push({ kind: "rounding", boatId: finish.boatId, t: finish.t + 0.000001 });
      sortEvents(race);
    }],
    ["duplicate-finish-and-rank", (race) => {
      const finish = [...race.events].reverse().find((event) => event.kind === "finish");
      assert.ok(finish);
      race.events.push({ ...finish, t: finish.t + 0.000001 });
      sortEvents(race);
    }],
    ["reversed-ranks", (race) => {
      const finishes = race.events.filter((event) => event.kind === "finish");
      [finishes[0].rank, finishes[1].rank] = [finishes[1].rank, finishes[0].rank];
    }],
    ["gapped-ranks", (race) => {
      const second = race.events.find(
        (event) => event.kind === "finish" && event.rank === 2,
      );
      assert.ok(second);
      race.events = race.events.filter((event) => event !== second);
    }],
    ["out-of-range-rank", (race) => {
      eventOf(race, "finish").rank = race.boats.length + 1;
    }],
    ["finish-without-rounding", (race) => {
      const finish = [...race.events].reverse().find((event) => event.kind === "finish");
      assert.ok(finish);
      race.events = race.events.filter(
        (event) => !(event.kind === "rounding" && event.boatId === finish.boatId),
      );
    }],
    ["two-boats-same-rank", (race) => {
      const finishes = race.events.filter((event) => event.kind === "finish");
      finishes[1].rank = finishes[0].rank;
    }],
  ];

  let scenarios = 0;
  for (const meta of RACES) {
    for (const [label, mutate] of attacks) {
      for (const kind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        mutate(race);
        assertPreflightRejection(
          race,
          requestFor(race, kind),
          "invalid-event",
          "invalid-sample",
        );
        scenarios++;
      }
    }
  }
  t.diagnostic(`${scenarios} lifecycle corruptions across all shipped races`);
});

test("unfinished boats may have zero or one rounding without changing public facts", (t) => {
  let scenarios = 0;
  for (const meta of RACES) {
    for (const kind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      const finishes = race.events.filter((event) => event.kind === "finish");
      const zeroRoundingId = finishes.at(-1).boatId;
      const oneRoundingId = finishes.at(-2).boatId;
      race.events = race.events.filter(
        (event) =>
          !(event.kind === "finish" &&
            (event.boatId === zeroRoundingId || event.boatId === oneRoundingId)) &&
          !(event.kind === "rounding" && event.boatId === zeroRoundingId),
      );
      const request = requestFor(race, kind);
      request.primaryBoatId = zeroRoundingId;
      if (kind === "boat") request.reference.boatId = oneRoundingId;

      assertPreflightAcceptance(race, request);
      assert.equal(
        raceAnalysisValidity(race, [zeroRoundingId]).boats[zeroRoundingId].finishMicros,
        null,
      );
      assert.equal(
        raceAnalysisValidity(race, [oneRoundingId]).boats[oneRoundingId].finishMicros,
        null,
      );
      scenarios++;
    }
  }
  t.diagnostic(`${scenarios} valid unfinished lifecycle scenarios across all shipped races`);
});

test("a missing finish is explicit open-ended racing, never an infinity sentinel", () => {
  for (const meta of RACES) {
    for (const kind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      const lastFinish = [...race.events].reverse().find((event) => event.kind === "finish");
      assert.ok(lastFinish);
      const primaryId = lastFinish.boatId;
      race.events = race.events.filter(
        (event) => !(event.kind === "finish" && event.boatId === primaryId),
      );
      const request = requestFor(race, kind);
      request.primaryBoatId = primaryId;
      if (kind === "boat" && request.reference.boatId === primaryId) {
        request.reference.boatId = race.boats.find((boat) => boat.id !== primaryId).id;
      }
      const requiredIds =
        kind === "boat"
          ? [primaryId, request.reference.boatId]
          : race.boats.map((boat) => boat.id);
      const validity = raceAnalysisValidity(race, requiredIds);
      assert.equal(validity.status, "valid");
      assert.equal(validity.boats[primaryId].finishMicros, null);
      const comparison = compareRange(race, request);
      assert.equal(comparison.status, "ok");
      assert.equal(comparison.boundaryFactsStatus, "available");
      assert.equal(integrateTrackRange(race, primaryId, request.range).status, "ok");
      assert.ok(Number.isFinite(dtfAt(race, primaryId, request.range.from)));
      assert.ok(!("error" in compareRangeForAnalyst(race, request)));
      assertFiniteOrNullTree(comparison);
    }
  }
});

test("invalid fix fields, progress fields, and series order fail before boundary facts", () => {
  const attacks = [
    ["twa", (race, boatId) => race.fixes[boatId][2].twa = Number.NaN],
    ["x", (race, boatId) => race.fixes[boatId][2].x = Infinity],
    ["y", (race, boatId) => race.fixes[boatId][2].y = Number.NaN],
    ["waterX", (race, boatId) => race.fixes[boatId][2].waterX = Infinity],
    ["waterY", (race, boatId) => race.fixes[boatId][2].waterY = Number.NaN],
    ["currentX", (race, boatId) => race.fixes[boatId][2].currentX = Infinity],
    ["currentY", (race, boatId) => race.fixes[boatId][2].currentY = Number.NaN],
    ["duplicate-fix", (race, boatId) => race.fixes[boatId][2].t = race.fixes[boatId][1].t],
    ["reversed-fix", (race, boatId) => [race.fixes[boatId][1].t, race.fixes[boatId][2].t] = [race.fixes[boatId][2].t, race.fixes[boatId][1].t]],
    ["dtf", (race, boatId) => race.progress[boatId][2].dtf = Number.NaN],
    ["leg", (race, boatId) => race.progress[boatId][2].leg = "teleporting"],
    ["duplicate-progress", (race, boatId) => race.progress[boatId][2].t = race.progress[boatId][1].t],
    ["reversed-progress", (race, boatId) => [race.progress[boatId][1].t, race.progress[boatId][2].t] = [race.progress[boatId][2].t, race.progress[boatId][1].t]],
  ];
  for (const meta of RACES) {
    for (const [, mutate] of attacks) {
      for (const kind of ["boat", "fleet-median"]) {
        const race = generateRace(meta.seed);
        mutate(race, race.boats[0].id);
        assertPreflightRejection(race, requestFor(race, kind), "invalid-sample", "invalid-sample");
      }
    }
  }
});

test("fleet preflight rejects required corruption but ignores or removes optional boats", () => {
  for (const meta of RACES) {
    const requiredRace = generateRace(meta.seed);
    const requiredRequest = requestFor(requiredRace, "fleet-median");
    requiredRace.fixes[requiredRace.boats[1].id][2].twa = Number.NaN;
    assertPreflightRejection(
      requiredRace,
      requiredRequest,
      "invalid-sample",
      "invalid-sample",
      requiredRace.boats[1].id,
    );

    const omittedRace = generateRace(meta.seed);
    const omittedId = omittedRace.boats.at(-1).id;
    omittedRace.fixes[omittedId][2].twa = Number.NaN;
    const omittedRequest = requestFor(omittedRace, "fleet-median");
    omittedRequest.reference.boatIds = omittedRequest.reference.boatIds.slice(0, -1);
    assert.equal(compareRange(omittedRace, omittedRequest).status, "ok");

    const ineligibleRace = generateRace(meta.seed);
    const ineligibleId = ineligibleRace.boats.at(-1).id;
    delete ineligibleRace.progress[ineligibleId];
    const ineligibleRequest = requestFor(ineligibleRace, "fleet-median");
    const ineligible = compareRange(ineligibleRace, ineligibleRequest);
    assert.equal(ineligible.status, "ok");
    assert.deepEqual(ineligible.reference.ineligibleCohortIds, [ineligibleId]);
    assert.ok(!ineligible.reference.eligibleCohortIds.includes(ineligibleId));
    assert.equal(
      raceAnalysisValidity(ineligibleRace, [
        ineligibleRequest.primaryBoatId,
        ...ineligible.reference.eligibleCohortIds,
      ]).status,
      "valid",
    );
    assert.equal(
      integrateTrackRange(
        ineligibleRace,
        ineligibleRequest.primaryBoatId,
        ineligibleRequest.range,
      ).status,
      "ok",
    );
    assert.equal(
      progressBoundaryStatusAt(
        ineligibleRace,
        ineligibleRequest.primaryBoatId,
        ineligibleRequest.range.from,
      ),
      "available",
    );
    assert.ok(
      Number.isFinite(
        dtfAt(
          ineligibleRace,
          ineligibleRequest.primaryBoatId,
          ineligibleRequest.range.from,
        ),
      ),
    );
    const analyst = compareRangeForAnalyst(ineligibleRace, ineligibleRequest);
    assert.ok(!("error" in analyst));
    const view = comparisonViewModel(ineligibleRace, ineligible);
    assert.equal(view.status, "ok");
    assertFiniteOrNullTree(ineligible);
    assertFiniteOrNullTree(analyst);
    assertFiniteOrNullTree(view);
  }
});

test("overflowing component sums fail full preflight before comparison arithmetic", () => {
  for (const meta of RACES) {
    for (const kind of ["boat", "fleet-median"]) {
      const race = generateRace(meta.seed);
      const primaryId = race.boats[0].id;
      for (const fix of race.fixes[primaryId]) {
        fix.twa = fix.t < 9 ? 40 : -40;
        fix.waterX = Number.MAX_VALUE;
        fix.currentX = Number.MAX_VALUE;
      }
      assert.equal(raceAnalysisValidity(race, [primaryId]).status, "invalid-sample");
      const result = compareRange(race, requestFor(race, kind));
      assert.equal(result.status, "missing-boundary-data");
      assertFiniteOrNullTree(result, "comparison");
    }
  }
});

test("normal performance loss equality and Stage 5 equations stay exact", () => {
  for (const meta of RACES) {
    const race = generateRace(meta.seed);
    const review = polarReview(race);
    for (const boat of race.boats) {
      const moves = maneuversOf(race, boat.id);
      for (const move of moves) {
        assert.ok(Number.isFinite(move.loss));
        assert.equal(move.lossMps, move.loss);
        assert.equal(move.lossKnots, knots(move.loss));
      }
      const racingMoves = moves.filter((move) => {
        const leg = legAt(race, boat.id, move.t);
        return leg === "beat" || leg === "run";
      });
      const row = review.boats.find((candidate) => candidate.boatId === boat.id);
      const expectedLoss = racingMoves.reduce((sum, move) => sum + move.loss, 0) / racingMoves.length;
      assert.equal(row.lossPerTurn, expectedLoss);
    }
    for (const kind of ["boat", "fleet-median"]) {
      const comparison = compareRange(race, requestFor(race, kind));
      assert.equal(comparison.status, "ok");
      assert.ok(
        Math.abs(
          comparison.progressGainedMeters -
            comparison.straightDeltaMeters -
            comparison.maneuverWindowDeltaMeters -
            comparison.residualMeters,
        ) <= 1e-9,
      );
      assertFiniteOrNullTree(comparison);
    }
  }
});
