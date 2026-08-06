import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

type Recipient = { email: string; name: string };

function dedupe(recipients: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();

  recipients.forEach((recipient) => {
    const key = recipient.email.toLowerCase();
    if (recipient.email && !seen.has(key)) seen.set(key, recipient);
  });

  return Array.from(seen.values());
}

async function schoolsForTournament(ctx: any, tournamentId: Id<"tournaments">) {
  const teams: Doc<"teams">[] = await ctx.db
    .query("teams")
    .withIndex("by_tournament_id", (q: any) => q.eq("tournament_id", tournamentId))
    .collect();

  const active = teams.filter((team) => team.status === "active");
  const schoolIds = Array.from(
    new Set(active.map((team) => team.school_id).filter(Boolean))
  ) as Id<"schools">[];

  const schools = await Promise.all(schoolIds.map((id) => ctx.db.get(id)));

  return {
    teams: active,
    schools: schools.filter(Boolean) as Doc<"schools">[],
  };
}

/**
 * Ranking release audience. Schools always hear about a release; students are
 * only included when their own speaker rankings were part of it, so a team or
 * school ranking never emails students directly.
 */
export const getRankingAudience = internalQuery({
  args: {
    tournament_id: v.id("tournaments"),
    include_students: v.boolean(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournament_id);

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const { teams, schools } = await schoolsForTournament(ctx, args.tournament_id);

    const schoolRecipients = dedupe(
      schools.map((school) => ({
        email: school.contact_email,
        name: school.contact_name || school.name,
      }))
    );

    let studentRecipients: Recipient[] = [];

    if (args.include_students) {
      const memberIds = Array.from(new Set(teams.flatMap((team) => team.members)));
      const students = await Promise.all(memberIds.map((id) => ctx.db.get(id)));

      studentRecipients = dedupe(
        students
          .filter((student): student is Doc<"users"> => !!student && student.status === "active")
          .map((student) => ({ email: student.email, name: student.name }))
      );
    }

    return {
      tournament: { name: tournament.name, slug: tournament.slug },
      schools: schoolRecipients,
      students: studentRecipients,
    };
  },
});

/**
 * Motion and round audience. Judges are the assigned volunteers. Students and
 * volunteers are resolved too, but only used in Dreams Mode, where the motion
 * is revealed to debaters at release time.
 */
export const getMotionAudience = internalQuery({
  args: {
    tournament_id: v.id("tournaments"),
    round_id: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournament_id);
    const round = await ctx.db.get(args.round_id);

    if (!tournament || !round) {
      throw new Error("Tournament or round not found");
    }

    const league = tournament.league_id ? await ctx.db.get(tournament.league_id) : null;

    const debates: Doc<"debates">[] = await ctx.db
      .query("debates")
      .withIndex("by_round_id", (q) => q.eq("round_id", args.round_id))
      .collect();

    const judgeIds = Array.from(new Set(debates.flatMap((debate) => debate.judges)));
    const judges = await Promise.all(judgeIds.map((id) => ctx.db.get(id)));

    const { teams } = await schoolsForTournament(ctx, args.tournament_id);
    const memberIds = Array.from(new Set(teams.flatMap((team) => team.members)));
    const students = await Promise.all(memberIds.map((id) => ctx.db.get(id)));

    const invitations = await ctx.db
      .query("tournament_invitations")
      .withIndex("by_tournament_id_target_type_status", (q) =>
        q
          .eq("tournament_id", args.tournament_id)
          .eq("target_type", "volunteer")
          .eq("status", "accepted")
      )
      .collect();

    const volunteers = await Promise.all(
      invitations.map((invitation) => ctx.db.get(invitation.target_id))
    );

    const active = (users: Array<Doc<"users"> | null>) =>
      users.filter((user): user is Doc<"users"> => !!user && user.status === "active");

    const toRecipients = (users: Array<Doc<"users"> | null>) =>
      dedupe(active(users).map((user) => ({ email: user.email, name: user.name })));

    // Ids as well as addresses, so the same people can be reached by push.
    const toIds = (users: Array<Doc<"users"> | null>) =>
      Array.from(new Set(active(users).map((user) => user._id)));

    return {
      tournament: { name: tournament.name, slug: tournament.slug },
      round: {
        round_number: round.round_number,
        motion: round.motion,
        is_impromptu: round.is_impromptu,
      },
      is_dreams_mode: league?.type === "Dreams Mode",
      judges: toRecipients(judges),
      students: toRecipients(students),
      volunteers: toRecipients(volunteers),
      judge_ids: toIds(judges),
      student_ids: toIds(students),
      volunteer_ids: toIds(volunteers),
    };
  },
});
