import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";

type T = ReturnType<typeof setupTest>;

const DAY = 24 * 60 * 60 * 1000;

async function seedSchool(t: T, createdAt: number) {
  return await t.run(async (ctx) =>
    ctx.db.insert("schools", {
      name: `School ${Math.random().toString(36).slice(2, 7)}`,
      type: "Private",
      country: "Rwanda",
      contact_name: "C",
      contact_email: `${Math.random().toString(36).slice(2)}@t.test`,
      status: "active",
      verified: true,
      created_at: createdAt,
    })
  );
}

async function seedTournament(t: T, createdAt: number, status = "published") {
  return await t.run(async (ctx) =>
    ctx.db.insert("tournaments", {
      name: "T",
      slug: `t-${Math.random().toString(36).slice(2)}`,
      start_date: createdAt,
      end_date: createdAt + DAY,
      is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3,
      elimination_rounds: 1,
      judges_per_debate: 1,
      team_size: 3,
      speaking_times: {},
      status: status as any,
      created_at: createdAt,
    })
  );
}

const overview = (t: T, token: string, range?: { start: number; end: number }) =>
  t.query(api.functions.admin.analytics.getDashboardOverview, {
    token,
    date_range: range,
  });

/**
 * The dashboard counts now come from the aggregate rather than from loading
 * every row.
 *
 * Rows here are seeded with the raw database, which is what a direct edit in
 * the Convex dashboard does — it bypasses the triggers. Each test therefore
 * backfills before asserting, which is the documented recovery procedure and
 * is worth exercising rather than assuming.
 */
const backfill = (t: T) =>
  t.mutation(internal.functions.aggregate_backfill.backfillAll, {});
describe("dashboard counts", () => {
  test("an empty deployment reports zeroes rather than failing", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");

    const result = await overview(t, token);

    expect(result.total_schools).toBe(0);
    expect(result.total_tournaments).toBe(0);
  });

  test("totals count every row", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    await seedSchool(t, now);
    await seedSchool(t, now);
    await seedTournament(t, now);

    await backfill(t);
    const result = await overview(t, token);

    expect(result.total_schools).toBe(2);
    expect(result.total_tournaments).toBe(1);
  });

  test("the admin who ran the query is counted as a user", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");

    await backfill(t);

    expect((await overview(t, token)).total_users).toBe(1);
  });

  test("active tournaments count only published and in-progress", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    await seedTournament(t, now, "published");
    await seedTournament(t, now, "inProgress");
    await seedTournament(t, now, "completed");
    await seedTournament(t, now, "draft");

    await backfill(t);
    const result = await overview(t, token);

    expect(result.total_tournaments).toBe(4);
    expect(result.active_tournaments).toBe(2);
  });
});

describe("growth over a window", () => {
  test("only rows inside the window count towards it", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    // Two in the current window, one well before it.
    await seedSchool(t, now - DAY);
    await seedSchool(t, now - 2 * DAY);
    await seedSchool(t, now - 60 * DAY);

    await backfill(t);
    const result = await overview(t, token, { start: now - 7 * DAY, end: now });

    // Three schools exist; growth is measured on the two recent ones against a
    // previous window that has none.
    expect(result.total_schools).toBe(3);
    expect(result.growth_metrics.schools).toBe(100);
  });

  test("growth compares like windows", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    // Two in the previous 10-day window, four in the current one.
    for (const offset of [12, 15]) await seedSchool(t, now - offset * DAY);
    for (const offset of [1, 3, 5, 7]) await seedSchool(t, now - offset * DAY);

    await backfill(t);
    const result = await overview(t, token, { start: now - 10 * DAY, end: now });

    // Four against two is 100% growth.
    expect(result.growth_metrics.schools).toBe(100);
  });

  test("a window with nothing before it reports full growth", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    await seedTournament(t, now - DAY);
    await backfill(t);

    const result = await overview(t, token, { start: now - 7 * DAY, end: now });

    expect(result.growth_metrics.tournaments).toBe(100);
  });

  test("an empty window reports no growth rather than dividing by zero", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    const result = await overview(t, token, { start: now - 7 * DAY, end: now });

    expect(result.growth_metrics.tournaments).toBe(0);
  });
});

describe("the aggregate stays in step with the table", () => {
  test("a deletion is reflected", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    const schoolId = await seedSchool(t, now);
    await seedSchool(t, now);
    await backfill(t);

    expect((await overview(t, token)).total_schools).toBe(2);

    // Removed through a mutation, so the trigger fires as it would in the app.
    await t.mutation(internal.functions.aggregate_backfill.forgetSchool, {
      school_id: schoolId,
    });

    expect((await overview(t, token)).total_schools).toBe(1);
  });

  test("backfilling an already-counted row does not double it", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    await seedSchool(t, now);
    await seedSchool(t, now);
    await backfill(t);

    // A second pass over rows already counted has to be a no-op rather than
    // counting them twice.
    await backfill(t);

    expect((await overview(t, token)).total_schools).toBe(2);
  });

  test("clearing and backfilling reproduces the same counts", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const now = Date.now();

    await seedSchool(t, now);
    await seedSchool(t, now);
    await seedTournament(t, now);
    await backfill(t);

    const before = await overview(t, token);

    await t.mutation(internal.functions.aggregate_backfill.clearAggregates, {});
    await t.mutation(internal.functions.aggregate_backfill.backfillAll, {});

    const after = await overview(t, token);

    expect(after.total_schools).toBe(before.total_schools);
    expect(after.total_tournaments).toBe(before.total_tournaments);
    expect(after.total_users).toBe(before.total_users);
  });
});
