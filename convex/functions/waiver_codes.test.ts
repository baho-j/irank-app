import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

async function seedTournament(t: T) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    return await ctx.db.insert("tournaments", {
      name: "Waivered Open",
      slug: `w-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3, elimination_rounds: 1,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status: "published", created_at: now,
      fee: 10000,
    });
  });
}

async function issueCode(
  t: T,
  token: string,
  tournamentId: Id<"tournaments">,
  usageLimit: number,
  expiresAt?: number
) {
  const result = await t.mutation(api.functions.admin.teams.generateWaiverCode, {
    admin_token: token,
    tournament_id: tournamentId,
    usage_limit: usageLimit,
    expires_at: expiresAt,
  });

  return result.waiver_code as string;
}

const validate = (t: T, tournamentId: Id<"tournaments">, code: string) =>
  t.mutation(internal.functions.admin.teams.validateWaiverCode, {
    tournament_id: tournamentId,
    waiver_code: code,
  });

const use = (t: T, tournamentId: Id<"tournaments">, code: string) =>
  t.mutation(internal.functions.admin.teams.useWaiverCode, {
    tournament_id: tournamentId,
    waiver_code: code,
  });

describe("issuing a waiver code", () => {
  test("only an admin may issue one", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "school_admin");
    const tournamentId = await seedTournament(t);

    await expect(
      t.mutation(api.functions.admin.teams.generateWaiverCode, {
        admin_token: token, tournament_id: tournamentId, usage_limit: 1,
      })
    ).rejects.toThrow(/admin access required/i);
  });

  test("a fresh code validates", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const code = await issueCode(t, token, tournamentId, 3);

    expect(await validate(t, tournamentId, code)).toMatchObject({ valid: true });
  });

  test("two codes never collide", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const codes = await Promise.all([
      issueCode(t, token, tournamentId, 1),
      issueCode(t, token, tournamentId, 1),
      issueCode(t, token, tournamentId, 1),
    ]);

    expect(new Set(codes).size).toBe(3);
  });
});

describe("using a waiver code", () => {
  test("an unknown code is refused", async () => {
    const t = setupTest();
    const tournamentId = await seedTournament(t);

    expect(await validate(t, tournamentId, "WAIVER-NOPE")).toMatchObject({ valid: false });
  });

  test("usage is counted", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 2);

    await use(t, tournamentId, code);

    const tournament = await t.run(async (ctx) => ctx.db.get(tournamentId));
    const record = tournament!.waiver_codes!.find((entry) => entry.code === code);

    expect(record!.usage_count).toBe(1);
  });

  test("the usage limit is enforced", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 2);

    await use(t, tournamentId, code);
    await use(t, tournamentId, code);

    await expect(use(t, tournamentId, code)).rejects.toThrow(/usage limit/i);
  });

  test("a code at its limit no longer validates", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 1);

    await use(t, tournamentId, code);

    expect(await validate(t, tournamentId, code)).toMatchObject({ valid: false });
  });

  test("concurrent redemptions cannot exceed the limit", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 3);

    // Five schools racing for three seats: the limit must still hold.
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => use(t, tournamentId, code))
    );

    const granted = attempts.filter((attempt) => attempt.status === "fulfilled").length;

    expect(granted).toBe(3);

    const tournament = await t.run(async (ctx) => ctx.db.get(tournamentId));
    const record = tournament!.waiver_codes!.find((entry) => entry.code === code);

    expect(record!.usage_count).toBe(3);
  });

  test("an expired code is refused", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 5, Date.now() - 1000);

    expect(await validate(t, tournamentId, code)).toMatchObject({ valid: false });
    await expect(use(t, tournamentId, code)).rejects.toThrow(/expired/i);
  });

  test("a deactivated code is refused", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);
    const code = await issueCode(t, token, tournamentId, 5);

    await t.run(async (ctx) => {
      const tournament = await ctx.db.get(tournamentId);
      await ctx.db.patch(tournamentId, {
        waiver_codes: tournament!.waiver_codes!.map((entry) =>
          entry.code === code ? { ...entry, is_active: false } : entry
        ),
      });
    });

    expect(await validate(t, tournamentId, code)).toMatchObject({ valid: false });
    await expect(use(t, tournamentId, code)).rejects.toThrow(/deactivated/i);
  });

  test("a code from one tournament does not work at another", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const first = await seedTournament(t);
    const second = await seedTournament(t);

    const code = await issueCode(t, token, first, 5);

    expect(await validate(t, second, code)).toMatchObject({ valid: false });
  });
});
