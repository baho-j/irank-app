"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { renderEmail, renderList, renderStat } from "../lib/email_layout";

type Recipient = { email: string; name: string };

const siteUrl = () => process.env.FRONTEND_SITE_URL || "https://irankhub.debaterwanda.org";

async function requireCoordinator(ctx: any, token: string) {
  const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
    token,
  });

  if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
    throw new Error("Admin access required");
  }

  return sessionResult.user;
}

/**
 * Queues a message per recipient.
 *
 * The count returned is what was accepted for delivery, not what has arrived —
 * sending happens in the notification pool after this returns, so a slow mail
 * server no longer holds up the mutation that triggered it.
 */
async function deliver(
  ctx: any,
  recipients: Recipient[],
  subject: string,
  render: (recipient: Recipient) => string
): Promise<{ sent: number; failed: number }> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const { queued } = await ctx.runMutation(
    internal.functions.notification_queue.enqueueEmails,
    {
      messages: recipients.map((recipient) => ({
        to: recipient.email,
        subject,
        html: render(recipient),
      })),
    }
  );

  return { sent: queued, failed: 0 };
}

/**
 * Ranking release. Who hears about it depends on what was released:
 * speaker rankings reach the students themselves and their schools, while
 * team and school rankings go to schools only.
 */
const rankingReleaseArgs = {
  tournament_id: v.id("tournaments"),
  scope: v.union(v.literal("prelims"), v.literal("full_tournament")),
  released: v.object({
    students: v.boolean(),
    teams: v.boolean(),
    schools: v.boolean(),
  }),
};

type RankingReleaseArgs = {
  tournament_id: Id<"tournaments">;
  scope: "prelims" | "full_tournament";
  released: { students: boolean; teams: boolean; schools: boolean };
};

async function deliverRankingRelease(
  ctx: any,
  args: RankingReleaseArgs
): Promise<{ sent: number; failed: number }> {
  const audience = await ctx.runQuery(
      internal.functions.notification_recipients.getRankingAudience,
      {
        tournament_id: args.tournament_id,
        include_students: args.released.students,
      }
    );

    const scopeLabel = args.scope === "prelims" ? "preliminary round" : "full tournament";
    const rankingsUrl = `${siteUrl()}/tournaments/${audience.tournament.slug}#rankings`;

    const released: string[] = [];
    if (args.released.students) released.push("Speaker rankings");
    if (args.released.teams) released.push("Team rankings");
    if (args.released.schools) released.push("School rankings");

    const body = (name: string) => renderEmail({
      title: `${scopeLabel === "preliminary round" ? "Preliminary" : "Tournament"} rankings are now available`,
      preheader: `${audience.tournament.name} rankings have been released.`,
      greeting: `Hello ${name},`,
      body: `<p>The ${scopeLabel} rankings for <strong>${audience.tournament.name}</strong> have been released.</p>
             ${renderList(released)}
             <p>You can view the full standings on iRank.</p>`,
      button: { label: "View rankings", url: rankingsUrl },
    });

    const totals = { sent: 0, failed: 0 };

    // Schools always hear about a release.
    const schoolResult = await deliver(
      ctx,
      audience.schools,
      `${audience.tournament.name} — rankings released`,
      (recipient) => body(recipient.name)
    );
    totals.sent += schoolResult.sent;
    totals.failed += schoolResult.failed;

    // Students only when their own speaker rankings were part of it.
    if (args.released.students) {
      const studentResult = await deliver(
        ctx,
        audience.students,
        `${audience.tournament.name} — your speaker ranking is available`,
        (recipient) => body(recipient.name)
      );
      totals.sent += studentResult.sent;
      totals.failed += studentResult.failed;
    }

    return totals;
}

/** Fired by the release mutation, for scopes that were newly opened. */
export const announceRankingRelease = internalAction({
  args: rankingReleaseArgs,
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> =>
    await deliverRankingRelease(ctx, args),
});

/** The same announcement, sent again on request by a coordinator. */
export const sendRankingReleaseEmails = action({
  args: { token: v.string(), ...rankingReleaseArgs },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    await requireCoordinator(ctx, args.token);

    return await deliverRankingRelease(ctx, args);
  },
});

const paymentArgs = {
  school_email: v.string(),
  school_name: v.string(),
  tournament_name: v.string(),
  amount: v.number(),
  currency: v.string(),
  reference: v.optional(v.string()),
};

type PaymentArgs = {
  school_email: string;
  school_name: string;
  tournament_name: string;
  amount: number;
  currency: string;
  reference?: string;
};

async function deliverPaymentConfirmation(ctx: any, args: PaymentArgs) {
  return await deliver(
    ctx,
    [{ email: args.school_email, name: args.school_name }],
    `Payment confirmed — ${args.tournament_name}`,
    (recipient) => renderEmail({
      title: "Payment confirmed",
      preheader: `Your payment for ${args.tournament_name} has been recorded.`,
      greeting: `Hello ${recipient.name},`,
      body: `<p>We have recorded your payment for <strong>${args.tournament_name}</strong>.</p>
             ${renderStat("Amount received", `${args.currency} ${args.amount.toLocaleString()}`)}
             ${args.reference ? `<p style="font-size:13px;">Reference: <strong>${args.reference}</strong></p>` : ""}
             <p>Your teams are confirmed for this tournament. Keep this email for your records.</p>`,
    })
  );
}

/** Fired when a coordinator confirms a payment a school recorded. */
export const confirmPaymentByEmail = internalAction({
  args: paymentArgs,
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> =>
    await deliverPaymentConfirmation(ctx, args),
});

export const sendPaymentConfirmationEmail = action({
  args: { token: v.string(), ...paymentArgs },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    await requireCoordinator(ctx, args.token);

    return await deliverPaymentConfirmation(ctx, args);
  },
});

async function deliverTournamentCompleted(
  ctx: any,
  tournamentId: Id<"tournaments">
): Promise<{ sent: number; failed: number }> {
  const audience = await ctx.runQuery(
    internal.functions.notification_recipients.getRankingAudience,
    { tournament_id: tournamentId, include_students: false }
  );

  return await deliver(
    ctx,
    audience.schools,
    `Thank you for taking part in ${audience.tournament.name}`,
    (recipient) => renderEmail({
      title: `Thank you for joining ${audience.tournament.name}`,
      preheader: "The tournament has concluded.",
      greeting: `Hello ${recipient.name},`,
      body: `<p><strong>${audience.tournament.name}</strong> has concluded, and we want to thank your school for taking part.</p>
             <p>Your students' results contribute to their league standing. Rankings appear on iRank once released by the coordinator.</p>
             <p>We hope to see you at the next tournament.</p>`,
      button: { label: "View tournament", url: `${siteUrl()}/tournaments/${audience.tournament.slug}` },
    })
  );
}

/** Fired when a tournament's status moves to completed. */
export const thankSchoolsForTournament = internalAction({
  args: { tournament_id: v.id("tournaments") },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> =>
    await deliverTournamentCompleted(ctx, args.tournament_id),
});

export const sendTournamentCompletedEmails = action({
  args: { token: v.string(), tournament_id: v.id("tournaments") },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    await requireCoordinator(ctx, args.token);

    return await deliverTournamentCompleted(ctx, args.tournament_id);
  },
});

/**
 * Motion release for impromptu rounds. Judges always need it. In Dreams Mode
 * the students and volunteers debating need it at the same moment, since the
 * motion is only revealed at release time.
 */
export const sendMotionReleasedEmails = internalAction({
  args: {
    tournament_id: v.id("tournaments"),
    round_id: v.id("rounds"),
  },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    const audience = await ctx.runQuery(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: args.tournament_id, round_id: args.round_id }
    );

    if (!audience.round.is_impromptu) {
      return { sent: 0, failed: 0 };
    }

    const recipients = [
      ...audience.judges,
      ...(audience.is_dreams_mode ? audience.students : []),
      ...(audience.is_dreams_mode ? audience.volunteers : []),
    ];

    // A motion is time-critical, so it goes to the device as well as the
    // inbox, to the same people.
    await ctx.runMutation(internal.functions.notifications.notifyUsers, {
      user_ids: [
        ...audience.judge_ids,
        ...(audience.is_dreams_mode ? audience.student_ids : []),
        ...(audience.is_dreams_mode ? audience.volunteer_ids : []),
      ],
      title: `Round ${audience.round.round_number} motion released`,
      message: audience.round.motion,
      type: "debate",
      related_id: args.round_id,
      send_push: true,
    });

    return await deliver(
      ctx,
      recipients,
      `Motion released — Round ${audience.round.round_number}`,
      (recipient) => renderEmail({
        title: `Round ${audience.round.round_number} motion released`,
        preheader: audience.round.motion,
        greeting: `Hello ${recipient.name},`,
        body: `<p>The motion for <strong>Round ${audience.round.round_number}</strong> of ${audience.tournament.name} is now available.</p>
               <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
                 <tr><td style="padding:16px 18px;background:#f6f7f9;border-left:4px solid #f07000;border-radius:6px;font-size:16px;line-height:1.5;">
                   ${audience.round.motion}
                 </td></tr>
               </table>`,
        button: { label: "Open tournament", url: `${siteUrl()}/tournaments/${audience.tournament.slug}` },
      })
    );
  },
});

export const sendRoundCompletedEmails = internalAction({
  args: {
    tournament_id: v.id("tournaments"),
    round_id: v.id("rounds"),
  },
  handler: async (ctx, args): Promise<{ sent: number; failed: number }> => {
    const audience = await ctx.runQuery(
      internal.functions.notification_recipients.getMotionAudience,
      { tournament_id: args.tournament_id, round_id: args.round_id }
    );

    await ctx.runMutation(internal.functions.notifications.notifyUsers, {
      user_ids: audience.judge_ids,
      title: `Round ${audience.round.round_number} is complete`,
      message: `All ballots for Round ${audience.round.round_number} of ${audience.tournament.name} are in.`,
      type: "debate",
      related_id: args.round_id,
      send_push: true,
    });

    return await deliver(
      ctx,
      audience.judges,
      `Round ${audience.round.round_number} complete — ${audience.tournament.name}`,
      (recipient) => renderEmail({
        title: `Round ${audience.round.round_number} is complete`,
        preheader: "All ballots for this round are in.",
        greeting: `Hello ${recipient.name},`,
        body: `<p>All ballots for <strong>Round ${audience.round.round_number}</strong> of ${audience.tournament.name} have been submitted.</p>
               <p>Thank you for judging. The next round's pairings will appear on iRank once the tab team releases them.</p>`,
        button: { label: "Open tournament", url: `${siteUrl()}/tournaments/${audience.tournament.slug}` },
      })
    );
  },
});
