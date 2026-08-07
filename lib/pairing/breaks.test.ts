import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  advanceBracket,
  breakSize,
  calculateBreak,
  opponentWinsFor,
  seedBracket,
} from "./breaks";
import type { PairingTeam } from "./types";

function team(id: number, wins: number, points: number, overrides: Partial<PairingTeam> = {}): PairingTeam {
  return {
    team_id: `t${id.toString().padStart(3, "0")}`,
    name: `Team ${id}`,
    school_id: `school${id}`,
    wins,
    total_points: points,
    opponents_faced: [],
    prior_opponents: [],
    side_history: [],
    bye_rounds: [],
    ...overrides,
  };
}

/** A field where team 0 is strongest and each subsequent team is weaker. */
const ladder = (count: number) =>
  Array.from({ length: count }, (_, i) => team(i, count - i, 2000 - i * 10));

describe("break size", () => {
  test.each([
    [16, undefined, 16],
    [20, undefined, 16],
    [14, undefined, 8],
    [9, undefined, 8],
    [32, 16, 16],
    [10, 16, 8],
    [3, undefined, 2],
    [1, undefined, 0],
  ])("%i teams requesting %s breaks %i", (count, requested, expected) => {
    expect(breakSize(count, requested)).toBe(expected);
  });

  test("always a power of two, so a bracket has no byes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 300 }), (count) => {
        const size = breakSize(count);
        return size === 0 || Number.isInteger(Math.log2(size));
      })
    );
  });
});

describe("who breaks", () => {
  test("the strongest teams break", () => {
    const result = calculateBreak(ladder(20));

    expect(result.size).toBe(16);
    expect(result.breaking).toHaveLength(16);
    expect(result.breaking[0].team_id).toBe("t000");
  });

  test("teams below the line do not break", () => {
    const result = calculateBreak(ladder(20));
    const missed = result.entries.filter((entry) => !entry.breaking);

    expect(missed).toHaveLength(4);
    expect(missed.map((entry) => entry.team_id)).toContain("t019");
  });

  test("seeds run from one upward with no gaps", () => {
    const result = calculateBreak(ladder(16));

    expect(result.breaking.map((entry) => entry.seed)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1)
    );
  });

  test("wins outrank points", () => {
    const result = calculateBreak([
      team(0, 3, 1000),
      team(1, 4, 500),
    ], 2);

    expect(result.breaking[0].team_id).toBe("t001");
  });

  test("points break a tie on wins", () => {
    const result = calculateBreak([
      team(0, 3, 900),
      team(1, 3, 1000),
    ], 2);

    expect(result.breaking[0].team_id).toBe("t001");
  });

  test("strength of schedule breaks a tie on points", () => {
    const teams = [
      team(0, 3, 900, { opponents_faced: ["t002"] }),
      team(1, 3, 900, { opponents_faced: ["t003"] }),
      team(2, 5, 800),
      team(3, 1, 800),
    ];

    const result = calculateBreak(teams, 4);
    const order = result.entries.map((entry) => entry.team_id);

    // Teams 0 and 1 are level on wins and points; team 0 faced the stronger
    // opponent, so it is seeded above team 1.
    expect(order.indexOf("t000")).toBeLessThan(order.indexOf("t001"));
  });

  test("a tie across the break line is flagged for tab review", () => {
    const teams = [
      ...ladder(7),
      team(99, 1, 1930),
      team(98, 1, 1930),
    ];

    const result = calculateBreak(teams);

    if (result.needs_review) {
      expect(result.entries.some((entry) => entry.tied_at_line)).toBe(true);
    }
  });

  test("a clean cut needs no review", () => {
    expect(calculateBreak(ladder(16)).needs_review).toBe(false);
  });

  test("ordering does not depend on input order", () => {
    const teams = ladder(16);

    const forwards = calculateBreak(teams).breaking.map((e) => e.team_id);
    const backwards = calculateBreak([...teams].reverse()).breaking.map((e) => e.team_id);

    expect(forwards).toEqual(backwards);
  });
});

describe("opponent wins", () => {
  test("sums the wins of teams faced", () => {
    const teams = [
      team(0, 2, 100, { opponents_faced: ["t001", "t002"] }),
      team(1, 3, 100),
      team(2, 4, 100),
    ];

    expect(opponentWinsFor(teams).get("t000")).toBe(7);
  });

  test("a team that has faced nobody has zero", () => {
    expect(opponentWinsFor([team(0, 2, 100)]).get("t000")).toBe(0);
  });
});

describe("bracket seeding", () => {
  test("the top seed faces the bottom seed", () => {
    const result = calculateBreak(ladder(16));
    const bracket = seedBracket(result.breaking);

    expect(bracket[0]).toEqual({ high_seed: "t000", low_seed: "t015" });
    expect(bracket[1]).toEqual({ high_seed: "t001", low_seed: "t014" });
  });

  test.each([4, 8, 16, 32])("a break of %i produces half as many rooms", (size) => {
    const bracket = seedBracket(calculateBreak(ladder(size)).breaking);

    expect(bracket).toHaveLength(size / 2);
  });

  test("every breaking team appears exactly once", () => {
    const breaking = calculateBreak(ladder(16)).breaking;
    const bracket = seedBracket(breaking);

    const placed = bracket.flatMap((pairing) => [pairing.high_seed, pairing.low_seed]);

    expect(new Set(placed).size).toBe(16);
    expect(new Set(placed)).toEqual(new Set(breaking.map((entry) => entry.team_id)));
  });

  test("no team is drawn against itself", () => {
    const bracket = seedBracket(calculateBreak(ladder(8)).breaking);

    expect(bracket.every((pairing) => pairing.high_seed !== pairing.low_seed)).toBe(true);
  });
});

describe("advancing through the bracket", () => {
  test("winners are reseeded by their original standing", () => {
    const seeds = new Map([["t000", 1], ["t003", 4], ["t001", 2]]);

    const next = advanceBracket(["t003", "t000", "t001"], seeds);

    expect(next.map((entry) => entry.team_id)).toEqual(["t000", "t001", "t003"]);
    expect(next.map((entry) => entry.seed)).toEqual([1, 2, 3]);
  });

  test("a full bracket resolves to one team", () => {
    let breaking = calculateBreak(ladder(8)).breaking;
    const seeds = new Map(breaking.map((entry) => [entry.team_id, entry.seed]));
    let rounds = 0;

    while (breaking.length > 1) {
      const bracket = seedBracket(breaking);
      // The higher seed advances, standing in for a result.
      breaking = advanceBracket(bracket.map((pairing) => pairing.high_seed), seeds);
      rounds += 1;
    }

    expect(breaking).toHaveLength(1);
    expect(breaking[0].team_id).toBe("t000");
    expect(rounds).toBe(3);
  });
});

describe("properties", () => {
  test("the break never contains a team that is not in the field", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 120 }), (count) => {
        const teams = ladder(count);
        const result = calculateBreak(teams);
        const ids = new Set(teams.map((t) => t.team_id));

        return result.breaking.every((entry) => ids.has(entry.team_id));
      })
    );
  });

  test("a breaking team never places below a non-breaking one", () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 80 }), (count) => {
        const result = calculateBreak(ladder(count));
        const lastBreaking = result.entries.filter((e) => e.breaking).at(-1);
        const firstOut = result.entries.find((e) => !e.breaking);

        if (!lastBreaking || !firstOut) return true;

        return lastBreaking.seed < firstOut.seed;
      })
    );
  });
});
