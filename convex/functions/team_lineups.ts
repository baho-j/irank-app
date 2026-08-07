import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

const positionValidator = v.union(
  v.literal("first"),
  v.literal("second"),
  v.literal("third"),
  v.literal("reply")
);

/**
 * Rotation is only permitted at international competitions, where a school
 * registers a squad larger than a team and swaps speakers between rounds.
 * Everywhere else the roster is fixed.
 */
async function rotationAllowed(ctx: any, tournament: Doc<"tournaments">) {
  if (!tournament.league_id) return false;

  const league = await ctx.db.get(tournament.league_id);

  return league?.type === "International";
}

export const setLineup = mutation({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
    team_id: v.id("teams"),
    speakers: v.array(v.object({
      speaker_id: v.id("users"),
      position: positionValidator,
    })),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const debate = await ctx.db.get(args.debate_id);
    if (!debate) throw new Error("Debate not found");

    const team = await ctx.db.get(args.team_id);
    if (!team) throw new Error("Team not found");

    if (debate.proposition_team_id !== args.team_id && debate.opposition_team_id !== args.team_id) {
      throw new Error("That team is not debating in this room");
    }

    const tournament = await ctx.db.get(debate.tournament_id);
    if (!tournament) throw new Error("Tournament not found");

    if (!(await rotationAllowed(ctx, tournament))) {
      throw new Error(
        "Speaker rotation is only available at international competitions."
      );
    }

    // Changing a lineup after ballots are in would silently reattribute scores.
    const submitted = await ctx.db
      .query("judging_scores")
      .withIndex("by_debate_id_submission_state", (q) =>
        q.eq("debate_id", args.debate_id).eq("submission_state", "submitted")
      )
      .first();

    if (submitted) {
      throw new Error("Ballots have been submitted for this room; the lineup is locked.");
    }

    if (args.speakers.length !== tournament.team_size) {
      throw new Error(
        `This tournament fields ${tournament.team_size} speakers per team; ${args.speakers.length} were selected.`
      );
    }

    const speakerIds = args.speakers.map((entry) => entry.speaker_id);

    if (new Set(speakerIds).size !== speakerIds.length) {
      throw new Error("A speaker may only appear once in a lineup.");
    }

    const positions = args.speakers.map((entry) => entry.position);

    if (new Set(positions).size !== positions.length) {
      throw new Error("Each speaking position may only be assigned once.");
    }

    const notOnTeam = speakerIds.find((id) => !team.members.includes(id));

    if (notOnTeam) {
      throw new Error("Every speaker must be a registered member of the team.");
    }

    const existing = await ctx.db
      .query("team_lineups")
      .withIndex("by_debate_id_team_id", (q) =>
        q.eq("debate_id", args.debate_id).eq("team_id", args.team_id)
      )
      .first();

    const record = {
      debate_id: args.debate_id,
      team_id: args.team_id,
      tournament_id: debate.tournament_id,
      speakers: args.speakers,
      set_by: sessionResult.user.id,
      set_at: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, record);
    } else {
      await ctx.db.insert("team_lineups", record);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "debate_updated",
      resource_type: "team_lineups",
      resource_id: args.debate_id,
      description: `Set lineup for ${team.name}`,
    });

    return { success: true };
  },
});

/**
 * The speakers a judge should be shown for this room. Falls back to the team's
 * roster where no lineup is set, so tournaments without rotation behave exactly
 * as they did before.
 */
export const getDebateLineups = query({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const debate = await ctx.db.get(args.debate_id);
    if (!debate) throw new Error("Debate not found");

    const tournament = await ctx.db.get(debate.tournament_id);

    const lineups = await ctx.db
      .query("team_lineups")
      .withIndex("by_debate_id", (q) => q.eq("debate_id", args.debate_id))
      .collect();

    const resolve = async (teamId: Id<"teams"> | undefined) => {
      if (!teamId) return null;

      const team = await ctx.db.get(teamId);
      if (!team) return null;

      const lineup = lineups.find((entry) => entry.team_id === teamId);

      const speakers = lineup
        ? lineup.speakers
        : team.members
          .slice(0, tournament?.team_size ?? team.members.length)
          .map((speaker_id, index) => ({
            speaker_id,
            position: (["first", "second", "third", "reply"] as const)[index] ?? "first",
          }));

      const named = await Promise.all(
        speakers.map(async (entry) => {
          const user = await ctx.db.get(entry.speaker_id);
          return {
            ...entry,
            name: user?.name ?? "Unknown speaker",
          };
        })
      );

      return {
        team_id: teamId,
        team_name: team.name,
        squad_size: team.members.length,
        is_explicit_lineup: !!lineup,
        speakers: named,
      };
    };

    return {
      rotation_allowed: tournament ? await rotationAllowed(ctx, tournament) : false,
      team_size: tournament?.team_size ?? 3,
      proposition: await resolve(debate.proposition_team_id),
      opposition: await resolve(debate.opposition_team_id),
    };
  },
});
