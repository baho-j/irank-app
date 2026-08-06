import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";
import { Id } from "../_generated/dataModel";

type T = ReturnType<typeof setupTest>;

async function seedSchool(t: T, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("schools", {
      name, type: "Private", country: "Rwanda",
      contact_name: "C", contact_email: `${Math.random().toString(36).slice(2)}@t.test`,
      status: "active", verified: true, created_at: Date.now(),
    })
  );
}

async function seedTournament(t: T, fee = 10000) {
  const now = Date.now();

  return await t.run(async (ctx) =>
    ctx.db.insert("tournaments", {
      name: "Paid Open",
      slug: `f-${Math.random().toString(36).slice(2)}`,
      start_date: now, end_date: now, is_virtual: false,
      format: "WorldSchools",
      prelim_rounds: 3, elimination_rounds: 1,
      judges_per_debate: 1, team_size: 3,
      speaking_times: {},
      status: "published", created_at: now,
      fee,
    })
  );
}

async function seedTeams(
  t: T,
  tournamentId: Id<"tournaments">,
  schoolId: Id<"schools">,
  count: number,
  paymentStatus: "pending" | "paid" | "waived" = "pending"
) {
  return await t.run(async (ctx) => {
    const ids: Id<"teams">[] = [];

    for (let i = 0; i < count; i += 1) {
      ids.push(
        await ctx.db.insert("teams", {
          name: `Team ${i}`, tournament_id: tournamentId, school_id: schoolId,
          members: [], is_confirmed: true, payment_status: paymentStatus,
          status: "active", created_at: Date.now(),
        })
      );
    }

    return ids;
  });
}

async function schoolAdmin(t: T, schoolId: Id<"schools">) {
  const session = await createUserWithSession(t, "school_admin");

  await t.run(async (ctx) => {
    await ctx.db.patch(session.userId, { school_id: schoolId });
  });

  return session;
}

describe("what a school owes", () => {
  test("the amount due follows the fee and team count", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, schoolId, 3);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId,
    });

    expect(status.amount_due).toBe(30000);
    expect(status.outstanding).toBe(30000);
    expect(status.settled).toBe(false);
  });

  test("waived teams are not billed", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, schoolId, 2);
    await seedTeams(t, tournamentId, schoolId, 1, "waived");

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId,
    });

    expect(status.waived_teams).toBe(1);
    expect(status.amount_due).toBe(20000);
  });

  test("a free tournament leaves nothing owing", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t, 0);

    await seedTeams(t, tournamentId, schoolId, 3);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId,
    });

    expect(status.amount_due).toBe(0);
    expect(status.settled).toBe(true);
  });
});

describe("a school recording a payment", () => {
  test("it lands as pending, not confirmed", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t);

    await seedTeams(t, tournamentId, schoolId, 1);

    await t.mutation(api.functions.finance.submitPaymentClaim, {
      token, tournament_id: tournamentId, amount: 10000, method: "mobile_money",
    });

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId,
    });

    // Unconfirmed money is not collected money.
    expect(status.amount_paid).toBe(0);
    expect(status.payments[0].status).toBe("pending");
  });

  test("the same reference twice does not double count", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t);

    const submit = () =>
      t.mutation(api.functions.finance.submitPaymentClaim, {
        token, tournament_id: tournamentId, amount: 10000,
        method: "bank_transfer", reference_number: "TRX-1",
      });

    const first = await submit();
    const second = await submit();

    expect(second.duplicate).toBe(true);
    expect(second.payment_id).toBe(first.payment_id);
  });

  test("a zero payment is refused", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t);

    await expect(
      t.mutation(api.functions.finance.submitPaymentClaim, {
        token, tournament_id: tournamentId, amount: 0, method: "cash",
      })
    ).rejects.toThrow(/more than zero/i);
  });

  test("a student cannot record a school payment", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "student");
    const tournamentId = await seedTournament(t);

    await expect(
      t.mutation(api.functions.finance.submitPaymentClaim, {
        token, tournament_id: tournamentId, amount: 10000, method: "cash",
      })
    ).rejects.toThrow(/school administrator/i);
  });
});

describe("an admin reviewing a payment", () => {
  test("confirming settles the teams once the balance is cleared", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, schoolId, 2);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 20000, method: "bank_transfer",
    });

    const result = await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "confirm",
    });

    expect(result.teams_marked_paid).toBe(2);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token: school.token, tournament_id: tournamentId,
    });

    expect(status.settled).toBe(true);
  });

  test("a part payment does not mark teams paid", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, schoolId, 3);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    const result = await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "confirm",
    });

    expect(result.teams_marked_paid).toBe(0);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token: school.token, tournament_id: tournamentId,
    });

    expect(status.outstanding).toBe(20000);
  });

  test("rejecting leaves nothing collected", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await seedTeams(t, tournamentId, schoolId, 1);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    await t.mutation(api.functions.finance.reviewPaymentClaim, {
      token: admin.token, payment_id: claim.payment_id, decision: "reject",
    });

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token: school.token, tournament_id: tournamentId,
    });

    expect(status.amount_paid).toBe(0);
    expect(status.settled).toBe(false);
  });

  test("only an admin may review", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const school = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t);

    const claim = await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    await expect(
      t.mutation(api.functions.finance.reviewPaymentClaim, {
        token: school.token, payment_id: claim.payment_id, decision: "confirm",
      })
    ).rejects.toThrow(/admin access required/i);
  });
});

describe("school data isolation", () => {
  test("a school cannot read another school's payments", async () => {
    const t = setupTest();
    const mine = await seedSchool(t, "Green Hills");
    const theirs = await seedSchool(t, "Riverside");
    const { token } = await schoolAdmin(t, mine);
    const tournamentId = await seedTournament(t);

    await expect(
      t.query(api.functions.finance.getSchoolPaymentStatus, {
        token, tournament_id: tournamentId, school_id: theirs,
      })
    ).rejects.toThrow(/only view your own school/i);
  });

  test("a school only sees its own totals", async () => {
    const t = setupTest();
    const mine = await seedSchool(t, "Green Hills");
    const theirs = await seedSchool(t, "Riverside");
    const { token } = await schoolAdmin(t, mine);
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, mine, 1);
    await seedTeams(t, tournamentId, theirs, 5);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId,
    });

    expect(status.teams).toBe(1);
    expect(status.amount_due).toBe(10000);
  });

  test("an admin may look at any school", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, schoolId, 2);

    const status = await t.query(api.functions.finance.getSchoolPaymentStatus, {
      token, tournament_id: tournamentId, school_id: schoolId,
    });

    expect(status.amount_due).toBe(20000);
  });
});

describe("the tournament finance summary", () => {
  test("it totals every school", async () => {
    const t = setupTest();
    const first = await seedSchool(t, "Green Hills");
    const second = await seedSchool(t, "Riverside");
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, first, 2);
    await seedTeams(t, tournamentId, second, 3);

    const finance = await t.query(api.functions.finance.getTournamentFinance, {
      token, tournament_id: tournamentId,
    });

    expect(finance.expected).toBe(50000);
    expect(finance.collected).toBe(0);
    expect(finance.outstanding).toBe(50000);
    expect(finance.schools).toHaveLength(2);
  });

  test("schools owing the most are listed first", async () => {
    const t = setupTest();
    const small = await seedSchool(t, "Small");
    const large = await seedSchool(t, "Large");
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    await seedTeams(t, tournamentId, small, 1);
    await seedTeams(t, tournamentId, large, 4);

    const finance = await t.query(api.functions.finance.getTournamentFinance, {
      token, tournament_id: tournamentId,
    });

    expect(finance.schools[0].school_name).toBe("Large");
  });

  test("payments awaiting review are counted", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const school = await schoolAdmin(t, schoolId);
    const admin = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t);

    await seedTeams(t, tournamentId, schoolId, 1);

    await t.mutation(api.functions.finance.submitPaymentClaim, {
      token: school.token, tournament_id: tournamentId, amount: 10000, method: "cash",
    });

    const finance = await t.query(api.functions.finance.getTournamentFinance, {
      token: admin.token, tournament_id: tournamentId,
    });

    expect(finance.pending_review).toBe(1);
  });

  test("a school administrator cannot read the summary", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await schoolAdmin(t, schoolId);
    const tournamentId = await seedTournament(t);

    await expect(
      t.query(api.functions.finance.getTournamentFinance, {
        token, tournament_id: tournamentId,
      })
    ).rejects.toThrow(/admin access required/i);
  });

  test("withdrawn teams are not billed", async () => {
    const t = setupTest();
    const schoolId = await seedSchool(t, "Green Hills");
    const { token } = await createUserWithSession(t, "admin");
    const tournamentId = await seedTournament(t, 10000);

    const teamIds = await seedTeams(t, tournamentId, schoolId, 3);

    await t.run(async (ctx) => {
      await ctx.db.patch(teamIds[0], { status: "withdrawn" });
    });

    const finance = await t.query(api.functions.finance.getTournamentFinance, {
      token, tournament_id: tournamentId,
    });

    expect(finance.expected).toBe(20000);
  });
});
