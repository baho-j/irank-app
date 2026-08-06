import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

/**
 * These assert that the notification actions are actually scheduled by the
 * mutations that should trigger them. The actions themselves were written and
 * tested first but never wired to anything, so nothing was ever sent.
 */
async function scheduled(t: T, nameFragment: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();

    return jobs.filter((job) => job.name.includes(nameFragment));
  });
}

async function seedSchool(t: T, name = "Green Hills") {
  return await t.run(async (ctx) =>
    ctx.db.insert("schools", {
      name, type: "Private", country: "Rwanda",
      contact_name: "Contact", contact_email: `${Math.random().toString(36).slice(2)}@t.test`,
      status: "active", verified: true, created_at: Date.now(),
    })
  );
}

async function seedTournament(t: T, overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("tournaments", {
      name: "Kigali Open",
      slug: `k-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now + 1000, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3, elimination_rounds: 1,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status: "inProgress", created_at: now,
      fee: 10000,
      ...overrides,
    })
  );
}

const allClosed = {
  prelims: { teams: false, schools: false, students: false, volunteers: false },
  full_tournament: { teams: false, schools: false, students: false, volunteers: false },
  visible_to_roles: ["student", "school_admin", "volunteer"],
};

describe("ranking release announces itself", () => {
  test("opening a scope schedules the announcement", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token,
      tournament_id: tournamentId,
      ranking_settings: {
        ...allClosed,
        prelims: { teams: true, schools: true, students: true, volunteers: false },
      },
    });

    expect(await scheduled(t, "announceRankingRelease")).toHaveLength(1);
  });

  test("saving the same settings again sends nothing", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const settings = {
      ...allClosed,
      prelims: { teams: true, schools: false, students: false, volunteers: false },
    };

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token, tournament_id: tournamentId, ranking_settings: settings,
    });
    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token, tournament_id: tournamentId, ranking_settings: settings,
    });

    // Announced once, on the transition, not on every save.
    expect(await scheduled(t, "announceRankingRelease")).toHaveLength(1);
  });

  test("releasing nothing sends nothing", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token, tournament_id: tournamentId, ranking_settings: allClosed,
    });

    expect(await scheduled(t, "announceRankingRelease")).toHaveLength(0);
  });

  test("opening the second scope later announces it separately", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token,
      tournament_id: tournamentId,
      ranking_settings: {
        ...allClosed,
        prelims: { teams: true, schools: false, students: false, volunteers: false },
      },
    });

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token,
      tournament_id: tournamentId,
      ranking_settings: {
        ...allClosed,
        prelims: { teams: true, schools: false, students: false, volunteers: false },
        full_tournament: { teams: true, schools: false, students: false, volunteers: false },
      },
    });

    expect(await scheduled(t, "announceRankingRelease")).toHaveLength(2);
  });

  test("only the newly opened parts are announced", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token,
      tournament_id: tournamentId,
      ranking_settings: {
        ...allClosed,
        prelims: { teams: true, schools: false, students: false, volunteers: false },
      },
    });

    await t.mutation(api.functions.rankings.updateRankingRelease, {
      token,
      tournament_id: tournamentId,
      ranking_settings: {
        ...allClosed,
        prelims: { teams: true, schools: false, students: true, volunteers: false },
      },
    });

    const jobs = await scheduled(t, "announceRankingRelease");
    const latest = jobs[jobs.length - 1].args[0] as any;

    // Teams were already out; only the speaker rankings are new.
    expect(latest.released).toEqual({ students: true, teams: false, schools: false });
  });
});

describe("payment confirmation reaches the school", () => {
  async function schoolAdmin(t: T, schoolId: Id<"schools">) {
    const session = await createUserWithSession(t, "school_admin");

    await t.run(async (ctx) => {
      await ctx.db.patch(session.userId, { school_id: schoolId });
    });

    return session;
  }

  test("confirming a payment schedules the email", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t);
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "confirm",
    });

    const jobs = await scheduled(t, "confirmPaymentByEmail");

    expect(jobs).toHaveLength(1);
    expect((jobs[0].args[0] as any).amount).toBe(10000);
  });

  test("rejecting a payment sends nothing", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t);
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "reject",
    });

    expect(await scheduled(t, "confirmPaymentByEmail")).toHaveLength(0);
  });

  test("the reference travels with the confirmation", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t);
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000,
      method: "bank_transfer", reference_number: "TRX-99",
    });

    await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "confirm",
    });

    const jobs = await scheduled(t, "confirmPaymentByEmail");

    expect((jobs[0].args[0] as any).reference).toBe("TRX-99");
  });
});

describe("completing a tournament thanks the schools", () => {
  const updateArgs = (tournamentId: Id<"tournaments">, status: string) => ({
    tournament_id: tournamentId,
    name: "Kigali Open",
    start_date: Date.now(),
    end_date: Date.now() + 1000,
    is_virtual: false,
    format: "WorldSchools" as const,
    prelim_rounds: 3,
    elimination_rounds: 1,
    judges_per_debate: 1,
    team_size: 3,
    speaking_times: {},
    status: status as any,
  });

  test("moving to completed schedules the thank-you", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.admin.tournaments.updateTournament, {
      admin_token: token, ...updateArgs(tournamentId, "completed"),
    });

    expect(await scheduled(t, "thankSchoolsForTournament")).toHaveLength(1);
  });

  test("saving a completed tournament again sends nothing more", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, { status: "completed" });

    await t.mutation(api.functions.admin.tournaments.updateTournament, {
      admin_token: token, ...updateArgs(tournamentId, "completed"),
    });

    expect(await scheduled(t, "thankSchoolsForTournament")).toHaveLength(0);
  });

  test("an ordinary edit sends nothing", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await t.mutation(api.functions.admin.tournaments.updateTournament, {
      admin_token: token, ...updateArgs(tournamentId, "inProgress"),
    });

    expect(await scheduled(t, "thankSchoolsForTournament")).toHaveLength(0);
  });
});

describe("push reaches the same people as the mail", () => {
  async function seedRound(t: T, tournamentId: Id<"tournaments">, impromptu: boolean) {
    return await t.run(async (ctx) =>
      ctx.db.insert("rounds", {
        tournament_id: tournamentId,
        round_number: 1,
        type: "preliminary",
        status: "inProgress",
        start_time: Date.now(),
        end_time: Date.now() + 3600000,
        motion: "This house would abolish exams",
        is_impromptu: impromptu,
        motion_released_at: Date.now(),
      })
    );
  }

  async function seedJudgedDebate(
    t: T,
    tournamentId: Id<"tournaments">,
    roundId: Id<"rounds">
  ) {
    return await t.run(async (ctx) => {
      const judgeId = await ctx.db.insert("users", {
        name: "Judge A", email: `j-${Math.random().toString(36).slice(2)}@t.test`,
        password_hash: "h", password_salt: "s", role: "volunteer",
        status: "active", verified: true, created_at: Date.now(),
      });

      await ctx.db.insert("debates", {
        round_id: roundId, tournament_id: tournamentId,
        judges: [judgeId], status: "pending",
        is_public_speaking: false, poi_count: 0, created_at: Date.now(),
      });

      return judgeId;
    });
  }

  test("a released motion notifies the judges", async () => {
    const t = setupTest();
    const tournamentId = await seedTournament(t);
    const roundId = await seedRound(t, tournamentId, true);
    const judgeId = await seedJudgedDebate(t, tournamentId, roundId);

    await t.action(internal.functions.notification_emails.sendMotionReleasedEmails, {
      tournament_id: tournamentId, round_id: roundId,
    });

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    );

    expect(notifications.map((n) => n.user_id)).toContain(judgeId);
    expect(notifications[0].message).toContain("abolish exams");
  });

  test("a prepared motion notifies nobody", async () => {
    const t = setupTest();
    const tournamentId = await seedTournament(t);
    const roundId = await seedRound(t, tournamentId, false);
    await seedJudgedDebate(t, tournamentId, roundId);

    await t.action(internal.functions.notification_emails.sendMotionReleasedEmails, {
      tournament_id: tournamentId, round_id: roundId,
    });

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    );

    expect(notifications).toHaveLength(0);
  });

  test("a completed round notifies its judges", async () => {
    const t = setupTest();
    const tournamentId = await seedTournament(t);
    const roundId = await seedRound(t, tournamentId, false);
    const judgeId = await seedJudgedDebate(t, tournamentId, roundId);

    await t.action(internal.functions.notification_emails.sendRoundCompletedEmails, {
      tournament_id: tournamentId, round_id: roundId,
    });

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    );

    expect(notifications.map((n) => n.user_id)).toContain(judgeId);
    expect(notifications[0].title).toMatch(/complete/i);
  });

  test("a notification is raised for each notified judge", async () => {
    const t = setupTest();
    const tournamentId = await seedTournament(t);
    const roundId = await seedRound(t, tournamentId, true);
    const judgeId = await seedJudgedDebate(t, tournamentId, roundId);

    await t.action(internal.functions.notification_emails.sendMotionReleasedEmails, {
      tournament_id: tournamentId, round_id: roundId,
    });

    // The notification row is written in the same mutation that enqueues the
    // push, so it is visible immediately; only delivery is queued.
    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    );

    expect(notifications.map((n) => n.user_id)).toContain(judgeId);
    expect(notifications[0].message).toContain("abolish exams");
  });
});
