import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createSchool, createUserWithSession, setupTest } from "../test_helpers";
import { Id } from "../_generated/dataModel";

async function createDebateWithJudge(
  t: ReturnType<typeof setupTest>,
  judgeId: Id<"users">
) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Test Tournament",
      slug: `test-${Math.random().toString(36).slice(2)}`,
      start_date: now,
      end_date: now + 86400000,
      is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3,
      elimination_rounds: 1,
      judges_per_debate: 1,
      team_size: 3,
      speaking_times: { substantive: 480 },
      status: "inProgress",
      created_at: now,
    });

    const roundId = await ctx.db.insert("rounds", {
      tournament_id: tournamentId,
      round_number: 1,
      type: "preliminary",
      status: "inProgress",
      start_time: now,
      end_time: now + 3600000,
      motion: "This house would test its code",
      is_impromptu: false,
    });

    const debateId = await ctx.db.insert("debates", {
      round_id: roundId,
      tournament_id: tournamentId,
      room_name: "Room 1",
      judges: [judgeId],
      head_judge_id: judgeId,
      status: "inProgress",
      is_public_speaking: false,
      poi_count: 0,
      created_at: now,
    });

    return { tournamentId, roundId, debateId };
  });
}

describe("updateRecording authorization", () => {
  test("rejects an unauthenticated call", async () => {
    const t = setupTest();
    const { userId: judgeId } = await createUserWithSession(t, "volunteer");
    const { debateId } = await createDebateWithJudge(t, judgeId);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await expect(
      t.mutation(api.functions.ballots.updateRecording, {
        token: "not-a-real-token",
        debate_id: debateId,
        recording_id: storageId,
        duration: 60,
      })
    ).rejects.toThrow(/authentication required/i);
  });

  test("rejects a judge who is not assigned to the debate", async () => {
    const t = setupTest();
    const { userId: assignedJudge } = await createUserWithSession(t, "volunteer");
    const { token: otherJudgeToken } = await createUserWithSession(t, "volunteer");
    const { debateId } = await createDebateWithJudge(t, assignedJudge);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await expect(
      t.mutation(api.functions.ballots.updateRecording, {
        token: otherJudgeToken,
        debate_id: debateId,
        recording_id: storageId,
        duration: 60,
      })
    ).rejects.toThrow(/assigned judge or an admin/i);
  });

  test("allows the assigned judge and records an audit entry", async () => {
    const t = setupTest();
    const { userId: judgeId, token } = await createUserWithSession(t, "volunteer");
    const { debateId } = await createDebateWithJudge(t, judgeId);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await t.mutation(api.functions.ballots.updateRecording, {
      token,
      debate_id: debateId,
      recording_id: storageId,
      duration: 90,
    });

    const { debate, auditCount } = await t.run(async (ctx) => ({
      debate: await ctx.db.get(debateId),
      auditCount: (await ctx.db.query("audit_logs").collect()).length,
    }));

    expect(debate?.recording).toBe(storageId);
    expect(debate?.recording_duration).toBe(90);
    expect(auditCount).toBe(1);
  });

  test("allows an admin who is not on the panel", async () => {
    const t = setupTest();
    const { userId: judgeId } = await createUserWithSession(t, "volunteer");
    const { token: adminToken } = await createUserWithSession(t, "admin");
    const { debateId } = await createDebateWithJudge(t, judgeId);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await expect(
      t.mutation(api.functions.ballots.updateRecording, {
        token: adminToken,
        debate_id: debateId,
        recording_id: storageId,
        duration: 30,
      })
    ).resolves.toEqual({ success: true });
  });

  test("rejects a missing debate", async () => {
    const t = setupTest();
    const { userId: judgeId, token } = await createUserWithSession(t, "volunteer");
    const { debateId } = await createDebateWithJudge(t, judgeId);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await t.run(async (ctx) => ctx.db.delete(debateId));

    await expect(
      t.mutation(api.functions.ballots.updateRecording, {
        token,
        debate_id: debateId,
        recording_id: storageId,
        duration: 30,
      })
    ).rejects.toThrow(/debate not found/i);
  });
});
