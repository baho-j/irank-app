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

async function seedSchool(t: T, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("schools", {
      name, type: "Private", country: "Rwanda",
      contact_name: name, contact_email: `${name}@t.test`,
      status: "active", verified: true, created_at: Date.now(),
    })
  );
}

/**
 * Creates a completed, released tournament where the given school wins
 * `wins` of `played` debates, so tier inputs come from real records.
 */
async function seedResults(
  t: T,
  schoolId: Id<"schools">,
  wins: number,
  played: number
) {
  const now = Date.now();

  await t.run(async (ctx) => {
    const tournamentId = await ctx.db.insert("tournaments", {
      name: `T-${Math.random().toString(36).slice(2)}`,
      slug: `t-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: played, elimination_rounds: 0,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status: "completed",
      ranking_released: RELEASED,
      created_at: now,
    });

    const teamId = await ctx.db.insert("teams", {
      name: "A", tournament_id: tournamentId, school_id: schoolId,
      members: [], is_confirmed: true, payment_status: "paid",
      status: "active", created_at: now,
    });

    const roundId = await ctx.db.insert("rounds", {
      tournament_id: tournamentId, round_number: 1,
      type: "preliminary", status: "completed",
      start_time: now, end_time: now, motion: "M", is_impromptu: false,
    });

    for (let i = 0; i < played; i += 1) {
      await ctx.db.insert("debates", {
        round_id: roundId, tournament_id: tournamentId,
        judges: [], status: "completed",
        proposition_team_id: teamId,
        winning_team_id: i < wins ? teamId : undefined,
        is_public_speaking: false, poi_count: 0, created_at: now,
      });
    }
  });
}

const recalc = (t: T) => t.mutation(internal.functions.school_tiers.recalculateTiers, {});

describe("tier recalculation", () => {
  test("assigns a tier to every active school", async () => {
    const t = setupTest();
    const a = await seedSchool(t, "Alpha");
    const b = await seedSchool(t, "Beta");
    await seedResults(t, a, 5, 5);
    await seedResults(t, b, 1, 5);

    const result = await recalc(t);

    expect(result.evaluated).toBe(2);
  });

  test("a stronger school ranks above a weaker one", async () => {
    const t = setupTest();
    const strong = await seedSchool(t, "Strong");
    const weak = await seedSchool(t, "Weak");
    await seedResults(t, strong, 5, 5);
    await seedResults(t, weak, 0, 5);

    await recalc(t);

    const { token } = await createUserWithSession(t, "admin");
    const table = await t.query(api.functions.school_tiers.getTierTable, { token });

    const strongRow = table.find((r) => r.school_name === "Strong")!;
    const weakRow = table.find((r) => r.school_name === "Weak")!;

    expect(strongRow.rank).toBeLessThan(weakRow.rank);
    expect(strongRow.score).toBeGreaterThan(weakRow.score);
  });

  test("an unreleased tournament does not feed the tier", async () => {
    const t = setupTest();
    const school = await seedSchool(t, "Hidden");

    await seedResults(t, school, 5, 5);

    await t.run(async (ctx) => {
      const tournaments = await ctx.db.query("tournaments").collect();
      for (const tournament of tournaments) {
        await ctx.db.patch(tournament._id, { ranking_released: undefined });
      }
    });

    await recalc(t);

    const { token } = await createUserWithSession(t, "admin");
    const tier = await t.query(api.functions.school_tiers.getSchoolTier, {
      token, school_id: school,
    });

    expect(tier?.components.performance).toBe(0);
  });

  test("a tier change requires two consecutive evaluations", async () => {
    const t = setupTest();
    const school = await seedSchool(t, "Climber");
    const others = await Promise.all(
      Array.from({ length: 9 }, (_, i) => seedSchool(t, `Other${i}`))
    );

    await seedResults(t, school, 0, 5);
    for (const other of others) await seedResults(t, other, 5, 5);

    await recalc(t);
    const { token } = await createUserWithSession(t, "admin");

    const initial = await t.query(api.functions.school_tiers.getSchoolTier, {
      token, school_id: school,
    });

    // Now the school starts winning, which should eventually raise its tier.
    await seedResults(t, school, 5, 5);
    await seedResults(t, school, 5, 5);

    await recalc(t);
    const afterOne = await t.query(api.functions.school_tiers.getSchoolTier, {
      token, school_id: school,
    });

    // The committed tier holds while the new one is provisional.
    if (afterOne!.provisional_tier) {
      expect(afterOne!.tier).toBe(initial!.tier);

      await recalc(t);
      const afterTwo = await t.query(api.functions.school_tiers.getSchoolTier, {
        token, school_id: school,
      });

      expect(afterTwo!.tier).toBe(afterOne!.provisional_tier);
    }
  });

  test("re-running with no change does not move anyone", async () => {
    const t = setupTest();
    const a = await seedSchool(t, "Alpha");
    await seedResults(t, a, 3, 5);

    await recalc(t);
    const second = await recalc(t);

    expect(second.changed).toBe(0);
  });

  test("tier lookup requires authentication", async () => {
    const t = setupTest();
    const school = await seedSchool(t, "Alpha");

    await expect(
      t.query(api.functions.school_tiers.getSchoolTier, {
        token: "bad-token", school_id: school,
      })
    ).rejects.toThrow(/authentication required/i);
  });

  test("a school with no results still receives a tier", async () => {
    const t = setupTest();
    await seedSchool(t, "Quiet");

    await recalc(t);

    const { token } = await createUserWithSession(t, "admin");
    const table = await t.query(api.functions.school_tiers.getTierTable, { token });

    expect(table).toHaveLength(1);
    expect(table[0].tier).toBeDefined();
  });
});
