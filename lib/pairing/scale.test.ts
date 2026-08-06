import { describe, expect, test } from "vitest";
import { generatePairings } from "./engine";
import { calculateBreak, seedBracket, advanceBracket } from "./breaks";
import type { PairingJudge, PairingTeam, RoundStage } from "./types";

/**
 * Field sizes the league actually runs, from a small club competition to a
 * Dreams camp of roughly five hundred students in teams of three.
 */
const FIELD_SIZES = [2, 3, 6, 8, 15, 24, 32, 47, 64, 100, 166, 250];

function makeTeams(count: number, schoolsPerTeam = 1): PairingTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    team_id: `t${i.toString().padStart(4, "0")}`,
    name: `Team ${i}`,
    // Several teams share a school, which is what makes the school penalty bite.
    school_id: `school${Math.floor(i / schoolsPerTeam)}`,
    wins: 0,
    total_points: 0,
    opponents_faced: [],
    prior_opponents: [],
    side_history: [],
    bye_rounds: [],
  }));
}

function makeJudges(count: number): PairingJudge[] {
  return Array.from({ length: count }, (_, i) => ({
    judge_id: `j${i.toString().padStart(4, "0")}`,
    name: `Judge ${i}`,
    school_id: `judgeschool${i}`,
    conflicts: [],
    debates_judged: 0,
    elimination_debates: 0,
    feedback_score: 3,
  }));
}

function pair(
  teams: PairingTeam[],
  round: number,
  stage: RoundStage = "prelim",
  judges = makeJudges(Math.ceil(teams.length / 2))
) {
  return generatePairings({
    teams,
    judges,
    rooms: Array.from({ length: Math.ceil(teams.length / 2) }, (_, i) => ({
      name: `Room ${i + 1}`,
    })),
    round_number: round,
    stage,
    judges_per_debate: 1,
    seed: round * 7919 + teams.length,
  });
}

/**
 * Plays a round: records the meeting, the side, and a deterministic result so
 * standings diverge the way they do across a real tournament.
 */
function applyRound(
  teams: PairingTeam[],
  result: ReturnType<typeof generatePairings>,
  round: number
): PairingTeam[] {
  const byId = new Map(teams.map((team) => [team.team_id, { ...team }]));

  for (const debate of result.debates) {
    const prop = debate.proposition_team_id ? byId.get(debate.proposition_team_id) : null;
    const opp = debate.opposition_team_id ? byId.get(debate.opposition_team_id) : null;

    if (debate.is_bye) {
      const team = prop ?? opp;
      if (team) {
        team.bye_rounds = [...team.bye_rounds, round];
        team.wins += 1;
        team.total_points += 210;
      }
      continue;
    }

    if (!prop || !opp) continue;

    prop.opponents_faced = [...prop.opponents_faced, opp.team_id];
    opp.opponents_faced = [...opp.opponents_faced, prop.team_id];
    prop.side_history = [...prop.side_history, "proposition"];
    opp.side_history = [...opp.side_history, "opposition"];

    // The lower id wins, so results are reproducible rather than random.
    const winner = prop.team_id < opp.team_id ? prop : opp;
    const loser = winner === prop ? opp : prop;

    winner.wins += 1;
    winner.total_points += 215;
    loser.total_points += 205;
  }

  return teams.map((team) => byId.get(team.team_id)!);
}

function placedTeams(result: ReturnType<typeof generatePairings>): string[] {
  return result.debates.flatMap((debate) =>
    [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean) as string[]
  );
}

describe("every team is placed, at every field size", () => {
  test.each(FIELD_SIZES)("%i teams", (count) => {
    const teams = makeTeams(count);
    const result = pair(teams, 1);

    const placed = placedTeams(result);

    expect(result.unpaired).toEqual([]);
    expect(new Set(placed).size).toBe(count);
    expect(placed).toHaveLength(count);
  });

  test.each(FIELD_SIZES)("%i teams, many teams per school", (count) => {
    // Six teams to a school makes a same-school-free draw impossible to find
    // by filtering, which is exactly where the old hard-skip dropped teams.
    const teams = makeTeams(count, 6);
    const result = pair(teams, 1);

    expect(result.unpaired).toEqual([]);
    expect(new Set(placedTeams(result)).size).toBe(count);
  });

  test.each(FIELD_SIZES)("%i teams all from one school", (count) => {
    const teams = makeTeams(count).map((team) => ({ ...team, school_id: "only" }));
    const result = pair(teams, 1);

    expect(result.unpaired).toEqual([]);
    expect(new Set(placedTeams(result)).size).toBe(count);
  });
});

describe("an odd field", () => {
  test.each(FIELD_SIZES.filter((n) => n % 2 === 1))("%i teams gives exactly one bye", (count) => {
    const result = pair(makeTeams(count), 1);
    const byes = result.debates.filter((debate) => debate.is_bye);

    expect(byes).toHaveLength(1);
    expect(new Set(placedTeams(result)).size).toBe(count);
  });

  test.each(FIELD_SIZES.filter((n) => n % 2 === 0))("%i teams gives no bye", (count) => {
    expect(pair(makeTeams(count), 1).debates.filter((d) => d.is_bye)).toHaveLength(0);
  });

  test("a team that already had a bye does not get a second one", () => {
    let teams = makeTeams(15);

    for (let round = 1; round <= 5; round += 1) {
      teams = applyRound(teams, pair(teams, round), round);
    }

    expect(teams.every((team) => team.bye_rounds.length <= 1)).toBe(true);
  });
});

describe("a full five-round prelim series", () => {
  test.each(FIELD_SIZES.filter((n) => n >= 8))("%i teams never repeats a pairing", (count) => {
    let teams = makeTeams(count);
    const met = new Set<string>();

    for (let round = 1; round <= 5; round += 1) {
      const result = pair(teams, round);

      expect(result.unpaired).toEqual([]);
      expect(new Set(placedTeams(result)).size).toBe(count);

      for (const debate of result.debates) {
        if (debate.is_bye) continue;

        const key = [debate.proposition_team_id, debate.opposition_team_id].sort().join("+");

        expect(met.has(key)).toBe(false);
        met.add(key);
      }

      teams = applyRound(teams, result, round);
    }
  });

  test("sides stay balanced across five rounds", () => {
    let teams = makeTeams(64);

    for (let round = 1; round <= 5; round += 1) {
      teams = applyRound(teams, pair(teams, round), round);
    }

    for (const team of teams) {
      const prop = team.side_history.filter((side) => side === "proposition").length;
      const opp = team.side_history.length - prop;

      // Five rounds cannot split evenly, so one extra on a side is the floor.
      expect(Math.abs(prop - opp)).toBeLessThanOrEqual(1);
    }
  });

  test("teams meet opponents on a similar record", () => {
    let teams = makeTeams(64);

    for (let round = 1; round <= 3; round += 1) {
      teams = applyRound(teams, pair(teams, round), round);
    }

    const byId = new Map(teams.map((team) => [team.team_id, team]));
    const result = pair(teams, 4);

    const gaps = result.debates
      .filter((debate) => !debate.is_bye)
      .map((debate) => {
        const prop = byId.get(debate.proposition_team_id!)!;
        const opp = byId.get(debate.opposition_team_id!)!;
        return Math.abs(prop.wins - opp.wins);
      });

    const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    expect(average).toBeLessThanOrEqual(1);
  });
});

describe("history from other tournaments", () => {
  test("a prior meeting is avoided when an alternative exists", () => {
    const teams = makeTeams(32).map((team, i) => ({
      ...team,
      // Pair each team off with its neighbour as a previous-tournament meeting.
      prior_opponents: [`t${(i % 2 === 0 ? i + 1 : i - 1).toString().padStart(4, "0")}`],
    }));

    const result = pair(teams, 1);

    const repeats = result.debates.filter((debate) => {
      if (debate.is_bye) return false;
      const prop = teams.find((t) => t.team_id === debate.proposition_team_id)!;
      return prop.prior_opponents.includes(debate.opposition_team_id!);
    });

    expect(repeats).toHaveLength(0);
  });

  test("a prior meeting is allowed rather than dropping a team", () => {
    // Every team has met every other team before, so some prior meeting must
    // be repeated. No team may be left out on that account.
    const ids = Array.from({ length: 8 }, (_, i) => `t${i.toString().padStart(4, "0")}`);
    const teams = makeTeams(8).map((team) => ({
      ...team,
      prior_opponents: ids.filter((id) => id !== team.team_id),
    }));

    const result = pair(teams, 1);

    expect(result.unpaired).toEqual([]);
    expect(new Set(placedTeams(result)).size).toBe(8);
  });
});

describe("judging at scale", () => {
  test("every room is judged when there are enough judges", () => {
    const teams = makeTeams(166);
    const result = pair(teams, 1, "prelim", makeJudges(83));

    expect(result.debates.every((debate) => debate.is_bye || debate.judges.length === 1)).toBe(true);
  });

  test("a judge is never seated on their own school's debate", () => {
    const teams = makeTeams(32);
    const judges = makeJudges(16).map((judge, i) => ({
      ...judge,
      school_id: `school${i}`,
    }));

    const result = pair(teams, 1, "prelim", judges);
    const byId = new Map(teams.map((team) => [team.team_id, team]));

    for (const debate of result.debates) {
      for (const judgeId of debate.judges) {
        const judge = judges.find((j) => j.judge_id === judgeId)!;
        const schools = [debate.proposition_team_id, debate.opposition_team_id]
          .filter(Boolean)
          .map((id) => byId.get(id as string)!.school_id);

        expect(schools).not.toContain(judge.school_id);
      }
    }
  });

  test("a shortfall of judges is reported, not silently accepted", () => {
    const result = pair(makeTeams(32), 1, "prelim", makeJudges(2));

    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  test.each(FIELD_SIZES)("%i teams: the same inputs give the same draw", (count) => {
    const teams = makeTeams(count);

    const a = pair(teams, 1);
    const b = pair(teams, 1);

    expect(JSON.stringify(a.debates)).toBe(JSON.stringify(b.debates));
  });

  test("input order does not change the draw", () => {
    const teams = makeTeams(64);

    const forwards = pair(teams, 2);
    const backwards = pair([...teams].reverse(), 2);

    const key = (result: ReturnType<typeof generatePairings>) =>
      result.debates
        .map((d) => [d.proposition_team_id, d.opposition_team_id].sort().join("+"))
        .sort()
        .join("|");

    expect(key(forwards)).toBe(key(backwards));
  });

  test("a different seed gives a different round-one draw", () => {
    const teams = makeTeams(64);

    const one = generatePairings({
      teams, judges: makeJudges(32), rooms: [], round_number: 1,
      stage: "prelim", judges_per_debate: 1, seed: 1,
    });
    const two = generatePairings({
      teams, judges: makeJudges(32), rooms: [], round_number: 1,
      stage: "prelim", judges_per_debate: 1, seed: 2,
    });

    expect(JSON.stringify(one.debates)).not.toBe(JSON.stringify(two.debates));
  });
});

describe("elimination rounds", () => {
  test.each([16, 24, 32, 47, 64, 166])("a field of %i breaks to a power of two", (count) => {
    let teams = makeTeams(count);

    for (let round = 1; round <= 5; round += 1) {
      teams = applyRound(teams, pair(teams, round), round);
    }

    const result = calculateBreak(teams);

    expect(Number.isInteger(Math.log2(result.size))).toBe(true);
    expect(result.breaking).toHaveLength(result.size);
  });

  test("a rematch is allowed in elims", () => {
    // Two teams that already met in prelims must still be able to face each
    // other in a bracket, where the seeding decides the room.
    const teams = makeTeams(8).map((team, i) => ({
      ...team,
      wins: 8 - i,
      total_points: 2000 - i,
      opponents_faced: makeTeams(8)
        .map((other) => other.team_id)
        .filter((id) => id !== team.team_id),
    }));

    const result = pair(teams, 6, "elim");

    expect(result.unpaired).toEqual([]);
    expect(new Set(placedTeams(result)).size).toBe(8);
  });

  test("a bracket runs down to a single winner", () => {
    let teams = makeTeams(100);

    for (let round = 1; round <= 5; round += 1) {
      teams = applyRound(teams, pair(teams, round), round);
    }

    let breaking = calculateBreak(teams).breaking;
    const seeds = new Map(breaking.map((entry) => [entry.team_id, entry.seed]));
    let rounds = 0;

    const size = breaking.length;

    while (breaking.length > 1) {
      const bracket = seedBracket(breaking);

      expect(bracket).toHaveLength(breaking.length / 2);
      expect(bracket.every((p) => p.high_seed !== p.low_seed)).toBe(true);

      breaking = advanceBracket(bracket.map((p) => p.high_seed), seeds);
      rounds += 1;
    }

    expect(breaking).toHaveLength(1);
    expect(rounds).toBe(Math.log2(size));
  });
});

describe("degenerate fields", () => {
  test("a single team cannot be paired", () => {
    const result = pair(makeTeams(1), 1);

    expect(result.debates).toEqual([]);
    expect(result.unpaired).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("an empty field is not an error", () => {
    const result = pair(makeTeams(0), 1);

    expect(result.debates).toEqual([]);
    expect(result.unpaired).toEqual([]);
  });

  test("two teams make one debate", () => {
    const result = pair(makeTeams(2), 1);

    expect(result.debates).toHaveLength(1);
    expect(result.debates[0].is_bye).toBe(false);
  });

  test("no judges at all still produces a draw", () => {
    const result = pair(makeTeams(16), 1, "prelim", []);

    expect(result.debates).toHaveLength(8);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
