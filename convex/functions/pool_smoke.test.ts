import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import { drainPools, setupTest } from "../test_helpers.test-utils";

describe("the ranking pool actually drains", () => {
  test("every enqueued tally reports completion", { timeout: 30000 }, async () => {
    const t = setupTest();
    const now = Date.now();

    const RELEASED = {
      prelims: { teams: true, schools: true, students: true, volunteers: true },
      full_tournament: { teams: true, schools: true, students: true, volunteers: true },
      visible_to_roles: ["student", "school_admin", "volunteer"],
    };

    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i += 1) {
        await ctx.db.insert("tournaments", {
          name: `T${i}`, slug: `t-${i}-${Math.random().toString(36).slice(2)}`,
          start_date: now, end_date: now, is_virtual: false,
          format: "WorldSchools", prelim_rounds: 1, elimination_rounds: 0,
          judges_per_debate: 1, team_size: 3, speaking_times: {},
          status: "completed", ranking_released: RELEASED, created_at: now,
        });
      }
    });

    const noRunsLeft = async () =>
      (await t.run(async (ctx) => ctx.db.query("ranking_runs").collect())).length === 0;

    await t.mutation(internal.functions.ranking_rebuild.startRebuild, {});
    await drainPools(t, noRunsLeft);

    // No run row left means every tally reported and the merge ran.
    let runs = await t.run(async (ctx) => ctx.db.query("ranking_runs").collect());
    expect(runs).toHaveLength(0);

    // Tallies are cleared once merged, so a rerun starts from a clean slate.
    const tallies = await t.run(async (ctx) => ctx.db.query("ranking_tallies").collect());
    expect(tallies).toHaveLength(0);
  });
});
