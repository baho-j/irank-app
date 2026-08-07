import { describe, expect, test } from "vitest";
import { generatePairings } from "./engine";
import type { PairingJudge, PairingTeam } from "./types";

const PANEL_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function teams(count: number, schoolsPerTeam = 1): PairingTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    team_id: `t${i.toString().padStart(4, "0")}`,
    name: `Team ${i}`,
    school_id: `school${Math.floor(i / schoolsPerTeam)}`,
    wins: 0,
    total_points: 0,
    opponents_faced: [],
    prior_opponents: [],
    side_history: [],
    bye_rounds: [],
  }));
}

function judges(count: number, overrides: Partial<PairingJudge> = {}): PairingJudge[] {
  return Array.from({ length: count }, (_, i) => ({
    judge_id: `j${i.toString().padStart(4, "0")}`,
    name: `Judge ${i}`,
    school_id: `jschool${i}`,
    conflicts: [],
    debates_judged: 0,
    elimination_debates: 0,
    feedback_score: 3,
    ...overrides,
  }));
}

function pair(
  teamList: PairingTeam[],
  judgeList: PairingJudge[],
  perDebate: number,
  round = 1
) {
  return generatePairings({
    teams: teamList,
    judges: judgeList,
    rooms: [],
    round_number: round,
    stage: "prelim",
    judges_per_debate: perDebate,
    seed: round * 7919 + teamList.length,
  });
}

describe("panels of every size", () => {
  test.each(PANEL_SIZES)("a panel of %i is seated in full when judges allow", (size) => {
    const field = teams(16);
    const result = pair(field, judges(8 * size), size);

    const contested = result.debates.filter((debate) => !debate.is_bye);

    expect(contested).toHaveLength(8);
    expect(contested.every((debate) => debate.judges.length === size)).toBe(true);
  });

  test.each(PANEL_SIZES)("a panel of %i names a head judge", (size) => {
    const result = pair(teams(16), judges(8 * size), size);

    for (const debate of result.debates.filter((d) => !d.is_bye)) {
      expect(debate.head_judge_id).toBeDefined();
      expect(debate.judges).toContain(debate.head_judge_id);
    }
  });

  test.each(PANEL_SIZES)("a panel of %i never seats the same judge twice", (size) => {
    const result = pair(teams(16), judges(8 * size), size);

    for (const debate of result.debates) {
      expect(new Set(debate.judges).size).toBe(debate.judges.length);
    }
  });

  test.each(PANEL_SIZES)("a panel of %i never seats a judge in two rooms at once", (size) => {
    const result = pair(teams(16), judges(8 * size), size);

    const seated = result.debates.flatMap((debate) => debate.judges);

    expect(new Set(seated).size).toBe(seated.length);
  });

  test.each([3, 5, 7, 9])("an odd panel of %i can always reach a majority", (size) => {
    const result = pair(teams(24), judges(12 * size), size);

    // WSDC panels decide by majority, which an even panel cannot guarantee.
    for (const debate of result.debates.filter((d) => !d.is_bye)) {
      expect(debate.judges.length % 2).toBe(1);
    }
  });
});

describe("panels when judges are scarce", () => {
  test.each(PANEL_SIZES)("a panel of %i reports the shortfall rather than hiding it", (size) => {
    // Half the judges a full panel would need.
    const available = Math.max(1, Math.floor((8 * size) / 2));
    const result = pair(teams(16), judges(available), size);

    if (available < 8 * size) {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  test.each(PANEL_SIZES)("a panel of %i still produces a complete draw", (size) => {
    const result = pair(teams(16), judges(2), size);

    const placed = result.debates.flatMap((debate) =>
      [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
    );

    expect(result.unpaired).toEqual([]);
    expect(new Set(placed).size).toBe(16);
  });

  test("no judges at all still draws the rooms", () => {
    const result = pair(teams(16), [], 3);

    expect(result.debates).toHaveLength(8);
    expect(result.debates.every((debate) => debate.judges.length === 0)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("conflicts across a panel", () => {
  test.each(PANEL_SIZES)("no judge on a panel of %i judges their own school", (size) => {
    const field = teams(16);
    // Judges drawn from the competing schools, so a naive fill would clash.
    const panel = judges(8 * size).map((judge, i) => ({
      ...judge,
      school_id: `school${i % 16}`,
    }));

    const result = pair(field, panel, size);
    const byId = new Map(field.map((team) => [team.team_id, team]));

    for (const debate of result.debates) {
      const schools = [debate.proposition_team_id, debate.opposition_team_id]
        .filter(Boolean)
        .map((id) => byId.get(id as string)!.school_id);

      for (const judgeId of debate.judges) {
        const judge = panel.find((entry) => entry.judge_id === judgeId)!;
        expect(schools).not.toContain(judge.school_id);
      }
    }
  });

  test.each(PANEL_SIZES)("a declared clash is honoured on a panel of %i", (size) => {
    const field = teams(16);
    const panel = judges(8 * size).map((judge) => ({
      ...judge,
      conflicts: ["t0000", "t0001"],
    }));

    const result = pair(field, panel, size);

    for (const debate of result.debates) {
      const involved = [debate.proposition_team_id, debate.opposition_team_id];

      if (involved.includes("t0000") || involved.includes("t0001")) {
        expect(debate.judges).toHaveLength(0);
      }
    }
  });

  test("a panel is filled short rather than seating a conflicted judge", () => {
    const field = teams(4);
    const panel = [
      ...judges(2).map((judge) => ({ ...judge, school_id: "school0" })),
      ...judges(2).map((judge, i) => ({ ...judge, judge_id: `clean${i}`, school_id: "neutral" })),
    ];

    const result = pair(field, panel, 3);
    const byId = new Map(field.map((team) => [team.team_id, team]));

    for (const debate of result.debates) {
      const schools = [debate.proposition_team_id, debate.opposition_team_id]
        .filter(Boolean)
        .map((id) => byId.get(id as string)!.school_id);

      for (const judgeId of debate.judges) {
        const judge = panel.find((entry) => entry.judge_id === judgeId)!;
        expect(schools).not.toContain(judge.school_id);
      }
    }
  });
});

describe("workload across a panel", () => {
  test.each([3, 5, 7])("a panel of %i spreads work evenly over five rounds", (size) => {
    let field = teams(32);
    const panel = judges(16 * size);
    const counts = new Map<string, number>();

    for (let round = 1; round <= 5; round += 1) {
      const result = pair(field, panel, size, round);

      for (const debate of result.debates) {
        for (const judgeId of debate.judges) {
          counts.set(judgeId, (counts.get(judgeId) ?? 0) + 1);
        }
      }

      field = field.map((team) => ({ ...team }));
    }

    const seen = [...counts.values()];
    const spread = Math.max(...seen) - Math.min(...seen);

    expect(spread).toBeLessThanOrEqual(2);
  });

  test.each([3, 5])("a panel of %i under scarcity still shares the load", (size) => {
    // Exactly enough judges for the panels, so every judge must be used.
    const result = pair(teams(16), judges(8 * size), size);
    const seated = result.debates.flatMap((debate) => debate.judges);

    expect(new Set(seated).size).toBe(8 * size);
  });
});

describe("determinism with panels", () => {
  test.each(PANEL_SIZES)("a panel of %i is reproduced exactly", (size) => {
    const field = teams(24);
    const panel = judges(12 * size);

    const a = pair(field, panel, size, 3);
    const b = pair(field, panel, size, 3);

    expect(JSON.stringify(a.debates)).toBe(JSON.stringify(b.debates));
  });

  test.each(PANEL_SIZES)("judge order does not change a panel of %i", (size) => {
    const field = teams(24);
    const panel = judges(12 * size);

    const forwards = pair(field, panel, size, 3);
    const backwards = pair(field, [...panel].reverse(), size, 3);

    expect(JSON.stringify(forwards.debates)).toBe(JSON.stringify(backwards.debates));
  });
});

describe("panels at tournament scale", () => {
  test.each([3, 5, 7])("166 teams with a panel of %i seats every room", (size) => {
    const field = teams(166);
    const result = pair(field, judges(83 * size), size);

    const contested = result.debates.filter((debate) => !debate.is_bye);

    expect(contested).toHaveLength(83);
    expect(contested.every((debate) => debate.judges.length === size)).toBe(true);
  });

  test("a panel of 10 at 166 teams stays fast", () => {
    const start = Date.now();
    pair(teams(166), judges(830), 10);

    expect(Date.now() - start).toBeLessThan(2000);
  });
});
