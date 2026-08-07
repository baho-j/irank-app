import { describe, expect, test } from "vitest";
import { computeStandings, matchesStored } from "./standings";
import type { Doc, Id } from "../_generated/dataModel";

const teamId = (n: number) => `team${n}` as Id<"teams">;
const roundId = (n: number) => `round${n}` as Id<"rounds">;
const debateId = (n: number) => `debate${n}` as Id<"debates">;

function team(n: number, overrides: Partial<Doc<"teams">> = {}): Doc<"teams"> {
  return {
    _id: teamId(n),
    _creationTime: 0,
    name: `Team ${n}`,
    tournament_id: "t1" as Id<"tournaments">,
    school_id: `school${n}` as Id<"schools">,
    members: [],
    is_confirmed: true,
    payment_status: "paid",
    status: "active",
    created_at: 0,
    ...overrides,
  } as Doc<"teams">;
}

function round(n: number, type: "preliminary" | "elimination"): Doc<"rounds"> {
  return {
    _id: roundId(n),
    _creationTime: 0,
    tournament_id: "t1" as Id<"tournaments">,
    round_number: n,
    type,
    status: "completed",
    start_time: 0,
    end_time: 0,
    motion: "",
    is_impromptu: false,
  } as Doc<"rounds">;
}

function debate(
  n: number,
  roundNumber: number,
  overrides: Partial<Doc<"debates">> = {}
): Doc<"debates"> {
  return {
    _id: debateId(n),
    _creationTime: 0,
    round_id: roundId(roundNumber),
    tournament_id: "t1" as Id<"tournaments">,
    judges: [],
    status: "completed",
    is_public_speaking: false,
    poi_count: 0,
    created_at: 0,
    ...overrides,
  } as Doc<"debates">;
}

describe("preliminary records", () => {
  test("a win is counted for the winner and a loss for the loser", () => {
    const standings = computeStandings(
      [team(1), team(2)],
      [
        debate(1, 1, {
          proposition_team_id: teamId(1),
          opposition_team_id: teamId(2),
          winning_team_id: teamId(1),
          proposition_team_points: 220,
          opposition_team_points: 210,
        }),
      ],
      [round(1, "preliminary")]
    );

    expect(standings[0]).toMatchObject({ prelim_wins: 1, prelim_losses: 0, prelim_points: 220 });
    expect(standings[1]).toMatchObject({ prelim_wins: 0, prelim_losses: 1, prelim_points: 210 });
  });

  test("an undecided debate counts for neither team", () => {
    const standings = computeStandings(
      [team(1), team(2)],
      [debate(1, 1, { proposition_team_id: teamId(1), opposition_team_id: teamId(2) })],
      [round(1, "preliminary")]
    );

    expect(standings[0]).toMatchObject({ prelim_wins: 0, prelim_losses: 0 });
    expect(standings[1]).toMatchObject({ prelim_wins: 0, prelim_losses: 0 });
  });

  test("a bye is a win with no opponent recorded", () => {
    const standings = computeStandings(
      [team(1)],
      [debate(1, 1, { proposition_team_id: teamId(1), is_bye: true, proposition_team_points: 210 })],
      [round(1, "preliminary")]
    );

    expect(standings[0].prelim_wins).toBe(1);
    expect(standings[0].prelim_points).toBe(210);
    expect(standings[0].opponents_faced).toEqual([]);
  });

  test("records accumulate across rounds", () => {
    const standings = computeStandings(
      [team(1), team(2), team(3)],
      [
        debate(1, 1, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2),
          winning_team_id: teamId(1), proposition_team_points: 220, opposition_team_points: 210,
        }),
        debate(2, 2, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(3),
          winning_team_id: teamId(3), proposition_team_points: 215, opposition_team_points: 225,
        }),
      ],
      [round(1, "preliminary"), round(2, "preliminary")]
    );

    expect(standings[0]).toMatchObject({
      prelim_wins: 1, prelim_losses: 1, prelim_points: 435,
    });
    expect(standings[0].opponents_faced).toHaveLength(2);
  });
});

describe("elimination records", () => {
  test("a loss marks the round the team went out in", () => {
    const standings = computeStandings(
      [team(1), team(2)],
      [
        debate(1, 6, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2),
          winning_team_id: teamId(1),
        }),
      ],
      [round(6, "elimination")]
    );

    expect(standings[0].eliminated_in_round).toBeUndefined();
    expect(standings[1].eliminated_in_round).toBe(6);
    expect(standings[1].elimination_losses).toBe(1);
  });

  test("elimination results do not touch the preliminary record", () => {
    const standings = computeStandings(
      [team(1), team(2)],
      [
        debate(1, 6, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2),
          winning_team_id: teamId(1),
          proposition_team_points: 230, opposition_team_points: 220,
        }),
      ],
      [round(6, "elimination")]
    );

    expect(standings[0]).toMatchObject({
      prelim_wins: 0, prelim_points: 0, elimination_wins: 1, elimination_points: 230,
    });
  });

  test("a team that wins through keeps advancing", () => {
    const standings = computeStandings(
      [team(1)],
      [
        debate(1, 6, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2), winning_team_id: teamId(1),
        }),
        debate(2, 7, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(3), winning_team_id: teamId(1),
        }),
      ],
      [round(6, "elimination"), round(7, "elimination")]
    );

    expect(standings[0].elimination_wins).toBe(2);
    expect(standings[0].eliminated_in_round).toBeUndefined();
  });

  test("a debate in a round that no longer exists is skipped", () => {
    const standings = computeStandings(
      [team(1)],
      [debate(1, 99, { proposition_team_id: teamId(1), winning_team_id: teamId(1) })],
      [round(1, "preliminary")]
    );

    expect(standings[0].prelim_wins).toBe(0);
  });
});

describe("opponents faced", () => {
  test("each meeting records the opponent, result, and round type", () => {
    const standings = computeStandings(
      [team(1)],
      [
        debate(1, 1, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2), winning_team_id: teamId(2),
        }),
      ],
      [round(1, "preliminary")]
    );

    expect(standings[0].opponents_faced[0]).toEqual({
      opponent_team_id: teamId(2),
      debate_id: debateId(1),
      won: false,
      round_number: 1,
      round_type: "preliminary",
    });
  });

  test("an elimination meeting is typed as elimination", () => {
    const standings = computeStandings(
      [team(1)],
      [
        debate(1, 6, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2), winning_team_id: teamId(1),
        }),
      ],
      [round(6, "elimination")]
    );

    expect(standings[0].opponents_faced[0].round_type).toBe("elimination");
  });
});

describe("skipping unchanged writes", () => {
  test("an unchanged record needs no write", () => {
    const stored = team(1, {
      prelim_wins: 1, prelim_losses: 0, prelim_points: 220,
      elimination_wins: 0, elimination_losses: 0, elimination_points: 0,
      opponents_faced: [
        {
          opponent_team_id: teamId(2), debate_id: debateId(1),
          won: true, round_number: 1, round_type: "preliminary",
        },
      ],
    });

    const [standing] = computeStandings(
      [stored],
      [
        debate(1, 1, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2),
          winning_team_id: teamId(1), proposition_team_points: 220,
        }),
      ],
      [round(1, "preliminary")]
    );

    expect(matchesStored(stored, standing)).toBe(true);
  });

  test("a changed record needs a write", () => {
    const stored = team(1, { prelim_wins: 0 });

    const [standing] = computeStandings(
      [stored],
      [
        debate(1, 1, {
          proposition_team_id: teamId(1), opposition_team_id: teamId(2),
          winning_team_id: teamId(1),
        }),
      ],
      [round(1, "preliminary")]
    );

    expect(matchesStored(stored, standing)).toBe(false);
  });

  test("a team with no debates matches an empty stored record", () => {
    const stored = team(1);
    const [standing] = computeStandings([stored], [], []);

    expect(matchesStored(stored, standing)).toBe(true);
  });
});
