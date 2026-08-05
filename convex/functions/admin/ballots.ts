import { mutation, query } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { Id, Doc } from "../../_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { scoreBallot, speakerScoreValidator } from "../../lib/ballot_validation";
import { updateDebateResults } from "../volunteers/ballots";

export const getAllTournamentBallots = query({
  args: {
    token: v.string(),
    tournament_id: v.id("tournaments"),
    round_number: v.optional(v.number()),
    status_filter: v.optional(v.union(
      v.literal("pending"),
      v.literal("inProgress"),
      v.literal("completed"),
      v.literal("noShow")
    )),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    let debatesQuery;
    if (args.round_number) {
      const round: Doc<"rounds"> | null = await ctx.db
        .query("rounds")
        .withIndex("by_tournament_id_round_number", (q) =>
          q.eq("tournament_id", args.tournament_id).eq("round_number", args.round_number as number)
        )
        .first();

      if (round) {
        debatesQuery = ctx.db
          .query("debates")
          .withIndex("by_round_id", (q) => q.eq("round_id", round._id));
      } else {
        return {
          page: [],
          isDone: true,
          continueCursor: null,
        };
      }
    } else {
      debatesQuery = ctx.db
        .query("debates")
        .withIndex("by_tournament_id", (q) => q.eq("tournament_id", args.tournament_id));
    }

    if (args.status_filter) {
      debatesQuery = debatesQuery.filter(d => d.eq(d.field("status"), args.status_filter));
    }

    const paginatedResult = await debatesQuery.paginate(args.paginationOpts);

    const enrichedDebates = await Promise.all(
      paginatedResult.page.map(async (debate) => {
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

        const judges = await Promise.all(
          debate.judges.map(async (judgeId: Id<"users">) => {
            const judge: Doc<"users"> | null = await ctx.db.get(judgeId);
            const submission: Doc<"judging_scores"> | undefined = submissions.find(s => s.judge_id === judgeId);
            return {
              ...judge,
              has_submitted: !!submission,
              is_final: submission?.submission_state === "submitted",
              is_head_judge: debate.head_judge_id === judgeId,
              is_flagged: submission?.flagged ?? false,
            };
          })
        );

        const judgesBallots = await Promise.all(
          debate.judges.map(async (judgeId: Id<"users">) => {
            const submission: Doc<"judging_scores"> | null = await ctx.db
              .query("judging_scores")
              .withIndex("by_debate_id_judge_id", (q) =>
                q.eq("debate_id", debate._id).eq("judge_id", judgeId)
              )
              .first();
            return {
              judge_id: judgeId,
              ballot: submission,
            };
          })
        );

        const completionPercentage: number = debate.judges.length > 0
          ? (submissions.filter(s => s.submission_state === "submitted").length / debate.judges.length) * 100
          : 0;

        return {
          ...debate,
          round,
          proposition_team: propTeam,
          opposition_team: oppTeam,
          judges,
          judges_ballots: judgesBallots,
          submissions_count: submissions.length,
          final_submissions_count: submissions.filter(s => s.submission_state === "submitted").length,
          completion_percentage: completionPercentage,
          has_flagged_ballots: submissions.some(s => s.flagged),
          argument_flow: debate.argument_flow || [],
          fact_checks: debate.fact_checks || [],
          shared_notes: debate.shared_notes || [],
        };
      })
    );

    let filteredPage = enrichedDebates;
    if (args.search && args.search.trim()) {
      const searchLower = args.search.toLowerCase();
      filteredPage = enrichedDebates.filter(debate => {
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

    const sortedPage = filteredPage.sort((a, b) => {
      if (!a.round || !b.round) return 0;
      return a.round.round_number - b.round.round_number;
    });

    return {
      ...paginatedResult,
      page: sortedPage,
    };
  },
});

export const updateBallot = mutation({
  args: {
    token: v.string(),
    ballot_id: v.id("judging_scores"),
    reason: v.string(),
    updates: v.object({
      winning_team_id: v.optional(v.id("teams")),
      winning_position: v.optional(v.union(v.literal("proposition"), v.literal("opposition"))),
      speaker_scores: v.optional(v.array(speakerScoreValidator)),
      rfd: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const ballot: Doc<"judging_scores"> | null = await ctx.db.get(args.ballot_id);
    if (!ballot) {
      throw new Error("Ballot not found");
    }

    if (!args.reason.trim()) {
      throw new Error("A reason is required to correct a submitted ballot.");
    }

    const winningTeamId = args.updates.winning_team_id ?? ballot.winning_team_id;

    if (!winningTeamId) {
      throw new Error("The ballot must have a winning team.");
    }

    const processedSpeakerScores = args.updates.speaker_scores
      ? scoreBallot({
        speaker_scores: args.updates.speaker_scores,
        winning_team_id: winningTeamId,
        rfd: args.updates.rfd ?? ballot.rfd,
        is_final_submission: ballot.submission_state === "submitted",
      })
      : undefined;

    const now = Date.now();

    await ctx.db.patch(args.ballot_id, {
      ...args.updates,
      speaker_scores: processedSpeakerScores ?? ballot.speaker_scores,
      ballot_edits: [
        ...(ballot.ballot_edits ?? []),
        {
          editor_id: sessionResult.user.id,
          reason: args.reason,
          previous_speaker_scores: JSON.stringify(ballot.speaker_scores),
          previous_winning_team_id: ballot.winning_team_id,
          edited_at: now,
        },
      ],
      updated_at: now,
    });

    if (ballot.submission_state === "submitted") {
      await updateDebateResults(ctx, ballot.debate_id);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: args.ballot_id,
      description: `Coordinator corrected ballot: ${args.reason}`,
      previous_state: JSON.stringify({
        winning_team_id: ballot.winning_team_id,
        speaker_scores: ballot.speaker_scores,
      }),
    });

    return { success: true };
  },
});

export const flagBallotForReview = mutation({
  args: {
    token: v.string(),
    ballot_id: v.id("judging_scores"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const ballot: Doc<"judging_scores"> | null = await ctx.db.get(args.ballot_id);
    if (!ballot) {
      throw new Error("Ballot not found");
    }

    await ctx.db.patch(args.ballot_id, {
      flagged: true,
      flag_reason: args.reason,
      flagged_by: sessionResult.user.id,
      flagged_at: Date.now(),
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: args.ballot_id,
      description: `Flagged ballot for review: ${args.reason}`,
    });

    return { success: true };
  },
});

export const unflagBallot = mutation({
  args: {
    token: v.string(),
    ballot_id: v.id("judging_scores"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const ballot: Doc<"judging_scores"> | null = await ctx.db.get(args.ballot_id);
    if (!ballot) {
      throw new Error("Ballot not found");
    }

    await ctx.db.patch(args.ballot_id, {
      flagged: false,
      flag_reason: undefined,
      flagged_by: undefined,
      flagged_at: undefined,
      updated_at: Date.now(),
    });

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: args.ballot_id,
      description: "Admin unflagged ballot",
    });

    return { success: true };
  },
});

export const submitBallot = mutation({
  args: {
    token: v.string(),
    debate_id: v.id("debates"),
    judge_id: v.id("users"),
    winning_team_id: v.id("teams"),
    winning_position: v.union(v.literal("proposition"), v.literal("opposition")),
    speaker_scores: v.array(speakerScoreValidator),
    rfd: v.optional(v.string()),
    notes: v.optional(v.string()),
    is_final_submission: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; ballot_id: Id<"judging_scores"> }> => {
    const sessionResult = await ctx.runMutation(internal.functions.auth.verifySession, {
      token: args.token,
    });

    if (!sessionResult.valid || !sessionResult.user || sessionResult.user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const debate: Doc<"debates"> | null = await ctx.db.get(args.debate_id);
    if (!debate) {
      throw new Error("Debate not found");
    }

    if (!debate.judges.includes(args.judge_id)) {
      throw new Error("Judge not assigned to this debate");
    }

    const existingSubmission: Doc<"judging_scores"> | null = await ctx.db
      .query("judging_scores")
      .withIndex("by_debate_id_judge_id", (q) =>
        q.eq("debate_id", args.debate_id).eq("judge_id", args.judge_id)
      )
      .first();

    if (existingSubmission?.submission_state === "submitted") {
      throw new Error("Final ballot already submitted for this judge");
    }

    const tournament = await ctx.db.get(debate.tournament_id);

    if (tournament && tournament.format !== "WorldSchools") {
      throw new Error(
        `Ballots are only available for World Schools tournaments. ${tournament.format} support is coming soon.`
      );
    }

    const processedSpeakerScores = scoreBallot({
      speaker_scores: args.speaker_scores,
      winning_team_id: args.winning_team_id,
      rfd: args.rfd,
      is_final_submission: args.is_final_submission,
      team_size: tournament?.team_size,
    });

    const now = Date.now();

    const ballotData = {
      debate_id: args.debate_id,
      judge_id: args.judge_id,
      winning_team_id: args.winning_team_id,
      winning_position: args.winning_position,
      speaker_scores: processedSpeakerScores,
      rfd: args.rfd,
      notes: args.notes,
      submission_state: (args.is_final_submission
        ? "submitted"
        : "in_progress") as "submitted" | "in_progress",
      submitted_at: args.is_final_submission ? now : undefined,
      created_at: now,
    };

    let ballotId: Id<"judging_scores">;

    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        ...ballotData,
        updated_at: Date.now(),
      });
      ballotId = existingSubmission._id;
    } else {
      ballotId = await ctx.db.insert("judging_scores", ballotData);
    }

    if (args.is_final_submission) {
      await updateDebateResults(ctx, args.debate_id);
    }

    await ctx.runMutation(internal.functions.audit.createAuditLog, {
      user_id: sessionResult.user.id,
      action: "ballot_submitted",
      resource_type: "judging_scores",
      resource_id: ballotId,
      description: `Admin ${args.is_final_submission ? 'submitted' : 'updated'} ballot for judge ${args.judge_id}`,
    });

    return { success: true, ballot_id: ballotId };
  },
});