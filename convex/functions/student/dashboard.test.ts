import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import { createUserWithSession, setupTest } from "../../test_helpers.test-utils";
import { Id } from "../../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

type ReleaseFlags = {
  teams: boolean;
  schools: boolean;
  students: boolean;
  volunteers: boolean;
};

const ALL_RELEASED: ReleaseFlags = {
  teams: true, schools: true, students: true, volunteers: true,
};

const NONE_RELEASED: ReleaseFlags = {
  teams: false, schools: false, students: false, volunteers: false,
};

/**
 * Seeds a finished tournament with one scored debate, so a student has points
 * that a leaderboard could pick up if the release gate were not applied.
 */
async function seedScoredTournament(
  t: T,
  studentId: Id<"users">,
  options: {
    status?: "completed" | "inProgress";
    release?: ReleaseFlags | null;
    submitted?: boolean;
  } = {}
) {
  const now = Date.now();
  const {
    status = "completed",
    release = ALL_RELEASED,
    submitted = true,
  } = options;

  return await t.run(async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Seeded Open",
      slug: `seeded-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 1, elimination_rounds: 0,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status,
      ranking_released: release
        ? {
          prelims: NONE_RELEASED,
          full_tournament: release,
          visible_to_roles: ["student", "school_admin", "volunteer"],
        }
        : undefined,
      created_at: now,
    });

    const teamId = await ctx.db.insert("teams", {
      name: "Team A",
      tournament_id: tournamentId,
      members: [studentId],
      is_confirmed: true,
      payment_status: "paid",
      status: "active",
      created_at: now,
    });

    const roundId = await ctx.db.insert("rounds", {
      tournament_id: tournamentId,
      round_number: 1, type: "preliminary", status: "completed",
      start_time: now, end_time: now, motion: "M", is_impromptu: false,
    });

    const judgeId = await ctx.db.insert("users", {
      name: "Judge", email: `j-${Math.random().toString(36).slice(2)}@t.test`,
      password_hash: "h", password_salt: "s", role: "volunteer",
      status: "active", verified: true, created_at: now,
    });

    const debateId = await ctx.db.insert("debates", {
      round_id: roundId, tournament_id: tournamentId,
      judges: [judgeId], status: "completed",
      is_public_speaking: false, poi_count: 0, created_at: now,
    });

    await ctx.db.insert("judging_scores", {
      debate_id: debateId,
      judge_id: judgeId,
      winning_team_id: teamId,
      winning_position: "proposition",
      speaker_scores: [{
        speaker_id: studentId, team_id: teamId,
        position: "first", speech_type: "substantive",
        style: 28, content: 28, strategy: 14, total: 70,
      }],
      submission_state: submitted ? "submitted" : "in_progress",
      created_at: now,
    });

    return { tournamentId, teamId };
  });
}

async function leaderboard(t: T, token: string) {
  return await t.query(api.functions.student.dashboard.getStudentLeaderboard, { token });
}

describe("student leaderboard release gating", () => {
  test("a released tournament appears", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId);

    const board = await leaderboard(t, token);

    expect(board).toHaveLength(1);
    expect(board[0].totalPoints).toBe(70);
  });

  test("an unreleased tournament contributes nothing", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId, { release: null });

    expect(await leaderboard(t, token)).toHaveLength(0);
  });

  test("a tournament released only for teams does not release speaker points", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId, {
      release: { ...NONE_RELEASED, teams: true },
    });

    expect(await leaderboard(t, token)).toHaveLength(0);
  });

  test("an in-progress tournament contributes nothing even when released", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId, { status: "inProgress" });

    expect(await leaderboard(t, token)).toHaveLength(0);
  });

  test("a draft ballot is never counted", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId, { submitted: false });

    expect(await leaderboard(t, token)).toHaveLength(0);
  });

  test("rank change is never fabricated", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    await seedScoredTournament(t, userId);

    const first = await leaderboard(t, token);
    const second = await leaderboard(t, token);

    expect(first[0].rankChange).toBe(0);
    expect(second[0].rankChange).toBe(first[0].rankChange);
  });

  test("tournaments are counted distinctly, not by team", async () => {
    const t = setupTest();
    const { userId, token } = await createUserWithSession(t, "student");
    const { tournamentId } = await seedScoredTournament(t, userId);

    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        name: "Team B", tournament_id: tournamentId,
        members: [userId], is_confirmed: true,
        payment_status: "paid", status: "active", created_at: Date.now(),
      });
    });

    const board = await leaderboard(t, token);

    expect(board[0].tournamentsCount).toBe(1);
  });
});
