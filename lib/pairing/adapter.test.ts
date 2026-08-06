import { describe, expect, test } from "vitest";
import {
  generateScreenPairings,
  seedFor,
  toPairingTeam,
  validatePairing,
  type ScreenJudge,
  type ScreenTeam,
} from "./adapter";

function teams(count: number): ScreenTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `t${i}`,
    name: `Team ${i}`,
    school_id: `school${i}`,
  }));
}

function judges(count: number): ScreenJudge[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `j${i}`,
    name: `Judge ${i}`,
    school_id: `jschool${i}`,
  }));
}

describe("mapping the screen's records", () => {
  test("a team missing every optional field still maps", () => {
    const mapped = toPairingTeam({ _id: "t1", name: "Team 1" });

    expect(mapped).toEqual({
      team_id: "t1",
      name: "Team 1",
      school_id: undefined,
      wins: 0,
      total_points: 0,
      opponents_faced: [],
      prior_opponents: [],
      side_history: [],
      bye_rounds: [],
    });
  });

  test("cross-tournament opponents become prior opponents", () => {
    const mapped = toPairingTeam({
      _id: "t1", name: "Team 1", cross_tournament_opponents: ["t9"],
    });

    expect(mapped.prior_opponents).toEqual(["t9"]);
  });
});

describe("generating a draw for the screen", () => {
  test("every team is placed", () => {
    const result = generateScreenPairings(teams(16), judges(8), {
      round_number: 1, stage: "prelim", judges_per_debate: 1,
    });

    const placed = result.pairings.flatMap((p) =>
      [p.proposition_team_id, p.opposition_team_id].filter(Boolean)
    );

    expect(result.unpaired).toEqual([]);
    expect(new Set(placed).size).toBe(16);
  });

  test("an odd field marks exactly one bye round", () => {
    const result = generateScreenPairings(teams(9), judges(5), {
      round_number: 1, stage: "prelim", judges_per_debate: 1,
    });

    expect(result.pairings.filter((p) => p.is_bye_round)).toHaveLength(1);
  });

  test("room names are used when supplied", () => {
    const result = generateScreenPairings(teams(4), judges(2), {
      round_number: 1, stage: "prelim", judges_per_debate: 1,
      rooms: ["Hall A", "Hall B"],
    });

    expect(result.pairings.map((p) => p.room_name)).toEqual(["Hall A", "Hall B"]);
  });

  test("a clean pairing scores high and a repeat scores low", () => {
    const met: ScreenTeam[] = [
      { _id: "t0", name: "A", school_id: "s0", opponents_faced: ["t1"] },
      { _id: "t1", name: "B", school_id: "s1", opponents_faced: ["t0"] },
    ];

    const repeat = generateScreenPairings(met, judges(1), {
      round_number: 2, stage: "prelim", judges_per_debate: 1,
    });

    const clean = generateScreenPairings(teams(2), judges(1), {
      round_number: 2, stage: "prelim", judges_per_debate: 1,
    });

    expect(clean.pairings[0].quality_score).toBeGreaterThan(
      repeat.pairings[0].quality_score
    );
  });

  test("the seed matches what the server derives", () => {
    // The server uses round * 7919 + team count; a device that computes a
    // different seed would produce a draw the server refuses to verify.
    expect(seedFor(3, 16)).toBe(3 * 7919 + 16);
  });

  test("the same inputs give the same draw", () => {
    const options = { round_number: 2, stage: "prelim" as const, judges_per_debate: 1 };

    const a = generateScreenPairings(teams(16), judges(8), options);
    const b = generateScreenPairings(teams(16), judges(8), options);

    expect(JSON.stringify(a.pairings)).toBe(JSON.stringify(b.pairings));
  });
});

describe("validating a manual edit", () => {
  const met: ScreenTeam[] = [
    { _id: "t0", name: "A", school_id: "s0", opponents_faced: ["t1"] },
    { _id: "t1", name: "B", school_id: "s1", opponents_faced: ["t0"] },
  ];

  const types = (conflicts: ReturnType<typeof validatePairing>) =>
    conflicts.map((conflict) => conflict.type);

  test("a team drawn against itself is rejected", () => {
    const conflicts = validatePairing(teams(4), judges(2), "t0", "t0", []);

    expect(types(conflicts)).toContain("same team");
    expect(conflicts[0].severity).toBe("error");
  });

  test("a repeat opponent is an error", () => {
    const conflicts = validatePairing(met, [], "t0", "t1", []);

    expect(types(conflicts)).toContain("repeat opponent");
    expect(conflicts.find((c) => c.type === "repeat opponent")!.severity).toBe("error");
  });

  test("two teams from one school are an error", () => {
    const sameSchool: ScreenTeam[] = [
      { _id: "t0", name: "A", school_id: "shared" },
      { _id: "t1", name: "B", school_id: "shared" },
    ];

    const conflicts = validatePairing(sameSchool, [], "t0", "t1", []);

    expect(types(conflicts)).toContain("same school");
    expect(conflicts.find((c) => c.type === "same school")!.severity).toBe("error");
  });

  test("a meeting at an earlier tournament is only a warning", () => {
    const prior: ScreenTeam[] = [
      { _id: "t0", name: "A", school_id: "s0", cross_tournament_opponents: ["t1"] },
      { _id: "t1", name: "B", school_id: "s1", cross_tournament_opponents: ["t0"] },
    ];

    const conflicts = validatePairing(prior, [], "t0", "t1", []);

    expect(conflicts.every((c) => c.severity === "warning")).toBe(true);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  test("a judge from a competing school is reported", () => {
    const conflicts = validatePairing(
      teams(2),
      [{ _id: "j0", name: "Judge 0", school_id: "school0" }],
      "t0", "t1", ["j0"]
    );

    expect(conflicts.some((c) => c.description.includes("their own school"))).toBe(true);
  });

  test("a declared conflict is reported", () => {
    const conflicts = validatePairing(
      teams(2),
      [{ _id: "j0", name: "Judge 0", school_id: "other", conflicts: ["t1"] }],
      "t0", "t1", ["j0"]
    );

    expect(conflicts.some((c) => c.description.includes("declared conflict"))).toBe(true);
  });

  test("a clean room reports nothing", () => {
    expect(validatePairing(teams(2), judges(1), "t0", "t1", ["j0"])).toEqual([]);
  });

  test("a bye is not a conflict", () => {
    expect(validatePairing(teams(2), judges(1), "t0", undefined, [])).toEqual([]);
  });

  test("a rematch in elims is not a conflict", () => {
    const conflicts = validatePairing(met, [], "t0", "t1", [], "elim");

    expect(types(conflicts)).not.toContain("repeat opponent");
  });
});
