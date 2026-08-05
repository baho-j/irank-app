import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

const RELEASED = {
  prelims: { teams: false, schools: false, students: false, volunteers: false },
  full_tournament: { teams: true, schools: true, students: true, volunteers: true },
  visible_to_roles: ["student", "school_admin", "volunteer"],
};

/** Seeds a completed, released tournament awarding `points` to one speaker. */
async function seedPoints(
  t: T,
  studentId: Id<"users">,
  points: number,
  options: { released?: boolean; submitted?: boolean } = {}
) {
  const { released = true, submitted = true } = options;
  const now = Date.now();

  await t.run(async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "T", slug: `t-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools", prelim_rounds: 1, elimination_rounds: 0,
      judges_per_debate: 1, team_size: 3, speaking_times: {},
      status: "completed",
      ranking_released: released ? RELEASED : undefined,
      created_at: now,
    });

    const teamId = await ctx.db.insert("teams", {
      name: "A", tournament_id: tournamentId, members: [studentId],
      is_confirmed: true, payment_status: "paid", status: "active", created_at: now,
    });

    const roundId = await ctx.db.insert("rounds", {
      tournament_id: tournamentId, round_number: 1, type: "preliminary",
      status: "completed", start_time: now, end_time: now, motion: "M", is_impromptu: false,
    });

    const debateId = await ctx.db.insert("debates", {
      round_id: roundId, tournament_id: tournamentId, judges: [],
      status: "completed", is_public_speaking: false, poi_count: 0, created_at: now,
    });

    await ctx.db.insert("judging_scores", {
      debate_id: debateId,
      tournament_id: tournamentId,
      judge_id: studentId,
      winning_team_id: teamId,
      winning_position: "proposition",
      speaker_scores: [{
        speaker_id: studentId, team_id: teamId, position: "first",
        speech_type: "substantive", style: 28, content: 28, strategy: 14, total: points,
      }],
      submission_state: submitted ? "submitted" : "in_progress",
      created_at: now,
    });
  });
}

const rebuild = (t: T) =>
  t.mutation(internal.functions.ranking_snapshots.rebuildSnapshots, {});

const board = (t: T, token: string) =>
  t.query(api.functions.ranking_snapshots.getLeaderboard, { token, scope: "student" });

describe("ranking snapshots", () => {
  test("ranks students by total points", async () => {
    const t = setupTest();
    const { userId: high } = await createUserWithSession(t, "student");
    const { userId: low } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, high, 78);
    await seedPoints(t, low, 62);

    await rebuild(t);
    const rows = await board(t, token);

    expect(rows[0].entity_id).toBe(high);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].entity_id).toBe(low);
  });

  test("rank change is zero on the first computation", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70);
    await rebuild(t);

    expect((await board(t, token))[0].rankChange).toBe(0);
  });

  test("a student who climbs reports a positive change", async () => {
    const t = setupTest();
    const { userId: climber } = await createUserWithSession(t, "student");
    const { userId: leader } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, leader, 80);
    await seedPoints(t, climber, 60);
    await rebuild(t);

    const before = await board(t, token);
    expect(before.find((r) => r.entity_id === climber)!.rank).toBe(2);

    // The climber overtakes on a second tournament.
    await seedPoints(t, climber, 80);
    await rebuild(t);

    const after = await board(t, token);
    const climberRow = after.find((r) => r.entity_id === climber)!;

    expect(climberRow.rank).toBe(1);
    expect(climberRow.rankChange).toBe(1);
  });

  test("a student who slips reports a negative change", async () => {
    const t = setupTest();
    const { userId: slipping } = await createUserWithSession(t, "student");
    const { userId: rising } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, slipping, 75);
    await seedPoints(t, rising, 60);
    await rebuild(t);

    await seedPoints(t, rising, 80);
    await rebuild(t);

    const rows = await board(t, token);

    expect(rows.find((r) => r.entity_id === slipping)!.rankChange).toBe(-1);
  });

  test("rank change is never fabricated between identical runs", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70);
    await rebuild(t);
    await rebuild(t);

    expect((await board(t, token))[0].rankChange).toBe(0);
  });

  test("an unreleased tournament contributes nothing", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70, { released: false });
    await rebuild(t);

    expect(await board(t, token)).toHaveLength(0);
  });

  test("a draft ballot contributes nothing", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70, { submitted: false });
    await rebuild(t);

    expect(await board(t, token)).toHaveLength(0);
  });

  test("points accumulate across tournaments and count each once", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70);
    await seedPoints(t, userId, 74);
    await rebuild(t);

    const row = (await board(t, token))[0];

    expect(row.totalPoints).toBe(144);
    expect(row.avgPoints).toBe(72);
    expect(row.tournamentsCount).toBe(2);
  });

  test("an entity that stops placing is removed rather than left stale", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 70);
    await rebuild(t);
    expect(await board(t, token)).toHaveLength(1);

    await t.run(async (ctx) => {
      for (const tournament of await ctx.db.query("tournaments").collect()) {
        await ctx.db.patch(tournament._id, { ranking_released: undefined });
      }
    });
    await rebuild(t);

    expect(await board(t, token)).toHaveLength(0);
  });

  test("my rank reports position and total field size", async () => {
    const t = setupTest();
    const { userId } = await createUserWithSession(t, "student");
    const { userId: other } = await createUserWithSession(t, "student");
    const { token } = await createUserWithSession(t, "admin");

    await seedPoints(t, userId, 80);
    await seedPoints(t, other, 60);
    await rebuild(t);

    const mine = await t.query(api.functions.ranking_snapshots.getMyRank, {
      token, scope: "student", entity_id: userId,
    });

    expect(mine.rank).toBe(1);
    expect(mine.totalEntities).toBe(2);
  });

  test("leaderboard requires authentication", async () => {
    const t = setupTest();

    await expect(
      t.query(api.functions.ranking_snapshots.getLeaderboard, {
        token: "bad", scope: "student",
      })
    ).rejects.toThrow(/authentication required/i);
  });
});
