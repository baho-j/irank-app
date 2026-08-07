import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

/** A tournament with a five-student squad fielding three speakers. */
async function seedSquad(
  t: T,
  leagueType: "Local" | "International" | "Dreams Mode",
  squadSize = 5
) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const leagueId = await ctx.db.insert("leagues", {
      name: "L", type: leagueType, status: "active", created_at: now,
    });

    const tournamentId = await ctx.db.insert("tournaments", {
      name: "T", slug: `t-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      league_id: leagueId, format: "WorldSchools",
      prelim_rounds: 3, elimination_rounds: 1,
      judges_per_debate: 1, team_size: 3, speaking_times: {},
      status: "inProgress", created_at: now,
    });

    const members: Id<"users">[] = [];

    for (let i = 0; i < squadSize; i += 1) {
      members.push(await ctx.db.insert("users", {
        name: `Speaker ${i}`, email: `s${i}-${Math.random().toString(36).slice(2)}@t.test`,
        password_hash: "h", password_salt: "s", role: "student",
        status: "active", verified: true, created_at: now,
      }));
    }

    const teamId = await ctx.db.insert("teams", {
      name: "Squad", tournament_id: tournamentId, members,
      is_confirmed: true, payment_status: "paid", status: "active", created_at: now,
    });

    const oppId = await ctx.db.insert("teams", {
      name: "Opp", tournament_id: tournamentId, members: [],
      is_confirmed: true, payment_status: "paid", status: "active", created_at: now,
    });

    const roundId = await ctx.db.insert("rounds", {
      tournament_id: tournamentId, round_number: 1, type: "preliminary",
      status: "inProgress", start_time: now, end_time: now,
      motion: "M", is_impromptu: false,
    });

    const debateId = await ctx.db.insert("debates", {
      round_id: roundId, tournament_id: tournamentId, judges: [],
      proposition_team_id: teamId, opposition_team_id: oppId,
      status: "inProgress", is_public_speaking: false, poi_count: 0, created_at: now,
    });

    return { tournamentId, teamId, oppId, debateId, members };
  });
}

const lineupOf = (members: Id<"users">[], indices: number[]) =>
  indices.map((memberIndex, position) => ({
    speaker_id: members[memberIndex],
    position: (["first", "second", "third"] as const)[position],
  }));

describe("setting a lineup", () => {
  test("an international tournament accepts a lineup", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: lineupOf(members, [0, 1, 2]),
      })
    ).resolves.toEqual({ success: true });
  });

  test("a local tournament refuses rotation", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "Local");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: lineupOf(members, [0, 1, 2]),
      })
    ).rejects.toThrow(/international competitions/i);
  });

  test("the lineup must field exactly team_size speakers", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: lineupOf(members, [0, 1]),
      })
    ).rejects.toThrow(/3 speakers per team/i);
  });

  test("a position may not be assigned twice", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: [
          { speaker_id: members[0], position: "first" as const },
          { speaker_id: members[1], position: "first" as const },
          { speaker_id: members[2], position: "third" as const },
        ],
      })
    ).rejects.toThrow(/position may only be assigned once/i);
  });

  test("a speaker may not appear twice", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: [
          { speaker_id: members[0], position: "first" as const },
          { speaker_id: members[0], position: "second" as const },
          { speaker_id: members[1], position: "third" as const },
        ],
      })
    ).rejects.toThrow(/only appear once/i);
  });

  test("a speaker must belong to the team", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");
    const { userId: outsider } = await createUserWithSession(t, "student");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: [
          { speaker_id: outsider, position: "first" as const },
          { speaker_id: members[1], position: "second" as const },
          { speaker_id: members[2], position: "third" as const },
        ],
      })
    ).rejects.toThrow(/registered member/i);
  });

  test("a team not in the room is refused", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, members, tournamentId } = await seedSquad(t, "International");

    const strangerTeam = await t.run(async (ctx) =>
      ctx.db.insert("teams", {
        name: "Elsewhere", tournament_id: tournamentId, members,
        is_confirmed: true, payment_status: "paid", status: "active", created_at: Date.now(),
      })
    );

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: strangerTeam,
        speakers: lineupOf(members, [0, 1, 2]),
      })
    ).rejects.toThrow(/not debating in this room/i);
  });

  test("the lineup locks once a ballot is submitted", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members, tournamentId } = await seedSquad(t, "International");

    await t.run(async (ctx) => {
      await ctx.db.insert("judging_scores", {
        debate_id: debateId, tournament_id: tournamentId,
        judge_id: members[0], speaker_scores: [],
        submission_state: "submitted", created_at: Date.now(),
      });
    });

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: lineupOf(members, [0, 1, 2]),
      })
    ).rejects.toThrow(/lineup is locked/i);
  });

  test("only admins may set a lineup", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await expect(
      t.mutation(api.functions.team_lineups.setLineup, {
        token, debate_id: debateId, team_id: teamId,
        speakers: lineupOf(members, [0, 1, 2]),
      })
    ).rejects.toThrow(/admin access required/i);
  });
});

describe("reading lineups", () => {
  test("the ballot sees the chosen three, not the whole squad", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await t.mutation(api.functions.team_lineups.setLineup, {
      token, debate_id: debateId, team_id: teamId,
      speakers: lineupOf(members, [0, 2, 4]),
    });

    const result = await t.query(api.functions.team_lineups.getDebateLineups, {
      token, debate_id: debateId,
    });

    expect(result.proposition!.squad_size).toBe(5);
    expect(result.proposition!.speakers).toHaveLength(3);
    expect(result.proposition!.speakers.map((s) => s.speaker_id)).toEqual([
      members[0], members[2], members[4],
    ]);
    expect(result.proposition!.is_explicit_lineup).toBe(true);
  });

  test("rotation between rounds swaps who is scored", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, teamId, members } = await seedSquad(t, "International");

    await t.mutation(api.functions.team_lineups.setLineup, {
      token, debate_id: debateId, team_id: teamId,
      speakers: lineupOf(members, [0, 1, 2]),
    });

    await t.mutation(api.functions.team_lineups.setLineup, {
      token, debate_id: debateId, team_id: teamId,
      speakers: lineupOf(members, [0, 3, 4]),
    });

    const result = await t.query(api.functions.team_lineups.getDebateLineups, {
      token, debate_id: debateId,
    });

    expect(result.proposition!.speakers.map((s) => s.speaker_id)).toEqual([
      members[0], members[3], members[4],
    ]);
  });

  test("without a lineup the roster is used, preserving existing behaviour", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { debateId, members } = await seedSquad(t, "Local", 3);

    const result = await t.query(api.functions.team_lineups.getDebateLineups, {
      token, debate_id: debateId,
    });

    expect(result.proposition!.is_explicit_lineup).toBe(false);
    expect(result.proposition!.speakers.map((s) => s.speaker_id)).toEqual(members);
  });

  test("rotation availability is reported per tournament", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");

    const international = await seedSquad(t, "International");
    const local = await seedSquad(t, "Local");

    const a = await t.query(api.functions.team_lineups.getDebateLineups, {
      token, debate_id: international.debateId,
    });
    const b = await t.query(api.functions.team_lineups.getDebateLineups, {
      token, debate_id: local.debateId,
    });

    expect(a.rotation_allowed).toBe(true);
    expect(b.rotation_allowed).toBe(false);
  });

  test("reading a lineup requires authentication", async () => {
    const t = setupTest();
    const { debateId } = await seedSquad(t, "International");

    await expect(
      t.query(api.functions.team_lineups.getDebateLineups, {
        token: "bad", debate_id: debateId,
      })
    ).rejects.toThrow(/authentication required/i);
  });
});
