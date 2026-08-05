import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { visibleMotion } from "../lib/motion_release";
import { paginationOptsValidator } from "convex/server";

export const getTournamentBallots = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.optional(v.number()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const user = sessionResult.user;
    const tournament: Doc<"tournaments"> | null = await ctx.db.get(args.tournament_id);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const league: Doc<"leagues"> | null = tournament.league_id ? await ctx.db.get(tournament.league_id) : null;
    const isDreamsMode: boolean = league?.type === "Dreams Mode";

    let debates: Doc<"debates">[];
    if (args.round_number) {
      const round: Doc<"rounds"> | null = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id_round_number", (q) =>
          q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number as number)
        )
        .first();

      if (round) {
        debates = await ctx.db
          .query("debates")
          .withIndex("by_round_id", (q) => q.eq("round_id", round._id))
          .collect();
      } else {
        debates = [];
      }
    } else {
      debates = await ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id))
        .collect();
    }

    const enrichedDebates = await Promise.all(
      debates.map(async (debate) => {
        const propTeam: Doc<"teams"> | null = debate.proposition_team_id
          ? await ctx.db.get(debate.proposition_team_id)
          : null;
        const oppTeam: Doc<"teams"> | null = debate.opposition_team_id
          ? await ctx.db.get(debate.opposition_team_id)
          : null;

        const round: Doc<"rounds"> | null = await ctx.db.get(debate.round_id);

        const submissions: Doc<"judging_scores">[] = await ctx.db
          .query("judging_scores")
          .withIndex("by_debate_id", (q) => q.eq("debate_id", debate._id))
          .collect();

        let ballotDetails: Doc<"judging_scores">[] | null = null;
        let canSeeFullDetails: boolean = false;
        let canSeeResults: boolean = true;

        if (user.role === "admin") {
          canSeeFullDetails = true;
          ballotDetails = submissions;
        } else if (user.role === "volunteer") {
          if (debate.judges.includes(user.id)) {
            canSeeFullDetails = true;
            ballotDetails = submissions;
          }
        } else if (user.role === "school_admin") {
          if (isDreamsMode) {
            canSeeResults = false;
          } else {
            const userSchoolId: Id<"schools"> | undefined = user.school_id;
            const isMySchoolInvolved: boolean = (propTeam?.school_id === userSchoolId) ||
              (oppTeam?.school_id === userSchoolId);

            if (isMySchoolInvolved) {
              canSeeFullDetails = true;
              ballotDetails = submissions;
            }
          }
        } else if (user.role === "student") {
          const allTeams = await ctx.db
            .query("teams")
            .withIndex("by_tournament_id", (q) =>
              q.eq("tournament_id", args.tournament_id)
            )
            .collect();

          const userTeams = allTeams.filter((team) =>
            team.members.includes(user.id)
          );

          const userTeamIds: Id<"teams">[] = userTeams.map((t) => t._id);

          const isMyTeamInvolved: boolean = userTeamIds.includes(debate.proposition_team_id!) ||
            userTeamIds.includes(debate.opposition_team_id!);

          if (isMyTeamInvolved) {
            canSeeFullDetails = true;
            ballotDetails = submissions.map(submission => ({
              ...submission,
              speaker_scores: submission.speaker_scores.map(score => ({
                ...score,
                comments: score.speaker_id === user.id ? score.comments : undefined,
              }))
            }));
          }
        }

        if (!canSeeResults) {
          return null;
        }

        const judges = await Promise.all(
          debate.judges.map(async (judgeId: Id<"users">) => {
            const judge: Doc<"users"> | null = await ctx.db.get(judgeId);
            return {
              _id: judgeId,
              name: judge?.name || "Unknown Judge",
              is_head_judge: debate.head_judge_id === judgeId,
            };
          })
        );

        return {
          ...debate,
          round: round ? { ...round, motion: visibleMotion(round, user.role) } : null,
          proposition_team: propTeam,
          opposition_team: oppTeam,
          judges,
          ballot_details: canSeeFullDetails ? ballotDetails : null,
          winning_team_id: debate.winning_team_id,
          winning_position: debate.winning_team_position,
          can_see_full_details: canSeeFullDetails,
          argument_flow: debate.argument_flow || [],
          fact_checks: debate.fact_checks || [],
          shared_notes: debate.shared_notes || [],
        };
      })
    );

    let filteredDebates = enrichedDebates.filter((debate): debate is NonNullable<typeof debate> => debate !== null);

    if (args.search && args.search.trim()) {
      const searchLower = args.search.toLowerCase();
      filteredDebates = filteredDebates.filter(debate => {
        const roomName = debate.room_name?.toLowerCase() || '';
        const propTeamName = debate.proposition_team?.name?.toLowerCase() || '';
        const oppTeamName = debate.opposition_team?.name?.toLowerCase() || '';
        const judgeNames = debate.judges?.map(j => j.name?.toLowerCase()).join(' ') || '';

        return roomName.includes(searchLower) ||
          propTeamName.includes(searchLower) ||
          oppTeamName.includes(searchLower) ||
          judgeNames.includes(searchLower);
      });
    }

    const sortedDebates = filteredDebates.sort((a, b) => {
      if (!a.round || !b.round) return 0;
      return a.round.round_number - b.round.round_number;
    });

    const startIndex = (args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor.split('_')[1]) || 0 : 0);
    const endIndex = startIndex + args.paginationOpts.numItems;
    const paginatedDebates = sortedDebates.slice(startIndex, endIndex);
    const hasMore = endIndex < sortedDebates.length;

    return {
      page: paginatedDebates,
      isDone: !hasMore,
      continueCursor: hasMore ? `cursor_${endIndex}` : null,
      totalCount: sortedDebates.length,
    };
  },
});

export const updateRecording = mutation({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
    recording_id: v.id("_storage"),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Authentication required");
    }

    const user = sessionResult.user;
    const debate = await ctx.db.get(args.debate_id);

    if (!debate) {
      throw new Error("Debate not found");
    }

    const isAssignedJudge = debate.judges.includes(user.id);

    if (user.role !== "admin" && !isAssignedJudge) {
      throw new Error("Only an assigned judge or an admin can update this recording");
    }

    await ctx.db.patch(args.debate_id, {
      recording: args.recording_id,
      recording_duration: args.duration,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: user.id,
      action: "debate_updated",
      resource_type: "debates",
      resource_id: args.debate_id,
      description: `Updated recording for debate in room ${debate.room_name ?? "unknown"}`,
    });

    return { success: true };
  },
});

export const getUserNames = query({
  args: {
    token: v.string(),
    user_ids: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user) {
      throw new Error("Invalid session");
    }

    return await Promise.all(
      args.user_ids.map(async (userId) => {
        const user = await ctx.db.get(userId);
        return {
          id: userId,
          name: user?.name ?? null,
        };
      })
    );
  },
});