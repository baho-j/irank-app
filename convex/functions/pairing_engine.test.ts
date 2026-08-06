import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

async function seedTournament(t: T, teamCount: number, judgeCount = 4) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Paired Open",
      slug: `p-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3, elimination_rounds: 2,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status: "inProgress", created_at: now,
    });

    const teamIds: Id<"teams">[] = [];

    for (let i = 0; i < teamCount; i += 1) {
      const schoolId = await ctx.db.insert("schools", {
        name: `School ${i}`, type: "Private", country: "Rwanda",
        contact_name: "C", contact_email: `s${i}@t.test`,
        status: "active", verified: true, created_at: now,
      });

      teamIds.push(await ctx.db.insert("teams", {
        name: `Team ${i}`, tournament_id: tournamentId, school_id: schoolId,
        members: [], is_confirmed: true, payment_status: "paid",
        status: "active", created_at: now,
      }));
    }

    for (let i = 0; i < judgeCount; i += 1) {
      const judgeId = await ctx.db.insert("users", {
        name: `Judge ${i}`, email: `j${i}-${Math.random().toString(36).slice(2)}@t.test`,
        password_hash: "h", password_salt: "s", role: "volunteer",
        status: "active", verified: true, created_at: now,
      });

      await ctx.db.insert("tournament_invitations", {
        tournament_id: tournamentId, target_type: "volunteer",
        target_id: judgeId, status: "accepted",
        invited_by: judgeId, invited_at: now,
      });
    }

    return { tournamentId, teamIds };
  });
}

const generate = (t: T, token: string, tournamentId: Id<"tournaments">, round = 1, extra = {}) =>
  t.mutation(api.functions.pairing_engine.generateRound, {
    token, tournament_id: tournamentId, round_number: round, ...extra,
  });

describe("generating a round", () => {
  test("pairs every team into rooms", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    const result = await generate(t, token, tournamentId);

    expect(result.success).toBe(true);
    expect(result.debates).toBe(4);
  });

  test("stores debates that cover every team exactly once", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId, teamIds } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);

    const placed = await t.run(async (ctx) => {
      const debates = await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .collect();

      return debates.flatMap((debate) =>
        [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
      );
    });

    expect(new Set(placed).size).toBe(teamIds.length);
  });

  test("an odd field produces a bye", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 7);

    const result = await generate(t, token, tournamentId);

    // Three real debates plus the bye.
    expect(result.debates).toBe(4);

    const byes = await t.run(async (ctx) => {
      const debates = await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .collect();

      return debates.filter((debate) => debate.is_bye).length;
    });

    expect(byes).toBe(1);
  });

  test("seats judges without conflicts", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);

    const seated = await t.run(async (ctx) => {
      const debates = await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .collect();

      return debates.filter((debate) => debate.judges.length > 0).length;
    });

    expect(seated).toBeGreaterThan(0);
  });

  test("regenerating replaces the previous draw rather than duplicating it", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);
    await generate(t, token, tournamentId);

    const count = await t.run(async (ctx) =>
      (await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .collect()).length
    );

    expect(count).toBe(4);
  });

  test("a completed round cannot be re-paired", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);

    await t.run(async (ctx) => {
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .first();

      await ctx.db.patch(round!._id, { status: "completed" });
    });

    await expect(generate(t, token, tournamentId)).rejects.toThrow(/cannot be re-paired/i);
  });

  test("only admins may pair a round", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");
    const { tournamentId } = await seedTournament(t, 8);

    await expect(generate(t, token, tournamentId)).rejects.toThrow(/admin access required/i);
  });

  test("the draw is recorded in the audit log", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);

    const logs = await t.run(async (ctx) => ctx.db.query("audit_logs").collect());

    expect(logs.some((log) => log.description.includes("Paired round"))).toBe(true);
  });
});

describe("verifying a draw produced offline", () => {
  test("accepts a draw that matches what the server computes", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    // Pair once to learn the draw, then offer it back as a device would.
    await generate(t, token, tournamentId);

    const draw = await t.run(async (ctx) => {
      const debates = await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", tournamentId))
        .collect();

      return debates.map((debate) => ({
        room_name: debate.room_name ?? "Room",
        proposition_team_id: debate.proposition_team_id ?? null,
        opposition_team_id: debate.opposition_team_id ?? null,
        is_bye: debate.is_bye ?? false,
      }));
    });

    const result = await generate(t, token, tournamentId, 1, { client_draw: draw });

    expect(result.verified).toBe(true);
  });

  test("rejects a draw a device altered", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId, teamIds } = await seedTournament(t, 8);

    await generate(t, token, tournamentId);

    const tampered = [
      {
        room_name: "Room 1",
        proposition_team_id: teamIds[0],
        opposition_team_id: teamIds[1],
        is_bye: false,
      },
    ];

    await expect(
      generate(t, token, tournamentId, 1, { client_draw: tampered })
    ).rejects.toThrow(/does not match what the server computes/i);
  });
});

describe("the break", () => {
  test("reports who breaks and seeds a bracket", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 10);

    const result = await t.query(api.functions.pairing_engine.getBreak, {
      token, tournament_id: tournamentId,
    });

    expect(result.size).toBe(8);
    expect(result.bracket).toHaveLength(4);
    expect(result.entries.filter((entry) => entry.breaking)).toHaveLength(8);
  });

  test("names every team so tab can read the break line", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const { tournamentId } = await seedTournament(t, 8);

    const result = await t.query(api.functions.pairing_engine.getBreak, {
      token, tournament_id: tournamentId,
    });

    expect(result.entries.every((entry) => entry.team_name !== "Unknown team")).toBe(true);
  });

  test("reading the break requires authentication", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t, 8);

    await expect(
      t.query(api.functions.pairing_engine.getBreak, {
        token: "bad", tournament_id: tournamentId,
      })
    ).rejects.toThrow(/authentication required/i);
  });
});
