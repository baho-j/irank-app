import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { generatePairings } from "./engine";
import { pairingCost, sideBalance } from "./cost";
import type { PairingInput, PairingJudge, PairingTeam, RoundStage } from "./types";

function team(id: number, overrides: Partial<PairingTeam> = {}): PairingTeam {
  return {
    team_id: `t${id.toString().padStart(3, "0")}`,
    name: `Team ${id}`,
    school_id: `school${id}`,
    wins: 0,
    total_points: 0,
    opponents_faced: [],
    prior_opponents: [],
    side_history: [],
    bye_rounds: [],
    ...overrides,
  };
}

function judge(id: number, overrides: Partial<PairingJudge> = {}): PairingJudge {
  return {
    judge_id: `j${id}`,
    name: `Judge ${id}`,
    school_id: `judgeSchool${id}`,
    conflicts: [],
    debates_judged: 0,
    elimination_debates: 0,
    feedback_score: 4,
    ...overrides,
  };
}

function input(
  teams: PairingTeam[],
  overrides: Partial<PairingInput> = {}
): PairingInput {
  const judgeCount = Math.max(1, Math.ceil(teams.length / 2));

  return {
    teams,
    judges: Array.from({ length: judgeCount }, (_, i) => judge(i)),
    rooms: Array.from({ length: Math.ceil(teams.length / 2) }, (_, i) => ({
      name: `Room ${i + 1}`,
    })),
    round_number: 1,
    stage: "prelim" as RoundStage,
    judges_per_debate: 1,
    seed: 12345,
    ...overrides,
  };
}

const makeTeams = (count: number, overrides: (i: number) => Partial<PairingTeam> = () => ({})) =>
  Array.from({ length: count }, (_, i) => team(i, overrides(i)));

/** Every team appears exactly once, whether in a debate or on a bye. */
function assertEveryTeamPlaced(teams: PairingTeam[], result: ReturnType<typeof generatePairings>) {
  const placements = result.debates.flatMap((debate) =>
    [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
  );

  expect(result.unpaired).toEqual([]);
  expect(new Set(placements).size).toBe(placements.length);
  expect(new Set(placements)).toEqual(new Set(teams.map((t) => t.team_id)));
}

describe("every team is placed, at every scale", () => {
  test.each([
    ["small", 6],
    ["small odd", 7],
    ["club", 8],
    ["medium", 24],
    ["medium odd", 31],
    ["large", 64],
    ["regional", 100],
    ["dreams: 500 students", 166],
  ])("%s — %i teams", (_label, count) => {
    const teams = makeTeams(count);
    const result = generatePairings(input(teams));

    assertEveryTeamPlaced(teams, result);
  });

  test("an odd field gives exactly one bye", () => {
    const teams = makeTeams(31);
    const result = generatePairings(input(teams));

    expect(result.debates.filter((d) => d.is_bye)).toHaveLength(1);
    expect(result.debates.filter((d) => !d.is_bye)).toHaveLength(15);
  });

  test("an even field gives no bye", () => {
    const result = generatePairings(input(makeTeams(24)));

    expect(result.debates.some((d) => d.is_bye)).toBe(false);
  });

  test("two teams still pair", () => {
    const teams = makeTeams(2);
    assertEveryTeamPlaced(teams, generatePairings(input(teams)));
  });

  test("a single team cannot be paired and is reported, not dropped silently", () => {
    const result = generatePairings(input(makeTeams(1)));

    expect(result.unpaired).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/at least two teams/i);
  });
});

describe("determinism", () => {
  test("the same inputs and seed reproduce the draw exactly", () => {
    const teams = makeTeams(32);

    const first = generatePairings(input(teams));
    const second = generatePairings(input(teams));

    expect(JSON.stringify(first.debates)).toBe(JSON.stringify(second.debates));
  });

  test("a different seed gives a different round one draw", () => {
    const teams = makeTeams(32, (i) => ({ school_id: `school${i % 8}` }));

    const draws = new Set(
      [1, 7, 99, 12345, 88888].map((seed) =>
        JSON.stringify(generatePairings(input(teams, { seed })).debates)
      )
    );

    // Not every seed must differ, but they cannot all collapse to one draw.
    expect(draws.size).toBeGreaterThan(1);
  });

  test("input order does not change a standings-based draw", () => {
    const teams = makeTeams(16, (i) => ({ wins: i % 4, total_points: 200 + i }));

    const forwards = generatePairings(input(teams, { round_number: 2 }));
    const backwards = generatePairings(input([...teams].reverse(), { round_number: 2 }));

    expect(JSON.stringify(forwards.debates)).toBe(JSON.stringify(backwards.debates));
  });
});

describe("repeat opponents", () => {
  test("teams that have already met are not paired again when avoidable", () => {
    const teams = makeTeams(8, (i) => ({
      opponents_faced: i === 0 ? ["t001"] : i === 1 ? ["t000"] : [],
    }));

    const result = generatePairings(input(teams, { round_number: 2 }));

    const rematch = result.debates.find(
      (debate) =>
        (debate.proposition_team_id === "t000" && debate.opposition_team_id === "t001") ||
        (debate.proposition_team_id === "t001" && debate.opposition_team_id === "t000")
    );

    expect(rematch).toBeUndefined();
  });

  test("an unavoidable rematch is made and reported, never dropped", () => {
    // Two teams that have already met, with nobody else to pair with.
    const teams = [
      team(0, { opponents_faced: ["t001"] }),
      team(1, { opponents_faced: ["t000"] }),
    ];

    const result = generatePairings(input(teams, { round_number: 2 }));

    assertEveryTeamPlaced(teams, result);
    expect(result.debates[0].compromises).toContain("repeat opponent");
    expect(result.warnings.join(" ")).toMatch(/repeat opponent/i);
  });

  test("elimination rounds allow rematches without penalty", () => {
    const teams = [
      team(0, { opponents_faced: ["t001"] }),
      team(1, { opponents_faced: ["t000"] }),
    ];

    const result = generatePairings(input(teams, { stage: "elim", round_number: 4 }));

    expect(result.debates[0].compromises).not.toContain("repeat opponent");
  });
});

describe("same school", () => {
  test("teams from one school are kept apart when possible", () => {
    const teams = makeTeams(8, (i) => ({ school_id: i < 2 ? "shared" : `school${i}` }));

    const result = generatePairings(input(teams));

    const clash = result.debates.find(
      (debate) =>
        [debate.proposition_team_id, debate.opposition_team_id].sort().join() ===
        ["t000", "t001"].sort().join()
    );

    expect(clash).toBeUndefined();
  });

  test("an unavoidable same-school pairing is reported", () => {
    const teams = [
      team(0, { school_id: "shared" }),
      team(1, { school_id: "shared" }),
    ];

    const result = generatePairings(input(teams));

    assertEveryTeamPlaced(teams, result);
    expect(result.debates[0].compromises).toContain("same school");
  });
});

describe("cross-tournament history", () => {
  test("teams that met at a previous tournament are separated when possible", () => {
    const teams = makeTeams(8, (i) => ({
      prior_opponents: i === 0 ? ["t001"] : i === 1 ? ["t000"] : [],
    }));

    const result = generatePairings(input(teams, { round_number: 2 }));

    const rematch = result.debates.find(
      (debate) =>
        [debate.proposition_team_id, debate.opposition_team_id].sort().join() ===
        ["t000", "t001"].sort().join()
    );

    expect(rematch).toBeUndefined();
  });

  test("a recent prior meeting is avoided more strongly than an old one", () => {
    const recent = team(0, { prior_opponents: ["t001"] });
    const old = team(2, { prior_opponents: ["a", "b", "c", "t003"] });

    const recentCost = pairingCost(recent, team(1), "prelim").total;
    const oldCost = pairingCost(old, team(3), "prelim").total;

    expect(recentCost).toBeGreaterThan(oldCost);
  });

  test("prior meetings do not constrain elimination rounds", () => {
    const teams = [
      team(0, { prior_opponents: ["t001"] }),
      team(1, { prior_opponents: ["t000"] }),
    ];

    const result = generatePairings(input(teams, { stage: "elim" }));

    expect(result.debates[0].compromises).not.toContain(
      "met at a previous tournament"
    );
  });
});

describe("sides", () => {
  test("a team that has been proposition twice takes opposition", () => {
    const teams = [
      team(0, { side_history: ["proposition", "proposition"] }),
      team(1, { side_history: ["opposition", "opposition"] }),
    ];

    const result = generatePairings(input(teams, { round_number: 3 }));

    expect(result.debates[0].proposition_team_id).toBe("t001");
    expect(result.debates[0].opposition_team_id).toBe("t000");
  });

  test("side balance stays within tolerance across a five-round tournament", () => {
    let teams = makeTeams(24);

    for (let round = 1; round <= 5; round += 1) {
      const result = generatePairings(
        input(teams, { round_number: round, seed: 100 + round })
      );

      const updated = new Map(teams.map((t) => [t.team_id, { ...t }]));

      result.debates
        .filter((debate) => !debate.is_bye)
        .forEach((debate) => {
          updated.get(debate.proposition_team_id!)!.side_history.push("proposition");
          updated.get(debate.opposition_team_id!)!.side_history.push("opposition");
          updated.get(debate.proposition_team_id!)!.opponents_faced.push(debate.opposition_team_id!);
          updated.get(debate.opposition_team_id!)!.opponents_faced.push(debate.proposition_team_id!);
        });

      teams = Array.from(updated.values());
    }

    teams.forEach((t) => {
      expect(Math.abs(sideBalance(t))).toBeLessThanOrEqual(2);
    });
  });
});

describe("judges", () => {
  test("a judge is never seated against their own school", () => {
    const teams = makeTeams(4, (i) => ({ school_id: i === 0 ? "clash" : `school${i}` }));
    const judges = [
      judge(0, { school_id: "clash" }),
      judge(1),
      judge(2),
    ];

    const result = generatePairings(input(teams, { judges }));

    result.debates
      .filter((debate) => !debate.is_bye)
      .forEach((debate) => {
        const involvesClashSchool =
          debate.proposition_team_id === "t000" || debate.opposition_team_id === "t000";

        if (involvesClashSchool) {
          expect(debate.judges).not.toContain("j0");
        }
      });
  });

  test("a declared clash is respected", () => {
    const teams = makeTeams(4);
    const judges = [judge(0, { conflicts: ["t000"] }), judge(1), judge(2)];

    const result = generatePairings(input(teams, { judges }));

    result.debates
      .filter((d) => d.proposition_team_id === "t000" || d.opposition_team_id === "t000")
      .forEach((debate) => expect(debate.judges).not.toContain("j0"));
  });

  test("a short panel is reported rather than seating a conflicted judge", () => {
    const teams = makeTeams(2, () => ({ school_id: "shared" }));
    const judges = [judge(0, { school_id: "shared" })];

    const result = generatePairings(input(teams, { judges, judges_per_debate: 1 }));

    expect(result.debates[0].judges).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/could be seated/i);
  });

  test("judging load is spread rather than concentrated", () => {
    const teams = makeTeams(16);
    const judges = Array.from({ length: 8 }, (_, i) => judge(i));

    const result = generatePairings(input(teams, { judges, judges_per_debate: 1 }));

    const counts = new Map<string, number>();
    result.debates.forEach((debate) =>
      debate.judges.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    );

    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
});

describe("byes", () => {
  test("a team that has already had a bye does not get another while others have none", () => {
    const teams = makeTeams(7, (i) => ({ bye_rounds: i === 6 ? [1] : [] }));

    const result = generatePairings(input(teams, { round_number: 2 }));
    const bye = result.debates.find((debate) => debate.is_bye);

    expect(bye!.proposition_team_id).not.toBe("t006");
  });

  test("byes rotate across five rounds rather than landing on one team", () => {
    let teams = makeTeams(9);
    const byeCounts = new Map<string, number>();

    for (let round = 1; round <= 5; round += 1) {
      const result = generatePairings(
        input(teams, { round_number: round, seed: 200 + round })
      );

      const bye = result.debates.find((debate) => debate.is_bye);

      if (bye?.proposition_team_id) {
        byeCounts.set(
          bye.proposition_team_id,
          (byeCounts.get(bye.proposition_team_id) ?? 0) + 1
        );

        teams = teams.map((t) =>
          t.team_id === bye.proposition_team_id
            ? { ...t, bye_rounds: [...t.bye_rounds, round] }
            : t
        );
      }
    }

    expect(Math.max(...byeCounts.values())).toBeLessThanOrEqual(2);
  });
});

describe("elimination brackets", () => {
  test("a break of 16 pairs into 8 rooms", () => {
    const teams = makeTeams(16, (i) => ({ wins: 16 - i, total_points: 2000 - i }));

    const result = generatePairings(input(teams, { stage: "elim", round_number: 6 }));

    expect(result.debates.filter((d) => !d.is_bye)).toHaveLength(8);
    assertEveryTeamPlaced(teams, result);
  });

  test.each([4, 8, 16, 32])("a break of %i is structurally valid", (size) => {
    const teams = makeTeams(size, (i) => ({ wins: size - i, total_points: 1000 - i }));

    const result = generatePairings(input(teams, { stage: "elim", round_number: 6 }));

    expect(result.debates.filter((d) => !d.is_bye)).toHaveLength(size / 2);
    assertEveryTeamPlaced(teams, result);
  });
});

describe("scale", () => {
  test("166 teams pair in reasonable time", () => {
    const teams = makeTeams(166);

    const started = Date.now();
    const result = generatePairings(input(teams));
    const elapsed = Date.now() - started;

    assertEveryTeamPlaced(teams, result);
    expect(elapsed).toBeLessThan(3000);
  });

  test("a full five-round Dreams tournament never loses a team", () => {
    let teams = makeTeams(166);

    for (let round = 1; round <= 5; round += 1) {
      const result = generatePairings(
        input(teams, { round_number: round, seed: 300 + round })
      );

      assertEveryTeamPlaced(teams, result);

      const updated = new Map(teams.map((t) => [t.team_id, { ...t }]));

      result.debates
        .filter((debate) => !debate.is_bye)
        .forEach((debate) => {
          const prop = updated.get(debate.proposition_team_id!)!;
          const opp = updated.get(debate.opposition_team_id!)!;

          prop.opponents_faced.push(opp.team_id);
          opp.opponents_faced.push(prop.team_id);
          prop.side_history.push("proposition");
          opp.side_history.push("opposition");
          prop.wins += 1;
          prop.total_points += 210;
          opp.total_points += 200;
        });

      teams = Array.from(updated.values());
    }

    // After five rounds nobody should have met the same team twice.
    teams.forEach((t) => {
      expect(new Set(t.opponents_faced).size).toBe(t.opponents_faced.length);
    });
  });
});

describe("properties", () => {
  test("no team is ever dropped, for any field size", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 80 }), fc.integer({ min: 1, max: 9999 }), (count, seed) => {
        const teams = makeTeams(count);
        const result = generatePairings(input(teams, { seed }));

        const placed = result.debates.flatMap((debate) =>
          [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
        );

        return result.unpaired.length === 0 && new Set(placed).size === count;
      }),
      { numRuns: 60 }
    );
  });

  test("no team is ever paired with itself", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 60 }), (count) => {
        const result = generatePairings(input(makeTeams(count)));

        return result.debates.every(
          (debate) =>
            debate.is_bye || debate.proposition_team_id !== debate.opposition_team_id
        );
      }),
      { numRuns: 40 }
    );
  });

  test("no team appears twice in one round", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 60 }), (count) => {
        const result = generatePairings(input(makeTeams(count)));

        const placed = result.debates.flatMap((debate) =>
          [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
        );

        return new Set(placed).size === placed.length;
      }),
      { numRuns: 40 }
    );
  });
});
