import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import { setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

async function seedTournament(
  t: T,
  options: { leagueType?: "Local" | "International" | "Dreams Mode" } = {}
) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const leagueId = await ctx.db.insert("leagues", {
      name: "Test League",
      type: options.leagueType ?? "Local",
      status: "active",
      created_at: now,
    });

    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Kigali Open",
      slug: `kigali-${Math.random().toString(36).slice(2)}`,
      start_date: now,
      end_date: now + 86400000,
      is_virtual: false,
      league_id: leagueId,
      format: "WorldSchools",
      prelim_rounds: 3,
      elimination_rounds: 1,
      judges_per_debate: 1,
      team_size: 3,
      speaking_times: { speaker1: 8 },
      status: "inProgress",
      created_at: now,
    });

    return { leagueId, tournamentId };
  });
}

async function seedSchoolWithTeam(
  t: T,
  tournamentId: Id<"tournaments">,
  schoolName: string,
  studentEmails: string[]
) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const schoolId = await ctx.db.insert("schools", {
      name: schoolName,
      type: "Private",
      country: "Rwanda",
      contact_name: `${schoolName} Patron`,
      contact_email: `${schoolName.toLowerCase().replace(/\s/g, "")}@example.test`,
      status: "active",
      verified: true,
      created_at: now,
    });

    const members: Id<"users">[] = [];

    for (const email of studentEmails) {
      const id = await ctx.db.insert("users", {
        name: email.split("@")[0],
        email,
        password_hash: "h",
        password_salt: "s",
        role: "student",
        status: "active",
        verified: true,
        school_id: schoolId,
        created_at: now,
      });
      members.push(id);
    }

    await ctx.db.insert("teams", {
      name: `${schoolName} A`,
      tournament_id: tournamentId,
      school_id: schoolId,
      members,
      is_confirmed: true,
      payment_status: "paid",
      status: "active",
      created_at: now,
    });

    return { schoolId, members };
  });
}

describe("ranking release audience", () => {
  test("school rankings reach schools only, never students", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    await seedSchoolWithTeam(t, tournamentId, "Green Hills", ["a@example.test", "b@example.test"]);

    const audience = await t.query(
      internal.functions.notification_recipients.getRankingAudience,
      { tournament_id: tournamentId, include_students: false }
    );

    expect(audience.schools).toHaveLength(1);
    expect(audience.students).toHaveLength(0);
  });

  test("speaker rankings reach both students and their schools", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    await seedSchoolWithTeam(t, tournamentId, "Green Hills", ["a@example.test", "b@example.test"]);

    const audience = await t.query(
      internal.functions.notification_recipients.getRankingAudience,
      { tournament_id: tournamentId, include_students: true }
    );

    expect(audience.schools).toHaveLength(1);
    expect(audience.students).toHaveLength(2);
  });

  test("each school is emailed once even with several teams", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    const { schoolId } = await seedSchoolWithTeam(t, tournamentId, "Green Hills", ["a@example.test"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        name: "Green Hills B",
        tournament_id: tournamentId,
        school_id: schoolId,
        members: [],
        is_confirmed: true,
        payment_status: "paid",
        status: "active",
        created_at: Date.now(),
      });
    });

    const audience = await t.query(
      internal.functions.notification_recipients.getRankingAudience,
      { tournament_id: tournamentId, include_students: false }
    );

    expect(audience.schools).toHaveLength(1);
  });

  test("withdrawn teams are excluded", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    const { schoolId } = await seedSchoolWithTeam(t, tournamentId, "Green Hills", ["a@example.test"]);

    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").collect();
      await ctx.db.patch(teams[0]._id, { status: "withdrawn" });

      await ctx.db.insert("schools", {
        name: "Other", type: "Private", country: "Rwanda",
        contact_name: "Other", contact_email: "other@example.test",
        status: "active", verified: true, created_at: Date.now(),
      });
      void schoolId;
    });

    const audience = await t.query(
      internal.functions.notification_recipients.getRankingAudience,
      { tournament_id: tournamentId, include_students: false }
    );

    expect(audience.schools).toHaveLength(0);
  });
});

describe("motion audience", () => {
  async function seedRound(t: T, tournamentId: Id<"tournaments">, isImpromptu: boolean) {
    const now = Date.now();

    return await t.run(async (ctx) => {
      const judgeId = await ctx.db.insert("users", {
        name: "Judge One",
        email: `judge-${Math.random().toString(36).slice(2)}@example.test`,
        password_hash: "h", password_salt: "s",
        role: "volunteer", status: "active", verified: true, created_at: now,
      });

      const roundId = await ctx.db.insert("rounds", {
        tournament_id: tournamentId,
        round_number: 2,
        type: "preliminary",
        status: "inProgress",
        start_time: now,
        end_time: now + 3600000,
        motion: "This house would abolish homework",
        is_impromptu: isImpromptu,
      });

      await ctx.db.insert("debates", {
        round_id: roundId,
        tournament_id: tournamentId,
        judges: [judgeId],
        status: "inProgress",
        is_public_speaking: false,
        poi_count: 0,
        created_at: now,
      });

      return { roundId, judgeId };
    });
  }

  test("judges are included and the motion is carried", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    const { roundId } = await seedRound(t, tournamentId, true);

    const audience = await t.query(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: tournamentId, round_id: roundId }
    );

    expect(audience.judges).toHaveLength(1);
    expect(audience.round.motion).toBe("This house would abolish homework");
    expect(audience.round.is_impromptu).toBe(true);
  });

  test("a local league is not Dreams Mode", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t, { leagueType: "Local" });
    const { roundId } = await seedRound(t, tournamentId, true);

    const audience = await t.query(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: tournamentId, round_id: roundId }
    );

    expect(audience.is_dreams_mode).toBe(false);
  });

  test("Dreams Mode is detected so debaters can be told the motion", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t, { leagueType: "Dreams Mode" });
    await seedSchoolWithTeam(t, tournamentId, "Green Hills", ["a@example.test"]);
    const { roundId } = await seedRound(t, tournamentId, true);

    const audience = await t.query(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: tournamentId, round_id: roundId }
    );

    expect(audience.is_dreams_mode).toBe(true);
    expect(audience.students).toHaveLength(1);
  });

  test("a prepared round is marked as not impromptu", async () => {
    const t = setupTest();
    const { tournamentId } = await seedTournament(t);
    const { roundId } = await seedRound(t, tournamentId, false);

    const audience = await t.query(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: tournamentId, round_id: roundId }
    );

    expect(audience.round.is_impromptu).toBe(false);
  });
});
