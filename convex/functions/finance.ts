import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

interface SessionUser {
  id: Id<"users">;
  role: string;
  school_id?: Id<"schools">;
}

async function requireUser(ctx: any, token: string): Promise<SessionUser> {
  const sessionResult: { valid: boolean; user?: SessionUser } = await ctx.runQuery(
    internal.functions.auth.verifySessionReadOnly,
    { token }
  );

  if (!sessionResult.valid || !sessionResult.user) {
    throw new Error("Authentication required");
  }

  return sessionResult.user;
}

/**
 * A school's own payment position for a tournament.
 *
 * Scoped to the caller's school, so one school can never read another's
 * finances. An admin may name a school explicitly.
 */
export const getSchoolPaymentStatus = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    school_id: v.optional(v.id("schools")),
  },
  handler: async (ctx, args): Promise<{
    school_id: Id<"schools">;
    teams: number;
    fee_per_team: number;
    amount_due: number;
    amount_paid: number;
    outstanding: number;
    settled: boolean;
    waived_teams: number;
    payments: Array<{
      _id: Id<"payments">;
      amount: number;
      currency: string;
      method: string;
      status: string;
      reference_number?: string;
      created_at: number;
    }>;
  }> => {
    const user = await requireUser(ctx, args.token);

    const schoolId = user.role === "admin" ? args.school_id ?? user.school_id : user.school_id;

    if (!schoolId) throw new Error("No school to report on");

    if (user.role !== "admin" && args.school_id && args.school_id !== user.school_id) {
      throw new Error("You can only view your own school's payments");
    }

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) throw new Error("Tournament not found");

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id_school_id", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("school_id", schoolId)
      )
      .collect();

    const active = teams.filter((team) => team.status !== "withdrawn");
    const waived = active.filter((team) => team.payment_status === "waived");
    const billable = active.length - waived.length;
    const feePerTeam = tournament.fee ?? 0;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_tournament_id_school_id", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("school_id", schoolId)
      )
      .collect();

    const paid = payments
      .filter((payment) => payment.status === "completed")
      .reduce((total, payment) => total + payment.amount, 0);

    const due = billable * feePerTeam;

    return {
      school_id: schoolId,
      teams: active.length,
      fee_per_team: feePerTeam,
      amount_due: due,
      amount_paid: paid,
      outstanding: Math.max(0, due - paid),
      settled: paid >= due,
      waived_teams: waived.length,
      payments: payments.map((payment) => ({
        _id: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        reference_number: payment.reference_number,
        created_at: payment.created_at,
      })),
    };
  },
});

/**
 * A school records that it has sent payment. This is a claim, not a
 * confirmation: it lands as `pending` for an admin to verify, and does not
 * mark any team paid on its own.
 */
export const submitPaymentClaim = mutation({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    amount: v.number(),
    currency: v.optional(v.string()),
    method: v.union(
      v.literal("bank_transfer"),
      v.literal("mobile_money"),
      v.literal("cash"),
      v.literal("other")
    ),
    reference_number: v.optional(v.string()),
    receipt_image: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ payment_id: Id<"payments">; duplicate: boolean }> => {
    const user = await requireUser(ctx, args.token);

    if (user.role !== "school_admin" || !user.school_id) {
      throw new Error("Only a school administrator can record a payment");
    }

    if (args.amount <= 0) throw new Error("A payment must be more than zero");

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) throw new Error("Tournament not found");

    const existing = await ctx.db
      .query("payments")
      .withIndex("by_tournament_id_school_id", (q) =>
        q.eq("tournament_id", args.tournament_id).eq("school_id", user.school_id!)
      )
      .collect();

    // The same reference twice is the same transfer submitted twice, which
    // would otherwise show as double payment on a school's account.
    if (args.reference_number) {
      const duplicate = existing.find(
        (payment) => payment.reference_number === args.reference_number
      );

      if (duplicate) return { payment_id: duplicate._id, duplicate: true };
    }

    const paymentId = await ctx.db.insert("payments", {
      tournament_id: args.tournament_id,
      school_id: user.school_id,
      amount: args.amount,
      currency: args.currency ?? "RWF",
      status: "pending",
      method: args.method,
      reference_number: args.reference_number,
      receipt_image: args.receipt_image,
      notes: args.notes,
      created_by: user.id,
      created_at: Date.now(),
    });

    return { payment_id: paymentId, duplicate: false };
  },
});

/**
 * An admin confirms or rejects a payment a school recorded. Teams are marked
 * paid only once the school's outstanding balance is cleared, so a partial
 * payment does not let a school field unpaid teams.
 */
export const reviewPaymentClaim = mutation({
  args: {
    token: v.string(),
    payment_id: v.id("payments"),
    decision: v.union(v.literal("confirm"), v.literal("reject")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: string; teams_marked_paid: number }> => {
    const user = await requireUser(ctx, args.token);

    if (user.role !== "admin") throw new Error("Admin access required");

    const payment = await ctx.db.get(args.payment_id);
    if (!payment) throw new Error("Payment not found");

    const status = args.decision === "confirm" ? "completed" : "failed";

    await ctx.db.patch(args.payment_id, {
      status,
      notes: args.notes ?? payment.notes,
      updated_at: Date.now(),
    });

    let marked = 0;

    if (args.decision === "confirm" && payment.school_id) {
      marked = await settleTeams(ctx, payment.tournament_id, payment.school_id);

      const [school, tournament] = await Promise.all([
        ctx.db.get(payment.school_id),
        ctx.db.get(payment.tournament_id),
      ]);

      if (school?.contact_email && tournament) {
        await ctx.scheduler.runAfter(
          0,
          internal.functions.notification_emails.confirmPaymentByEmail,
          {
            school_email: school.contact_email,
            school_name: school.name,
            tournament_name: tournament.name,
            amount: payment.amount,
            currency: payment.currency,
            reference: payment.reference_number,
          }
        );
      }
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: user.id,
      action: "payment_processed",
      resource_type: "payments",
      resource_id: args.payment_id,
      description: `Payment ${args.decision === "confirm" ? "confirmed" : "rejected"}`,
    });

    return { status, teams_marked_paid: marked };
  },
});

/** Marks a school's teams paid once its confirmed payments cover the fees. */
async function settleTeams(
  ctx: any,
  tournamentId: Id<"tournaments">,
  schoolId: Id<"schools">
): Promise<number> {
  const tournament = await ctx.db.get(tournamentId);
  const feePerTeam = tournament?.fee ?? 0;

  const teams: Doc<"teams">[] = await ctx.db
    .query("teams")
    .withIndex("by_tournament_id_school_id", (q: any) =>
      q.eq("tournament_id", tournamentId).eq("school_id", schoolId)
    )
    .collect();

  const payments: Doc<"payments">[] = await ctx.db
    .query("payments")
    .withIndex("by_tournament_id_school_id", (q: any) =>
      q.eq("tournament_id", tournamentId).eq("school_id", schoolId)
    )
    .collect();

  const paid = payments
    .filter((payment) => payment.status === "completed")
    .reduce((total, payment) => total + payment.amount, 0);

  const outstanding = teams.filter(
    (team) => team.status !== "withdrawn" && team.payment_status === "pending"
  );

  if (feePerTeam > 0 && paid < outstanding.length * feePerTeam) return 0;

  let marked = 0;

  for (const team of outstanding) {
    await ctx.db.patch(team._id, { payment_status: "paid", updated_at: Date.now() });
    marked += 1;
  }

  return marked;
}

/** Every school's position for a tournament, for the admin finance screen. */
export const getTournamentFinance = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<{
    fee_per_team: number;
    expected: number;
    collected: number;
    outstanding: number;
    pending_review: number;
    schools: Array<{
      school_id: Id<"schools">;
      school_name: string;
      teams: number;
      amount_due: number;
      amount_paid: number;
      outstanding: number;
      settled: boolean;
    }>;
  }> => {
    const user = await requireUser(ctx, args.token);

    if (user.role !== "admin") throw new Error("Admin access required");

    const tournament = await ctx.db.get(args.tournament_id);
    if (!tournament) throw new Error("Tournament not found");

    const feePerTeam = tournament.fee ?? 0;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
      .collect();

    const paidBySchool = new Map<string, number>();

    for (const payment of payments) {
      if (payment.status !== "completed" || !payment.school_id) continue;

      paidBySchool.set(
        payment.school_id,
        (paidBySchool.get(payment.school_id) ?? 0) + payment.amount
      );
    }

    const bySchool = new Map<Id<"schools">, Doc<"teams">[]>();

    for (const team of teams) {
      if (team.status === "withdrawn" || !team.school_id) continue;

      const existing = bySchool.get(team.school_id) ?? [];
      existing.push(team);
      bySchool.set(team.school_id, existing);
    }

    const schools = await Promise.all(
      [...bySchool.entries()].map(async ([schoolId, schoolTeams]) => {
        const school = await ctx.db.get(schoolId);

        const billable = schoolTeams.filter(
          (team) => team.payment_status !== "waived"
        ).length;

        const due = billable * feePerTeam;
        const paid = paidBySchool.get(schoolId) ?? 0;

        return {
          school_id: schoolId,
          school_name: school?.name ?? "Unknown school",
          teams: schoolTeams.length,
          amount_due: due,
          amount_paid: paid,
          outstanding: Math.max(0, due - paid),
          settled: paid >= due,
        };
      })
    );

    schools.sort((a, b) => b.outstanding - a.outstanding || a.school_name.localeCompare(b.school_name));

    return {
      fee_per_team: feePerTeam,
      expected: schools.reduce((total, school) => total + school.amount_due, 0),
      collected: schools.reduce((total, school) => total + school.amount_paid, 0),
      outstanding: schools.reduce((total, school) => total + school.outstanding, 0),
      pending_review: payments.filter((payment) => payment.status === "pending").length,
      schools,
    };
  },
});
